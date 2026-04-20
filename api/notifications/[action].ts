import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from '../_lib/supabase.js'

// ─── Notifications API ──────────────────────────────────────────────
// Only route:
//   GET /api/notifications/check-pending — cron, sends daily TWF summary
//   to the N8N_REMINDER_WEBHOOK (Telegram).
//
// Previously also handled:
//   POST /api/notifications/confirm       — create a notification task
//   POST /api/notifications/send-email    — send a client email per task
// Those were removed in 2026-04 when the task-based workflow was replaced by
// the HOY dashboard (web) + this daily summary (Telegram).
// ─────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string
  if (action !== 'check-pending') {
    return res.status(404).json({ error: `Unknown action: ${action}` })
  }
  return handleCheckPending(req, res)
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
