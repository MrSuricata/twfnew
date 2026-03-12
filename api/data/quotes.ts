import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest } from '../lib/jwt.js'
import { handleCors } from '../lib/cors.js'
import { getSupabase } from '../lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return

  // All quote management requires admin auth
  const payload = authenticateRequest(req.headers.authorization)
  if (!payload || payload.role !== 'admin') {
    return res.status(401).json({ error: 'Admin authentication required' })
  }

  const db = getSupabase()

  try {
    // ── GET: List all quotes ──
    if (req.method === 'GET') {
      const { data, error } = await db
        .from('quotes')
        .select('*')
        .order('timestamp', { ascending: false })

      if (error) throw error
      return res.status(200).json({ quotes: data || [] })
    }

    // ── POST: Upsert a quote (or array of quotes) ──
    if (req.method === 'POST') {
      const body = req.body
      const items = Array.isArray(body) ? body : [body]

      const rows = items.map((q: any) => ({
        id: q.id,
        name: q.name,
        email: q.email,
        phone: q.phone || '',
        cargo_type: q.cargoType || q.cargo_type,
        origin: q.origin || '',
        destination: q.destination || '',
        details: q.details || '',
        timestamp: q.timestamp || Date.now(),
        status: q.status || 'pending',
        notes: q.notes || [],
        language: q.language || 'es',
      }))

      const { error } = await db
        .from('quotes')
        .upsert(rows, { onConflict: 'id' })

      if (error) throw error
      return res.status(200).json({ saved: true, count: rows.length })
    }

    // ── DELETE: Remove a quote by id ──
    if (req.method === 'DELETE') {
      const id = req.query.id as string
      if (!id) return res.status(400).json({ error: 'id query parameter required' })

      const { error } = await db.from('quotes').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ deleted: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Quotes API error:', error?.message || error)
    return res.status(500).json({ error: 'Database error', detail: error?.message })
  }
}
