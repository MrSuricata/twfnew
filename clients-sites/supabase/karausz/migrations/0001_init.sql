-- Anticuario Karausz — schema inicial
create extension if not exists "pgcrypto";

-- ADMIN
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

-- CATEGORIES
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_es text not null,
  name_en text,
  name_pt text,
  parent_id uuid references categories(id) on delete set null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_categories_active on categories (is_active, sort_order);

-- STYLES (Luis XV, Art Decó, etc.)
create table if not exists styles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_es text not null,
  name_en text,
  name_pt text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ITEMS (piezas únicas)
create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title_es text not null,
  title_en text,
  title_pt text,
  description_es text,
  description_en text,
  description_pt text,
  category_id uuid references categories(id) on delete set null,
  style_id uuid references styles(id) on delete set null,
  era text,
  dimensions text,
  provenance text,
  condition text,
  price_uyu numeric(12,2),
  price_visible boolean not null default false,
  status text not null default 'available' check (status in ('available','reserved','sold','hidden')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_items_status_category on items (status, category_id);
create index if not exists idx_items_style on items (style_id);
create index if not exists idx_items_slug on items (slug);

-- ITEM IMAGES (multi por pieza)
create table if not exists item_images (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  storage_path text not null,
  alt_es text,
  alt_en text,
  alt_pt text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (item_id, sort_order)
);

-- INQUIRIES (solicitud de pieza)
create table if not exists inquiries (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references items(id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  country text,
  shipping_preference text,
  message text,
  status text not null default 'new' check (status in ('new','answered','archived')),
  created_at timestamptz not null default now()
);
create index if not exists idx_inquiries_item on inquiries (item_id);
create index if not exists idx_inquiries_status on inquiries (status, created_at desc);

-- TRIGGERS
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_items_updated on items;
create trigger trg_items_updated before update on items
  for each row execute function set_updated_at();

-- RLS
alter table admin_users enable row level security;
alter table categories enable row level security;
alter table styles enable row level security;
alter table items enable row level security;
alter table item_images enable row level security;
alter table inquiries enable row level security;

drop policy if exists admin_users_self_read on admin_users;
create policy admin_users_self_read on admin_users
  for select using (auth.uid() = user_id or is_admin());

drop policy if exists categories_read on categories;
create policy categories_read on categories
  for select using (is_active = true or is_admin());
drop policy if exists categories_write on categories;
create policy categories_write on categories
  for all using (is_admin()) with check (is_admin());

drop policy if exists styles_read on styles;
create policy styles_read on styles for select using (true);
drop policy if exists styles_write on styles;
create policy styles_write on styles for all using (is_admin()) with check (is_admin());

-- items: visibles si status != 'hidden'; hidden sólo admin
drop policy if exists items_read on items;
create policy items_read on items
  for select using (status in ('available','reserved','sold') or is_admin());
drop policy if exists items_write on items;
create policy items_write on items
  for all using (is_admin()) with check (is_admin());

drop policy if exists item_images_read on item_images;
create policy item_images_read on item_images for select using (true);
drop policy if exists item_images_write on item_images;
create policy item_images_write on item_images for all using (is_admin()) with check (is_admin());

drop policy if exists inquiries_insert on inquiries;
create policy inquiries_insert on inquiries for insert with check (true);
drop policy if exists inquiries_read_admin on inquiries;
create policy inquiries_read_admin on inquiries for select using (is_admin());
drop policy if exists inquiries_update_admin on inquiries;
create policy inquiries_update_admin on inquiries for update using (is_admin()) with check (is_admin());

-- Storage bucket
insert into storage.buckets (id, name, public)
values ('karausz-pieces', 'karausz-pieces', true)
on conflict (id) do nothing;
