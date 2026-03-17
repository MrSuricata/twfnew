import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest, type ClientPayload } from '../_lib/jwt.js'
import { handleCors } from '../_lib/cors.js'
import { getSupabase } from '../_lib/supabase.js'
import { performServerSync, matchesClientePattern } from '../_lib/csvParser.js'

// ─── Client Reports API ─────────────────────────────────────────────
// GET  /api/client/reports              → list reports for client's shipments (metadata only)
// GET  /api/client/reports?id=xxx       → single report WITH file_data (for download)
// ─────────────────────────────────────────────────────────────────────

/** Get all shipment REFs for a client, trying Supabase cache first, then Google Sheets live */
async function getClientShipmentRefs(db: any, pattern: string): Promise<Set<string>> {
  // Try 1: Supabase cache
  try {
    const { data: cache } = await db.from('shipments_cache').select('data').eq('id', 1).single()
    if (cache?.data && cache.data.length > 0) {
      const refs = new Set<string>(
        cache.data
          .filter((s: any) => matchesClientePattern(s.CLIENTE, pattern))
          .map((s: any) => s.REF)
      )
      if (refs.size > 0) return refs
    }
  } catch (err) {
    console.warn('[client/reports] Supabase cache read failed:', err)
  }

  // Try 2: Live Google Sheets (if cache is empty or doesn't have client's data)
  const sheetsUrl = process.env.GOOGLE_SHEETS_CSV_URL
  if (sheetsUrl) {
    try {
      const allShipments = await performServerSync(sheetsUrl)

      // Also update the cache for next time
      try {
        await db
          .from('shipments_cache')
          .upsert({ id: 1, data: allShipments, synced_at: new Date().toISOString() }, { onConflict: 'id' })
      } catch {}

      return new Set<string>(
        allShipments
          .filter((s: any) => matchesClientePattern(s.CLIENTE, pattern))
          .map((s: any) => s.REF)
      )
    } catch (sheetsErr) {
      console.warn('[client/reports] Google Sheets fallback failed:', sheetsErr)
    }
  }

  return new Set()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // Require client OR admin auth
  const payload = authenticateRequest(req.headers.authorization)
  if (!payload) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  const db = getSupabase()

  try {
    // Single report download (with file data)
    const reportId = req.query.id as string
    if (reportId) {
      const { data, error } = await db.from('reports').select('*').eq('id', reportId).single()
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'Report not found' })

      // If client, verify this report belongs to their shipments
      if (payload.role === 'client') {
        const clientPayload = payload as ClientPayload
        const pattern = clientPayload.clientePattern.toUpperCase()
        const clientRefs = await getClientShipmentRefs(db, pattern)
        if (!clientRefs.has(data.shipment_ref)) {
          return res.status(403).json({ error: 'Access denied' })
        }
      }

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

    // Bulk list — for clients, filter to their shipments only
    let shipmentRefs: Set<string> | null = null

    if (payload.role === 'client') {
      const clientPayload = payload as ClientPayload
      const pattern = clientPayload.clientePattern.toUpperCase()
      shipmentRefs = await getClientShipmentRefs(db, pattern)
    }

    const { data, error } = await db
      .from('reports')
      .select('id, shipment_ref, container_number, title, content, file_name, file_type, created_at_ts, created_by')
      .order('created_at_ts', { ascending: false })
    if (error) throw error

    let reports = (data || []).map((r: any) => ({
      id: r.id,
      shipmentRef: r.shipment_ref,
      containerNumber: r.container_number || '',
      title: r.title,
      content: r.content,
      fileName: r.file_name,
      fileType: r.file_type,
      createdAt: r.created_at_ts,
      createdBy: r.created_by,
    }))

    // Filter to client's shipments if client auth
    if (shipmentRefs) {
      reports = reports.filter((r: any) => shipmentRefs!.has(r.shipmentRef))
    }

    return res.status(200).json({ reports })
  } catch (error: any) {
    console.error('[client/reports] API error:', error?.message || error)
    return res.status(500).json({ error: 'Database error' })
  }
}
