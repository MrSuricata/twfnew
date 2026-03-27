import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest } from '../_lib/jwt.js'
import { handleCors } from '../_lib/cors.js'
import { getSupabase } from '../_lib/supabase.js'
import { createHash } from 'crypto'

// ─── Partner Users Admin API ───────────────────────────────────────
// Admin-only CRUD for partner_users table
// GET    /api/data/partner-users           → list all partner users
// POST   /api/data/partner-users           → create new partner user
// PATCH  /api/data/partner-users?id=xxx    → update partner user fields
// DELETE /api/data/partner-users?id=xxx    → delete partner user
// ────────────────────────────────────────────────────────────────────

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return

  // Admin-only
  const payload = authenticateRequest(req.headers.authorization)
  if (!payload || payload.role !== 'admin') {
    return res.status(401).json({ error: 'Admin authentication required' })
  }

  const db = getSupabase()

  try {
    // ── GET: list all partner users ──────────────────────────────
    if (req.method === 'GET') {
      const { data, error } = await db
        .from('partner_users')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error

      const users = (data || []).map((u: any) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        depotName: u.depot_name || '',
        transportName: u.transport_name || '',
        active: u.active ?? true,
        createdAt: u.created_at,
      }))
      return res.status(200).json({ users })
    }

    // ── POST: create new partner user ────────────────────────────
    if (req.method === 'POST') {
      const body = req.body || {}
      const { email, name, password, role, depotName, transportName } = body

      if (!email || !name || !password || !role) {
        return res.status(400).json({ error: 'email, name, password, and role are required' })
      }
      if (role !== 'depot' && role !== 'transport') {
        return res.status(400).json({ error: 'role must be "depot" or "transport"' })
      }
      if (role === 'depot' && !depotName) {
        return res.status(400).json({ error: 'depotName is required for depot role' })
      }
      if (role === 'transport' && !transportName) {
        return res.status(400).json({ error: 'transportName is required for transport role' })
      }

      const row = {
        email: email.toLowerCase().trim(),
        name: name.trim(),
        password_hash: hashPassword(password),
        role,
        depot_name: depotName || '',
        transport_name: transportName || '',
        active: true,
        created_at: new Date().toISOString(),
      }

      const { data, error } = await db.from('partner_users').insert(row).select('id').single()
      if (error) throw error
      return res.status(201).json({ created: true, id: data.id })
    }

    // ── PATCH: update partner user fields ────────────────────────
    if (req.method === 'PATCH') {
      const id = req.query.id as string
      if (!id) return res.status(400).json({ error: 'id query parameter required' })

      const body = req.body || {}
      const updates: Record<string, unknown> = {}

      if (body.email !== undefined) updates.email = body.email.toLowerCase().trim()
      if (body.name !== undefined) updates.name = body.name.trim()
      if (body.password !== undefined) updates.password_hash = hashPassword(body.password)
      if (body.role !== undefined) updates.role = body.role
      if (body.depotName !== undefined) updates.depot_name = body.depotName
      if (body.transportName !== undefined) updates.transport_name = body.transportName
      if (body.active !== undefined) updates.active = body.active

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No fields to update' })
      }

      const { error } = await db.from('partner_users').update(updates).eq('id', id)
      if (error) throw error
      return res.status(200).json({ updated: true })
    }

    // ── DELETE: remove partner user ──────────────────────────────
    if (req.method === 'DELETE') {
      const id = req.query.id as string
      if (!id) return res.status(400).json({ error: 'id query parameter required' })

      const { error } = await db.from('partner_users').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ deleted: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('[partner-users] API error:', error?.message || error)
    return res.status(500).json({ error: 'Database error' })
  }
}
