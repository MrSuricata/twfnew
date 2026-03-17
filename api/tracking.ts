import type { VercelRequest, VercelResponse } from '@vercel/node'
import { performServerSync, parseContainers, stripFinancialFields } from './_lib/csvParser.js'
import { getSupabase } from './_lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — restrict to configured origin
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://twf.uy'
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const q = (req.query.q as string || '').toLowerCase().trim()
  if (!q) {
    return res.status(400).json({ error: 'Query parameter "q" is required' })
  }
  // SECURITY: Require minimum 3 chars to prevent bulk enumeration
  if (q.length < 3) {
    return res.status(400).json({ error: 'Query must be at least 3 characters' })
  }

  // Strategy: try Google Sheets live first, fallback to Supabase cache
  let allShipments: any[] | null = null
  let source = 'google-sheets'

  const sheetsUrl = process.env.GOOGLE_SHEETS_CSV_URL
  if (sheetsUrl) {
    try {
      allShipments = await performServerSync(sheetsUrl)

      // Also update the Supabase cache
      try {
        const db = getSupabase()
        await db
          .from('shipments_cache')
          .upsert({ id: 1, data: allShipments, synced_at: new Date().toISOString() }, { onConflict: 'id' })
      } catch {}
    } catch (sheetsError) {
      console.warn('[tracking] Google Sheets fetch failed, trying Supabase cache:', sheetsError)
    }
  }

  // Fallback: Supabase cache
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
      }
    } catch (cacheError) {
      console.error('[tracking] Supabase cache also failed:', cacheError)
    }
  }

  if (!allShipments || allShipments.length === 0) {
    return res.status(200).json({ results: [], source: 'none' })
  }

  // Search by REF, CNTR, or MBL
  const filtered = allShipments.filter((r: any) =>
    r.REF?.toLowerCase().includes(q) ||
    r.CNTR?.toLowerCase().includes(q) ||
    r.MBL?.toLowerCase().includes(q)
  )

  // Return results without sensitive financial fields
  const safe = stripFinancialFields(filtered)
  const results = safe.map((r: any) => ({
    REF: r.REF,
    ETD: r.ETD,
    ETA: r.ETA,
    FT: r.FT,
    LIBRE_HASTA: r.LIBRE_HASTA || r.calculatedLibreHasta,
    CNTR: r.CNTR,
    N: r.N || r.calculatedN || parseContainers(r.CNTR || '').length,
    MBL: r.MBL,
    LINEA: r.LINEA,
    BUQUE: r.BUQUE,
    TERMINAL: r.TERMINAL,
    containers: r.containers || parseContainers(r.CNTR || ''),
    calculatedN: r.calculatedN || parseContainers(r.CNTR || '').length || r.N,
    calculatedLibreHasta: r.calculatedLibreHasta || r.LIBRE_HASTA,
    // Strip client-identifying fields from operativas for public access
    operativas: (r.operativas || []).map((o: any) => {
      const { CLIENTE_OP, ...safeOp } = o
      return safeOp
    }),
  }))

  return res.status(200).json({ results, source })
}
