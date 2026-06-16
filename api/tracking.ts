import type { VercelRequest, VercelResponse } from '@vercel/node'
import { performServerSync, parseContainers, stripFinancialFields } from './_lib/csvParser.js'
import { getSupabase } from './_lib/supabase.js'
import { checkRateLimitWithConfig } from './_lib/rateLimiter.js'

// Strict formats — prevent enumeration via substring scraping
const REF_RE = /^A?\d{4,5}$/i                 // e.g. A7509, 7509, A75098
const CNTR_RE = /^[A-Z]{4}\d{7}$/i            // ISO container: MSCU1234567
const MBL_RE = /^[A-Z0-9]{9,20}$/i            // bill of lading / master bill
// General reference token — covers shipments table refs/docs that don't fit the
// strict shapes above: LCL/land refs (E22, 26-0749, 25/01884), BLs/AWBs/CRTs with
// dashes/dots/slashes (615-06357654, BR.7581.06289, CAN/MVD/00319, PSMVD25C0004).
// Anti-enumeration is preserved by EXACT-match-only filtering + the IP rate limit.
const GEN_RE = /^[A-Z0-9][A-Z0-9/.-]{2,29}$/i // 3–30 chars, alnum + / . -

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

  // Require a recognizable reference / container / document format — no substring queries.
  if (!REF_RE.test(q) && !CNTR_RE.test(q) && !MBL_RE.test(q) && !GEN_RE.test(q)) {
    return res.status(400).json({
      error: 'Formato inválido. Ingresá referencia (ej: A7509, E22), container (ej: MSCU1234567) o nº de documento (BL / AWB / CRT).',
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

  // Flip Etapa 4: con la web como master, las FCL viven en la tabla shipments
  // (source='fcl') y se buscan junto al resto — NO se lee el cache de la planilla
  // (mostraría las FCL duplicadas y/o desactualizadas).
  const fclFromDb = process.env.FCL_SOURCE_OF_TRUTH === 'db'

  // Strategy: try Google Sheets live first, fallback to Supabase cache
  let allShipments: any[] | null = null
  let source = 'google-sheets'

  const sheetsUrl = process.env.GOOGLE_SHEETS_CSV_URL
  if (sheetsUrl && !fclFromDb) {
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

  // Fallback: Supabase cache (omitido tras el flip — las FCL salen de la tabla)
  if (!allShipments && !fclFromDb) {
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

  // ── Source 1: FCL (Google Sheets cache) ────────────────────────────
  // Exact match only. CNTR may be comma-separated; check each token.
  let fclResults: any[] = []
  if (allShipments && allShipments.length > 0) {
    const eq = (v: unknown) => typeof v === 'string' && v.toUpperCase() === q
    const cntrHit = (v: unknown) => typeof v === 'string'
      && v.toUpperCase().split(',').map(x => x.trim()).some(x => x === q)
    const filtered = allShipments.filter((r: any) => eq(r.REF) || cntrHit(r.CNTR) || eq(r.MBL))

    // Strip sensitive financial fields before exposing
    const safe = stripFinancialFields(filtered)
    fclResults = safe.map((r: any) => ({
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
  }

  // ── Source 2: unified `shipments` table (LCL / air / land) ─────────
  // End-to-end public tracking. Match exactly (no substrings) on the client's
  // own identifiers: container, document number (BL/HBL/AWB/CRT), and the
  // internal/client reference. Only tracking-relevant, non-sensitive fields are
  // exposed — never client name, shipper, financials, operator, deposit, etc.
  let dbResults: any[] = []
  try {
    const db = getSupabase()
    const { data: rows, error } = await db
      .from('shipments')
      .select('ref,client_ref,doc_number,contenedor,buque,linea,etd,eta,dest_port,status,mode,archived,libre,terminal,n_cntr,salida,eta_fiscal')
      .neq('source', 'sheet') // espejo viejo (Etapa 1-3); las FCL horneadas son source='fcl' y SÍ entran
      .limit(5000)
    if (!error && rows && rows.length) {
      const norm = (v: unknown) => String(v ?? '').toUpperCase().trim()
      // Container field may hold several ISO numbers separated by space/comma.
      const cntrTokens = (v: unknown) => norm(v).split(/[\s,]+/).filter(Boolean)
      // Doc number may bundle several docs joined by " / " (air AWBs) or ",;".
      // Keep the whole string as a token too, so single-slash BLs (CAN/MVD/00319)
      // still match when typed in full.
      const docTokens = (v: unknown) => {
        const s = norm(v)
        if (!s) return []
        return [s, ...s.split(/\s+\/\s+|\s*[;,]\s*/).map(x => x.trim()).filter(Boolean)]
      }
      const hits = rows.filter((r: any) =>
        !r.archived && (
          norm(r.ref) === q ||
          norm(r.client_ref) === q ||
          docTokens(r.doc_number).includes(q) ||
          // Container search is allowed only for NON-LCL: an LCL container is a
          // shared consolidation holding several clients' cargo, so matching by
          // container would leak another client's shipment. LCL is found by its
          // own house BL / ref instead.
          (r.mode !== 'lcl' && cntrTokens(r.contenedor).includes(q))
        )
      )
      dbResults = hits.map((r: any) => {
        const containers = parseContainers(r.contenedor || '')
        // FCL horneada (flip): campos ricos desde columnas + una operativa mínima
        // (SALIDA/ETA_FISC) para que el stepper del card derive la etapa como antes.
        const isFcl = r.mode === 'fcl'
        return {
          REF: r.ref || '',
          ETD: r.etd || '',
          ETA: r.eta || '',
          FT: 0,
          LIBRE_HASTA: isFcl ? (r.libre || '') : '',
          CNTR: r.contenedor || '',
          N: isFcl ? (r.n_cntr || containers.length) : containers.length,
          MBL: r.doc_number || '',
          LINEA: r.linea || '',
          BUQUE: r.buque || '',
          TERMINAL: isFcl ? (r.terminal || '') : (r.dest_port || ''),
          containers,
          calculatedN: isFcl ? (r.n_cntr || containers.length) : containers.length,
          calculatedLibreHasta: isFcl ? (r.libre || '') : '',
          operativas: isFcl && (r.salida || r.eta_fiscal)
            ? [{ SALIDA: r.salida || '', ETA_FISC: r.eta_fiscal || '' }]
            : [],
          mode: r.mode || '',
          status: r.status || '',
        }
      })
    }
  } catch (dbError) {
    console.error('[tracking] shipments DB query failed:', dbError)
  }

  // ── Truck-driven status for LCL/aéreo ──────────────────────────────
  // A cargo loaded on a truck takes its status from the truck's dates (mirrors
  // how FCL derives status from the Sheet's operativas). Keep this in sync with
  // deriveTruckCargoStatus() in src/lib/operationsTypes.ts.
  try {
    const trackable = dbResults.filter((r: any) => r.mode === 'lcl' || r.mode === 'air')
    if (trackable.length > 0) {
      const db = getSupabase()
      const refs = trackable.map((r: any) => r.REF)
      // pending: filter loads that are drafts; draft: filter trucks that are drafts
      const { data: loads } = await db.from('truck_loads').select('source_ref, truck_id, pending').in('source_ref', refs)
      if (loads && loads.length) {
        const truckIds = [...new Set(loads.map((l: any) => l.truck_id))]
        const { data: trucksData } = await db
          .from('trucks')
          .select('id, code, status, load_date, departure_date, arrival_date, draft')
          .in('id', truckIds)
        const tById = new Map((trucksData || []).map((t: any) => [t.id, t]))
        const truckByRef = new Map<string, any>()
        for (const l of loads as any[]) {
          if (l.pending === 'add') continue        // borrador: la carga aún no está en el camión
          const t = tById.get(l.truck_id)
          if (t && !t.draft) truckByRef.set(l.source_ref, t)  // camiones borrador: invisibles
        }

        const today = new Date(); today.setHours(0, 0, 0, 0)
        const parseLocal = (s: string) => {
          const p = String(s || '').split('-')
          if (p.length !== 3) return null
          const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
          return isNaN(d.getTime()) ? null : d
        }
        const reached = (s: string) => { const d = parseLocal(s); return d != null && d.getTime() <= today.getTime() }
        const isToday = (s: string) => { const d = parseLocal(s); return d != null && d.getTime() === today.getTime() }
        const derive = (t: any): string | null => {
          if (reached(t.arrival_date) || t.status === 'delivered') return 'en_fiscal'
          if (isToday(t.departure_date)) return 'saliendo'
          if (reached(t.departure_date) || t.status === 'in_transit') return 'en_frontera'
          if (reached(t.load_date) || t.status === 'loaded') return 'arribado'
          return null
        }
        for (const r of trackable as any[]) {
          const t = truckByRef.get(r.REF)
          if (!t) continue
          const s = derive(t)
          if (s) { r.status = s; r.truckCode = t.code }
        }
      }
    }
  } catch (e) {
    console.error('[tracking] truck status derivation failed:', e)
  }

  const results = [...fclResults, ...dbResults]
  const usedSources = [
    fclResults.length ? source : null,
    dbResults.length ? 'shipments-db' : null,
  ].filter(Boolean)

  return res.status(200).json({
    results,
    source: usedSources.length ? usedSources.join('+') : 'none',
  })
}
