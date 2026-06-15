# Fotos → Supabase Storage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover las fotos de `origin_photos` de base64-en-Postgres a un bucket privado de Supabase Storage, leyendo con URLs firmadas, sin perder el control de acceso por cliente y sin borrar el base64 viejo (respaldo).

**Architecture:** Helper server-side `api/_lib/photoStorage.ts` encapsula decode/upload/sign/delete. El write path sube a Storage y guarda solo las rutas; el read path (admin + cliente) devuelve URLs firmadas con fallback a base64 para fotos no migradas. Un endpoint admin idempotente migra las 164 existentes (sin tocar el base64). La UI cambia los `src` de base64 a URL.

**Tech Stack:** Vite + React 19 + TS · Supabase Storage (service-role, ya configurado) · vitest. Cero deps nuevas.

**Spec:** `docs/superpowers/specs/2026-06-12-fotos-storage-design.md`

**Entorno:** Repo `C:\Users\Usuario\Desktop\CLAUDE\PAPRIKA CLAUDE\twfnew-hoy` (comandos desde ahí, comillas por los espacios). Branch `feat/fotos-storage` (ya creada, spec commiteado). Gates: `npm run typecheck && npm run test:run && npm run build && npm run lint`. Baseline 126 tests, lint 157 (cero nuevos). Commits en español. NUNCA push a main.

**Constantes compartidas:** bucket `operation-photos`; rutas `full/{ref}/{id}.jpg` y `thumb/{ref}/{id}.jpg`; TTL firma thumbnails 8h (28800s), full 1h (3600s).

**File structure:**

| Archivo | Cambio |
|---------|--------|
| (Supabase) | Migración: columnas `storage_path`/`thumb_path` + bucket privado — **Task 0, controlador** |
| `api/_lib/photoStorage.ts` (nuevo) | decode/upload/sign/delete de fotos |
| `api/_lib/photoStorage.test.ts` (nuevo) | tests de `decodeDataUrl` |
| `api/data/[entity].ts` (modif) | `handleOriginPhotos` write→Storage, read→signed, delete→Storage |
| `api/client/origin-photos.ts` (modif) | read cliente → signed URLs con fallback |
| `api/admin/migrate-photos.ts` (nuevo) | migración idempotente de las 164 |
| `src/lib/quotationTypes.ts` (modif) | `OriginPhoto` += storagePath/thumbPath/thumbnailUrl/fullUrl |
| `src/lib/dataClient.ts` (modif) | mapeo + `migratePhotos()` |
| `src/components/OriginPhotoGallery.tsx` (modif) | `src` thumbnailUrl con fallback |
| `src/components/OriginPhotoLightbox.tsx` (modif) | `src` fullUrl/thumbnailUrl con fallback |
| pestaña Equipo (modif) | botón "Migrar fotos a Storage" |

---

### Task 0 (CONTROLADOR, no subagente): migración Supabase

Aplicar en TWF (`ihpsdeoexkipxmaxsmrc`) vía MCP `apply_migration`, nombre `origin_photos_storage`:

```sql
alter table origin_photos
  add column if not exists storage_path text,
  add column if not exists thumb_path text;

insert into storage.buckets (id, name, public)
values ('operation-photos', 'operation-photos', false)
on conflict (id) do nothing;
```

Verificar: `list_tables` muestra las 2 columnas; `select id,public from storage.buckets where id='operation-photos'` → public=false. Inofensiva en prod (las fotos siguen leyéndose por base64 hasta migrar).

---

### Task 1: helper `photoStorage.ts` (decode TDD + upload + sign + delete)

**Files:**
- Create: `api/_lib/photoStorage.ts`
- Test: `api/_lib/photoStorage.test.ts`

- [ ] **Step 1: Test que falla**

Crear `api/_lib/photoStorage.test.ts` (los tests de api/_lib corren con vitest, igual que `csvParser.test.ts`):

