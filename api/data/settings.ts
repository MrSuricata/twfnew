import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest } from '../lib/jwt.js'
import { handleCors } from '../lib/cors.js'
import { getSupabase } from '../lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return

  // Settings require admin auth
  const payload = authenticateRequest(req.headers.authorization)
  if (!payload || payload.role !== 'admin') {
    return res.status(401).json({ error: 'Admin authentication required' })
  }

  const db = getSupabase()

  try {
    // ── GET: Get a setting by key, or all settings ──
    if (req.method === 'GET') {
      const key = req.query.key as string

      if (key) {
        const { data, error } = await db
          .from('settings')
          .select('*')
          .eq('key', key)
          .single()

        if (error && error.code !== 'PGRST116') throw error // PGRST116 = not found
        return res.status(200).json({ setting: data || null })
      }

      // Return all settings
      const { data, error } = await db.from('settings').select('*')
      if (error) throw error

      // Convert to key-value object
      const settings: Record<string, any> = {}
      for (const row of data || []) {
        settings[row.key] = row.value
      }

      return res.status(200).json({ settings })
    }

    // ── PUT: Set a setting ──
    if (req.method === 'PUT') {
      const { key, value } = req.body || {}
      if (!key) return res.status(400).json({ error: 'key is required' })

      const { error } = await db
        .from('settings')
        .upsert({
          key,
          value: typeof value === 'object' ? value : { v: value },
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' })

      if (error) throw error
      return res.status(200).json({ saved: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Settings API error:', error?.message || error)
    return res.status(500).json({ error: 'Database error', detail: error?.message })
  }
}
