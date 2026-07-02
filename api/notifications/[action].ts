import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from '../_lib/supabase.js'
import { authenticateRequest, type AdminPayload } from '../_lib/jwt.js'
import { computePushCounts, buildPushBody, montevideoTodayIso } from '../_lib/pushAlerts.js'

// ─── Notifications API ──────────────────────────────────────────────
// Routes:
//   GET /api/notifications/check-pending — cron, sends daily TWF summary
//   to the N8N_REMINDER_WEBHOOK (Telegram).
//   GET|POST /api/notifications/push-daily — cron (vercel.json) o botón de
//   prueba del owner: manda el resumen del día por Web Push a todas las
//   suscripciones del equipo (push_subscriptions). Dedupe diario en push_log
//   (los 2 proyectos Vercel comparten el mismo cron). ?force=1 saltea el dedupe.
//
// Previously also handled:
//   POST /api/notifications/confirm       — create a notification task
//   POST /api/notifications/send-email    — send a client email per task
// Those were removed in 2026-04 when the task-based workflow was replaced by
// the HOY dashboard (web) + this daily summary (Telegram).
// ─────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string
  if (action === 'check-pending') return handleCheckPending(req, res)
  if (action === 'push-daily') return handlePushDaily(req, res)
  return res.status(404).json({ error: `Unknown action: ${action}` })
}

// ─── Today filter helpers (server copy — kept in sync with src/lib/todayFilters.ts) ──

const MS_PER_DAY = 86_400_000
const BORDER_DAYS_MIN = 1
const BORDER_DAYS_MAX = 2

function parseLocalDate(s: string): Date | null {
  if (!s || typeof s !== 'string' || s.trim() === '') return null
  const parts = s.split('-')
  if (parts.length === 3) {
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
    if (!isNaN(d.getTime())) return d
  }
  const d = new Date(s)
  if (isNaN(d.getTime())) return null
  d.setHours(0, 0, 0, 0)
  return d
}

function todayLocal(): Date {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return t
}

function isValidDate(s: string): boolean { return parseLocalDate(s) !== null }
function isDateToday(s: string): boolean { const d = parseLocalDate(s); return d !== null && d.getTime() === todayLocal().getTime() }
function isDatePast(s: string): boolean { const d = parseLocalDate(s); return d !== null && d.getTime() < todayLocal().getTime() }

function daysSince(s: string): number | null {
  const d = parseLocalDate(s)
  if (!d) return null
  return Math.floor((todayLocal().getTime() - d.getTime()) / MS_PER_DAY)
}

interface OpLike {
  REF?: string
  SALIDA?: string
  ETA_FISC?: string
  CLIENTE_OP?: string
  CNTR_OP?: string
  DEPOSITO?: string
  FISCAL?: string
  TRANSPORTE?: string
}
interface ShipmentLike {
  REF?: string
  CLIENTE?: string
  TERMINAL?: string
  LIBRE_HASTA?: string
  calculatedLibreHasta?: string
  operativas?: OpLike[]
}

interface Match { s: ShipmentLike; op: OpLike }

function salientesHoy(ships: ShipmentLike[]): Match[] {
  return ships.flatMap(s => (s.operativas || []).filter(op => isDateToday(op.SALIDA || '')).map(op => ({ s, op })))
}
function llegandoFiscalHoy(ships: ShipmentLike[]): Match[] {
  return ships.flatMap(s => (s.operativas || []).filter(op => isDateToday(op.ETA_FISC || '')).map(op => ({ s, op })))
}
function enFronteraHoy(ships: ShipmentLike[]): Match[] {
  return ships.flatMap(s => (s.operativas || []).filter(op => {
    if (!isValidDate(op.SALIDA || '')) return false
    const days = daysSince(op.SALIDA || '')
    if (days === null || days < BORDER_DAYS_MIN || days > BORDER_DAYS_MAX) return false
    if (isValidDate(op.ETA_FISC || '') && isDatePast(op.ETA_FISC || '')) return false
    if (isDateToday(op.ETA_FISC || '')) return false
    return true
  }).map(op => ({ s, op })))
}

interface LibreAlertLike { s: ShipmentLike; days: number; severity: 'vencido' | 'hoy' | 'urgente' }

function libreAlerts(ships: ShipmentLike[]): LibreAlertLike[] {
  const out: LibreAlertLike[] = []
  for (const s of ships) {
    const libre = s.LIBRE_HASTA || s.calculatedLibreHasta
    if (!libre || !isValidDate(libre)) continue
    const days = daysSince(libre)
    if (days === null) continue
    if (days > 0) out.push({ s, days, severity: 'vencido' })
    else if (days === 0) out.push({ s, days: 0, severity: 'hoy' })
    else if (days >= -2) out.push({ s, days, severity: 'urgente' })
  }
  return out.sort((a, b) => b.days - a.days)
}

// ─── Telegram message formatting ──

