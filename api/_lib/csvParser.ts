/**
 * csvParser.ts — Server-side CSV parsing for Google Sheets data.
 * Self-contained: all types and parsing logic needed by serverless endpoints.
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface OperativasRecord {
  REF: string
  TLX: string
  DEPOSITO: string
  ETA_OP: string
  SALIDA: string
  ETA_FISC: string
  LIBRE: string
  OPERATIVA: string
  CNTR_OP: string
  PKGS: number
  KG: number
  M3: number
  DESCRIPCION: string
  FISCAL: string
  DESCARGA: string
  DEV: string
  CLIENTE_OP: string
  TIPO: string
  WOOD: string
  TRANSPORTE: string
  HORARIO: string
}

export interface ShipmentRecord {
  REF: string
  CLIENTE: string
  ETD: string
  ETA: string
  FT: number
  LIBRE_HASTA: string
  CNTR: string
  N: number
  MBL: string
  LINEA: string
  BUQUE: string
  TERMINAL: string
  C_TERMINAL: number
  C_DEV: number
  LOCALES: number
  FLETE: number
  FORMA_DE_PAGO: 'programado' | 'cuenta corriente' | 'al arribo'
  VTO: string
  CR: boolean
  BL: boolean
  AD: boolean
  AT: boolean
}

export interface Container {
  number: string
  valid: boolean
}

export interface ParsedShipment extends ShipmentRecord {
  containers: Container[]
  calculatedN: number
  calculatedLibreHasta: string
  operativas?: OperativasRecord[]
}

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

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned

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

// ─── Container Parsing ──────────────────────────────────────────────

const CONTAINER_PATTERN = /^[A-Z]{4}[0-9]{7}$/

export function parseContainers(cntrString: string): Container[] {
  if (!cntrString || cntrString.trim() === '') return []
  return cntrString.split(/[,\s]+/).filter(p => p.trim() !== '').map(p => ({
    number: p.trim(),
    valid: CONTAINER_PATTERN.test(p.trim())
  }))
}

export function calculateLibreHasta(eta: string, ft: number): string {
  if (!eta || !ft) return ''
  try {
    const etaDate = new Date(eta)
    if (isNaN(etaDate.getTime())) return ''
    etaDate.setDate(etaDate.getDate() + ft)
    return etaDate.toISOString().split('T')[0]
  } catch {
    return ''
  }
}

export function processShipmentRecord(record: Partial<ShipmentRecord>): ParsedShipment {
  const containers = parseContainers(record.CNTR || '')
  const calculatedN = containers.length > 0 ? containers.length : (record.N || 0)

  let libreHasta = record.LIBRE_HASTA || ''
  if (!libreHasta && record.ETA && record.FT) {
    libreHasta = calculateLibreHasta(record.ETA, record.FT)
  }

  return {
    REF: record.REF || '',
    CLIENTE: record.CLIENTE || '',
    ETD: record.ETD || '',
    ETA: record.ETA || '',
    FT: record.FT || 0,
    LIBRE_HASTA: libreHasta,
    CNTR: record.CNTR || '',
    N: calculatedN,
    MBL: record.MBL || '',
    LINEA: record.LINEA || '',
    BUQUE: record.BUQUE || '',
    TERMINAL: record.TERMINAL || '',
    C_TERMINAL: record.C_TERMINAL || 0,
    C_DEV: record.C_DEV || 0,
    LOCALES: record.LOCALES || 0,
    FLETE: record.FLETE || 0,
    FORMA_DE_PAGO: record.FORMA_DE_PAGO || 'al arribo',
    VTO: record.VTO || '',
    CR: record.CR || false,
    BL: record.BL || false,
    AD: record.AD || false,
    AT: record.AT || false,
    containers,
    calculatedN,
    calculatedLibreHasta: libreHasta
  }
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
      const nh = header.trim().toUpperCase().replace(/\s+/g, '_').replace(/\./g, '').replace(/°/g, '')

      switch (nh) {
        case 'REF': case 'REFERENCIA':
          record.REF = value.trim(); break
        case 'CLIENTE': case 'CLIENT':
          record.CLIENTE = value.trim(); break
        case 'ETD': case 'LAST_ETD':
          if (!record.ETD) record.ETD = parseDate(value); break
        case 'ETA': case 'LAST_ETA':
          if (!record.ETA) record.ETA = parseDate(value); break
        case 'FT': case 'FREE_TIME':
          record.FT = parseInt(value) || 0; break
        case 'LIBRE_HASTA': case 'FREE_UNTIL':
          record.LIBRE_HASTA = parseDate(value); break
        case 'CNTR': case 'CONTAINER': case 'CONTENEDOR': case 'CONTENEDORES':
          record.CNTR = value.trim(); break
        case 'N': case 'NUM': case 'CANTIDAD':
          record.N = parseInt(value) || 0; break
        case 'MBL': case 'MASTER':
          record.MBL = value.trim(); break
        case 'LINEA': case 'LÍNEA': case 'LINE': case 'SHIPPING_LINE':
          record.LINEA = value.trim(); break
        case 'BUQUE': case 'VESSEL': case 'SHIP':
          record.BUQUE = value.trim(); break
        case 'TERMINAL': case 'TERMIN': case 'PORT': case 'PUERTO':
          record.TERMINAL = value.trim(); break
        case 'C_TERMINAL': case 'CTERMINAL': case 'COST_TERMINAL':
          record.C_TERMINAL = parseEuropeanNumber(value); break
        case 'C_DEV': case 'CDEV': case 'COST_DEV':
          record.C_DEV = parseEuropeanNumber(value); break
        case 'LOCALES': case 'LOCAL':
          record.LOCALES = parseEuropeanNumber(value); break
        case 'FLETE': case 'FREIGHT':
          record.FLETE = parseEuropeanNumber(value); break
        case 'FORMA_DE_PAGO': case 'FORMA_PAGO': case 'PAYMENT_FORM': {
          const fp = value.toLowerCase().trim()
          if (fp.includes('programado')) record.FORMA_DE_PAGO = 'programado'
          else if (fp.includes('c corriente') || fp.includes('cuenta corriente')) record.FORMA_DE_PAGO = 'cuenta corriente'
          else record.FORMA_DE_PAGO = 'al arribo'
          break
        }
        case 'VTO':
          record.VTO = parseDate(value); break
        case 'CR':
          record.CR = value.toUpperCase() === 'TRUE' || value === '1' || value.toLowerCase() === 'si'; break
        case 'BL':
          record.BL = value.toUpperCase() === 'TRUE' || value === '1' || value.toLowerCase() === 'si'; break
        case 'AD':
          record.AD = value.toUpperCase() === 'TRUE' || value === '1' || value.toLowerCase() === 'si'; break
        case 'AT':
          record.AT = value.toUpperCase() === 'TRUE' || value === '1' || value.toLowerCase() === 'si'; break
      }
    })

    if (record.REF && record.CLIENTE) {
      records.push(record)
    }
  }

  return records
}

// ─── Operativas Parsing ─────────────────────────────────────────────

const OPERATIVAS_GID = '1133111465'

export function buildCsvUrl(sheetsUrl: string): string {
  if (sheetsUrl.includes('/edit')) {
    const sheetId = sheetsUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1]
    if (!sheetId) throw new Error('Invalid Google Sheets URL')
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`
  }
  return sheetsUrl
}

export function buildOperativasUrl(baseUrl: string): string | null {
  try {
    if (baseUrl.includes('/edit')) {
      const sheetId = baseUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1]
      if (!sheetId) return null
      return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${OPERATIVAS_GID}`
    }
    const url = new URL(baseUrl)
    url.searchParams.set('gid', OPERATIVAS_GID)
    return url.toString()
  } catch {
    return null
  }
}

function normalizeOpRef(raw: string): string {
  return raw.replace(/\s+\d+$/, '').trim()
}

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

// ─── Merge + Filter ─────────────────────────────────────────────────

export function mergeOperativasData(shipments: ParsedShipment[], opMap: Map<string, OperativasRecord[]>): ParsedShipment[] {
  if (opMap.size === 0) return shipments
  return shipments.map(s => {
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

const EXCLUDED_TERMINAL_KEYWORDS = ['CHILE', 'BUENOS AIRES']
const HARDCODED_EXCLUDED_REFS = ['A7530']

export function filterShipments(shipments: ParsedShipment[]): ParsedShipment[] {
  return shipments.filter(s => {
    if (HARDCODED_EXCLUDED_REFS.includes(s.REF.toUpperCase())) return false

    const terminal = s.TERMINAL.toUpperCase()
    if (EXCLUDED_TERMINAL_KEYWORDS.some(kw => terminal.includes(kw))) return false

    const ops = s.operativas || []
    if (ops.length > 0) {
      const deposito = ops[0].DEPOSITO.toUpperCase()
      if (EXCLUDED_TERMINAL_KEYWORDS.some(kw => deposito.includes(kw))) return false
    }

    return true
  })
}

// ─── Full server-side sync ──────────────────────────────────────────

export async function performServerSync(sheetsUrl: string): Promise<ParsedShipment[]> {
  const csvUrl = buildCsvUrl(sheetsUrl)
  const opUrl = buildOperativasUrl(sheetsUrl)

  const [mainResponse, opResponse] = await Promise.all([
    fetch(csvUrl),
    opUrl ? fetch(opUrl).catch(() => null) : Promise.resolve(null)
  ])

  if (!mainResponse.ok) {
    throw new Error('Failed to fetch from Google Sheets')
  }

  const mainCsv = await mainResponse.text()
  const rawRecords = parseMainSheetCSV(mainCsv)
  let processed = rawRecords.map(processShipmentRecord)

  // Parse operativas if available
  if (opResponse && opResponse.ok) {
    const opCsv = await opResponse.text()
    const opMap = parseOperativasData(opCsv)
    processed = mergeOperativasData(processed, opMap)
  }

  processed = filterShipments(processed)
  return processed
}

/** Strip sensitive financial fields for client portal */
export function stripFinancialFields(shipments: ParsedShipment[]): ParsedShipment[] {
  return shipments.map(s => ({
    ...s,
    C_TERMINAL: 0,
    C_DEV: 0,
    LOCALES: 0,
    FLETE: 0,
    FORMA_DE_PAGO: 'al arribo' as const,
    VTO: '',
  }))
}
