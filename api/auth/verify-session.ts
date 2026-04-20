import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest } from '../_lib/jwt.js'
import { getSupabase } from '../_lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://twf.uy'
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const payload = authenticateRequest(req.headers.authorization)
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  // Admin: no extra check (password is in env var)
  if (payload.role === 'admin') {
    return res.status(200).json({ role: 'admin', user: payload.user })
  }

  // Client: OTP already single-use, JWT already validated
  if (payload.role === 'client') {
    return res.status(200).json({
      role: 'client',
      email: payload.email,
      name: payload.name,
      company: payload.company,
    })
  }

  // Partner (depot/transport): cross-check that the user still exists AND is active
  if (payload.role === 'depot' || payload.role === 'transport') {
    try {
      const db = getSupabase()
      const { data, error } = await db
        .from('partner_users')
        .select('active')
        .eq('email', payload.email.toLowerCase().trim())
        .single()

      if (error || !data || data.active !== true) {
        return res.status(401).json({ error: 'Account deactivated or not found' })
      }
    } catch (err) {
      console.error('[verify-session] partner check failed:', err)
      return res.status(500).json({ error: 'Verification error' })
    }

    if (payload.role === 'depot') {
      return res.status(200).json({
        role: 'depot',
        email: payload.email,
        name: payload.name,
        filterValue: payload.filterValue || payload.depotName,
      })
    }
    return res.status(200).json({
      role: 'transport',
      email: payload.email,
      name: payload.name,
      filterValue: payload.filterValue || payload.transportName,
    })
  }

  return res.status(401).json({ error: 'Unknown role' })
}