function mdRow(s: ShipmentLike, op: OpLike): string {
  const ref = s.REF || op.REF || '—'
  const cliente = (op.CLIENTE_OP || s.CLIENTE || '—').trim()
  const deposito = (op.DEPOSITO || '—').trim()
  const fiscal = (op.FISCAL || '—').trim()
  const transporte = (op.TRANSPORTE || '').trim()
  const route = `${deposito} → ${fiscal}`
  const suffix = transporte ? ` · ${transporte}` : ''
  return `• \`${ref}\` — ${cliente} — ${route}${suffix}`
}

function buildTelegramMessage(ships: ShipmentLike[]): string {
  const sal = salientesHoy(ships)
  const front = enFronteraHoy(ships)
  const fisc = llegandoFiscalHoy(ships)
  const alerts = libreAlerts(ships)

  const total = sal.length + front.length + fisc.length
  const today = new Date().toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long' })
  const header = `🚚 *TWF — ${today.charAt(0).toUpperCase() + today.slice(1)}*\n`

  if (total === 0 && alerts.length === 0) {
    return `${header}\n☕ Día tranquilo — sin movimientos programados.`
  }

  const sections: string[] = []

  // LIBRE first (urgent)
  if (alerts.length > 0) {
    const vencidos = alerts.filter(a => a.severity === 'vencido')
    const hoy = alerts.filter(a => a.severity === 'hoy')
    const urg = alerts.filter(a => a.severity === 'urgente')
    if (vencidos.length > 0) {
      sections.push(`🔴 *LIBRE VENCIDO (${vencidos.length})*\n` +
        vencidos.map(a => `• \`${a.s.REF || '—'}\` — ${(a.s.CLIENTE || '—').trim()} — vence hace ${a.days}d`).join('\n'))
    }
    if (hoy.length > 0) {
      sections.push(`🟠 *LIBRE HOY (${hoy.length})*\n` +
        hoy.map(a => `• \`${a.s.REF || '—'}\` — ${(a.s.CLIENTE || '—').trim()} — último día en ${a.s.TERMINAL || '—'}`).join('\n'))
    }
    if (urg.length > 0) {
      sections.push(`🟡 *LIBRE EN ${urg[0].days === -1 ? '1 día' : `${Math.abs(urg[0].days)} días`} (${urg.length})*\n` +
        urg.map(a => `• \`${a.s.REF || '—'}\` — ${(a.s.CLIENTE || '—').trim()} — vence en ${Math.abs(a.days)}d`).join('\n'))
    }
  }

  if (sal.length > 0) {
    sections.push(`🚛 *SALIENDO HOY (${sal.length})*\n` + sal.map(m => mdRow(m.s, m.op)).join('\n'))
  }
  if (front.length > 0) {
    sections.push(`🛂 *EN FRONTERA HOY (${front.length})* _estimado_\n` +
      front.map(m => `• \`${m.s.REF || '—'}\` — ${(m.op.CLIENTE_OP || m.s.CLIENTE || '—').trim()} — salió hace ${daysSince(m.op.SALIDA || '')}d`).join('\n'))
  }
  if (fisc.length > 0) {
    sections.push(`🏁 *LLEGANDO A FISCAL HOY (${fisc.length})*\n` + fisc.map(m => mdRow(m.s, m.op)).join('\n'))
  }

  return `${header}\n${sections.join('\n\n')}`
}

// ─── Handler ──

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

  const db = getSupabase()

  try {
    const { data: cache, error } = await db.from('shipments_cache').select('data').eq('id', 1).single()
    if (error) throw error

    const shipments: ShipmentLike[] = Array.isArray(cache?.data) ? cache.data : []
    const message = buildTelegramMessage(shipments)

    // Counts for the return payload
    const sal = salientesHoy(shipments).length
    const front = enFronteraHoy(shipments).length
    const fisc = llegandoFiscalHoy(shipments).length
    const alerts = libreAlerts(shipments).length

    const webhook = process.env.N8N_REMINDER_WEBHOOK
    let delivered = false
    if (webhook) {
      try {
        const r = await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,              // pre-formatted Markdown for Telegram
            text: message,        // alias for webhooks that prefer `text`
            parseMode: 'Markdown',
            counts: { saliendo: sal, frontera: front, llegandoFiscal: fisc, libreAlerts: alerts },
          }),
        })
        delivered = r.ok
        if (!r.ok) console.error(`[check-pending] webhook returned ${r.status}:`, await r.text().catch(() => ''))
      } catch (e) {
        console.error('[check-pending] webhook error:', e)
      }
    } else {
      console.warn('[check-pending] N8N_REMINDER_WEBHOOK not set — summary computed but not delivered')
    }

    return res.status(200).json({
      delivered,
      counts: { saliendo: sal, frontera: front, llegandoFiscal: fisc, libreAlerts: alerts },
      shipmentsScanned: shipments.length,
    })
  } catch (error: any) {
    console.error('[check-pending] Error:', error?.message || error)
    return res.status(500).json({ error: 'Check failed' })
  }
}

// ─── push-daily: resumen del día por Web Push ────────────────────────
// Post-flip la web es master → lee shipments/trucks de la DB (NO el cache de
// la planilla, que quedó congelado). La derivación de alertas vive en
// _lib/pushAlerts.ts (copia server-side de src/lib/todayFilters.ts).

