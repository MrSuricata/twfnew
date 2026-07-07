-- ============================================================
-- Módulo de clientes — migración de esquema (07/07/2026)
-- NO ejecutada automáticamente: revisar y aplicar a mano en
-- Supabase (proyecto TWF ihpsdeoexkipxmaxsmrc) ANTES de mergear
-- la rama feat/clientes-modulo.
--
-- 1) Datos legales + aliases en `clients` (aditivo, no rompe nada)
-- 2) Tabla `client_users`: accesos al portal por email+contraseña
--    (reemplaza el flujo OTP — la tabla otp_codes queda huérfana,
--    se puede droppear más adelante si se quiere)
-- ============================================================

-- 1. Columnas nuevas del catálogo de clientes
alter table clients add column if not exists razon_social text;
alter table clients add column if not exists cuit_doc text;      -- CUIT / RUT / doc legal, formato libre
alter table clients add column if not exists pais text;
alter table clients add column if not exists direccion text;
alter table clients add column if not exists aliases text;       -- variantes del nombre, separadas por coma
-- email pasa a ser opcional a nivel app (la columna ya es text NOT NULL con
-- '' permitido — no se toca).

-- 2. Usuarios del portal de clientes (patrón espejo de partner_users)
create table if not exists client_users (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references clients(id) on delete cascade,
  email text unique not null,
  name text,
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login timestamptz
);

create index if not exists idx_client_users_client_id on client_users(client_id);
create index if not exists idx_client_users_email on client_users(email);

-- 3. RLS: mismo patrón deny_anon / allow_service_role que el resto de las
--    tablas (la API usa la service role key; el anon key no toca nada).
alter table client_users enable row level security;

drop policy if exists "deny_anon" on client_users;
create policy "deny_anon" on client_users for all to anon using (false) with check (false);

drop policy if exists "allow_service_role" on client_users;
create policy "allow_service_role" on client_users for all to service_role using (true) with check (true);
