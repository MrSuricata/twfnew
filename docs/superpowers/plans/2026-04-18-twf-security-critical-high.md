# TWF Security Hardening (Critical + High) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all 10 Critical/High findings from the 2026-04-18 security audit: enable Supabase RLS + switch to service-role key, migrate SHA-256 passwords to bcrypt, validate every API input with Zod, tighten tracking enumeration, add CSP + rate limits + Turnstile captcha, make CRON_SECRET mandatory, and fix OTP timing side-channel.

**Architecture:** Big-bang migration (no backward compat — app has no real users yet). 22 atomic tasks across 5 phases: DB hardening → auth upgrade → input validation → edge/infra hardening → docs & verification. Each task is a single logical commit on branch `security/twf-critical-high`.

**Tech Stack:** React 19 + TypeScript, Vite 6, Vercel serverless (@vercel/node), Supabase (Postgres + JS client), bcrypt, Zod, Cloudflare Turnstile, Vitest (added in Task 0).

**Reference spec:** `docs/superpowers/specs/2026-04-18-twf-security-critical-high-design.md`

**Working directory:** All paths relative to `twfnew/` (the repo root on the `security/twf-critical-high` branch, ideally inside a git worktree — see Task 0).

---

## Phase 0 — Preparation

### Task 0: Create branch + worktree + install deps + Vitest setup

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `.gitignore` entry (if missing): `coverage/`

- [ ] **Step 1: Create a git worktree for isolation**

From the main repo directory (`twfnew/`):

```bash
# Verify main exists and is clean-ish
git fetch origin main

# Create worktree off main (does NOT touch current branch)
git worktree add ../twfnew-security -b security/twf-critical-high origin/main

# Move into the worktree — all remaining tasks happen here
cd ../twfnew-security
```

Expected: new folder `twfnew-security/` created as a git worktree on the new branch `security/twf-critical-high`.

- [ ] **Step 2: Install bcryptjs and Vitest**

```bash
npm install bcryptjs
npm install -D @types/bcryptjs vitest @vitest/ui
```

Expected: `package.json` updated with new deps, `node_modules/` populated.

**Note:** We use `bcryptjs` (pure JS, zero native deps) instead of `bcrypt` (native, needs compilation). On Vercel Lambda runtimes, `bcryptjs` is more reliable. API is identical (`hash`, `compare`), ~3x slower than native but irrelevant for 1 hash per login.

- [ ] **Step 3: Add test scripts to `package.json`**

Edit the `"scripts"` block to add:

```json
"test": "vitest",
"test:run": "vitest run",
"test:ui": "vitest --ui"
```

Full scripts block should look like:

```json
"scripts": {
    "dev": "vite",
    "kill": "fuser -k 5000/tcp",
    "build": "tsc -b --noCheck && vite build",
    "lint": "eslint .",
    "optimize": "vite optimize",
    "preview": "vite preview",
    "test": "vitest",
    "test:run": "vitest run",
    "test:ui": "vitest --ui"
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['api/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 5: Sanity run — expect 0 tests found**

```bash
npm run test:run
```

Expected: Vitest runs, reports "No test files found". Exits with code 0 (expected when no tests exist yet).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest + bcrypt for security migration"
```

---

## Phase 1 — Database hardening

### Task 1: Rewrite `supabase-schema.sql` with RLS and missing tables

**Files:**
- Modify: `supabase-schema.sql`

- [ ] **Step 1: Rewrite the schema file**

Replace the entire contents of `supabase-schema.sql` with:

```sql
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
```

- [ ] **Step 2: Verify the SQL is syntactically valid**

Open `supabase-schema.sql` in an editor and check it parses. You can optionally dry-run it in a local Postgres instance if you have one — skip if not.

- [ ] **Step 3: Commit**

```bash
git add supabase-schema.sql
git commit -m "feat(db): enable RLS + add origin_photos/notification_tasks/otp_codes/rate_limits tables"
```

**Deploy note (NOT part of this task):** Brian runs this SQL in Supabase dashboard as part of the final migration in Phase 5. Do NOT run it yet — it depends on env var changes coming later.

---

## Phase 2 — Server auth upgrade

### Task 2: Switch `api/_lib/supabase.ts` to `SUPABASE_SERVICE_ROLE_KEY`

**Files:**
- Modify: `api/_lib/supabase.ts`

- [ ] **Step 1: Replace the file contents**

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

/**
 * Get a Supabase client instance (cached for the Lambda lifetime).
 *
 * SECURITY: This uses SUPABASE_SERVICE_ROLE_KEY, which BYPASSES RLS.
 * It must only be used in server-side code (api/ folder).
 * Never import this from src/ or ship the key to the browser.
 */
export function getSupabase(): SupabaseClient {
  if (_client) return _client

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured')
  }

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _client
}
```

- [ ] **Step 2: Verify no other file references SUPABASE_ANON_KEY**

```bash
grep -rn "SUPABASE_ANON_KEY" api/ src/ || echo "no references — good"
```

Expected output: "no references — good"

- [ ] **Step 3: Commit**

```bash
git add api/_lib/supabase.ts
git commit -m "feat(api): switch Supabase client to service-role key (bypasses RLS)"
```

---

### Task 3: Create `api/_lib/password.ts` with bcrypt wrappers

**Files:**
- Create: `api/_lib/password.ts`
- Create: `api/_lib/password.test.ts`

- [ ] **Step 1: Write the failing test**

Create `api/_lib/password.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from './password.js'

