// ─── Data Client ─────────────────────────────────────────────────────
// Functions to read/write shared data via the Supabase-backed API.
// Uses authFetch for admin-authenticated requests.
// Falls back gracefully so the app works even without Supabase.
// ─────────────────────────────────────────────────────────────────────

import { authFetch } from './authClient'
import type { QuoteFormData, ClientAccount, ClientPortalUser, ShipmentDocument, OperativeReport, OriginPhoto } from './quotationTypes'
import type { ParsedShipment } from './shipmentTypes'
import { applyWebEdits } from './shipmentTypes'
import type { Truck, TruckLoad, LclAirShipment } from './truckTypes'
import type { BillingRecord } from './billingTypes'
import type { Operator, OperatorAssignment, DbShipment } from './operationsTypes'
import { fclToColumns } from './operationsTypes'
import type { RefCheckRecord, RefCheckSteps, CheckStepKey } from './checksTypes'
import type { CuotaTransporte } from './distribucionTransportes'
import { matchesPattern } from './clientMatching'

// ── Shipments FCL (espejo en `shipments` → fallback cache JSON) ──
// Etapa 2 de la migración: la fuente primaria de las FCL es el ESPEJO en la
// tabla `shipments` (filas source='sheet', columna sheet_raw = ParsedShipment
// completo). Mismos objetos que el cache → toda la lógica derivada (estado,
// LIBRE, facturación, Solo activas) funciona idéntica. Si el espejo todavía
// no tiene sheet_raw (falta un sync) o falla, se cae al cache como siempre.

