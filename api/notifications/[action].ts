import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest } from '../_lib/jwt.js'
import { handleCors } from '../_lib/cors.js'
import { getSupabase } from '../_lib/supabase.js'
import { matchesClientePattern } from '../_lib/csvParser.js'

// ─── Consolidated Notifications API ──────────────────────────────────
// Routes by [action] parameter:
//   POST /api/notifications/confirm      → confirm a shipment event
//   POST /api/notifications/send-email   → send notification email
//   GET  /api/notifications/check-pending → cron: check for pending tasks
// ─────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return

  const action = req.query.action as string

  switch (action) {
    case 'confirm':
      return handleConfirm(req, res)
    case 'send-email':
      return handleSendEmail(req, res)
    case 'check-pending':
      return handleCheckPending(req, res)
    default:
      return res.status(404).json({ error: `Unknown action: ${action}` })
  }
}

// ── CONFIRM ──────────────────────────────────────────────────────────

const STEP_CONFIG: Record<string, { stepNumber: number; label: string }> = {
  departure: { stepNumber: 0, label: 'Salida' },
  border:    { stepNumber: 1, label: 'Cruce Frontera' },
  fiscal:    { stepNumber: 2, label: 'Llegada Fiscal' },
}

async function handleConfirm(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const payload = authenticateRequest(req.headers.authorization)
  if (!payload || payload.role !== 'admin') {
    return res.status(401).json({ error: 'Admin authentication required' })
  }

  const { shipmentRef, containerNumber, step, salidaDate, operativa } = req.body || {}

  if (!shipmentRef || !step || !STEP_CONFIG[step]) {
    return res.status(400).json({ error: 'shipmentRef and step (departure|border|fiscal) required' })
  }

  const db = getSupabase()
  const today = new Date().toISOString().split('T')[0]
  const cntr = containerNumber || ''
  const taskId = `ntask-${shipmentRef}-${cntr || 'all'}-${step}`

  try {
    const { data: existing } = await db
      .from('notification_tasks')
      .select('id')
      .eq('id', taskId)
      .single()

    if (existing) {
      return res.status(200).json({ task: existing, alreadyExists: true })
    }

    let cliente = ''
    let clientEmail = ''
    let clientName = ''

    const { data: cache } = await db.from('shipments_cache').select('data').eq('id', 1).single()
    if (cache?.data) {
      const shipment = cache.data.find((s: any) => s.REF === shipmentRef)
      if (shipment) {
        cliente = shipment.CLIENTE || ''
      }
    }

    if (cliente) {
      const { data: clients } = await db.from('clients').select('email, name, cliente_pattern')
      if (clients) {
        const match = clients.find((c: any) => matchesClientePattern(cliente, c.cliente_pattern))
        if (match) {
          clientEmail = match.email || ''
          clientName = match.name || ''
        }
      }
    }

    let photosOk = false
    let reportOk = false

    if (step === 'departure') {
      const { count: photoCount } = await db
        .from('origin_photos')
        .select('id', { count: 'exact', head: true })
        .eq('shipment_ref', shipmentRef)
      photosOk = (photoCount || 0) > 0

      const { count: reportCount } = await db
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('shipment_ref', shipmentRef)
      reportOk = (reportCount || 0) > 0
    }

    // For border/fiscal steps, inherit threadId from the departure task
    let emailThreadId = ''
    let emailSubject = ''
    if (step !== 'departure') {
      const departureId = `ntask-${shipmentRef}-${cntr || 'all'}-departure`
      const { data: depTask } = await db
        .from('notification_tasks')
        .select('email_thread_id, email_subject')
        .eq('id', departureId)
        .single()
      if (depTask?.email_thread_id) {
        emailThreadId = depTask.email_thread_id
        emailSubject = depTask.email_subject || ''
      }
    }

    const task = {
      id: taskId,
      shipment_ref: shipmentRef,
      container_number: cntr,
      operativa: operativa || 'CONTENEDOR',
      cliente,
      client_email: clientEmail,
      client_name: clientName,
      step,
      step_number: STEP_CONFIG[step].stepNumber,
      due_date: today,
      salida_date: salidaDate || today,
      photos_ok: photosOk,
      report_ok: reportOk,
      email_sent: false,
      email_thread_id: emailThreadId,
      email_subject: emailSubject,
      status: 'pending',
      notes: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { error } = await db.from('notification_tasks').upsert(task, { onConflict: 'id' })
    if (error) throw error

    return res.status(200).json({
      task: {
        id: task.id, shipmentRef: task.shipment_ref, containerNumber: task.container_number,
        operativa: task.operativa || 'CONTENEDOR',
        cliente: task.cliente, clientEmail: task.client_email, clientName: task.client_name,
        step: task.step, stepNumber: task.step_number, dueDate: task.due_date,
        salidaDate: task.salida_date, photosOk: task.photos_ok, reportOk: task.report_ok,
        emailSent: task.email_sent, emailThreadId: task.email_thread_id || '',
        emailSubject: task.email_subject || '', status: task.status, notes: task.notes,
        createdAt: task.created_at, updatedAt: task.updated_at,
      },
      alreadyExists: false,
    })
  } catch (error: any) {
    console.error('[notifications/confirm] Error:', error?.message || error)
    return res.status(500).json({ error: 'Database error' })
  }
}

// ── SEND EMAIL ───────────────────────────────────────────────────────

async function sendViaN8n(webhook: string, data: { to: string; subject: string; htmlBody: string; replyTo?: string; attachments?: any[] }): Promise<{ ok: boolean; data?: any }> {
  const r = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  let responseData = null
  try { responseData = await r.json() } catch {}
  return { ok: r.ok, data: responseData }
}

async function sendViaEmailJS(data: { to: string; subject: string; htmlBody: string }): Promise<boolean> {
  const serviceId = process.env.EMAILJS_SERVICE_ID
  const templateId = process.env.EMAILJS_TEMPLATE_NOTIFICATION || process.env.EMAILJS_TEMPLATE_QUOTE
  const publicKey = process.env.EMAILJS_PUBLIC_KEY
  const privateKey = process.env.EMAILJS_PRIVATE_KEY

  if (!serviceId || !templateId || !publicKey) return false

  const body: Record<string, unknown> = {
    service_id: serviceId,
    template_id: templateId,
    user_id: publicKey,
    template_params: {
      to_email: data.to, email: data.to, subject: data.subject,
      message: data.htmlBody, from_name: 'TWF - Transit World Forwarding',
    },
  }
  if (privateKey) body.accessToken = privateKey

  const r = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) console.error(`[send-email] EmailJS error (${r.status}):`, await r.text())
  return r.ok
}

