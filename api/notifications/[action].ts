import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createECDH } from 'node:crypto'
import { getSupabase } from '../_lib/supabase.js'
import { authenticateRequest, type AdminPayload } from '../_lib/jwt.js'
import {
  computeSlotAlerts,
  montevideoTodayIso,
  PUSH_ALERT_META,
  type PushSlot,
} from '../_lib/pushAlerts.js'

// ─── Notifications API ──────────────────────────────────────────────
// Routes:
//   GET /api/notifications/check-pending — cron, sends daily TWF summary
//   to the N8N_REMINDER_WEBHOOK (Telegram).
//   GET|POST /api/notifications/push-alerts?slot=manana|tarde — crons
//   (vercel.json, límite Hobby = 2): manda las alertas del slot por Web Push,
//   una notificación SEPARADA por tipo con detalle, solo a las suscripciones
//   con ese tipo activado (push_subscriptions.alert_*). Dedupe claim-first en
//   push_log con date_key `yyyy-mm-dd:slot` (los 2 proyectos Vercel comparten
//   los crons). ?force=1 saltea el dedupe.
//     slot manana (10:00 UTC = 07:00 UY): "Días libres" + "Llegan hoy a fiscal"
//     slot tarde  (19:00 UTC = 16:00 UY): "Hoy en frontera" + "Salen hoy"
//   GET|POST /api/notifications/push-daily — alias del slot manana (lo usa el
//   botón "Enviar resumen de prueba" de la pestaña Equipo, con ?force=1).
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
  if (action === 'push-alerts') return handlePushAlerts(req, res)
  // Alias legacy: el botón de prueba de Equipo sigue pegándole a push-daily.
  if (action === 'push-daily') return handlePushAlerts(req, res, 'manana')
  if (action === 'push-status') return handlePushStatus(req, res)
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

// ─── push-alerts: alertas configurables por Web Push (2 slots) ────────
// Post-flip la web es master → lee shipments de la DB (NO el cache de la
// planilla, que quedó congelado). La derivación de cada tipo vive en
// _lib/pushAlerts.ts (copia server-side de src/lib/todayFilters.ts).
// Cada tipo sale como notificación SEPARADA (título propio + hasta 6 líneas
// de detalle) y solo a las suscripciones con ese tipo en true.

/** Clave pública VAPID (no secreta) — par de process.env.VAPID_PRIVATE_KEY.
 *  Par ROTADO el 08/07/2026 (la privada original nunca llegó a Vercel y se
 *  perdió) — las suscripciones anteriores a la rotación quedan inválidas:
 *  re-activar la campana en cada dispositivo. */
const VAPID_PUBLIC_KEY =
  'BAF-BlktBTYnH7evtFhiFHf1i4CPU2ZTEQVA370q-I2AZWqVDchpxBX084hCvGK3c7s6PNJrBVVFQ2V3vGXXnAE'

interface PushSubRow {
  endpoint: string
  p256dh: string
  auth: string
  alert_libre?: boolean | null
  alert_salidas?: boolean | null
  alert_fiscal?: boolean | null
  alert_frontera?: boolean | null
}

/** Resuelve el slot: query ?slot=, o (red de seguridad si el query se pierde)
 *  el header x-vercel-cron-schedule que Vercel manda con cada invocación. */
function resolveSlot(req: VercelRequest, forced?: PushSlot): PushSlot | null {
  if (forced) return forced
  const q = req.query.slot
  if (q === 'manana' || q === 'tarde') return q
  const sched = String(req.headers['x-vercel-cron-schedule'] || '')
  if (sched === '0 10 * * *') return 'manana'
  if (sched === '0 19 * * *') return 'tarde'
  return null
}

/** Compara la clave privada de la env var con la pública hardcodeada (par P-256).
 *  Detecta el caso silencioso en que la privada cargada en Vercel es de OTRO par:
 *  los push services devuelven 403 y nada llega, sin error visible. */
