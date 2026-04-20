# TWF — Continuation Document (2026-04-20)

**Purpose:** Anyone (including a fresh Claude session) should be able to pick up from here without losing context.

**Last worked by:** Claude Opus 4.6 (1M context). Session closed after 5 sub-projects shipped.

**Last updated:** 2026-04-20 ~15:30 UTC-3

---

## 🎯 What's live in production right now

Site: https://transitworldforwarding.vercel.app

| PR | Sub-project | Commit | Status |
|---|---|---|---|
| #7 | Security hardening (Critical+High, 24 commits) | `32c2a42` | ✅ merged + live |
| #8 | UX cleanup (dead code, dark mode, skeletons) | `d3af83c` | ✅ merged + live |
| #9 | Design tokens + PartnerDashboardShell | `615d6ad` | ✅ merged + live |
| #10 | HOY dashboard + initial cron (removed in #12) | `11a7937` | ✅ merged + live |
| #11 | Agenda tab en Portal Cliente | `262f977` | ✅ merged + live |
| #12 | Remove Vercel cron (n8n handles daily summary) | pending | 🟡 **needs merge** |

**Total:** ~50 commits merged to `main`.

---

## 🟡 Brian's pending manual actions

### Security hygiene
1. **Rotate `SUPABASE_SERVICE_ROLE_KEY`** — was shared in Claude chat on 2026-04-20. Supabase dashboard → Settings → API → Rotate service_role → update Vercel env var `SUPABASE_SERVICE_ROLE_KEY`.
2. **Change `ADMIN_PASS_HASH`** — current password is `twf2024` (weak). Generate bcrypt hash with stronger password:
   ```bash
   node -e "require('bcryptjs').hash('NEW_STRONG_PASS', 12).then(h=>console.log(h))"
   ```
   Update Vercel env var.

### Smoke tests (from browser)
3. Login admin at `/admin` with `twf2024` → verify
4. OTP client flow at `/portal` → verify email delivery
5. Open the new HOY tab in admin → verify 3 cards show today's data
6. Open Portal Cliente → Agenda tab → verify calendar renders with client's shipments only

### GitHub merges
7. **Merge PR #12** at https://github.com/MrSuricata/twfnew/pull/12 (removes Vercel cron — n8n does the daily summary now)

### n8n setup
8. In workflow **"TWF - Telegram Bot Notificaciones"** (ID `MZA1M1s2xThr2NGF`):
   - Paste the updated "Compilar Resumen" JS from the message on 2026-04-20 (includes pretty formatting with bold, pagos vencidos/hoy/esta-semana sections, llegan-hoy-puerto, checks)
   - Set Parse Mode = **Markdown** (legacy, NOT MarkdownV2) on the "Telegram - Resumen" node
   - Save + Publish

### Optional integration with Operativas sheet (follow-up)
9. Publish the **Operativas tab** of Brian's Google Sheet `1A9p1qSEt1lX4jUf0xio6e70ttvAG9QiiNa6i-3Y4fN0` as CSV (File → Share → Publish to web → specific sheet → CSV)
10. Give that URL to next Claude session → will add 2nd HTTP fetch node in n8n + update JS to include SALIENDO HOY / EN FRONTERA / LLEGANDO FISCAL sections.

---

## 🔐 Infra state reference

### Supabase project `TWF`
- ID: `ihpsdeoexkipxmaxsmrc` (us-west-2, ACTIVE)
- URL: `https://ihpsdeoexkipxmaxsmrc.supabase.co`
- 11 tables with RLS enabled + deny-anon + allow-service-role policies
- Data preserved: 10 clientes, 150 fotos, 7 reports, 6 quotes, 5 notif_tasks, 1 partner
- New tables from security migration: `origin_photos`, `notification_tasks`, `otp_codes`, `rate_limits`
- Migration applied 2026-04-20 via MCP: `security_hardening_rls_and_missing_tables`