async function handleSendEmail(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const payload = authenticateRequest(req.headers.authorization)
  if (!payload || payload.role !== 'admin') {
    return res.status(401).json({ error: 'Admin authentication required' })
  }

  const { taskId, to, subject, htmlBody, replyTo, attachments, threadId } = req.body || {}
  if (!taskId || !to || !subject || !htmlBody) {
    return res.status(400).json({ error: 'taskId, to, subject, and htmlBody are required' })
  }

  try {
    let sent = false
    let method = ''
    let responseData: any = null

    const n8nWebhook = process.env.N8N_SEND_EMAIL_WEBHOOK
    if (n8nWebhook) {
      const n8nResult = await sendViaN8n(n8nWebhook, { to, subject, htmlBody, replyTo, attachments, threadId })
      sent = n8nResult.ok
      responseData = n8nResult.data
      method = 'n8n'
    }
    if (!sent) {
      sent = await sendViaEmailJS({ to, subject, htmlBody })
      method = 'emailjs'
    }
    if (!sent) {
      return res.status(502).json({ error: 'Email sending failed' })
    }

    // Save thread info for future replies
    const db = getSupabase()
    const updateData: Record<string, unknown> = {
      email_sent: true, email_sent_at: new Date().toISOString(),
      status: 'completed', updated_at: new Date().toISOString(),
      email_subject: subject,
    }
    // If n8n returned a threadId, save it for reply chaining
    if (responseData?.threadId) {
      updateData.email_thread_id = responseData.threadId
    }
    await db.from('notification_tasks').update(updateData).eq('id', taskId)

    return res.status(200).json({ sent: true, taskId, method, threadId: responseData?.threadId })
  } catch (error: any) {
    console.error('[send-email] Error:', error?.message || error)
    return res.status(500).json({ error: 'Failed to send email' })
  }
}

// ── CHECK PENDING (Cron) ─────────────────────────────────────────────

async function handleCheckPending(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.authorization
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const db = getSupabase()
  const today = new Date().toISOString().split('T')[0]

  try {
    const { count: pendingCount, error } = await db
      .from('notification_tasks')
      .select('id', { count: 'exact', head: true })
      .lte('due_date', today)
      .eq('status', 'pending')
    if (error) throw error

    const pending = pendingCount || 0
    if (pending === 0) {
      return res.status(200).json({ pending: 0, reminded: false })
    }

    const { data: tasks } = await db
      .from('notification_tasks')
      .select('shipment_ref, step, due_date')
      .lte('due_date', today)
      .eq('status', 'pending')

    const overdue = (tasks || []).filter(t => t.due_date < today).length
    const todayPending = (tasks || []).filter(t => t.due_date === today).length
    const refs = [...new Set((tasks || []).map(t => t.shipment_ref))].join(', ')

    const message = `⚠️ TWF Notificaciones Pendientes\n\n` +
      `${overdue > 0 ? `🔴 ${overdue} vencida${overdue > 1 ? 's' : ''}\n` : ''}` +
      `🟡 ${todayPending} de hoy\n\nRefs: ${refs}\n\n👉 Entrá al dashboard`

    const n8nReminder = process.env.N8N_REMINDER_WEBHOOK
    if (n8nReminder) {
      try {
        await fetch(n8nReminder, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, pending, overdue, todayPending, refs }),
        })
      } catch (e) {
        console.error('[check-pending] n8n webhook failed:', e)
      }
    }

    return res.status(200).json({ pending, overdue, todayPending, reminded: !!n8nReminder })
  } catch (error: any) {
    console.error('[check-pending] Error:', error?.message || error)
    return res.status(500).json({ error: 'Check failed' })
  }
}
