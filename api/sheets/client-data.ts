import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest, type ClientPayload } from '../_lib/jwt.js'
import { matchesClientePattern } from '../_lib/csvParser.js'
import { getSupabase } from '../_lib/supabase.js'
import { CLIENT_SHIPMENT_COLS, esCargaDeClienteActiva, rowToClientShipment } from '../_lib/clientShipments.js'
import { esViaMontevideo } from '../_lib/clientDigest.js'
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
    // Solo la operación VÍA MONTEVIDEO (mismo criterio que el digest por mail):
    // las cargas CL (San Antonio/Valpo) y AR directo no pasan por acá y al
    // cliente lo confunden en su portal (Brian 27/08).
    const propias = rows.filter(s =>
      matchesClientePattern(String(s.cliente || ''), pattern) && esCargaDeClienteActiva(s, hoyISO)
      && esViaMontevideo(s as { dest_country?: string }))
    const shipments = propias.map(rowToClientShipment)

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
