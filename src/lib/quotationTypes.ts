export type QuoteStatus = 'pending' | 'responded' | 'won' | 'lost' | 'spam'

export type QuoteNoteKind = 'note' | 'conversion'

export interface QuoteNote {
  id: string
  text: string
  createdAt: number
  createdBy: string
  /** Optional. Defaults to 'note'. 'conversion' = audit-trail entry recording
   * that this quote was converted into a shipment with a specific REF. */
  kind?: QuoteNoteKind
}

/** Helper: extract the last REF that this quote was converted into, if any. */
export function getConvertedRef(notes: QuoteNote[] | undefined): string | null {
  if (!notes || notes.length === 0) return null
  for (let i = notes.length - 1; i >= 0; i--) {
    if (notes[i].kind === 'conversion' && notes[i].text) return notes[i].text
  }
  return null
}

export interface QuoteFormData {
  id: string
  name: string
  email: string
  phone: string
  cargoType: string
  origin: string
  destination: string
  details: string
  timestamp: number
  status: QuoteStatus
  notes: QuoteNote[]
  language?: string
}

export interface ClientAccount {
  id: string
  /** Email de CONTACTO del cliente (opcional, '' si no hay). El login del
   *  portal es por client_users (email+contraseña por usuario), no por acá. */
  email: string
  name: string
  company: string
  createdAt: number
  clientePattern: string
  // ── Datos legales del catálogo (todos opcionales) ──
  razonSocial?: string
  cuitDoc?: string
  pais?: string
  direccion?: string
  /** Otras formas en que el cliente aparece escrito en las cargas, separadas por coma. */
  aliases?: string
  // ── Digest lunes/jueves (spec 2026-08-27) ──
  /** Recibe el mail automático con el estado de sus cargas vía Montevideo. */
  digestActive?: boolean
  /** Destinatarios del digest separados por coma; vacío = usa el email principal. */
  digestEmails?: string
}

/** Usuario del portal de clientes (tabla client_users) — email + contraseña. */
export interface ClientPortalUser {
  id: string
  clientId: string
  email: string
  name: string
  active: boolean
  createdAt?: string
  lastLogin?: string | null
}

export interface ShipmentDocument {
  id: string
  shipmentRef: string
  name: string
  type: string
  uploadedAt: number
  uploadedBy: string
  url?: string
  data?: string
}

export type PhotoLocation = 'origen' | 'uruguay'

export interface OriginPhoto {
  id: string                  // "photo-{timestamp}-{index}"
  shipmentRef: string         // "A7039"
  containerNumber?: string    // "MSCU1234567"
  caption?: string            // optional description
  photoType?: PhotoLocation   // 'origen' = loaded at origin, 'uruguay' = unloaded in UY
  fileName: string            // "IMG_2034.jpg"
  fileType: string            // "image/jpeg"
  fileData?: string           // base64 full (only in upload/download, NOT bulk)
  thumbnailData?: string      // base64 mini (~50KB, included in listings)
  storagePath?: string | null
  thumbPath?: string | null
  thumbnailUrl?: string | null   // signed URL (reemplaza thumbnailData cuando está migrada)
  fullUrl?: string | null        // signed URL del full (single fetch)
  createdAt: number
  createdBy: string
}

export type NotificationStep = 'departure' | 'border' | 'fiscal'
export type NotificationStatus = 'pending' | 'completed' | 'skipped'

export interface NotificationTask {
  id: string                    // "ntask-{REF}-{CNTR}-{step}"
  shipmentRef: string
  containerNumber: string
  operativa: string             // "CONTENEDOR" | "TRASIEGO" | "CARGA A PISO" | "DESCONSOLIDACION"
  cliente: string               // "CHIAPERO LTDA" (from shipment)
  clientEmail: string           // resolved from clients table
  clientName: string
  step: NotificationStep
  stepNumber: number            // 0=departure, 1=border, 2=fiscal
  dueDate: string               // YYYY-MM-DD
  salidaDate: string

  photosOk: boolean             // only relevant for departure
  reportOk: boolean             // only relevant for departure
  emailSent: boolean
  emailSentAt?: string
  emailThreadId?: string        // Gmail thread ID for reply chaining
  emailSubject?: string         // Subject used in first email

  status: NotificationStatus
  notes: string
  createdAt: string
  updatedAt: string
}

export interface OperativeReport {
  id: string
  shipmentRef: string
  containerNumber?: string  // optional: specific container (e.g. "MSCU1234567")
  title: string
  content: string          // optional text description/notes
  fileName: string         // original file name (e.g. "informe-A7039.pdf")
  fileType: string         // mime type (e.g. "application/pdf")
  fileData?: string        // base64 data URL for the file (only in memory/localStorage, NOT bulk-synced)
  createdAt: number
  createdBy: string
}
