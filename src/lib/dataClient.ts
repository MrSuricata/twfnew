// ─── Data Client ─────────────────────────────────────────────────────
// Functions to read/write shared data via the Supabase-backed API.
// Uses authFetch for admin-authenticated requests.
// Falls back gracefully so the app works even without Supabase.
// ─────────────────────────────────────────────────────────────────────

import { authFetch } from './authClient'
import type { QuoteFormData, ShipmentDocument, OperativeReport } from './quotationTypes'
import type { ParsedShipment } from './shipmentTypes'

// ── Shipments (cached from Google Sheets sync) ──

export async function fetchShipmentsFromDB(): Promise<{ shipments: ParsedShipment[]; syncedAt: string | null }> {
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

export async function fetchReports(): Promise<OperativeReport[]> {
  const res = await authFetch('/api/data/reports')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.reports || []
}

export async function saveReports(reports: OperativeReport[]): Promise<void> {
  const res = await authFetch('/api/data/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reports),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
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

// ── Bulk Load (load all admin data in parallel) ──

export interface AdminData {
  shipments: ParsedShipment[]
  quotes: QuoteFormData[]
  documents: ShipmentDocument[]
  reports: OperativeReport[]
  syncedAt: string | null
}

export async function loadAdminData(): Promise<AdminData> {
  const [shipmentsRes, quotes, documents, reports] = await Promise.all([
    fetchShipmentsFromDB(),
    fetchQuotes(),
    fetchDocuments(),
    fetchReports(),
  ])

  return {
    shipments: shipmentsRes.shipments,
    quotes,
    documents,
    reports,
    syncedAt: shipmentsRes.syncedAt,
  }
}
