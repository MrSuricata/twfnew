# TWF Security Hardening — Critical + High (2026-04-18)

**Scope:** Close all Critical and High severity findings from the 2026-04-18 security audit of the TWF web app.
**Out of scope:** Medium and Low findings (tracked for a follow-up sub-project after a second security review).
**Branch:** `security/twf-critical-high` (new, off current `claude/party-game-subscription-oVUul` or off `main` — decided at implementation time).
**Production status:** App has no real users yet. No backward-compat required. Big-bang migration on deploy.

---

## 1. Background

The 2026-04-18 audit found 4 Critical and 6 High severity issues in `twfnew/` (React 19 + TS + Vite + Supabase + Vercel serverless):

1. **Critical C1:** Row-Level Security disabled on every Supabase table; server uses `SUPABASE_ANON_KEY`.
2. **Critical C2:** Raw unsalted SHA-256 for admin and partner passwords.
3. **Critical C3:** Public `/api/tracking` endpoint allows bulk enumeration via 3-char substring match.
4. **Critical C4:** `origin_photos` and `notification_tasks` tables are queried but missing from `supabase-schema.sql`.
5. **High H1:** No server-side input validation (no Zod) on any POST/PUT/PATCH.
6. **High H2:** `matchesClientePattern` uses substring match — one client can match another's data.
7. **High H3:** Quote form unauthenticated, no captcha, no rate limit.
8. **High H4:** No Content-Security-Policy header.
9. **High H5:** OTP enumeration via timing side-channel on `/api/auth/otp`.
10. **High H6:** `CRON_SECRET` check skipped when env var unset.

## 2. Goals

- Close all 10 findings listed above.
- No behavior regression for already-working flows (login admin, OTP flow, public tracking by exact REF, partner dashboards, quote submission with captcha).
- Production deploy should be a single atomic switch (new env vars + new schema + new code).
- Migration doc for Brian to follow step-by-step.

## 3. Non-Goals

- JWT rotation / refresh / HttpOnly cookies (Medium — follow-up).
- Replacing `sessionStorage` token with HttpOnly cookie (Medium — follow-up).
- Pagination of admin reads beyond a hard `.limit(500)` safety cap (Medium — follow-up).
- Moving `fileData` out of `localStorage` (Medium — follow-up).
- Replacing EmailJS with a proper transactional provider (product decision — follow-up).
- Any UX/UI changes. Dead-code deletion. i18n. Dark mode. (Those belong to Sub-project B.)

## 4. Architecture — 5 Phases

### Phase 1 — Database hardening

**File:** `supabase-schema.sql` (full rewrite to be idempotent)
**Supabase action:** Brian runs the new script in Supabase SQL Editor.

Changes:

1. Create missing tables:
   - `origin_photos` (id, shipment_ref, container_number, caption, photo_type, file_name, file_type, file_data, thumbnail_data, created_at_ts, created_by, created_at)
   - `notification_tasks` (id, shipment_ref, container_number, operativa, cliente, client_email, client_name, step, step_number, due_date, salida_date, photos_ok, report_ok, email_sent, email_sent_at, email_thread_id, email_subject, status, notes, created_at, updated_at)
   - `otp_codes` (already documented in `otpStore.ts` comment — make explicit in schema file)
   - `rate_limits` (already documented in `rateLimiter.ts` comment — make explicit)
2. Indexes on `origin_photos(shipment_ref)`, `notification_tasks(due_date, status)`, `otp_codes(expires_at)`, `rate_limits(blocked_until)`.
3. **Enable RLS on every table**: `ALTER TABLE <t> ENABLE ROW LEVEL SECURITY`.
4. **Blanket deny policy** for the `anon` role on every table: `CREATE POLICY "deny_anon" ON <t> FOR ALL TO anon USING (false) WITH CHECK (false)`.
5. No policies for `authenticated` — we don't use Supabase Auth for app logins, so `authenticated` role is unused.
6. Grant `service_role` full access via policy `CREATE POLICY "allow_service_role" ON <t> FOR ALL TO service_role USING (true) WITH CHECK (true)` (service_role bypasses RLS by default, but explicit policies help if bypass ever changes).
7. Comment block at top documenting: "API uses SUPABASE_SERVICE_ROLE_KEY. Never ship that key to the browser."

Acceptance: After running the new schema, an anonymous request with the anon key to any table returns an empty/denied result. The service-role-key request continues to work.

### Phase 2 — Server auth upgrade (bcrypt + service role + missing checks)

