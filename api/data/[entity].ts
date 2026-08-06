import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest, auditUser, type TokenPayload, type AdminPayload } from '../_lib/jwt.js'
import { handleCors } from '../_lib/cors.js'
import { getSupabase } from '../_lib/supabase.js'
import { sendMail } from '../_lib/mail.js'
import { welcomeClientEmail, welcomePartnerEmail, resolveEmailBrand } from '../_lib/emailTemplates.js'
import { hashPassword } from '../_lib/password.js'
import { matchesClientePattern } from '../_lib/csvParser.js'
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
  PushSubscriptionSchema,
  PushPrefsPatchSchema,
  RefChecksUpsertSchema,
} from '../_lib/schemas.js'
import { rollupFromOperativasApi } from '../_lib/operativasRollup.js'
import { broadcastTrucksLive, clientIdFromRequest } from '../_lib/realtimeBroadcast.js'
import { z } from 'zod'
import { uploadPhotoObjects, deletePhotoObjects, signPhotoUrls, signPhotoUrl, THUMB_TTL, FULL_TTL } from '../_lib/photoStorage.js'

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

// ── Auditoría ──
// Registro best-effort de quién hizo qué (no bloquea la operación si falla).
function logAudit(db: any, payload: TokenPayload | null, action: string, entity: string, ref: string, details?: Record<string, unknown>) {
  try {
    db.from('audit_log')
      .insert({ usuario: auditUser(payload as any), action, entity, ref: ref || '', details: details || null })
      .then(() => {}, (e: any) => console.warn('[audit] insert failed:', e?.message))
  } catch (e: any) {
    console.warn('[audit] failed:', e?.message)
  }
}

/** owner = Brian (env vars) o usuario con level owner; tokens viejos sin level = owner. */
function isOwner(payload: TokenPayload | null): boolean {
  const p = payload as AdminPayload | null
  return !!p && p.role === 'admin' && p.level !== 'admin'
}

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
        return handleDocuments(req, res, db, payload)
      case 'reports':
        return handleReports(req, res, db, payload)
      case 'clients':
        return handleClients(req, res, db)
      case 'client-users':
        return handleClientUsers(req, res, db, payload)
      case 'settings':
        return handleSettings(req, res, db)
      case 'origin-photos':
        return handleOriginPhotos(req, res, db, payload)
      case 'notification-tasks':
        return handleNotificationTasks(req, res, db, payload)
      case 'shipments-cache':
        return handleShipmentsCache(req, res, db)
      case 'partner-users':
        return handlePartnerUsers(req, res, db)
      case 'trucks':
        return handleTrucks(req, res, db, payload)
      case 'truck-loads':
        return handleTruckLoads(req, res, db, payload)
      case 'lcl-air':
        return handleLclAir(req, res, db)
      case 'truck-counter':
        return handleTruckCounter(req, res, db)
      case 'billing':
        return handleBilling(req, res, db, payload)
      case 'ref-checks':
        return handleRefChecks(req, res, db, payload)
      case 'user-prefs':
        return handleUserPrefs(req, res, db, payload)
      case 'operators':
        return handleOperators(req, res, db)
      case 'operator-assignments':
        return handleOperatorAssignments(req, res, db)
      case 'shipments':
        return handleShipments(req, res, db, payload)
      case 'admin-users':
        return handleAdminUsers(req, res, db, payload)
      case 'push-subscriptions':
        return handlePushSubscriptions(req, res, db, payload)
      case 'audit-log':
        return handleAuditLog(req, res, db)
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

