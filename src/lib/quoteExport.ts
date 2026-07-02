/**
 * Export helper for the Cotizaciones tab.
 *
 * Generates a CSV blob with the current filtered list and triggers a download.
 * Uses CSV (not XLSX) to keep the bundle slim — no extra dependency. Excel
 * opens CSV files cleanly out of the box and so does Google Sheets.
 */

import type { QuoteFormData } from './quotationTypes'
import { getConvertedRef } from './quotationTypes'
import { getBrand } from './brand'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  responded: 'Respondida',
  won: 'Ganada',
  lost: 'Perdida',
  spam: 'Spam',
}

function csvEscape(v: string | number | undefined | null): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  // Wrap in quotes if it contains comma, quote, newline, or starts with =
  if (/[",\n\r]/.test(s) || s.startsWith('=')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function fmtTimestamp(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function buildQuotesCsv(quotes: QuoteFormData[]): string {
  const headers = [
    'ID',
    'Fecha',
    'Estado',
    'Nombre',
    'Email',
    'Teléfono',
    'Idioma',
    'Tipo de carga',
    'Origen',
    'Destino',
    'Detalle',
    'Convertida en REF',
    'Cantidad de notas',
    'Última nota',
  ]

  const rows = quotes.map(q => {
    const lastNote = q.notes && q.notes.length > 0
      ? q.notes
          .filter(n => n.kind !== 'conversion')
          .slice(-1)[0]?.text || ''
      : ''
    return [
      q.id,
      fmtTimestamp(q.timestamp),
      STATUS_LABELS[q.status] || q.status,
      q.name,
      q.email,
      q.phone,
      q.language || 'es',
      q.cargoType,
      q.origin,
      q.destination,
      q.details,
      getConvertedRef(q.notes) || '',
      q.notes?.length ?? 0,
      lastNote,
    ].map(csvEscape).join(',')
  })

  // BOM so Excel detects UTF-8 correctly
  return '﻿' + [headers.map(csvEscape).join(','), ...rows].join('\n')
}

export function downloadQuotesCsv(quotes: QuoteFormData[], filename = `cotizaciones-${getBrand().id}.csv`): void {
  const csv = buildQuotesCsv(quotes)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
