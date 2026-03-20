// ─── Data Client ─────────────────────────────────────────────────────
// Functions to read/write shared data via the Supabase-backed API.
// Uses authFetch for admin-authenticated requests.
// Falls back gracefully so the app works even without Supabase.
// ─────────────────────────────────────────────────────────────────────

import { authFetch } from './authClient'
import type { QuoteFormData, ClientAccount, ShipmentDocument, OperativeReport, OriginPhoto, NotificationTask, NotificationStep } from './quotationTypes'
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

/** Fetch notification tasks by range: 'today' | 'overdue' | 'pending' | 'all' */
export async function fetchNotificationTasks(range: string = 'pending'): Promise<NotificationTask[]> {
  const res = await authFetch(`/api/data/notification-tasks?range=${range}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.tasks || []
}

/** Update a notification task field (checkbox toggle, status change). */
export async function updateNotificationTask(id: string, updates: Partial<NotificationTask>): Promise<void> {
  const res = await authFetch(`/api/data/notification-tasks?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

/** Confirm a shipment event (creates a notification task). */
export async function confirmShipmentEvent(shipmentRef: string, containerNumber: string, step: NotificationStep, salidaDate?: string, operativa?: string): Promise<NotificationTask> {
  const res = await authFetch('/api/notifications/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shipmentRef, containerNumber, step, salidaDate, operativa }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.task
}

/** Send a notification email via n8n webhook. Supports attachments and thread chaining. */
export async function sendNotificationEmail(taskId: string, emailData: { to: string; subject: string; htmlBody: string; replyTo?: string; threadId?: string; attachments?: { name: string; type: string; data: string }[] }): Promise<void> {
  const res = await authFetch('/api/notifications/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, ...emailData }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
}

/** Skip/dismiss a notification task. */
export async function skipNotificationTask(id: string): Promise<void> {
  await updateNotificationTask(id, { status: 'skipped' as any })
}

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

/**
 * Save a client email inline from the notification checklist.
 * Updates existing client or creates a new one with clientePattern = CLIENTE value.
 */
export async function saveClientEmailInline(clienteValue: string, email: string): Promise<void> {
  try {
    const clients = await fetchClients()
    const clienteUpper = clienteValue.toUpperCase().trim()

    // Find existing client whose pattern matches this CLIENTE
    const existing = clients.find(c => {
      const patterns = (c.clientePattern || '').toUpperCase().split(',').map(p => p.trim()).filter(Boolean)
      return patterns.some(p => clienteUpper.includes(p))
    })

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

// ── Bulk Load (load all admin data in parallel) ──

export interface AdminData {
  shipments: ParsedShipment[]
  quotes: QuoteFormData[]
  documents: ShipmentDocument[]
  reports: OperativeReport[]
  originPhotos: OriginPhoto[]
  clients: ClientAccount[]
  syncedAt: string | null
}

export async function loadAdminData(): Promise<AdminData> {
  const [shipmentsRes, quotes, documents, reports, originPhotos, clients] = await Promise.all([
    fetchShipmentsFromDB(),
    fetchQuotes(),
    fetchDocuments(),
    fetchReports(),
    fetchOriginPhotos(),
    fetchClients(),
  ])

  return {
    shipments: shipmentsRes.shipments,
    quotes,
    documents,
    reports,
    originPhotos,
    clients,
    syncedAt: shipmentsRes.syncedAt,
  }
}
