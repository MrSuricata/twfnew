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
  // SG nuevo (multizona)
  POL: string          // puerto de carga (origen)
  POD: string          // puerto de descarga
  PAIS: 'UY' | 'AR' | 'CL' | 'OTRO'
  SEGUIMIENTO: string  // fecha de seguimiento
  TIPO: string         // tipo de contenedor (40HQ, 20GP…)
}

// Puerto de descarga → país/zona. Editable: ampliar acá.
export const POD_ZONA: Record<string, 'UY' | 'AR' | 'CL'> = {
  MONTEVIDEO: 'UY', MVD: 'UY',
  'BUENOS AIRES': 'AR', BSAS: 'AR', BA: 'AR',
  VALPARAISO: 'CL', 'SAN ANTONIO': 'CL', IQUIQUE: 'CL', 'SAN VICENTE': 'CL', CALLAO: 'CL',
}
export function zonaFromPOD(pod: string): 'UY' | 'AR' | 'CL' | 'OTRO' {
  const k = (pod || '').trim().toUpperCase()
  return POD_ZONA[k] || 'OTRO'
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
    POL: record.POL || '',
    POD: record.POD || '',
    PAIS: record.PAIS || zonaFromPOD(record.POD || ''),
    SEGUIMIENTO: record.SEGUIMIENTO || '',
    TIPO: record.TIPO || '',
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
      let nh = header.trim().toUpperCase().replace(/\s+/g, '_').replace(/\./g, '').replace(/°/g, '')
      // SG nuevo: la primera columna (Ref) viene SIN encabezado.
      if (nh === '' && index === 0) nh = 'REF'

      switch (nh) {
        case 'REF': case 'REFERENCIA':
          record.REF = value.trim(); break
        case 'CLIENTE': case 'CLIENT': case 'CONSIGNEE':
          record.CLIENTE = value.trim(); break
        case 'POL': case 'ORIGEN':
          record.POL = value.trim(); break
        case 'POD': case 'PUERTO_DESCARGA':
          record.POD = value.trim(); break
        case 'BOOKING':
          if (!record.MBL) record.MBL = value.trim(); break  // SG nuevo no trae MBL
        case 'NOMBRE_BUQUE': case 'NOMBRE':
          if (!record.BUQUE) record.BUQUE = value.trim(); break
        case 'CONTS':
          if (!record.CNTR) record.CNTR = value.trim(); break
        case 'SEGUIMIENTO':
          record.SEGUIMIENTO = value.trim(); break
        case 'TIPO':
          record.TIPO = value.trim(); break
        // ESTADO y OPERATIVO: NO se mapean (la app maneja estado/operativo)
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

    record.PAIS = zonaFromPOD(record.POD || '')

    // Solo se exige REF (CLIENTE puede faltar en algunas cargas no-UY).
    if (record.REF) {
      records.push(record)
    }
  }

  return records
}

// ─── Operativas Parsing ─────────────────────────────────────────────

const OPERATIVAS_GID = '1133111465'
const SG_GID = '1606359155'   // SG nuevo (enriquecido, todas las cargas)