function vapidPairStatus(priv: string | undefined): 'ok' | 'missing' | 'mismatch' | 'invalid' {
  if (!priv || !priv.trim()) return 'missing'
  try {
    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(Buffer.from(priv.trim(), 'base64url'))
    const pub = ecdh.getPublicKey(undefined, 'uncompressed').toString('base64url')
    return pub === VAPID_PUBLIC_KEY ? 'ok' : 'mismatch'
  } catch {
    return 'invalid'
  }
}

// GET /api/notifications/push-status — diagnóstico (solo owner). Responde por
// ESTE proyecto Vercel (twf y med tienen env vars separadas): estado de la
// clave VAPID, CRON_SECRET, suscripciones vivas y últimos envíos del push_log.
// Existe porque los logs runtime de Hobby duran 1 hora — sin esto, un cron que
// falla (401/503) es invisible.
async function handlePushStatus(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const payload = authenticateRequest(req.headers.authorization)
  const isOwner = !!payload && payload.role === 'admin' && (payload as AdminPayload).level !== 'admin'
  if (!isOwner) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const db = getSupabase()
    const [subsRes, logRes] = await Promise.all([
      db.from('push_subscriptions')
        .select('admin_email, user_agent, created_at, alert_libre, alert_salidas, alert_fiscal, alert_frontera')
        .order('created_at', { ascending: false }),
      db.from('push_log')
        .select('date_key, sent_at, payload_resumen')
        .order('sent_at', { ascending: false })
        .limit(10),
    ])
    if (subsRes.error) throw subsRes.error
    if (logRes.error) throw logRes.error

    return res.status(200).json({
      proyecto: process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || 'local',
      vapid: vapidPairStatus(process.env.VAPID_PRIVATE_KEY),
      cronSecret: !!process.env.CRON_SECRET,
      suscripciones: (subsRes.data || []).map(s => ({
        email: s.admin_email,
        navegador: s.user_agent || '',
        creada: s.created_at,
        prefs: {
          libre: s.alert_libre !== false,
          salidas: s.alert_salidas !== false,
          fiscal: s.alert_fiscal !== false,
          frontera: s.alert_frontera !== false,
        },
      })),
      ultimosEnvios: logRes.data || [],
    })
  } catch (error: any) {
    console.error('[push-status] Error:', error?.message || error)
    return res.status(500).json({ error: 'No se pudo armar el diagnóstico' })
  }
}

