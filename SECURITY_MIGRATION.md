# TWF Security Migration — Deploy Guide

Follow this guide to deploy the `security/twf-critical-high` branch to production. It closes all 4 Critical + 6 High severity findings from the 2026-04-18 security audit.

## 0. Safety snapshot before deploy

**Before changing anything** in Vercel env vars, copy these values to a secure scratch file (not in git):
- Current `ADMIN_PASS_HASH` (the old SHA-256 one — only needed if you need to roll back).
- Current `SUPABASE_ANON_KEY` (needed for emergency rollback if RLS policies break the API).

Having these around makes the rollback in §6 a 30-second operation instead of a scramble.

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
# → copy the $2a$12$... (or $2b$12$...) output

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
3. Wipe legacy partner password hashes (one-time — no real partners yet, so zero-impact):
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

1. Push branch `security/twf-critical-high` → open PR.
2. Vercel auto-builds a **preview** deployment. Smoke-test there first (see §5).
3. Merge PR to `main`.
4. Vercel auto-deploys to production.

## 5. Smoke test — in production (or preview first)

Run through this list. Each should PASS.

- [ ] **Admin login** — log in with the new password at `/admin`.
- [ ] **OTP for valid client** — request OTP, email arrives, verify, dashboard loads.
- [ ] **OTP for unknown email** — no email sent; response still returns `{sent:true}`; response time is roughly similar to a valid email (±200 ms due to constant-time wrapper).
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

## 6b. Known CSP deviation

The deployed `Content-Security-Policy` keeps `'unsafe-inline'` in `script-src` to support the existing Google Analytics bootstrap (inline snippet loaded from `src/lib/analytics.ts`). This is a **weaker** position than the ideal (strict nonce/hash-based CSP).

Trade-off: removes XSS defense-in-depth for inline scripts, but retained because GA is in active use and nonce/hash-based loading requires changing how GA is bootstrapped. Documented here as an explicit deviation from the spec's "script-src 'self' https://challenges.cloudflare.com" target.

**Follow-up:** migrate GA loading to use a nonce or external-only script and then tighten `script-src` to remove `'unsafe-inline'`. This is on the out-of-scope list below.

## 7. Out of scope (follow-up sub-project)

After this deploy and a second security review, the next pass covers:
- HttpOnly cookie JWTs (vs current sessionStorage).
- Cursor-based pagination (vs `.limit(500)` safety cap).
- Move `fileData` base64 out of `localStorage` in admin.
- Audit log for admin mutations.
- JWT key rotation with `kid` header.
- Tighter CSP: migrate GA to nonce-based loading, then remove `'unsafe-inline'` from script-src (see §6b). Also tighten style-src.

## 8. What changed (summary for the changelog)

**Critical fixes (4):**
- Supabase RLS enabled on every table + API switched to service-role key (C1).
- Admin + partner passwords migrated from SHA-256 to bcrypt cost 12 (C2).
- `/api/tracking` requires exact REF/container/MBL format + IP rate limit (C3).
- `origin_photos` + `notification_tasks` tables added to schema (C4).

**High fixes (6):**
- Zod validation on every POST/PUT/PATCH endpoint (H1).
- `matchesClientePattern` uses word-boundary match + 5-char minimum (H2).
- Quote form requires Cloudflare Turnstile captcha + IP rate limit (3/h) (H3).
- Strict `Content-Security-Policy` header added (H4).
- OTP response time equalized (constant-time wrapper, 400 ms min) (H5).
- `CRON_SECRET` made mandatory (fail-closed) (H6).

**Extras:**
- `X-XSS-Protection` header dropped (deprecated; CSP replaces it).
- `unsafe-eval` removed from script-src CSP.
- `.limit(500)` safety cap on every admin list read.
- `verify-session` cross-checks partner `active=true` status.
- Vitest infrastructure + 34+ unit tests covering password, schemas, csvParser, rateLimiter.
- Full deploy guide (this file).
