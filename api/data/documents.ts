import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest } from '../lib/jwt.js'
import { handleCors } from '../lib/cors.js'
import { getSupabase } from '../lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return

  // All document management requires admin auth
  const payload = authenticateRequest(req.headers.authorization)
  if (!payload || payload.role !== 'admin') {
    return res.status(401).json({ error: 'Admin authentication required' })
  }

  const db = getSupabase()

  try {
    // ── GET: List documents (optionally filter by shipmentRef) ──
    if (req.method === 'GET') {
      let query = db.from('documents').select('*').order('uploaded_at', { ascending: false })

      const shipmentRef = req.query.shipmentRef as string
      if (shipmentRef) {
        query = query.eq('shipment_ref', shipmentRef)
      }

      const { data, error } = await query
      if (error) throw error

      // Map DB columns back to camelCase for client
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

    // ── POST: Upsert documents ──
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

      const { error } = await db
        .from('documents')
        .upsert(rows, { onConflict: 'id' })

      if (error) throw error
      return res.status(200).json({ saved: true, count: rows.length })
    }

    // ── DELETE: Remove a document ──
    if (req.method === 'DELETE') {
      const id = req.query.id as string
      if (!id) return res.status(400).json({ error: 'id query parameter required' })

      const { error } = await db.from('documents').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ deleted: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Documents API error:', error?.message || error)
    return res.status(500).json({ error: 'Database error', detail: error?.message })
  }
}