### Vercel project `twf`
- ID: `prj_A3TqSLq6EJDXgIpuFaPzcfUNhMI7`
- Team: `team_iJoIcAEL7ALPNl7gkk6wcsis` (mrsuricatas-projects)
- Framework: Vite, Node 24.x
- Domain: `transitworldforwarding.vercel.app` (+ alias `twf.uy` if custom domain added)

### Env vars set (Brian's Vercel settings)
| Var | Status |
|---|---|
| `SUPABASE_URL` | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ **rotate recommended** |
| ~~`SUPABASE_ANON_KEY`~~ | ❌ removed (no longer used) |
| `ADMIN_USER` | ✅ (default `admin`) |
| `ADMIN_PASS_HASH` | ✅ bcrypt `$2b$12$...` for `twf2024` — **change to stronger** |
| `JWT_SECRET` | ✅ (kept from before) |
| `CRON_SECRET` | ✅ set (dormant after PR #12) |
| `TURNSTILE_SECRET_KEY` | ✅ |
| `VITE_TURNSTILE_SITE_KEY` | ✅ |
| `EMAILJS_*` | ✅ unchanged |
| `CLIENTS_JSON` | ✅ unchanged |
| `ALLOWED_ORIGIN` | ✅ unchanged |
| `GOOGLE_SHEETS_CSV_URL` | ✅ unchanged |
| `N8N_SEND_EMAIL_WEBHOOK` | ✅ set but orphaned (code no longer calls it — can remove) |
| `N8N_REMINDER_WEBHOOK` | ❌ never set, not needed (cron removed in PR #12) |

### Cloudflare Turnstile
- Site: `TWF Logistics`
- Site Key: `0x4AAAAAAC_jDaV8PsdSA0Ai` (public)
- Secret Key: stored in Vercel (should rotate since shared in screenshot)
- Hostnames configured: `transitworldforwarding.vercel.app`, `localhost`, (+ `twf.uy` if custom)

### n8n workspace `mrsuricata.app.n8n.cloud`
- Active workflows:
  - `MZA1M1s2xThr2NGF` — TWF - Telegram Bot Notificaciones (2 triggers: Telegram + Schedule 8:47am UY) → sends daily summary to chatId `6402826821`
  - `vIfs3OARM9tE8JyI` — TWF - Enviar Notificación Cliente v3 (email webhook, now orphaned since PR #10)
  - `zMrMtMLYnqzcrIgz` — Prevision Operativa TWF v5
  - `uMyofj6BTwafBFvq` — Update Tracker Clientes TWF v1
- **Backup of Telegram Bot workflow**: saved at `docs/n8n/telegram-bot-notificaciones-2026-04-20.json` in the repo
- CSV used by n8n daily summary: `https://docs.google.com/spreadsheets/d/e/2PACX-1vR1L0gDUbrXqFW_33bLA-0Gsb73x2hItsyNwUFZTHdjTlGnxO0AuE8ojBrdrtvjp0frdl8v45xCGYFM/pub?output=csv` (main tab of Sheet `1A9p1qSEt1lX4jUf0xio6e70ttvAG9QiiNa6i-3Y4fN0`, "Seguimiento General")
- Operativas tab (`gid=1133111465`) NOT yet published as CSV — needs to be published to integrate with the daily summary.

---

## 📁 Key files and locations

### Project folders
- `C:\Users\Usuario\Desktop\CLAUDE\PAPRIKA CLAUDE\twfnew\` — original worktree (main)
- `C:\Users\Usuario\Desktop\CLAUDE\PAPRIKA CLAUDE\twfnew-hoy\` — active worktree (feat/client-agenda merged, chore/disable-vercel-cron pending)

### Specs / Plans (all in `docs/superpowers/`)
- `specs/2026-04-18-twf-security-critical-high-design.md` — design spec for PR #7
- `plans/2026-04-18-twf-security-critical-high.md` — implementation plan for PR #7

### Important generated docs
- `SECURITY_MIGRATION.md` — deploy guide for security migration (already applied, keep for reference)
- `SALES_PLAN.md` — full SaaS sales plan (ICP, pricing, GTM, objections, 30/60/90)
- `PITCH_ONE_PAGER.md` + `PITCH_ONE_PAGER.pdf` — printable pitch for WhatsApp/email
- `scripts/build-pitch-pdf.py` — regenerate PDF if sales plan changes

### Key modules (new/modified in this sprint)
- `api/_lib/supabase.ts` — now uses SUPABASE_SERVICE_ROLE_KEY
- `api/_lib/password.ts` — bcryptjs wrappers
- `api/_lib/schemas.ts` — Zod schemas for all API inputs
- `api/_lib/rateLimiter.ts` — supports configurable limits
- `api/tracking.ts` — exact-match + IP rate limit
- `api/quotes/submit.ts` — Turnstile captcha + rate limit
- `api/notifications/[action].ts` — cron endpoint (dormant after PR #12)
- `src/lib/statusColors.ts` — centralized color logic
- `src/lib/todayFilters.ts` — pure "today" filters used by HOY dashboard
- `src/components/TodayDashboard.tsx` — HOY tab
- `src/components/PartnerDashboardShell.tsx` — shared chrome for depot+transport
- `src/components/ClientPortal.tsx` — added Agenda tab
- `src/components/agenda/AgendaCalendar.tsx` — supports `clientView` + `defaultView`

---

## 🗺️ Roadmap — where to go next

### High value, low effort (pick these next)
1. **Integrate n8n with Operativas sheet** — add 2nd HTTP fetch + update Compilar Resumen JS to include SALIENDO HOY / EN FRONTERA / LLEGANDO FISCAL sections. Requires Brian publishing Operativas tab as CSV.
2. **Remove orphaned env var** — `N8N_SEND_EMAIL_WEBHOOK` no longer used.
3. **Unify data sources** — verify n8n CSV and app `GOOGLE_SHEETS_CSV_URL` point to the same Google Sheet ID. If not, align them.

### Medium value, medium effort
4. **Daily digest endpoint** — new `/api/public/daily-digest?token=CRON_SECRET` that returns JSON from `buildTodaySnapshot()`. Lets n8n or any other client consume the same processed data the web shows.
5. **Invoicing module** (DGI e-factura UY + AR AFIP) — blocker #1 per SALES_PLAN.md to sell to other forwarders.
6. **CRM pipeline** — extend QuotesManagement with lead stages, follow-up reminders.
7. **Multi-currency + FX** — UYU/ARS/BRL beyond USD.
8. **Audit log** — track admin mutations to Supabase.
9. **Rate limiter tests** — behavior tests for `checkRateLimitWithConfig` (flagged in final review).
10. **CSP tightening** — migrate GA to nonce-based loading, drop `'unsafe-inline'` from script-src.

### Big architectural bets
11. **Tenant-configurable branding** — extract TWF-specific branding, make landing + dashboards work for arbitrary forwarders (prep for SaaS customer #1).
12. **White-label tracking subdomain** (Business tier feature in SALES_PLAN).
13. **API + webhooks** (Business tier).
14. **Mobile-first PWA refinement**.

---

## 🚀 How to resume in a new Claude session

1. Open Claude with the `C:\Users\Usuario\Desktop\CLAUDE` folder as working dir (same as now).
2. Memory files at `C:\Users\Usuario\.claude\projects\C--Users-Usuario-Desktop-CLAUDE\memory\` will auto-load.
3. First message suggested:
   > "Continuamos el proyecto TWF. Leete `docs/CONTINUATION_2026_04_20.md` en el repo `twfnew` y `MEMORY.md` index. Estado actual: [X pending actions done, Y not yet]. Quiero [next thing]."
4. Claude should read the continuation doc + memory first, then act.

---

## 🙏 Credits / meta

Shipped 2026-04-18 → 2026-04-20 by Brian + Claude collaborative work.
Key decisions recorded in:
- `docs/superpowers/specs/2026-04-18-twf-security-critical-high-design.md`
- `docs/superpowers/plans/2026-04-18-twf-security-critical-high.md`
- This file

Every PR has a detailed description explaining what + why. Git log is the source of truth for implementation details.
