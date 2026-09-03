import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest, auditUser, type TokenPayload, type AdminPayload } from '../_lib/jwt.js'
import { handleCors } from '../_lib/cors.js'
import { getSupabase } from '../_lib/supabase.js'
import { sendMail, mailConfigured } from '../_lib/mail.js'
import { welcomeClientEmail, welcomePartnerEmail, resolveEmailBrand } from '../_lib/emailTemplates.js'
import { hashPassword } from '../_lib/password.js'
import { matchesClientePattern } from '../_lib/csvParser.js'
import { buildClientDigest } from '../_lib/clientDigest.js'
import { buildDepotDigest, agruparDepositos } from '../_lib/depotDigest.js'
import { CLIENT_SHIPMENT_COLS } from '../_lib/clientShipments.js'
import { SHIPMENT_COLS } from '../_lib/shipmentCols.js'
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
  TransporteCuotasSchema,
  NoticiaRowSchema,
  EventoCalendarioSchema,
} from '../_lib/schemas.js'
import { rollupFromOperativasApi } from '../_lib/operativasRollup.js'
import { montevideoTodayIso } from '../_lib/pushAlerts.js'
import {
  validarNuevoAviso,
  cntrPerteneceACarga,
  mapFilaToAviso,
  patchDevolvi,
  patchDesconsolide,
} from '../_lib/partnerAvisosRules.js'
import { broadcastTrucksLive, clientIdFromRequest } from '../_lib/realtimeBroadcast.js'
import { z } from 'zod'
import { uploadPhotoObjects, deletePhotoObjects, signPhotoUrls, signPhotoUrl, THUMB_TTL, FULL_TTL } from '../_lib/photoStorage.js'

