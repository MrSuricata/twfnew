# Fotos de operaciones → Supabase Storage — Design

_Fecha: 2026-06-12 · Aprobado por Brian en sesión._

## Objetivo

Las fotos de operaciones se guardan hoy como **base64 en Postgres** (tabla `origin_photos`,
columnas `file_data` full + `thumbnail_data`). ~164 fotos ≈ 30-100 MB de bloat en la DB y
~8 MB de thumbnails transferidos en cada login de admin. Se migran a **Supabase Storage**
(bucket privado) guardando solo las rutas; la lectura usa **URLs firmadas**. Es greenfield:
hoy el repo no usa Storage en ningún lado.

## Decisiones (con Brian, 12/06/2026)

| Tema | Decisión |
|------|----------|
| Privacidad | **Bucket privado** + URLs firmadas (mantiene el filtro por cliente del portal) |
| Alcance | **Solo `origin_photos`** (las 164 fotos). Los PDFs de `reports` quedan para otra tanda |
| Dos tamaños | Full + thumbnail como hoy (thumb en listados, full en lightbox) |
| Migración | Endpoint admin **idempotente y reversible** — NO borra el base64 viejo |
| Recuperar espacio | **Segundo paso aparte** (borrar columnas base64) cuando Brian confirme que anda |

## Arquitectura

### Storage
- **Bucket privado `operation-photos`** (creado por SQL en `storage.buckets`, no público).
  Solo el server (service-role, ya configurado en `api/_lib/supabase.ts`) accede; RLS de
  storage no necesita políticas porque el service-role las bypassa.
- **Rutas:** `full/{shipmentRef}/{photoId}.jpg` y `thumb/{shipmentRef}/{photoId}.jpg`.
  El `shipmentRef` en la ruta ayuda a inspeccionar/limpiar por operación.

### Modelo de datos (migración aditiva, la aplica Jarvis)
```sql
-- columnas nuevas (las viejas file_data/thumbnail_data se mantienen como respaldo)
alter table origin_photos
  add column if not exists storage_path text,
  add column if not exists thumb_path text;
-- bucket privado
insert into storage.buckets (id, name, public)
values ('operation-photos', 'operation-photos', false)
on conflict (id) do nothing;
```

### Helper server-side nuevo: `api/_lib/photoStorage.ts`
- `decodeDataUrl(dataUrl): { bytes: Buffer; contentType: string }` — pura, testeable
  (separa `data:image/jpeg;base64,…` en binario + mime).
- `uploadPhotoObjects(db, ref, id, fullDataUrl, thumbDataUrl): Promise<{ storagePath, thumbPath }>`
  — sube ambos a `operation-photos` (upsert), devuelve las rutas.
- `signPhotoUrls(db, paths: string[], ttlSec): Promise<Map<path,url>>` — batch
  `createSignedUrls`; thumbnails TTL **8h** (duran la sesión), full TTL **1h** (on-demand).
- `deletePhotoObjects(db, paths)` — para cuando se borra una foto.

### Write (fotos nuevas)
`handleOriginPhotos` POST `?mode=file` (api/data/[entity].ts): el cliente comprime y manda
base64 como hoy → el server **decodifica y sube a Storage** → guarda `storage_path`/`thumb_path`
(deja `file_data`/`thumbnail_data` vacíos para las nuevas). Si la subida a Storage falla →
error visible (no escribe la fila a medias).

### Read
- **Bulk** (lista admin / cliente): hoy devuelve `thumbnail_data`. Pasa a devolver
  `thumbnailUrl` = signed URL del `thumb_path` (batch, TTL 8h). **Fallback de transición:** si
  una foto aún no tiene `thumb_path` pero tiene `thumbnail_data`, devolver el base64 (así
  funciona aunque la migración no haya corrido todavía).
- **Single (full)**: `api/client/origin-photos.ts?id=` y el path admin equivalente → devuelven
  `fullUrl` = signed URL del `storage_path` (TTL 1h); fallback `file_data` base64.
- El control de acceso del cliente (filtrar por `clientePattern`) **no cambia** — se firma solo
  lo que el cliente puede ver.

### UI
- `OriginPhoto` (quotationTypes.ts) += `storagePath?`, `thumbPath?`, `thumbnailUrl?`, `fullUrl?`.
- `OriginPhotoGallery`: `src = photo.thumbnailUrl || photo.thumbnailData` (fallback).
- `OriginPhotoLightbox`: `src = fullImages[id] || photo.thumbnailUrl || photo.thumbnailData`;
  el lazy-load del full ahora trae `fullUrl` en vez de base64.
- `dataClient` mapea los campos nuevos. Blast radius chico (swap de props).

### Migración de las 164 existentes
- Endpoint admin **`POST /api/admin/migrate-photos`** (solo rol admin):
  - Procesa en lotes (`WHERE storage_path IS NULL LIMIT N`, N≈25), sube cada una a Storage,
    setea `storage_path`/`thumb_path`. **NO toca `file_data`/`thumbnail_data`.**
  - Idempotente (solo migra las que faltan). Devuelve `{ migradas, restantes }`.
- **Disparo:** botón en pestaña **Equipo** (solo owner) "Migrar fotos a Storage (N pendientes)"
  que llama el endpoint en loop hasta `restantes = 0`, con progreso. Brian lo corre una vez
  post-deploy. (Alternativa: curl manual — se documenta en la PR.)

### Cleanup futuro (NO en esta PR)
Una vez verificado en prod: migración que borra `file_data`/`thumbnail_data` y hace `vacuum` →
ahí se recupera el espacio real. Se hace cuando Brian dé el OK.

## Testing
- vitest: `decodeDataUrl` (mime + bytes, data url válida / basura / sin prefijo).
- Manual en prod: subir una foto nueva (va directo a Storage) · correr la migración · abrir
  galería + lightbox (admin y cliente) · verificar que el cliente solo ve lo suyo · que las
  fotos viejas no migradas siguen viéndose por el fallback.

## Fuera de alcance
- PDFs de `reports` (otra tanda).
- Borrar las columnas base64 (segundo paso).
- Tracking público de fotos (hoy no expone fotos; sigue igual).
