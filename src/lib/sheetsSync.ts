/**
 * sheetsSync.ts — Shared Google Sheets sync functions.
 * Extracted from ExcelImport so both ExcelImport and App.tsx
 * can use them for manual and background auto-sync.
 */

import {
  ShipmentRecord,
  ParsedShipment,
  OperativasRecord
} from '@/lib/shipmentTypes'

// ─── CSV Parsing (RFC 4180 compliant) ────────────────────────────────

export function parseCSVRows(csv: string): string[][] {
  const rows: string[][] = []
  let current = ''
  let inQuotes = false
  const row: string[] = []

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i]

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < csv.length && csv[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && i + 1 < csv.length && csv[i + 1] === '\n') {
          i++
        }
        current += ' '
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        row.push(current.trim())
        current = ''
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && i + 1 < csv.length && csv[i + 1] === '\n') {
          i++
        }
        row.push(current.trim())
        if (row.some(v => v !== '')) {
          rows.push([...row])
        }
        row.length = 0
        current = ''
      } else {
        current += char
      }
    }
  }

  row.push(current.trim())
  if (row.some(v => v !== '')) {
    rows.push([...row])
  }

  return rows
}

// ─── Number / Date Parsing ───────────────────────────────────────────

export function parseEuropeanNumber(value: string): number {
  if (!value || value.trim() === '' || value === '#N/A') return 0
  const cleaned = value.trim().replace(/\./g, '').replace(',', '.')
  return parseFloat(cleaned) || 0
}

export function parseDate(dateStr: string): string {
  if (!dateStr || dateStr.trim() === '') return ''

  const cleaned = dateStr.trim().replace(/"/g, '')

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(cleaned)) {
    const parts = cleaned.split('/')
    const day = parts[0].padStart(2, '0')
    const month = parts[1].padStart(2, '0')
    let year = parts[2]

    if (year.length === 2) {
      year = parseInt(year) > 50 ? `19${year}` : `20${year}`
    }

    return `${year}-${month}-${day}`
  }

  try {
    const date = new Date(cleaned)
    if (!isNaN(date.getTime())) {
      // Use local date parts to avoid UTC timezone shift
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
  } catch {
    return cleaned
  }

  return cleaned
}

// ─── Operativas Sheet Parsing ────────────────────────────────────────

/**
 * Normalize Operativas REF: strip trailing " 1", " 2", " 3" suffixes.
 * e.g. "A6749 1" → "A6749", "A6749 2" → "A6749", "A6749" → "A6749"
 */
function normalizeOpRef(raw: string): string {
  return raw.replace(/\s+\d+$/, '').trim()
}

/**
 * Extract base REF from a main-sheet REF that may have text suffixes.
 * e.g. "A7452 DIRECT" → "A7452", "LCL11510" → "LCL11510", "A6424" → "A6424"
 * Used as fallback when exact REF match fails during operativas merge.
 */
function extractBaseRef(ref: string): string {
  return ref.split(/\s+/)[0] || ref
}

export function parseOperativasData(csvData: string): Map<string, OperativasRecord[]> {
  const rows = parseCSVRows(csvData)
  const opMap = new Map<string, OperativasRecord[]>()

  if (rows.length < 2) return opMap

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const rawRef = r[0]?.trim()
    if (!rawRef) continue

    // Normalize: "A6749 1" → "A6749" so it matches the main sheet REF
    const ref = normalizeOpRef(rawRef)

    const record: OperativasRecord = {
      REF: ref,
      TLX: r[1]?.trim() || '',
      DEPOSITO: r[2]?.trim() || '',
      ETA_OP: parseDate(r[3]?.trim() || ''),
      SALIDA: parseDate(r[4]?.trim() || ''),
      ETA_FISC: parseDate(r[5]?.trim() || ''),
      LIBRE: parseDate(r[6]?.trim() || ''),
      OPERATIVA: r[7]?.trim() || '',
      CNTR_OP: r[8]?.trim() || '',
      PKGS: parseInt(r[9]?.trim() || '0') || 0,
      KG: parseEuropeanNumber(r[10]?.trim() || ''),
      M3: parseEuropeanNumber(r[11]?.trim() || ''),
      DESCRIPCION: r[12]?.trim() || '',
      FISCAL: r[13]?.trim() || '',
      DESCARGA: parseDate(r[14]?.trim() || ''),
      DEV: parseDate(r[15]?.trim() || ''),
      CLIENTE_OP: r[16]?.trim() || '',
      TIPO: r[17]?.trim() || '',
      WOOD: r[18]?.trim() || '',
      TRANSPORTE: r[19]?.trim() || '',
      HORARIO: r[20]?.trim() || ''
    }

    const existing = opMap.get(ref)
    if (existing) {
      existing.push(record)
    } else {
      opMap.set(ref, [record])
    }
  }

  return opMap
}

