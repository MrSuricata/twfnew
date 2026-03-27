import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash } from 'crypto'
import { signDepotToken, signTransportToken } from '../_lib/jwt.js'
import { getSupabase } from '../_lib/supabase.js'
import { checkRateLimit, clearRateLimit } from '../_lib/rateLimiter.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://twf.uy'
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { email, password } = req.body || {}

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }

    // Rate limiting by IP
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket?.remoteAddress
      || 'unknown'
    const rateLimitKey = `partner-login:${ip}`

    const { limited, retryAfterMs } = await checkRateLimit(rateLimitKey)
    if (limited) {
      const retryMinutes = Math.ceil((retryAfterMs || 0) / 60000)
      res.setHeader('Retry-After', String(Math.ceil((retryAfterMs || 0) / 1000)))
      return res.status(429).json({
        error: `Demasiados intentos. Reintentá en ${retryMinutes} minutos.`,
      })
    }

    // Look up user in Supabase
    const db = getSupabase()
    const { data: user, error: dbError } = await db
      .from('partner_users')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .eq('active', true)
      .single()

    if (dbError || !user) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    // Verify password hash (SHA-256)
    const inputHash = createHash('sha256').update(password).digest('hex')
    if (inputHash !== user.password_hash) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    // Clear rate limit on success
    await clearRateLimit(rateLimitKey)

    // Sign JWT based on role
    let token: string
    const role = user.role as 'depot' | 'transport'

    if (role === 'depot') {
      token = signDepotToken(user.email, user.name, user.filter_value)
    } else if (role === 'transport') {
      token = signTransportToken(user.email, user.name, user.filter_value)
    } else {
      return res.status(400).json({ error: 'Invalid user role' })
    }

    return res.status(200).json({
      token,
      role,
      email: user.email,
      name: user.name,
      filterValue: user.filter_value,
    })
  } catch (error: any) {
    console.error('Partner login error:', error?.message || error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
