-- Posada al Sur — schema inicial (hostel + centro cultural + city tours)
create extension if not exists "pgcrypto";

create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin','manager')),
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from admin_users where user_id = auth.uid()) $$;

-- BEDS (camas/habitaciones)
create table if not exists beds (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  type text not null check (type in ('dorm','private','family')),
  dorm_capacity int check (dorm_capacity is null or dorm_capacity > 0),
  name_es text not null,
  name_en text,
  name_pt text,
  description_es text,
  description_en text,
  description_pt text,
  base_price_uyu numeric(10,2) not null check (base_price_uyu >= 0),
  images jsonb not null default '[]',
  amenities text[] not null default '{}',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- BOOKINGS (camas/habitaciones)
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  bed_id uuid not null references beds(id) on delete restrict,
  check_in date not null,
  check_out date not null check (check_out > check_in),
  beds_count int not null default 1 check (beds_count > 0),
  guest_name text not null,
  guest_email text not null,
  guest_phone text,
  guest_country text,
  total_uyu numeric(10,2) not null check (total_uyu >= 0),
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_bookings_dates on bookings (bed_id, check_in, check_out);
create index if not exists idx_bookings_status on bookings (status);

-- WORKSHOPS (talleres del centro cultural)
create table if not exists workshops (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title_es text not null,
  title_en text,
  title_pt text,
  description_es text,
  description_en text,
  description_pt text,
  date_time timestamptz not null,
  duration_minutes int not null check (duration_minutes > 0),
  capacity int not null check (capacity > 0),
  price_uyu numeric(10,2) not null check (price_uyu >= 0),
  instructor text,
  images jsonb not null default '[]',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_workshops_upcoming on workshops (date_time, is_active);

create table if not exists workshop_inscriptions (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  participants_count int not null default 1 check (participants_count > 0),
  notes text,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists idx_w_inscriptions on workshop_inscriptions (workshop_id, status);

-- CITY TOURS
create table if not exists city_tours (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title_es text not null,
  title_en text,
  title_pt text,
  description_es text,
  description_en text,
  description_pt text,
  schedule_pattern text,
  duration_minutes int not null check (duration_minutes > 0),
  capacity int check (capacity is null or capacity > 0),
  price_uyu numeric(10,2) not null check (price_uyu >= 0),
  languages text[] not null default '{es}',
  images jsonb not null default '[]',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tour_inscriptions (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references city_tours(id) on delete cascade,
  date date not null,
  name text not null,
  email text not null,
  phone text,
  participants_count int not null default 1 check (participants_count > 0),
  language_pref text,
  notes text,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists idx_t_inscriptions on tour_inscriptions (tour_id, date, status);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_beds_updated on beds;
create trigger trg_beds_updated before update on beds for each row execute function set_updated_at();
drop trigger if exists trg_bookings_updated on bookings;
create trigger trg_bookings_updated before update on bookings for each row execute function set_updated_at();
drop trigger if exists trg_workshops_updated on workshops;
create trigger trg_workshops_updated before update on workshops for each row execute function set_updated_at();
drop trigger if exists trg_city_tours_updated on city_tours;
create trigger trg_city_tours_updated before update on city_tours for each row execute function set_updated_at();

-- RLS
alter table admin_users enable row level security;
alter table beds enable row level security;
alter table bookings enable row level security;
alter table workshops enable row level security;
alter table workshop_inscriptions enable row level security;
alter table city_tours enable row level security;
alter table tour_inscriptions enable row level security;

drop policy if exists admin_self on admin_users;
create policy admin_self on admin_users for select using (auth.uid() = user_id or is_admin());

drop policy if exists beds_read on beds;
create policy beds_read on beds for select using (is_active = true or is_admin());
drop policy if exists beds_write on beds;
create policy beds_write on beds for all using (is_admin()) with check (is_admin());

drop policy if exists bookings_insert on bookings;
create policy bookings_insert on bookings for insert with check (status = 'pending');
drop policy if exists bookings_admin on bookings;
create policy bookings_admin on bookings for select using (is_admin());
drop policy if exists bookings_update_admin on bookings;
create policy bookings_update_admin on bookings for update using (is_admin()) with check (is_admin());

drop policy if exists workshops_read on workshops;
create policy workshops_read on workshops for select using (is_active = true or is_admin());
drop policy if exists workshops_write on workshops;
create policy workshops_write on workshops for all using (is_admin()) with check (is_admin());

drop policy if exists wins_insert on workshop_inscriptions;
create policy wins_insert on workshop_inscriptions for insert with check (status = 'pending');
drop policy if exists wins_read_admin on workshop_inscriptions;
create policy wins_read_admin on workshop_inscriptions for select using (is_admin());
drop policy if exists wins_update_admin on workshop_inscriptions;
create policy wins_update_admin on workshop_inscriptions for update using (is_admin()) with check (is_admin());

drop policy if exists tours_read on city_tours;
create policy tours_read on city_tours for select using (is_active = true or is_admin());
drop policy if exists tours_write on city_tours;
create policy tours_write on city_tours for all using (is_admin()) with check (is_admin());

drop policy if exists tins_insert on tour_inscriptions;
create policy tins_insert on tour_inscriptions for insert with check (status = 'pending');
drop policy if exists tins_read_admin on tour_inscriptions;
create policy tins_read_admin on tour_inscriptions for select using (is_admin());
drop policy if exists tins_update_admin on tour_inscriptions;
create policy tins_update_admin on tour_inscriptions for update using (is_admin()) with check (is_admin());

insert into storage.buckets (id, name, public)
values ('posada-images', 'posada-images', true)
on conflict (id) do nothing;
