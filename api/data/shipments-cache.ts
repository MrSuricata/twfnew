import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest } from '../lib/jwt.js'
import { handleCors } from '../lib/cors.js'
import { getSupabase } from '../lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return

  const db = getSupabase()

  try {
    // ── GET: Get cached shipments ──
    if (req.method === 'GET') {
      // Admin auth required to read full shipment cache
      const payload = authenticateRequest(req.headers.authorization)
      if (!payload || payload.role !== 'admin') {
        return res.status(401).json({ error: 'Admin authentication required' })
      }

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

    // ── POST: Update shipments cache (called after sync) ──
    if (req.method === 'POST') {
      const payload = authenticateRequest(req.headers.authorization)
      if (!payload || payload.role !== 'admin') {
        return res.status(401).json({ error: 'Admin authentication required' })
      }

      const { shipments } = req.body || {}
      if (!Array.isArray(shipments)) {
        return res.status(400).json({ error: 'shipments array required' })
      }

      const { error } = await db
        .from('shipments_cache')
        .upsert({
          id: 1,
          data: shipments,
          synced_at: new Date().toISOString(),
        }, { onConflict: 'id' })

      if (error) throw error
      return res.status(200).json({ saved: true, count: shipments.length })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Shipments cache API error:', error?.message || error)
    return res.status(500).json({ error: 'Database error', detail: error?.message })
  }
}