/** Validate `req.body` as either a single object or an array against `itemSchema`. */
function validateBatch<T>(itemSchema: z.ZodSchema<T>, body: unknown): { ok: true; items: T[] } | { ok: false; error: string } {
  const arr = Array.isArray(body) ? body : [body]
  const results: T[] = []
  for (let i = 0; i < arr.length; i++) {
    const r = validate(itemSchema, arr[i])
    if (!r.ok) {
      // Decir CUÁL fila falló: el array viaja entero, así que "item[0]" mandaba
      // a mirar el cliente equivocado (Cata, 02/09 — el que fallaba era otro).
      const fila = arr[i] as { name?: unknown; ref?: unknown; id?: unknown } | null
      const quien = String(fila?.name || fila?.ref || fila?.id || `item ${i + 1}`)
      return { ok: false, error: `${quien}: ${r.error}` }
    }
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

  // Avisos de partners: el depósito/transporte los CREA y lee los suyos; el
  // equipo (admin/owner) los lee todos y los confirma o rechaza. Es la única
  // entidad compartida entre ambos mundos — el reparto fino por rol y método
  // vive en handlePartnerAvisos.
  if (entity === 'partner-avisos') {
    if (!payload || (payload.role !== 'depot' && payload.role !== 'transport' && payload.role !== 'admin')) {
      return res.status(401).json({ error: 'Authentication required' })
    }
    try { return await handlePartnerAvisos(req, res, db, payload) }
    catch (e: any) { console.error('[partner-avisos] error:', e?.message); return res.status(500).json({ error: 'Database error' }) }
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
      case 'client-digest':
        return handleClientDigest(req, res, db)
      case 'depot-digest':
        return handleDepotDigest(req, res, db)
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
        return handlePartnerUsers(req, res, db, payload)
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
      case 'transporte-cuotas':
        return handleTransporteCuotas(req, res, db, payload)
      case 'noticias':
        return handleNoticias(req, res, db, payload)
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
        return handleAuditLog(req, res, db, payload)
      case 'seguimientos-log':
        return handleSeguimientosLog(req, res, db, payload)
      case 'ref-notas':
        return handleRefNotas(req, res, db, payload)
      case 'deposito-actas':
        return handleDepositoActas(req, res, db, payload)
      case 'montecon-agenda':
        return handleMonteconAgenda(req, res, db, payload)
      case 'calendario-eventos':
        return handleCalendarioEventos(req, res, db, payload)
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
    // Select explícito (higiene de egress, incidente 27/08): `data` va a
    // propósito — hoy la tabla está vacía y la UI descarga desde este campo.
    // Si algún día los documentos pesan, separar como reports (bulk sin data
    // + descarga por ?id=).
    let query = db.from('documents')
      .select('id, shipment_ref, name, type, uploaded_at, uploaded_by, url, data')
      .order('uploaded_at', { ascending: false }).limit(500)
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

    // Bulk list — el SELECT excluye file_data EN LA QUERY, no solo en la
    // respuesta: con select('*') los 14 PDFs (28,7 MB) viajaban DB→function en
    // CADA apertura de la app — ~344 MB/hora de egress de Supabase y statement
    // timeouts con el plan restringido (incidente 27/08). El PDF individual
    // sigue bajando por ?id=.
    let query = db.from('reports')
      .select('id, shipment_ref, container_number, title, content, file_name, file_type, created_at_ts, created_by')
      .order('created_at_ts', { ascending: false }).limit(500)
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

// ── Client digest (workflow n8n "MED - Aviso Clientes") ─────────────
// Solo lectura. Devuelve por cliente digest_active sus cargas activas vía
// Montevideo con shape seguro + estado. La lógica vive en _lib/clientDigest.

async function handleClientDigest(req: VercelRequest, res: VercelResponse, db: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const { data: clients, error } = await db
    .from('clients')
    .select('id, name, company, email, aliases, cliente_pattern, digest_active, digest_emails')
    .eq('digest_active', true)
  if (error) throw error
  if (!clients?.length) return res.status(200).json({ generatedAt: new Date().toISOString(), clients: [] })
  const { data: rows, error: e2 } = await db
    .from('shipments')
    .select(CLIENT_SHIPMENT_COLS)
    .eq('archived', false)
    .neq('source', 'sheet')
  if (e2) throw e2
  const hoyISO = new Date().toISOString().slice(0, 10) // corre 09:00 UY = 12:00 UTC, mismo día
  return res.status(200).json(buildClientDigest(clients, rows || [], hoyISO))
}

// ── Depot digest (mail diario a los depósitos) ──────────────────────
// Solo lectura. Por cada depósito con acceso activo: qué contenedores tiene
// pendientes de retirar de la terminal y qué vacíos pendientes de devolver.
// El envío lo hace n8n (Brian 03/09: "un mail recordatorio una vez al día …
// y que te mande un enlace al portal para que vayan, se logueen y carguen lo
// que les falte"). La lógica vive en _lib/depotDigest.

async function handleDepotDigest(req: VercelRequest, res: VercelResponse, db: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // El link del mail sale del host del pedido: así el digest de TWF manda al
  // portal de TWF y el de Mediterránea al suyo, sin hardcodear dominios.
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
  const proto = String(req.headers['x-forwarded-proto'] || 'https')
  const portalUrl = host ? `${proto}://${host}/partner` : '/partner'
  const generatedAt = new Date().toISOString()

  const { data: users, error } = await db
    .from('partner_users')
    .select('email, name, filter_value, active, role')
    .eq('role', 'depot')
    .eq('active', true)
  if (error) throw error
  const grupos = agruparDepositos(users || [])
  if (!grupos.length) return res.status(200).json({ generatedAt, portalUrl, depositos: [] })

  // Las cargas se piden por el MISMO camino que usa el portal, una vez por
  // depósito: el mail no puede listar algo que el depósito no ve al entrar, y
  // el saneo (whitelist de columnas, sin montos ni fechas de pago) es
  // literalmente el mismo código. Se paga con N consultas — es una vez por día.
  const shipments: any[] = []
  for (const g of grupos) {
    const vis = await partnerShipmentsVisibles(db, { role: 'depot', filterValue: g.nombre, email: '', name: g.nombre })
    if ('status' in vis) continue // acceso desactivado: ese depósito no recibe nada
    shipments.push(...vis.shipments)
  }

  // Misma ventana que ve el partner en su portal, para que un aviso ya mandado
  // (o ya confirmado) se refleje igual en el mail.
  const desde = new Date(Date.now() - AVISOS_DIAS_PARTNER * 86_400_000).toISOString()
  const { data: avisosRows, error: errAvisos } = await db
    .from('partner_avisos')
    .select(AVISO_COLS)
    .eq('partner_role', 'depot')
    .gte('created_at', desde)
    .limit(2000)
  if (errAvisos) throw errAvisos

  const hoyISO = montevideoTodayIso()
  const { depositos } = buildDepotDigest(users || [], shipments, (avisosRows || []).map(mapFilaToAviso), hoyISO)
  return res.status(200).json({ generatedAt, portalUrl, depositos })
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
      digestActive: !!c.digest_active,
      digestEmails: c.digest_emails || '',
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
      // Spread condicional: un POST de una UI vieja sin estos campos NO resetea lo guardado
      ...(c.digestActive !== undefined || c.digest_active !== undefined
        ? { digest_active: c.digestActive ?? c.digest_active ?? false }
        : {}),
      ...(c.digestEmails !== undefined || c.digest_emails !== undefined
        ? { digest_emails: (c.digestEmails ?? c.digest_emails ?? '').trim() }
        : {}),
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

    // defaultToNull:false → PostgREST manda `Prefer: missing=default`. Cuando el
    // lote viene MEZCLADO (las filas viejas traen digest_active/digest_emails y
    // la nueva no, que es lo que pasa al crear un cliente desde una carga),
    // supabase-js arma `columns=` con la unión de claves y a la fila que no
    // trae la clave le mete NULL — y las dos columnas son NOT NULL. Eso era el
    // "HTTP 500" de Cata al crear RUEDAS DEL CERRO (02/09). Con el default
    // (false / '') la fila nueva entra y las demás conservan lo suyo.
    const { error } = await db.from('clients').upsert(rows, { onConflict: 'id', defaultToNull: false })
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
// Gate de LECTURA: cualquier admin. Gate de MUTACIÓN: SOLO OWNER — crear o
// resetear un acceso de cliente equivale a entrar al portal de ese cliente,
// y eso anularía el gate owner-only de impersonate (hallazgo auditoría
// 26/08: un admin acotado podía auto-emitirse acceso a cualquier cartera).
// El login vive en api/auth/admin-login.ts (type:'client').

async function handleClientUsers(req: VercelRequest, res: VercelResponse, db: any, payload: TokenPayload | null) {
  if (req.method !== 'GET' && !isOwner(payload)) {
    return res.status(403).json({ error: 'Solo el owner puede crear o modificar accesos de clientes' })
  }
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

    return res.status(201).json({ created: true, id: created.id, welcomeSent: mailConfigured() })
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

// ── Noticias (Novedades logísticas de la landing) ──────────────────
// GET    → todas (admin ve activas e inactivas; lo público va por /api/noticias)
// POST   → alta o edición (upsert por id)
// DELETE → borra por ?id=

async function handleNoticias(req: VercelRequest, res: VercelResponse, db: any, payload: TokenPayload | null = null) {
  if (req.method === 'GET') {
    const { data, error } = await db
      .from('noticias')
      .select('*')
      .order('publicada_at', { ascending: false })
      .limit(200)
    if (error) throw error
    return res.status(200).json({ noticias: data || [] })
  }

  if (req.method === 'POST') {
    const v = validate(NoticiaRowSchema, req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const c = v.data
    const row: Record<string, unknown> = {
      titulo: c.titulo,
      bajada: c.bajada ?? '',
      cuerpo: c.cuerpo ?? '',
      categoria: (c.categoria || 'general').toLowerCase(),
      imagen_url: c.imagenUrl ?? c.imagen_url ?? '',
      alerta: c.alerta ?? false,
      activo: c.activo ?? true,
      vigente_hasta: (c.vigenteHasta ?? c.vigente_hasta ?? '').slice(0, 10),
      estilo: (c.estilo ?? '').toLowerCase(),
      kicker: c.kicker ?? '',
      kicker_extra: c.kickerExtra ?? c.kicker_extra ?? '',
      subtitulo: c.subtitulo ?? '',
      mensaje: c.mensaje ?? '',
      link_url: c.linkUrl ?? c.link_url ?? '',
      updated_at: new Date().toISOString(),
    }
    if (c.id) {
      const { data, error } = await db.from('noticias').update(row).eq('id', c.id).select().single()
      if (error) throw error
      logAudit(db, payload, 'editar', 'noticias', c.id, { titulo: row.titulo })
      return res.status(200).json({ noticia: data })
    }
    const { data, error } = await db.from('noticias').insert(row).select().single()
    if (error) throw error
    logAudit(db, payload, 'crear', 'noticias', String(data?.id || ''), { titulo: row.titulo })
    return res.status(200).json({ noticia: data })
  }

  if (req.method === 'DELETE') {
    const id = String(req.query.id || '')
    if (!id) return res.status(400).json({ error: 'Falta id' })
    const { error } = await db.from('noticias').delete().eq('id', id)
    if (error) throw error
    logAudit(db, payload, 'borrar', 'noticias', id, {})
    return res.status(200).json({ deleted: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Avisos del calendario (feriados, paros, lo que frena un día) ────
// GET    → todos (la agenda filtra por mes en el cliente; son pocas filas)
// POST   → alta o edición (por id)
// DELETE → borra por ?id=
//
// No cuelgan de ninguna carga: son del día. La agenda los cruza por fecha
// con lo que ya está agendado, y el armado de camiones avisa si el día elegido
// tiene alguno.

async function handleCalendarioEventos(req: VercelRequest, res: VercelResponse, db: any, payload: TokenPayload | null = null) {
  if (req.method === 'GET') {
    const { data, error } = await db
      .from('calendario_eventos')
      .select('*')
      .order('fecha', { ascending: true })
      .limit(1000)
    if (error) throw error
    return res.status(200).json({ eventos: data || [] })
  }

  if (req.method === 'POST') {
    const v = validate(EventoCalendarioSchema, req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const c = v.data
    const row: Record<string, unknown> = {
      fecha: c.fecha,
      tipo: c.tipo || 'aviso',
      titulo: c.titulo,
      detalle: c.detalle ?? '',
    }
    if (c.id) {
      const { data, error } = await db.from('calendario_eventos').update(row).eq('id', c.id).select().single()
      if (error) throw error
      logAudit(db, payload, 'editar', 'calendario_eventos', c.id, { titulo: row.titulo, fecha: row.fecha })
      return res.status(200).json({ evento: data })
    }
    row.creado_por = auditUser(payload as any)
    const { data, error } = await db.from('calendario_eventos').insert(row).select().single()
    if (error) throw error
    logAudit(db, payload, 'crear', 'calendario_eventos', String(data?.id || ''), { titulo: row.titulo, fecha: row.fecha })
    return res.status(200).json({ evento: data })
  }

  if (req.method === 'DELETE') {
    const id = String(req.query.id || '')
    if (!id) return res.status(400).json({ error: 'Falta id' })
    const { error } = await db.from('calendario_eventos').delete().eq('id', id)
    if (error) throw error
    logAudit(db, payload, 'borrar', 'calendario_eventos', id, {})
    return res.status(200).json({ deleted: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Cuotas de transporte ───────────────────────────────────────────
// GET /api/data/transporte-cuotas        → { cuotas: [...] }
// PUT /api/data/transporte-cuotas        → reemplaza el set completo
//
// El PUT no borra: a los transportes que dejan de venir en el body los marca
// inactivos, así el historial de cuotas de un transporte no se pierde si se lo
// saca del reparto por un tiempo.

async function handleTransporteCuotas(req: VercelRequest, res: VercelResponse, db: any, payload: TokenPayload | null = null) {
  if (req.method === 'GET') {
    const { data, error } = await db
      .from('transporte_cuotas')
      .select('transporte, porcentaje, activo, orden, updated_at, updated_by')
      .order('orden')
    if (error) throw error
    return res.status(200).json({
      cuotas: (data || []).map((r: any) => ({
        transporte: r.transporte,
        porcentaje: Number(r.porcentaje) || 0,
        activo: r.activo !== false,
        orden: Number(r.orden) || 0,
        updated_at: r.updated_at,
        updated_by: r.updated_by,
      })),
    })
  }

  if (req.method === 'PUT') {
    const v = validate(TransporteCuotasSchema, req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })

    const usuario = auditUser(payload as any)
    const now = new Date().toISOString()
    const filas = v.data.cuotas.map((c, i) => ({
      transporte: c.transporte.trim().toUpperCase(),
      porcentaje: c.porcentaje,
      activo: c.activo !== false,
      orden: c.orden ?? i + 1,
      updated_at: now,
      updated_by: usuario,
    }))

    if (filas.length) {
      const { error } = await db.from('transporte_cuotas').upsert(filas, { onConflict: 'transporte' })
      if (error) throw error
    }

    // Los que no vinieron salen del reparto, pero se conservan (activo = false).
    // La lista de sobrantes se calcula acá y se apaga con un .in() explícito:
    // un filtro negado mal escrito apagaría TODAS las cuotas de una.
    const vigentes = new Set(filas.map(f => f.transporte))
    const { data: existentes, error: e1 } = await db
      .from('transporte_cuotas').select('transporte').eq('activo', true)
    if (e1) throw e1
    const sobrantes = (existentes || [])
      .map((r: any) => r.transporte)
      .filter((t: string) => !vigentes.has(t))
    if (sobrantes.length) {
      const { error: e2 } = await db.from('transporte_cuotas')
        .update({ activo: false, updated_at: now, updated_by: usuario })
        .in('transporte', sobrantes)
      if (e2) throw e2
    }

    logAudit(db, payload, 'update', 'transporte_cuotas', '',
      { cuotas: filas.map(f => `${f.transporte}:${f.porcentaje}%`).join(' · ') })
    return res.status(200).json({ saved: true, cuotas: filas.length })
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

    // Bulk list — thumbnails included, file_data excluded.
    // El tope estaba en 500 y el cliente pide SIEMPRE el listado global: al
    // pasarlo, las fotos más viejas desaparecían de la galería sin ningún
    // aviso (siguen en la DB y en Storage). Con ~300 fotos y el lote subido a
    // 40 eso llegaba en meses. Las filas migradas no llevan base64 —solo
    // metadata + signed URL—, así que 3000 pesa poco. Igual se avisa cuando
    // se corta, para no repetir el truncado mudo.
    const TOPE_LISTADO = 3000
    // thumbnail_data queda FUERA del select principal (3,3 MB por listado que
    // viajaban DB→function al pedo: todas las fotos migradas usan la URL
    // firmada). Solo se trae para las legacy sin migrar, en una 2ª query.
    let query = db.from('origin_photos')
      .select('id, shipment_ref, container_number, caption, photo_type, file_name, file_type, storage_path, thumb_path, created_at_ts, created_by')
      .order('created_at_ts', { ascending: false })
      .limit(TOPE_LISTADO)
    const shipmentRef = req.query.shipmentRef as string
    if (shipmentRef) query = query.eq('shipment_ref', shipmentRef)
    const { data, error } = await query
    if (error) throw error
    // Fallback legacy: miniaturas base64 SOLO de las no migradas del listado.
    const sinMigrar = (data || []).filter((p: { storage_path: string | null }) => !p.storage_path).map((p: { id: string }) => p.id)
    const thumbsLegacy = new Map<string, string>()
    if (sinMigrar.length > 0) {
      const { data: legacy } = await db.from('origin_photos')
        .select('id, thumbnail_data').in('id', sinMigrar)
      for (const l of legacy || []) thumbsLegacy.set(l.id, l.thumbnail_data || '')
    }
    for (const p of (data || []) as { id: string; thumbnail_data?: string | null }[]) {
      p.thumbnail_data = thumbsLegacy.get(p.id) || null
    }
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
    if ((data || []).length >= TOPE_LISTADO) {
      console.warn(`[origin-photos] listado truncado en ${TOPE_LISTADO}: hay fotos que no se están devolviendo`)
    }
    return res.status(200).json({
      photos: filterByAllowedRef(photos, allowed, p => p.shipmentRef),
      truncado: (data || []).length >= TOPE_LISTADO,
    })
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
      // Del TOKEN, nunca del body (mismo criterio que el `by` de ref_checks).
      // Antes el cliente mandaba 'admin' hardcodeado y no se sabía quién había
      // subido qué — lo que además rompía la atribución en /mirendimiento.
      created_by: auditUser(payload as any),
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
  const visibles = await partnerShipmentsVisibles(db, payload)
  if ('status' in visibles) return res.status(visibles.status).json({ error: visibles.error })
  return res.status(200).json({ shipments: visibles.shipments, syncedAt: new Date().toISOString() })
}

/** Lo que el partner tiene derecho a ver: alcance FRESCO de partner_users +
 *  shipments filtradas y saneadas (lista blanca opSegura). Lo comparten
 *  partner-shipments (la lista) y partner-avisos (para saber sobre qué refs
 *  puede avisar). Devuelve {status:403} si el acceso fue desactivado. */
async function partnerShipmentsVisibles(db: any, payload: any): Promise<
  { status: 403; error: string } | { shipments: any[]; alcance: string; nombre: string }
> {
  let nombre = String(payload?.name || '').trim()
  // Revocación efectiva (auditoría 01/09): el JWT dura 12 h y sólo se validaba
  // la firma, así que un partner dado de baja seguía entrando hasta medio día,
  // y si le cambiabas el transporte seguía viendo el viejo. Se relee la fila
  // en cada pedido: la baja y el cambio de alcance valen al instante.
  // Si la consulta falla NO se cierra la puerta (un hipo de la DB no puede
  // dejar al partner afuera): se sigue con el alcance del token.
  let alcanceVivo: string | null = null
  const emailToken = String(payload?.email || '').trim().toLowerCase()
  if (emailToken) {
    const { data: fila, error: errFila } = await db.from('partner_users')
      .select('active, filter_value, name')
      .eq('email', emailToken)
      .maybeSingle()
    if (!errFila) {
      if (!fila || fila.active === false) {
        return { status: 403, error: 'Tu acceso fue desactivado. Escribinos para reactivarlo.' }
      }
      alcanceVivo = String(fila.filter_value || '').trim() || null
      if (String(fila.name || '').trim()) nombre = String(fila.name).trim()
    }
  }

  // La web es master desde el flip (16/06): SIEMPRE se lee la tabla `shipments`.
  // Auditoría 26/08 — dos agujeros cerrados:
  //  1. `.eq('source','fcl')` solo traía las horneadas del cutover: las cargas
  //     nuevas (source='web'/'import') eran INVISIBLES para depósito/transporte.
  //     Ahora entra todo lo no-espejo.
  //  2. El filtro dependía de operativas[]: una carga con las columnas planas
  //     cargadas pero sin el array quedaba afuera — se sintetiza 1 operativa
  //     desde las columnas (mismo criterio que dbFclToParsedShipment).
  // El fallback al shipments_cache (congelado en el cutover) se ELIMINÓ: servir
  // datos podridos en silencio es peor que fallar.
  const { data: rows, error } = await db.from('shipments')
    // mode/stock/oog (spec HOY partners 01/09): el modo y el stock de las LCL para
    // el depósito que desconsolida, y la marca OOG para conseguir unidad/permisos.
    // telex: respaldo del TLX de la operativa para el aviso "TLX pendiente".
    // monto_terminal / pago_terminal_at NO viajan al partner: solo alimentan el
    // booleano TERMINAL_PAGADA (el depósito no ve plata).
    .select('ref,cliente,etd,eta,contenedor,n_cntr,doc_number,linea,buque,terminal,tipo,libre,telex,operativas,archived,deposito,transporte,salida,eta_fiscal,operativa,fiscal,descarga,dev,pkgs,kg,m3,observacion,mode,stock,oog,wood,monto_terminal,pago_terminal_at,monto_devolucion,pago_devolucion_at')
    .neq('source', 'sheet')
    .eq('archived', false)
    .limit(5000)
  if (error) throw error
  // ¿Se puede retirar? (Brian 03/09) El depósito preguntaba por teléfono si el
  // contenedor ya estaba liberado y la terminal paga. Son dos datos que el
  // equipo YA marca: LIBERADO en Checks y el pago de terminal en Pagos. Viajan
  // como dos booleanos — nunca montos ni fechas de pago.
  const refsLiberadas = new Set<string>()
  if (payload?.role === 'depot') {
    const refs = (rows || []).map((r: any) => String(r.ref || '').trim().toUpperCase()).filter(Boolean)
    if (refs.length) {
      const { data: checks, error: errChecks } = await db.from('ref_checks')
        .select('ref, steps').in('ref', refs)
      // Si falla, ninguna sale "liberada": es el lado conservador (el depósito
      // consulta antes de ir), nunca al revés.
      if (!errChecks) {
        for (const c of (checks || [])) {
          if ((c as any)?.steps?.liberado?.done) refsLiberadas.add(String((c as any).ref || '').trim().toUpperCase())
        }
      }
    }
  }

  // Turnos de Montecon (solo depósito): fecha del turno conseguido y si ya se
  // retiró. Viaja únicamente cuando la terminal de la carga es MONTECON.
  const agendaPorRef = new Map<string, { fecha_retiro: string; retirado_at: string }>()
  if (payload?.role === 'depot') {
    const { data: agenda, error: errAgenda } = await db.from('montecon_agenda')
      .select('ref, fecha_retiro, retirado_at').limit(2000)
    if (!errAgenda) {
      for (const a of (agenda || [])) {
        agendaPorRef.set(String(a.ref || '').trim().toUpperCase(), {
          fecha_retiro: String(a.fecha_retiro || '').slice(0, 10),
          retirado_at: a.retirado_at ? String(a.retirado_at).slice(0, 10) : '',
        })
      }
    }
  }
  const allShipments = (rows || []).map((r: any) => {
    // TLX: el telex vive en la columna booleana `telex` (nivel carga); el TLX
    // del array sólo está al día si el toggle lo reescribió (post 10/07). Se
    // deriva igual que dbFclToParsedShipment y el portal de clientes: si el
    // array no lo tiene, manda la columna. Sin esto el transporte veía "TLX
    // pendiente" en cargas con el telex liberado (revisión PR #316).
    const tlxCarga = r.telex ? 'SI' : ''
    const ops = Array.isArray(r.operativas) && r.operativas.length
      ? r.operativas.map((op: any) => ({ ...op, TLX: op.TLX || tlxCarga }))
      : ((r.deposito || r.transporte || r.salida || r.eta_fiscal || r.operativa)
          ? [{
              TLX: tlxCarga,
              DEPOSITO: r.deposito || '', TRANSPORTE: r.transporte || '', SALIDA: r.salida || '',
              ETA_FISC: r.eta_fiscal || '', OPERATIVA: r.operativa || '', CNTR_OP: r.contenedor || '',
              PKGS: r.pkgs || 0, KG: r.kg || 0, M3: r.m3 || 0, DESCRIPCION: r.observacion || '',
              FISCAL: r.fiscal || '', DESCARGA: r.descarga || '', DEV: r.dev || '', LIBRE: r.libre || '',
            }]
          : [])
    return {
      REF: r.ref || '', CLIENTE: r.cliente || '', ETD: r.etd || '', ETA: r.eta || '',
      CNTR: r.contenedor || '', N: r.n_cntr || '', MBL: r.doc_number || '',
      LINEA: r.linea || '', BUQUE: r.buque || '', TERMINAL: r.terminal || '', TIPO: r.tipo || '',
      LIBRE_HASTA: r.libre || '',
      // Telex a nivel carga (booleano): el panel lo usa como respaldo del TLX
      // de la operativa. No es dato sensible.
      TELEX: !!r.telex,
      MODE: r.mode || '', STOCK: r.stock || '',
      // Madera a nivel carga: en muchas cargas el WOOD de la operativa viene vacío
      // aunque la carga tiene wood=true (caso A7958). El partner necesita el aviso
      // igual: la operativa manda y la carga es el respaldo.
      WOOD_CARGA: r.wood ? 'SI' : '',
      OOG: r.oog ? 'SI' : '',
      // Descripción de la mercadería a nivel carga (shipments.observacion): es
      // el respaldo de la op cuando DESCRIPCION viene vacía (casi siempre).
      DESCRIPCION_CARGA: r.observacion || '',
      // ¿Está liberada por la naviera? (check de cierre en ref_checks)
      LIBERADA: refsLiberadas.has(String(r.ref || '').trim().toUpperCase()),
      // ¿Está paga la terminal? Estampado en Pagos, o monto 0 (convención de la
      // planilla vieja: 0 = ya pagado). null/undefined = sin datos = NO pagada.
      TERMINAL_PAGADA: !!r.pago_terminal_at || Number(r.monto_terminal) === 0,
      // Ídem la devolución del vacío (CDEV): con esto y la terminal de
      // devolución, el depósito sabe si puede devolverlo (Brian 03/09).
      DEVOLUCION_PAGADA: !!r.pago_devolucion_at || Number(r.monto_devolucion) === 0,
      operativas: ops,
    }
  })
  // Support both legacy (depotName/transportName) and new (filterValue) JWT payloads.
  // El alcance FRESCO de la DB manda sobre el del token (ver revocación arriba).
  const rawFilter: string = alcanceVivo || payload.filterValue || payload.depotName || payload.transportName || ''
  const filterValueUpper = rawFilter.trim().toUpperCase()

  // Lista blanca de la operativa: lo que el partner necesita para operar y nada
  // más. Antes el item del JSONB viajaba VERBATIM — hoy no filtra plata porque
  // el SELECT no la trae, pero cualquier campo sensible que alguien agregue
  // mañana adentro de operativas saldría solo. Mismo criterio que el portal de
  // clientes (api/_lib/clientShipments.ts).
  const opSegura = (op: any, rolEsTransporte: boolean, oogCarga: string, woodCarga: string, descripcionCarga = '') => ({
    CNTR_OP: op.CNTR_OP || '',
    DEPOSITO: op.DEPOSITO || '',
    // El transporte ajeno NO se muestra: en una operativa compartida
    // ("MARITIMA / URUGUAY") viajaba el string entero y el partner leía el
    // nombre del otro. Se devuelve sólo el suyo.
    TRANSPORTE: rolEsTransporte ? rawFilter.trim() : (op.TRANSPORTE || ''),
    SALIDA: op.SALIDA || '',
    LUGAR_SALIDA: op.LUGAR_SALIDA || '',
    ETA_FISC: op.ETA_FISC || '',
    ETA_OP: op.ETA_OP || '',
    OPERATIVA: op.OPERATIVA || '',
    FISCAL: op.FISCAL || '',
    DESCARGA: op.DESCARGA || '',
    DEV: op.DEV || '',
    LIBRE: op.LIBRE || '',
    HORARIO: op.HORARIO || '',
    PKGS: op.PKGS ?? 0,
    KG: op.KG ?? 0,
    M3: op.M3 ?? 0,
    TIPO: op.TIPO || '',
    // Marcas que cambian cómo se carga el camión: madera dispara SENASA en
    // frontera, IMO y no apilable mandan en el orden de estiba.
    WOOD: op.WOOD || woodCarga,
    IMO: op.IMO || '',
    NO_APILABLE: op.NO_APILABLE || '',
    TLX: op.TLX || '',
    // OOG (sobredimensionada) es dato de la CARGA (shipments.oog): el
    // transporte necesita unidad especial y el depósito, permisos.
    OOG: oogCarga,
    // Descripción de la mercadería: la necesitan para saber qué cargan. En
    // casi todas las cargas vive en `observacion` de la carga y la operativa
    // viene vacía (A8121 "MOTOPARTES" salía "—" en el Plan de carga, 03/09):
    // la operativa manda y la carga es el respaldo.
    DESCRIPCION: op.DESCRIPCION || descripcionCarga || '',
  })
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
    delete safe.WOOD_CARGA; delete safe.DESCRIPCION_CARGA // ya viajan dentro de cada operativa
    delete safe.C_TERMINAL; delete safe.C_DEV; delete safe.LOCALES
    delete safe.FLETE; delete safe.FORMA_DE_PAGO; delete safe.VTO
    const esTransporte = payload.role === 'transport'
    // Depósito: el TURNO es de Montecon (TCP no agenda), pero el RETIRADO vale
    // para cualquier terminal. Iba atado a Montecon, así que si el equipo
    // marcaba retirada una carga de TCP desde HOY, al depósito le seguía
    // apareciendo como pendiente de retirar (Brian 03/09: "si yo desde admin ya
    // apreté retirado, a ellos les debe salir de la lista"). Desde el #344 el
    // aviso "retiré" también estampa RETIRADO en TCP, así que la fila se cierra
    // sola por los dos lados.
    if (payload.role === 'depot') {
      const esMontecon = String(shipment.TERMINAL || '').toUpperCase().includes('MONTECON')
      const ag = agendaPorRef.get(String(shipment.REF || '').trim().toUpperCase())
      safe.TURNO_RETIRO = esMontecon ? (ag?.fecha_retiro || '') : ''
      safe.RETIRADO = ag?.retirado_at || ''
    }
    return { ...safe, operativas: matchingOps.map((op: any) => opSegura(op, esTransporte, shipment.OOG || '', shipment.WOOD_CARGA || '', String(shipment.DESCRIPCION_CARGA || ''))) }
  }).filter(Boolean)

  return { shipments: filtered, alcance: rawFilter.trim(), nombre }
}

// ── Partner Users (admin CRUD) ──────────────────────────────────────

async function handlePartnerUsers(req: VercelRequest, res: VercelResponse, db: any, payload: TokenPayload | null = null) {
  // Mutaciones SOLO OWNER (auditoría 26/08): un acceso de partner con
  // filter_value arbitrario es una ventana a las cargas de ese depósito o
  // transporte — un admin acotado no puede fabricarse esa ventana.
  if (req.method !== 'GET' && !isOwner(payload)) {
    return res.status(403).json({ error: 'Solo el owner puede crear o modificar accesos de partners' })
  }
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

    // welcomeSent = si HAY proveedor de mail (el envío es fire-and-forget). Con
    // false la UI avisa que el acceso se pasa por otro canal.
    return res.status(201).json({ created: true, id: data.id, welcomeSent: mailConfigured() })
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

// Whitelist de columnas: vive en api/_lib/shipmentCols.ts para que el
// frontend la testee (src/lib/datosClave.test.ts).

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

/**
 * El PATCH normal de columnas de `shipments` (whitelist SHIPMENT_COLS + rollup
 * de operativas[] + estampa de pagos + auditoría + timbre de co-edición).
 * Lo usan el PATCH de la entidad shipments (grilla, quick edit, armador) y la
 * confirmación de avisos de partners (devolvi / desconsolide): mismo camino,
 * mismo rastro. El scoping por cliente lo hace el caller ANTES de llamar.
 */
async function aplicarPatchShipment(
  db: any, payload: TokenPayload | null, id: string, body: Record<string, unknown>, clientId?: string,
): Promise<{ status: 200 | 400; json: Record<string, unknown> }> {
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
  if (Object.keys(updates).length === 0) return { status: 400, json: { error: 'No valid fields' } }
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
  // Timbre de co-edición: avisa a los demás browsers que una carga cambió,
  // para que refetcheen. Sin esto, el que tenía la grilla abierta seguía
  // viendo el transporte viejo hasta recargar la página (Brian 31/08).
  void broadcastTrucksLive('shipment', undefined, clientId)
  return { status: 200, json: { updated: true } }
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

    // Scoping por cliente ANTES de cualquier ruta del PATCH: renameRef y
    // ?fcl=1 retornaban antes del check y un admin acotado podía renombrar
    // o editar cargas fuera de su cartera (hallazgo auditoría 26/08). Fuera
    // del patrón → 404, indistinguible de inexistente.
    const allowedPatch = await allowedRefsForPayload(db, payload)
    if (allowedPatch) {
      const { data: target } = await db.from('shipments').select('ref').eq('id', id).maybeSingle()
      if (!target || !allowedPatch.has(refOf(target.ref))) {
        return res.status(404).json({ error: 'Carga no encontrada' })
      }
    }

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

    // (El scoping por cliente ya corrió arriba, antes de renameRef/?fcl=1.)
    const r = await aplicarPatchShipment(db, payload, id, body, clientIdFromRequest(req))
    return res.status(r.status).json(r.json)
  }

  if (req.method === 'POST') {
    const arr = Array.isArray(req.body) ? req.body : [req.body]
    // Admin acotado: solo puede crear/actualizar cargas de SUS clientes.
    if (payload && payload.role === 'admin' && (payload as AdminPayload).clientePattern) {
      const pattern = (payload as AdminPayload).clientePattern as string
      const fuera = arr.find((r: any) => !matchesClientePattern(String(r?.cliente || ''), pattern))
      if (fuera) return res.status(403).json({ error: 'No podés crear cargas de ese cliente' })
    }
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
    void broadcastTrucksLive('shipment', undefined, clientIdFromRequest(req))
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
    const allowedDel = await allowedRefsForPayload(db, payload)
    if (allowedDel && !allowedDel.has(refOf(ship.ref))) {
      return res.status(404).json({ error: 'Carga no encontrada' })
    }
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
      .select('id, email, name, level, active, created_at, last_login, cliente_pattern, home_area')
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
      // Pestaña con la que arranca al loguearse ('' = la default de la marca).
      homeArea: z.string().max(40).optional(),
    }), req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const { id, email, name, password, clientePattern, homeArea } = v.data
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
        home_area: (homeArea || '').trim() || null,
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
    if (homeArea !== undefined) updates.home_area = (homeArea || '').trim() || null
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
async function handleAuditLog(req: VercelRequest, res: VercelResponse, db: any, payload: TokenPayload | null = null) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  // ?ref= trae el log de UNA carga (Seguimientos lo usa para reconstruir los
  // cambios de buque: el trasbordo no se registra en ningún otro lado). Sin
  // ref, el listado general de actividad. Las refs se guardan en mayúsculas.
  const ref = (req.query.ref as string || '').trim().toUpperCase()
  // ?campo=buque trae SOLO los patches que tocaron ese campo, de todas las
  // cargas: así Seguimientos arma el mapa de trasbordos de la cola entera con
  // una sola llamada (los cambios de buque son pocos). Whitelist cerrada: el
  // nombre entra en un path JSONB, no se acepta cualquier cosa.
  const CAMPOS_FILTRABLES = new Set(['buque'])
  const campo = (req.query.campo as string || '').trim()
  if (campo && !CAMPOS_FILTRABLES.has(campo)) {
    return res.status(400).json({ error: `campo no filtrable: ${campo}` })
  }
  const base = () => db.from('audit_log')
    .select('id, ts, usuario, action, entity, ref, details')
    .order('ts', { ascending: false })
  let q = base()
  if (ref) q = q.eq('ref', ref)
  if (campo) q = q.not(`details->>${campo}`, 'is', null)
  q = q.limit(ref || campo ? 500 : 300)
  let { data, error } = await q
  // Red de seguridad del filtro JSONB: si PostgREST no acepta el path, se
  // resuelve en JS sobre una ventana grande en vez de devolver un 500 (los
  // cambios de buque son poquísimos — 15 en 2.800 entradas, medido 17/08).
  if (error && campo) {
    let alt = base().limit(3000)
    if (ref) alt = alt.eq('ref', ref)
    const retry = await alt
    if (retry.error) throw retry.error
    data = (retry.data || []).filter((r: any) => r?.details && r.details[campo] != null)
    error = null
  }
  if (error) throw error
  // Admin acotado: solo las entradas de refs de SUS clientes. Las entradas sin
  // ref (config, cuotas) se ocultan — details puede traer montos de cualquiera
  // (hallazgo revisión 12/08).
  const allowed = await allowedRefsForPayload(db, payload)
  const log = allowed
    ? (data || []).filter((r: any) => r.ref && allowed.has(refOf(r.ref)))
    : (data || [])
  return res.status(200).json({ log })
}

// ── Operator assignments (overlay ref → operativo) ─────────────────
// GET /api/data/operator-assignments · POST upsert · DELETE ?ref=

// ── Bitácora de gestiones por carga (ref_notas, 17/08/2026) ─────────
// "Reclamado por wpp al cliente", "reclamado a la agencia"… con quién y
// cuándo. Append-only: el estado es el último renglón, la historia queda.
// La usan la tarjeta "Llegan sin liberar" de HOY y la pestaña Checks.

async function handleRefNotas(req: VercelRequest, res: VercelResponse, db: any, payload: TokenPayload | null) {
  if (req.method === 'GET') {
    const ref = (req.query.ref as string || '').trim().toUpperCase()
    let q = db.from('ref_notas').select('*').order('created_at', { ascending: false }).limit(500)
    if (ref) q = q.eq('ref', ref)
    const { data, error } = await q
    if (error) throw error
    // Scoping por cliente (mismo patrón que seguimientos-log / audit-log).
    const allowed = await allowedRefsForPayload(db, payload)
    return res.status(200).json({ rows: filterByAllowedRef(data || [], allowed, (r: any) => r.ref) })
  }

  if (req.method === 'POST') {
    const v = validate(z.object({
      ref: z.string().min(1).max(40),
      texto: z.string().min(1).max(300),
    }), req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const { ref, texto } = v.data

    const allowed = await allowedRefsForPayload(db, payload)
    if (allowed && !allowed.has(refOf(ref))) return res.status(404).json({ error: 'Carga no encontrada' })

    const row = {
      ref: ref.trim().toUpperCase(),
      texto: texto.trim(),
      usuario: auditUser(payload as { user?: string; name?: string } | null),
    }
    const { data, error } = await db.from('ref_notas').insert(row).select('*').single()
    if (error) throw error
    return res.status(200).json({ saved: true, row: data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Historial de seguimientos (cola de Nico, 13/08/2026) ────────────
// Trazabilidad del buque: cada 'enviado' guarda la foto de la ETA/buque al
// momento del update, y cada 'eta' registra un cambio de fecha hecho desde
// la cola (anterior → nueva). El usuario lo pone el server (del token), no
// el cliente. Solo lectura + alta: el historial no se edita ni se borra.

async function handleSeguimientosLog(req: VercelRequest, res: VercelResponse, db: any, payload: TokenPayload | null) {
  if (req.method === 'GET') {
    // La ref se guarda SIEMPRE en mayúsculas (ver POST) → normalizar el filtro,
    // si no una carga dada de alta en minúsculas nunca encuentra su historial.
    const ref = (req.query.ref as string || '').trim().toUpperCase()
    // El tope estaba fijo en 500 y se aplicaba EN SILENCIO. Para el historial
    // de UNA carga sobra, pero la pestaña Historial pide el global: con ~90
    // cargas en viaje y un update semanal por carga son unas 5 semanas, y a
    // partir de ahí lo más viejo desaparecía sin decir nada. Ahora se acota
    // por PERÍODO (?desde=YYYY-MM-DD) y, si igual se llega al tope, se avisa.
    const desde = (req.query.desde as string || '').trim()
    const limitePedido = Number(req.query.limit)
    const limite = Number.isFinite(limitePedido) && limitePedido > 0
      ? Math.min(Math.floor(limitePedido), 5000)
      : 500
    let q = db.from('seguimientos_log').select('*').order('created_at', { ascending: false }).limit(limite)
    if (ref) q = q.eq('ref', ref)
    // Uruguay es UTC-3 fijo (sin horario de verano desde 2015): el corte se
    // hace en la medianoche LOCAL, para que "últimos 30 días" no arrastre las
    // últimas horas del día anterior.
    if (/^\d{4}-\d{2}-\d{2}$/.test(desde)) q = q.gte('created_at', `${desde}T00:00:00-03:00`)
    const { data, error } = await q
    if (error) throw error
    // Scoping por cliente: admin acotado solo ve historial de SUS cargas
    // (mismo patrón que ref-checks / audit-log).
    const allowed = await allowedRefsForPayload(db, payload)
    const truncado = (data || []).length >= limite
    if (truncado) {
      console.warn(`[seguimientos-log] listado truncado en ${limite}: hay filas que no se están devolviendo`)
    }
    return res.status(200).json({
      rows: filterByAllowedRef(data || [], allowed, (r: any) => r.ref),
      truncado,
    })
  }

  if (req.method === 'POST') {
    const v = validate(z.object({
      ref: z.string().min(1).max(40),
      tipo: z.enum(['enviado', 'eta', 'deshecho', 'trasbordo']),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      // max 40: hay ETAs legacy de texto libre ('CONFIRMAR CON NAVIERA') que
      // valen como foto histórica — el cliente además trunca a 40.
      etaAnterior: z.string().max(40).optional(),
      etaNueva: z.string().max(40).optional(),
      buque: z.string().max(120).optional(),
    }), req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const { ref, tipo, fecha, etaAnterior, etaNueva, buque } = v.data

    // Scoping también al escribir: no se falsifica historial de cargas ajenas.
    const allowed = await allowedRefsForPayload(db, payload)
    if (allowed && !allowed.has(refOf(ref))) return res.status(404).json({ error: 'Carga no encontrada' })

    const row = {
      ref: ref.trim().toUpperCase(),
      tipo,
      ...(fecha ? { fecha } : {}),
      eta_anterior: (etaAnterior || '').trim() || null,
      eta_nueva: (etaNueva || '').trim() || null,
      buque: (buque || '').trim() || null,
      usuario: auditUser(payload as { user?: string; name?: string } | null),
    }
    const { error } = await db.from('seguimientos_log').insert(row)
    if (error) throw error
    return res.status(200).json({ saved: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Actas de deposito (EN DEPOSITO) ──────────────────────────────────
// GET  /api/data/deposito-actas?ref=A8025  → actas de esa carga
// GET  /api/data/deposito-actas            → las ultimas (panel de campo)
// POST /api/data/deposito-actas            → agrega una
//
// Es un LOG por (ref, contenedor): no se edita ni se borra. Cada trasiego deja
// su acta; el historial ES el dato (pedido de Brian 18/08: "poder cargar
// diferentes dias y dejar registro por cada trasiego").
// El usuario lo pone el server desde el token, nunca el cliente.

async function handleDepositoActas(req: VercelRequest, res: VercelResponse, db: any, payload: TokenPayload | null) {
  if (req.method === 'GET') {
    const ref = (req.query.ref as string || '').trim().toUpperCase()
    const limitePedido = Number(req.query.limit)
    const limite = Number.isFinite(limitePedido) && limitePedido > 0
      ? Math.min(Math.floor(limitePedido), 5000)
      : 1000
    let q = db.from('deposito_actas').select('*').order('created_at', { ascending: false }).limit(limite)
    if (ref) q = q.eq('ref', ref)
    // Por defecto solo las VIGENTES: las anuladas no se muestran ni alimentan
    // el informe. ?anuladas=1 las trae para auditar quien anulo que.
    if (String(req.query.anuladas || '') !== '1') q = q.is('anulada_at', null)
    const { data, error } = await q
    if (error) throw error
    // Scoping por cliente: admin acotado solo ve las actas de SUS cargas.
    const allowed = await allowedRefsForPayload(db, payload)
    const truncado = (data || []).length >= limite
    if (truncado) {
      console.warn(`[deposito-actas] listado truncado en ${limite}: hay actas que no se estan devolviendo`)
    }
    return res.status(200).json({
      actas: filterByAllowedRef(data || [], allowed, (r: any) => r.ref),
      truncado,
    })
  }

  if (req.method === 'POST') {
    const v = validate(z.object({
      ref: z.string().min(1).max(40),
      // UN contenedor, nunca la lista de la planilla. '' = toda la carga.
      contenedor: z.string().max(40).optional(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      // jsonb libre de booleanos: sumar un check no obliga a migrar la tabla.
      checks: z.record(z.string(), z.boolean()).optional(),
      comentario: z.string().max(4000).optional(),
    }), req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const { ref, contenedor, fecha, checks, comentario } = v.data

    // Scoping tambien al escribir: no se falsifican actas de cargas ajenas.
    const allowed = await allowedRefsForPayload(db, payload)
    if (allowed && !allowed.has(refOf(ref))) return res.status(404).json({ error: 'Carga no encontrada' })

    const row = {
      ref: ref.trim().toUpperCase(),
      contenedor: (contenedor || '').trim().toUpperCase(),
      ...(fecha ? { fecha } : {}),
      checks: checks || {},
      comentario: (comentario || '').trim(),
      usuario: auditUser(payload as { user?: string; name?: string } | null),
    }
    const { data, error } = await db.from('deposito_actas').insert(row).select().single()
    if (error) throw error
    logAudit(db, payload, 'create', 'deposito_acta', row.ref, { contenedor: row.contenedor })
    return res.status(200).json({ acta: data })
  }

  // ANULAR, no borrar: se cargo por error (Brian 18/08) pero el acta es
  // material de expediente. La fila queda con quien y cuando la anulo.
  if (req.method === 'DELETE') {
    const id = (req.query.id as string || '').trim()
    if (!id) return res.status(400).json({ error: 'id query parameter required' })

    const { data: previa, error: eGet } = await db
      .from('deposito_actas').select('ref, contenedor, anulada_at').eq('id', id).maybeSingle()
    if (eGet) throw eGet
    if (!previa) return res.status(404).json({ error: 'Acta no encontrada' })

    const allowed = await allowedRefsForPayload(db, payload)
    if (allowed && !allowed.has(refOf(previa.ref))) return res.status(404).json({ error: 'Acta no encontrada' })
    // Ya anulada: no se re-estampa el autor ni la fecha del primero que la anulo.
    if (previa.anulada_at) return res.status(200).json({ anulada: true, yaEstaba: true })

    const { error } = await db
      .from('deposito_actas')
      .update({ anulada_at: new Date().toISOString(), anulada_por: auditUser(payload as { user?: string; name?: string } | null) })
      .eq('id', id)
    if (error) throw error
    logAudit(db, payload, 'anular', 'deposito_acta', previa.ref, { contenedor: previa.contenedor, id })
    return res.status(200).json({ anulada: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Agenda de retiros MONTECON ───────────────────────────────────────
// GET    /api/data/montecon-agenda           → todas las filas
// POST   /api/data/montecon-agenda           → {ref, eta} agendar/re-agendar
//                                              (upsert: pisa el snapshot)
// DELETE /api/data/montecon-agenda?ref=A8045 → desagendar
// Guarda la ETA CONTRA la que se agendo el retiro: la pantalla deriva
// "reagendar" cuando la ETA actual difiere (Brian 22/08, turnos escasos).

/** Estampar / deshacer RETIRADO o AVISADO en montecon_agenda. Lo usan el POST
 *  de montecon-agenda (botones de HOY) y la confirmación del aviso `retire`
 *  del depósito: misma escritura, misma auditoría. */
async function marcarMontecon(
  db: any, payload: TokenPayload | null, ref: string, campo: 'retirado' | 'avisado', marcando: boolean,
): Promise<{ ok: true } | { ok: false; status: 404; error: string }> {
  const usuario = auditUser(payload as { user?: string; name?: string } | null)
  const nowIso = new Date().toISOString()
  const patch: Record<string, unknown> = {
    [`${campo}_at`]: marcando ? nowIso : null,
    [`${campo}_por`]: marcando ? usuario : null,
    updated_at: nowIso,
  }
  const { data: upd, error } = await db.from('montecon_agenda')
    .update(patch).eq('ref', ref).select('ref')
  if (error) throw error
  if (!upd?.length) {
    // Se puede marcar RETIRADO sin haber agendado antes (retiro directo):
    // nace la fila con eta_agendada vacía. Desmarcar sin fila no existe.
    if (!marcando) return { ok: false, status: 404, error: 'Esa carga no tiene agenda de Montecon' }
    const { error: insErr } = await db.from('montecon_agenda')
      .insert({ ref, eta_agendada: '', usuario, ...patch })
    if (insErr) throw insErr
  }
  logAudit(db, payload, `${marcando ? 'marcar' : 'desmarcar'} ${campo} montecon`, 'montecon_agenda', ref)
  return { ok: true }
}

async function handleMonteconAgenda(req: VercelRequest, res: VercelResponse, db: any, payload: TokenPayload | null) {
  if (req.method === 'GET') {
    const { data, error } = await db.from('montecon_agenda').select('*').limit(2000)
    if (error) throw error
    const allowed = await allowedRefsForPayload(db, payload)
    return res.status(200).json({ agenda: filterByAllowedRef(data || [], allowed, (r: any) => r.ref) })
  }

  if (req.method === 'POST') {
    // Tres verbos en uno: {eta} agenda · {marcar} estampa retirado/avisado ·
    // {desmarcar} lo deshace. Exactamente uno por request.
    const v = validate(z.object({
      ref: z.string().min(1).max(40),
      eta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      /** Fecha del TURNO conseguido — solo acompaña a `eta` (verbo agendar). */
      fecha_retiro: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      marcar: z.enum(['retirado', 'avisado']).optional(),
      desmarcar: z.enum(['retirado', 'avisado']).optional(),
    }).refine(d => [d.eta, d.marcar, d.desmarcar].filter(x => x !== undefined).length === 1,
      { message: 'Mandá eta, marcar o desmarcar (uno solo)' }), req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const ref = v.data.ref.trim().toUpperCase()
    const allowed = await allowedRefsForPayload(db, payload)
    if (allowed && !allowed.has(refOf(ref))) return res.status(404).json({ error: 'Carga no encontrada' })
    const usuario = auditUser(payload as { user?: string; name?: string } | null)
    const nowIso = new Date().toISOString()

    if (v.data.marcar || v.data.desmarcar) {
      const campo = (v.data.marcar || v.data.desmarcar) as 'retirado' | 'avisado'
      const r = await marcarMontecon(db, payload, ref, campo, Boolean(v.data.marcar))
      if (!r.ok) return res.status(r.status).json({ error: r.error })
      return res.status(200).json({ saved: true })
    }

    const row = {
      ref,
      eta_agendada: v.data.eta,
      // Sin turno nuevo se limpia: un turno viejo de otra agendada confunde más
      // que la ausencia del dato.
      fecha_retiro: v.data.fecha_retiro ?? null,
      usuario,
      updated_at: nowIso,
    }
    const { error } = await db.from('montecon_agenda').upsert(row, { onConflict: 'ref' })
    if (error) throw error
    logAudit(db, payload, 'agendar montecon', 'montecon_agenda', ref, { eta: v.data.eta, fecha_retiro: v.data.fecha_retiro ?? null })
    return res.status(200).json({ saved: true })
  }

  if (req.method === 'DELETE') {
    const ref = (req.query.ref as string || '').trim().toUpperCase()
    if (!ref) return res.status(400).json({ error: 'ref query parameter required' })
    const allowed = await allowedRefsForPayload(db, payload)
    if (allowed && !allowed.has(refOf(ref))) return res.status(404).json({ error: 'Carga no encontrada' })
    const { error } = await db.from('montecon_agenda').delete().eq('ref', ref)
    if (error) throw error
    logAudit(db, payload, 'desagendar montecon', 'montecon_agenda', ref)
    return res.status(200).json({ deleted: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

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

// ── Avisos de partners (partner_avisos) ─────────────────────────────────
// El depósito / transporte PROPONE ("retiré", "devolví el vacío", "desconsolidé
// stock Nº", "SENASA solicitado") y el equipo CONFIRMA desde HOY. El partner
// jamás escribe en shipments/trucks: su única escritura es crear el aviso, y
// solo sobre cargas de su alcance. Confirmar ejecuta la acción que YA existe
// en la app (misma función, mismo rastro). Spec:
// docs/superpowers/specs/2026-09-01-partner-hoy-avisos-design.md
// GET   → partner: los suyos (30 d) · admin: pendientes + resueltos de 7 d
// POST  → solo depot/transport: {tipo, ref, cntr?, dato?}
// PATCH ?id= → solo admin/owner: {accion:'confirmar'|'rechazar', motivo?}

const AVISOS_DIAS_PARTNER = 30
const AVISOS_DIAS_RESUELTOS_ADMIN = 7

const AVISO_COLS = 'id,tipo,ref,cntr,partner_role,partner_filter,partner_email,partner_name,dato,estado,motivo_rechazo,created_at,resolved_at,resolved_by'

/** Patrón para `.ilike()` que matchea EXACTO sin importar mayúsculas: escapa
 *  los comodines de LIKE (%, _) para que "LCL_201" no matchee "LCLX201". */
const ilikeExacto = (v: string): string => v.replace(/[\\%_]/g, m => '\\' + m)

const ResolverAvisoSchema = z.object({
  accion: z.enum(['confirmar', 'rechazar']),
  motivo: z.string().max(500).optional(),
})

/** Filas VIVAS de shipments para una ref (case-insensitive, sin archivadas ni
 *  espejo). Una ref puede tener más de una fila (2 clientes en el mismo
 *  contenedor): la acción se aplica a todas — físicamente es la misma carga. */
async function shipmentsVivasPorRef(db: any, ref: string, cols: string): Promise<any[]> {
  const { data, error } = await db.from('shipments')
    .select(cols)
    .ilike('ref', ilikeExacto(ref))
    .neq('source', 'sheet')
    .eq('archived', false)
    .limit(20)
  if (error) throw error
  return data || []
}

/** Ejecuta la acción real de un aviso confirmado. Lanza Error con mensaje
 *  claro si algo falla: el caller NO marca el aviso como confirmado. */
async function ejecutarAccionAviso(db: any, payload: TokenPayload | null, aviso: any, clientId?: string): Promise<void> {
  const ref = refOf(aviso.ref)
  const dato = (aviso.dato && typeof aviso.dato === 'object') ? aviso.dato : {}
  const hoy = montevideoTodayIso()

  if (aviso.tipo === 'retire') {
    // Mismo "marcar retirado" que el botón de HOY, con agenda o sin ella:
    // marcarMontecon crea la fila si no existe. Antes solo se estampaba cuando
    // la carga estaba agendada en Montecon, así que un retiro de TCP cerraba el
    // aviso y no disparaba nada — el recordatorio de avisarle al cliente no
    // aparecía nunca (Brian 03/09: "el retiré de TCP también debería, para
    // Montecon"). El ciclo sigue siendo RETIRADO → el equipo avisa por mail →
    // AVISADO a mano: nada se le manda solo al cliente.
    const r = await marcarMontecon(db, payload, ref, 'retirado', true)
    if (!r.ok) throw new Error(r.error)
    return
  }

  if (aviso.tipo === 'devolvi') {
    // LIBRE = DEVUELTO por el MISMO camino que el quick edit de LIBRE: patch
    // nivel carga (columna + todos los contenedores) → aplicarPatchShipment.
    // LIBRE es dato de la carga, no del contenedor: aunque el aviso traiga un
    // cntr, se marca la carga entera (ver patchDevolvi).
    const filas = await shipmentsVivasPorRef(db, ref, 'id, ref, operativas')
    if (!filas.length) throw new Error(`No encontré la carga ${ref} (¿archivada?). El aviso sigue pendiente.`)
    for (const fila of filas) {
      const r = await aplicarPatchShipment(db, payload, fila.id, patchDevolvi(fila), clientId)
      if (r.status !== 200) throw new Error(String(r.json.error || 'No se pudo marcar DEVUELTO'))
    }
    return
  }

  if (aviso.tipo === 'desconsolide') {
    // stock + desconsol_date (si estaba vacía) — mismo criterio que la bandeja
    // de stock, por el mismo PATCH.
    const filas = await shipmentsVivasPorRef(db, ref, 'id, ref, desconsol_date')
    if (!filas.length) throw new Error(`No encontré la carga ${ref} (¿archivada?). El aviso sigue pendiente.`)
    for (const fila of filas) {
      const r = await aplicarPatchShipment(db, payload, fila.id, patchDesconsolide(fila, dato, hoy), clientId)
      if (r.status !== 200) throw new Error(String(r.json.error || 'No se pudo guardar el stock'))
    }
    return
  }

  // senasa: el aviso confirmado ES el dato. No toca la operación.
}

async function handlePartnerAvisos(req: VercelRequest, res: VercelResponse, db: any, payload: TokenPayload) {
  const esPartner = payload.role === 'depot' || payload.role === 'transport'
  const esAdmin = payload.role === 'admin'

  if (req.method === 'GET') {
    if (esPartner) {
      const vis = await partnerShipmentsVisibles(db, payload)
      if ('status' in vis) return res.status(vis.status).json({ error: vis.error })
      if (!vis.alcance) return res.status(200).json({ avisos: [] })
      const desde = new Date(Date.now() - AVISOS_DIAS_PARTNER * 86_400_000).toISOString()
      const { data, error } = await db.from('partner_avisos')
        .select(AVISO_COLS)
        .eq('partner_role', payload.role)
        .ilike('partner_filter', ilikeExacto(vis.alcance))
        .gte('created_at', desde)
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return res.status(200).json({ avisos: (data || []).map(mapFilaToAviso) })
    }
    // Admin/owner: todos los pendientes + los resueltos de los últimos 7 días.
    const desde = new Date(Date.now() - AVISOS_DIAS_RESUELTOS_ADMIN * 86_400_000).toISOString()
    const { data, error } = await db.from('partner_avisos')
      .select(AVISO_COLS)
      .or(`estado.eq.pendiente,resolved_at.gte.${desde}`)
      .order('created_at', { ascending: false })
      .limit(1000)
    if (error) throw error
    const allowed = await allowedRefsForPayload(db, payload)
    return res.status(200).json({ avisos: filterByAllowedRef(data || [], allowed, (r: any) => r.ref).map(mapFilaToAviso) })
  }

  if (req.method === 'POST') {
    if (!esPartner) return res.status(403).json({ error: 'Los avisos los crea el depósito o el transporte.' })
    const hoy = montevideoTodayIso()
    const v = validarNuevoAviso(payload.role, req.body, hoy)
    if (!v.ok) return res.status(v.status).json({ error: v.error })
    const { tipo, ref, cntr, dato } = v.data

    // Alcance FRESCO: sólo sobre cargas que el partner ve en su portal.
    const vis = await partnerShipmentsVisibles(db, payload)
    if ('status' in vis) return res.status(vis.status).json({ error: vis.error })
    const cargas = vis.shipments.filter((s: any) => refOf(s.REF) === ref)
    if (!cargas.length) {
      return res.status(403).json({ error: `La carga ${ref} no está en tu alcance.` })
    }
    if (cntr && !cargas.some((s: any) => cntrPerteneceACarga(cntr, s))) {
      return res.status(400).json({ error: `El contenedor ${cntr} no es de la carga ${ref}.` })
    }

    const partnerEmail = String((payload as any).email || '').trim().toLowerCase()
    const partnerRole = payload.role as 'depot' | 'transport'

    // Un pendiente por (tipo, ref, cntr) POR PARTNER: si vuelve a apretar, se reusa.
    // Misma clave que el GET (partner_role + partner_filter): otro depósito/transporte con
    // la misma ref en alcance nunca recibe un aviso ajeno (ni su email/nombre).
    const { data: previo, error: errPrevio } = await db.from('partner_avisos')
      .select(AVISO_COLS)
      .eq('tipo', tipo).eq('ref', ref).eq('cntr', cntr).eq('estado', 'pendiente')
      .eq('partner_role', partnerRole)
      .ilike('partner_filter', ilikeExacto(vis.alcance))
      .order('created_at', { ascending: false })
      .limit(1)
    if (errPrevio) throw errPrevio
    if (previo?.length) return res.status(200).json({ aviso: mapFilaToAviso(previo[0]) })

    const { data: nuevo, error } = await db.from('partner_avisos')
      .insert({
        tipo, ref, cntr, dato,
        partner_role: partnerRole,
        partner_filter: vis.alcance,
        partner_email: partnerEmail,
        partner_name: vis.nombre || null,
        estado: 'pendiente',
      })
      .select(AVISO_COLS)
      .single()
    if (error) throw error
    // Auditoría con el EMAIL del partner (no hay name/user de admin en su token).
    logAudit(db, { email: partnerEmail } as any, `aviso_partner:${tipo}`, 'partner_avisos', ref, { id: nuevo.id, cntr, dato, partner_filter: vis.alcance })
    return res.status(200).json({ aviso: mapFilaToAviso(nuevo) })
  }

  if (req.method === 'PATCH') {
    if (!esAdmin) return res.status(403).json({ error: 'Los avisos los confirma o rechaza el equipo.' })
    const id = String(req.query.id || '').trim()
    if (!id) return res.status(400).json({ error: 'id required' })
    const v = validate(ResolverAvisoSchema, req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const motivo = String(v.data.motivo || '').trim()
    if (v.data.accion === 'rechazar' && !motivo) {
      return res.status(400).json({ error: 'Para rechazar hace falta un motivo (el partner lo va a ver).' })
    }

    const { data: aviso, error: errAviso } = await db.from('partner_avisos').select(AVISO_COLS).eq('id', id).maybeSingle()
    if (errAviso) throw errAviso
    if (!aviso) return res.status(404).json({ error: 'Aviso no encontrado' })
    // Admin acotado por cliente: fuera de su cartera → 404 (igual que shipments).
    const allowed = await allowedRefsForPayload(db, payload)
    if (allowed && !allowed.has(refOf(aviso.ref))) return res.status(404).json({ error: 'Aviso no encontrado' })
    if (aviso.estado !== 'pendiente') {
      return res.status(409).json({ error: `Ese aviso ya fue ${aviso.estado} por ${aviso.resolved_by || 'alguien del equipo'}.` })
    }

    const resolvedBy = auditUser(payload as any)
    const nowIso = new Date().toISOString()

    if (v.data.accion === 'confirmar') {
      // Primero la acción real; si falla, el aviso queda pendiente y se avisa.
      try {
        await ejecutarAccionAviso(db, payload, aviso, clientIdFromRequest(req))
      } catch (e: any) {
        console.error('[partner-avisos] confirmar falló:', e?.message)
        return res.status(500).json({ error: `No pude aplicar el aviso: ${e?.message || 'error desconocido'}. Quedó pendiente.` })
      }
    }

    const { data: upd, error } = await db.from('partner_avisos')
      .update({
        estado: v.data.accion === 'confirmar' ? 'confirmado' : 'rechazado',
        motivo_rechazo: v.data.accion === 'rechazar' ? motivo : null,
        resolved_at: nowIso,
        resolved_by: resolvedBy,
      })
      .eq('id', id)
      .eq('estado', 'pendiente')
      .select(AVISO_COLS)
      .maybeSingle()
    if (error) throw error
    if (!upd) return res.status(409).json({ error: 'Ese aviso lo resolvió otra persona hace un instante.' })
    logAudit(db, payload, `aviso_partner_${v.data.accion}`, 'partner_avisos', refOf(aviso.ref), {
      id, tipo: aviso.tipo, cntr: aviso.cntr, partner: aviso.partner_filter, dato: aviso.dato, motivo: motivo || undefined,
    })
    return res.status(200).json({ aviso: mapFilaToAviso(upd) })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