**Files:**
- `api/_lib/supabase.ts` — switch to `SUPABASE_SERVICE_ROLE_KEY`
- `api/_lib/password.ts` — **new** — bcrypt wrappers
- `api/auth/admin-login.ts` — use bcrypt
- `api/data/[entity].ts` — use bcrypt for partner password hash
- `api/auth/verify-session.ts` — check partner `active=true`
- `api/notifications/[action].ts` — `CRON_SECRET` mandatory
- `.env.example` — document new vars
- `package.json` — add `bcrypt`, `@types/bcrypt`

Changes:

1. `api/_lib/supabase.ts`:
   ```ts
   const key = process.env.SUPABASE_SERVICE_ROLE_KEY
   if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured')
   ```
   Drop `SUPABASE_ANON_KEY` entirely — it's never used again on server.

2. `api/_lib/password.ts` (new):
   ```ts
   import bcrypt from 'bcrypt'
   const COST = 12
   export async function hashPassword(plain: string): Promise<string> { return bcrypt.hash(plain, COST) }
   export async function verifyPassword(plain: string, hash: string): Promise<boolean> { return bcrypt.compare(plain, hash) }
   ```

3. `api/auth/admin-login.ts`:
   - Replace `createHash('sha256')...` with `await verifyPassword(password, adminPassHash)`.
   - Rename env var in code: `ADMIN_PASS_HASH` (keep name, but it now holds a bcrypt hash).
   - Partner login branch: same swap — `await verifyPassword(password, user.password_hash)`.

4. `api/data/[entity].ts` → `handlePartnerUsers`:
   - Replace `hashPw()` with `await hashPassword(password)` on POST and PATCH.

5. `api/auth/verify-session.ts`:
   - For `depot` / `transport` roles, after decoding JWT, query `partner_users` by email. If `active !== true` OR row missing → return 401.
   - For `admin` and `client` roles, no extra check (admin pass is in env, client OTP already single-use).

6. `api/notifications/[action].ts:267-271`:
   ```ts
   const cronSecret = process.env.CRON_SECRET
   if (!cronSecret) {
     console.error('[check-pending] CRON_SECRET not set')
     return res.status(500).json({ error: 'Server misconfigured' })
   }
   if (authHeader !== `Bearer ${cronSecret}`) return res.status(401).json({ error: 'Unauthorized' })
   ```

7. `.env.example`:
   - Remove `SUPABASE_ANON_KEY`, add `SUPABASE_SERVICE_ROLE_KEY` with warning "SERVER ONLY — never expose to the browser".
   - Change `ADMIN_PASS_HASH` comment: "Generate hash: `node -e "require('bcrypt').hash('your-password', 12).then(h => console.log(h))"`".
   - Add `CRON_SECRET=<random-32-char>` with generation command.
   - Add `TURNSTILE_SECRET_KEY=<from-cloudflare-dashboard>` and `VITE_TURNSTILE_SITE_KEY=<public>` (for Phase 4).

8. Migration for existing data (schema changes, not code):
   - Wipe `partner_users.password_hash`: `UPDATE partner_users SET password_hash = '' WHERE password_hash != ''`.
   - Admin recreates partners from the dashboard after deploy (no partners exist today, so effectively zero-impact).

Acceptance: Admin logs in with bcrypt hash. Partner creation writes a bcrypt hash. Session restore for deactivated partner returns 401. Cron hits without `CRON_SECRET` env return 500; with it, verified header passes.

### Phase 3 — Server-side input validation (Zod)

**Files:**
- `api/_lib/schemas.ts` — **new** — centralized Zod schemas + `validate()` helper
- `api/data/[entity].ts` — wrap every POST/PUT/PATCH body in `validate(schema, body)`
- `api/quotes/submit.ts` — validate body
- `api/auth/admin-login.ts` — validate body
- `api/auth/otp.ts` — validate body
- `api/_lib/csvParser.ts` — fix `matchesClientePattern`

Changes:

