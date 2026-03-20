import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest } from '../_lib/jwt.js'
import { handleCors } from '../_lib/cors.js'
import { getSupabase } from '../_lib/supabase.js'

// ─── Send notification email via n8n webhook ─────────────────────────
// POST /api/notifications/send-email
// Body: { taskId, to, subject, htmlBody, replyTo? }
//
// Forwards email data to n8n SMTP workflow, then marks task as completed.
// ─────────────────────────────────────────────────────────────────────

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

  const n8nWebhook = process.env.N8N_SEND_EMAIL_WEBHOOK
  if (!n8nWebhook) {
    return res.status(500).json({ error: 'N8N_SEND_EMAIL_WEBHOOK not configured' })
  }

  try {
    // Call n8n webhook to send email
    const n8nRes = await fetch(n8nWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        subject,
        htmlBody,
        replyTo: replyTo || undefined,
      }),
    })

    if (!n8nRes.ok) {
      const errText = await n8nRes.text()
      console.error('[send-email] n8n error:', n8nRes.status, errText)
      return res.status(502).json({ error: 'Email sending failed via n8n' })
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
      // Email was sent but DB update failed — still report success
    }

    return res.status(200).json({ sent: true, taskId })
  } catch (error: any) {
    console.error('[send-email] Error:', error?.message || error)
    return res.status(500).json({ error: 'Failed to send email' })
  }
}
