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
  password?: string
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

export interface OperativeReport {
  id: string
  shipmentRef: string
  title: string
  content: string          // optional text description/notes
  fileName: string         // original file name (e.g. "informe-A7039.pdf")
  fileType: string         // mime type (e.g. "application/pdf")
  fileData?: string        // base64 data URL for the file
  createdAt: number
  createdBy: string
}