1. `api/_lib/schemas.ts` exports schemas for:
   - `QuoteSubmitSchema` — name (1–100 chars), email (email, max 200), phone (max 40, optional), cargoType (enum or string ≤100), origin/destination (max 200), details (max 2000, stripped HTML), language (ISO-639).
   - `QuoteRowSchema` — admin-synced quote row with id and status enum.
   - `ClientRowSchema` — id, email, name (min 2), company, clientePattern (min 5 chars, uppercase letters/digits/commas only).
   - `SettingsUpsertSchema` — `{ key: z.enum(SETTINGS_ALLOWLIST), value: z.unknown() }`. **Settings allowlist defaults to `[]` (empty)** because no code path in the current app actually writes settings (dataClient's `saveSetting` is exported but unused — confirmed via grep). All writes return 400 until a key is explicitly added to `SETTINGS_ALLOWLIST` by a future feature. GET remains open (read-only behavior unchanged).
   - `PartnerUserCreateSchema` — email, name, password (min 10 chars, pattern), role enum, filterValue (min 2).
   - `DocumentRowSchema`, `ReportRowSchema`, `OriginPhotoRowSchema`, `NotificationTaskRowSchema`.
   - `AdminLoginSchema` — username, password (min 1, max 200).
   - `OtpRequestSchema`, `OtpVerifySchema`.

2. Helper:
   ```ts
   export function validate<T>(schema: z.ZodSchema<T>, body: unknown): { ok: true; data: T } | { ok: false; error: string } {
     const r = schema.safeParse(body)
     if (!r.success) return { ok: false, error: r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }
     return { ok: true, data: r.data }
   }
   ```

3. Wrap every handler. Example pattern:
   ```ts
   const parsed = validate(QuoteSubmitSchema, req.body)
   if (!parsed.ok) return res.status(400).json({ error: parsed.error })
   const { name, email, ... } = parsed.data
   ```

4. `handleSettings` specifically: after Zod validates shape, double-check `key` is in `SETTINGS_ALLOWLIST` constant. Any rejection logged (not thrown with stack) and returns 400.

5. `matchesClientePattern` fix (`api/_lib/csvParser.ts`):
   ```ts
   export function matchesClientePattern(cliente: string, pattern: string): boolean {
     if (!cliente || !pattern) return false
     const clienteUpper = cliente.toUpperCase()
     const patterns = pattern.toUpperCase().split(',').map(p => p.trim()).filter(p => p.length >= 5)
     if (patterns.length === 0) return false
     // Word-boundary match: pattern must appear between non-alphanumeric boundaries or string start/end
     return patterns.some(p => {
       const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
       const re = new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`)
       return re.test(clienteUpper)
     })
   }
   ```
   Patterns shorter than 5 chars are silently dropped. Regex is compiled per-call (cheap) and escapes regex metacharacters in the pattern.

6. Ban HTML/control chars in quote `details` server-side before storing: simple `.replace(/<[^>]*>/g, '')` strip. Cap at 2000 chars.

Acceptance: POST `/api/data/settings {key: "__evil", value: {...}}` returns 400. POST `/api/data/clients {clientePattern: "AC"}` returns 400. POST `/api/quotes/submit {email: "not-an-email"}` returns 400. Existing valid shapes still pass through unchanged.

### Phase 4 — Rate limits, captcha, CSP, OTP timing, pagination safety cap

**Files:**
- `api/_lib/rateLimiter.ts` — extend with configurable limits (already supports keys; add `checkRateLimitWithConfig`)
- `api/tracking.ts` — exact match + rate limit
- `api/quotes/submit.ts` — rate limit + Turnstile verify
- `api/auth/otp.ts` — constant-time response
- `vercel.json` — CSP header
- `src/components/PublicSiteEnhanced.tsx` — render Turnstile widget on quote form
- `api/data/[entity].ts` — add `.limit(500)` to every list read
- `package.json` — no new deps (Turnstile is verified via plain `fetch`)

Changes:

1. **Rate limiter** (`api/_lib/rateLimiter.ts`): add `checkRateLimitWithConfig(key, maxAttempts, windowMs, blockMs)`. Keep existing `checkRateLimit()` as a wrapper calling the new one with the current defaults (5/15min/30min).

2. **Tracking endpoint** (`api/tracking.ts`):
   - Replace `q.length < 3` with exact-pattern validation:
     ```ts
     const REF_RE = /^A?\d{4,5}$/i           // TWF ref pattern like A7509 or 7509
     const CNTR_RE = /^[A-Z]{4}\d{7}$/i      // ISO container: MSCU1234567
     const MBL_RE = /^[A-Z0-9]{9,16}$/i      // MBL/bill of lading
     if (!REF_RE.test(q) && !CNTR_RE.test(q) && !MBL_RE.test(q)) {
       return res.status(400).json({ error: 'Formato inválido. Ingresá referencia TWF, container (ISO) o MBL.' })
     }
     ```
   - Replace `.includes(q)` with `=== q.toUpperCase()` on the filter.
   - Add rate limit per IP: `checkRateLimitWithConfig(`tracking:${ip}`, 30, 60*60_000, 60*60_000)` — 30 queries per hour, block for 1 hour.
   - On limited: return 429 with `Retry-After` header.

3. **Quote form** (`api/quotes/submit.ts` + `PublicSiteEnhanced.tsx`):
   - Server: require `turnstileToken` in body. Verify at `https://challenges.cloudflare.com/turnstile/v0/siteverify` with `TURNSTILE_SECRET_KEY`. If verification fails or `success !== true`, return 400. Rate limit per IP: 3 submissions per hour (block 24h).
   - Client (`PublicSiteEnhanced.tsx`): inject `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer>` once via a `useEffect` hook. Render `<div className="cf-turnstile" data-sitekey={import.meta.env.VITE_TURNSTILE_SITE_KEY} data-callback="onTurnstileVerify" />` inside the quote form. Store the token via a `window.onTurnstileVerify = (token) => setTurnstileToken(token)` callback. Submit button `disabled` while `turnstileToken` is null. **No new client dep** — vanilla script approach keeps bundle lean.

