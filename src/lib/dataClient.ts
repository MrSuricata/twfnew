// ─── Data Client ─────────────────────────────────────────────────────
// Functions to read/write shared data via the Supabase-backed API.
// Uses authFetch for admin-authenticated requests.
// Falls back gracefully so the app works even without Supabase.
// ─────────────────────────────────────────────────────────────────────

import { authFetch } from './authClient'
import type { QuoteFormData, ClientAccount, ShipmentDocument, OperativeReport, OriginPhoto } from './quotationTypes'
import type { ParsedShipment } from './shipmentTypes'
import { applyWebEdits } from './shipmentTypes'
import type { Truck, TruckLoad, LclAirShipment } from './truckTypes'
import type { BillingRecord } from './billingTypes'
import type { Operator, OperatorAssignment, DbShipment } from './operationsTypes'
import { matchesPattern } from './clientMatching'

// ── Shipments FCL (espejo en `shipments` → fallback cache JSON) ──
// Etapa 2 de la migración: la fuente primaria de las FCL es el ESPEJO en la
// tabla `shipments` (filas source='sheet', columna sheet_raw = ParsedShipment
// completo). Mismos objetos que el cache → toda la lógica derivada (estado,
// LIBRE, facturación, Solo activas) funciona idéntica. Si el espejo todavía
// no tiene sheet_raw (falta un sync) o falla, se cae al cache como siempre.

export async function fetchShipmentsFromDB(): Promise<{ shipments: ParsedShipment[]; syncedAt: string | null }> {
  try {
    const res = await authFetch('/api/data/shipments?includeMirror=only')
    if (res.ok) {
      const data = await res.json()
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
  return data.photo?.fileData || null
}

/** Fetch origin photos for the current client (filtered by their shipments). */
export async function fetchClientOriginPhotos(): Promise<OriginPhoto[]> {
  const res = await authFetch('/api/client/origin-photos')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.photos || []
}

// ── Notification Tasks ──
// The old task-based workflow (confirm → send email → mark completed) was replaced
// in 2026-04 with the HOY dashboard (see TodayDashboard.tsx + todayFilters.ts) +
// a daily Telegram summary. The API endpoints below were removed:
//   - POST /api/notifications/confirm
//   - POST /api/notifications/send-email
// The notification_tasks table is kept for historical audit; no new rows are written.

// ── Clients ──

export async function fetchClients(): Promise<ClientAccount[]> {
  const res = await authFetch('/api/data/clients')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return (data.clients || []).map((c: any) => ({
    id: c.id,
    email: c.email,
    name: c.name,
    company: c.company,
    createdAt: c.created_at_ts || c.createdAt,
    clientePattern: c.cliente_pattern || c.clientePattern || '',
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
 * Admin-only: request a client session token for the given email without
 * going through the OTP flow. Used to "view portal as client X" for QA/debug.
 * Returns the same shape as /api/auth/otp verify: { token, role, email, name, company }.
 */
export async function impersonateClient(email: string): Promise<{
  token: string
  role: 'client'
  email: string
  name: string
  company: string
}> {
  const res = await authFetch('/api/auth/impersonate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
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
