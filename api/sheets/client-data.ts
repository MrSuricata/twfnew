import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest, type ClientPayload } from '../_lib/jwt.js'
import { matchesClientePattern } from '../_lib/csvParser.js'
import { getSupabase } from '../_lib/supabase.js'
import { CLIENT_SHIPMENT_COLS, esCargaDeClienteActiva, rowToClientShipment, camionesPorRef, type CamionDeCarga } from '../_lib/clientShipments.js'
import { pickOrigin } from '../_lib/cors.js'

// ── Datos del PORTAL DE CLIENTES ─────────────────────────────────────────
// Desde el flip (16/06) la web es master: este endpoint lee la TABLA, no la
// planilla (la versión anterior leía Google Sheets export-only y le mostraba
// al cliente cargas muertas mientras le escondía las nuevas — Brian 26/08).
//
// Seguridad: JWT de cliente obligatorio · filtro por clientePattern en el
// server · solo cargas ACTIVAS · whitelist de columnas en el SELECT (los
// montos y pagos ni siquiera salen de la DB) · financieros en cero en el
// shape de salida (ver api/_lib/clientShipments.ts).

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ALLOWED_ORIGIN admite varios origenes separados por coma: durante una
  // mudanza de dominio conviven el nuevo y el .vercel.app viejo.
  const allowedOrigin = pickOrigin(typeof req.headers.origin === 'string' ? req.headers.origin : undefined)
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  // Datos privados por cliente: nada de caches compartidos entre tokens.
  res.setHeader('Cache-Control', 'private, no-store')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const payload = authenticateRequest(req.headers.authorization)
  if (!payload || payload.role !== 'client') {
    return res.status(401).json({ error: 'Client authentication required' })
  }

  const pattern = (payload as ClientPayload).clientePattern
  if (!pattern || !pattern.trim()) {
    // Un token de cliente sin patrón no puede ver NADA (nunca "todo").
    return res.status(403).json({ error: 'Acceso sin cliente asignado' })
  }

  try {
    const db = getSupabase()
    const { data, error } = await db
      .from('shipments')
      .select(CLIENT_SHIPMENT_COLS)
      .eq('archived', false)
      .neq('source', 'sheet')
      .limit(5000)
    if (error) throw error

    const hoyISO = new Date().toISOString().slice(0, 10)
    const rows = (data || []) as unknown as Record<string, unknown>[]
    // Todas las cargas del cliente, de cualquier país y modalidad (Brian 02/09:
    // "que vean las de todos los países, FCL o LCL, y filtren por país y tipo").
    // Antes solo vía Montevideo (27/08); el filtro por país ahora lo hace el
    // portal con selectores. El digest por mail sigue solo Montevideo.
    const propias = rows.filter(s => matchesClientePattern(String(s.cliente || ''), pattern))

    // LCL: la salida y la llegada a destino viven en el camión consolidado.
    // Se traen los camiones publicados de esas refs y se arma la operativa
    // sintética en rowToClientShipment (derive-on-read).
    const refsLcl = propias.filter(s => String(s.mode || '').toLowerCase() === 'lcl').map(s => String(s.ref || ''))
    let camiones: Map<string, CamionDeCarga> = new Map()
    if (refsLcl.length > 0) {
      // Un error acá NO puede pasar en silencio: sin camión las LCL se verían
      // "esperando salida" estando entregadas. Falla ruidoso, como shipments.
      const { data: loads, error: errLoads } = await db.from('truck_loads').select('source_ref, truck_id, fiscal, pending').in('source_ref', refsLcl)
      if (errLoads) throw errLoads
      const truckIds = Array.from(new Set((loads || []).map((l: any) => String(l.truck_id || '')).filter(Boolean)))
      if (truckIds.length) {
        const { data: trucks, error: errTrucks } = await db.from('trucks').select('id, code, departure_date, arrival_date, load_date, draft, status').in('id', truckIds)
        if (errTrucks) throw errTrucks
        camiones = camionesPorRef((loads || []) as any[], (trucks || []) as any[])
      }
    }

    // FCL retirada de la terminal: el contenedor ya está en el depósito
    // uruguayo. El cliente lo ve como "en depósito" en vez de "en terminal"
    // (Brian 03/09). Solo la FECHA del retiro; el aviso al cliente lo sigue
    // dando el equipo a mano por mail (AVISADO en HOY), no la web.
    const retiradoPorRef = new Map<string, string>()
    {
      const refsFcl = propias
        .filter(s => String(s.mode || '').toLowerCase() !== 'lcl')
        .map(s => String(s.ref || '').trim().toUpperCase())
        .filter(Boolean)
      if (refsFcl.length) {
        const { data: agenda, error: errAgenda } = await db.from('montecon_agenda')
          .select('ref, retirado_at').in('ref', refsFcl)
        // Si falla, nadie aparece retirado: se ve como antes, nunca al revés.
        if (!errAgenda) {
          for (const a of (agenda || [])) {
            const f = String((a as any).retirado_at || '').slice(0, 10)
            if (f) retiradoPorRef.set(String((a as any).ref || '').trim().toUpperCase(), f)
          }
        }
      }
    }

    const shipments = propias
      .filter(s => {
        const cam = camiones.get(String(s.ref || '').toUpperCase())
        // Una LCL en camión es vigente aunque no tenga ETA de buque cargada, y
        // para la regla "entregada hace más de 10 días" vale la llegada del
        // camión, que la carga no tiene en su columna.
        return esCargaDeClienteActiva({
          ...s,
          eta: (s.eta as string) || cam?.departure_date || cam?.load_date || '',
          eta_fiscal: (s.eta_fiscal as string) || cam?.arrival_date || '',
        }, hoyISO)
      })
      .map(s => ({
        ...rowToClientShipment(s, camiones.get(String(s.ref || '').toUpperCase()) || null),
        RETIRADO: retiradoPorRef.get(String(s.ref || '').trim().toUpperCase()) || '',
      }))

    return res.status(200).json({
      shipments,
      count: shipments.length,
      syncedAt: new Date().toISOString(),
      source: 'webapp',
    })
  } catch (err: any) {
    console.error('client-data error:', err?.message || err)
    return res.status(500).json({ error: 'No se pudieron cargar las cargas' })
  }
}
