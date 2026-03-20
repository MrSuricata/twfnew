import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from '../_lib/supabase.js'

// ─── Check for pending notifications — Vercel Cron endpoint ──────────
// GET /api/notifications/check-pending
// Called by Vercel Cron at 20:30 UYT (23:30 UTC) daily.
// If there are pending tasks, calls n8n webhook to send WhatsApp reminder.
// Auth: CRON_SECRET header check.
// ─────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel Cron sends requests as GET with authorization header
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.authorization

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const db = getSupabase()
  const today = new Date().toISOString().split('T')[0]

  try {
    // Count pending tasks (today + overdue)
    const { count: pendingCount, error } = await db
      .from('notification_tasks')
      .select('id', { count: 'exact', head: true })
      .lte('due_date', today)
      .eq('status', 'pending')

    if (error) throw error

    const pending = pendingCount || 0

    if (pending === 0) {
      return res.status(200).json({ pending: 0, reminded: false, message: 'No pending tasks' })
    }

    // Get summary for the message
    const { data: tasks } = await db
      .from('notification_tasks')
      .select('shipment_ref, step, due_date')
      .lte('due_date', today)
      .eq('status', 'pending')

    const overdue = (tasks || []).filter(t => t.due_date < today).length
    const todayPending = (tasks || []).filter(t => t.due_date === today).length
    const refs = [...new Set((tasks || []).map(t => t.shipment_ref))].join(', ')

    // Build WhatsApp message
    const message = `⚠️ TWF Notificaciones Pendientes\n\n` +
      `${overdue > 0 ? `🔴 ${overdue} vencida${overdue > 1 ? 's' : ''}\n` : ''}` +
      `🟡 ${todayPending} de hoy\n\n` +
      `Refs: ${refs}\n\n` +
      `👉 Entrá al dashboard para completarlas`

    // Call n8n webhook for WhatsApp
    const n8nReminder = process.env.N8N_REMINDER_WEBHOOK
    if (n8nReminder) {
      try {
        await fetch(n8nReminder, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, pending, overdue, todayPending, refs }),
        })
      } catch (webhookErr) {
        console.error('[check-pending] n8n webhook failed:', webhookErr)
      }
    }

    return res.status(200).json({ pending, overdue, todayPending, reminded: !!n8nReminder })
  } catch (error: any) {
    console.error('[check-pending] Error:', error?.message || error)
    return res.status(500).json({ error: 'Check failed' })
  }
}
