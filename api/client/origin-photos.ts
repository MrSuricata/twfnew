import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest, type ClientPayload } from '../_lib/jwt.js'
import { handleCors } from '../_lib/cors.js'
import { getSupabase } from '../_lib/supabase.js'
import { matchesClientePattern } from '../_lib/csvParser.js'
import { signPhotoUrls, signPhotoUrl, THUMB_TTL, FULL_TTL } from '../_lib/photoStorage.js'

// ─── Client Origin Photos API ────────────────────────────────────────
// GET  /api/client/origin-photos           → list photos for client's shipments (with thumbnails)
// GET  /api/client/origin-photos?id=xxx    → single photo WITH file_data (full-size view)
// ─────────────────────────────────────────────────────────────────────

/** REFs del cliente desde la TABLA (la web es master desde el flip 16/06 —
 *  el cache de la planilla dejaba afuera todas las cargas nuevas). */
async function getClientShipmentRefs(db: any, pattern: string): Promise<Set<string>> {
  try {
    const { data } = await db
      .from('shipments')
      .select('ref, cliente')
      .eq('archived', false)
      .neq('source', 'sheet')
      .limit(5000)
    return new Set<string>(
      (data || [])
        .filter((s: any) => matchesClientePattern(String(s.cliente || ''), pattern))
        .map((s: any) => String(s.ref))
    )
  } catch (err) {
    console.warn('[client/origin-photos] shipments read failed:', err)
    return new Set()
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const payload = authenticateRequest(req.headers.authorization)
  if (!payload) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  const db = getSupabase()

  try {
    // Single photo (full-size file_data)
    const photoId = req.query.id as string
    if (photoId) {
      const { data, error } = await db.from('origin_photos').select('*').eq('id', photoId).single()
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'Photo not found' })

      // If client, verify ownership
      if (payload.role === 'client') {
        const clientPayload = payload as ClientPayload
        const pattern = clientPayload.clientePattern.toUpperCase()
        const clientRefs = await getClientShipmentRefs(db, pattern)
        if (!clientRefs.has(data.shipment_ref)) {
          return res.status(403).json({ error: 'Access denied' })
        }
      }

      return res.status(200).json({
        photo: {
          id: data.id,
          shipmentRef: data.shipment_ref,
          containerNumber: data.container_number || '',
          caption: data.caption || '',
          photoType: data.photo_type || 'origen',
          fileName: data.file_name,
          fileType: data.file_type,
          storagePath: data.storage_path || null,
          thumbPath: data.thumb_path || null,
          fullUrl: data.storage_path ? await signPhotoUrl(db, data.storage_path, FULL_TTL) : null,
          fileData: data.storage_path ? '' : data.file_data,   // fallback si no migrada
          thumbnailData: data.thumbnail_data,
          createdAt: data.created_at_ts,
          createdBy: data.created_by,
        }
      })
    }

    // Bulk list — thumbnails included, file_data excluded
    let shipmentRefs: Set<string> | null = null

    if (payload.role === 'client') {
      const clientPayload = payload as ClientPayload
      const pattern = clientPayload.clientePattern.toUpperCase()
      shipmentRefs = await getClientShipmentRefs(db, pattern)
    }

    const { data, error } = await db
      .from('origin_photos')
      .select('id, shipment_ref, container_number, caption, photo_type, file_name, file_type, thumbnail_data, storage_path, thumb_path, created_at_ts, created_by')
      .order('created_at_ts', { ascending: false })
    if (error) throw error

    let rawPhotos = (data || [])

    // Filter by client's shipment refs BEFORE signing (no firmar de más)
    if (shipmentRefs) {
      rawPhotos = rawPhotos.filter((p: { shipment_ref: string }) => shipmentRefs!.has(p.shipment_ref))
    }

    const thumbPaths = rawPhotos.map((p: any) => p.thumb_path).filter(Boolean)
    const signed = await signPhotoUrls(db, thumbPaths, THUMB_TTL)

    const photos = rawPhotos.map((p: any) => ({
      id: p.id,
      shipmentRef: p.shipment_ref,
      containerNumber: p.container_number || '',
      caption: p.caption || '',
      photoType: p.photo_type || 'origen',
      fileName: p.file_name,
      fileType: p.file_type,
      thumbPath: p.thumb_path || null,
      storagePath: p.storage_path || null,
      thumbnailUrl: p.thumb_path ? (signed.get(p.thumb_path) || null) : null,
      thumbnailData: p.thumb_path ? '' : p.thumbnail_data,   // fallback solo si no migrada
      createdAt: p.created_at_ts,
      createdBy: p.created_by,
    }))

    return res.status(200).json({ photos })
  } catch (error: any) {
    console.error('[client/origin-photos] API error:', error?.message || error)
    return res.status(500).json({ error: 'Database error' })
  }
}
