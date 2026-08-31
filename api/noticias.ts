import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from './_lib/supabase.js'
import { pickOrigin } from './_lib/cors.js'

// ── Novedades logísticas — endpoint PÚBLICO de la landing ────────────────
// Devuelve solo noticias ACTIVAS y VIGENTES (activo=true y vigente_hasta vacío
// o >= hoy). Sin auth: es contenido editorial, sin datos de cargas ni montos.
// Cache CDN 5 minutos: la landing no golpea la DB en cada visita.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ALLOWED_ORIGIN admite varios origenes separados por coma: durante una
  // mudanza de dominio conviven el nuevo y el .vercel.app viejo.
  const allowedOrigin = pickOrigin(typeof req.headers.origin === 'string' ? req.headers.origin : undefined)
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const db = getSupabase()
    const { data, error } = await db
      .from('noticias')
      .select('id, titulo, bajada, cuerpo, categoria, imagen_url, alerta, publicada_at, vigente_hasta, estilo, kicker, kicker_extra, subtitulo, mensaje, link_url')
      .eq('activo', true)
      .order('publicada_at', { ascending: false })
      .limit(60)
    if (error) throw error

    const hoy = new Date().toISOString().slice(0, 10)
    const vigentes = (data || []).filter((n: { vigente_hasta?: string }) => {
      const v = String(n.vigente_hasta || '').slice(0, 10)
      return !/^\d{4}-\d{2}-\d{2}$/.test(v) || v >= hoy
    })
    return res.status(200).json({ noticias: vigentes })
  } catch {
    // La landing nunca se rompe por las noticias: sección vacía y listo.
    return res.status(200).json({ noticias: [] })
  }
}
