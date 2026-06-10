import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest } from '../_lib/jwt.js'
import { handleCors } from '../_lib/cors.js'
import { getSupabase } from '../_lib/supabase.js'
import { sendMail } from '../_lib/mail.js'
import { welcomeClientEmail, welcomePartnerEmail } from '../_lib/emailTemplates.js'
import { hashPassword } from '../_lib/password.js'
import {
  validate,
  QuoteRowSchema,
  ClientRowSchema,
  SettingsUpsertSchema,
  PartnerUserCreateSchema,
  PartnerUserPatchSchema,
  DocumentRowSchema,
  ReportRowSchema,
  OriginPhotoRowSchema,
  NotificationTaskRowSchema,
  NotificationTaskPatchSchema,
  TruckRowSchema,
  TruckLoadRowSchema,
  LclAirRowSchema,
  TruckCounterRequestSchema,
  BillingRowSchema,
  OperatorRowSchema,
  OperatorAssignmentRowSchema,
} from '../_lib/schemas.js'
import { z } from 'zod'

/** Validate `req.body` as either a single object or an array against `itemSchema`. */
function validateBatch<T>(itemSchema: z.ZodSchema<T>, body: unknown): { ok: true; items: T[] } | { ok: false; error: string } {
  const arr = Array.isArray(body) ? body : [body]
  const results: T[] = []
  for (let i = 0; i < arr.length; i++) {
    const r = validate(itemSchema, arr[i])
    if (!r.ok) return { ok: false, error: `item[${i}]: ${r.error}` }
    results.push(r.data)
  }
  return { ok: true, items: results }
}

// ─── Combined Data API ───────────────────────────────────────────────
// Handles: /api/data/quotes, /api/data/documents, /api/data/reports,
//          /api/data/settings, /api/data/shipments-cache,
//          /api/data/partner-users, /api/data/partner-shipments
// ─────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return

  const payload = authenticateRequest(req.headers.authorization)
  const entity = req.query.entity as string
  const db = getSupabase()

  // Partner-shipments allows depot/transport roles
  if (entity === 'partner-shipments') {
    if (!payload || (payload.role !== 'depot' && payload.role !== 'transport')) {
      return res.status(401).json({ error: 'Partner authentication required' })
    }
    try { return handlePartnerShipments(req, res, db, payload) }
    catch (e: any) { console.error('[partner-shipments] error:', e?.message); return res.status(500).json({ error: 'Database error' }) }
  }

  // All other endpoints require admin auth
  if (!payload || payload.role !== 'admin') {
    return res.status(401).json({ error: 'Admin authentication required' })
  }

  try {
    switch (entity) {
      case 'quotes':
        return handleQuotes(req, res, db)
      case 'documents':
        return handleDocuments(req, res, db)
      case 'reports':
        return handleReports(req, res, db)
      case 'clients':
        return handleClients(req, res, db)
      case 'settings':
        return handleSettings(req, res, db)
      case 'origin-photos':
        return handleOriginPhotos(req, res, db)
      case 'notification-tasks':
        return handleNotificationTasks(req, res, db)
      case 'shipments-cache':
        return handleShipmentsCache(req, res, db)
      case 'partner-users':
        return handlePartnerUsers(req, res, db)
      case 'trucks':
        return handleTrucks(req, res, db)
      case 'truck-loads':
        return handleTruckLoads(req, res, db)
      case 'lcl-air':
        return handleLclAir(req, res, db)
      case 'truck-counter':
        return handleTruckCounter(req, res, db)
      case 'billing':
        return handleBilling(req, res, db)
      case 'operators':
        return handleOperators(req, res, db)
      case 'operator-assignments':
        return handleOperatorAssignments(req, res, db)
      case 'shipments':
        return handleShipments(req, res, db)
      default:
        return res.status(404).json({ error: `Unknown entity: ${entity}` })
    }
  } catch (error: any) {
    console.error(`[${entity}] API error:`, error?.message || error)
    return res.status(500).json({ error: 'Database error' })
  }
}

// ── Quotes ──────────────────────────────────────────────────────────

