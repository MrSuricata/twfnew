import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest, type ClientPayload } from '../_lib/jwt.js'
import { handleCors } from '../_lib/cors.js'
import { getSupabase } from '../_lib/supabase.js'
import { performServerSync, matchesClientePattern } from '../_lib/csvParser.js'

// ─── Client Origin Photos API ────────────────────────────────────────
// GET  /api/client/origin-photos           → list photos for client's shipments (with thumbnails)
// GET  /api/client/origin-photos?id=xxx    → single photo WITH file_data (full-size view)
// ─────────────────────────────────────────────────────────────────────

/** Get all shipment REFs for a client */
async function getClientShipmentRefs(db: any, pattern: string): Promise<Set<string>> {
  try {
    const { data: cache } = await db.from('shipments_cache').select('data').eq('id', 1).single()
    if (cache?.data && cache.data.length > 0) {
      const refs = new Set<string>(
        cache.data
          .filter((s: any) => matchesClientePattern(s.CLIENTE, pattern))
          .map((s: any) => s.REF)
      )
      if (refs.size > 0) return refs
    }
  } catch (err) {
    console.warn('[client/origin-photos] Supabase cache read failed:', err)
  }

  const sheetsUrl = process.env.GOOGLE_SHEETS_CSV_URL
  if (sheetsUrl) {
    try {
      const allShipments = await performServerSync(sheetsUrl)
      try {
        await db
          .from('shipments_cache')
          .upsert({ id: 1, data: allShipments, synced_at: new Date().toISOString() }, { onConflict: 'id' })
      } catch {}
      return new Set<string>(
        allShipments
          .filter((s: any) => matchesClientePattern(s.CLIENTE, pattern))
          .map((s: any) => s.REF)
      )
    } catch (sheetsErr) {
      console.warn('[client/origin-photos] Google Sheets fallback failed:', sheetsErr)
    }
  }

  return new Set()
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
          fileData: data.file_data,
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
      .select('id, shipment_ref, container_number, caption, photo_type, file_name, file_type, thumbnail_data, created_at_ts, created_by')
      .order('created_at_ts', { ascending: false })
    if (error) throw error

    let photos = (data || []).map((p: any) => ({
      id: p.id,
      shipmentRef: p.shipment_ref,
      containerNumber: p.container_number || '',
      caption: p.caption || '',
      photoType: p.photo_type || 'origen',
      fileName: p.file_name,
      fileType: p.file_type,
      thumbnailData: p.thumbnail_data,
      createdAt: p.created_at_ts,
      createdBy: p.created_by,
    }))

    if (shipmentRefs) {
      photos = photos.filter((p: any) => shipmentRefs!.has(p.shipmentRef))
    }

    return res.status(200).json({ photos })
  } catch (error: any) {
    console.error('[client/origin-photos] API error:', error?.message || error)
    return res.status(500).json({ error: 'Database error' })
  }
}
