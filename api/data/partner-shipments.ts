import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest } from '../_lib/jwt.js'
import { handleCors } from '../_lib/cors.js'
import { getSupabase } from '../_lib/supabase.js'

// ─── Partner Shipments API ─────────────────────────────────────────
// GET /api/data/partner-shipments
// Returns shipments filtered by the partner's role:
//   - depot:     operativas where DEPOSITO matches depotName
//   - transport: operativas where TRANSPORTE contains transportName
// ────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return

  // Authenticate — only depot and transport roles allowed
  const payload = authenticateRequest(req.headers.authorization)
  if (!payload || (payload.role !== 'depot' && payload.role !== 'transport')) {
    return res.status(401).json({ error: 'Partner authentication required (depot or transport)' })
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const db = getSupabase()

  try {
    // Fetch the single-row shipments cache
    const { data, error } = await db
      .from('shipments_cache')
      .select('*')
      .eq('id', 1)
      .single()

    if (error && error.code !== 'PGRST116') throw error

    const allShipments: any[] = data?.data || []

    // Filter shipments: keep only those with at least one matching operativa
    const filtered = allShipments
      .map((shipment: any) => {
        const operativas: any[] = shipment.operativas || []

        const matchingOps = operativas.filter((op: any) => {
          if (payload.role === 'depot') {
            const deposito = (op.DEPOSITO || '').toLowerCase()
            const depotName = (payload as any).depotName.toLowerCase()
            return deposito === depotName
          }
          if (payload.role === 'transport') {
            const transporte = (op.TRANSPORTE || '').toLowerCase()
            const transportName = (payload as any).transportName.toLowerCase()
            return transporte.includes(transportName)
          }
          return false
        })

        if (matchingOps.length === 0) return null

        // Return shipment with only the matching operativas
        return { ...shipment, operativas: matchingOps }
      })
      .filter(Boolean)

    return res.status(200).json({
      shipments: filtered,
      syncedAt: data?.synced_at || null,
    })
  } catch (error: any) {
    console.error('[partner-shipments] API error:', error?.message || error)
    return res.status(500).json({ error: 'Database error' })
  }
}
