import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash } from 'crypto'
import { signAdminToken } from '../_lib/jwt.js'
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

    // Compare username (case-insensitive) and password hash (SHA-256)
    const inputHash = createHash('sha256').update(password).digest('hex')

    if (username.toLowerCase() !== adminUser.toLowerCase() || inputHash !== adminPassHash) {
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
