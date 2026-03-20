import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest } from '../_lib/jwt.js'
import { handleCors } from '../_lib/cors.js'
import { getSupabase } from '../_lib/supabase.js'

// ─── Send notification email ─────────────────────────────────────────
// POST /api/notifications/send-email
// Body: { taskId, to, subject, htmlBody, replyTo? }
//
// Priority: n8n webhook (if configured) → EmailJS fallback
// Then marks the notification task as completed.
// ─────────────────────────────────────────────────────────────────────

/** Send via n8n SMTP webhook (emails come FROM Brian's domain) */
async function sendViaN8n(webhook: string, data: { to: string; subject: string; htmlBody: string; replyTo?: string }): Promise<boolean> {
  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.ok
}

/** Send via EmailJS (fallback — emails come from EmailJS service) */
async function sendViaEmailJS(data: { to: string; subject: string; htmlBody: string }): Promise<boolean> {
  const serviceId = process.env.EMAILJS_SERVICE_ID
  const templateId = process.env.EMAILJS_TEMPLATE_NOTIFICATION || process.env.EMAILJS_TEMPLATE_QUOTE
  const publicKey = process.env.EMAILJS_PUBLIC_KEY
  const privateKey = process.env.EMAILJS_PRIVATE_KEY

  if (!serviceId || !templateId || !publicKey) {
    console.error('[send-email] EmailJS not configured')
    return false
  }

  const body: Record<string, unknown> = {
    service_id: serviceId,
    template_id: templateId,
    user_id: publicKey,
    template_params: {
      to_email: data.to,
      email: data.to,
      subject: data.subject,
      message: data.htmlBody,
      from_name: 'TWF - Transit World Forwarding',
    },
  }
  if (privateKey) body.accessToken = privateKey

  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error(`[send-email] EmailJS error (${res.status}):`, errText)
  }

  return res.ok
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const payload = authenticateRequest(req.headers.authorization)
  if (!payload || payload.role !== 'admin') {
    return res.status(401).json({ error: 'Admin authentication required' })
  }

  const { taskId, to, subject, htmlBody, replyTo } = req.body || {}

  if (!taskId || !to || !subject || !htmlBody) {
    return res.status(400).json({ error: 'taskId, to, subject, and htmlBody are required' })
  }

  try {
    let sent = false
    let method = ''

    // Try n8n first (if configured)
    const n8nWebhook = process.env.N8N_SEND_EMAIL_WEBHOOK
    if (n8nWebhook) {
      sent = await sendViaN8n(n8nWebhook, { to, subject, htmlBody, replyTo })
      method = 'n8n'
    }

    // Fallback to EmailJS
    if (!sent) {
      sent = await sendViaEmailJS({ to, subject, htmlBody })
      method = 'emailjs'
    }

    if (!sent) {
      return res.status(502).json({ error: 'Email sending failed (both n8n and EmailJS)' })
    }

    // Mark task as completed
    const db = getSupabase()
    const { error } = await db.from('notification_tasks').update({
      email_sent: true,
      email_sent_at: new Date().toISOString(),
      status: 'completed',
      updated_at: new Date().toISOString(),
    }).eq('id', taskId)

    if (error) {
      console.error('[send-email] DB update error:', error.message)
    }

    return res.status(200).json({ sent: true, taskId, method })
  } catch (error: any) {
    console.error('[send-email] Error:', error?.message || error)
    return res.status(500).json({ error: 'Failed to send email' })
  }
}