export function buildCsvUrl(sheetsUrl: string): string {
  if (sheetsUrl.includes('/edit')) {
    const sheetId = sheetsUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1]
    if (!sheetId) throw new Error('Invalid Google Sheets URL')
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${SG_GID}`
  }
  try {
    const url = new URL(sheetsUrl)
    url.searchParams.set('gid', SG_GID)
    return url.toString()
  } catch {
    return sheetsUrl
  }
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

// Refs basura confirmadas por Brian (10/06/2026): A6791 (split viejo Chile),
// A6836 (ref reutilizada por error, ambas operaciones viejas). A7804 NO se
// excluye: la fila GIECO es una operación vigente (la fila VMG vacía se
// corrige en la planilla).
const HARDCODED_EXCLUDED_REFS = ['A7530', 'A6791', 'A6836']

// SG nuevo: ya NO se excluyen Chile/Buenos Aires — entran TODAS las cargas
// (la zona se deriva del POD y se filtra en la UI). Solo se sacan refs basura
// y las filas que NO son FCL: el equipo anota también LCL/consolidados en la
// misma hoja (E64, LCL12348...) y esas cargas viven en la web — ingerirlas
// acá las duplicaba como "FCL" fantasma. FCL = ref con formato A#### .
const FCL_REF_RE = /^A\s?\d/i
export function filterShipments(shipments: ParsedShipment[]): ParsedShipment[] {
  return shipments.filter(s => {
    const ref = (s.REF || '').trim().toUpperCase()
    return FCL_REF_RE.test(ref) && !HARDCODED_EXCLUDED_REFS.includes(ref)
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

// ─── Espejo FCL → tabla `shipments` (Etapa 1 de la migración) ────────
// La planilla sigue siendo master. Cada sync upserta TODAS las FCL como
// filas mode='fcl' source='sheet' para correr en paralelo y verificar
// conteos antes del flip (Etapa 2). Reglas:
//  - id determinístico por (ref, booking, cliente): re-sync = update, y las
//    refs duplicadas de la planilla (splits / reuso) no colisionan entre sí
//  - el RESTO de la app IGNORA estas filas (GET de shipments y tracking
//    filtran source='sheet') hasta el flip — si no, duplicarían cada FCL
//  - NO se copia el estado operativo (se deriva en la app: derive-on-read)
//  - las operativas por contenedor (SALIDA/ETA_FISC/LIBRE) NO entran acá:
//    siguen viviendo en la hoja Operativas hasta la Etapa 2+ (tabla hija)

const mirrorSlug = (s: string) =>
  (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

export function fclMirrorRows(shipments: ParsedShipment[], now: number): Record<string, unknown>[] {
  const toNum = (v: unknown) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
    return isFinite(n) ? n : 0
  }
  const rows: Record<string, unknown>[] = []
  const seen = new Set<string>()
  for (const s of shipments) {
    if (!s.REF) continue
    const ops = s.operativas || []
    const first = (key: string): string => String((ops as unknown as Array<Record<string, unknown>>).find(o => o[key])?.[key] ?? '')
    const id = ['shp-fcl', mirrorSlug(s.REF), mirrorSlug(s.MBL || ''), mirrorSlug(s.CLIENTE || '')]
      .filter(Boolean).join('-')
    if (seen.has(id)) continue // fila idéntica repetida en la planilla → una sola
    seen.add(id)
    rows.push({
      id,
      ref: s.REF,
      mode: 'fcl',
      source: 'sheet',
      cliente: s.CLIENTE || first('CLIENTE_OP'),
      doc_number: s.MBL || '',
      contenedor: s.CNTR || '',
      buque: s.BUQUE || '',
      linea: s.LINEA || '',
      origin: s.POL || '',
      discharge_port: s.POD || '',
      dest_country: s.PAIS || '',
      tipo: s.TIPO || first('TIPO'),
      seguimiento: s.SEGUIMIENTO || '',
      etd: s.ETD || '',
      eta: s.ETA || '',
      pkgs: ops.reduce((a, o) => a + toNum((o as unknown as Record<string, unknown>).PKGS), 0),
      kg: ops.reduce((a, o) => a + toNum((o as unknown as Record<string, unknown>).KG), 0),
      m3: ops.reduce((a, o) => a + toNum((o as unknown as Record<string, unknown>).M3), 0),
      deposito: first('DEPOSITO'),
      fiscal: first('FISCAL'),
      transporte: first('TRANSPORTE'),
      observacion: first('DESCRIPCION'),
      wood: ops.some(o => String((o as unknown as Record<string, unknown>).WOOD || '').toUpperCase().startsWith('SI')),
      // Fidelidad completa: el ParsedShipment entero (operativas, checks, VTO,
      // costos...). Etapa 2: la app reconstruye las FCL desde acá en vez del
      // cache — mismos objetos, misma lógica derivada, otra fuente.
      sheet_raw: s,
      updated_at_ts: now,
    })
  }
  return rows
}

/**
 * Check if a CLIENTE field matches a pattern string.
 * - Supports multiple comma-separated patterns: "CHIAPERO,MARTINEZ,ACME"
 * - Patterns shorter than 5 chars are silently dropped (prevents accidental
 *   cross-client matches via short substrings).
 * - Match is word-boundary (pattern must be flanked by non-alphanumerics or string edges)
 *   so "SA" would not match inside "SANTOS" if it were allowed. Regex metacharacters in
 *   the pattern are escaped.
 */
export function matchesClientePattern(cliente: string, pattern: string): boolean {
  if (!cliente || !pattern) return false
  const clienteUpper = cliente.toUpperCase()
  const patterns = pattern
    .toUpperCase()
    .split(',')
    .map(p => p.trim())
    .filter(p => p.length >= 5)
  if (patterns.length === 0) return false
  return patterns.some(p => {
    const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`)
    return re.test(clienteUpper)
  })
}

/** Strip sensitive financial and identifying fields for non-admin views */
export function stripFinancialFields(shipments: ParsedShipment[]): ParsedShipment[] {
  return shipments.map(s => ({
    ...s,
    CLIENTE: '', // Don't expose client names to other clients or public
    C_TERMINAL: 0,
    C_DEV: 0,
    LOCALES: 0,
    FLETE: 0,
    FORMA_DE_PAGO: 'al arribo' as const,
    VTO: '',
  }))
}