describe('password', () => {
  it('hashPassword produces a bcrypt hash (starts with $2a/$2b/$2y$)', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(hash).toMatch(/^\$2[aby]\$12\$/)
    expect(hash.length).toBeGreaterThanOrEqual(60)
  })

  it('verifyPassword returns true for correct password', async () => {
    const hash = await hashPassword('mypassword123')
    await expect(verifyPassword('mypassword123', hash)).resolves.toBe(true)
  })

  it('verifyPassword returns false for wrong password', async () => {
    const hash = await hashPassword('mypassword123')
    await expect(verifyPassword('wrongpassword', hash)).resolves.toBe(false)
  })

  it('verifyPassword returns false for an empty hash', async () => {
    await expect(verifyPassword('anything', '')).resolves.toBe(false)
  })

  it('two hashes of the same password differ (unique salt)', async () => {
    const h1 = await hashPassword('same')
    const h2 = await hashPassword('same')
    expect(h1).not.toBe(h2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- api/_lib/password.test.ts
```

Expected: FAIL — "Cannot find module './password.js'"

- [ ] **Step 3: Write minimal implementation**

Create `api/_lib/password.ts`:

```typescript
import bcrypt from 'bcryptjs'

const COST = 12

/** Hash a plaintext password with bcrypt (cost 12). */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST)
}

/** Verify a plaintext password against a bcrypt hash. Returns false for empty hashes. */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash || !plain) return false
  try {
    return await bcrypt.compare(plain, hash)
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:run -- api/_lib/password.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/password.ts api/_lib/password.test.ts
git commit -m "feat(api): add bcrypt password module with tests"
```

---

### Task 4: Migrate `admin-login.ts` to bcrypt

**Files:**
- Modify: `api/auth/admin-login.ts`

- [ ] **Step 1: Replace SHA-256 comparison with bcrypt for admin branch**

In `api/auth/admin-login.ts`, replace the import line:

```typescript
// OLD:
import { createHash } from 'crypto'
import { signAdminToken, signDepotToken, signTransportToken } from '../_lib/jwt.js'

// NEW:
import { signAdminToken, signDepotToken, signTransportToken } from '../_lib/jwt.js'
import { verifyPassword } from '../_lib/password.js'
```

- [ ] **Step 2: Replace the admin hash comparison (lines ~52-57)**

```typescript
// OLD:
// Compare username (case-insensitive) and password hash (SHA-256)
const inputHash = createHash('sha256').update(password).digest('hex')

if (username.toLowerCase() !== adminUser.toLowerCase() || inputHash !== adminPassHash) {
  return res.status(401).json({ error: 'Invalid credentials' })
}

// NEW:
// Compare username (case-insensitive) and verify password with bcrypt
const usernameOk = username.toLowerCase() === adminUser.toLowerCase()
const passwordOk = await verifyPassword(password, adminPassHash)

if (!usernameOk || !passwordOk) {
  return res.status(401).json({ error: 'Invalid credentials' })
}
```

- [ ] **Step 3: Replace the partner hash comparison (line ~98)**

In `handlePartnerLogin`:

```typescript
// OLD:
const inputHash = createHash('sha256').update(password).digest('hex')
if (inputHash !== user.password_hash) return res.status(401).json({ error: 'Credenciales inválidas' })

// NEW:
const passwordOk = await verifyPassword(password, user.password_hash)
if (!passwordOk) return res.status(401).json({ error: 'Credenciales inválidas' })
```

- [ ] **Step 4: Verify the file has no `createHash` references**

```bash
grep -n "createHash" api/auth/admin-login.ts || echo "clean"
```

Expected: "clean"

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: No errors in `admin-login.ts`.

- [ ] **Step 6: Commit**

```bash
git add api/auth/admin-login.ts
git commit -m "feat(auth): migrate admin + partner login to bcrypt"
```

---

### Task 5: Migrate partner user handlers in `api/data/[entity].ts` to bcrypt

**Files:**
- Modify: `api/data/[entity].ts`

- [ ] **Step 1: Replace the `hashPw` helper and imports**

At the top of the file (line 5), replace:

```typescript
// OLD:
import { createHash } from 'crypto'

// NEW:
import { hashPassword } from '../_lib/password.js'
```

Remove the `hashPw` function (around line 623-625):

```typescript
// DELETE:
function hashPw(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}
```

- [ ] **Step 2: Update POST handler in `handlePartnerUsers` (line ~642)**

```typescript
// OLD:
const { data, error } = await db.from('partner_users').insert({
  email: email.toLowerCase().trim(), name: name.trim(),
  password_hash: hashPw(password), role, filter_value: filterValue, active: true,
}).select('id').single()

// NEW:
const password_hash = await hashPassword(password)
const { data, error } = await db.from('partner_users').insert({
  email: email.toLowerCase().trim(), name: name.trim(),
  password_hash, role, filter_value: filterValue, active: true,
}).select('id').single()
```

- [ ] **Step 3: Update PATCH handler in `handlePartnerUsers` (line ~657)**

```typescript
// OLD:
if (body.password !== undefined) updates.password_hash = hashPw(body.password)

// NEW:
if (body.password !== undefined) updates.password_hash = await hashPassword(body.password)
```

- [ ] **Step 4: Verify no more `createHash`/`hashPw` references in this file**

```bash
grep -n "createHash\|hashPw" api/data/\[entity\].ts || echo "clean"
```

Expected: "clean"

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add "api/data/[entity].ts"
git commit -m "feat(api): migrate partner_users password storage to bcrypt"
```

---

### Task 6: Update `verify-session.ts` to check partner `active=true`

**Files:**
- Modify: `api/auth/verify-session.ts`

- [ ] **Step 1: Add Supabase import + active check for depot/transport**

Replace the entire file contents:

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest } from '../_lib/jwt.js'
import { getSupabase } from '../_lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://twf.uy'
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const payload = authenticateRequest(req.headers.authorization)
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  // Admin: no extra check (password is in env var)
  if (payload.role === 'admin') {
    return res.status(200).json({ role: 'admin', user: payload.user })
  }

  // Client: OTP already single-use, JWT already validated
  if (payload.role === 'client') {
    return res.status(200).json({
      role: 'client',
      email: payload.email,
      name: payload.name,
      company: payload.company,
    })
  }

  // Partner (depot/transport): cross-check that the user still exists AND is active
  if (payload.role === 'depot' || payload.role === 'transport') {
    try {
      const db = getSupabase()
      const { data, error } = await db
        .from('partner_users')
        .select('active')
        .eq('email', payload.email.toLowerCase().trim())
        .single()

      if (error || !data || data.active !== true) {
        return res.status(401).json({ error: 'Account deactivated or not found' })
      }
    } catch (err) {
      console.error('[verify-session] partner check failed:', err)
      return res.status(500).json({ error: 'Verification error' })
    }

    if (payload.role === 'depot') {
      return res.status(200).json({
        role: 'depot', email: payload.email, name: payload.name, filterValue: payload.depotName,
      })
    }
    return res.status(200).json({
      role: 'transport', email: payload.email, name: payload.name, filterValue: payload.transportName,
    })
  }

  return res.status(401).json({ error: 'Unknown role' })
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add api/auth/verify-session.ts
git commit -m "feat(auth): verify-session cross-checks partner active status"
```

---

### Task 7: Make `CRON_SECRET` mandatory

**Files:**
- Modify: `api/notifications/[action].ts` (lines 266-271)

- [ ] **Step 1: Replace the optional check with mandatory**

Find `handleCheckPending` (around line 266). Replace the start of the function:

```typescript
// OLD:
async function handleCheckPending(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.authorization
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

// NEW:
async function handleCheckPending(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[check-pending] CRON_SECRET env var not set — refusing to run')
    return res.status(500).json({ error: 'Server misconfigured' })
  }
  const authHeader = req.headers.authorization
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add "api/notifications/[action].ts"
git commit -m "feat(api): make CRON_SECRET mandatory (fail closed)"
```

---

## Phase 3 — Input validation (Zod)

### Task 8: Create `api/_lib/schemas.ts` with all Zod schemas + `validate()` helper

**Files:**
- Create: `api/_lib/schemas.ts`
- Create: `api/_lib/schemas.test.ts`

- [ ] **Step 1: Write the failing test**

Create `api/_lib/schemas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  validate,
  QuoteSubmitSchema,
  ClientRowSchema,
  SettingsUpsertSchema,
  PartnerUserCreateSchema,
  AdminLoginSchema,
  OtpRequestSchema,
  OtpVerifySchema,
  SETTINGS_ALLOWLIST,
} from './schemas.js'

describe('validate helper', () => {
  it('returns ok:true for valid input', () => {
    const r = validate(QuoteSubmitSchema, {
      name: 'Juan',
      email: 'juan@example.com',
      cargoType: 'FCL',
      language: 'es',
    })
    expect(r.ok).toBe(true)
  })

  it('returns ok:false with error for invalid input', () => {
    const r = validate(QuoteSubmitSchema, { name: '', email: 'not-an-email' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/name|email/i)
  })
})

describe('QuoteSubmitSchema', () => {
  it('rejects empty name', () => {
    const r = QuoteSubmitSchema.safeParse({ name: '', email: 'a@b.c', cargoType: 'FCL' })
    expect(r.success).toBe(false)
  })
  it('rejects invalid email', () => {
    const r = QuoteSubmitSchema.safeParse({ name: 'J', email: 'nope', cargoType: 'FCL' })
    expect(r.success).toBe(false)
  })
  it('caps details at 2000 chars', () => {
    const r = QuoteSubmitSchema.safeParse({
      name: 'J', email: 'a@b.co', cargoType: 'FCL', details: 'x'.repeat(2001)
    })
    expect(r.success).toBe(false)
  })
  it('strips HTML tags from details', () => {
    const r = QuoteSubmitSchema.safeParse({
      name: 'J', email: 'a@b.co', cargoType: 'FCL', details: 'hi <script>alert(1)</script>'
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.details).toBe('hi alert(1)')
  })
})

describe('ClientRowSchema', () => {
  it('rejects clientePattern < 5 chars', () => {
    const r = ClientRowSchema.safeParse({
      id: 'c1', email: 'a@b.co', name: 'Acme', clientePattern: 'AC'
    })
    expect(r.success).toBe(false)
  })
  it('accepts valid clientePattern', () => {
    const r = ClientRowSchema.safeParse({
      id: 'c1', email: 'a@b.co', name: 'Acme', clientePattern: 'CHIAPERO'
    })
    expect(r.success).toBe(true)
  })
  it('accepts comma-separated patterns', () => {
    const r = ClientRowSchema.safeParse({
      id: 'c1', email: 'a@b.co', name: 'Acme', clientePattern: 'CHIAPERO,MARTINEZ'
    })
    expect(r.success).toBe(true)
  })
})

describe('SettingsUpsertSchema', () => {
  it('rejects keys not in SETTINGS_ALLOWLIST (empty by default)', () => {
    const r = SettingsUpsertSchema.safeParse({ key: '__evil', value: {} })
    expect(r.success).toBe(false)
  })
  it('SETTINGS_ALLOWLIST is empty initially', () => {
    expect(SETTINGS_ALLOWLIST).toEqual([])
  })
})

describe('PartnerUserCreateSchema', () => {
  it('rejects password < 10 chars', () => {
    const r = PartnerUserCreateSchema.safeParse({
      email: 'a@b.co', name: 'N', password: 'short', role: 'depot', filterValue: 'X'
    })
    expect(r.success).toBe(false)
  })
  it('rejects invalid role', () => {
    const r = PartnerUserCreateSchema.safeParse({
      email: 'a@b.co', name: 'N', password: 'longpassword1', role: 'hacker', filterValue: 'X'
    })
    expect(r.success).toBe(false)
  })
})

describe('AdminLoginSchema', () => {
  it('accepts a short password (admin-login checks hash)', () => {
    const r = AdminLoginSchema.safeParse({ username: 'admin', password: 'x' })
    expect(r.success).toBe(true)
  })
  it('rejects missing username', () => {
    const r = AdminLoginSchema.safeParse({ password: 'x' })
    expect(r.success).toBe(false)
  })
})

describe('OtpRequestSchema / OtpVerifySchema', () => {
  it('OtpRequestSchema requires email', () => {
    const r = OtpRequestSchema.safeParse({ action: 'request' })
    expect(r.success).toBe(false)
  })
  it('OtpVerifySchema requires 6-digit code', () => {
    const r1 = OtpVerifySchema.safeParse({ action: 'verify', email: 'a@b.co', code: '123' })
    expect(r1.success).toBe(false)
    const r2 = OtpVerifySchema.safeParse({ action: 'verify', email: 'a@b.co', code: '123456' })
    expect(r2.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- api/_lib/schemas.test.ts
```

Expected: FAIL — "Cannot find module './schemas.js'"

- [ ] **Step 3: Create `api/_lib/schemas.ts`**

```typescript
import { z } from 'zod'

// ─── Settings allowlist ─────────────────────────────────────────────
// Start empty: no settings keys are currently written by the app.
// To allow a new settings key, add it here AND verify the admin UI writes it.
export const SETTINGS_ALLOWLIST: readonly string[] = [] as const

// ─── Helpers ────────────────────────────────────────────────────────
/** Strip HTML tags. Not bulletproof, but blocks naive injection attempts. */
const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '')

// ─── Schemas ────────────────────────────────────────────────────────

/** Public quote form submission */
export const QuoteSubmitSchema = z.object({
  name: z.string().min(1).max(100).transform(s => s.trim()),
  email: z.string().email().max(200).transform(s => s.toLowerCase().trim()),
  phone: z.string().max(40).optional(),
  cargoType: z.string().min(1).max(100),
  origin: z.string().max(200).optional(),
  destination: z.string().max(200).optional(),
  details: z.string().max(2000).transform(stripHtml).optional(),
  language: z.string().max(8).optional(),
})

/** Admin-synced quote row (bulk upsert) */
export const QuoteRowSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  email: z.string().email().max(200),
  phone: z.string().max(40).optional().default(''),
  cargoType: z.string().max(100).optional(),
  cargo_type: z.string().max(100).optional(),
  origin: z.string().max(200).optional().default(''),
  destination: z.string().max(200).optional().default(''),
  details: z.string().max(2000).optional().default(''),
  timestamp: z.number().int().positive().optional(),
  status: z.enum(['pending', 'contacted', 'quoted', 'closed', 'lost']).optional(),
  notes: z.array(z.any()).optional(),
  language: z.string().max(8).optional(),
})

/** Client row (admin CRUD) */
const clientePatternRe = /^[A-Z0-9 .&,/-]+(,[A-Z0-9 .&,/-]+)*$/i
export const ClientRowSchema = z.object({
  id: z.string().min(1).max(100),
  email: z.string().email().max(200),
  name: z.string().min(1).max(200),
  company: z.string().max(200).optional().default(''),
  createdAt: z.number().int().optional(),
  created_at_ts: z.number().int().optional(),
  clientePattern: z.string().min(5).max(400).regex(clientePatternRe, 'invalid chars'),
})

/** Settings upsert (PUT) */
export const SettingsUpsertSchema = z.object({
  key: z.string().refine(
    (k) => (SETTINGS_ALLOWLIST as readonly string[]).includes(k),
    { message: 'key not in SETTINGS_ALLOWLIST' }
  ),
  value: z.unknown(),
})

/** Partner user create (POST) */
export const PartnerUserCreateSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().min(1).max(200),
  password: z.string().min(10).max(200),
  role: z.enum(['depot', 'transport']),
  filterValue: z.string().min(2).max(200),
})

/** Partner user patch (PATCH, partial) */
export const PartnerUserPatchSchema = z.object({
  email: z.string().email().max(200).optional(),
  name: z.string().min(1).max(200).optional(),
  password: z.string().min(10).max(200).optional(),
  role: z.enum(['depot', 'transport']).optional(),
  filterValue: z.string().min(2).max(200).optional(),
  active: z.boolean().optional(),
})

/** Document row */
export const DocumentRowSchema = z.object({
  id: z.string().min(1).max(100),
  shipmentRef: z.string().min(1).max(100).optional(),
  shipment_ref: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(300),
  type: z.string().max(100).optional().default(''),
  uploadedAt: z.number().int().optional(),
  uploaded_at: z.number().int().optional(),
  uploadedBy: z.string().max(200).optional().default(''),
  uploaded_by: z.string().max(200).optional().default(''),
  url: z.string().max(2000).optional().default(''),
  data: z.string().optional().default(''), // base64 — no length cap; UI enforces upload size
}).refine(d => d.shipmentRef || d.shipment_ref, { message: 'shipmentRef required' })

/** Report row */
export const ReportRowSchema = z.object({
  id: z.string().min(1).max(100),
  shipmentRef: z.string().min(1).max(100).optional(),
  shipment_ref: z.string().min(1).max(100).optional(),
  containerNumber: z.string().max(50).optional(),
  container_number: z.string().max(50).optional(),
  title: z.string().min(1).max(300),
  content: z.string().max(20000).optional().default(''),
  fileName: z.string().max(300).optional(),
  file_name: z.string().max(300).optional(),
  fileType: z.string().max(100).optional(),
  file_type: z.string().max(100).optional(),
  fileData: z.string().optional(),
  file_data: z.string().optional(),
  createdAt: z.number().int().optional(),
  created_at_ts: z.number().int().optional(),
  createdBy: z.string().max(200).optional(),
  created_by: z.string().max(200).optional(),
}).refine(r => r.shipmentRef || r.shipment_ref, { message: 'shipmentRef required' })

/** Origin photo row */
export const OriginPhotoRowSchema = z.object({
  id: z.string().min(1).max(100),
  shipmentRef: z.string().min(1).max(100).optional(),
  shipment_ref: z.string().min(1).max(100).optional(),
  containerNumber: z.string().max(50).optional(),
  container_number: z.string().max(50).optional(),
  caption: z.string().max(500).optional().default(''),
  photoType: z.enum(['origen', 'destino', 'otro']).optional().default('origen'),
  photo_type: z.enum(['origen', 'destino', 'otro']).optional(),
  fileName: z.string().max(300).optional().default(''),
  file_name: z.string().max(300).optional(),
  fileType: z.string().max(100).optional().default(''),
  file_type: z.string().max(100).optional(),
  fileData: z.string().optional().default(''),
  file_data: z.string().optional(),
  thumbnailData: z.string().optional().default(''),
  thumbnail_data: z.string().optional(),
  createdAt: z.number().int().optional(),
  created_at_ts: z.number().int().optional(),
  createdBy: z.string().max(200).optional().default(''),
  created_by: z.string().max(200).optional(),
}).refine(p => p.shipmentRef || p.shipment_ref, { message: 'shipmentRef required' })

/** Notification task row */
export const NotificationTaskRowSchema = z.object({
  id: z.string().min(1).max(100),
  shipmentRef: z.string().min(1).max(100).optional(),
  shipment_ref: z.string().min(1).max(100).optional(),
  containerNumber: z.string().max(50).optional(),
  container_number: z.string().max(50).optional(),
  operativa: z.string().max(100).optional(),
  cliente: z.string().max(200).optional(),
  clientEmail: z.string().email().max(200).optional().or(z.literal('')),
  client_email: z.string().email().max(200).optional().or(z.literal('')),
  clientName: z.string().max(200).optional(),
  client_name: z.string().max(200).optional(),
  step: z.string().min(1).max(100),
  stepNumber: z.number().int().optional(),
  step_number: z.number().int().optional(),
  dueDate: z.string().max(20).optional(),
  due_date: z.string().max(20).optional(),
  salidaDate: z.string().max(20).optional(),
  salida_date: z.string().max(20).optional(),
  photosOk: z.boolean().optional(),
  photos_ok: z.boolean().optional(),
  reportOk: z.boolean().optional(),
  report_ok: z.boolean().optional(),
  emailSent: z.boolean().optional(),
  email_sent: z.boolean().optional(),
  emailSentAt: z.string().optional().nullable(),
  email_sent_at: z.string().optional().nullable(),
  status: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
})

/** Notification task PATCH (partial) */
export const NotificationTaskPatchSchema = z.object({
  photosOk: z.boolean().optional(),
  reportOk: z.boolean().optional(),
  emailSent: z.boolean().optional(),
  clientEmail: z.string().email().max(200).optional().or(z.literal('')),
  clientName: z.string().max(200).optional(),
  status: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
})

/** Admin login body */
export const AdminLoginSchema = z.object({
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
})

/** Partner login body */
export const PartnerLoginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
  type: z.literal('partner'),
})

/** OTP request body */
export const OtpRequestSchema = z.object({
  action: z.literal('request'),
  email: z.string().email().max(200),
})

/** OTP verify body */
export const OtpVerifySchema = z.object({
  action: z.literal('verify'),
  email: z.string().email().max(200),
  code: z.string().regex(/^\d{6}$/, 'must be 6 digits'),
})

// ─── validate() helper ──────────────────────────────────────────────

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

/** Parse and return a clean result object. Never throws. */
export function validate<T>(schema: z.ZodSchema<T>, body: unknown): ValidationResult<T> {
  const r = schema.safeParse(body)
  if (!r.success) {
    const error = r.error.issues
      .map(i => `${i.path.length ? i.path.join('.') + ': ' : ''}${i.message}`)
      .join('; ')
    return { ok: false, error }
  }
  return { ok: true, data: r.data }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- api/_lib/schemas.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/schemas.ts api/_lib/schemas.test.ts
git commit -m "feat(api): add Zod schemas and validate() helper"
```

---

### Task 9: Fix `matchesClientePattern` in `csvParser.ts`

**Files:**
- Modify: `api/_lib/csvParser.ts` (lines 460-469)
- Create: `api/_lib/csvParser.test.ts`

- [ ] **Step 1: Write the failing test**

Create `api/_lib/csvParser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { matchesClientePattern } from './csvParser.js'

describe('matchesClientePattern (hardened)', () => {
  it('matches exact word', () => {
    expect(matchesClientePattern('CHIAPERO', 'CHIAPERO')).toBe(true)
  })
  it('matches with surrounding spaces/punctuation', () => {
    expect(matchesClientePattern('ACME CHIAPERO SRL', 'CHIAPERO')).toBe(true)
    expect(matchesClientePattern('CHIAPERO,VENTAS', 'CHIAPERO')).toBe(true)
  })
  it('rejects patterns shorter than 5 chars (drops them silently)', () => {
    expect(matchesClientePattern('ACME SA', 'SA')).toBe(false)
  })
  it('does NOT match substring mid-word', () => {
    // Old behavior: 'SA' matches 'SANTOS' via includes. New: must be whole word.
    expect(matchesClientePattern('SANTOS MARIA', 'SANTO')).toBe(false)
    expect(matchesClientePattern('SANTOS MARIA', 'SANTOS')).toBe(true)
  })
  it('case-insensitive', () => {
    expect(matchesClientePattern('chiapero srl', 'CHIAPERO')).toBe(true)
  })
  it('supports comma-separated patterns, each ≥5 chars', () => {
    expect(matchesClientePattern('MARTINEZ S.A.', 'CHIAPERO,MARTINEZ')).toBe(true)
    expect(matchesClientePattern('PEREZ S.A.', 'CHIAPERO,MARTINEZ')).toBe(false)
  })
  it('returns false for empty inputs', () => {
    expect(matchesClientePattern('', 'CHIAPERO')).toBe(false)
    expect(matchesClientePattern('ACME', '')).toBe(false)
  })
  it('escapes regex metacharacters in the pattern', () => {
    // Pattern with a "." — should match literal dot, not any-char
    expect(matchesClientePattern('A.C.M.E', 'A.C.M')).toBe(false)  // too short anyway
    expect(matchesClientePattern('COMPANY', 'CO.PANY')).toBe(false) // literal dot
  })
  it('drops short patterns but keeps long ones from a comma list', () => {
    expect(matchesClientePattern('CHIAPERO HNOS', 'SA,CHIAPERO')).toBe(true)
    expect(matchesClientePattern('SANTOS MARIA', 'SA,PEREZ')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- api/_lib/csvParser.test.ts
```

Expected: 3-5 tests FAIL (the substring match tests, because current code uses `.includes()`).

- [ ] **Step 3: Replace `matchesClientePattern` in `csvParser.ts`**

Around lines 460-469, replace:

```typescript
// OLD:
export function matchesClientePattern(cliente: string, pattern: string): boolean {
  if (!cliente || !pattern) return false
  const clienteUpper = cliente.toUpperCase()
  const patterns = pattern.toUpperCase().split(',').map(p => p.trim()).filter(Boolean)
  return patterns.some(p => clienteUpper.includes(p))
}

// NEW:
/**
 * Check if a CLIENTE field matches a pattern string.
 * - Supports multiple comma-separated patterns: "CHIAPERO,MARTINEZ,ACME"
 * - Patterns shorter than 5 chars are silently dropped (prevents accidental
 *   cross-client matches via short substrings).
 * - Match is word-boundary (pattern must be flanked by non-alphanumerics or string edges)
 *   so "SA" would not match inside "SANTOS" if it were allowed. Regex metacharacters in
 *   the pattern are escaped.
 */
export function matchesClientePattern(cliente: string, pattern: string): boolean {
  if (!cliente || !pattern) return false
  const clienteUpper = cliente.toUpperCase()
  const patterns = pattern
    .toUpperCase()
    .split(',')
    .map(p => p.trim())
    .filter(p => p.length >= 5)
  if (patterns.length === 0) return false
  return patterns.some(p => {
    const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`)
    return re.test(clienteUpper)
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:run -- api/_lib/csvParser.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/csvParser.ts api/_lib/csvParser.test.ts
git commit -m "fix(api): matchesClientePattern uses word-boundary + 5-char minimum"
```

---

### Task 10: Wire Zod validation + settings allowlist + `.limit(500)` into `[entity].ts`

**Files:**
- Modify: `api/data/[entity].ts`

- [ ] **Step 1: Add imports at the top of the file**

Right after the existing imports, add:

```typescript
import {
  validate,
  QuoteRowSchema,
  ClientRowSchema,
  SettingsUpsertSchema,
  PartnerUserCreateSchema,
  PartnerUserPatchSchema,
  DocumentRowSchema,
  ReportRowSchema,
  OriginPhotoRowSchema,
  NotificationTaskRowSchema,
  NotificationTaskPatchSchema,
} from '../_lib/schemas.js'
import { z } from 'zod'
```

- [ ] **Step 2: Add a reusable array-or-single validator helper**

Below the imports, add:

```typescript
/** Validate `req.body` as either a single object or an array against `itemSchema`. */
function validateBatch<T>(itemSchema: z.ZodSchema<T>, body: unknown): { ok: true; items: T[] } | { ok: false; error: string } {
  const arr = Array.isArray(body) ? body : [body]
  const results: T[] = []
  for (let i = 0; i < arr.length; i++) {
    const r = validate(itemSchema, arr[i])
    if (!r.ok) return { ok: false, error: `item[${i}]: ${r.error}` }
    results.push(r.data)
  }
  return { ok: true, items: results }
}
```

- [ ] **Step 3: Wrap each POST handler with validation + add `.limit(500)` on each list GET**

For **`handleQuotes`**:

```typescript
// GET section: change
const { data, error } = await db
  .from('quotes')
  .select('*')
  .order('timestamp', { ascending: false })
// to
const { data, error } = await db
  .from('quotes')
  .select('*')
  .order('timestamp', { ascending: false })
  .limit(500)

// POST section: replace the rows building with:
const v = validateBatch(QuoteRowSchema, req.body)
if (!v.ok) return res.status(400).json({ error: v.error })
const rows = v.items.map(q => ({
  id: q.id,
  name: q.name,
  email: q.email,
  phone: q.phone || '',
  cargo_type: q.cargoType || q.cargo_type || '',
  origin: q.origin || '',
  destination: q.destination || '',
  details: q.details || '',
  timestamp: q.timestamp || Date.now(),
  status: q.status || 'pending',
  notes: q.notes || [],
  language: q.language || 'es',
}))
```

For **`handleDocuments`**:

```typescript
// GET bulk section: add .limit(500)
let query = db.from('documents').select('*').order('uploaded_at', { ascending: false }).limit(500)

// POST section: replace building with
const v = validateBatch(DocumentRowSchema, req.body)
if (!v.ok) return res.status(400).json({ error: v.error })
const rows = v.items.map(d => ({
  id: d.id,
  shipment_ref: d.shipmentRef || d.shipment_ref,
  name: d.name,
  type: d.type || '',
  uploaded_at: d.uploadedAt || d.uploaded_at || Date.now(),
  uploaded_by: d.uploadedBy || d.uploaded_by || '',
  url: d.url || '',
  data: d.data || '',
}))
```

For **`handleReports`**:

```typescript
// GET bulk list: add .limit(500)
let query = db.from('reports').select('*').order('created_at_ts', { ascending: false }).limit(500)

// POST single (mode=file): validate with ReportRowSchema first
if (mode === 'file') {
  const v = validate(ReportRowSchema, req.body)
  if (!v.ok) return res.status(400).json({ error: v.error })
  const r = v.data
  if (!r.id) return res.status(400).json({ error: 'id required' })
  const row = buildRow(r, true)
  row.container_number = r.containerNumber || r.container_number || ''
  // ... rest unchanged
}

// POST bulk metadata: validate batch
const v = validateBatch(ReportRowSchema, req.body)
if (!v.ok) return res.status(400).json({ error: v.error })
const rows = v.items.map((r: any) => buildRow(r, false))
```

For **`handleClients`**:

```typescript
// GET: add .limit(500)
const { data, error } = await db
  .from('clients')
  .select('*')
  .order('created_at_ts', { ascending: false })
  .limit(500)

// POST: validate
const v = validateBatch(ClientRowSchema, req.body)
if (!v.ok) return res.status(400).json({ error: v.error })
const rows = v.items.map(c => ({
  id: c.id,
  email: c.email,
  name: c.name,
  company: c.company || '',
  created_at_ts: c.createdAt || c.created_at_ts || Date.now(),
  cliente_pattern: c.clientePattern,  // schema already guarantees ≥5 chars
}))
```

For **`handleSettings`** (PUT):

```typescript
if (req.method === 'PUT') {
  const v = validate(SettingsUpsertSchema, req.body)
  if (!v.ok) return res.status(400).json({ error: v.error })
  const { key, value } = v.data
  const { error } = await db.from('settings').upsert({
    key,
    value: typeof value === 'object' && value !== null ? value : { v: value },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })
  if (error) throw error
  return res.status(200).json({ saved: true })
}
```

For **`handleOriginPhotos`**:

```typescript
// GET bulk: add .limit(500)
let query = db.from('origin_photos')
  .select('id, shipment_ref, container_number, caption, photo_type, file_name, file_type, thumbnail_data, created_at_ts, created_by')
  .order('created_at_ts', { ascending: false })
  .limit(500)

// POST: validate
const v = validate(OriginPhotoRowSchema, req.body)
if (!v.ok) return res.status(400).json({ error: v.error })
const p = v.data
if (!p.id) return res.status(400).json({ error: 'id required' })
// ... rest unchanged
```

For **`handleNotificationTasks`**:

```typescript
// GET: add .limit(500) at end of query chain
let query = db.from('notification_tasks')
  .select('*')
  .order('due_date', { ascending: true })
  .order('step_number', { ascending: true })
  .limit(500)

// POST: validate
const v = validateBatch(NotificationTaskRowSchema, req.body)
if (!v.ok) return res.status(400).json({ error: v.error })
// then map v.items to rows (same mapping as before, but use v.items instead of items)

// PATCH: validate
const vP = validate(NotificationTaskPatchSchema, req.body)
if (!vP.ok) return res.status(400).json({ error: vP.error })
const body = vP.data
// ... rest of field mapping unchanged
```

For **`handlePartnerUsers`**:

```typescript
// GET: add .limit(500)
const { data, error } = await db.from('partner_users').select('*').order('created_at', { ascending: false }).limit(500)

// POST: validate
const v = validate(PartnerUserCreateSchema, req.body)
if (!v.ok) return res.status(400).json({ error: v.error })
const { email, name, password, role, filterValue } = v.data
const password_hash = await hashPassword(password)
const { data, error } = await db.from('partner_users').insert({
  email: email.toLowerCase().trim(), name: name.trim(),
  password_hash, role, filter_value: filterValue, active: true,
}).select('id').single()

// PATCH: validate
const vP = validate(PartnerUserPatchSchema, req.body)
if (!vP.ok) return res.status(400).json({ error: vP.error })
const body = vP.data
// ... then the field-by-field mapping keeps working (all fields are typed now)
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: No errors.

- [ ] **Step 5: Run unit tests**

```bash
npm run test:run
```

Expected: All previous tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add "api/data/[entity].ts"
git commit -m "feat(api): wire Zod validation + .limit(500) + settings allowlist into data handlers"
```

---

### Task 11: Wire validation into `api/quotes/submit.ts` (without Turnstile yet — Turnstile added in Task 15)

**Files:**
- Modify: `api/quotes/submit.ts`

- [ ] **Step 1: Add Zod validation**

Replace the early body-destructure with schema validation. Change:

```typescript
// OLD:
const { name, email, phone, cargoType, origin, destination, details, language } = req.body || {}

if (!name || !email || !cargoType) {
  return res.status(400).json({ error: 'Name, email, and cargo type are required' })
}

// NEW:
import { validate, QuoteSubmitSchema } from '../_lib/schemas.js'
// ^ add this import at the top of the file

// ... inside handler:
const v = validate(QuoteSubmitSchema, req.body)
if (!v.ok) return res.status(400).json({ error: v.error })
const { name, email, phone, cargoType, origin, destination, details, language } = v.data
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add api/quotes/submit.ts
git commit -m "feat(api): validate /api/quotes/submit body with Zod"
```

---

### Task 12: Wire validation into auth endpoints

**Files:**
- Modify: `api/auth/admin-login.ts`
- Modify: `api/auth/otp.ts`

- [ ] **Step 1: Update `admin-login.ts`**

Add import at top:
```typescript
import { validate, AdminLoginSchema, PartnerLoginSchema } from '../_lib/schemas.js'
```

Then in the handler, before the `const { username, password } = req.body || {}` block, validate:

```typescript
// Partner branch (type === 'partner'):
if (req.body?.type === 'partner') {
  const v = validate(PartnerLoginSchema, req.body)
  if (!v.ok) return res.status(400).json({ error: v.error })
  return handlePartnerLogin(req, res, v.data)
}

// Admin branch:
const v = validate(AdminLoginSchema, req.body)
if (!v.ok) return res.status(400).json({ error: v.error })
const { username, password } = v.data
```

And update `handlePartnerLogin` signature to take the validated data:

```typescript
async function handlePartnerLogin(req: VercelRequest, res: VercelResponse, body: { email: string; password: string }) {
  const { email, password } = body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' })
  }
  // ... rest unchanged
}
```

- [ ] **Step 2: Update `otp.ts`**

Add import:
```typescript
import { validate, OtpRequestSchema, OtpVerifySchema } from '../_lib/schemas.js'
```

In the handler, replace the ad-hoc destructure:

```typescript
// OLD:
const { action, email, code } = req.body || {}
if (!email) return res.status(400).json({ error: 'Email required' })
const normalizedEmail = email.toLowerCase().trim()

// NEW:
const action = req.body?.action
if (action !== 'request' && action !== 'verify') {
  return res.status(400).json({ error: 'Invalid action. Use "request" or "verify".' })
}

if (action === 'request') {
  const v = validate(OtpRequestSchema, req.body)
  if (!v.ok) return res.status(400).json({ error: v.error })
  const normalizedEmail = v.data.email.toLowerCase().trim()
  // ... continue with existing rate-limit + client-lookup + storeOTP flow using normalizedEmail
}

if (action === 'verify') {
  const v = validate(OtpVerifySchema, req.body)
  if (!v.ok) return res.status(400).json({ error: v.error })
  const normalizedEmail = v.data.email.toLowerCase().trim()
  const code = v.data.code
  // ... continue with existing verifyOTP + JWT sign flow
}
```

Adjust flow: move the existing body of each branch to use the new variables.

- [ ] **Step 3: Typecheck + run tests**

```bash
npx tsc --noEmit -p tsconfig.json
npm run test:run
```

Expected: No TS errors. All tests pass.

- [ ] **Step 4: Commit**

```bash
git add api/auth/admin-login.ts api/auth/otp.ts
git commit -m "feat(auth): Zod validate admin-login + OTP request/verify bodies"
```

---

## Phase 4 — Rate limits, captcha, CSP, OTP timing

### Task 13: Extend `rateLimiter.ts` with `checkRateLimitWithConfig`

**Files:**
- Modify: `api/_lib/rateLimiter.ts`
- Create: `api/_lib/rateLimiter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `api/_lib/rateLimiter.test.ts` (minimal — unit-tests the signature, not the Supabase interactions):

```typescript
import { describe, it, expect } from 'vitest'
import * as mod from './rateLimiter.js'

describe('rateLimiter exports', () => {
  it('exports checkRateLimit (default config)', () => {
    expect(typeof mod.checkRateLimit).toBe('function')
  })
  it('exports checkRateLimitWithConfig (configurable)', () => {
    expect(typeof mod.checkRateLimitWithConfig).toBe('function')
  })
  it('exports clearRateLimit', () => {
    expect(typeof mod.clearRateLimit).toBe('function')
  })
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
npm run test:run -- api/_lib/rateLimiter.test.ts
```

Expected: 1 FAIL (`checkRateLimitWithConfig` does not exist).

- [ ] **Step 3: Refactor `rateLimiter.ts`**

Replace the file contents:

```typescript
import { getSupabase } from './supabase.js'

// Defaults (used by existing callers)
const DEFAULT_MAX_ATTEMPTS = 5
const DEFAULT_WINDOW_MS = 15 * 60 * 1000      // 15 minutes
const DEFAULT_BLOCK_MS = 30 * 60 * 1000        // 30 minutes

interface Config {
  maxAttempts: number
  windowMs: number
  blockMs: number
}

/**
 * Core rate-limit check with configurable limits. Increments the counter.
 */
export async function checkRateLimitWithConfig(
  key: string,
  maxAttempts: number,
  windowMs: number,
  blockMs: number,
): Promise<{ limited: boolean; retryAfterMs?: number }> {
  const db = getSupabase()
  const now = new Date()

  const { data, error } = await db
    .from('rate_limits')
    .select('attempts, first_attempt, blocked_until')
    .eq('key', key)
    .single()

  if (error || !data) {
    await db.from('rate_limits').upsert({
      key,
      attempts: 1,
      first_attempt: now.toISOString(),
      blocked_until: null,
    }, { onConflict: 'key' })
    return { limited: false }
  }

  if (data.blocked_until) {
    const blockedUntil = new Date(data.blocked_until).getTime()
    if (now.getTime() < blockedUntil) {
      return { limited: true, retryAfterMs: blockedUntil - now.getTime() }
    }
    await db.from('rate_limits').update({
      attempts: 1,
      first_attempt: now.toISOString(),
      blocked_until: null,
    }).eq('key', key)
    return { limited: false }
  }

  const windowStart = new Date(data.first_attempt).getTime()
  if (now.getTime() - windowStart > windowMs) {
    await db.from('rate_limits').update({
      attempts: 1,
      first_attempt: now.toISOString(),
      blocked_until: null,
    }).eq('key', key)
    return { limited: false }
  }

  const newAttempts = data.attempts + 1
  if (newAttempts > maxAttempts) {
    const blockedUntil = new Date(now.getTime() + blockMs).toISOString()
    await db.from('rate_limits').update({
      attempts: newAttempts,
      blocked_until: blockedUntil,
    }).eq('key', key)
    return { limited: true, retryAfterMs: blockMs }
  }

  await db.from('rate_limits').update({ attempts: newAttempts }).eq('key', key)
  return { limited: false }
}

/** Default rate-limit: 5 attempts / 15 min / 30-min block. */
export async function checkRateLimit(key: string): Promise<{ limited: boolean; retryAfterMs?: number }> {
  return checkRateLimitWithConfig(key, DEFAULT_MAX_ATTEMPTS, DEFAULT_WINDOW_MS, DEFAULT_BLOCK_MS)
}

/** Clear rate limit for a key (call on successful login). */
export async function clearRateLimit(key: string): Promise<void> {
  const db = getSupabase()
  await db.from('rate_limits').delete().eq('key', key)
}
```

- [ ] **Step 4: Run test**

```bash
npm run test:run -- api/_lib/rateLimiter.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/rateLimiter.ts api/_lib/rateLimiter.test.ts
git commit -m "feat(api): add configurable rate limiter variant"
```

---

### Task 14: Tighten `api/tracking.ts` (exact match + rate limit)

**Files:**
- Modify: `api/tracking.ts`

- [ ] **Step 1: Replace the endpoint contents**

Rewrite the validation + filter logic. Change lines 16-23 and the filter on 69-73:

```typescript
// NEW near the top of handler:
import { checkRateLimitWithConfig } from './_lib/rateLimiter.js'
// (add import at top of file)

// REF patterns:
const REF_RE = /^A?\d{4,5}$/i                  // e.g. A7509, 7509, A75098
const CNTR_RE = /^[A-Z]{4}\d{7}$/i             // ISO container: MSCU1234567
const MBL_RE = /^[A-Z0-9]{9,20}$/i             // bill of lading / master bill

const q = (req.query.q as string || '').trim().toUpperCase()
if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' })
if (!REF_RE.test(q) && !CNTR_RE.test(q) && !MBL_RE.test(q)) {
  return res.status(400).json({ error: 'Formato inválido. Ingresá referencia TWF (ej: A7509), container (ej: MSCU1234567) o MBL.' })
}

// Rate limit by IP: 30 queries/hour, 1h block on breach
const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
  || req.socket?.remoteAddress
  || 'unknown'
const { limited, retryAfterMs } = await checkRateLimitWithConfig(`tracking:${ip}`, 30, 60 * 60_000, 60 * 60_000)
if (limited) {
  res.setHeader('Retry-After', String(Math.ceil((retryAfterMs || 0) / 1000)))
  return res.status(429).json({ error: 'Demasiadas búsquedas. Reintentá más tarde.' })
}

// ... [existing Google Sheets / Supabase cache loading unchanged]

// Filter with EXACT match (no more .includes())
const filtered = (allShipments || []).filter((r: any) =>
  (r.REF || '').toUpperCase() === q ||
  (r.CNTR || '').toUpperCase().split(',').map((c: string) => c.trim()).includes(q) ||
  (r.MBL || '').toUpperCase() === q
)
```

Note: `CNTR` may be a comma-separated list of containers in Google Sheets; split and check exact membership per-token.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add api/tracking.ts
git commit -m "feat(api): tracking exact-match only + IP rate limit (30/hour)"
```

---

### Task 15: Server-side Turnstile verification on `/api/quotes/submit`

**Files:**
- Modify: `api/quotes/submit.ts`

- [ ] **Step 1: Add Turnstile verification + rate limit**

At the top of the handler (right after CORS setup), add:

```typescript
import { checkRateLimitWithConfig } from '../_lib/rateLimiter.js'

// ... inside handler, before Zod validation:

// ── Turnstile captcha verification ──
const turnstileSecret = process.env.TURNSTILE_SECRET_KEY
if (!turnstileSecret) {
  console.error('[quotes/submit] TURNSTILE_SECRET_KEY not set')
  return res.status(500).json({ error: 'Server misconfigured' })
}
const turnstileToken = req.body?.turnstileToken
if (!turnstileToken || typeof turnstileToken !== 'string') {
  return res.status(400).json({ error: 'Captcha requerido' })
}
const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown'
const tsParams = new URLSearchParams()
tsParams.set('secret', turnstileSecret)
tsParams.set('response', turnstileToken)
tsParams.set('remoteip', ip)
let tsOk = false
try {
  const tsRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: tsParams,
  })
  const tsData: any = await tsRes.json().catch(() => ({}))
  tsOk = tsData?.success === true
} catch (e) {
  console.error('[quotes/submit] Turnstile verify failed:', e)
}
if (!tsOk) return res.status(400).json({ error: 'Captcha inválido' })

// ── Rate limit: 3 submits / hour / IP, block 24h on breach ──
const { limited } = await checkRateLimitWithConfig(`quote:${ip}`, 3, 60 * 60_000, 24 * 60 * 60_000)
if (limited) return res.status(429).json({ error: 'Demasiadas solicitudes de cotización. Probá mañana.' })
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add api/quotes/submit.ts
git commit -m "feat(api): Turnstile captcha + IP rate limit on quote submit"
```

---

### Task 16: Add Turnstile widget to the quote form

**Files:**
- Modify: `src/components/PublicSiteEnhanced.tsx`

- [ ] **Step 1: Find the quote form**

Search for the quote form submit handler:

```bash
grep -n "onSubmit\|handleSubmit\|quotes/submit\|cotizaci" src/components/PublicSiteEnhanced.tsx | head -20
```

Note the line number where the form lives and where state is declared.

- [ ] **Step 2: Add Turnstile script + widget**

At the top of the component, add:

```tsx
const [turnstileToken, setTurnstileToken] = useState<string | null>(null)

// Inject Turnstile script once (module-level callback)
useEffect(() => {
  if (document.querySelector('script[data-turnstile]')) return
  const s = document.createElement('script')
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
  s.async = true
  s.defer = true
  s.setAttribute('data-turnstile', 'true')
  document.head.appendChild(s)
  // Expose callback on window for data-callback attribute to find
  ;(window as any).onTurnstileVerify = (token: string) => setTurnstileToken(token)
  ;(window as any).onTurnstileExpire = () => setTurnstileToken(null)
}, [])
```

Inside the form JSX, right above the submit button, render:

```tsx
<div
  className="cf-turnstile"
  data-sitekey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
  data-callback="onTurnstileVerify"
  data-expired-callback="onTurnstileExpire"
  data-theme="light"
/>
```

Update the submit button:

```tsx
<button
  type="submit"
  disabled={!turnstileToken || submitting}
  className={...existing classes...}
>
  {turnstileToken ? 'Enviar cotización' : 'Completá el captcha'}
</button>
```

Update the `fetch('/api/quotes/submit', ...)` call to include the token:

```tsx
body: JSON.stringify({
  // ...existing fields...
  turnstileToken,
})
```

After successful submit, reset the token:

```tsx
setTurnstileToken(null)
;(window as any).turnstile?.reset()
```

- [ ] **Step 3: Build-check**

```bash
npm run build
```

Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add src/components/PublicSiteEnhanced.tsx
git commit -m "feat(ui): add Cloudflare Turnstile captcha to quote form"
```

---

### Task 17: OTP constant-time response

**Files:**
- Modify: `api/auth/otp.ts`

- [ ] **Step 1: Add timing equalization wrapper**

At the very top of the handler body, record `startedAt`. Wrap all returns to respect a minimum duration.

Replace the handler structure:

```typescript
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startedAt = Date.now()
  const MIN_RESPONSE_MS = 400

  const sendResponse = async (status: number, body: any) => {
    const elapsed = Date.now() - startedAt
    const wait = Math.max(0, MIN_RESPONSE_MS - elapsed)
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    return res.status(status).json(body)
  }

  // CORS headers (unchanged)
  // ...

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return sendResponse(405, { error: 'Method not allowed' })

  // Replace every res.status(X).json(Y) in the rest of this handler with
  // `return sendResponse(X, Y)` — except the OPTIONS 204 short-circuit.
}
```

Carefully walk through the rest of the function body and replace each `res.status(X).json(Y)` (within the handler, not in helper functions like `sendOTPEmail`) with `return sendResponse(X, Y)`.

- [ ] **Step 2: Add IP-based rate limit on `request`**

Inside the `action === 'request'` branch, right after the existing email-based rate limit:

```typescript
const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown'
const ipLimit = await checkRateLimit(`otp-ip:${ip}`)
if (ipLimit.limited) {
  return sendResponse(429, { error: `Demasiadas solicitudes. Reintentá más tarde.` })
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add api/auth/otp.ts
git commit -m "feat(auth): OTP constant-time response + per-IP rate limit"
```

---

### Task 18: Add CSP + remove X-XSS-Protection in `vercel.json`

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Replace the headers block**

Replace the entire `headers` section with:

```json
"headers": [
  {
    "source": "/(.*)",
    "headers": [
      { "key": "X-Frame-Options", "value": "DENY" },
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
      { "key": "X-DNS-Prefetch-Control", "value": "off" },
      { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
      { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; connect-src 'self' https://*.supabase.co https://api.emailjs.com https://challenges.cloudflare.com https://docs.google.com; img-src 'self' data: blob: https://*.supabase.co; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" }
    ]
  }
],
```

(`X-XSS-Protection` removed — deprecated; CSP replaces it.)

- [ ] **Step 2: Validate JSON**

```bash
node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('vercel.json','utf8')), null, 2))" | head -20
```

Expected: Pretty-printed JSON. No SyntaxError.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "feat(infra): add strict CSP, drop deprecated X-XSS-Protection"
```

---

### Task 19: Update `.env.example` with new vars

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Replace the entire file**

```env
# ─── Supabase ────────────────────────────────────────────────────────
SUPABASE_URL=https://xxxxx.supabase.co

# SERVER-ONLY key — bypasses RLS.
# NEVER expose this to the browser. Get it from Supabase dashboard →
# Project Settings → API → service_role (SECRET).
SUPABASE_SERVICE_ROLE_KEY=<paste-service-role-key-here>

# ─── Admin credentials ───────────────────────────────────────────────
# Password stored as a bcrypt hash (NOT sha256).
# Generate: node -e "require('bcryptjs').hash('your-password', 12).then(h => console.log(h))"
ADMIN_USER=admin
ADMIN_PASS_HASH=<paste-bcrypt-hash-here>

# ─── JWT secret (random 64+ chars) ───────────────────────────────────
# Generate: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=<paste-64-char-hex-here>

# ─── Cron authentication (mandatory) ─────────────────────────────────
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
CRON_SECRET=<paste-cron-secret-here>

# ─── Cloudflare Turnstile (captcha) ──────────────────────────────────
# Create site at https://dash.cloudflare.com → Turnstile. Use "Managed" challenge.
TURNSTILE_SECRET_KEY=<secret-key-from-cloudflare>
VITE_TURNSTILE_SITE_KEY=<public-site-key-from-cloudflare>

# ─── Client accounts (JSON array) ────────────────────────────────────
# Each client: { email, name, company, clientePattern }
# clientePattern must be ≥5 chars; multiple comma-separated patterns are allowed.
CLIENTS_JSON=[{"email":"cliente@example.com","name":"Juan","company":"Empresa SRL","clientePattern":"EMPRESA"}]

# ─── EmailJS (server-side, for OTP and quotes) ───────────────────────
EMAILJS_SERVICE_ID=service_xxxxx
EMAILJS_TEMPLATE_OTP=template_xxxxx
EMAILJS_TEMPLATE_QUOTE=template_xxxxx
EMAILJS_PUBLIC_KEY=your-public-key
EMAILJS_PRIVATE_KEY=your-private-key

QUOTE_TO_EMAIL=bridvanovich@twf.uy

# ─── CORS origin ─────────────────────────────────────────────────────
ALLOWED_ORIGIN=https://twf.uy

# ─── Google Sheets source ────────────────────────────────────────────
GOOGLE_SHEETS_CSV_URL=https://docs.google.com/spreadsheets/d/e/TU-ID/pub?output=csv
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: update .env.example with service-role key, bcrypt, CRON_SECRET, Turnstile"
```

---

## Phase 5 — Migration doc + final verification

### Task 20: Write `SECURITY_MIGRATION.md`

**Files:**
- Create: `SECURITY_MIGRATION.md`

- [ ] **Step 1: Create the file**

```markdown
# TWF Security Migration — Deploy Guide

This guide walks through deploying the security-hardening branch
(`security/twf-critical-high`) to production. Follow the steps in order.

## 1. Prerequisites

### Cloudflare Turnstile (free)
1. Go to https://dash.cloudflare.com → Turnstile → Add Site.
2. Hostnames: your Vercel domain (e.g. `twf.vercel.app`) + custom domain if any.
3. Widget mode: **Managed**.
4. Save. Note the **Site key** (public) and **Secret key** (server-only).

### Generate secrets locally

```bash
# Admin password bcrypt hash
node -e "require('bcryptjs').hash('YOUR_STRONG_ADMIN_PASSWORD', 12).then(h => console.log(h))"
# → copy the $2a$12$... or $2b$12$... output

# CRON_SECRET (32 bytes hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# → copy the 64-char hex output

# JWT_SECRET (if you don't already have one ≥32 chars)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Grab Supabase service role key
Supabase dashboard → Project Settings → API → **service_role** (not anon).
This key is SECRET. Never commit it. Never send it to the browser.

## 2. Supabase SQL migration

In Supabase dashboard → SQL Editor → New Query:

1. Paste the full contents of `supabase-schema.sql` (from this branch) → Run.
2. Verify RLS is on:
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';
   ```
   All rows should show `rowsecurity = true`.
3. Wipe legacy partner password hashes (one-time — we have no real partners yet):
   ```sql
   UPDATE partner_users SET password_hash = '' WHERE password_hash != '';
   ```
4. Optional sanity check: confirm anon can read nothing.
   ```bash
   curl "https://YOUR-PROJECT.supabase.co/rest/v1/quotes?select=*" \
     -H "apikey: $SUPABASE_ANON_KEY"
   # Expected: [] or RLS-blocked error.
   ```

## 3. Vercel environment variables

Vercel dashboard → Project → Settings → Environment Variables.

| Action | Variable | Value | Scope |
|--------|----------|-------|-------|
| **Remove** | `SUPABASE_ANON_KEY` | — | all |
| **Add** | `SUPABASE_SERVICE_ROLE_KEY` | service_role from Supabase | Production + Preview |
| **Update** | `ADMIN_PASS_HASH` | the new bcrypt hash (starts with `$2a$12$` or `$2b$12$`) | Production + Preview |
| **Add** | `CRON_SECRET` | 64-char hex | Production + Preview |
| **Add** | `TURNSTILE_SECRET_KEY` | from Cloudflare | Production + Preview |
| **Add** | `VITE_TURNSTILE_SITE_KEY` | from Cloudflare | Production + Preview |

Leave `JWT_SECRET`, `EMAILJS_*`, `CLIENTS_JSON`, `GOOGLE_SHEETS_CSV_URL`, `ALLOWED_ORIGIN` unchanged.

## 4. Deploy

1. Merge branch `security/twf-critical-high` → `main`.
2. Vercel auto-deploys.
3. Wait for the production deploy to go green.

## 5. Smoke test — in production

Run through this list. Each should PASS.

- [ ] **Admin login** — log in with the new password at `/admin`.
- [ ] **OTP for valid client** — request OTP, email arrives, verify, dashboard loads.
- [ ] **OTP for unknown email** — no email sent; response still returns `{sent:true}`; response time is roughly similar to a valid email (±200ms).
- [ ] **Quote form without captcha** — open DevTools, submit via `fetch()` without `turnstileToken` → 400 "Captcha requerido".
- [ ] **Quote form with captcha** — submit via UI → 200, email received at `bridvanovich@twf.uy`, record in `quotes` table.
- [ ] **Tracking valid REF** — `/api/tracking?q=A7509` (replace with a real REF) → 200 with results.
- [ ] **Tracking invalid format** — `/api/tracking?q=ABC` → 400 "Formato inválido".
- [ ] **Tracking substring** — `/api/tracking?q=A7` → 400 (no longer accepts substrings).
- [ ] **Tracking rate limit** — hit the endpoint 35 times in a minute → 429 Retry-After.
- [ ] **Partner create → login → deactivate → verify-session rejects** — via admin UI.
- [ ] **Cron endpoint without auth** — `curl https://twf.../api/notifications/check-pending` → 401.
- [ ] **Cron endpoint with auth** — `curl -H "Authorization: Bearer $CRON_SECRET" https://twf.../api/notifications/check-pending` → 200.
- [ ] **Anonymous Supabase access** — `curl https://XX.supabase.co/rest/v1/quotes -H "apikey: $ANON_KEY"` → empty or forbidden.
- [ ] **CSP header present** — `curl -sI https://twf.../` | grep -i content-security-policy` → returns the CSP string.
- [ ] **Settings write rejected** — DevTools: try `fetch('/api/data/settings',{method:'PUT',headers:{'content-type':'application/json','authorization':'Bearer '+localStorage.token},body:JSON.stringify({key:'__evil',value:{}})})` → 400.

## 6. Rollback (if something breaks)

- **Vercel revert:** Vercel dashboard → Deployments → previous deploy → Redeploy. ~30s.
- **Disable RLS (emergency):** in Supabase SQL Editor:
  ```sql
  ALTER TABLE quotes DISABLE ROW LEVEL SECURITY;
  ALTER TABLE documents DISABLE ROW LEVEL SECURITY;
  ALTER TABLE reports DISABLE ROW LEVEL SECURITY;
  ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
  ALTER TABLE shipments_cache DISABLE ROW LEVEL SECURITY;
  ALTER TABLE clients DISABLE ROW LEVEL SECURITY;
  ALTER TABLE partner_users DISABLE ROW LEVEL SECURITY;
  ALTER TABLE otp_codes DISABLE ROW LEVEL SECURITY;
  ALTER TABLE rate_limits DISABLE ROW LEVEL SECURITY;
  ALTER TABLE origin_photos DISABLE ROW LEVEL SECURITY;
  ALTER TABLE notification_tasks DISABLE ROW LEVEL SECURITY;
  ```
- **Restore anon key (emergency):** re-add `SUPABASE_ANON_KEY` in Vercel env, revert `api/_lib/supabase.ts` to use it. Combined with RLS off, restores old behavior.

## 7. Out of scope (follow-up sub-project)

After this deploy and a second security review, the next pass covers:
- HttpOnly cookie JWTs (vs current sessionStorage)
- Cursor-based pagination (vs `.limit(500)` safety cap)
- Move `fileData` base64 out of `localStorage` in admin
- Audit log for admin mutations
- JWT key rotation with `kid` header
- Tighter CSP (remove `'unsafe-inline'` style)
```

- [ ] **Step 2: Commit**

```bash
git add SECURITY_MIGRATION.md
git commit -m "docs: add SECURITY_MIGRATION.md deploy guide"
```

---

### Task 21: Final verification (local dev server)

**Files:**
- None (verification only)

- [ ] **Step 1: Run all unit tests**

```bash
npm run test:run
```

Expected: All tests PASS. No failures.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: 0 errors.

- [ ] **Step 3: Lint**

```bash
npm run lint
```

Expected: No errors (warnings are OK).

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: Clean build. `dist/` generated.

- [ ] **Step 5: Verify no `SUPABASE_ANON_KEY` leaked to client bundle**

```bash
grep -r "SUPABASE_ANON_KEY\|service_role" dist/ || echo "clean"
```

Expected: "clean" (neither string should appear in the client bundle).

- [ ] **Step 6: Verify no `createHash` / `sha256` for password hashing anywhere**

```bash
grep -rn "createHash" api/ src/ | grep -v otpStore.ts | grep -v node_modules || echo "no password sha256"
```

Expected: "no password sha256" (otpStore uses sha256 for hashing the OTP code, which is fine — that's not user password storage).

- [ ] **Step 7: Verify every write handler has validation**

```bash
grep -A 2 "method === 'POST'\|method === 'PUT'\|method === 'PATCH'" api/data/\[entity\].ts | grep -c "validate\|validateBatch"
```

Expected: count ≥ number of POST/PUT/PATCH branches (currently ~12).

- [ ] **Step 8: Run quick manual smoke on localhost**

In one terminal:

```bash
# Set minimal env vars for local dev (replace placeholders)
cp .env.example .env.local
# ... fill in real values in .env.local
npm run dev
```

In a browser at http://localhost:5173/ :
- Navigate to admin login. Enter wrong credentials → 401.
- Navigate to quote form. Submit without filling captcha → button disabled.
- Try tracking with `q=ABC` → 400.
- Try tracking with valid REF → results.

No crashes, no console errors.

- [ ] **Step 9: Mark plan complete**

```bash
git log --oneline origin/main..HEAD
# Should show ~20 commits on this branch
```

- [ ] **Step 10: Create PR**

```bash
git push -u origin security/twf-critical-high
gh pr create --title "Security hardening: critical + high findings (2026-04-18 audit)" --body "$(cat <<'EOF'
## Summary
- Enables Supabase RLS + switches API to service-role key (fixes C1)
- Migrates admin + partner passwords from SHA-256 to bcrypt (fixes C2)
- Tightens /api/tracking to exact-match + IP rate limit (fixes C3)
- Adds missing tables origin_photos + notification_tasks to schema (fixes C4)
- Wraps every write endpoint in Zod validation + settings allowlist + .limit(500) safety cap (fixes H1, H2)
- Adds Cloudflare Turnstile + IP rate limit to /api/quotes/submit (fixes H3)
- Adds strict CSP header to vercel.json (fixes H4)
- Equalizes OTP response timing to prevent email enumeration (fixes H5)
- Makes CRON_SECRET mandatory for /api/notifications/check-pending (fixes H6)
- Adds SECURITY_MIGRATION.md with full deploy + rollback guide

Spec: `docs/superpowers/specs/2026-04-18-twf-security-critical-high-design.md`
Plan: `docs/superpowers/plans/2026-04-18-twf-security-critical-high.md`

## Test plan
- [ ] All new unit tests pass (`npm run test:run`)
- [ ] Typecheck clean (`npx tsc --noEmit`)
- [ ] Build succeeds (`npm run build`)
- [ ] Deploy preview smoke tests in SECURITY_MIGRATION.md pass

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

---

## Self-review notes

Covered (vs spec section reference):

- Spec §4 Phase 1 (DB hardening) → Task 1
- Spec §4 Phase 2 (auth upgrade) → Tasks 2, 3, 4, 5, 6, 7
- Spec §4 Phase 3 (Zod validation) → Tasks 8, 9, 10, 11, 12
- Spec §4 Phase 4 (rate limits, captcha, CSP, OTP timing, pagination) → Tasks 13, 14, 15, 16, 17, 18
- Spec §4 Phase 5 (migration doc + verify) → Tasks 19, 20, 21
- Spec §5 (dependencies): bcrypt, vitest → Task 0
- Spec §6 (env vars): Task 19
- Spec §7 (rollback): documented in SECURITY_MIGRATION.md §6
- Spec §8 (out-of-scope): documented in SECURITY_MIGRATION.md §7