// ─── Main Sheet Parsing ──────────────────────────────────────────────

export function parseMainSheetCSV(csvData: string): Partial<ShipmentRecord>[] {
  const rows = parseCSVRows(csvData)
  if (rows.length < 2) return []

  const headers = rows[0]
  const records: Partial<ShipmentRecord>[] = []

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i]
    if (values.length === 0 || values.every(v => v === '')) continue

    const record: Partial<ShipmentRecord> = {}

    headers.forEach((header, index) => {
      const value = values[index] || ''
      const normalizedHeader = header.trim().toUpperCase().replace(/\s+/g, '_').replace(/\./g, '').replace(/°/g, '')

      switch (normalizedHeader) {
        case 'REF':
        case 'REFERENCIA':
          record.REF = value.trim()
          break
        case 'CLIENTE':
        case 'CLIENT':
          record.CLIENTE = value.trim()
          break
        case 'ETD':
        case 'LAST_ETD':
          if (!record.ETD) record.ETD = parseDate(value)
          break
        case 'ETA':
        case 'LAST_ETA':
          if (!record.ETA) record.ETA = parseDate(value)
          break
        case 'FT':
        case 'FREE_TIME':
          record.FT = parseInt(value) || 0
          break
        case 'LIBRE_HASTA':
        case 'FREE_UNTIL':
          record.LIBRE_HASTA = parseDate(value)
          break
        case 'CNTR':
        case 'CONTAINER':
        case 'CONTENEDOR':
        case 'CONTENEDORES':
          record.CNTR = value.trim()
          break
        case 'N':
        case 'NUM':
        case 'CANTIDAD': {
          const parsed = parseInt(value)
          record.N = isNaN(parsed) ? 0 : parsed
          break
        }
        case 'MBL':
        case 'MASTER':
          record.MBL = value.trim()
          break
        case 'LINEA':
        case 'LÍNEA':
        case 'LINE':
        case 'SHIPPING_LINE':
          record.LINEA = value.trim()
          break
        case 'BUQUE':
        case 'VESSEL':
        case 'SHIP':
          record.BUQUE = value.trim()
          break
        case 'TERMINAL':
        case 'TERMIN':
        case 'PORT':
        case 'PUERTO':
          record.TERMINAL = value.trim()
          break
        case 'C_TERMINAL':
        case 'CTERMINAL':
        case 'COST_TERMINAL':
          record.C_TERMINAL = parseEuropeanNumber(value)
          break
        case 'C_DEV':
        case 'CDEV':
        case 'COST_DEV':
          record.C_DEV = parseEuropeanNumber(value)
          break
        case 'LOCALES':
        case 'LOCAL':
          record.LOCALES = parseEuropeanNumber(value)
          break
        case 'FLETE':
        case 'FREIGHT':
          record.FLETE = parseEuropeanNumber(value)
          break
        case 'FORMA_DE_PAGO':
        case 'FORMA_PAGO':
        case 'PAYMENT_FORM': {
          const formaPago = value.toLowerCase().trim()
          if (formaPago.includes('programado')) record.FORMA_DE_PAGO = 'programado'
          else if (formaPago.includes('c corriente') || formaPago.includes('cuenta corriente')) record.FORMA_DE_PAGO = 'cuenta corriente'
          else if (formaPago.includes('arribo')) record.FORMA_DE_PAGO = 'al arribo'
          else record.FORMA_DE_PAGO = 'al arribo'
          break
        }
        case 'VTO':
          record.VTO = parseDate(value)
          break
        case 'CR':
          record.CR = value.toUpperCase() === 'TRUE' || value === '1' || value.toLowerCase() === 'sí' || value.toLowerCase() === 'si'
          break
        case 'BL':
          record.BL = value.toUpperCase() === 'TRUE' || value === '1' || value.toLowerCase() === 'sí' || value.toLowerCase() === 'si'
          break
        case 'AD':
          record.AD = value.toUpperCase() === 'TRUE' || value === '1' || value.toLowerCase() === 'sí' || value.toLowerCase() === 'si'
          break
        case 'AT':
          record.AT = value.toUpperCase() === 'TRUE' || value === '1' || value.toLowerCase() === 'sí' || value.toLowerCase() === 'si'
          break
        case 'SAL':
        case 'STATUS':
        case 'LAST_STATUS':
        case 'ASUNTO':
        case 'LAST_EMAIL_DATE':
          break
      }
    })

    if (record.REF && record.CLIENTE) {
      records.push(record)
    }
  }

  return records
}