4. **OTP constant-time** (`api/auth/otp.ts`):
   - Wrap both `request` and `verify` action handlers: record `startedAt = Date.now()` at entry, ensure total execution time ≥ 400 ms before `return res.status(...)`. Use `await new Promise(r => setTimeout(r, Math.max(0, 400 - (Date.now() - startedAt))))`.
   - Additionally: on `request`, add IP rate limit (`otp-ip:${ip}` 5/hour) in addition to the existing email rate limit.

5. **CSP header** (`vercel.json`):
   - Add:
     ```
     { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; connect-src 'self' https://*.supabase.co https://api.emailjs.com https://challenges.cloudflare.com https://docs.google.com; img-src 'self' data: blob: https://*.supabase.co; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" }
     ```
   - Keep `X-Frame-Options: DENY` (legacy compat).
   - Remove `X-XSS-Protection` (deprecated).

6. **Pagination safety cap** (`api/data/[entity].ts`):
   - Append `.limit(500)` to every list read: `handleQuotes` GET-all, `handleDocuments` GET-list, `handleReports` GET-list, `handleClients` GET, `handleOriginPhotos` GET-list, `handleNotificationTasks` GET, `handlePartnerUsers` GET.
   - Single-row GETs (`?id=` queries) keep `.single()` — no limit needed.
   - This is a hard safety cap only (prevents accidental 10k-row reads). Real cursor pagination is a Medium follow-up.

Acceptance: Tracking with `q=ABC` returns 400. Tracking with valid container matches only exact. Quote without Turnstile token returns 400. OTP request for a non-client takes ~same time as for a valid client (measured). CSP blocks an inline `<script>` injected in dev tools. Admin list reads return max 500 rows.

### Phase 5 — Migration doc + verify manual

**Files:**
- `SECURITY_MIGRATION.md` — **new**, in repo root
- `docs/superpowers/plans/<plan-file>.md` — implementation checklist (created by writing-plans skill)

Contents of `SECURITY_MIGRATION.md`:

1. **Before deploy**
   - Create Cloudflare Turnstile site (free), note `TURNSTILE_SECRET_KEY` + `VITE_TURNSTILE_SITE_KEY`.
   - Generate new admin bcrypt hash: `node -e "require('bcrypt').hash('YOUR_ADMIN_PASSWORD', 12).then(h => console.log(h))"`.
   - Generate `CRON_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - Grab `SUPABASE_SERVICE_ROLE_KEY` from Supabase dashboard → Project Settings → API → service_role (SECRET — never commit).

2. **In Supabase dashboard**
   - SQL Editor → paste the new `supabase-schema.sql` → Run.
   - Verify: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';` — all rows should have `rowsecurity = true`.
   - `UPDATE partner_users SET password_hash = '' WHERE password_hash != '';` (one-time wipe — zero-impact since no partners in use).

3. **In Vercel dashboard** — Project Settings → Environment Variables:
   - **Remove** `SUPABASE_ANON_KEY`.
   - **Add** `SUPABASE_SERVICE_ROLE_KEY` (Production only).
   - **Update** `ADMIN_PASS_HASH` to the new bcrypt hash (not sha256).
   - **Add** `CRON_SECRET`.
   - **Add** `TURNSTILE_SECRET_KEY` (server), `VITE_TURNSTILE_SITE_KEY` (client).
   - **Update** cron config in `vercel.json` so Vercel auto-passes `Authorization: Bearer $CRON_SECRET` to `/api/notifications/check-pending`.

4. **Deploy** — `git push` the `security/twf-critical-high` branch → Vercel preview deploy → manual smoke test (below) → merge to main → prod deploy.

