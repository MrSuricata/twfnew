import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest, type ClientPayload } from '../_lib/jwt.js'
import { performServerSync, stripFinancialFields, matchesClientePattern } from '../_lib/csvParser.js'
import { getSupabase } from '../_lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://twf.uy'
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // Require client JWT
  const payload = authenticateRequest(req.headers.authorization)
  if (!payload || payload.role !== 'client') {
    return res.status(401).json({ error: 'Client authentication required' })
  }

  const clientPayload = payload as ClientPayload
  const pattern = clientPayload.clientePattern

  // Strategy: try Google Sheets live first, fallback to Supabase cache
  let allShipments: any[] | null = null
  let source = 'google-sheets'

  const sheetsUrl = process.env.GOOGLE_SHEETS_CSV_URL
  if (sheetsUrl) {
    try {
      allShipments = await performServerSync(sheetsUrl)

      // Also update the Supabase cache so reports endpoint has fresh data
      try {
        const db = getSupabase()
        await db
          .from('shipments_cache')
          .upsert({ id: 1, data: allShipments, synced_at: new Date().toISOString() }, { onConflict: 'id' })
      } catch (cacheErr) {
        console.warn('Failed to update shipments cache:', cacheErr)
      }
    } catch (sheetsError) {
      console.warn('Google Sheets fetch failed, trying Supabase cache:', sheetsError)
    }
  }

  // Fallback: use Supabase cache if Google Sheets failed
  if (!allShipments) {
    try {
      const db = getSupabase()
      const { data, error } = await db
        .from('shipments_cache')
        .select('data, synced_at')
        .eq('id', 1)
        .single()
      if (!error && data?.data) {
        allShipments = data.data
        source = 'supabase-cache'
        console.log(`Using Supabase cache (synced: ${data.synced_at})`)
      }
    } catch (cacheError) {
      console.error('Supabase cache fallback also failed:', cacheError)
    }
  }

  if (!allShipments || allShipments.length === 0) {
    return res.status(200).json({
      shipments: [],
      count: 0,
      syncedAt: null,
      source: 'none',
      warning: 'No shipment data available from any source',
    })
  }

  // Filter to only this client's shipments
  const clientShipments = allShipments.filter((s: any) =>
    matchesClientePattern(s.CLIENTE, pattern)
  )

  // Strip financial fields
  const safeShipments = stripFinancialFields(clientShipments)

  return res.status(200).json({
    shipments: safeShipments,
    count: safeShipments.length,
    syncedAt: new Date().toISOString(),
    source,
  })
}
