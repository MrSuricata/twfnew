-- ========================================
-- TWF Logistics — Supabase Schema (Security-Hardened)
-- Run this in Supabase SQL Editor
-- Dashboard → SQL Editor → New Query → Paste → Run
--
-- SECURITY NOTE:
-- The API layer uses SUPABASE_SERVICE_ROLE_KEY (server-only, bypasses RLS).
-- The anon key is NOT used by the API and is blocked by RLS policies below.
-- NEVER ship the service role key to the browser — it's strictly server-side.
-- ========================================

-- 1. Quotes
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  cargo_type TEXT NOT NULL,
  origin TEXT DEFAULT '',
  destination TEXT DEFAULT '',
  details TEXT DEFAULT '',
  timestamp BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  status TEXT NOT NULL DEFAULT 'pending',
  notes JSONB DEFAULT '[]'::JSONB,
  language TEXT DEFAULT 'es',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Documents
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  shipment_ref TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT '',
  uploaded_at BIGINT NOT NULL,
  uploaded_by TEXT NOT NULL DEFAULT '',
  url TEXT DEFAULT '',
  data TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Reports
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  shipment_ref TEXT NOT NULL,
  container_number TEXT DEFAULT '',
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  file_type TEXT NOT NULL DEFAULT '',
  file_data TEXT DEFAULT '',
  created_at_ts BIGINT NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Shipments cache
CREATE TABLE IF NOT EXISTS shipments_cache (
  id INTEGER PRIMARY KEY DEFAULT 1,
  data JSONB NOT NULL DEFAULT '[]'::JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO shipments_cache (id, data) VALUES (1, '[]'::JSONB) ON CONFLICT (id) DO NOTHING;

-- 6. Clients
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  company TEXT DEFAULT '',
  created_at_ts BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  cliente_pattern TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Partner users (depot + transport)
CREATE TABLE IF NOT EXISTS partner_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('depot', 'transport')),
  filter_value TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. OTP codes (server-side OTP store)
CREATE TABLE IF NOT EXISTS otp_codes (
  email TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

-- 9. Rate limits (Supabase-backed rate limiter)
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt TIMESTAMPTZ NOT NULL,
  blocked_until TIMESTAMPTZ
);

-- 10. Origin photos (new — missing from previous schema)
CREATE TABLE IF NOT EXISTS origin_photos (
  id TEXT PRIMARY KEY,
  shipment_ref TEXT NOT NULL,
  container_number TEXT DEFAULT '',
  caption TEXT DEFAULT '',
  photo_type TEXT DEFAULT 'origen',
  file_name TEXT NOT NULL DEFAULT '',
  file_type TEXT NOT NULL DEFAULT '',
  file_data TEXT DEFAULT '',
  thumbnail_data TEXT DEFAULT '',
  created_at_ts BIGINT NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Notification tasks (new — missing from previous schema)
CREATE TABLE IF NOT EXISTS notification_tasks (
  id TEXT PRIMARY KEY,
  shipment_ref TEXT NOT NULL,
  container_number TEXT DEFAULT '',
  operativa TEXT DEFAULT 'CONTENEDOR',
  cliente TEXT NOT NULL DEFAULT '',
  client_email TEXT DEFAULT '',
  client_name TEXT DEFAULT '',
  step TEXT NOT NULL,
  step_number INTEGER NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  salida_date TEXT DEFAULT '',
  photos_ok BOOLEAN DEFAULT false,
  report_ok BOOLEAN DEFAULT false,
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMPTZ,
  email_thread_id TEXT DEFAULT '',
  email_subject TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes ───
CREATE INDEX IF NOT EXISTS idx_documents_shipment_ref ON documents(shipment_ref);
CREATE INDEX IF NOT EXISTS idx_reports_shipment_ref ON reports(shipment_ref);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_email ON quotes(email);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_partner_email ON partner_users(email);
CREATE INDEX IF NOT EXISTS idx_origin_photos_shipment_ref ON origin_photos(shipment_ref);
CREATE INDEX IF NOT EXISTS idx_notif_tasks_due_status ON notification_tasks(due_date, status);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_rate_limits_blocked ON rate_limits(blocked_until);

-- ─── RLS: Enable on every table ───
ALTER TABLE quotes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports            ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments_cache    ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_codes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits        ENABLE ROW LEVEL SECURITY;
ALTER TABLE origin_photos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_tasks ENABLE ROW LEVEL SECURITY;

-- ─── RLS policies: deny anon, allow service_role ───
-- anon role (what a leaked ANON key would have): deny everything
-- service_role (used by API): allow everything

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'quotes','documents','reports','settings','shipments_cache','clients',
    'partner_users','otp_codes','rate_limits','origin_photos','notification_tasks'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "deny_anon" ON %I', t);
    EXECUTE format('CREATE POLICY "deny_anon" ON %I FOR ALL TO anon USING (false) WITH CHECK (false)', t);

    EXECUTE format('DROP POLICY IF EXISTS "allow_service_role" ON %I', t);
    EXECUTE format('CREATE POLICY "allow_service_role" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- ─── Verification query (run manually after deploying) ───
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';
-- → All rows should have rowsecurity = true.
