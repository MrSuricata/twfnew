import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest, type ClientPayload } from '../lib/jwt'
import { performServerSync, stripFinancialFields } from '../lib/csvParser'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // Require client JWT
  const payload = authenticateRequest(req.headers.authorization)
  if (!payload || payload.role !== 'client') {
    return res.status(401).json({ error: 'Client authentication required' })
  }

  const clientPayload = payload as ClientPayload

  const sheetsUrl = process.env.GOOGLE_SHEETS_CSV_URL
  if (!sheetsUrl) {
    return res.status(500).json({ error: 'Google Sheets URL not configured' })
  }

  try {
    const allShipments = await performServerSync(sheetsUrl)

    // Filter to only this client's shipments
    const pattern = clientPayload.clientePattern.toUpperCase()
    const clientShipments = allShipments.filter(s =>
      s.CLIENTE.toUpperCase().includes(pattern)
    )

    // Strip financial fields
    const safeShipments = stripFinancialFields(clientShipments)

    return res.status(200).json({
      shipments: safeShipments,
      count: safeShipments.length,
      syncedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Client data error:', error)
    return res.status(502).json({ error: 'Failed to fetch data' })
  }
}