async function handleQuotes(req: VercelRequest, res: VercelResponse, db: any) {
  if (req.method === 'GET') {
    const { data, error } = await db
      .from('quotes')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(500)
    if (error) throw error
    return res.status(200).json({ quotes: data || [] })
  }

  if (req.method === 'POST') {
    const v = validateBatch(QuoteRowSchema, req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const rows = v.items.map((q) => ({
      id: q.id,
      name: q.name,
      email: q.email,
      phone: q.phone || '',
      cargo_type: q.cargoType || q.cargo_type || '',
      origin: q.origin || '',
      destination: q.destination || '',
      details: q.details || '',
      timestamp: q.timestamp || Date.now(),
      status: q.status || 'pending',
      notes: q.notes || [],
      language: q.language || 'es',
    }))
    const { error } = await db.from('quotes').upsert(rows, { onConflict: 'id' })
    if (error) throw error
    return res.status(200).json({ saved: true, count: rows.length })
  }

  if (req.method === 'DELETE') {
    const id = req.query.id as string
    if (!id) return res.status(400).json({ error: 'id query parameter required' })
    const { error } = await db.from('quotes').delete().eq('id', id)
    if (error) throw error
    return res.status(200).json({ deleted: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Documents ───────────────────────────────────────────────────────

async function handleDocuments(req: VercelRequest, res: VercelResponse, db: any) {
  if (req.method === 'GET') {
    let query = db.from('documents').select('*').order('uploaded_at', { ascending: false }).limit(500)
    const shipmentRef = req.query.shipmentRef as string
    if (shipmentRef) query = query.eq('shipment_ref', shipmentRef)
    const { data, error } = await query
    if (error) throw error
    const docs = (data || []).map((d: any) => ({
      id: d.id,
      shipmentRef: d.shipment_ref,
      name: d.name,
      type: d.type,
      uploadedAt: d.uploaded_at,
      uploadedBy: d.uploaded_by,
      url: d.url,
      data: d.data,
    }))
    return res.status(200).json({ documents: docs })
  }

  if (req.method === 'POST') {
    const v = validateBatch(DocumentRowSchema, req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const rows = v.items.map((d) => ({
      id: d.id,
      shipment_ref: d.shipmentRef || d.shipment_ref,
      name: d.name,
      type: d.type || '',
      uploaded_at: d.uploadedAt || d.uploaded_at || Date.now(),
      uploaded_by: d.uploadedBy || d.uploaded_by || '',
      url: d.url || '',
      data: d.data || '',
    }))
    const { error } = await db.from('documents').upsert(rows, { onConflict: 'id' })
    if (error) throw error
    return res.status(200).json({ saved: true, count: rows.length })
  }

  if (req.method === 'DELETE') {
    const id = req.query.id as string
    if (!id) return res.status(400).json({ error: 'id query parameter required' })
    const { error } = await db.from('documents').delete().eq('id', id)
    if (error) throw error
    return res.status(200).json({ deleted: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Reports ─────────────────────────────────────────────────────────
// GET  /api/data/reports           → list all (metadata only, no file_data)
// GET  /api/data/reports?id=xxx    → single report WITH file_data (for download)
// POST /api/data/reports           → bulk metadata sync (no file_data)
// POST /api/data/reports?mode=file → single report WITH file_data (for upload)
// DELETE /api/data/reports?id=xxx  → delete single report

async function handleReports(req: VercelRequest, res: VercelResponse, db: any) {
  if (req.method === 'GET') {
    // Single report with file data (for download)
    const reportId = req.query.id as string
    if (reportId) {
      const { data, error } = await db.from('reports').select('*').eq('id', reportId).single()
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'Report not found' })
      return res.status(200).json({
        report: {
          id: data.id,
          shipmentRef: data.shipment_ref,
          containerNumber: data.container_number || '',
          title: data.title,
          content: data.content,
          fileName: data.file_name,
          fileType: data.file_type,
          fileData: data.file_data,
          createdAt: data.created_at_ts,
          createdBy: data.created_by,
        }
      })
    }

    // Bulk list — fetch all then strip file_data in response (robust even if schema changes)
    let query = db.from('reports').select('*').order('created_at_ts', { ascending: false }).limit(500)
    const shipmentRef = req.query.shipmentRef as string
    if (shipmentRef) query = query.eq('shipment_ref', shipmentRef)
    const { data, error } = await query
    if (error) throw error
    const reports = (data || []).map((r: any) => ({
      id: r.id,
      shipmentRef: r.shipment_ref,
      containerNumber: r.container_number || '',
      title: r.title,
      content: r.content,
      fileName: r.file_name,
      fileType: r.file_type,
      // file_data intentionally excluded from bulk response
      createdAt: r.created_at_ts,
      createdBy: r.created_by,
    }))
    return res.status(200).json({ reports })
  }

  if (req.method === 'POST') {
    const mode = req.query.mode as string

    // Build row helper — optionally includes container_number if available
    const buildRow = (r: any, includeFile: boolean) => {
      const row: Record<string, unknown> = {
        id: r.id,
        shipment_ref: r.shipmentRef || r.shipment_ref,
        title: r.title,
        content: r.content || '',
        file_name: r.fileName || r.file_name || '',
        file_type: r.fileType || r.file_type || '',
        created_at_ts: r.createdAt || r.created_at_ts || Date.now(),
        created_by: r.createdBy || r.created_by || '',
      }
      // container_number — include but tolerate if column doesn't exist yet
      const cn = r.containerNumber || r.container_number || ''
      if (cn) row.container_number = cn
      if (includeFile) row.file_data = r.fileData || r.file_data || ''
      return row
    }

    // Single report WITH file (individual upload)
    if (mode === 'file') {
      const vR = validate(ReportRowSchema, req.body)
      if (!vR.ok) return res.status(400).json({ error: vR.error })
      const r = vR.data
      if (!r.id) return res.status(400).json({ error: 'Report object with id required' })
      const row = buildRow(r, true)
      // Always include container_number for individual saves
      row.container_number = r.containerNumber || r.container_number || ''
      let { error } = await db.from('reports').upsert(row, { onConflict: 'id' })
      // Retry without container_number if column doesn't exist
      if (error && error.message?.includes('container_number')) {
        delete row.container_number
        const retry = await db.from('reports').upsert(row, { onConflict: 'id' })
        error = retry.error
      }
      if (error) throw error
      return res.status(200).json({ saved: true })
    }

    // Bulk metadata sync (NO file_data)
    const vBulk = validateBatch(ReportRowSchema, req.body)
    if (!vBulk.ok) return res.status(400).json({ error: vBulk.error })
    const rows = vBulk.items.map(r => buildRow(r, false))
    let { error } = await db.from('reports').upsert(rows, { onConflict: 'id', ignoreDuplicates: false })
    // Retry without container_number if column doesn't exist
    if (error && error.message?.includes('container_number')) {
      const cleanRows = rows.map(r => { const { container_number, ...rest } = r as any; return rest })
      const retry = await db.from('reports').upsert(cleanRows, { onConflict: 'id', ignoreDuplicates: false })
      error = retry.error
    }
    if (error) throw error
    return res.status(200).json({ saved: true, count: rows.length })
  }

  if (req.method === 'DELETE') {
    const id = req.query.id as string
    if (!id) return res.status(400).json({ error: 'id query parameter required' })
    const { error } = await db.from('reports').delete().eq('id', id)
    if (error) throw error
    return res.status(200).json({ deleted: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Clients ─────────────────────────────────────────────────────────

async function handleClients(req: VercelRequest, res: VercelResponse, db: any) {
  if (req.method === 'GET') {
    const { data, error } = await db
      .from('clients')
      .select('*')
      .order('created_at_ts', { ascending: false })
      .limit(500)
    if (error) throw error

    const clients = (data || []).map((c: any) => ({
      id: c.id,
      email: c.email,
      name: c.name,
      company: c.company,
      createdAt: c.created_at_ts,
      clientePattern: c.cliente_pattern,
    }))
    return res.status(200).json({ clients })
  }

  if (req.method === 'POST') {
    const v = validateBatch(ClientRowSchema, req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const rows = v.items.map((c) => ({
      id: c.id,
      email: c.email,
      name: c.name,
      company: c.company || '',
      created_at_ts: c.createdAt || c.created_at_ts || Date.now(),
      cliente_pattern: c.clientePattern || '',
    }))

    // Detect brand-new clients (by email) BEFORE the upsert so we can
    // send welcome emails only for first-time creations, not edits.
    let newRows: typeof rows = []
    try {
      const incomingEmails = rows
        .map(r => (r.email || '').toLowerCase().trim())
        .filter(Boolean)
      if (incomingEmails.length > 0) {
        const { data: existing } = await db
          .from('clients')
          .select('email')
          .in('email', incomingEmails)
        const existingSet = new Set(
          (existing || []).map((c: any) => (c.email || '').toLowerCase().trim())
        )
        newRows = rows.filter(
          r => r.email && !existingSet.has(r.email.toLowerCase().trim())
        )
      }
    } catch (e) {
      console.warn('[clients] could not pre-check new emails:', e)
    }

    const { error } = await db.from('clients').upsert(rows, { onConflict: 'id' })
    if (error) throw error

    // Fire-and-forget welcome emails for new clients (does not block response).
    let welcomesSent = 0
    for (const r of newRows) {
      welcomesSent++
      sendMail({
        to: r.email,
        ...welcomeClientEmail({ name: r.name, email: r.email }),
      })
        .then(result => {
          if (!result.ok) console.warn(`[welcome-client] not sent to ${r.email}: ${result.error}`)
        })
        .catch(err => console.warn('[welcome-client] failed:', err))
    }

    return res.status(200).json({ saved: true, count: rows.length, welcomesSent })
  }

  if (req.method === 'DELETE') {
    const id = req.query.id as string
    if (!id) return res.status(400).json({ error: 'id query parameter required' })
    const { error } = await db.from('clients').delete().eq('id', id)
    if (error) throw error
    return res.status(200).json({ deleted: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Settings ────────────────────────────────────────────────────────

async function handleSettings(req: VercelRequest, res: VercelResponse, db: any) {
  if (req.method === 'GET') {
    const key = req.query.key as string
    if (key) {
      const { data, error } = await db.from('settings').select('*').eq('key', key).single()
      if (error && error.code !== 'PGRST116') throw error
      return res.status(200).json({ setting: data || null })
    }
    const { data, error } = await db.from('settings').select('*')
    if (error) throw error
    const settings: Record<string, any> = {}
    for (const row of data || []) settings[row.key] = row.value
    return res.status(200).json({ settings })
  }

  if (req.method === 'PUT') {
    const v = validate(SettingsUpsertSchema, req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const { key, value } = v.data
    const { error } = await db.from('settings').upsert({
      key,
      value: typeof value === 'object' && value !== null ? value : { v: value },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })
    if (error) throw error
    return res.status(200).json({ saved: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Notification Tasks ─────────────────────────────────────────────
// GET  /api/data/notification-tasks?range=today|overdue|upcoming|all
// PATCH /api/data/notification-tasks?id=xxx  → partial update (checkbox)
// POST  /api/data/notification-tasks         → upsert (create from confirm)
// DELETE /api/data/notification-tasks?id=xxx → skip/dismiss

async function handleNotificationTasks(req: VercelRequest, res: VercelResponse, db: any) {
  if (req.method === 'GET') {
    const range = (req.query.range as string) || 'all'
    const today = new Date().toISOString().split('T')[0]

    let query = db.from('notification_tasks')
      .select('*')
      .order('due_date', { ascending: true })
      .order('step_number', { ascending: true })

    if (range === 'today') {
      query = query.eq('due_date', today)
    } else if (range === 'overdue') {
      query = query.lt('due_date', today).eq('status', 'pending')
    } else if (range === 'upcoming') {
      query = query.gt('due_date', today).eq('status', 'pending')
    } else if (range === 'pending') {
      query = query.lte('due_date', today).eq('status', 'pending')
    }
    // 'all' = no extra filters

    query = query.limit(500)
    const { data, error } = await query
    if (error) throw error

    const tasks = (data || []).map((t: any) => ({
      id: t.id,
      shipmentRef: t.shipment_ref,
      containerNumber: t.container_number || '',
      operativa: t.operativa || 'CONTENEDOR',
      cliente: t.cliente,
      clientEmail: t.client_email || '',
      clientName: t.client_name || '',
      step: t.step,
      stepNumber: t.step_number,
      dueDate: t.due_date,
      salidaDate: t.salida_date,
      photosOk: t.photos_ok || false,
      reportOk: t.report_ok || false,
      emailSent: t.email_sent || false,
      emailSentAt: t.email_sent_at || null,
      emailThreadId: t.email_thread_id || '',
      emailSubject: t.email_subject || '',
      status: t.status || 'pending',
      notes: t.notes || '',
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    }))
    return res.status(200).json({ tasks })
  }

  if (req.method === 'POST') {
    const v = validateBatch(NotificationTaskRowSchema, req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const rows = v.items.map((t) => ({
      id: t.id,
      shipment_ref: t.shipmentRef || t.shipment_ref,
      container_number: t.containerNumber || t.container_number || '',
      cliente: t.cliente || '',
      client_email: t.clientEmail || t.client_email || '',
      client_name: t.clientName || t.client_name || '',
      step: t.step,
      step_number: t.stepNumber ?? t.step_number ?? 0,
      due_date: t.dueDate || t.due_date,
      salida_date: t.salidaDate || t.salida_date || '',
      photos_ok: t.photosOk ?? t.photos_ok ?? false,
      report_ok: t.reportOk ?? t.report_ok ?? false,
      email_sent: t.emailSent ?? t.email_sent ?? false,
      email_sent_at: t.emailSentAt || t.email_sent_at || null,
      status: t.status || 'pending',
      notes: t.notes || '',
      updated_at: new Date().toISOString(),
    }))
    const { error } = await db.from('notification_tasks').upsert(rows, { onConflict: 'id' })
    if (error) throw error
    return res.status(200).json({ saved: true, count: rows.length })
  }

  if (req.method === 'PATCH') {
    const id = req.query.id as string
    if (!id) return res.status(400).json({ error: 'id query parameter required' })
    const vP = validate(NotificationTaskPatchSchema, req.body)
    if (!vP.ok) return res.status(400).json({ error: vP.error })
    const body = vP.data
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    // Map camelCase to snake_case for allowed fields
    if (body.photosOk !== undefined) updates.photos_ok = body.photosOk
    if (body.reportOk !== undefined) updates.report_ok = body.reportOk
    if (body.emailSent !== undefined) {
      updates.email_sent = body.emailSent
      if (body.emailSent) updates.email_sent_at = new Date().toISOString()
    }
    if (body.clientEmail !== undefined) updates.client_email = body.clientEmail
    if (body.clientName !== undefined) updates.client_name = body.clientName
    if (body.status !== undefined) updates.status = body.status
    if (body.notes !== undefined) updates.notes = body.notes
    const { error } = await db.from('notification_tasks').update(updates).eq('id', id)
    if (error) throw error
    return res.status(200).json({ updated: true })
  }

  if (req.method === 'DELETE') {
    const id = req.query.id as string
    if (!id) return res.status(400).json({ error: 'id query parameter required' })
    const { error } = await db.from('notification_tasks').delete().eq('id', id)
    if (error) throw error
    return res.status(200).json({ deleted: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Origin Photos ──────────────────────────────────────────────────
// GET  /api/data/origin-photos              → list all (thumbnails, no file_data)
// GET  /api/data/origin-photos?id=xxx       → single photo WITH file_data
// POST /api/data/origin-photos?mode=file    → upload single photo
// DELETE /api/data/origin-photos?id=xxx     → delete single photo

async function handleOriginPhotos(req: VercelRequest, res: VercelResponse, db: any) {
  if (req.method === 'GET') {
    const photoId = req.query.id as string
    if (photoId) {
      const { data, error } = await db.from('origin_photos').select('*').eq('id', photoId).single()
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'Photo not found' })
      return res.status(200).json({
        photo: {
          id: data.id,
          shipmentRef: data.shipment_ref,
          containerNumber: data.container_number || '',
          caption: data.caption || '',
          photoType: data.photo_type || 'origen',
          fileName: data.file_name,
          fileType: data.file_type,
          fileData: data.file_data,
          thumbnailData: data.thumbnail_data,
          createdAt: data.created_at_ts,
          createdBy: data.created_by,
        }
      })
    }

    // Bulk list — thumbnails included, file_data excluded
    let query = db.from('origin_photos')
      .select('id, shipment_ref, container_number, caption, photo_type, file_name, file_type, thumbnail_data, created_at_ts, created_by')
      .order('created_at_ts', { ascending: false })
      .limit(500)
    const shipmentRef = req.query.shipmentRef as string
    if (shipmentRef) query = query.eq('shipment_ref', shipmentRef)
    const { data, error } = await query
    if (error) throw error
    const photos = (data || []).map((p: any) => ({
      id: p.id,
      shipmentRef: p.shipment_ref,
      containerNumber: p.container_number || '',
      caption: p.caption || '',
      photoType: p.photo_type || 'origen',
      fileName: p.file_name,
      fileType: p.file_type,
      thumbnailData: p.thumbnail_data,
      createdAt: p.created_at_ts,
      createdBy: p.created_by,
    }))
    return res.status(200).json({ photos })
  }

  if (req.method === 'POST') {
    const mode = req.query.mode as string
    if (mode !== 'file') {
      return res.status(400).json({ error: 'Use ?mode=file to upload a photo' })
    }
    const vP = validate(OriginPhotoRowSchema, req.body)
    if (!vP.ok) return res.status(400).json({ error: vP.error })
    const p = vP.data
    if (!p.id) return res.status(400).json({ error: 'Photo object with id required' })
    const row = {
      id: p.id,
      shipment_ref: p.shipmentRef || p.shipment_ref,
      container_number: p.containerNumber || p.container_number || '',
      caption: p.caption || '',
      photo_type: p.photoType || p.photo_type || 'origen',
      file_name: p.fileName || p.file_name || '',
      file_type: p.fileType || p.file_type || '',
      file_data: p.fileData || p.file_data || '',
      thumbnail_data: p.thumbnailData || p.thumbnail_data || '',
      created_at_ts: p.createdAt || p.created_at_ts || Date.now(),
      created_by: p.createdBy || p.created_by || '',
    }
    const { error } = await db.from('origin_photos').upsert(row, { onConflict: 'id' })
    if (error) throw error
    return res.status(200).json({ saved: true })
  }

  if (req.method === 'DELETE') {
    const id = req.query.id as string
    if (!id) return res.status(400).json({ error: 'id query parameter required' })
    const { error } = await db.from('origin_photos').delete().eq('id', id)
    if (error) throw error
    return res.status(200).json({ deleted: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Shipments Cache ─────────────────────────────────────────────────

async function handleShipmentsCache(req: VercelRequest, res: VercelResponse, db: any) {
  if (req.method === 'GET') {
    const { data, error } = await db
      .from('shipments_cache')
      .select('*')
      .eq('id', 1)
      .single()
    if (error && error.code !== 'PGRST116') throw error
    return res.status(200).json({
      shipments: data?.data || [],
      syncedAt: data?.synced_at || null,
    })
  }

  if (req.method === 'POST') {
    // Minimal shape validation — admin-only, but cache poisons downstream /api/tracking
    const ShipmentsCacheSchema = z.object({
      shipments: z.array(z.record(z.unknown())).max(10000),
    })
    const v = validate(ShipmentsCacheSchema, req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const { shipments } = v.data
    const { error } = await db.from('shipments_cache').upsert({
      id: 1,
      data: shipments,
      synced_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    if (error) throw error
    return res.status(200).json({ saved: true, count: shipments.length })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Partner Shipments (depot/transport filtered) ────────────────────

async function handlePartnerShipments(req: VercelRequest, res: VercelResponse, db: any, payload: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { data, error } = await db.from('shipments_cache').select('*').eq('id', 1).single()
  if (error && error.code !== 'PGRST116') throw error

  const allShipments: any[] = data?.data || []
  // Support both legacy (depotName/transportName) and new (filterValue) JWT payloads.
  const rawFilter: string = payload.filterValue || payload.depotName || payload.transportName || ''
  const filterValueUpper = rawFilter.trim().toUpperCase()
  const filtered = allShipments.map((shipment: any) => {
    const operativas: any[] = shipment.operativas || []
    const matchingOps = operativas.filter((op: any) => {
      if (payload.role === 'depot') {
        return (op.DEPOSITO || '').trim().toUpperCase() === filterValueUpper
      }
      if (payload.role === 'transport') {
        // Exact match case-insensitive — split on common separators
        // ("/", ",", "+") to support entries like "MARITIMA / URUGUAY".
        const raw: string = op.TRANSPORTE || ''
        if (!raw) return false
        const parts = raw.split(/[\/,+]/).map((t: string) => t.trim().toUpperCase()).filter(Boolean)
        return parts.some((t: string) => t === filterValueUpper)
      }
      return false
    })
    if (matchingOps.length === 0) return null
    return { ...shipment, operativas: matchingOps }
  }).filter(Boolean)

  return res.status(200).json({ shipments: filtered, syncedAt: data?.synced_at || null })
}

// ── Partner Users (admin CRUD) ──────────────────────────────────────

async function handlePartnerUsers(req: VercelRequest, res: VercelResponse, db: any) {
  if (req.method === 'GET') {
    const { data, error } = await db.from('partner_users').select('*').order('created_at', { ascending: false }).limit(500)
    if (error) throw error
    return res.status(200).json({ users: (data || []).map((u: any) => ({
      id: u.id, email: u.email, name: u.name, role: u.role,
      filterValue: u.filter_value, active: u.active ?? true, createdAt: u.created_at,
    })) })
  }

  if (req.method === 'POST') {
    const v = validate(PartnerUserCreateSchema, req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const { email, name, password, role, filterValue } = v.data
    const cleanEmail = email.toLowerCase().trim()
    const cleanName = name.trim()
    const password_hash = await hashPassword(password)
    const { data, error } = await db.from('partner_users').insert({
      email: cleanEmail, name: cleanName,
      password_hash, role, filter_value: filterValue, active: true,
    }).select('id').single()
    if (error) throw error

    // Fire-and-forget welcome email — never block response or include password.
    sendMail({
      to: cleanEmail,
      ...welcomePartnerEmail({
        name: cleanName,
        email: cleanEmail,
        role: role as 'depot' | 'transport',
        filterValue,
      }),
    })
      .then(result => {
        if (!result.ok) console.warn(`[welcome-partner] not sent to ${cleanEmail}: ${result.error}`)
      })
      .catch(err => console.warn('[welcome-partner] failed:', err))

    return res.status(201).json({ created: true, id: data.id, welcomeSent: true })
  }

  if (req.method === 'PATCH') {
    const id = req.query.id as string
    if (!id) return res.status(400).json({ error: 'id required' })
    const vP = validate(PartnerUserPatchSchema, req.body)
    if (!vP.ok) return res.status(400).json({ error: vP.error })
    const body = vP.data
    const updates: Record<string, unknown> = {}
    if (body.email !== undefined) updates.email = body.email.toLowerCase().trim()
    if (body.name !== undefined) updates.name = body.name.trim()
    if (body.password !== undefined) updates.password_hash = await hashPassword(body.password)
    if (body.role !== undefined) updates.role = body.role
    if (body.filterValue !== undefined) updates.filter_value = body.filterValue
    if (body.active !== undefined) updates.active = body.active
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields' })
    const { error } = await db.from('partner_users').update(updates).eq('id', id)
    if (error) throw error
    return res.status(200).json({ updated: true })
  }

  if (req.method === 'DELETE') {
    const id = req.query.id as string
    if (!id) return res.status(400).json({ error: 'id required' })
    const { error } = await db.from('partner_users').delete().eq('id', id)
    if (error) throw error
    return res.status(200).json({ deleted: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Trucks ─────────────────────────────────────────────────────────

function mapTruckRowToApi(t: any) {
  return {
    id: t.id,
    code: t.code,
    status: t.status,
    isSider: t.is_sider,
    transport: t.transport || '',
    driver: t.driver || '',
    plate: t.plate || '',
    loadDate: t.load_date || '',
    departureDate: t.departure_date || '',
    arrivalDate: t.arrival_date || '',
    notes: t.notes || '',
    createdAt: t.created_at_ts,
    updatedAt: t.updated_at_ts,
  }
}

async function handleTrucks(req: VercelRequest, res: VercelResponse, db: any) {
  if (req.method === 'GET') {
    const id = req.query.id as string
    if (id) {
      const { data, error } = await db.from('trucks').select('*').eq('id', id).single()
      if (error && error.code !== 'PGRST116') throw error
      if (!data) return res.status(404).json({ error: 'Truck not found' })
      return res.status(200).json({ truck: mapTruckRowToApi(data) })
    }
    const { data, error } = await db
      .from('trucks')
      .select('*')
      .order('updated_at_ts', { ascending: false })
      .limit(1000)
    if (error) throw error
    return res.status(200).json({ trucks: (data || []).map(mapTruckRowToApi) })
  }

  if (req.method === 'POST') {
    const v = validateBatch(TruckRowSchema, req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const now = Date.now()
    const rows = v.items.map((t) => {
      const code = t.code || ''
      const isSider = t.isSider ?? t.is_sider ?? false
      return {
        id: t.id,
        code,
        status: t.status || 'planning',
        is_sider: isSider,
        transport: t.transport || '',
        driver: t.driver || '',
        plate: t.plate || '',
        load_date: t.loadDate || t.load_date || null,
        departure_date: t.departureDate || t.departure_date || null,
        arrival_date: t.arrivalDate || t.arrival_date || null,
        notes: t.notes || '',
        created_at_ts: t.createdAt || t.created_at_ts || now,
        updated_at_ts: now,
      }
    })
    const { error } = await db.from('trucks').upsert(rows, { onConflict: 'id' })
    if (error) throw error
    return res.status(200).json({ saved: true, count: rows.length })
  }

  if (req.method === 'DELETE') {
    const id = req.query.id as string
    if (!id) return res.status(400).json({ error: 'id required' })
    // truck_loads have ON DELETE CASCADE
    const { error } = await db.from('trucks').delete().eq('id', id)
    if (error) throw error
    return res.status(200).json({ deleted: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Truck Loads ────────────────────────────────────────────────────

function mapTruckLoadRowToApi(l: any) {
  return {
    id: l.id,
    truckId: l.truck_id,
    sourceType: l.source_type,
    sourceRef: l.source_ref,
    client: l.client || '',
    fiscal: l.fiscal || '',
    kg: Number(l.kg) || 0,
    m3: Number(l.m3) || 0,
    pkgs: Number(l.pkgs) || 0,
    description: l.description || '',
    mvdArrival: l.mvd_arrival || '',
    desconsolDate: l.desconsol_date || '',
    overrides: l.overrides || {},
    position: l.position || 0,
  }
}

async function handleTruckLoads(req: VercelRequest, res: VercelResponse, db: any) {
  if (req.method === 'GET') {
    const truckId = req.query.truckId as string
    let query = db.from('truck_loads').select('*').order('position', { ascending: true }).limit(5000)
    if (truckId) query = query.eq('truck_id', truckId)
    const { data, error } = await query
    if (error) throw error
    return res.status(200).json({ loads: (data || []).map(mapTruckLoadRowToApi) })
  }

  if (req.method === 'POST') {
    const v = validateBatch(TruckLoadRowSchema, req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const rows = v.items.map((l) => ({
      id: l.id,
      truck_id: l.truckId || l.truck_id,
      source_type: l.sourceType || l.source_type || 'fcl',
      source_ref: l.sourceRef || l.source_ref,
      client: l.client || '',
      fiscal: l.fiscal || '',
      kg: l.kg ?? 0,
      m3: l.m3 ?? 0,
      pkgs: l.pkgs ?? 0,
      description: l.description || '',
      mvd_arrival: l.mvdArrival || l.mvd_arrival || null,
      desconsol_date: l.desconsolDate || l.desconsol_date || null,
      overrides: l.overrides || {},
      position: l.position ?? 0,
    }))
    const { error } = await db.from('truck_loads').upsert(rows, { onConflict: 'id' })
    if (error) throw error
    return res.status(200).json({ saved: true, count: rows.length })
  }

  if (req.method === 'DELETE') {
    const id = req.query.id as string
    const truckId = req.query.truckId as string
    if (id) {
      const { error } = await db.from('truck_loads').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ deleted: true })
    }
    if (truckId) {
      const { error } = await db.from('truck_loads').delete().eq('truck_id', truckId)
      if (error) throw error
      return res.status(200).json({ deleted: true })
    }
    return res.status(400).json({ error: 'id or truckId required' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── LCL / Air shipments ────────────────────────────────────────────

function mapLclAirRowToApi(s: any) {
  return {
    id: s.id,
    ref: s.ref,
    modality: s.modality,
    client: s.client || '',
    origin: s.origin || '',
    mblHbl: s.mbl_hbl || '',
    etaMvd: s.eta_mvd || '',
    desconsolDate: s.desconsol_date || '',
    pkgs: Number(s.pkgs) || 0,
    kg: Number(s.kg) || 0,
    m3: Number(s.m3) || 0,
    fiscal: s.fiscal || '',
    description: s.description || '',
    wood: !!s.wood,
    status: s.status || 'en_origen',
    notes: s.notes || '',
    createdAt: s.created_at_ts,
  }
}

async function handleLclAir(req: VercelRequest, res: VercelResponse, db: any) {
  if (req.method === 'GET') {
    const { data, error } = await db
      .from('lcl_air_shipments')
      .select('*')
      .order('created_at_ts', { ascending: false })
      .limit(2000)
    if (error) throw error
    return res.status(200).json({ shipments: (data || []).map(mapLclAirRowToApi) })
  }

  if (req.method === 'POST') {
    const v = validateBatch(LclAirRowSchema, req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const now = Date.now()
    const rows = v.items.map((s) => ({
      id: s.id,
      ref: s.ref,
      modality: s.modality,
      client: s.client || '',
      origin: s.origin || '',
      mbl_hbl: s.mblHbl || s.mbl_hbl || '',
      eta_mvd: s.etaMvd || s.eta_mvd || null,
      desconsol_date: s.desconsolDate || s.desconsol_date || null,
      pkgs: s.pkgs ?? 0,
      kg: s.kg ?? 0,
      m3: s.m3 ?? 0,
      fiscal: s.fiscal || '',
      description: s.description || '',
      wood: !!s.wood,
      status: s.status || 'en_origen',
      notes: s.notes || '',
      created_at_ts: s.createdAt || s.created_at_ts || now,
    }))
    const { error } = await db.from('lcl_air_shipments').upsert(rows, { onConflict: 'id' })
    if (error) throw error
    return res.status(200).json({ saved: true, count: rows.length })
  }

  if (req.method === 'DELETE') {
    const id = req.query.id as string
    if (!id) return res.status(400).json({ error: 'id required' })
    const { error } = await db.from('lcl_air_shipments').delete().eq('id', id)
    if (error) throw error
    return res.status(200).json({ deleted: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Truck counter (atomic increment via RPC fallback) ──────────────
// POST /api/data/truck-counter  body { prefix: 'C' | 'LCL' | 'AIR' }
// Returns { code: 'C430' } — also persists the new last_number.

async function handleTruckCounter(req: VercelRequest, res: VercelResponse, db: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const v = validate(TruckCounterRequestSchema, req.body)
  if (!v.ok) return res.status(400).json({ error: v.error })
  const { prefix } = v.data

  // Read current value, increment, write back. Service-role bypasses RLS.
  // For low write contention (1 admin) this is fine without a transaction.
  const { data: current, error: readErr } = await db
    .from('truck_counter')
    .select('last_number')
    .eq('prefix', prefix)
    .single()
  if (readErr && readErr.code !== 'PGRST116') throw readErr

  const next = ((current?.last_number as number | undefined) ?? 0) + 1
  const { error: upErr } = await db
    .from('truck_counter')
    .upsert({ prefix, last_number: next }, { onConflict: 'prefix' })
  if (upErr) throw upErr

  // Format code: C430, LCL-0001, AIR-0001
  const code = prefix === 'C'
    ? `C${next}`
    : `${prefix}-${String(next).padStart(4, '0')}`
  return res.status(200).json({ code, number: next, prefix })
}

// ── Billing overlay (pendiente / facturada / no_aplica per ref) ────
// GET    /api/data/billing            → all overlay rows
// POST   /api/data/billing            → upsert one/many rows
// DELETE /api/data/billing?ref=xxx    → remove the overlay (back to derived state)

function mapBillingRowToApi(b: any) {
  return {
    ref: b.ref,
    status: b.status,
    invoiceNumber: b.invoice_number || '',
    invoicedAt: b.invoiced_at || null,
    invoicedBy: b.invoiced_by || '',
    updatedAt: b.updated_at || '',
  }
}

async function handleBilling(req: VercelRequest, res: VercelResponse, db: any) {
  if (req.method === 'GET') {
    const { data, error } = await db
      .from('shipment_billing')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(5000)
    if (error) throw error
    return res.status(200).json({ billing: (data || []).map(mapBillingRowToApi) })
  }

  if (req.method === 'POST') {
    const v = validateBatch(BillingRowSchema, req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const nowIso = new Date().toISOString()
    const rows = v.items.map((b) => ({
      ref: b.ref,
      status: b.status,
      invoice_number: b.invoiceNumber || b.invoice_number || '',
      // Only stamp invoiced_at/by when status=facturada; clear otherwise.
      invoiced_at: b.status === 'facturada'
        ? (b.invoicedAt || b.invoiced_at || nowIso)
        : null,
      invoiced_by: b.status === 'facturada'
        ? (b.invoicedBy || b.invoiced_by || '')
        : '',
      updated_at: nowIso,
    }))
    const { error } = await db.from('shipment_billing').upsert(rows, { onConflict: 'ref' })
    if (error) throw error
    return res.status(200).json({ saved: true, count: rows.length })
  }

  if (req.method === 'DELETE') {
    const ref = req.query.ref as string
    if (!ref) return res.status(400).json({ error: 'ref query parameter required' })
    const { error } = await db.from('shipment_billing').delete().eq('ref', ref)
    if (error) throw error
    return res.status(200).json({ deleted: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Operators (lista editable de operativos) ───────────────────────
// GET /api/data/operators · POST upsert · DELETE ?id=

function mapOperatorRowToApi(o: any) {
  return {
    id: o.id,
    name: o.name,
    modes: o.modes || [],
    color: o.color || '',
    active: o.active ?? true,
    createdAt: o.created_at_ts,
  }
}

async function handleOperators(req: VercelRequest, res: VercelResponse, db: any) {
  if (req.method === 'GET') {
    const { data, error } = await db.from('operators').select('*').order('name', { ascending: true }).limit(500)
    if (error) throw error
    return res.status(200).json({ operators: (data || []).map(mapOperatorRowToApi) })
  }

  if (req.method === 'POST') {
    const v = validateBatch(OperatorRowSchema, req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const now = Date.now()
    const rows = v.items.map((o) => ({
      id: o.id,
      name: o.name,
      modes: o.modes || [],
      color: o.color || '',
      active: o.active ?? true,
      created_at_ts: o.createdAt || o.created_at_ts || now,
    }))
    const { error } = await db.from('operators').upsert(rows, { onConflict: 'id' })
    if (error) throw error
    return res.status(200).json({ saved: true, count: rows.length })
  }

  if (req.method === 'DELETE') {
    const id = req.query.id as string
    if (!id) return res.status(400).json({ error: 'id required' })
    const { error } = await db.from('operators').delete().eq('id', id)
    if (error) throw error
    return res.status(200).json({ deleted: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Unified shipments (LCL/aéreo/terrestre + futuro FCL) ───────────
// GET    /api/data/shipments            → lista
// PATCH  /api/data/shipments?id=xxx     → update parcial (whitelist)
// POST   /api/data/shipments            → upsert filas completas
// DELETE /api/data/shipments?id=xxx     → borrar

const SHIPMENT_COLS = new Set([
  'ref','client_ref','mode','agente','cliente','shipper','incoterm','pkgs','kg','m3',
  'doc_number','origin','etd','eta','seguimiento','contenedor','buque','linea','transbordo',
  'seguro','certi','telex','impresa','despacho','deposito','fecha_consol','transporte','camion',
  'dest_country','discharge_port','dest_port','fiscal','wood','no_apilable','ftl_ltl','costo_extra','observacion','status',
  'operator_id','notes','archived','source',
])

async function handleShipments(req: VercelRequest, res: VercelResponse, db: any) {
  if (req.method === 'GET') {
    const { data, error } = await db.from('shipments').select('*').order('ref', { ascending: true }).limit(5000)
    if (error) throw error
    return res.status(200).json({ shipments: data || [] })
  }

  if (req.method === 'PATCH') {
    const id = req.query.id as string
    if (!id) return res.status(400).json({ error: 'id required' })
    const body = (req.body || {}) as Record<string, unknown>
    const updates: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body)) {
      if (SHIPMENT_COLS.has(k)) updates[k] = v
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields' })
    updates.updated_at_ts = Date.now()
    const { error } = await db.from('shipments').update(updates).eq('id', id)
    if (error) throw error
    return res.status(200).json({ updated: true })
  }

  if (req.method === 'POST') {
    const arr = Array.isArray(req.body) ? req.body : [req.body]
    const now = Date.now()
    const rows = arr.map((r: any) => {
      const row: Record<string, unknown> = { id: r.id, updated_at_ts: now }
      for (const k of SHIPMENT_COLS) if (r[k] !== undefined) row[k] = r[k]
      if (!row.created_at_ts) row.created_at_ts = r.created_at_ts || now
      return row
    })
    const { error } = await db.from('shipments').upsert(rows, { onConflict: 'id' })
    if (error) throw error
    return res.status(200).json({ saved: true, count: rows.length })
  }

  if (req.method === 'DELETE') {
    const id = req.query.id as string
    if (!id) return res.status(400).json({ error: 'id required' })
    // Eliminar es definitivo: solo se permite si la carga nunca estuvo en un
    // camión, no está facturada y no tiene fotos. Si no cumple → 409 con el
    // motivo (la UI ofrece archivar en su lugar). Al borrar se limpian los
    // overlays por ref (billing no facturada, asignación de operativo) para
    // no dejar huérfanos.
    const { data: ship, error: shipErr } = await db.from('shipments').select('id, ref').eq('id', id).maybeSingle()
    if (shipErr) throw shipErr
    if (!ship) return res.status(404).json({ error: 'Carga no encontrada' })
    const ref = (ship.ref || '').trim()
    if (ref) {
      const { data: loads, error: loadsErr } = await db.from('truck_loads').select('id, truck_id').eq('source_ref', ref)
      if (loadsErr) throw loadsErr
      if (loads?.length) {
        const ids = [...new Set(loads.map((l: any) => l.truck_id))]
        const { data: tks } = await db.from('trucks').select('code').in('id', ids)
        const codes = (tks || []).map((t: any) => t.code).join(', ')
        return res.status(409).json({ error: `No se puede eliminar: está/estuvo en el camión ${codes || 'N/D'}. Archivala en su lugar.` })
      }
      const { data: bill, error: billErr } = await db.from('shipment_billing').select('status').eq('ref', ref).maybeSingle()
      if (billErr) throw billErr
      if (bill?.status === 'facturada') {
        return res.status(409).json({ error: 'No se puede eliminar: la carga ya está FACTURADA. Archivala en su lugar.' })
      }
      const { count: fotos } = await db.from('origin_photos').select('id', { count: 'exact', head: true }).eq('shipment_ref', ref)
      if (fotos) {
        return res.status(409).json({ error: `No se puede eliminar: tiene ${fotos} foto(s) asociadas. Archivala en su lugar.` })
      }
      if (bill) await db.from('shipment_billing').delete().eq('ref', ref)
      await db.from('operator_assignments').delete().eq('ref', ref)
    }
    const { error } = await db.from('shipments').delete().eq('id', id)
    if (error) throw error
    return res.status(200).json({ deleted: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Operator assignments (overlay ref → operativo) ─────────────────
// GET /api/data/operator-assignments · POST upsert · DELETE ?ref=

async function handleOperatorAssignments(req: VercelRequest, res: VercelResponse, db: any) {
  if (req.method === 'GET') {
    const { data, error } = await db.from('operator_assignments').select('*').limit(5000)
    if (error) throw error
    const rows = (data || []).map((a: any) => ({
      ref: a.ref,
      operatorId: a.operator_id ?? null,
      updatedAt: a.updated_at || '',
    }))
    return res.status(200).json({ assignments: rows })
  }

  if (req.method === 'POST') {
    const v = validateBatch(OperatorAssignmentRowSchema, req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const nowIso = new Date().toISOString()
    const rows = v.items.map((a) => ({
      ref: a.ref,
      operator_id: a.operatorId ?? a.operator_id ?? null,
      updated_at: nowIso,
    }))
    const { error } = await db.from('operator_assignments').upsert(rows, { onConflict: 'ref' })
    if (error) throw error
    return res.status(200).json({ saved: true, count: rows.length })
  }

  if (req.method === 'DELETE') {
    const ref = req.query.ref as string
    if (!ref) return res.status(400).json({ error: 'ref required' })
    const { error } = await db.from('operator_assignments').delete().eq('ref', ref)
    if (error) throw error
    return res.status(200).json({ deleted: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