async function handleDocuments(req: VercelRequest, res: VercelResponse, db: any, payload: TokenPayload | null = null) {
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
    // Scoping por cliente: admin acotado solo ve documentos de SUS cargas.
    const allowed = await allowedRefsForPayload(db, payload)
    return res.status(200).json({ documents: filterByAllowedRef(docs, allowed, d => d.shipmentRef) })
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

async function handleReports(req: VercelRequest, res: VercelResponse, db: any, payload: TokenPayload | null = null) {
  if (req.method === 'GET') {
    // Single report with file data (for download)
    const reportId = req.query.id as string
    if (reportId) {
      const { data, error } = await db.from('reports').select('*').eq('id', reportId).single()
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'Report not found' })
      // Scoping: admin acotado no puede bajar un informe de una carga ajena.
      const allowedOne = await allowedRefsForPayload(db, payload)
      if (allowedOne && !allowedOne.has(refOf(data.shipment_ref))) return res.status(404).json({ error: 'Report not found' })
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
    const allowed = await allowedRefsForPayload(db, payload)
    return res.status(200).json({ reports: filterByAllowedRef(reports, allowed, r => r.shipmentRef) })
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
      razonSocial: c.razon_social || '',
      cuitDoc: c.cuit_doc || '',
      pais: c.pais || '',
      direccion: c.direccion || '',
      aliases: c.aliases || '',
    }))
    return res.status(200).json({ clients })
  }

  if (req.method === 'POST') {
    const v = validateBatch(ClientRowSchema, req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const rows = v.items.map((c) => ({
      id: c.id,
      email: (c.email || '').toLowerCase().trim(),
      name: c.name,
      company: c.company || '',
      created_at_ts: c.createdAt || c.created_at_ts || Date.now(),
      cliente_pattern: c.clientePattern || '',
      razon_social: c.razonSocial ?? c.razon_social ?? '',
      cuit_doc: c.cuitDoc ?? c.cuit_doc ?? '',
      pais: c.pais ?? '',
      direccion: c.direccion ?? '',
      aliases: c.aliases ?? '',
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
    // Marca según el hostname desde donde opera el admin (TWF o Mediterránea).
    const emailBrand = resolveEmailBrand(req.headers.origin || req.headers.referer)
    let welcomesSent = 0
    for (const r of newRows) {
      welcomesSent++
      sendMail({
        to: r.email,
        from: emailBrand.displayName,
        ...welcomeClientEmail({ name: r.name, email: r.email }, emailBrand),
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

// ── Usuarios del portal de clientes (client_users) ──────────────────
// Accesos con contraseña por cliente del catálogo (reemplaza el OTP).
// GET ?clientId= (o todos) · POST {clientId, email, name?, password} ·
// PATCH ?id= {active|password|name} · DELETE ?id=.
// Gate: cualquier admin (mismo criterio que 'clients'). El login vive en
// api/auth/admin-login.ts (type:'client').

async function handleClientUsers(req: VercelRequest, res: VercelResponse, db: any, payload: TokenPayload | null) {
  if (req.method === 'GET') {
    let q = db.from('client_users')
      .select('id, client_id, email, name, active, created_at, last_login') // nunca password_hash
      .order('created_at', { ascending: true })
      .limit(1000)
    const clientId = req.query.clientId as string
    if (clientId) q = q.eq('client_id', clientId)
    const { data, error } = await q
    if (error) throw error
    return res.status(200).json({ users: (data || []).map((u: any) => ({
      id: u.id,
      clientId: u.client_id,
      email: u.email,
      name: u.name || '',
      active: u.active ?? true,
      createdAt: u.created_at,
      lastLogin: u.last_login || null,
    })) })
  }

  if (req.method === 'POST') {
    const v = validate(z.object({
      clientId: z.string().min(1).max(100),
      email: z.string().email('El email no tiene un formato válido').max(200),
      name: z.string().max(200).optional(),
      password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(200),
    }), req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const { clientId, email, name, password } = v.data
    const cleanEmail = email.toLowerCase().trim()

    const { data: client } = await db.from('clients').select('id, name').eq('id', clientId).maybeSingle()
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' })

    const password_hash = await hashPassword(password)
    const { data: created, error } = await db.from('client_users').insert({
      client_id: clientId,
      email: cleanEmail,
      name: (name || '').trim(),
      password_hash,
      active: true,
    }).select('id').single()
    if (error) {
      if (String(error.code) === '23505') {
        return res.status(409).json({ error: `Ya existe un acceso con el email ${cleanEmail}` })
      }
      throw error
    }
    logAudit(db, payload, 'crear acceso cliente', 'client_users', cleanEmail, { client_id: clientId })

    // Email de bienvenida fire-and-forget (la contraseña NUNCA viaja por email;
    // se comunica por otro canal, igual que los partners).
    const emailBrand = resolveEmailBrand(req.headers.origin || req.headers.referer)
    try {
      sendMail({
        to: cleanEmail,
        from: emailBrand.displayName,
        ...welcomeClientEmail({ name: (name || '').trim() || client.name || cleanEmail, email: cleanEmail }, emailBrand),
      })
        .then(result => {
          if (!result.ok) console.warn(`[welcome-client-user] not sent to ${cleanEmail}: ${result.error}`)
        })
        .catch(err => console.warn('[welcome-client-user] failed:', err))
    } catch (err) {
      console.warn('[welcome-client-user] failed:', err)
    }

    return res.status(201).json({ created: true, id: created.id })
  }

  if (req.method === 'PATCH') {
    const id = req.query.id as string
    if (!id) return res.status(400).json({ error: 'id required' })
    const v = validate(z.object({
      active: z.boolean().optional(),
      password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(200).optional(),
      name: z.string().max(200).optional(),
    }), req.body || {})
    if (!v.ok) return res.status(400).json({ error: v.error })
    const updates: Record<string, unknown> = {}
    if (typeof v.data.active === 'boolean') updates.active = v.data.active
    if (v.data.password) updates.password_hash = await hashPassword(v.data.password)
    if (v.data.name !== undefined) updates.name = v.data.name.trim()
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields' })
    const { data: u, error } = await db.from('client_users').update(updates).eq('id', id).select('email').maybeSingle()
    if (error) throw error
    if (!u) return res.status(404).json({ error: 'Acceso no encontrado' })
    logAudit(db, payload, 'active' in updates
      ? (updates.active ? 'activar acceso cliente' : 'desactivar acceso cliente')
      : ('password_hash' in updates ? 'resetear contraseña cliente' : 'editar acceso cliente'),
      'client_users', u.email || id)
    return res.status(200).json({ updated: true })
  }

  if (req.method === 'DELETE') {
    const id = req.query.id as string
    if (!id) return res.status(400).json({ error: 'id required' })
    const { data: u } = await db.from('client_users').select('email').eq('id', id).maybeSingle()
    const { error } = await db.from('client_users').delete().eq('id', id)
    if (error) throw error
    logAudit(db, payload, 'eliminar acceso cliente', 'client_users', u?.email || id)
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

async function handleNotificationTasks(req: VercelRequest, res: VercelResponse, db: any, payload: TokenPayload | null = null) {
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
    // Scoping por cliente (la tarea trae `cliente` en su fila).
    return res.status(200).json({ tasks: scopeByAdminPattern(tasks, payload) })
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

async function handleOriginPhotos(req: VercelRequest, res: VercelResponse, db: any, payload: TokenPayload | null = null) {
  if (req.method === 'GET') {
    const photoId = req.query.id as string
    if (photoId) {
      const { data, error } = await db.from('origin_photos').select('*').eq('id', photoId).single()
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'Photo not found' })
      // Scoping: admin acotado no puede ver una foto de una carga ajena.
      const allowedOne = await allowedRefsForPayload(db, payload)
      if (allowedOne && !allowedOne.has(refOf(data.shipment_ref))) return res.status(404).json({ error: 'Photo not found' })
      return res.status(200).json({
        photo: {
          id: data.id,
          shipmentRef: data.shipment_ref,
          containerNumber: data.container_number || '',
          caption: data.caption || '',
          photoType: data.photo_type || 'origen',
          fileName: data.file_name,
          fileType: data.file_type,
          storagePath: data.storage_path || null,
          thumbPath: data.thumb_path || null,
          fullUrl: data.storage_path ? await signPhotoUrl(db, data.storage_path, FULL_TTL) : null,
          fileData: data.storage_path ? '' : data.file_data,   // fallback si no migrada
          thumbnailData: data.thumbnail_data,
          createdAt: data.created_at_ts,
          createdBy: data.created_by,
        }
      })
    }

    // Bulk list — thumbnails included, file_data excluded
    let query = db.from('origin_photos')
      .select('id, shipment_ref, container_number, caption, photo_type, file_name, file_type, thumbnail_data, storage_path, thumb_path, created_at_ts, created_by')
      .order('created_at_ts', { ascending: false })
      .limit(500)
    const shipmentRef = req.query.shipmentRef as string
    if (shipmentRef) query = query.eq('shipment_ref', shipmentRef)
    const { data, error } = await query
    if (error) throw error
    const thumbPaths = (data || []).map((p: { thumb_path: string | null }) => p.thumb_path).filter(Boolean)
    const signed = await signPhotoUrls(db, thumbPaths, THUMB_TTL)
    const photos = (data || []).map((p: { id: string; shipment_ref: string; container_number: string | null; caption: string | null; photo_type: string | null; file_name: string; file_type: string; thumb_path: string | null; storage_path: string | null; thumbnail_data: string | null; created_at_ts: number; created_by: string }) => ({
      id: p.id,
      shipmentRef: p.shipment_ref,
      containerNumber: p.container_number || '',
      caption: p.caption || '',
      photoType: p.photo_type || 'origen',
      fileName: p.file_name,
      fileType: p.file_type,
      thumbPath: p.thumb_path || null,
      storagePath: p.storage_path || null,
      thumbnailUrl: p.thumb_path ? (signed.get(p.thumb_path) || null) : null,
      thumbnailData: p.thumb_path ? '' : p.thumbnail_data,   // fallback solo si no migrada
      createdAt: p.created_at_ts,
      createdBy: p.created_by,
    }))
    const allowed = await allowedRefsForPayload(db, payload)
    return res.status(200).json({ photos: filterByAllowedRef(photos, allowed, p => p.shipmentRef) })
  }

  if (req.method === 'POST') {
    const mode = req.query.mode as string
    // Migración idempotente base64 → Storage. Vive acá (y no como función
    // aparte) por el límite de 12 serverless functions del plan Hobby de Vercel.
    // El handler de /api/data ya validó rol admin antes de llegar acá.
    if (mode === 'migrate') {
      const MIGRATE_BATCH = 25
      const { data: pend, error: pErr } = await db
        .from('origin_photos')
        .select('id, shipment_ref, file_data, thumbnail_data')
        .is('storage_path', null)
        .order('created_at_ts', { ascending: true })
        .limit(MIGRATE_BATCH)
      if (pErr) throw pErr
      let migradas = 0
      for (const ph of (pend || [])) {
        try {
          const up = await uploadPhotoObjects(db, ph.shipment_ref || '', ph.id, ph.file_data || '', ph.thumbnail_data || '')
          if (!up.storagePath && !up.thumbPathOut) continue
          await db.from('origin_photos').update({ storage_path: up.storagePath, thumb_path: up.thumbPathOut }).eq('id', ph.id)
          migradas++
        } catch (err) {
          console.warn('[migrate-photos] foto', ph.id, 'falló:', (err as Error)?.message)
        }
      }
      const { count } = await db.from('origin_photos').select('id', { count: 'exact', head: true }).is('storage_path', null)
      return res.status(200).json({ migradas, restantes: count ?? 0 })
    }
    if (mode !== 'file') {
      return res.status(400).json({ error: 'Use ?mode=file to upload a photo' })
    }
    const vP = validate(OriginPhotoRowSchema, req.body)
    if (!vP.ok) return res.status(400).json({ error: vP.error })
    const p = vP.data
    if (!p.id) return res.status(400).json({ error: 'Photo object with id required' })
    const ref = p.shipmentRef || p.shipment_ref || ''
    // Subir a Storage; si falla, no escribimos la fila (evita huérfanos).
    let storagePath: string | null = null
    let thumbPathOut: string | null = null
    try {
      const up = await uploadPhotoObjects(db, ref, p.id, p.fileData || p.file_data || '', p.thumbnailData || p.thumbnail_data || '')
      storagePath = up.storagePath
      thumbPathOut = up.thumbPathOut
    } catch (e: any) {
      return res.status(500).json({ error: `No se pudo subir la foto a Storage: ${e?.message || 'error'}` })
    }
    const row = {
      id: p.id,
      shipment_ref: ref,
      container_number: p.containerNumber || p.container_number || '',
      caption: p.caption || '',
      photo_type: p.photoType || p.photo_type || 'origen',
      file_name: p.fileName || p.file_name || '',
      file_type: p.fileType || p.file_type || '',
      file_data: '',            // fotos nuevas: viven en Storage, no en la DB
      thumbnail_data: '',
      storage_path: storagePath,
      thumb_path: thumbPathOut,
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
    const { data: row } = await db.from('origin_photos').select('storage_path, thumb_path').eq('id', id).maybeSingle()
    if (row) await deletePhotoObjects(db, [row.storage_path, row.thumb_path])
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

  // Tras el flip (FCL_SOURCE_OF_TRUTH='db') la web es master de las FCL: viven en
  // la tabla `shipments` (source='fcl') y el shipments_cache quedó CONGELADO en el
  // cutover (sync.ts y tracking.ts ya no lo reescriben). Leer el cache acá le
  // mostraría a depósito/transporte el depósito/salida/transporte VIEJO (o cargas
  // reasignadas al partner equivocado). Se lee la fuente viva y se mapea al mismo
  // shape ParsedShipment que ya consume el filtro (operativas[] con claves MAYÚSCULA).
  let allShipments: any[]
  let syncedAt: string | null
  if (process.env.FCL_SOURCE_OF_TRUTH === 'db') {
    const { data: rows, error } = await db.from('shipments')
      .select('ref,cliente,etd,eta,contenedor,n_cntr,doc_number,linea,buque,terminal,tipo,libre,operativas,archived')
      .eq('source', 'fcl')
      .limit(5000)
    if (error) throw error
    allShipments = (rows || [])
      .filter((r: any) => !r.archived)
      .map((r: any) => ({
        REF: r.ref || '', CLIENTE: r.cliente || '', ETD: r.etd || '', ETA: r.eta || '',
        CNTR: r.contenedor || '', N: r.n_cntr || '', MBL: r.doc_number || '',
        LINEA: r.linea || '', BUQUE: r.buque || '', TERMINAL: r.terminal || '', TIPO: r.tipo || '',
        LIBRE_HASTA: r.libre || '',
        operativas: Array.isArray(r.operativas) ? r.operativas : [],
      }))
    syncedAt = new Date().toISOString()
  } else {
    const { data, error } = await db.from('shipments_cache').select('*').eq('id', 1).single()
    if (error && error.code !== 'PGRST116') throw error
    allShipments = data?.data || []
    syncedAt = data?.synced_at || null
  }
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
        const parts = raw.split(/[/,+]/).map((t: string) => t.trim().toUpperCase()).filter(Boolean)
        return parts.some((t: string) => t === filterValueUpper)
      }
      return false
    })
    if (matchingOps.length === 0) return null
    // Seguridad: depósito/transporte NO deben ver costos/flete de TWF (aunque la UI no
    // los muestre, llegaban en el JSON crudo). Se quitan los financieros; se conserva
    // CLIENTE + lo operativo (lo necesitan para operar).
    const safe = { ...shipment }
    delete safe.C_TERMINAL; delete safe.C_DEV; delete safe.LOCALES
    delete safe.FLETE; delete safe.FORMA_DE_PAGO; delete safe.VTO
    return { ...safe, operativas: matchingOps }
  }).filter(Boolean)

  return res.status(200).json({ shipments: filtered, syncedAt })
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
    // Marca según el hostname desde donde opera el admin (TWF o Mediterránea).
    const emailBrand = resolveEmailBrand(req.headers.origin || req.headers.referer)
    sendMail({
      to: cleanEmail,
      from: emailBrand.displayName,
      ...welcomePartnerEmail({
        name: cleanName,
        email: cleanEmail,
        role: role as 'depot' | 'transport',
        filterValue,
      }, emailBrand),
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
    draft: !!t.draft,
    pendingEdits: t.pending_edits || null,
    costDespacho: Number(t.cost_despacho) || 0,
    costFlete: Number(t.cost_flete) || 0,
    costCarga: Number(t.cost_carga) || 0,
  }
}

async function handleTrucks(req: VercelRequest, res: VercelResponse, db: any, payload: TokenPayload | null = null) {
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
    if (!v.ok) {
      logAudit(db, payload, 'guardado_rechazado', 'camion', 'batch', { error: v.error, filas: Array.isArray(req.body) ? req.body.length : 1 })
      return res.status(400).json({ error: v.error })
    }
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
        draft: t.draft ?? false,
        pending_edits: t.pendingEdits ?? t.pending_edits ?? null,
        cost_despacho: t.costDespacho ?? t.cost_despacho ?? 0,
        cost_flete: t.costFlete ?? t.cost_flete ?? 0,
        cost_carga: t.costCarga ?? t.cost_carga ?? 0,
      }
    })
    // Códigos duplicados DENTRO del lote = camión "fantasma" local (un alta
    // que falló a medias y quedó en el navegador). Antes esto tiraba abajo
    // TODO el guardado (y se perdían ediciones legítimas en silencio); ahora
    // nos quedamos con el más nuevo por código y seguimos.
    const byCode = new Map<string, (typeof rows)[number]>()
    const sinCodigo: typeof rows = []
    for (const r of rows) {
      if (!r.code) { sinCodigo.push(r); continue }
      const prev = byCode.get(r.code)
      if (!prev || (r.created_at_ts as number) >= (prev.created_at_ts as number)) byCode.set(r.code, r)
    }
    const deduped = [...byCode.values(), ...sinCodigo]
    // Conflicto REAL contra la DB (otro id ya usa ese código) → 409 amigable
    // (la DB además tiene el constraint trucks_code_key como respaldo).
    const codes = deduped.map(r => r.code).filter(Boolean)
    if (codes.length) {
      const { data: clash, error: clashErr } = await db.from('trucks').select('id, code').in('code', codes)
      if (clashErr) throw clashErr
      const conflict = (clash || []).find((c: any) => deduped.some(r => r.code === c.code && r.id !== c.id))
      if (conflict) return res.status(409).json({ error: `El código ${conflict.code} ya existe en otro camión — cambiale el código y volvé a guardar` })
    }
    // Pre-select estado anterior para auditoría de crear/publicar/despublicar
    // (fire-and-forget: fallo aquí no detiene el guardado).
    const ids = deduped.map(r => r.id)
    let prevById = new Map<string, { id: string; draft: boolean; code: string }>()
    try {
      const { data: prevRows } = await db.from('trucks').select('id, draft, code').in('id', ids)
      prevById = new Map((prevRows || []).map((r: { id: string; draft: boolean; code: string }) => [r.id, r]))
    } catch { /* ignorar: auditamos con lo que tenemos */ }

    const { error } = await db.from('trucks').upsert(deduped, { onConflict: 'id' })
    if (error) throw error
    // timbre co-edición: avisar a los demás browsers (el emisor se identifica
    // con clientId para poder ignorar su propio timbre)
    void broadcastTrucksLive('truck', undefined, clientIdFromRequest(req))

    // Auditar crear / publicar / despublicar (cambios de ciclo de vida únicamente)
    for (const row of deduped) {
      const prev = prevById.get(row.id)
      if (!prev) {
        logAudit(db, payload, 'crear', 'camion', row.code, { draft: row.draft })
      } else if (prev.draft === true && row.draft === false) {
        logAudit(db, payload, 'publicar', 'camion', row.code, {})
      } else if (prev.draft === false && row.draft === true) {
        logAudit(db, payload, 'despublicar', 'camion', row.code, {})
      }
      // Cambios de campos NO se auditan (evitar ruido por keystroke)
    }

    // Si un código manual supera el contador, subirlo para que el próximo
    // auto-generado no choque (editar a C500 → el próximo automático es C501).
    for (const r of deduped) {
      const m = /^(C)(\d+)$/.exec(r.code) || /^(LCL|AIR)-(\d+)$/.exec(r.code)
      if (!m) continue
      const prefix = m[1], n = parseInt(m[2], 10)
      const { data: cur } = await db.from('truck_counter').select('last_number').eq('prefix', prefix).single()
      if (((cur?.last_number as number | undefined) ?? 0) < n) {
        await db.from('truck_counter').upsert({ prefix, last_number: n }, { onConflict: 'prefix' })
      }
    }
    return res.status(200).json({ saved: true, count: deduped.length })
  }

  if (req.method === 'DELETE') {
    const id = req.query.id as string
    if (!id) return res.status(400).json({ error: 'id required' })
    // Pre-select para auditoría antes de borrar (ON DELETE CASCADE borra las cargas)
    let truckCode: string = id
    let cascadedRefs: string[] = []
    try {
      const { data: t } = await db.from('trucks').select('code').eq('id', id).maybeSingle()
      if (t?.code) truckCode = t.code
      const { data: ls } = await db.from('truck_loads').select('source_ref').eq('truck_id', id)
      cascadedRefs = (ls || []).map((l: { source_ref: string }) => l.source_ref).filter(Boolean)
    } catch { /* ignorar: auditar con lo que tenemos */ }

    // truck_loads have ON DELETE CASCADE
    const { error } = await db.from('trucks').delete().eq('id', id)
    if (error) throw error
    void broadcastTrucksLive('truck', id, clientIdFromRequest(req)) // timbre co-edición
    logAudit(db, payload, 'eliminar', 'camion', truckCode, { cargas_cascadeadas: cascadedRefs })
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
    // Contenedor concreto de la carga que viaja en este camión ('' = la ref
    // entera, para LCL/aéreo o líneas previas a 08/2026).
    cntr: l.cntr || '',
    client: l.client || '',
    fiscal: l.fiscal || '',
    kg: Number(l.kg) || 0,
    m3: Number(l.m3) || 0,
    pkgs: Number(l.pkgs) || 0,
    description: l.description || '',
    mvdArrival: l.mvd_arrival || '',
    desconsolDate: l.desconsol_date || '',
    bl: l.bl || '',
    stock: l.stock || '',
    wood: !!l.wood,
    overrides: l.overrides || {},
    position: l.position || 0,
    pending: l.pending || null,
  }
}

async function handleTruckLoads(req: VercelRequest, res: VercelResponse, db: any, payload: TokenPayload | null = null) {
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
    if (!v.ok) {
      // Batch rechazado: dejar rastro server-side aunque el cliente lo ignore.
      logAudit(db, payload, 'guardado_rechazado', 'camion', 'batch', { error: v.error, filas: Array.isArray(req.body) ? req.body.length : 1 })
      return res.status(400).json({ error: v.error })
    }
    const rows = v.items.map((l) => ({
      id: l.id,
      truck_id: l.truckId || l.truck_id,
      source_type: l.sourceType || l.source_type || 'fcl',
      source_ref: l.sourceRef || l.source_ref,
      cntr: l.cntr ?? '',
      client: l.client || '',
      fiscal: l.fiscal || '',
      kg: l.kg ?? 0,
      m3: l.m3 ?? 0,
      pkgs: l.pkgs ?? 0,
      description: l.description || '',
      // isoDateOrNull: columnas DATE — un texto que no es fecha ("RAFAELA" en
      // el DESCARGA-lugar legacy) hacía caer el batch ENTERO con error 22007
      // de Postgres y la carga "no persistía" (bug A7827 B, 23/07).
      mvd_arrival: isoDateOrNull(l.mvdArrival ?? l.mvd_arrival),
      desconsol_date: isoDateOrNull(l.desconsolDate ?? l.desconsol_date),
      bl: l.bl || '',
      stock: l.stock || '',
      wood: l.wood ?? false,
      overrides: l.overrides || {},
      position: l.position ?? 0,
      pending: l.pending ?? null,
    }))

    // Pre-select estado anterior para auditar cargas nuevas y cambios de pending
    const rowIds = rows.map(r => r.id)
    let prevLoadsById = new Map<string, { id: string; pending: string | null; source_ref: string; truck_id: string }>()
    try {
      const { data: prevLoads } = await db.from('truck_loads').select('id, pending, source_ref, truck_id').in('id', rowIds)
      prevLoadsById = new Map((prevLoads || []).map((l: { id: string; pending: string | null; source_ref: string; truck_id: string }) => [l.id, l]))
    } catch { /* ignorar: auditamos con lo que tenemos */ }

    const { error } = await db.from('truck_loads').upsert(rows, { onConflict: 'id' })
    if (error) throw error
    void broadcastTrucksLive('truck_load', undefined, clientIdFromRequest(req)) // timbre co-edición

    // Auditar cargas nuevas (agrupadas por truck_id)
    const newRows = rows.filter(r => !prevLoadsById.has(r.id))
    if (newRows.length > 0) {
      // Resolver codes de los trucks afectados
      const truckIds = [...new Set(newRows.map(r => r.truck_id).filter(Boolean))]
      let codeByTruckId = new Map<string, string>()
      try {
        const { data: tks } = await db.from('trucks').select('id, code').in('id', truckIds)
        codeByTruckId = new Map((tks || []).map((t: { id: string; code: string }) => [t.id, t.code]))
      } catch { /* ignorar */ }
      // Agrupar refs nuevas por truck
      const refsByTruck = new Map<string, string[]>()
      const pendingByTruck = new Map<string, string[]>()
      for (const r of newRows) {
        const tid = r.truck_id ?? ''
        const ref = r.source_ref ?? ''
        if (!refsByTruck.has(tid)) { refsByTruck.set(tid, []); pendingByTruck.set(tid, []) }
        refsByTruck.get(tid)!.push(ref)
        if (r.pending) pendingByTruck.get(tid)!.push(ref)
      }
      for (const [tid, refs] of refsByTruck) {
        const code = codeByTruckId.get(tid) || tid
        logAudit(db, payload, 'agregar_cargas', 'camion', code, { refs, pending: pendingByTruck.get(tid) || [] })
      }
    }

    // Auditar cambios de pending en filas existentes — una sola query para todos los trucks
    const changedPendingRows = rows.filter(row => {
      const prev = prevLoadsById.get(row.id)
      return prev && prev.pending !== row.pending
    })
    if (changedPendingRows.length > 0) {
      const changedTruckIds = [...new Set(changedPendingRows.map(r => r.truck_id).filter(Boolean))]
      let codeByTruckIdPending = new Map<string, string>()
      try {
        const { data: tks } = await db.from('trucks').select('id, code').in('id', changedTruckIds)
        codeByTruckIdPending = new Map((tks || []).map((t: { id: string; code: string }) => [t.id, t.code]))
      } catch { /* ignorar */ }
      for (const row of changedPendingRows) {
        const prev = prevLoadsById.get(row.id)!
        const tid = row.truck_id ?? ''
        const code = codeByTruckIdPending.get(tid) || tid
        let action: string
        if (row.pending === 'remove') {
          action = 'marcar_quitar_carga'
        } else if (row.pending === null && prev.pending === 'add') {
          action = 'confirmar_carga'
        } else {
          action = 'cambio_pending'
        }
        logAudit(db, payload, action, 'camion', code, { ref: row.source_ref ?? '', de: prev.pending, a: row.pending })
      }
    }

    return res.status(200).json({ saved: true, count: rows.length })
  }

  if (req.method === 'DELETE') {
    const id = req.query.id as string
    const truckId = req.query.truckId as string
    if (id) {
      // Pre-select para auditoría antes de borrar
      let sourceRef = id
      let resolvedCode = ''
      try {
        const { data: l } = await db.from('truck_loads').select('source_ref, truck_id').eq('id', id).maybeSingle()
        if (l?.source_ref) sourceRef = l.source_ref
        if (l?.truck_id) {
          const { data: tk } = await db.from('trucks').select('code').eq('id', l.truck_id).maybeSingle()
          if (tk?.code) resolvedCode = tk.code
        }
      } catch { /* ignorar */ }

      const { error } = await db.from('truck_loads').delete().eq('id', id)
      if (error) throw error
      void broadcastTrucksLive('truck_load', undefined, clientIdFromRequest(req)) // timbre co-edición
      logAudit(db, payload, 'quitar_carga', 'camion', resolvedCode || id, { ref: sourceRef })
      return res.status(200).json({ deleted: true })
    }
    if (truckId) {
      // Bulk delete — pre-select refs antes de borrar
      let refs: string[] = []
      try {
        const { data: ls } = await db.from('truck_loads').select('source_ref').eq('truck_id', truckId)
        refs = (ls || []).map((l: { source_ref: string }) => l.source_ref).filter(Boolean)
      } catch { /* ignorar */ }

      const { error } = await db.from('truck_loads').delete().eq('truck_id', truckId)
      if (error) throw error
      void broadcastTrucksLive('truck_load', undefined, clientIdFromRequest(req)) // timbre co-edición
      logAudit(db, payload, 'quitar_cargas_bulk', 'camion', truckId, { refs })
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
      eta_mvd: isoDateOrNull(s.etaMvd ?? s.eta_mvd),
      desconsol_date: isoDateOrNull(s.desconsolDate ?? s.desconsol_date),
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

  // Incremento ATÓMICO vía RPC (insert ... on conflict do update ... returning, una
  // sola sentencia): evita la carrera de read-then-write que daba códigos de camión
  // duplicados cuando 2 usuarios creaban a la vez.
  const { data: nextData, error: rpcErr } = await db.rpc('next_truck_number', { p_prefix: prefix })
  if (rpcErr) throw rpcErr
  const next = nextData as number

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
    // Ficha de compra/venta (jsonb): arrays de {concepto, monto}.
    gastos: Array.isArray(b.gastos) ? b.gastos : [],
    ventas: Array.isArray(b.ventas) ? b.ventas : [],
  }
}

async function handleBilling(req: VercelRequest, res: VercelResponse, db: any, payload: TokenPayload | null) {
  if (req.method === 'GET') {
    const { data, error } = await db
      .from('shipment_billing')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(5000)
    if (error) throw error
    // Scoping: admin acotado solo ve la facturación de SUS cargas.
    const billing = (data || []).map(mapBillingRowToApi)
    const allowed = await allowedRefsForPayload(db, payload)
    return res.status(200).json({ billing: filterByAllowedRef(billing, allowed, b => b.ref) })
  }

  if (req.method === 'POST') {
    const v = validateBatch(BillingRowSchema, req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const nowIso = new Date().toISOString()
    // invoiced_by sale del TOKEN (usuario real), no del cliente — auditoría.
    const who = auditUser(payload as any)
    const rows = v.items.map((b) => {
      const row: Record<string, unknown> = {
        ref: b.ref,
        status: b.status,
        invoice_number: b.invoiceNumber || b.invoice_number || '',
        // Only stamp invoiced_at/by when status=facturada; clear otherwise.
        invoiced_at: b.status === 'facturada'
          ? (b.invoicedAt || b.invoiced_at || nowIso)
          : null,
        invoiced_by: b.status === 'facturada' ? who : '',
        updated_at: nowIso,
      }
      // Ficha de compra/venta: SOLO si el request la trae. Si no viene, no
      // incluimos las columnas → el upsert preserva la ficha ya guardada.
      // (La UI siempre manda las dos juntas; si llega una sola, la otra se
      // normaliza a [] para que el lote tenga claves uniformes.)
      if (b.gastos !== undefined || b.ventas !== undefined) {
        row.gastos = b.gastos ?? []
        row.ventas = b.ventas ?? []
      }
      return row
    })
    // El upsert de PostgREST exige claves uniformes por lote: separar filas
    // con ficha de filas sin ficha (normalmente el lote trae una sola fila).
    const conFicha = rows.filter(r => 'gastos' in r || 'ventas' in r)
    const sinFicha = rows.filter(r => !('gastos' in r) && !('ventas' in r))
    for (const batch of [conFicha, sinFicha]) {
      if (batch.length === 0) continue
      const { error } = await db.from('shipment_billing').upsert(batch, { onConflict: 'ref' })
      if (error) throw error
    }
    for (const r of rows) logAudit(db, payload, `facturación: ${r.status}`, 'billing', r.ref as string, r.invoice_number ? { factura: r.invoice_number } : undefined)
    return res.status(200).json({ saved: true, count: rows.length })
  }

  if (req.method === 'DELETE') {
    const ref = req.query.ref as string
    if (!ref) return res.status(400).json({ error: 'ref query parameter required' })
    const { error } = await db.from('shipment_billing').delete().eq('ref', ref)
    if (error) throw error
    logAudit(db, payload, 'facturación: deshacer', 'billing', ref)
    return res.status(200).json({ deleted: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Ref checks (checklist PROCEDIMIENTO OPERATIVO por ref — pestaña Checks) ──
// GET  /api/data/ref-checks → todas las filas (scoped por cliente_pattern)
// POST /api/data/ref-checks → upsert por ref con MERGE de steps parciales
// La tabla guarda SOLO el estado de los pasos: el universo de refs se deriva
// de las cargas en el cliente (derive-on-read), nunca se copia acá.

// ── User prefs: preferencias de UI por CUENTA (columnas de la grilla, orden,
// toggles) — viajan con el login a cualquier dispositivo (pedido Brian 14/07).
// Cada admin lee y escribe SOLO su fila: la clave es el usuario del TOKEN,
// nunca del body. POST = merge parcial (la clave que llega pisa solo esa).
async function handleUserPrefs(req: VercelRequest, res: VercelResponse, db: any, payload: TokenPayload | null) {
  const usuario = auditUser(payload as any)
  if (!usuario) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method === 'GET') {
    const { data, error } = await db.from('user_prefs').select('prefs').eq('usuario', usuario).maybeSingle()
    if (error) throw error
    return res.status(200).json({ prefs: data?.prefs || {} })
  }
  if (req.method === 'POST') {
    const patch = (req.body as { prefs?: Record<string, unknown> } | undefined)?.prefs
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return res.status(400).json({ error: 'prefs inválidas' })
    }
    if (JSON.stringify(patch).length > 20_000) {
      return res.status(400).json({ error: 'prefs demasiado grandes' })
    }
    const { data: cur } = await db.from('user_prefs').select('prefs').eq('usuario', usuario).maybeSingle()
    const merged = { ...((cur?.prefs as Record<string, unknown>) || {}), ...patch }
    const { error } = await db
      .from('user_prefs')
      .upsert({ usuario, prefs: merged, updated_at: new Date().toISOString() }, { onConflict: 'usuario' })
    if (error) throw error
    return res.status(200).json({ saved: true, prefs: merged })
  }
  return res.status(405).json({ error: 'Method not allowed' })
}

async function handleRefChecks(req: VercelRequest, res: VercelResponse, db: any, payload: TokenPayload | null) {
  if (req.method === 'GET') {
    const { data, error } = await db.from('ref_checks').select('*').order('ref', { ascending: true }).limit(5000)
    if (error) throw error
    const rows = (data || []).map((r: any) => ({
      ref: r.ref,
      steps: r.steps || {},
      updatedAt: r.updated_at || '',
      updatedBy: r.updated_by || '',
    }))
    // Scoping por cliente: admin acotado solo ve checks de SUS cargas (mismo
    // patrón que documents/reports).
    const allowed = await allowedRefsForPayload(db, payload)
    return res.status(200).json({ checks: filterByAllowedRef(rows, allowed, r => r.ref) })
  }

  if (req.method === 'POST') {
    const v = validate(RefChecksUpsertSchema, req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const { ref, steps } = v.data

    // Scoping también al escribir: admin acotado no toca checks de cargas ajenas.
    const allowed = await allowedRefsForPayload(db, payload)
    if (allowed && !allowed.has(refOf(ref))) return res.status(404).json({ error: 'Carga no encontrada' })

    // `by` sale del TOKEN (como invoiced_by en billing) — nunca del body.
    const who = String((payload as AdminPayload | null)?.user || '').trim() || auditUser(payload as any)
    const hoyIso = new Date().toISOString().slice(0, 10)

    // MERGE server-side sobre el jsonb existente (el body trae solo las claves
    // tocadas — no pisar todo): done=true reemplaza ESE paso (fecha provista o
    // hoy), done=false lo elimina (vuelve a pendiente), el resto se conserva.
    // Si el paso YA estaba marcado (edición de fecha), se conserva el `by`
    // original (quién lo marcó). Nota: read-then-write sin lock — si dos
    // usuarios marcan a la vez pasos de la MISMA ref puede perderse uno
    // (aceptable en V1, igual que el resto de los overlays por ref).
    const { data: prevRow, error: prevErr } = await db.from('ref_checks').select('steps').eq('ref', ref).maybeSingle()
    if (prevErr) throw prevErr
    type CntrState = { done?: boolean; date?: string; by?: string }
    type StoredStep = { done?: boolean; date?: string; by?: string; cntrs?: Record<string, CntrState> }
    const prevSteps: Record<string, StoredStep> = prevRow?.steps || {}
    const merged: Record<string, unknown> = { ...prevSteps }
    for (const [key, step] of Object.entries(steps)) {
      if (step === undefined) continue
      // Paso-aviso POR CONTENEDOR: el body trae el mapa `cntrs` completo de la
      // ref (HOY lo siembra desde el estado efectivo). Mergeamos por contenedor
      // y estampamos `by` del token (nunca del body); un contenedor ya marcado
      // conserva su `by` original. Si ninguno queda avisado, el paso vuelve a
      // pendiente (se borra), igual que done=false a nivel ref.
      const cntrsPatch = (step as { cntrs?: Record<string, CntrState> }).cntrs
      if (cntrsPatch) {
        const prevC = prevSteps[key]?.cntrs || {}
        const outC: Record<string, CntrState> = { ...prevC }
        for (const [cntr, cs] of Object.entries(cntrsPatch)) {
          if (!cs?.done) { outC[cntr] = { done: false }; continue }
          const pc = prevC[cntr]
          outC[cntr] = { done: true, date: cs.date || pc?.date || hoyIso, by: pc?.done && pc.by ? pc.by : who }
        }
        const anyDone = Object.values(outC).some(c => c.done)
        if (!anyDone) { delete merged[key]; continue }
        merged[key] = { done: true, cntrs: outC }
        continue
      }
      if (!step.done) {
        // Reclamo del día (done=false + reclamado): paso pendiente que HOY se
        // reclamó (factura/datos para completarlo). Se guarda con `by` del
        // token; vence solo por fecha (derive-on-read). Sin reclamado,
        // done=false sigue borrando el paso (vuelve a pendiente limpio).
        const reclamado = (step as { reclamado?: string }).reclamado
        if (reclamado) { merged[key] = { done: false, reclamado, reclamadoBy: who }; continue }
        delete merged[key]
        continue
      }
      const prevStep = prevSteps[key]
      merged[key] = {
        done: true,
        date: step.date || prevStep?.date || hoyIso,
        by: prevStep?.done && prevStep.by ? prevStep.by : who,
      }
    }

    const { error } = await db.from('ref_checks').upsert({
      ref,
      steps: merged,
      updated_at: new Date().toISOString(),
      updated_by: who,
    }, { onConflict: 'ref' })
    if (error) throw error
    logAudit(db, payload, 'checks operativos', 'ref_checks', ref, { pasos: Object.keys(steps) })
    // Timbre Realtime: avisar a los otros usuarios que cambió un check para que
    // refetcheen (HOY/Checks). Best-effort — no rompe la escritura si falla.
    void broadcastTrucksLive('ref_checks', undefined, clientIdFromRequest(req))
    return res.status(200).json({ saved: true, steps: merged })
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
  'doc_number','origin','origin_country','etd','eta','seguimiento','contenedor','buque','linea','transbordo',
  'seguro','certi','telex','impresa','despacho','deposito','fecha_consol','transporte','camion',
  'dest_country','discharge_port','dest_port','fiscal','wood','no_apilable','oog','imo','tipo','ftl_ltl','costo_extra','observacion','status',
  'operator_id','notes','archived','source','desconsol_date','entrega_planta',
  'libre','salida','eta_fiscal','operativa','descarga','dev','terminal','n_cntr','origin_ref',
  // Pagos: montos por rubro (null=sin datos · 0=pagado · >0=pendiente) + forma de
  // pago override + fecha de pago. Los pago_*_by NO están acá a propósito: los
  // estampa el server desde el token (el cliente no puede falsificar quién pagó).
  'monto_flete','monto_locales','monto_terminal','monto_devolucion','forma_pago',
  'pago_flete_at','pago_locales_at','pago_terminal_at','pago_devolucion_at',
  'operativas',
])

// Scoping por cliente para usuarios level=admin acotados: solo ven las cargas cuyo
// CLIENTE matchea su patrón (clientePattern del JWT). Owner / tokens sin patrón → ven
// TODO (sin filtro). Reusa matchesClientePattern (misma semántica que el portal cliente).
function scopeByAdminPattern(rows: any[], payload: TokenPayload | null): any[] {
  if (!payload || payload.role !== 'admin' || !payload.clientePattern) return rows
  const pattern = payload.clientePattern
  return rows.filter((r: any) => matchesClientePattern(r.cliente || '', pattern))
}

// Datos por-carga (reports/fotos/documentos/billing/tareas) NO tienen CLIENTE en su
// fila: se scopean por REF. Este helper resuelve el Set de REFs visibles para un
// admin acotado (una query a shipments por request). Devuelve null si ve TODO
// (owner / sin patrón / no-admin) → sin filtro.
async function allowedRefsForPayload(db: any, payload: TokenPayload | null): Promise<Set<string> | null> {
  if (!payload || payload.role !== 'admin' || !payload.clientePattern) return null
  const pattern = payload.clientePattern
  const { data } = await db.from('shipments').select('ref, cliente').limit(5000)
  const set = new Set<string>()
  for (const r of (data || [])) {
    if (matchesClientePattern(r.cliente || '', pattern)) set.add(String(r.ref || '').trim().toUpperCase())
  }
  return set
}

const refOf = (r: string | null | undefined) => String(r || '').trim().toUpperCase()

/** Valor para una columna DATE: solo fechas ISO (yyyy-MM-dd); cualquier otro
 *  texto → null. Sin esto, un lugar tipeado en un campo-fecha legacy tiraba el
 *  batch entero con error 22007 de Postgres (bug A7827 B, 23/07). */
const isoDateOrNull = (v: unknown): string | null => {
  const s = String(v ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

// Filtra una lista por su ref contra el set permitido (o pasa todo si es null).
function filterByAllowedRef<T>(items: T[], allowed: Set<string> | null, getRef: (i: any) => string | null | undefined): T[] {
  if (!allowed) return items
  return items.filter(i => allowed.has(refOf(getRef(i))))
}

async function handleShipments(req: VercelRequest, res: VercelResponse, db: any, payload: TokenPayload | null) {
  if (req.method === 'GET') {
    // source='sheet' = filas espejo de la migración FCL: por defecto invisibles.
    // ?includeMirror=only → SOLO el espejo, payload mínimo (sheet_raw): es la
    // fuente FCL de la app desde la Etapa 2. ?includeMirror=1 → todo junto.
    if (req.query.includeMirror === 'only') {
      // Flip Etapa 4: con la web como master, las FCL viven como filas DB normales
      // (source='fcl') y no hay espejo que leer. `flipped` evita que el cliente caiga
      // al cache (que mostraría las FCL duplicadas). raw=1 omite el flip: lo usa el
      // horneado para leer el estado efectivo del espejo durante el cutover.
      if (process.env.FCL_SOURCE_OF_TRUTH === 'db' && req.query.raw !== '1') {
        return res.status(200).json({ shipments: [], flipped: true })
      }
      const { data, error } = await db.from('shipments')
        .select('id, sheet_raw, web_edits, created_at_ts, updated_at_ts')
        .eq('source', 'sheet')
        .not('sheet_raw', 'is', null)
        .limit(5000)
      if (error) throw error
      return res.status(200).json({ shipments: data || [] })
    }
    let q = db.from('shipments').select('*').order('ref', { ascending: true }).limit(5000)
    if (req.query.includeMirror !== '1') q = q.neq('source', 'sheet')
    const { data, error } = await q
    if (error) throw error
    return res.status(200).json({ shipments: scopeByAdminPattern(data || [], payload) })
  }

  if (req.method === 'PATCH') {
    const id = req.query.id as string
    if (!id) return res.status(400).json({ error: 'id required' })

    // Renombrar la REF (flip Etapa 4): flujo aparte con PIN 0000 + cascada atómica
    // (RPC rename_shipment_ref: shipments + truck_loads/origin_photos/documents/
    // reports/notification_tasks/shipment_billing/operator_assignments en una sola
    // transacción). Anti-duplicados server-side. La REF nunca se toca por el PATCH
    // normal de columnas (no está en SHIPMENT_COLS).
    if (typeof req.query.renameRef === 'string') {
      const newRef = (req.query.renameRef as string).trim()
      const pin = String(req.query.pin || '')
      const { data: oldRef, error } = await db.rpc('rename_shipment_ref', { p_id: id, p_new_ref: newRef, p_pin: pin })
      if (error) {
        const msg = String(error.message || '')
        if (/PIN/i.test(msg)) return res.status(403).json({ error: 'PIN incorrecto' })
        if (/ya existe/i.test(msg)) return res.status(409).json({ error: 'Ya existe una carga activa con esa REF — usá un sufijo A/B.' })
        if (/vac[ií]a/i.test(msg)) return res.status(400).json({ error: 'La REF no puede quedar vacía.' })
        if (/no encontrada/i.test(msg)) return res.status(404).json({ error: 'Carga no encontrada.' })
        throw error
      }
      logAudit(db, payload, 'renombrar REF', 'shipments', newRef, { old_ref: oldRef, new_ref: newRef })
      return res.status(200).json({ renamed: true, oldRef, newRef })
    }

    const body = (req.body || {}) as Record<string, unknown>

    // Etapa 3 migración: edición de una FCL espejo → overlay por campo en
    // web_edits (claves de ParsedShipment, NUNCA la REF). El sync no pisa
    // estas ediciones porque no escribe esa columna; sheet_raw queda puro.
    if (req.query.fcl === '1') {
      if ('REF' in body) return res.status(400).json({ error: 'La REF no se edita acá (flujo aparte con confirmación)' })
      const FCL_EDIT_KEYS = new Set(['CLIENTE', 'ETD', 'ETA', 'CNTR', 'BUQUE', 'LINEA', 'POL', 'POD', 'SEGUIMIENTO', 'TIPO', 'MBL'])
      const { data: row, error: rowErr } = await db.from('shipments').select('id, ref, source, web_edits').eq('id', id).maybeSingle()
      if (rowErr) throw rowErr
      if (!row || row.source !== 'sheet') return res.status(404).json({ error: 'Carga FCL espejo no encontrada' })
      const merged: Record<string, unknown> = { ...(row.web_edits || {}) }
      const applied: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(body)) {
        if (!FCL_EDIT_KEYS.has(k)) continue
        if (v === null) delete merged[k]   // null = revertir al valor de la planilla
        else merged[k] = v
        applied[k] = v
      }
      if (Object.keys(applied).length === 0) return res.status(400).json({ error: 'No valid fields' })
      const { error } = await db.from('shipments').update({ web_edits: merged, updated_at_ts: Date.now() }).eq('id', id)
      if (error) throw error
      logAudit(db, payload, 'editar FCL', 'shipments', row.ref || id, applied)
      return res.status(200).json({ updated: true, webEdits: merged })
    }

    const updates: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body)) {
      if (SHIPMENT_COLS.has(k)) updates[k] = v
    }
    // When operativas[] is written, recompute the flat rollup columns so the
    // grid / agenda / billing / tracking (which read the scalar columns) stay
    // in sync without requiring a separate PATCH.
    if (Array.isArray(updates.operativas) && updates.operativas.length > 0) {
      const r = rollupFromOperativasApi(updates.operativas as Record<string, unknown>[])
      updates.salida = r.salida
      updates.eta_fiscal = r.eta_fiscal
      updates.deposito = r.deposito
      updates.operativa = r.operativa
      updates.descarga = r.descarga
      updates.dev = r.dev
      updates.contenedor = r.contenedor
      // Peso/Volumen/Bultos TOTAL = suma de los contenedores. Pero NO pisar el
      // total con 0 cuando los contenedores no tienen el peso desglosado: eso
      // perdería el total cargado a nivel carga (ej. carga multi-cntr importada
      // con el total solo en la columna). Solo actualizar si hay suma > 0.
      if (r.pkgs > 0) updates.pkgs = r.pkgs
      if (r.kg > 0) updates.kg = r.kg
      if (r.m3 > 0) updates.m3 = r.m3
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields' })
    // Pagos: el "quién pagó" lo estampa SIEMPRE el server desde el token.
    // Marcar (fecha) → by = usuario del token · desmarcar (null) → by = null.
    let esPago = false
    for (const k of Object.keys(updates)) {
      const m = /^pago_(flete|locales|terminal|devolucion)_at$/.exec(k)
      if (m) { esPago = true; updates[`pago_${m[1]}_by`] = updates[k] ? auditUser(payload as any) : null }
    }
    updates.updated_at_ts = Date.now()
    const { data: updRow, error } = await db.from('shipments').update(updates).eq('id', id).select('ref').maybeSingle()
    if (error) throw error
    logAudit(db, payload, 'archived' in updates && Object.keys(updates).length === 1
      ? (updates.archived ? 'archivar' : 'restaurar')
      : esPago ? 'pago' : 'editar', 'shipments', updRow?.ref || id, updates)
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
    logAudit(db, payload, 'crear/actualizar carga', 'shipments', rows.map(r => r.ref).filter(Boolean).join(', ') || String(rows[0]?.id || ''))
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
    logAudit(db, payload, 'ELIMINAR carga', 'shipments', ref || id)
    return res.status(200).json({ deleted: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Usuarios del equipo (admin_users) — SOLO el owner los gestiona ──
// GET lista · POST crear/editar {id?, email, name, password?} · PATCH ?id=
// {active|password} · DELETE ?id=. El owner (Brian) entra por env vars como
// siempre; estos usuarios entran con su email + contraseña en el mismo login.

async function handleAdminUsers(req: VercelRequest, res: VercelResponse, db: any, payload: TokenPayload | null) {
  if (!isOwner(payload)) return res.status(403).json({ error: 'Solo el owner gestiona usuarios' })

  if (req.method === 'GET') {
    const { data, error } = await db.from('admin_users')
      .select('id, email, name, level, active, created_at, last_login, cliente_pattern')
      .order('created_at', { ascending: true })
    if (error) throw error
    return res.status(200).json({ users: data || [] })
  }

  if (req.method === 'POST') {
    const v = validate(z.object({
      id: z.string().optional(),
      email: z.string().email(),
      name: z.string().min(1),
      password: z.string().min(8).optional(),
      // matchesClientePattern descarta EN SILENCIO los tokens <4 chars
      // (hardening deliberado, spec H2): si guardáramos "VMG" el usuario vería
      // 0 cargas sin ningún error. Rechazar acá, con mensaje claro.
      clientePattern: z.string().optional().superRefine((val, ctx) => {
        if (!val) return
        const short = val.split(',').map(t => t.trim()).find(t => t.length > 0 && t.length < 4)
        if (short) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Cada cliente del patrón debe tener al menos 4 caracteres. "${short}" tiene ${short.length}. Para clientes cortos usá la razón social como figura en la planilla.`,
          })
        }
      }),
    }), req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const { id, email, name, password, clientePattern } = v.data
    const emailNorm = email.toLowerCase().trim()

    if (!id) {
      // Crear: contraseña obligatoria
      if (!password) return res.status(400).json({ error: 'Contraseña requerida (mínimo 8 caracteres)' })
      const { data: exists } = await db.from('admin_users').select('id').eq('email', emailNorm).maybeSingle()
      if (exists) return res.status(409).json({ error: `Ya existe un usuario con el email ${emailNorm}` })
      const row = {
        id: `au-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        email: emailNorm,
        name: name.trim(),
        password_hash: await hashPassword(password),
        level: 'admin',
        active: true,
        cliente_pattern: (clientePattern || '').trim() || null,
      }
      const { error } = await db.from('admin_users').insert(row)
      if (error) throw error
      logAudit(db, payload, 'crear usuario', 'admin_users', emailNorm)
      return res.status(200).json({ saved: true, id: row.id })
    }

    // Editar nombre/email (+ contraseña si viene)
    const updates: Record<string, unknown> = { email: emailNorm, name: name.trim() }
    if (password) updates.password_hash = await hashPassword(password)
    if (clientePattern !== undefined) updates.cliente_pattern = (clientePattern || '').trim() || null
    const { error } = await db.from('admin_users').update(updates).eq('id', id)
    if (error) throw error
    logAudit(db, payload, password ? 'editar usuario + contraseña' : 'editar usuario', 'admin_users', emailNorm)
    return res.status(200).json({ saved: true })
  }

  if (req.method === 'PATCH') {
    const id = req.query.id as string
    if (!id) return res.status(400).json({ error: 'id required' })
    const body = (req.body || {}) as Record<string, unknown>
    const updates: Record<string, unknown> = {}
    if (typeof body.active === 'boolean') updates.active = body.active
    if (typeof body.password === 'string' && body.password.length >= 8) updates.password_hash = await hashPassword(body.password)
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields' })
    const { data: u, error } = await db.from('admin_users').update(updates).eq('id', id).select('email').maybeSingle()
    if (error) throw error
    logAudit(db, payload, 'active' in updates ? (updates.active ? 'activar usuario' : 'desactivar usuario') : 'resetear contraseña', 'admin_users', u?.email || id)
    return res.status(200).json({ updated: true })
  }

  if (req.method === 'DELETE') {
    const id = req.query.id as string
    if (!id) return res.status(400).json({ error: 'id required' })
    const { data: u } = await db.from('admin_users').select('email').eq('id', id).maybeSingle()
    const { error } = await db.from('admin_users').delete().eq('id', id)
    if (error) throw error
    logAudit(db, payload, 'eliminar usuario', 'admin_users', u?.email || id)
    return res.status(200).json({ deleted: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Suscripciones Web Push (avisos del día para el equipo) ──────────
// POST: alta/refresh — el navegador manda su PushSubscription.toJSON() y se
// upsertea por endpoint (el endpoint identifica al navegador; el email del
// token identifica a la persona). El upsert NO toca las columnas alert_* →
// re-suscribirse conserva las preferencias elegidas.
// GET ?endpoint= — preferencias de alertas de ESTE dispositivo (popover).
// PATCH — actualiza las preferencias (switches). DELETE: baja por endpoint
// (campana off). Cualquier admin logueado (owner o equipo) puede suscribirse.

const PUSH_PREF_COLS = ['alert_libre', 'alert_salidas', 'alert_fiscal', 'alert_frontera'] as const
const PUSH_SUB_SELECT = 'endpoint, alert_libre, alert_salidas, alert_fiscal, alert_frontera'

async function handlePushSubscriptions(req: VercelRequest, res: VercelResponse, db: any, payload: TokenPayload | null) {
  const admin = payload as AdminPayload | null

  if (req.method === 'GET') {
    const endpoint = req.query.endpoint as string | undefined
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' })
    const { data, error } = await db
      .from('push_subscriptions')
      .select(PUSH_SUB_SELECT)
      .eq('endpoint', endpoint)
      .maybeSingle()
    if (error) throw error
    return res.status(200).json({ subscription: data || null })
  }

  if (req.method === 'POST') {
    const v = validate(PushSubscriptionSchema, req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const { endpoint, keys } = v.data
    const row = {
      id: `ps-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      admin_email: (admin?.user || '').toLowerCase().trim(),
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: String(req.headers['user-agent'] || '').slice(0, 300),
    }
    const { error } = await db.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' })
    if (error) throw error
    logAudit(db, payload, 'activar avisos push', 'push_subscriptions', row.admin_email)
    return res.status(200).json({ saved: true })
  }

  if (req.method === 'PATCH') {
    const v = validate(PushPrefsPatchSchema, req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const { endpoint } = v.data
    const updates: Record<string, boolean> = {}
    for (const col of PUSH_PREF_COLS) {
      const val = v.data[col]
      if (typeof val === 'boolean') updates[col] = val
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields' })
    const { data: u, error } = await db
      .from('push_subscriptions')
      .update(updates)
      .eq('endpoint', endpoint)
      .select(PUSH_SUB_SELECT)
      .maybeSingle()
    if (error) throw error
    if (!u) return res.status(404).json({ error: 'Suscripción no encontrada — reactivá los avisos en este dispositivo' })
    logAudit(db, payload, 'preferencias avisos push', 'push_subscriptions', (admin?.user || '').toLowerCase())
    return res.status(200).json({ subscription: u })
  }

  if (req.method === 'DELETE') {
    const endpoint = (req.body && typeof req.body === 'object' && typeof (req.body as any).endpoint === 'string'
      ? (req.body as any).endpoint
      : req.query.endpoint) as string | undefined
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' })
    const { error } = await db.from('push_subscriptions').delete().eq('endpoint', endpoint)
    if (error) throw error
    logAudit(db, payload, 'desactivar avisos push', 'push_subscriptions', (admin?.user || '').toLowerCase())
    return res.status(200).json({ deleted: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Log de actividad (lectura) ──────────────────────────────────────
async function handleAuditLog(req: VercelRequest, res: VercelResponse, db: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const { data, error } = await db.from('audit_log')
    .select('id, ts, usuario, action, entity, ref, details')
    .order('ts', { ascending: false })
    .limit(300)
  if (error) throw error
  return res.status(200).json({ log: data || [] })
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