// ─── Merge Operativas into Shipments ─────────────────────────────────

export function mergeOperativasData(shipments: ParsedShipment[], opMap: Map<string, OperativasRecord[]>): ParsedShipment[] {
  if (opMap.size === 0) return shipments
  return shipments.map(s => {
    // Try exact match first, then fallback to base REF (handles "A7452 DIRECT" → "A7452")
    const ops = opMap.get(s.REF) || opMap.get(extractBaseRef(s.REF))
    if (!ops || ops.length === 0) return s

    const libre = ops.find(o => o.LIBRE)?.LIBRE || ''

    return {
      ...s,
      operativas: ops,
      ...(libre ? { LIBRE_HASTA: libre, calculatedLibreHasta: libre } : {})
    }
  })
}

// ─── Build CSV export URL from Google Sheets URL ─────────────────────

export function buildCsvUrl(sheetsUrl: string): string {
  if (sheetsUrl.includes('/edit')) {
    const sheetId = sheetsUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1]
    if (!sheetId) throw new Error('URL de Google Sheets inválida')
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`
  }
  return sheetsUrl
}

// ─── Shipment Filtering (Uruguay-only system) ───────────────────────

// Terminals outside Uruguay → exclude
const EXCLUDED_TERMINAL_KEYWORDS = ['CHILE', 'BUENOS AIRES']

// Manually excluded REFs (already resolved outside the system)
// Excluded refs loaded from localStorage only (admin-configurable)
const HARDCODED_EXCLUDED_REFS: string[] = []

/**
 * Filter out shipments that don't belong in the Uruguay tracking system.
 * - Removes shipments with terminals in Chile or Buenos Aires
 * - Removes manually excluded REFs (hardcoded + localStorage list)
 */
export function filterShipments(shipments: ParsedShipment[]): ParsedShipment[] {
  // Load additional excluded refs from localStorage (admin-configurable)
  let extraExcluded: string[] = []
  try {
    const stored = localStorage.getItem('twf-excluded-refs')
    if (stored) extraExcluded = JSON.parse(stored)
  } catch { /* ignore */ }

  const allExcludedRefs = new Set([...HARDCODED_EXCLUDED_REFS, ...extraExcluded.map(r => r.trim().toUpperCase())])

  return shipments.filter(s => {
    // Exclude specific REFs
    if (allExcludedRefs.has(s.REF.toUpperCase())) return false

    // Exclude non-Uruguay terminals
    const terminal = s.TERMINAL.toUpperCase()
    if (EXCLUDED_TERMINAL_KEYWORDS.some(kw => terminal.includes(kw))) return false

    // Also check DEPOSITO field from operativas (some have DEPOSITO = "TERMINAL CHILE")
    const ops = s.operativas || []
    if (ops.length > 0) {
      const deposito = ops[0].DEPOSITO.toUpperCase()
      if (EXCLUDED_TERMINAL_KEYWORDS.some(kw => deposito.includes(kw))) return false
    }

    return true
  })
}