async function handlePushAlerts(req: VercelRequest, res: VercelResponse, forcedSlot?: PushSlot) {
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

  const slot = resolveSlot(req, forcedSlot)
  if (!slot) {
    return res.status(400).json({ error: 'slot inválido — usar ?slot=manana o ?slot=tarde' })
  }

  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
  if (!vapidPrivateKey) {
    return res.status(503).json({
      error: 'Falta la env var VAPID_PRIVATE_KEY en Vercel — los avisos push no se pueden firmar sin ella.',
    })
  }

  const db = getSupabase()
  const todayIso = montevideoTodayIso()
  const dateKey = `${todayIso}:${slot}`
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

    // Datos del día: cargas FCL de la DB (sin filas espejo legacy).
    const { data: ships, error: shipsErr } = await db
      .from('shipments')
      .select('ref, cliente, mode, archived, libre, salida, eta_fiscal, contenedor, deposito, transporte, operativas')
      .neq('source', 'sheet')
      .limit(5000)
    if (shipsErr) throw shipsErr

    const alerts = computeSlotAlerts(slot, ships || [], todayIso)

    if (alerts.length === 0) {
      await db.from('push_log').upsert(
        { date_key: dateKey, sent_at: new Date().toISOString(), payload_resumen: `[${slot}] sin alertas — no se envió` },
        { onConflict: 'date_key' }
      )
      return res.status(200).json({ slot, sent: 0, alerts: [], message: 'Sin alertas en este slot — no se envió nada' })
    }

    const { data: subs, error: subsErr } = await db
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, alert_libre, alert_salidas, alert_fiscal, alert_frontera')
    if (subsErr) throw subsErr
    const resumenTipos = alerts.map(a => `${a.title}`).join(' · ')
    if (!subs || subs.length === 0) {
      await db.from('push_log').upsert(
        { date_key: dateKey, sent_at: new Date().toISOString(), payload_resumen: `[${slot}] ${resumenTipos} — sin suscriptores` },
        { onConflict: 'date_key' }
      )
      return res.status(200).json({ slot, sent: 0, resumen: resumenTipos, alerts: alerts.map(a => ({ kind: a.kind, count: a.count })), message: 'Nadie activó los avisos todavía — no hay suscripciones' })
    }

    // Import dinámico: web-push solo se carga cuando esta action corre (2 veces
    // al día) — no engorda el cold-start del resto de las notificaciones.
    const webpush = (await import('web-push')).default
    webpush.setVapidDetails('mailto:bridvanovich@twf.uy', VAPID_PUBLIC_KEY, vapidPrivateKey)

    let sent = 0
    const dead = new Set<string>()
    // Errores de envío por código HTTP (403 = clave VAPID que no corresponde al
    // par de la pública; network = sin respuesta) — visibles en push_log y en la
    // respuesta del botón de prueba, si no quedan invisibles con Hobby (logs 1h).
    const errores: Record<string, number> = {}
    const porTipo: Array<{ kind: string; count: number; sentTo: number }> = []

    // Tipo por tipo (secuencial) para que las notificaciones lleguen en orden;
    // dentro de cada tipo los envíos van en paralelo.
    for (const alert of alerts) {
      const prefColumn = PUSH_ALERT_META[alert.kind].prefColumn as keyof PushSubRow
      const destino = (subs as PushSubRow[]).filter(s => !dead.has(s.endpoint) && s[prefColumn] !== false)
      const notification = JSON.stringify({
        title: alert.title,
        body: alert.body,
        // tag por tipo: un re-envío (?force=1) reemplaza el aviso anterior en
        // vez de apilar duplicados.
        tag: `med-${alert.kind}`,
        icon: '/med-icon-192.png',
        badge: '/med-icon-192.png',
        url: '/admin',
      })
      let sentTo = 0
      await Promise.all(
        destino.map(async s => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              notification
            )
            sent++
            sentTo++
          } catch (e: any) {
            const code = e?.statusCode
            // 404/410 = suscripción muerta (navegador la dio de baja) → limpiarla
            if (code === 404 || code === 410) dead.add(s.endpoint)
            else {
              const k = String(code || 'network')
              errores[k] = (errores[k] || 0) + 1
              console.error('[push-alerts] send falló:', code, e?.message || e)
            }
          }
        })
      )
      porTipo.push({ kind: alert.kind, count: alert.count, sentTo })
    }

    if (dead.size > 0) {
      await db.from('push_subscriptions').delete().in('endpoint', [...dead])
    }

    const fallidos = Object.entries(errores).map(([k, n]) => `${n}×${k}`).join(', ')
    const resumenFinal = `[${slot}] ${resumenTipos} → ${sent} enviados${fallidos ? ` · ⚠️ fallidos: ${fallidos}` : ''}`
    await db.from('push_log').upsert(
      { date_key: dateKey, sent_at: new Date().toISOString(), payload_resumen: resumenFinal },
      { onConflict: 'date_key' }
    )

    return res.status(200).json({ slot, sent, muertas: dead.size, errores, resumen: resumenTipos, alerts: porTipo })
  } catch (error: any) {
    console.error('[push-alerts] Error:', error?.message || error)
    return res.status(500).json({ error: `No se pudieron enviar las alertas push${error?.message ? ` — ${error.message}` : ''}` })
  }
}
