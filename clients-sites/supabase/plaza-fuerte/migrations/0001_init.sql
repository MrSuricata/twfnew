-- Plaza Fuerte Hotel — schema inicial
-- Convención: snake_case, plurales, uuid pk, created/updated_at, RLS habilitada.

create extension if not exists "pgcrypto";

-- =====================================================
-- ADMIN
-- =====================================================
create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin','manager')),
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from admin_users where user_id = auth.uid())
$$;

-- =====================================================
-- ROOMS
-- =====================================================
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_es text not null,
  name_en text,
  name_pt text,
  description_es text,
  description_en text,
  description_pt text,
  type text not null check (type in ('single','double','suite','family')),
  capacity int not null check (capacity > 0),
  has_port_view boolean not null default false,
  base_price_uyu numeric(10,2) not null check (base_price_uyu >= 0),
  size_m2 int,
  images jsonb not null default '[]',
  amenities text[] not null default '{}',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_rooms_active on rooms (is_active, sort_order);

-- =====================================================
-- ROOM AVAILABILITY (por día)
-- =====================================================
create table if not exists room_availability (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  date date not null,
  price_uyu numeric(10,2),
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (room_id, date)
);
create index if not exists idx_room_availability_date on room_availability (room_id, date);

-- =====================================================
-- BOOKINGS
-- =====================================================
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete restrict,
  check_in date not null,
  check_out date not null check (check_out > check_in),
  guests int not null check (guests > 0),
  guest_name text not null,
  guest_email text not null,
  guest_phone text,
  guest_country text,
  total_uyu numeric(10,2) not null check (total_uyu >= 0),
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_bookings_dates on bookings (check_in, check_out);
create index if not exists idx_bookings_status on bookings (status);
create index if not exists idx_bookings_room on bookings (room_id);

-- =====================================================
-- EVENTS (catálogo de salas/tipos de evento)
-- =====================================================
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_es text not null,
  name_en text,
  name_pt text,
  description_es text,
  description_en text,
  description_pt text,
  capacity int,
  images jsonb not null default '[]',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================
-- CONTACT INQUIRIES
-- =====================================================
create table if not exists contact_inquiries (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('contact','event_request','press')),
  name text not null,
  email text not null,
  phone text,
  message text,
  event_id uuid references events(id) on delete set null,
  event_date date,
  guest_count int,
  status text not null default 'new' check (status in ('new','answered','archived')),
  source_ip text,
  created_at timestamptz not null default now()
);
create index if not exists idx_inquiries_status on contact_inquiries (status, created_at desc);

-- =====================================================
-- UPDATED_AT TRIGGERS
-- =====================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_rooms_updated on rooms;
create trigger trg_rooms_updated before update on rooms
  for each row execute function set_updated_at();
drop trigger if exists trg_bookings_updated on bookings;
create trigger trg_bookings_updated before update on bookings
  for each row execute function set_updated_at();
drop trigger if exists trg_events_updated on events;
create trigger trg_events_updated before update on events
  for each row execute function set_updated_at();

-- =====================================================
-- RLS
-- =====================================================
alter table admin_users enable row level security;
alter table rooms enable row level security;
alter table room_availability enable row level security;
alter table bookings enable row level security;
alter table events enable row level security;
alter table contact_inquiries enable row level security;

-- admin_users: sólo admins se ven a sí mismos
drop policy if exists admin_users_self_read on admin_users;
create policy admin_users_self_read on admin_users
  for select using (auth.uid() = user_id or is_admin());

-- rooms / events: read público de activos; write sólo admin
drop policy if exists rooms_read_public on rooms;
create policy rooms_read_public on rooms
  for select using (is_active = true or is_admin());
drop policy if exists rooms_write_admin on rooms;
create policy rooms_write_admin on rooms
  for all using (is_admin()) with check (is_admin());

drop policy if exists events_read_public on events;
create policy events_read_public on events
  for select using (is_active = true or is_admin());
drop policy if exists events_write_admin on events;
create policy events_write_admin on events
  for all using (is_admin()) with check (is_admin());

-- room_availability: read público (para calcular disponibilidad); write admin
drop policy if exists ra_read_public on room_availability;
create policy ra_read_public on room_availability for select using (true);
drop policy if exists ra_write_admin on room_availability;
create policy ra_write_admin on room_availability
  for all using (is_admin()) with check (is_admin());

-- bookings: insert público (mediado por server endpoint que valida disponibilidad);
-- select/update sólo admin
drop policy if exists bookings_insert_public on bookings;
create policy bookings_insert_public on bookings
  for insert with check (status = 'pending');
drop policy if exists bookings_select_admin on bookings;
create policy bookings_select_admin on bookings for select using (is_admin());
drop policy if exists bookings_update_admin on bookings;
create policy bookings_update_admin on bookings for update using (is_admin()) with check (is_admin());

-- contact_inquiries: insert público (rate-limited por server); select admin
drop policy if exists inquiries_insert_public on contact_inquiries;
create policy inquiries_insert_public on contact_inquiries for insert with check (true);
drop policy if exists inquiries_select_admin on contact_inquiries;
create policy inquiries_select_admin on contact_inquiries for select using (is_admin());
drop policy if exists inquiries_update_admin on contact_inquiries;
create policy inquiries_update_admin on contact_inquiries for update using (is_admin()) with check (is_admin());

-- =====================================================
-- STORAGE BUCKET (idempotente)
-- =====================================================
insert into storage.buckets (id, name, public)
values ('plaza-fuerte-rooms', 'plaza-fuerte-rooms', true)
on conflict (id) do nothing;
