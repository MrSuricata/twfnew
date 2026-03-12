-- ========================================
-- TWF Logistics — Supabase Schema
-- Run this in Supabase SQL Editor
-- Dashboard → SQL Editor → New Query → Paste → Run
-- ========================================

-- 1. Quotes (cotizaciones)
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

-- 2. Documents (documentos de embarque)
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

-- 3. Reports (informes operativos)
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

-- 4. Settings (configuracion clave-valor)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Shipments cache (cache de Google Sheets)
CREATE TABLE IF NOT EXISTS shipments_cache (
  id INTEGER PRIMARY KEY DEFAULT 1,
  data JSONB NOT NULL DEFAULT '[]'::JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Insert default row for shipments cache
INSERT INTO shipments_cache (id, data) VALUES (1, '[]'::JSONB)
ON CONFLICT (id) DO NOTHING;

-- 6. Clients (cuentas de clientes)
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  company TEXT DEFAULT '',
  created_at_ts BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  cliente_pattern TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disable RLS (security handled by API layer with JWT auth)
ALTER TABLE quotes DISABLE ROW LEVEL SECURITY;
ALTER TABLE documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE reports DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE shipments_cache DISABLE ROW LEVEL SECURITY;
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_shipment_ref ON documents(shipment_ref);
CREATE INDEX IF NOT EXISTS idx_reports_shipment_ref ON reports(shipment_ref);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_email ON quotes(email);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
