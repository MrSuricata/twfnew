export type QuoteStatus = 'pending' | 'responded' | 'won' | 'lost'

export interface QuoteNote {
  id: string
  text: string
  createdAt: number
  createdBy: string
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
  email: string
  // password field removed — auth is via OTP, no passwords stored
  name: string
  company: string
  createdAt: number
  clientePattern: string
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

export interface OriginPhoto {
  id: string                  // "photo-{timestamp}-{index}"
  shipmentRef: string         // "A7039"
  containerNumber?: string    // "MSCU1234567"
  caption?: string            // optional description
  fileName: string            // "IMG_2034.jpg"
  fileType: string            // "image/jpeg"
  fileData?: string           // base64 full (only in upload/download, NOT bulk)
  thumbnailData?: string      // base64 mini (~50KB, included in listings)
  createdAt: number
  createdBy: string
}

export type NotificationStep = 'departure' | 'border' | 'fiscal'
export type NotificationStatus = 'pending' | 'completed' | 'skipped'

export interface NotificationTask {
  id: string                    // "ntask-{REF}-{CNTR}-{step}"
  shipmentRef: string
  containerNumber: string
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
