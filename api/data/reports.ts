import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest } from '../lib/jwt.js'
import { handleCors } from '../lib/cors.js'
import { getSupabase } from '../lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return

  // All report management requires admin auth
  const payload = authenticateRequest(req.headers.authorization)
  if (!payload || payload.role !== 'admin') {
    return res.status(401).json({ error: 'Admin authentication required' })
  }

  const db = getSupabase()

  try {
    // ── GET: List reports (optionally filter by shipmentRef) ──
    if (req.method === 'GET') {
      let query = db.from('reports').select('*').order('created_at_ts', { ascending: false })

      const shipmentRef = req.query.shipmentRef as string
      if (shipmentRef) {
        query = query.eq('shipment_ref', shipmentRef)
      }

      const { data, error } = await query
      if (error) throw error

      // Map DB columns back to camelCase for client
      const reports = (data || []).map((r: any) => ({
        id: r.id,
        shipmentRef: r.shipment_ref,
        title: r.title,
        content: r.content,
        fileName: r.file_name,
        fileType: r.file_type,
        fileData: r.file_data,
        createdAt: r.created_at_ts,
        createdBy: r.created_by,
      }))

      return res.status(200).json({ reports })
    }

    // ── POST: Upsert reports ──
    if (req.method === 'POST') {
      const body = req.body
      const items = Array.isArray(body) ? body : [body]

      const rows = items.map((r: any) => ({
        id: r.id,
        shipment_ref: r.shipmentRef || r.shipment_ref,
        title: r.title,
        content: r.content || '',
        file_name: r.fileName || r.file_name || '',
        file_type: r.fileType || r.file_type || '',
        file_data: r.fileData || r.file_data || '',
        created_at_ts: r.createdAt || r.created_at_ts || Date.now(),
        created_by: r.createdBy || r.created_by || '',
      }))

      const { error } = await db
        .from('reports')
        .upsert(rows, { onConflict: 'id' })

      if (error) throw error
      return res.status(200).json({ saved: true, count: rows.length })
    }

    // ── DELETE: Remove a report ──
    if (req.method === 'DELETE') {
      const id = req.query.id as string
      if (!id) return res.status(400).json({ error: 'id query parameter required' })

      const { error } = await db.from('reports').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ deleted: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Reports API error:', error?.message || error)
    return res.status(500).json({ error: 'Database error', detail: error?.message })
  }
}