5. **Smoke-test checklist**
   - [ ] Admin login with new password works.
   - [ ] OTP request for a known client email sends an email; for an unknown email, no email but still returns `{sent: true}` and response time is similar (±100ms).
   - [ ] Quote form rejects submit without Turnstile (dev tools: delete token). Submits fine with captcha.
   - [ ] Tracking with invalid format returns 400. Tracking with valid exact REF returns the shipment. Tracking with partial match returns nothing.
   - [ ] Create a partner user via admin, login as that partner, deactivate via admin, verify `/api/auth/verify-session` rejects.
   - [ ] Cron endpoint `curl` without Authorization header returns 401. With Authorization returns the daily summary.
   - [ ] Public request directly to Supabase (`curl https://...supabase.co/rest/v1/quotes -H "apikey: $ANON_KEY"`) returns empty/forbidden.
   - [ ] CSP header present on `/` (curl -I https://...vercel.app/).
   - [ ] DevTools console: try `fetch('/api/data/settings', {method:'PUT',headers:{'content-type':'application/json','authorization':'Bearer '+token},body:JSON.stringify({key:'__evil',value:{}})})`. Expect 400.

## 5. Dependencies added

- `bcrypt` (prod) + `@types/bcrypt` (dev) — ~1 MB, widely used, battle-tested.
- No new client dep for Turnstile (vanilla `<script>` approach).

## 6. Env vars summary

| Var | Side | Purpose | Old → New |
|-----|------|---------|-----------|
| `SUPABASE_URL` | server | Supabase project URL | unchanged |
| `SUPABASE_ANON_KEY` | server | ~~Supabase access~~ | **REMOVED** |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Supabase access (bypasses RLS) | **NEW** |
| `JWT_SECRET` | server | Sign JWTs | unchanged (≥32 chars) |
| `ADMIN_USER` | server | admin username | unchanged |
| `ADMIN_PASS_HASH` | server | admin password hash | **sha256 → bcrypt** |
| `CLIENTS_JSON` | server | client allowlist | unchanged |
| `EMAILJS_*` | server | email sending | unchanged |
| `ALLOWED_ORIGIN` | server | CORS | unchanged |
| `CRON_SECRET` | server | Vercel cron auth | **NEW (mandatory)** |
| `TURNSTILE_SECRET_KEY` | server | captcha verify | **NEW** |
| `VITE_TURNSTILE_SITE_KEY` | client | captcha render | **NEW** |
| `GOOGLE_SHEETS_CSV_URL` | server | sheet source | unchanged |

## 7. Rollback plan

Since the app has no real users and all changes are in a dedicated branch:

- **Rollback level 1 (Vercel):** Revert to previous deploy via Vercel dashboard → Redeploy previous. Takes ~30s.
- **Rollback level 2 (DB):** If RLS accidentally locks out the server (e.g., service-role policy typo), in Supabase SQL Editor: `ALTER TABLE <t> DISABLE ROW LEVEL SECURITY;` per table. Schema re-run with old version.
- **Rollback level 3 (env):** Restore `SUPABASE_ANON_KEY` (still valid in Supabase), restore old `ADMIN_PASS_HASH` — kept as a Note somewhere (not in git).

Before deploy, Brian keeps a plaintext snippet of current `ADMIN_PASS_HASH` + knows how to disable RLS from SQL Editor.

## 8. Out-of-scope (for follow-up security sub-project)

After merging this sub-project, a second audit pass will cover:
- HttpOnly cookie JWTs (vs current sessionStorage).
- Pagination with cursors (vs `.limit(500)` cap).
- `fileData` moved out of localStorage in admin dashboard.
- Audit log table for admin mutations.
- Key rotation (JWT_SECRET `kid` header).
- Extra CSP tightening (remove `'unsafe-inline'` on style after a sweep).

## 9. Open questions

**None.** Approved in-thread on 2026-04-18: bcrypt (not argon2), Cloudflare Turnstile (not hCaptcha), big-bang deploy (no backward compat), branch `security/twf-critical-high`.

---

## Deliverable file list

New:
- `api/_lib/password.ts`
- `api/_lib/schemas.ts`
- `SECURITY_MIGRATION.md`
- `docs/superpowers/specs/2026-04-18-twf-security-critical-high-design.md` (this file)

Modified:
- `supabase-schema.sql`
- `api/_lib/supabase.ts`
- `api/_lib/rateLimiter.ts`
- `api/_lib/csvParser.ts`
- `api/auth/admin-login.ts`
- `api/auth/otp.ts`
- `api/auth/verify-session.ts`
- `api/data/[entity].ts`
- `api/quotes/submit.ts`
- `api/notifications/[action].ts`
- `api/tracking.ts`
- `src/components/PublicSiteEnhanced.tsx`
- `vercel.json`
- `.env.example`
- `package.json` / `package-lock.json`