export async function fetchShipmentsFromDB(): Promise<{ shipments: ParsedShipment[]; syncedAt: string | null; flipped?: boolean }> {
  try {
    const res = await authFetch('/api/data/shipments?includeMirror=only')
    if (res.ok) {
      const data = await res.json()
      // Flip Etapa 4: la web es master → las FCL vienen como dbShipments (source='fcl'),
      // no por acá. NO caer al cache (mostraría las FCL duplicadas). `flipped` le avisa
      // al caller que vacíe el cache local de FCL-espejo.
      if (data.flipped) return { shipments: [], syncedAt: null, flipped: true }
      const rows = (data.shipments || []).filter((r: any) => r.sheet_raw)
      if (rows.length > 0) {
        const maxTs = Math.max(...rows.map((r: any) => Number(r.updated_at_ts) || 0))
        return {
          // Etapa 3: las ediciones web (web_edits) PISAN al dato de la planilla
          shipments: rows.map((r: any) => applyWebEdits(r.sheet_raw, r.web_edits, r.id)),
          syncedAt: maxTs > 0 ? new Date(maxTs).toISOString() : null,
        }
      }
    }
  } catch { /* fallback al cache */ }
  const res = await authFetch('/api/data/shipments-cache')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── Quotes ──

export async function fetchQuotes(): Promise<QuoteFormData[]> {
  const res = await authFetch('/api/data/quotes')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()

  // Map DB snake_case to frontend camelCase
  return (data.quotes || []).map((q: any) => ({
    id: q.id,
    name: q.name,
    email: q.email,
    phone: q.phone || '',
    cargoType: q.cargo_type || q.cargoType || '',
    origin: q.origin || '',
    destination: q.destination || '',
    details: q.details || '',
    timestamp: q.timestamp,
    status: q.status || 'pending',
    notes: q.notes || [],
    language: q.language || 'es',
  }))
}

export async function saveQuotes(quotes: QuoteFormData[]): Promise<void> {
  const res = await authFetch('/api/data/quotes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(quotes),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

// ── Documents ──

export async function fetchDocuments(): Promise<ShipmentDocument[]> {
  const res = await authFetch('/api/data/documents')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.documents || []
}

export async function saveDocuments(documents: ShipmentDocument[]): Promise<void> {
  const res = await authFetch('/api/data/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(documents),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

// ── Reports ──

/** Fetch all reports (metadata only — no fileData). */
export async function fetchReports(): Promise<OperativeReport[]> {
  const res = await authFetch('/api/data/reports')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.reports || []
}

/** Bulk metadata sync — strips fileData to keep request small. */
export async function saveReports(reports: OperativeReport[]): Promise<void> {
  // Strip fileData to avoid Vercel 4.5MB body limit
  const metadata = reports.map(({ fileData, ...rest }) => rest)
  const res = await authFetch('/api/data/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

/** Upload a single report WITH file data (individual save). */
export async function saveReportWithFile(report: OperativeReport): Promise<void> {
  const res = await authFetch('/api/data/reports?mode=file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

/** Download file data for a single report (on-demand). Works for both admin and client tokens. */
export async function fetchReportFile(reportId: string): Promise<string | null> {
  // Try client endpoint first (works for both roles), fall back to admin
  const res = await authFetch(`/api/client/reports?id=${encodeURIComponent(reportId)}`)
  if (!res.ok) return null
  const data = await res.json()
  return data.report?.fileData || null
}

/** Fetch reports accessible to the current client (filtered by their shipments server-side). */
export async function fetchClientReports(): Promise<OperativeReport[]> {
  const res = await authFetch('/api/client/reports')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.reports || []
}

/** Delete a single report from DB. */
export async function deleteReport(reportId: string): Promise<void> {
  const res = await authFetch(`/api/data/reports?id=${encodeURIComponent(reportId)}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

// ── Origin Photos ──

/** Fetch all origin photos (thumbnails only, no file_data). */
export async function fetchOriginPhotos(): Promise<OriginPhoto[]> {
  const res = await authFetch('/api/data/origin-photos')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.photos || []
}

/** Upload a single origin photo (with compressed file_data + thumbnail). */
export async function saveOriginPhoto(photo: OriginPhoto): Promise<void> {
  const res = await authFetch('/api/data/origin-photos?mode=file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(photo),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

/** Delete a single origin photo from DB. */
export async function deleteOriginPhoto(id: string): Promise<void> {
  const res = await authFetch(`/api/data/origin-photos?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

/** Fetch full-size photo file_data on demand. Works for both admin and client tokens. */
export async function fetchOriginPhotoFile(photoId: string): Promise<string | null> {
  const res = await authFetch(`/api/client/origin-photos?id=${encodeURIComponent(photoId)}`)
  if (!res.ok) return null
  const data = await res.json()
  return data.photo?.fullUrl || data.photo?.fileData || null   // URL firmada o base64 (fallback)
}

/** Fetch origin photos for the current client (filtered by their shipments). */
export async function fetchClientOriginPhotos(): Promise<OriginPhoto[]> {
  const res = await authFetch('/api/client/origin-photos')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.photos || []
}

/** Migra un lote de fotos a Storage. Devuelve cuántas migró y cuántas faltan. */
export async function migratePhotos(): Promise<{ migradas: number; restantes: number }> {
  const res = await authFetch('/api/data/origin-photos?mode=migrate', { method: 'POST' })
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`) }
  return res.json()
}

/** Hornear FCL (flip Etapa 4): lee el espejo con su estado efectivo (sheet_raw +
 *  web_edits), lo mapea a columnas reales y lo upsertea como filas source='fcl'.
 *  Idempotente. Correr durante el cutover (con FCL_SOURCE_OF_TRUTH=db ya seteado;
 *  usa ?raw=1 para leer el espejo aunque el flip oculte la lectura normal). */
export async function bakeFclToColumns(): Promise<{ horneadas: number }> {
  const res = await authFetch('/api/data/shipments?includeMirror=only&raw=1')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const rows = (data.shipments || []).filter((r: { sheet_raw?: unknown }) => r.sheet_raw)
  const payload = rows.map((r: { id: string; sheet_raw: unknown; web_edits: unknown; created_at_ts?: number }) => ({
    id: r.id,
    created_at_ts: r.created_at_ts,
    ...fclToColumns(applyWebEdits(r.sheet_raw as never, r.web_edits as never, r.id)),
  }))
  for (let i = 0; i < payload.length; i += 200) {
    const batch = payload.slice(i, i + 200)
    const r = await authFetch('/api/data/shipments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    })
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `HTTP ${r.status}`) }
  }
  return { horneadas: payload.length }
}

/** Renombrar la REF de una carga (flip Etapa 4): PIN 0000 + cascada atómica server-side.
 *  Tira error con mensaje amigable si el PIN está mal (403) o la ref ya existe (409). */
export async function renameShipmentRef(id: string, newRef: string, pin: string): Promise<{ oldRef: string; newRef: string }> {
  const qs = `id=${encodeURIComponent(id)}&renameRef=${encodeURIComponent(newRef)}&pin=${encodeURIComponent(pin)}`
  const res = await authFetch(`/api/data/shipments?${qs}`, { method: 'PATCH' })
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`) }
  return res.json()
}

// ── Notification Tasks ──
// The old task-based workflow (confirm → send email → mark completed) was replaced
// in 2026-04 with the HOY dashboard (see TodayDashboard.tsx + todayFilters.ts) +
// a daily Telegram summary. The API endpoints below were removed:
//   - POST /api/notifications/confirm
//   - POST /api/notifications/send-email
// The notification_tasks table is kept for historical audit; no new rows are written.

// ── Noticias (Novedades logísticas de la landing) ──

export async function fetchNoticiasAdmin(): Promise<Record<string, unknown>[]> {
  const res = await authFetch('/api/data/noticias')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.noticias || []
}

export async function saveNoticia(n: Record<string, unknown>): Promise<void> {
  const res = await authFetch('/api/data/noticias', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(n),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

export async function deleteNoticia(id: string): Promise<void> {
  const res = await authFetch(`/api/data/noticias?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

// ── Avisos del calendario ──

export async function fetchEventosCalendario(): Promise<import('./calendarioEventos').EventoCalendario[]> {
  const res = await authFetch('/api/data/calendario-eventos')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const { parseEventoCal } = await import('./calendarioEventos')
  return (data.eventos || []).map(parseEventoCal)
}

export async function saveEventoCalendario(e: Record<string, unknown>): Promise<void> {
  const res = await authFetch('/api/data/calendario-eventos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(e),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

export async function deleteEventoCalendario(id: string): Promise<void> {
  const res = await authFetch(`/api/data/calendario-eventos?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

// ── Clients ──

export async function fetchClients(): Promise<ClientAccount[]> {
  const res = await authFetch('/api/data/clients')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return (data.clients || []).map((c: any) => ({
    id: c.id,
    email: c.email || '',
    name: c.name,
    company: c.company || '',
    createdAt: c.created_at_ts || c.createdAt,
    clientePattern: c.cliente_pattern || c.clientePattern || '',
    razonSocial: c.razonSocial ?? c.razon_social ?? '',
    cuitDoc: c.cuitDoc ?? c.cuit_doc ?? '',
    pais: c.pais ?? '',
    direccion: c.direccion ?? '',
    aliases: c.aliases ?? '',
    digestActive: !!c.digestActive,
    digestEmails: c.digestEmails ?? '',
  }))
}

export async function saveClients(clients: ClientAccount[]): Promise<void> {
  const res = await authFetch('/api/data/clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(clients),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

export async function deleteClient(id: string): Promise<void> {
  const res = await authFetch(`/api/data/clients?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

/**
 * Admin(owner)-only: request a client session token without contraseña.
 * Used to "view portal as client X" for QA/debug. Acepta id del cliente del
 * catálogo (preferido — funciona aunque no tenga email) o email de contacto.
 * Returns { token, role, email, name, company }.
 */
export async function impersonateClient(ref: { id?: string; email?: string }): Promise<{
  token: string
  role: 'client'
  email: string
  name: string
  company: string
}> {
  const res = await authFetch('/api/auth/impersonate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ref),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Client users (accesos al portal de clientes, email+contraseña) ──

export async function fetchClientUsers(clientId?: string): Promise<ClientPortalUser[]> {
  const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : ''
  const res = await authFetch(`/api/data/client-users${qs}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.users || []
}

export async function createClientUser(input: {
  clientId: string
  email: string
  name?: string
  password: string
}): Promise<void> {
  const res = await authFetch('/api/data/client-users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

export async function patchClientUser(
  id: string,
  fields: { active?: boolean; password?: string; name?: string },
): Promise<void> {
  const res = await authFetch(`/api/data/client-users?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

export async function deleteClientUser(id: string): Promise<void> {
  const res = await authFetch(`/api/data/client-users?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

/**
 * Save a client email inline from the notification checklist.
 * Updates existing client or creates a new one with clientePattern = CLIENTE value.
 */
export async function saveClientEmailInline(clienteValue: string, email: string): Promise<void> {
  try {
    const clients = await fetchClients()
    const clienteUpper = clienteValue.toUpperCase().trim()

    // Find existing client whose pattern matches this CLIENTE
    const existing = clients.find(c => matchesPattern(clienteUpper, c.clientePattern || ''))

    if (existing) {
      // Update email for existing client
      existing.email = email.trim()
      await saveClients(clients)
    } else {
      // Create new client
      const newClient: ClientAccount = {
        id: `client-${Date.now()}`,
        email: email.trim(),
        name: clienteValue,
        company: clienteValue,
        createdAt: Date.now(),
        clientePattern: clienteValue,
      }
      await saveClients([...clients, newClient])
    }
  } catch (err) {
    console.warn('[saveClientEmailInline] Failed:', err)
    // Non-fatal: task email was already updated, client record is a bonus
  }
}

// ── Settings ──

export async function fetchAllSettings(): Promise<Record<string, any>> {
  const res = await authFetch('/api/data/settings')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.settings || {}
}

export async function saveSetting(key: string, value: unknown): Promise<void> {
  const res = await authFetch('/api/data/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

// ── Trucks (consolidated truck builder) ──

export async function fetchTrucks(): Promise<Truck[]> {
  const res = await authFetch('/api/data/trucks')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.trucks || []
}

export async function saveTrucks(trucks: Truck[]): Promise<void> {
  const res = await authFetch('/api/data/trucks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trucks),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

export async function deleteTruck(id: string): Promise<void> {
  const res = await authFetch(`/api/data/trucks?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

// ── Truck loads ──

export async function fetchTruckLoads(truckId?: string): Promise<TruckLoad[]> {
  const url = truckId
    ? `/api/data/truck-loads?truckId=${encodeURIComponent(truckId)}`
    : '/api/data/truck-loads'
  const res = await authFetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.loads || []
}

export async function saveTruckLoads(loads: TruckLoad[]): Promise<void> {
  if (loads.length === 0) return
  const res = await authFetch('/api/data/truck-loads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(loads),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

export async function deleteTruckLoad(id: string): Promise<void> {
  const res = await authFetch(`/api/data/truck-loads?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

// ── LCL / Air shipments ──

export async function fetchLclAir(): Promise<LclAirShipment[]> {
  const res = await authFetch('/api/data/lcl-air')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.shipments || []
}

export async function saveLclAir(shipments: LclAirShipment[]): Promise<void> {
  if (shipments.length === 0) return
  const res = await authFetch('/api/data/lcl-air', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(shipments),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

export async function deleteLclAir(id: string): Promise<void> {
  const res = await authFetch(`/api/data/lcl-air?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

// ── Billing overlay ──

export async function fetchBilling(): Promise<BillingRecord[]> {
  const res = await authFetch('/api/data/billing')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.billing || []
}

// ── Cuotas de reparto por transporte ───────────────────────────────────

export async function fetchTransporteCuotas(): Promise<CuotaTransporte[]> {
  const res = await authFetch('/api/data/transporte-cuotas')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.cuotas || []
}

export async function saveTransporteCuotas(cuotas: CuotaTransporte[]): Promise<void> {
  const res = await authFetch('/api/data/transporte-cuotas', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cuotas }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

// ── Preferencias de UI por cuenta (user_prefs) ─────────────────────────
// Columnas/orden/toggles de la grilla viajan con el LOGIN (no con el
// navegador). localStorage queda como caché local y fallback offline.

export async function fetchUserPrefs(): Promise<Record<string, unknown>> {
  const res = await authFetch('/api/data/user-prefs')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.prefs || {}
}

export async function saveUserPrefs(patch: Record<string, unknown>): Promise<void> {
  const res = await authFetch('/api/data/user-prefs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefs: patch }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

// Guardado laxo: junta los cambios de prefs 800 ms y manda UN solo POST
// (merge parcial server-side). Fire-and-forget: si falla queda el localStorage.
let prefsBuffer: Record<string, unknown> = {}
let prefsTimer: ReturnType<typeof setTimeout> | null = null
export function saveUserPrefsDebounced(patch: Record<string, unknown>): void {
  prefsBuffer = { ...prefsBuffer, ...patch }
  if (prefsTimer) clearTimeout(prefsTimer)
  prefsTimer = setTimeout(() => {
    const send = prefsBuffer
    prefsBuffer = {}
    prefsTimer = null
    void saveUserPrefs(send).catch(() => { /* offline / sin permiso: queda el caché local */ })
  }, 800)
}

/**
 * Manda YA lo que esté esperando el debounce. Se llama al ocultar o abandonar
 * la página: sin esto, tocar algo y recargar dentro de los 800 ms pierde el
 * cambio, y al volver el server contesta el valor viejo (se "deshace" solo).
 */
export function flushUserPrefs(): void {
  if (!prefsTimer) return
  clearTimeout(prefsTimer)
  prefsTimer = null
  const send = prefsBuffer
  prefsBuffer = {}
  void saveUserPrefs(send).catch(() => { /* queda el caché local */ })
}

export async function saveBilling(rows: BillingRecord[]): Promise<void> {
  if (rows.length === 0) return
  const res = await authFetch('/api/data/billing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

export async function deleteBilling(ref: string): Promise<void> {
  const res = await authFetch(`/api/data/billing?ref=${encodeURIComponent(ref)}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

/** Atomically increment and return the next code for the given prefix.
 *  C → "C430"; LCL → "LCL-0001"; AIR → "AIR-0001". */
export async function nextTruckCode(prefix: 'C' | 'LCL' | 'AIR'): Promise<string> {
  const res = await authFetch('/api/data/truck-counter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.code as string
}

// ── Operators (lista editable de operativos) ──

export async function fetchOperators(): Promise<Operator[]> {
  const res = await authFetch('/api/data/operators')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.operators || []
}

export async function saveOperators(operators: Operator[]): Promise<void> {
  if (operators.length === 0) return
  const res = await authFetch('/api/data/operators', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(operators),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

export async function deleteOperator(id: string): Promise<void> {
  const res = await authFetch(`/api/data/operators?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

// ── Operator assignments (overlay ref → operativo) ──

export async function fetchOperatorAssignments(): Promise<OperatorAssignment[]> {
  const res = await authFetch('/api/data/operator-assignments')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.assignments || []
}

export async function saveOperatorAssignment(ref: string, operatorId: string | null): Promise<void> {
  const res = await authFetch('/api/data/operator-assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref, operatorId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

// ── Checks operativos por ref (pestaña Checks) ──

/** Todas las filas de ref_checks (el server las scopea por cliente_pattern). */
export async function fetchRefChecks(): Promise<RefCheckRecord[]> {
  const res = await authFetch('/api/data/ref-checks')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.checks || []
}

/** Upsert por ref con MERGE server-side de pasos PARCIALES (solo las claves
 *  tocadas; done=false elimina el paso). Devuelve los steps completos que
 *  quedaron guardados (con `by` estampado del token) para reconciliar el
 *  estado optimista de la pestaña. */
export async function saveRefCheckSteps(ref: string, steps: RefCheckSteps): Promise<RefCheckSteps> {
  const res = await authFetch('/api/data/ref-checks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref, steps }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.steps || {}
}

/** Guarda un paso-aviso POR CONTENEDOR: manda el mapa `cntrs` COMPLETO de la ref
 *  para ese paso (salida/frontera/fiscal). El server mergea por contenedor y
 *  estampa `by` del token. Devuelve los steps completos guardados. */
export async function saveRefCheckCntrs(
  ref: string,
  stepKey: CheckStepKey,
  cntrs: Record<string, { done: boolean; date?: string; by?: string }>,
): Promise<RefCheckSteps> {
  const res = await authFetch('/api/data/ref-checks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref, steps: { [stepKey]: { done: true, cntrs } } }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.steps || {}
}

// ── Unified shipments (LCL/aéreo/terrestre desde la tabla shipments) ──

export async function fetchDbShipments(): Promise<DbShipment[]> {
  const res = await authFetch('/api/data/shipments')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.shipments || []
}

/** Create (upsert) a full shipment row in the unified `shipments` table. */
export async function createDbShipment(row: DbShipment): Promise<void> {
  const res = await authFetch('/api/data/shipments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(row),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

/** Partial update of a shipment row (e.g. operator_id, or inline cell edits). */
export async function patchDbShipment(id: string, fields: Record<string, unknown>): Promise<void> {
  const res = await authFetch(`/api/data/shipments?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

// ── Bitácora de gestiones por carga (ref_notas) ──────────────────────

/** Últimas notas de gestión (todas o de una ref). Más nuevas primero. */
export async function fetchRefNotas(ref?: string): Promise<Record<string, unknown>[]> {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : ''
  const res = await authFetch(`/api/data/ref-notas${q}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.rows || []
}

/** Agrega una nota de gestión ("reclamado por wpp al cliente"). El usuario y
 *  la hora los estampa el server. Devuelve la fila creada. */
export async function postRefNota(ref: string, texto: string): Promise<Record<string, unknown>> {
  const res = await authFetch('/api/data/ref-notas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref, texto }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.row || {}
}

// ── Historial de seguimientos (cola de Nico) ─────────────────────────

/** Log de actividad. `ref` acota a una carga; `campo` trae solo los patches
 *  que tocaron ese campo (whitelist server: 'buque') — así Seguimientos arma
 *  los trasbordos de toda la cola con una sola llamada. Más nuevas primero. */
export async function fetchAuditLog(opts: { ref?: string; campo?: 'buque' } = {}): Promise<Record<string, unknown>[]> {
  const p = new URLSearchParams()
  if (opts.ref) p.set('ref', opts.ref)
  if (opts.campo) p.set('campo', opts.campo)
  const q = p.toString()
  const res = await authFetch(`/api/data/audit-log${q ? `?${q}` : ''}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.log || []
}

/** Trae el historial (todo o de una ref). Filas más nuevas primero.
 *  `desde` (YYYY-MM-DD) acota por período; `truncado` avisa que se llegó al
 *  tope y quedaron filas afuera — el que muestra la lista tiene que decirlo. */
export async function fetchSeguimientosLog(
  ref?: string,
  opts: { desde?: string; limit?: number } = {},
): Promise<{ rows: Record<string, unknown>[]; truncado: boolean }> {
  const p = new URLSearchParams()
  if (ref) p.set('ref', ref)
  if (opts.desde) p.set('desde', opts.desde)
  if (opts.limit) p.set('limit', String(opts.limit))
  const q = p.toString()
  const res = await authFetch(`/api/data/seguimientos-log${q ? `?${q}` : ''}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return { rows: data.rows || [], truncado: !!data.truncado }
}

/** Registra un evento del historial ('enviado' con foto de eta/buque, o
 *  'eta' con anterior→nueva). El usuario lo estampa el server (del token). */
export async function postSeguimientoLog(row: {
  ref: string
  tipo: 'enviado' | 'eta' | 'deshecho' | 'trasbordo'
  fecha?: string
  etaAnterior?: string
  etaNueva?: string
  buque?: string
}): Promise<void> {
  const res = await authFetch('/api/data/seguimientos-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(row),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

/** Etapa 3 migración: editar un campo de una FCL espejo (overlay web_edits).
 *  Claves de ParsedShipment (ETA, BUQUE, CNTR...); value null = revertir al
 *  valor de la planilla. La REF no se edita por acá. */
export async function patchFclShipment(id: string, edits: Record<string, unknown>): Promise<void> {
  const res = await authFetch(`/api/data/shipments?id=${encodeURIComponent(id)}&fcl=1`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(edits),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

/** Eliminar definitivo de una carga: el backend valida (camión / facturada /
 *  fotos) y responde 409 con el motivo si no se puede — mostrar tal cual. */
export async function deleteDbShipment(id: string): Promise<void> {
  const res = await authFetch(`/api/data/shipments?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

// ── Bulk Load (load all admin data in parallel) ──

export interface AdminData {
  shipments: ParsedShipment[]
  quotes: QuoteFormData[]
  documents: ShipmentDocument[]
  reports: OperativeReport[]
  originPhotos: OriginPhoto[]
  clients: ClientAccount[]
  trucks: Truck[]
  truckLoads: TruckLoad[]
  lclAir: LclAirShipment[]
  billing: BillingRecord[]
  operators: Operator[]
  assignments: OperatorAssignment[]
  dbShipments: DbShipment[]
  syncedAt: string | null
  shipmentsFlipped?: boolean   // flip Etapa 4: la web es master de FCL → vaciar cache espejo
}

/** Resolve to [] if the tables don't exist yet (deployed before the migration). */
async function softFetch<T>(fn: () => Promise<T[]>, label: string): Promise<T[]> {
  try {
    return await fn()
  } catch (err) {
    console.warn(`[loadAdminData] ${label} unavailable:`, err)
    return []
  }
}

export async function loadAdminData(): Promise<AdminData> {
  const [shipmentsRes, quotes, documents, reports, originPhotos, clients, trucks, truckLoads, lclAir, billing] = await Promise.all([
    fetchShipmentsFromDB(),
    fetchQuotes(),
    fetchDocuments(),
    fetchReports(),
    fetchOriginPhotos(),
    fetchClients(),
    softFetch(fetchTrucks, 'trucks'),
    softFetch(() => fetchTruckLoads(), 'truck-loads'),
    softFetch(fetchLclAir, 'lcl-air'),
    softFetch(fetchBilling, 'billing'),
  ])

  // Operators + assignments + unified shipments — soft-loaded (non-fatal).
  const [operators, assignments, dbShipments] = await Promise.all([
    softFetch(fetchOperators, 'operators'),
    softFetch(fetchOperatorAssignments, 'operator-assignments'),
    softFetch(fetchDbShipments, 'shipments'),
  ])

  return {
    shipments: shipmentsRes.shipments,
    shipmentsFlipped: shipmentsRes.flipped,
    quotes,
    documents,
    reports,
    originPhotos,
    clients,
    trucks,
    truckLoads,
    lclAir,
    billing,
    operators,
    assignments,
    dbShipments,
    syncedAt: shipmentsRes.syncedAt,
  }
}

// ─── Actas de depósito (EN DEPÓSITO) ─────────────────────────────────
// Log por (ref, contenedor): cada trasiego deja su acta, no se pisa nada.

/** Trae las actas (todas o de una ref). Más nuevas primero. */
export async function fetchDepositoActas(
  ref?: string,
  opts: { limit?: number } = {},
): Promise<{ actas: Record<string, unknown>[]; truncado: boolean }> {
  const p = new URLSearchParams()
  if (ref) p.set('ref', ref)
  if (opts.limit) p.set('limit', String(opts.limit))
  const q = p.toString()
  const res = await authFetch(`/api/data/deposito-actas${q ? `?${q}` : ''}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return { actas: data.actas || [], truncado: !!data.truncado }
}

/** Guarda un acta nueva. El usuario lo estampa el server desde el token. */
export async function saveDepositoActa(acta: {
  ref: string
  contenedor?: string
  fecha?: string
  checks?: Record<string, boolean>
  comentario?: string
}): Promise<Record<string, unknown>> {
  const res = await authFetch('/api/data/deposito-actas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(acta),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.acta || {}
}

/** Anula un acta cargada por error. No la borra: la fila queda con quién y
 *  cuándo la anuló, pero desaparece de la pantalla y del informe. */
export async function anularDepositoActa(id: string): Promise<void> {
  const res = await authFetch(`/api/data/deposito-actas?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

// ─── Agenda de retiros MONTECON ──────────────────────────────────────

/** Todas las filas de agenda (ref → ETA agendada + marcas retirado/avisado). */
export async function fetchMonteconAgenda(): Promise<import('./monteconAgenda').AgendaRow[]> {
  const res = await authFetch('/api/data/montecon-agenda')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.agenda || []
}

/** Marcar o desmarcar RETIRADO / AVISADO de una ref (ciclo post-agenda). */
export async function marcarMontecon(
  ref: string,
  campo: 'retirado' | 'avisado',
  on: boolean,
): Promise<void> {
  const res = await authFetch('/api/data/montecon-agenda', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(on ? { ref, marcar: campo } : { ref, desmarcar: campo }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

/** Agendar (o RE-agendar) el retiro: guarda la ETA actual como snapshot y,
 *  si se pasa, la fecha del TURNO conseguido. */
export async function agendarMontecon(ref: string, eta: string, fechaRetiro?: string): Promise<void> {
  const res = await authFetch('/api/data/montecon-agenda', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fechaRetiro ? { ref, eta, fecha_retiro: fechaRetiro } : { ref, eta }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

/** Quitar la agenda de una ref. */
export async function desagendarMontecon(ref: string): Promise<void> {
  const res = await authFetch(`/api/data/montecon-agenda?ref=${encodeURIComponent(ref)}`, { method: 'DELETE' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

// ─── Avisos de partners (depósito/transporte proponen, el equipo confirma) ──
// Contrato: src/lib/partnerAvisos.ts · Spec: docs/superpowers/specs/2026-09-01-partner-hoy-avisos-design.md

/** Partner: sus avisos (30 días). Admin/owner: pendientes + resueltos de 7 días.
 *  Si la entidad `partner-avisos` todavía no existe en el deploy (404 = W1 sin
 *  mergear), se trata como "sin avisos": la card de HOY no muestra error ni se
 *  renderiza. Cualquier otro error sí se propaga. */
export async function fetchPartnerAvisos(): Promise<import('./partnerAvisos').PartnerAviso[]> {
  const res = await authFetch('/api/data/partner-avisos')
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.avisos || []
}

/** Partner: proponer una acción sobre una carga de su alcance. Devuelve el aviso
 *  (el pendiente ya existente si volvió a apretar). */
export async function crearPartnerAviso(input: import('./partnerAvisos').NuevoPartnerAviso): Promise<import('./partnerAvisos').PartnerAviso> {
  const res = await authFetch('/api/data/partner-avisos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.aviso
}

/** Partner: DESHACER un aviso propio que sigue pendiente (Brian 03/09: "que el
 *  depósito pueda deshacer una acción si se equivoca"). No borra nada: el aviso
 *  queda 'cancelado' y el equipo lo sigue viendo. El server revalida los dos
 *  candados (que sea suyo y que siga pendiente): si el equipo ya lo confirmó
 *  devuelve 409 con el mensaje que hay que mostrarle tal cual al partner. */
export async function cancelarPartnerAviso(id: string): Promise<import('./partnerAvisos').PartnerAviso> {
  const res = await authFetch(`/api/data/partner-avisos?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.aviso
}

/** Admin/owner: confirmar (ejecuta la acción real) o rechazar (con motivo). */
export async function resolverPartnerAviso(id: string, accion: 'confirmar' | 'rechazar', motivo?: string): Promise<import('./partnerAvisos').PartnerAviso> {
  const res = await authFetch(`/api/data/partner-avisos?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(motivo ? { accion, motivo } : { accion }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.aviso
}
