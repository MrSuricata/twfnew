import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest } from '../_lib/jwt.js'
import { handleCors } from '../_lib/cors.js'
import { getSupabase } from '../_lib/supabase.js'
import { matchesClientePattern } from '../_lib/csvParser.js'

// ─── Confirm a shipment event manually ───────────────────────────────
// POST /api/notifications/confirm
// Body: { shipmentRef, containerNumber, step: 'departure'|'border'|'fiscal', salidaDate? }
//
// Brian clicks "Confirmar Salida/Cruce/Llegada" in the UI.
// This creates a notification_task row that he then needs to fulfill (send email).
// ─────────────────────────────────────────────────────────────────────

const STEP_CONFIG: Record<string, { stepNumber: number; label: string }> = {
  departure: { stepNumber: 0, label: 'Salida' },
  border:    { stepNumber: 1, label: 'Cruce Frontera' },
  fiscal:    { stepNumber: 2, label: 'Llegada Fiscal' },
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const payload = authenticateRequest(req.headers.authorization)
  if (!payload || payload.role !== 'admin') {
    return res.status(401).json({ error: 'Admin authentication required' })
  }

  const { shipmentRef, containerNumber, step, salidaDate } = req.body || {}

  if (!shipmentRef || !step || !STEP_CONFIG[step]) {
    return res.status(400).json({ error: 'shipmentRef and step (departure|border|fiscal) required' })
  }

  const db = getSupabase()
  const today = new Date().toISOString().split('T')[0]
  const cntr = containerNumber || ''
  const taskId = `ntask-${shipmentRef}-${cntr || 'all'}-${step}`

  try {
    // Check if task already exists
    const { data: existing } = await db
      .from('notification_tasks')
      .select('id')
      .eq('id', taskId)
      .single()

    if (existing) {
      return res.status(200).json({ task: existing, alreadyExists: true })
    }

    // Look up shipment data for CLIENTE field
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

    // Resolve client email from clients table
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

    // Auto-check photos and reports for departure step
    let photosOk = false
    let reportOk = false

    if (step === 'departure') {
      // Check origin_photos
      const { count: photoCount } = await db
        .from('origin_photos')
        .select('id', { count: 'exact', head: true })
        .eq('shipment_ref', shipmentRef)
      photosOk = (photoCount || 0) > 0

      // Check reports
      const { count: reportCount } = await db
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('shipment_ref', shipmentRef)
      reportOk = (reportCount || 0) > 0
    }

    // Create task
    const task = {
      id: taskId,
      shipment_ref: shipmentRef,
      container_number: cntr,
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
      status: 'pending',
      notes: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { error } = await db.from('notification_tasks').upsert(task, { onConflict: 'id' })
    if (error) throw error

    // Return camelCase for frontend
    return res.status(200).json({
      task: {
        id: task.id,
        shipmentRef: task.shipment_ref,
        containerNumber: task.container_number,
        cliente: task.cliente,
        clientEmail: task.client_email,
        clientName: task.client_name,
        step: task.step,
        stepNumber: task.step_number,
        dueDate: task.due_date,
        salidaDate: task.salida_date,
        photosOk: task.photos_ok,
        reportOk: task.report_ok,
        emailSent: task.email_sent,
        status: task.status,
        notes: task.notes,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
      },
      alreadyExists: false,
    })
  } catch (error: any) {
    console.error('[notifications/confirm] Error:', error?.message || error)
    return res.status(500).json({ error: 'Database error' })
  }
}
