import type { SupabaseClient } from '@supabase/supabase-js'

export const PHOTO_BUCKET = 'operation-photos'
export const THUMB_TTL = 28800   // 8h — duran la sesión del admin
export const FULL_TTL = 3600     // 1h — se firma on-demand al abrir

/** Separa un data URL "data:image/jpeg;base64,XXXX" en mime + bytes.
 *  Devuelve null si no es un data URL base64 válido. */
export function decodeDataUrl(dataUrl: string): { bytes: Buffer; contentType: string } | null {
  const m = /^data:([^;]*);base64,(.+)$/.exec(String(dataUrl || ''))
  if (!m) return null
  const contentType = m[1] || 'image/jpeg'
  try {
    return { bytes: Buffer.from(m[2], 'base64'), contentType }
  } catch {
    return null
  }
}

const ext = (ct: string) => (ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg')
export const fullPath = (ref: string, id: string, ct = 'image/jpeg') => `full/${ref || 'sin-ref'}/${id}.${ext(ct)}`
export const thumbPath = (ref: string, id: string, ct = 'image/jpeg') => `thumb/${ref || 'sin-ref'}/${id}.${ext(ct)}`

/** Sube full + thumbnail a Storage. Devuelve las rutas guardadas (o null si
 *  no había data válida para ese tamaño). Lanza si la subida falla. */
export async function uploadPhotoObjects(
  db: SupabaseClient,
  ref: string,
  id: string,
  fullDataUrl: string,
  thumbDataUrl: string,
): Promise<{ storagePath: string | null; thumbPathOut: string | null }> {
  const bucket = db.storage.from(PHOTO_BUCKET)
  let storagePath: string | null = null
  let thumbPathOut: string | null = null
  const full = decodeDataUrl(fullDataUrl)
  if (full) {
    storagePath = fullPath(ref, id, full.contentType)
    const { error } = await bucket.upload(storagePath, full.bytes, { contentType: full.contentType, upsert: true })
    if (error) throw error
  }
  const thumb = decodeDataUrl(thumbDataUrl)
  if (thumb) {
    thumbPathOut = thumbPath(ref, id, thumb.contentType)
    const { error } = await bucket.upload(thumbPathOut, thumb.bytes, { contentType: thumb.contentType, upsert: true })
    if (error) throw error
  }
  return { storagePath, thumbPathOut }
}

/** Firma en lote. Devuelve Map<path, signedUrl> (omite las que fallan). */
export async function signPhotoUrls(
  db: SupabaseClient,
  paths: string[],
  ttl: number,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const clean = paths.filter(Boolean)
  if (clean.length === 0) return out
  const { data, error } = await db.storage.from(PHOTO_BUCKET).createSignedUrls(clean, ttl)
  if (error || !data) return out
  for (const row of data) {
    if (row.signedUrl && row.path) out.set(row.path, row.signedUrl)
  }
  return out
}

/** Firma una sola ruta (full on-demand). null si falla. */
export async function signPhotoUrl(db: SupabaseClient, path: string, ttl: number): Promise<string | null> {
  if (!path) return null
  const { data, error } = await db.storage.from(PHOTO_BUCKET).createSignedUrl(path, ttl)
  if (error || !data) return null
  return data.signedUrl
}

/** Borra los objetos de una foto (full + thumb). Best-effort. */
export async function deletePhotoObjects(db: SupabaseClient, paths: (string | null | undefined)[]): Promise<void> {
  const clean = paths.filter(Boolean) as string[]
  if (clean.length === 0) return
  try { await db.storage.from(PHOTO_BUCKET).remove(clean) } catch { /* best-effort */ }
}
