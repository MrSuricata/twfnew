import { ParsedShipment } from './shipmentTypes'
import { QuoteFormData } from './quotationTypes'

export function exportToCSV(data: any[], filename: string) {
  if (!data || data.length === 0) {
    return
  }

  const headers = Object.keys(data[0])
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header]
        if (value === null || value === undefined) return ''
        const stringValue = String(value)
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`
        }
        return stringValue
      }).join(',')
    )
  ].join('\n')

  // BOM: sin esto Excel en Windows muestra mojibake en los acentos (Aéreo → AÃ©reo)
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function exportShipmentsToExcel(shipments: ParsedShipment[], filename: string = 'shipments.csv') {
  const exportData = shipments.map(s => ({
    REF: s.REF,
    CLIENTE: s.CLIENTE,
    ETD: s.ETD,
    ETA: s.ETA,
    FT: s.FT,
    LIBRE_HASTA: s.LIBRE_HASTA,
    CNTR: s.CNTR,
    N: s.N,
    MBL: s.MBL,
    LINEA: s.LINEA,
    BUQUE: s.BUQUE,
    TERMINAL: s.TERMINAL,
    C_TERMINAL: s.C_TERMINAL,
    C_DEV: s.C_DEV,
    LOCALES: s.LOCALES,
    FLETE: s.FLETE,
    FORMA_DE_PAGO: s.FORMA_DE_PAGO,
    VTO: s.VTO,
    CR: s.CR ? 'Sí' : 'No',
    BL: s.BL ? 'Sí' : 'No',
    AD: s.AD ? 'Sí' : 'No',
    AT: s.AT ? 'Sí' : 'No'
  }))
  
  exportToCSV(exportData, filename)
}

export function exportQuotesToExcel(quotes: QuoteFormData[], filename: string = 'quotes.csv') {
  const exportData = quotes.map(q => ({
    ID: q.id,
    Fecha: new Date(q.timestamp).toLocaleDateString(),
    Nombre: q.name,
    Email: q.email,
    Telefono: q.phone,
    TipoCarga: q.cargoType,
    Origen: q.origin,
    Destino: q.destination,
    Detalles: q.details,
    Estado: q.status,
    Notas: q.notes.length
  }))
  
  exportToCSV(exportData, filename)
}