```ts
import { describe, it, expect } from 'vitest'
import { decodeDataUrl } from './photoStorage.js'

describe('decodeDataUrl', () => {
  it('separa mime y bytes de un data URL base64', () => {
    // "Hi" en base64 = "SGk="
    const r = decodeDataUrl('data:image/jpeg;base64,SGk=')
    expect(r).not.toBeNull()
    expect(r!.contentType).toBe('image/jpeg')
    expect(r!.bytes.toString('utf8')).toBe('Hi')
  })
  it('default a image/jpeg si no hay mime', () => {
    const r = decodeDataUrl('data:;base64,SGk=')
    expect(r!.contentType).toBe('image/jpeg')
  })
  it('basura / vacío → null', () => {
    expect(decodeDataUrl('')).toBeNull()
    expect(decodeDataUrl('no-soy-un-data-url')).toBeNull()
    expect(decodeDataUrl(undefined as unknown as string)).toBeNull()
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test:run -- api/_lib/photoStorage.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementación**

Crear `api/_lib/photoStorage.ts`:

```ts
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
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test:run -- api/_lib/photoStorage.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add api/_lib/photoStorage.ts api/_lib/photoStorage.test.ts
git commit -m "feat(fotos): helper photoStorage (decode + upload + signed URLs + delete)"
```

---

### Task 2: write path — subir a Storage al crear, borrar al eliminar

**Files:**
- Modify: `api/data/[entity].ts` (`handleOriginPhotos` POST ~646-671 y DELETE ~673-679)

- [ ] **Step 1: POST sube a Storage**

Import al tope del archivo (junto a los otros imports de _lib): `import { uploadPhotoObjects, deletePhotoObjects } from '../_lib/photoStorage.js'` (ajustar la ruta relativa real del archivo; mirar cómo importa los otros `_lib`).

Reemplazar el bloque POST (donde arma `row` y hace upsert, ~655-670) por:

```ts
    const ref = p.shipmentRef || p.shipment_ref || ''
    // Subir a Storage; si falla, no escribimos la fila (evita huérfanos).
    let storagePath: string | null = null
    let thumbPathOut: string | null = null
    try {
      const up = await uploadPhotoObjects(db, ref, p.id, p.fileData || p.file_data || '', p.thumbnailData || p.thumbnail_data || '')
      storagePath = up.storagePath
      thumbPathOut = up.thumbPathOut
    } catch (e: any) {
      return res.status(500).json({ error: `No se pudo subir la foto a Storage: ${e?.message || 'error'}` })
    }
    const row = {
      id: p.id,
      shipment_ref: ref,
      container_number: p.containerNumber || p.container_number || '',
      caption: p.caption || '',
      photo_type: p.photoType || p.photo_type || 'origen',
      file_name: p.fileName || p.file_name || '',
      file_type: p.fileType || p.file_type || '',
      file_data: '',            // fotos nuevas: viven en Storage, no en la DB
      thumbnail_data: '',
      storage_path: storagePath,
      thumb_path: thumbPathOut,
      created_at_ts: p.createdAt || p.created_at_ts || Date.now(),
      created_by: p.createdBy || p.created_by || '',
    }
    const { error } = await db.from('origin_photos').upsert(row, { onConflict: 'id' })
    if (error) throw error
    return res.status(200).json({ saved: true })
```

- [ ] **Step 2: DELETE borra de Storage**

Reemplazar el bloque DELETE (~673-679) por:

```ts
  if (req.method === 'DELETE') {
    const id = req.query.id as string
    if (!id) return res.status(400).json({ error: 'id query parameter required' })
    const { data: row } = await db.from('origin_photos').select('storage_path, thumb_path').eq('id', id).maybeSingle()
    if (row) await deletePhotoObjects(db, [row.storage_path, row.thumb_path])
    const { error } = await db.from('origin_photos').delete().eq('id', id)
    if (error) throw error
    return res.status(200).json({ deleted: true })
  }
