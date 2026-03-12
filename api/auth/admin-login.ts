import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash } from 'crypto'
import { signAdminToken } from '../lib/jwt'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*'
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

    // Generate JWT
    const token = signAdminToken(username)

    return res.status(200).json({
      token,
      role: 'admin',
      user: username,
    })
  } catch (error: any) {
    console.error('Admin login error:', error?.message || error, error?.stack)
    return res.status(500).json({ error: 'Internal server error', detail: error?.message })
  }
}
