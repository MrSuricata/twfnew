import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest } from '../_lib/jwt.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://twf.uy'
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = req.headers.authorization
  const payload = authenticateRequest(authHeader)

  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  // Return role-specific data
  if (payload.role === 'admin') {
    return res.status(200).json({
      role: 'admin',
      user: payload.user,
    })
  }

  if (payload.role === 'client') {
    return res.status(200).json({
      role: 'client',
      email: payload.email,
      name: payload.name,
      company: payload.company,
    })
  }

  if (payload.role === 'depot') {
    return res.status(200).json({
      role: 'depot',
      email: payload.email,
      name: payload.name,
      filterValue: payload.filterValue || payload.depotName,
    })
  }

  if (payload.role === 'transport') {
    return res.status(200).json({
      role: 'transport',
      email: payload.email,
      name: payload.name,
      filterValue: payload.filterValue || payload.transportName,
    })
  }

  return res.status(401).json({ error: 'Unknown role' })
}
