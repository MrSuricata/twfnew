import type { VercelRequest, VercelResponse } from '@vercel/node'
import { signAdminToken, signDepotToken, signTransportToken } from '../_lib/jwt.js'
import { checkRateLimit, clearRateLimit } from '../_lib/rateLimiter.js'
import { getSupabase } from '../_lib/supabase.js'
import { verifyPassword } from '../_lib/password.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://twf.uy'
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // Route to partner login if type === 'partner'
    if (req.body?.type === 'partner') {
      return handlePartnerLogin(req, res)
    }

    const { username, password } = req.body || {}

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' })
    }

    // Rate limiting by IP
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket?.remoteAddress
      || 'unknown'
    const rateLimitKey = `admin-login:${ip}`

    const { limited, retryAfterMs } = await checkRateLimit(rateLimitKey)
    if (limited) {
      const retryMinutes = Math.ceil((retryAfterMs || 0) / 60000)
      res.setHeader('Retry-After', String(Math.ceil((retryAfterMs || 0) / 1000)))
      return res.status(429).json({
        error: `Demasiados intentos. Reintentá en ${retryMinutes} minutos.`,
      })
    }

    const adminUser = process.env.ADMIN_USER
    const adminPassHash = process.env.ADMIN_PASS_HASH

    if (!adminUser || !adminPassHash) {
      console.error('ADMIN_USER or ADMIN_PASS_HASH not configured')
      return res.status(500).json({ error: 'Server configuration error' })
    }

    // Compare username (case-insensitive) and verify password with bcrypt
    const usernameOk = username.toLowerCase() === adminUser.toLowerCase()
    const passwordOk = await verifyPassword(password, adminPassHash)

    if (!usernameOk || !passwordOk) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Success — clear rate limit for this IP
    await clearRateLimit(rateLimitKey)

    // Generate JWT
    const token = signAdminToken(username)

    return res.status(200).json({
      token,
      role: 'admin',
      user: username,
    })
  } catch (error: any) {
    console.error('Admin login error:', error?.message || error, error?.stack)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

// ── Partner login (depot/transport) ─────────────────────────────────
// Called when body has { email, password, type: 'partner' }
async function handlePartnerLogin(req: VercelRequest, res: VercelResponse) {
  const { email, password } = req.body || {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' })
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown'
  const { limited } = await checkRateLimit(`partner-login:${ip}`)
  if (limited) return res.status(429).json({ error: 'Demasiados intentos' })

  const db = getSupabase()
  const { data: user, error: dbError } = await db
    .from('partner_users')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .eq('active', true)
    .single()

  if (dbError || !user) return res.status(401).json({ error: 'Credenciales inválidas' })

  const passwordOk = await verifyPassword(password, user.password_hash)
  if (!passwordOk) return res.status(401).json({ error: 'Credenciales inválidas' })

  await clearRateLimit(`partner-login:${ip}`)

  let token: string
  if (user.role === 'depot') {
    token = signDepotToken(user.email, user.name, user.filter_value)
  } else if (user.role === 'transport') {
    token = signTransportToken(user.email, user.name, user.filter_value)
  } else {
    return res.status(400).json({ error: 'Invalid role' })
  }

  return res.status(200).json({
    token, role: user.role, email: user.email, name: user.name, filterValue: user.filter_value,
  })
}
