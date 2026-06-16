import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest } from '../_lib/jwt.js'
import { performServerSync, fclMirrorRows } from '../_lib/csvParser.js'
import { getSupabase } from '../_lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://twf.uy'
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
    const syncedAt = new Date().toISOString()

    // Cache shipments to Supabase for cross-machine access
    try {
      const db = getSupabase()
      await db
        .from('shipments_cache')
        .upsert({ id: 1, data: shipments, synced_at: syncedAt }, { onConflict: 'id' })
    } catch (cacheError) {
      console.warn('Failed to cache shipments to Supabase:', cacheError)
      // Non-fatal — sync still succeeds
    }

    // Espejo FCL → tabla shipments (Etapa 1 migración): corre en paralelo;
    // la app ignora estas filas (source='sheet') hasta el flip. Non-fatal.
    let mirror: Record<string, unknown> = { upserted: 0 }
    if (process.env.FCL_SOURCE_OF_TRUTH === 'db') {
      // Flip Etapa 4: la WEB es master de las FCL. El sync de entrada NO escribe el
      // espejo — si lo hiciera reviviría filas source='sheet' y pisaría lo horneado
      // (las FCL ya viven como filas source='fcl' editables en la web).
      mirror = { skipped: 'flip:db' }
    } else {
      try {
        const db = getSupabase()
        const now = Date.now()
        const rows = fclMirrorRows(shipments, now)
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await db.from('shipments').upsert(rows.slice(i, i + 500), { onConflict: 'id' })
          if (error) throw error
        }
        // Espejo = reflejo exacto: filas que ya no están en la planilla se van
        // (solo source='sheet'; las cargas de la web nunca se tocan acá).
        const { error: staleErr } = await db.from('shipments')
          .delete().eq('source', 'sheet').lt('updated_at_ts', now)
        if (staleErr) console.warn('Mirror stale cleanup failed:', staleErr.message)
        mirror = { upserted: rows.length }
      } catch (mirrorError: any) {
        console.warn('FCL mirror upsert failed:', mirrorError?.message || mirrorError)
        mirror = { error: mirrorError?.message || 'mirror failed' }
      }
    }

    return res.status(200).json({
      shipments,
      count: shipments.length,
      syncedAt,
      mirror,
    })
  } catch (error) {
    console.error('Sheets sync error:', error)
    return res.status(502).json({ error: 'Failed to sync from Google Sheets' })
  }
}