/** Clave pública VAPID (no secreta) — par de process.env.VAPID_PRIVATE_KEY. */
const VAPID_PUBLIC_KEY =
  'BGeJ3K_9CI-VQrzpEwtraxp3w2UZlDxqNeZKgeQUrtAStcBdSIq8ZFh315fmgZgA7RhHwuKrk12p-rWo6WKQBx4'

async function handlePushDaily(req: VercelRequest, res: VercelResponse) {
  // GET = cron de Vercel · POST = botón "Enviar resumen de prueba" (Equipo)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  // Auth: el cron de Vercel manda Bearer CRON_SECRET; el botón de prueba de la
  // pestaña Equipo manda el JWT del owner. Cualquiera de los dos vale.
  const cronSecret = process.env.CRON_SECRET
  const isCron = !!cronSecret && req.headers.authorization === `Bearer ${cronSecret}`
  const payload = authenticateRequest(req.headers.authorization)
  const isOwner = !!payload && payload.role === 'admin' && (payload as AdminPayload).level !== 'admin'
  if (!isCron && !isOwner) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
  if (!vapidPrivateKey) {
    return res.status(503).json({
      error: 'Falta la env var VAPID_PRIVATE_KEY en Vercel — los avisos push no se pueden firmar sin ella.',
    })
  }

  const db = getSupabase()
  const dateKey = montevideoTodayIso()
  const force = req.query.force === '1'

  try {
    // Dedupe entre proyectos: reclamar la date_key ANTES de enviar (insert con
    // PK date_key). Si el otro proyecto ya la insertó → unique violation →
    // skipped. force=1 (botón de prueba) saltea el claim y upsertea al final.
    if (!force) {
      const { error: claimErr } = await db.from('push_log').insert({
        date_key: dateKey,
        sent_at: new Date().toISOString(),
        payload_resumen: '(en curso)',
      })
      if (claimErr) {
        if (claimErr.code === '23505') {
          return res.status(200).json({ skipped: true, reason: `push_log ya tiene ${dateKey} — otro proyecto lo envió` })
        }
        throw claimErr
      }
    }

    // Datos del día: cargas de la DB (sin filas espejo legacy) + camiones.
    const { data: ships, error: shipsErr } = await db
      .from('shipments')
      .select('ref, cliente, mode, archived, libre, salida, eta_fiscal, operativas')
      .neq('source', 'sheet')
      .limit(5000)
    if (shipsErr) throw shipsErr
    const { data: trucks, error: trucksErr } = await db
      .from('trucks')
      .select('code, draft, departure_date')
      .limit(1000)
    if (trucksErr) throw trucksErr

    const counts = computePushCounts(ships || [], trucks || [], dateKey)
    const body = buildPushBody(counts)

    if (!body) {
      await db.from('push_log').upsert(
        { date_key: dateKey, sent_at: new Date().toISOString(), payload_resumen: 'sin alertas — no se envió' },
        { onConflict: 'date_key' }
      )
      return res.status(200).json({ sent: 0, counts, message: 'Sin alertas hoy — no se envió nada' })
    }

    const { data: subs, error: subsErr } = await db
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
    if (subsErr) throw subsErr
    if (!subs || subs.length === 0) {
      await db.from('push_log').upsert(
        { date_key: dateKey, sent_at: new Date().toISOString(), payload_resumen: `${body} — sin suscriptores` },
        { onConflict: 'date_key' }
      )
      return res.status(200).json({ sent: 0, counts, resumen: body, message: 'Nadie activó los avisos todavía — no hay suscripciones' })
    }

    // Import dinámico: web-push solo se carga cuando esta action corre (una vez
    // al día) — no engorda el cold-start del resto de las notificaciones.
    const webpush = (await import('web-push')).default
    webpush.setVapidDetails('mailto:bridvanovich@twf.uy', VAPID_PUBLIC_KEY, vapidPrivateKey)

    const notification = JSON.stringify({
      title: 'Mediterránea — resumen del día',
      body,
      icon: '/med-icon-192.png',
      badge: '/med-icon-192.png',
      url: '/admin',
    })

    let sent = 0
    const dead: string[] = []
    await Promise.all(
      subs.map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            notification
          )
          sent++
        } catch (e: any) {
          const code = e?.statusCode
          // 404/410 = suscripción muerta (navegador la dio de baja) → limpiarla
          if (code === 404 || code === 410) dead.push(s.endpoint)
          else console.error('[push-daily] send falló:', code, e?.message || e)
        }
      })
    )
    if (dead.length > 0) {
      await db.from('push_subscriptions').delete().in('endpoint', dead)
    }

    await db.from('push_log').upsert(
      { date_key: dateKey, sent_at: new Date().toISOString(), payload_resumen: `${body} → ${sent} enviados` },
      { onConflict: 'date_key' }
    )

    return res.status(200).json({ sent, muertas: dead.length, counts, resumen: body })
  } catch (error: any) {
    console.error('[push-daily] Error:', error?.message || error)
    return res.status(500).json({ error: 'No se pudo enviar el resumen push' })
  }
}
