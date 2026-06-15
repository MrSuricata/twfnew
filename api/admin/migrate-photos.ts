import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest } from '../_lib/jwt.js'
import { handleCors } from '../_lib/cors.js'
import { getSupabase } from '../_lib/supabase.js'
import { uploadPhotoObjects } from '../_lib/photoStorage.js'

// POST /api/admin/migrate-photos → migra hasta BATCH fotos sin storage_path.
// Idempotente: solo toca las que faltan. NO borra el base64 (respaldo).
const BATCH = 25

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const payload = authenticateRequest(req.headers.authorization)
  if (!payload || payload.role !== 'admin') return res.status(401).json({ error: 'Admin authentication required' })

  const db = getSupabase()
  try {
    const { data: pend, error } = await db
      .from('origin_photos')
      .select('id, shipment_ref, file_data, thumbnail_data')
      .is('storage_path', null)
      .order('created_at_ts', { ascending: true })
      .limit(BATCH)
    if (error) throw error
    const rows = pend || []
    let migradas = 0
    for (const p of rows) {
      try {
        const up = await uploadPhotoObjects(db, p.shipment_ref || '', p.id, p.file_data || '', p.thumbnail_data || '')
        if (!up.storagePath && !up.thumbPathOut) continue   // sin data válida; se salta
        await db.from('origin_photos').update({ storage_path: up.storagePath, thumb_path: up.thumbPathOut }).eq('id', p.id)
        migradas++
      } catch (err) {
        console.warn('[migrate-photos] foto', p.id, 'falló:', (err as Error)?.message)
      }
    }
    const { count } = await db.from('origin_photos').select('id', { count: 'exact', head: true }).is('storage_path', null)
    return res.status(200).json({ migradas, restantes: count ?? 0 })
  } catch (err) {
    console.error('[migrate-photos]', (err as Error)?.message || err)
    return res.status(500).json({ error: 'Error en la migración' })
  }
}
