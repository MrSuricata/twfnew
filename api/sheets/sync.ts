import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest } from '../lib/jwt'
import { performServerSync } from '../lib/csvParser'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // Require admin JWT
  const payload = authenticateRequest(req.headers.authorization)
  if (!payload || payload.role !== 'admin') {
    return res.status(401).json({ error: 'Admin authentication required' })
  }

  const sheetsUrl = process.env.GOOGLE_SHEETS_CSV_URL
  if (!sheetsUrl) {
    return res.status(500).json({ error: 'Google Sheets URL not configured' })
  }

  try {
    const shipments = await performServerSync(sheetsUrl)

    return res.status(200).json({
      shipments,
      count: shipments.length,
      syncedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Sheets sync error:', error)
    return res.status(502).json({ error: 'Failed to sync from Google Sheets' })
  }
}
