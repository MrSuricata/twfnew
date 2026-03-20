import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest } from '../_lib/jwt.js'
import { handleCors } from '../_lib/cors.js'
import { getSupabase } from '../_lib/supabase.js'

// ─── Combined Data API ───────────────────────────────────────────────
// Handles: /api/data/quotes, /api/data/documents, /api/data/reports,
//          /api/data/settings, /api/data/shipments-cache
// ─────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return

  // All data endpoints require admin auth
  const payload = authenticateRequest(req.headers.authorization)
  if (!payload || payload.role !== 'admin') {
    return res.status(401).json({ error: 'Admin authentication required' })
  }

  const entity = req.query.entity as string
  const db = getSupabase()

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
    if (error) throw error
    return res.status(200).json({ quotes: data || [] })
  }

  if (req.method === 'POST') {
    const body = req.body
    const items = Array.isArray(body) ? body : [body]
    const rows = items.map((q: any) => ({
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
    let query = db.from('documents').select('*').order('uploaded_at', { ascending: false })
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
    const body = req.body
    const items = Array.isArray(body) ? body : [body]
    const rows = items.map((d: any) => ({
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
    let query = db.from('reports').select('*').order('created_at_ts', { ascending: false })
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
      const r = req.body
      if (!r || !r.id) return res.status(400).json({ error: 'Report object with id required' })
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
    const body = req.body
    const items = Array.isArray(body) ? body : [body]
    const rows = items.map((r: any) => buildRow(r, false))
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
    const body = req.body
    const items = Array.isArray(body) ? body : [body]
    const rows = items.map((c: any) => ({
      id: c.id,
      email: c.email,
      name: c.name,
      company: c.company || '',
      created_at_ts: c.createdAt || c.created_at_ts || Date.now(),
      cliente_pattern: c.clientePattern || c.cliente_pattern || '',
    }))
    const { error } = await db.from('clients').upsert(rows, { onConflict: 'id' })
    if (error) throw error
    return res.status(200).json({ saved: true, count: rows.length })
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
    const { key, value } = req.body || {}
    if (!key) return res.status(400).json({ error: 'key is required' })
    const { error } = await db.from('settings').upsert({
      key,
      value: typeof value === 'object' ? value : { v: value },
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
    const body = req.body
    const items = Array.isArray(body) ? body : [body]
    const rows = items.map((t: any) => ({
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
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    const body = req.body || {}
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
    const p = req.body
    if (!p || !p.id) return res.status(400).json({ error: 'Photo object with id required' })
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
    const { shipments } = req.body || {}
    if (!Array.isArray(shipments)) {
      return res.status(400).json({ error: 'shipments array required' })
    }
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