```

- [ ] **Step 3: Gates + commit**

Run: `npm run typecheck && npm run build`

```bash
git add "api/data/[entity].ts"
git commit -m "feat(fotos): al subir, la foto va a Storage; al borrar, se borra de Storage"
```

---

### Task 3: read path — URLs firmadas con fallback a base64

**Files:**
- Modify: `api/data/[entity].ts` (`handleOriginPhotos` GET bulk ~622-643 y single ~601-619)
- Modify: `api/client/origin-photos.ts` (single ~64-93 y bulk ~96-128)

- [ ] **Step 1: Admin bulk + single**

En `handleOriginPhotos` GET:

1. Import (si no se agregó en Task 2): `import { signPhotoUrls, signPhotoUrl, THUMB_TTL, FULL_TTL } from '../_lib/photoStorage.js'`.

2. Bulk: el `.select(...)` (~624) debe sumar `storage_path, thumb_path`. Después de armar `photos` y antes del `return`, firmar los thumbs:

```ts
    const thumbPaths = (data || []).map((p: any) => p.thumb_path).filter(Boolean)
    const signed = await signPhotoUrls(db, thumbPaths, THUMB_TTL)
    const photos = (data || []).map((p: any) => ({
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
```

3. Single (con `id`): firmar el full. En el objeto devuelto, agregar:
```ts
          fullUrl: data.storage_path ? await signPhotoUrl(db, data.storage_path, FULL_TTL) : null,
          fileData: data.storage_path ? '' : data.file_data,   // fallback si no migrada
```
(y dejar el resto de campos como están).

- [ ] **Step 2: Cliente (api/client/origin-photos.ts)**

Mismo patrón:
1. Import `signPhotoUrls, signPhotoUrl, THUMB_TTL, FULL_TTL` de `../_lib/photoStorage.js`.
2. Single (~79-93): agregar `fullUrl` (signed del `storage_path`) y `fileData: data.storage_path ? '' : data.file_data`.
3. Bulk: el `.select(...)` (~107) suma `storage_path, thumb_path`; tras filtrar por cliente, firmar los thumbs de las fotos resultantes y mapear `thumbnailUrl` + `thumbPath`/`storagePath` + `thumbnailData` fallback (igual que el admin bulk). Firmar DESPUÉS del filtro por cliente (no firmar de más).

- [ ] **Step 3: Gates + commit**

Run: `npm run typecheck && npm run build`

```bash
git add "api/data/[entity].ts" api/client/origin-photos.ts
git commit -m "feat(fotos): lectura por URLs firmadas (thumb 8h, full 1h) con fallback a base64"
```

---

### Task 4: tipos + dataClient + UI

**Files:**
- Modify: `src/lib/quotationTypes.ts` (OriginPhoto ~60-74)
- Modify: `src/lib/dataClient.ts` (fetchOriginPhotoFile ~201-207)
- Modify: `src/components/OriginPhotoGallery.tsx` (~80)
- Modify: `src/components/OriginPhotoLightbox.tsx` (~43)

- [ ] **Step 1: Tipo**

En `OriginPhoto` agregar:
```ts
  storagePath?: string | null
  thumbPath?: string | null
  thumbnailUrl?: string | null   // signed URL (reemplaza thumbnailData cuando está migrada)
  fullUrl?: string | null        // signed URL del full (single fetch)
```

- [ ] **Step 2: dataClient — full on-demand devuelve URL o base64**

`fetchOriginPhotoFile` (201-207): hoy devuelve `data.photo?.fileData`. Cambiar a:
```ts
export async function fetchOriginPhotoFile(photoId: string): Promise<string | null> {
  const res = await authFetch(`/api/client/origin-photos?id=${encodeURIComponent(photoId)}`)
  if (!res.ok) return null
  const data = await res.json()
  return data.photo?.fullUrl || data.photo?.fileData || null   // URL firmada o base64 (fallback)
}
```
(`fetchOriginPhotos`/`fetchClientOriginPhotos` no cambian — ya devuelven el objeto con los campos nuevos.)

- [ ] **Step 3: Gallery**

En `OriginPhotoGallery.tsx` (~80), el thumbnail `src`:
```tsx
              src={photo.thumbnailUrl || photo.thumbnailData}
```

- [ ] **Step 4: Lightbox**

En `OriginPhotoLightbox.tsx` (~43):
```tsx
  const imageSrc = fullImages[photo.id] || photo.thumbnailUrl || photo.thumbnailData
```
(el `fullImages[photo.id]` ya viene de `fetchOriginPhotoFile`, que ahora devuelve la signed URL.)

- [ ] **Step 5: Gates + commit**

Run: `npm run typecheck && npm run test:run && npm run build && npm run lint`
Expected: verde, 129 tests (126 + 3 de Task 1), sin warnings nuevos.

```bash
git add src/lib/quotationTypes.ts src/lib/dataClient.ts src/components/OriginPhotoGallery.tsx src/components/OriginPhotoLightbox.tsx
git commit -m "feat(fotos): la UI usa URLs firmadas con fallback a base64"
```

---

### Task 5: endpoint de migración idempotente + botón en Equipo

**Files:**
- Create: `api/admin/migrate-photos.ts`
- Modify: `src/lib/dataClient.ts` (función `migratePhotos`)
- Modify: pestaña Equipo (botón) — localizar con grep

- [ ] **Step 1: Endpoint**

Crear `api/admin/migrate-photos.ts` (patrón de `api/client/origin-photos.ts`: handleCors + authenticateRequest + getSupabase):

```ts
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
      } catch (e: any) {
        console.warn('[migrate-photos] foto', p.id, 'falló:', e?.message)
      }
    }
    const { count } = await db.from('origin_photos').select('id', { count: 'exact', head: true }).is('storage_path', null)
    return res.status(200).json({ migradas, restantes: count ?? 0 })
  } catch (e: any) {
    console.error('[migrate-photos]', e?.message || e)
    return res.status(500).json({ error: 'Error en la migración' })
  }
}
```

- [ ] **Step 2: dataClient**

Agregar a `dataClient.ts`:
```ts
/** Migra un lote de fotos a Storage. Devuelve cuántas migró y cuántas faltan. */
export async function migratePhotos(): Promise<{ migradas: number; restantes: number }> {
  const res = await authFetch('/api/admin/migrate-photos', { method: 'POST' })
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`) }
  return res.json()
}
```

- [ ] **Step 3: Botón en pestaña Equipo**

Localizar el componente de la pestaña Equipo (grep `Equipo` en src/components; es solo-owner). Agregar un botón "Migrar fotos a Storage" que llama `migratePhotos()` en loop hasta `restantes === 0`, mostrando progreso con toast:
```tsx
  const [migrating, setMigrating] = useState(false)
  const runPhotoMigration = async () => {
    if (migrating) return
    setMigrating(true)
    const t = toast.loading('Migrando fotos a Storage…')
    try {
      let total = 0, restantes = Infinity
      while (restantes > 0) {
        const r = await migratePhotos()
        total += r.migradas
        restantes = r.restantes
        toast.loading(`Migradas ${total} · faltan ${restantes}…`, { id: t })
        if (r.migradas === 0 && restantes > 0) break   // nada migrable (data corrupta) → corta
      }
      toast.success(`Migración terminada: ${total} fotos en Storage`, { id: t })
    } catch (e: any) {
      toast.error(`Error: ${e?.message || 'falló la migración'}`, { id: t })
    } finally {
      setMigrating(false)
    }
  }
```
Botón: `<Button onClick={runPhotoMigration} disabled={migrating}>{migrating ? 'Migrando…' : 'Migrar fotos a Storage'}</Button>` (import `migratePhotos` de dataClient, `toast` de sonner, `useState`). Ubicarlo en una sección de mantenimiento/owner de la pestaña.

- [ ] **Step 4: Gates + commit**

Run: `npm run typecheck && npm run test:run && npm run build && npm run lint`

```bash
git add api/admin/migrate-photos.ts src/lib/dataClient.ts <archivo-pestaña-equipo>
git commit -m "feat(fotos): endpoint de migracion idempotente + boton en Equipo"
```

---

### Task 6: gates finales + push + PR

- [ ] **Step 1** Suite completa (`typecheck && test:run && build && lint`) → 129 tests, sin warnings nuevos.
- [ ] **Step 2** `git push -u origin feat/fotos-storage`
- [ ] **Step 3** Link de PR a Brian: `https://github.com/MrSuricata/twfnew/pull/new/feat/fotos-storage`

Checklist manual (post-merge, en prod):
1. **Subir una foto nueva** a una operación → en la DB su `file_data` queda vacío y `storage_path` seteado; se ve en la galería.
2. **Correr la migración** desde Equipo (botón) → ver "Migradas N · faltan 0".
3. Galería admin: thumbnails cargan (URL firmada); lightbox abre el full.
4. **Portal de cliente**: el cliente ve solo SUS fotos (filtro intacto), thumbnails y full andan.
5. Una foto vieja antes de migrar: sigue viéndose por el fallback base64.
6. Borrar una foto → desaparece de la galería y del bucket.

---

## Notas para el ejecutor

- **No se borra el base64** (`file_data`/`thumbnail_data`) en ningún momento de esta PR — es el respaldo. El espacio se recupera en una limpieza posterior (otra PR) cuando Brian confirme.
- El bucket es **privado**: jamás usar `getPublicUrl`; siempre `createSignedUrl(s)`. El acceso es 100% server-side (service-role); el cliente solo recibe URLs ya firmadas.
- El control de acceso por cliente NO cambia: en `api/client/origin-photos.ts` se firma DESPUÉS de filtrar por `clientePattern`.
- Las signed URLs vencen (thumb 8h / full 1h). Si el admin deja la galería abierta más que eso, un refresh re-firma. Aceptable; no agregar auto-refresh.
- La migración es idempotente (`WHERE storage_path IS NULL`) y best-effort por foto (una que falle no corta el lote; se reintenta en la próxima corrida).
- Si `npm run lint` marca algo pre-existente no relacionado, reportar sin arreglar.
