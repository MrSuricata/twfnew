import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest, type ClientPayload } from '../_lib/jwt.js'
import { handleCors } from '../_lib/cors.js'
import { getSupabase } from '../_lib/supabase.js'

// ─── Client Reports API ─────────────────────────────────────────────
// GET  /api/client/reports              → list reports for client's shipments (metadata only)
// GET  /api/client/reports?id=xxx       → single report WITH file_data (for download)
// ─────────────────────────────────────────────────────────────────────

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
        // Check that the shipment belongs to this client via shipments_cache
        const { data: cache } = await db.from('shipments_cache').select('data').eq('id', 1).single()
        const shipments = cache?.data || []
        const clientRefs = new Set(
          shipments
            .filter((s: any) => s.CLIENTE?.toUpperCase().includes(pattern))
            .map((s: any) => s.REF)
        )
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
      const { data: cache } = await db.from('shipments_cache').select('data').eq('id', 1).single()
      const shipments = cache?.data || []
      shipmentRefs = new Set(
        shipments
          .filter((s: any) => s.CLIENTE?.toUpperCase().includes(pattern))
          .map((s: any) => s.REF)
      )
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
