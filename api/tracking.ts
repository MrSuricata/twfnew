import type { VercelRequest, VercelResponse } from '@vercel/node'
import { performServerSync, parseContainers, stripFinancialFields } from './_lib/csvParser.js'
import { getSupabase } from './_lib/supabase.js'
import { checkRateLimitWithConfig } from './_lib/rateLimiter.js'

// Strict formats — prevent enumeration via substring scraping
const REF_RE = /^A?\d{4,5}$/i                 // e.g. A7509, 7509, A75098
const CNTR_RE = /^[A-Z]{4}\d{7}$/i            // ISO container: MSCU1234567
const MBL_RE = /^[A-Z0-9]{9,20}$/i            // bill of lading / master bill

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — restrict to configured origin
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://twf.uy'
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const q = (req.query.q as string || '').trim().toUpperCase()
  if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' })

  // Require exact REF / container / MBL format — no substring queries.
  if (!REF_RE.test(q) && !CNTR_RE.test(q) && !MBL_RE.test(q)) {
    return res.status(400).json({
      error: 'Formato inválido. Ingresá referencia TWF (ej: A7509), container (ej: MSCU1234567) o MBL.',
    })
  }

  // Rate limit by IP: 30 queries/hour, 1h block on breach
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown'
  const { limited, retryAfterMs } = await checkRateLimitWithConfig(`tracking:${ip}`, 30, 60 * 60_000, 60 * 60_000)
  if (limited) {
    res.setHeader('Retry-After', String(Math.ceil((retryAfterMs || 0) / 1000)))
    return res.status(429).json({ error: 'Demasiadas búsquedas. Reintentá más tarde.' })
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

  // Exact match only. CNTR may be comma-separated; check each token.
  const eq = (v: unknown) => typeof v === 'string' && v.toUpperCase() === q
  const cntrHit = (v: unknown) => typeof v === 'string'
    && v.toUpperCase().split(',').map(x => x.trim()).some(x => x === q)
  const filtered = allShipments.filter((r: any) => eq(r.REF) || cntrHit(r.CNTR) || eq(r.MBL))

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
