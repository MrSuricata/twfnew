// ─── Unified Operations model ─────────────────────────────────────────
// TAREA C — una vista única de TODA carga (FCL/LCL/aéreo/terrestre) para la
// grilla tipo-planilla. Por ahora NO migra datos: es un adaptador que une
// las fuentes existentes (FCL del cache de la Sheet, read-only · LCL/aéreo
// de lcl_air_shipments, editable). El operativo se asigna vía overlay por
// ref (operator_assignments), sin tocar la planilla.
// ──────────────────────────────────────────────────────────────────────

import type { ParsedShipment } from './shipmentTypes'
import { getShipmentStatus, parseLocalDate } from './shipmentTypes'

// ── Truck-driven status derivation (LCL/aéreo on a truck) ──────────────
// The truck a cargo is loaded on is, for LCL/aéreo, what the Sheet's operativas
// are for FCL: it carries the cargo through its mid/late lifecycle. We DERIVE
// the cargo status from the truck's dates (precise) with the status enum as a
// fallback — never copy it into the cargo, so there's a single source of truth.
// IMPORTANT: keep this logic in sync with the inline copy in api/tracking.ts.
export interface TruckLike {
  status?: string
  loadDate?: string
  departureDate?: string
  arrivalDate?: string
}
export function deriveTruckCargoStatus(t: TruckLike, today: Date): string | null {
  const reached = (s?: string) => { if (!s) return false; const d = parseLocalDate(s); return d != null && d.getTime() <= today.getTime() }
  const isToday = (s?: string) => { if (!s) return false; const d = parseLocalDate(s); return d != null && d.getTime() === today.getTime() }
  if (reached(t.arrivalDate) || t.status === 'delivered') return 'en_fiscal'
  if (isToday(t.departureDate)) return 'saliendo'
  if (reached(t.departureDate) || t.status === 'in_transit') return 'en_frontera'
  if (reached(t.loadDate) || t.status === 'loaded') return 'arribado'
  return null // planning / no dates → cargo keeps its manual baseline status
}

export type Modality = 'fcl' | 'lcl' | 'air' | 'land'

// Canonical operational status (LCL/aéreo/terrestre — editable in the grid;
// drives the public tracking card). FCL derives its status from the Sheet.
export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '—' },
  { value: 'en_origen', label: 'En Origen' },
  { value: 'embarcado', label: 'Embarcado' },
  { value: 'en_transito', label: 'En Tránsito' },
  { value: 'arribado', label: 'Arribado a Puerto' },
  { value: 'saliendo', label: 'Sale Hoy' },
  { value: 'en_frontera', label: 'En Frontera' },
  { value: 'en_fiscal', label: 'En Depósito Fiscal' },
  { value: 'devuelto', label: 'Entregado' },
]
export const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.filter(o => o.value).map(o => [o.value, o.label])
)

export const MODALITY_LABELS: Record<Modality, string> = {
  fcl: 'FCL',
  lcl: 'LCL',
  air: 'Aéreo',
  land: 'Terrestre',
}

export const MODALITY_COLORS: Record<Modality, string> = {
  fcl: '#3b82f6',
  lcl: '#8b5cf6',
  air: '#0ea5e9',
  land: '#f59e0b',
}

// ── Operativo (lista editable; base de cuentas nombradas en C1b) ──
export interface Operator {
  id: string
  name: string
  modes: Modality[]
  color: string
  active: boolean
  createdAt: number
}

// ── Asignación operativo↔ref (overlay, como billing) ──
export interface OperatorAssignment {
  ref: string
  operatorId: string | null
  updatedAt: string
}

// ── Fila DB unificada (tabla shipments — LCL/aéreo/terrestre + futuro FCL) ──
export interface DbShipment {
  id: string
  ref: string
  client_ref: string
  mode: Modality
  agente: string
  cliente: string
  shipper: string
  incoterm: string
  pkgs: number
  kg: number
  m3: number
  doc_number: string
  origin: string
  etd: string
  eta: string
  seguimiento: string
  contenedor: string
  buque: string
  linea: string
  transbordo: string
  seguro: boolean
  certi: boolean
  telex: boolean
  impresa: boolean
  despacho: string
  deposito: string
  fecha_consol: string
  transporte: string
  camion: string
  dest_country: string
  discharge_port: string
  dest_port: string
  fiscal: string
  wood: boolean
  no_apilable: boolean
  ftl_ltl: string
  costo_extra: string
  observacion: string
  status: string
  operator_id: string | null
  notes: string
  source: string
  archived: boolean
}

// ── Fila unificada de la grilla ──
export interface UnifiedOperation {
  uid: string                    // clave única de fila: la planilla reutiliza refs (splits / 2 clientes) y sin esto colisionan las keys de React
  ref: string
  clientRef: string
  mode: Modality
  source: 'fcl' | 'db'
  dbId?: string                  // id en la tabla shipments (para editar/asignar)
  readOnly: boolean              // FCL = espejo de la Sheet (read-only) hasta C2
  operatorId: string | null
  cliente: string
  shipper: string
  agente: string
  incoterm: string
  tlx: string
  deposito: string
  origin: string
  etd: string
  eta: string                    // ETA MVD / arribo
  salida: string
  etaFisc: string
  libre: string
  operativa: string
  cntr: string
  docNumber: string              // BL / MAWB-HAWB / CRT
  buque: string
  linea: string
  camion: string
  pkgs: number
  kg: number
  m3: number
  descripcion: string
  fiscal: string
  dischargePort: string          // puerto de descarga
  pais: string                   // zona derivada del POD (UY/AR/CL/OTRO) · DB: dest_country
  destPort: string
  descarga: string
  dev: string
  despacho: string
  tipo: string
  wood: boolean
  noApilable: boolean            // carga NO apilable
  transporte: string
  seguimiento: string            // fecha de seguimiento
  seguro: boolean
  certi: boolean
  impresa: boolean
  status: string                 // DB: código editable · FCL: label derivado de la planilla
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return isFinite(n) ? n : 0
}

const EMPTY = {
  clientRef: '', shipper: '', agente: '', incoterm: '', origin: '', etd: '',
  buque: '', linea: '', camion: '', docNumber: '', destPort: '', despacho: '',
  dischargePort: '', pais: '', noApilable: false, seguimiento: '', seguro: false, certi: false, impresa: false,
}

/** Collapse a FCL ParsedShipment (1+ operativas) into a single unified row. */
function fclToOperation(s: ParsedShipment, operatorId: string | null, uid: string): UnifiedOperation {
  const ops = s.operativas || []
  const firstWith = (key: keyof NonNullable<ParsedShipment['operativas']>[number]): string =>
    (ops.find(o => o[key])?.[key] as string) || ''
  const wood = ops.some(o => (o.WOOD || '').toUpperCase().startsWith('SI'))
  return {
    ...EMPTY,
    uid,
    ref: s.REF,
    mode: 'fcl',
    source: 'fcl',
    readOnly: true,
    operatorId,
    cliente: s.CLIENTE || firstWith('CLIENTE_OP'),
    docNumber: s.MBL || '',     // SG nuevo: booking
    etd: s.ETD || '',
    buque: s.BUQUE || '',
    linea: s.LINEA || '',
    origin: s.POL || '',
    dischargePort: s.POD || '',
    pais: s.PAIS || 'OTRO',
    seguimiento: s.SEGUIMIENTO || '',
    tlx: firstWith('TLX'),
    deposito: firstWith('DEPOSITO'),
    eta: s.ETA || firstWith('ETA_OP'),
    salida: firstWith('SALIDA'),
    etaFisc: firstWith('ETA_FISC'),
    libre: s.LIBRE_HASTA || firstWith('LIBRE'),
    operativa: firstWith('OPERATIVA'),
    cntr: s.CNTR || ops.map(o => o.CNTR_OP).filter(Boolean).join(', '),
    pkgs: ops.reduce((a, o) => a + num(o.PKGS), 0),
    kg: ops.reduce((a, o) => a + num(o.KG), 0),
    m3: ops.reduce((a, o) => a + num(o.M3), 0),
    descripcion: firstWith('DESCRIPCION'),
    fiscal: firstWith('FISCAL'),
    descarga: firstWith('DESCARGA'),
    dev: firstWith('DEV'),
    tipo: s.TIPO || firstWith('TIPO') || 'FCL',
    wood,
    transporte: firstWith('TRANSPORTE'),
    status: getShipmentStatus(s).label,   // derivado de la planilla (read-only)
  }
}

/** Map a DB shipment (LCL/aéreo/terrestre) into a unified grid row. */
export function dbShipmentToOperation(s: DbShipment): UnifiedOperation {
  return {
    uid: s.id,
    ref: s.ref,
    clientRef: s.client_ref || '',
    mode: s.mode,
    source: 'db',
    dbId: s.id,
    readOnly: false,
    operatorId: s.operator_id ?? null,
    cliente: s.cliente || '',
    shipper: s.shipper || '',
    agente: s.agente || '',
    incoterm: s.incoterm || '',
    tlx: s.telex ? 'SI' : '',
    deposito: s.deposito || '',
    origin: s.origin || '',
    etd: s.etd || '',
    eta: s.eta || '',
    salida: '',
    etaFisc: '',
    libre: '',
    operativa: '',
    cntr: s.contenedor || '',
    docNumber: s.doc_number || '',
    buque: s.buque || '',
    linea: s.linea || '',
    camion: s.camion || '',
    pkgs: s.pkgs || 0,
    kg: s.kg || 0,
    m3: s.m3 || 0,
    descripcion: s.observacion || '',
    fiscal: s.fiscal || '',
    dischargePort: s.discharge_port || '',
    pais: s.dest_country || '',
    destPort: s.dest_port || '',
    descarga: '',
    dev: '',
    despacho: s.despacho || '',
    tipo: MODALITY_LABELS[s.mode] || '',
    wood: !!s.wood,
    noApilable: !!s.no_apilable,
    transporte: s.transporte || '',
    seguimiento: s.seguimiento || '',
    seguro: !!s.seguro,
    certi: !!s.certi,
    impresa: !!s.impresa,
    status: s.status || '',
  }
}

/** Build the unified operations list: FCL from the Sheet cache (operator via
 *  overlay) + LCL/aéreo/terrestre from the DB shipments table. */
export function buildOperations(
  shipments: ParsedShipment[],
  dbShipments: DbShipment[],
  assignments: Map<string, string | null>
): UnifiedOperation[] {
  const out: UnifiedOperation[] = []
  // La planilla reutiliza refs (split en 2 clientes, A/B): cada repetición es una
  // operación real y se muestra, pero necesita un uid distinto para React.
  const seen = new Map<string, number>()
  for (const s of shipments) {
    if (!s.REF) continue
    const n = (seen.get(s.REF) || 0) + 1
    seen.set(s.REF, n)
    const uid = n === 1 ? `fcl-${s.REF}` : `fcl-${s.REF}#${n}`
    out.push(fclToOperation(s, assignments.get(s.REF) ?? null, uid))
  }
  for (const s of dbShipments) {
    if (s.archived) continue
    out.push(dbShipmentToOperation(s))
  }
  return out
}

/** Criterio de Brian (10/06/2026): una carga deja de estar "activa" cuando el
 *  contenedor se devolvió Y la carga llegó a fiscal; sin tramo fiscal cuenta
 *  solo la devolución. FCL sin datos de operativa (Chile/BA, históricas): se
 *  considera inactiva si la ETA pasó hace más de 60 días. DB (LCL/aéreo/
 *  terrestre): estado terminal — en fiscal o entregado — derivado del camión
 *  si está cargada en uno. */
export function isOperationActive(op: UnifiedOperation, truckStatus: string | undefined, today: Date): boolean {
  if (op.source === 'db') {
    const eff = truckStatus || op.status
    return eff !== 'en_fiscal' && eff !== 'devuelto'
  }
  const devuelta = (op.libre || '').toUpperCase().includes('DEVUELTO')
  const hasOperativaData = !!(op.libre || op.salida || op.etaFisc)
  if (hasOperativaData) {
    const fiscalDate = parseLocalDate(op.etaFisc)
    const enFiscal = op.etaFisc ? (fiscalDate != null && fiscalDate.getTime() <= today.getTime()) : true
    return !(devuelta && enFiscal)
  }
  const eta = parseLocalDate(op.eta)
  if (!eta) return true
  return eta.getTime() >= today.getTime() - 60 * 86400000
}

export function indexAssignments(rows: OperatorAssignment[]): Map<string, string | null> {
  const m = new Map<string, string | null>()
  for (const r of rows) m.set(r.ref, r.operatorId)
  return m
}

/** Operators eligible for a given modality (for the dropdown). */
export function operatorsForMode(operators: Operator[], mode: Modality): Operator[] {
  return operators.filter(o => o.active && (o.modes.length === 0 || o.modes.includes(mode)))
}

// ── Column definitions for the grid (order + default visibility) ──
export interface ColumnDef {
  key: keyof UnifiedOperation | 'operator'
  label: string
  defaultOn: boolean
  numeric?: boolean
  sticky?: boolean
  /** Allow the cell to wrap to (up to) 2 lines instead of one long line. */
  wrap?: boolean
  /** Tailwind max-width utility to keep the column narrow (caps horizontal scroll). */
  w?: string
}

export const OPERATION_COLUMNS: ColumnDef[] = [
  { key: 'ref', label: 'Ref', defaultOn: true, sticky: true, w: 'max-w-[92px]' },
  { key: 'clientRef', label: 'Ref Cliente', defaultOn: false, w: 'max-w-[90px]' },
  { key: 'operator', label: 'Operativo', defaultOn: true },
  { key: 'cliente', label: 'Cliente / Cnee', defaultOn: true, wrap: true, w: 'max-w-[130px]' },
  { key: 'shipper', label: 'Shipper', defaultOn: false, wrap: true, w: 'max-w-[120px]' },
  { key: 'agente', label: 'Agente', defaultOn: false, wrap: true, w: 'max-w-[110px]' },
  { key: 'incoterm', label: 'Incoterm', defaultOn: false, w: 'max-w-[72px]' },
  { key: 'origin', label: 'Origen', defaultOn: true, wrap: true, w: 'max-w-[100px]' },
  { key: 'dischargePort', label: 'Pto. Descarga', defaultOn: true, wrap: true, w: 'max-w-[100px]' },
  { key: 'pais', label: 'País', defaultOn: true, w: 'max-w-[64px]' },
  { key: 'docNumber', label: 'BL / MAWB / CRT', defaultOn: true, wrap: true, w: 'max-w-[120px]' },
  { key: 'tlx', label: 'TLX', defaultOn: false, w: 'max-w-[60px]' },
  { key: 'deposito', label: 'Depósito', defaultOn: true, w: 'max-w-[92px]' },
  { key: 'etd', label: 'ETD', defaultOn: false, w: 'max-w-[84px]' },
  { key: 'eta', label: 'ETA', defaultOn: true, w: 'max-w-[84px]' },
  { key: 'salida', label: 'Salida', defaultOn: false, w: 'max-w-[84px]' },
  { key: 'etaFisc', label: 'ETA Fisc', defaultOn: false, w: 'max-w-[84px]' },
  { key: 'libre', label: 'Libre', defaultOn: false, w: 'max-w-[84px]' },
  { key: 'operativa', label: 'Operativa', defaultOn: false, wrap: true, w: 'max-w-[100px]' },
  { key: 'cntr', label: 'CNTR', defaultOn: true, wrap: true, w: 'max-w-[120px]' },
  { key: 'buque', label: 'Buque', defaultOn: false, wrap: true, w: 'max-w-[110px]' },
  { key: 'linea', label: 'Línea', defaultOn: false, w: 'max-w-[90px]' },
  { key: 'pkgs', label: 'Bultos', defaultOn: true, numeric: true },
  { key: 'kg', label: 'Kg', defaultOn: true, numeric: true },
  { key: 'm3', label: 'M³', defaultOn: true, numeric: true },
  { key: 'descripcion', label: 'Descripción', defaultOn: false, wrap: true, w: 'max-w-[180px]' },
  { key: 'fiscal', label: 'Fiscal', defaultOn: true, wrap: true, w: 'max-w-[110px]' },
  { key: 'destPort', label: 'Destino', defaultOn: true, wrap: true, w: 'max-w-[100px]' },
  { key: 'camion', label: 'Camión', defaultOn: true, w: 'max-w-[80px]' },
  { key: 'despacho', label: 'Despacho', defaultOn: false, wrap: true, w: 'max-w-[100px]' },
  { key: 'descarga', label: 'Descarga', defaultOn: false, w: 'max-w-[84px]' },
  { key: 'dev', label: 'DEV', defaultOn: false, w: 'max-w-[90px]' },
  { key: 'tipo', label: 'Tipo', defaultOn: true },
  { key: 'status', label: 'Estado', defaultOn: true, w: 'max-w-[130px]' },
  { key: 'seguimiento', label: 'Seguimiento', defaultOn: false, w: 'max-w-[92px]' },
  { key: 'wood', label: 'Wood', defaultOn: true, w: 'max-w-[56px]' },
  { key: 'noApilable', label: 'No apilable', defaultOn: false, w: 'max-w-[64px]' },
  { key: 'seguro', label: 'Seguro', defaultOn: false, w: 'max-w-[56px]' },
  { key: 'certi', label: 'Certi', defaultOn: false, w: 'max-w-[56px]' },
  { key: 'impresa', label: 'Impresa', defaultOn: false, w: 'max-w-[60px]' },
  { key: 'transporte', label: 'Transporte', defaultOn: true, wrap: true, w: 'max-w-[110px]' },
]

// ── Inline edit: grid column → DB column + value type ──
// Only DB rows (LCL/aéreo/terrestre) are editable; FCL stays read-only (mirror
// of the Sheet). Columns NOT listed here (ref, operator, tipo, and the FCL-only
// date fields salida/etaFisc/libre/operativa/descarga/dev) are not inline-editable.
export interface EditableField {
  col: string                      // column name in the `shipments` table (PATCH whitelist)
  type: 'text' | 'number' | 'bool' | 'select'
  options?: { value: string; label: string }[]   // for type 'select'
}

export const EDITABLE_FIELDS: Partial<Record<keyof UnifiedOperation, EditableField>> = {
  cliente: { col: 'cliente', type: 'text' },
  clientRef: { col: 'client_ref', type: 'text' },
  shipper: { col: 'shipper', type: 'text' },
  agente: { col: 'agente', type: 'text' },
  incoterm: { col: 'incoterm', type: 'text' },
  origin: { col: 'origin', type: 'text' },
  dischargePort: { col: 'discharge_port', type: 'text' },
  docNumber: { col: 'doc_number', type: 'text' },
  deposito: { col: 'deposito', type: 'text' },
  etd: { col: 'etd', type: 'text' },
  eta: { col: 'eta', type: 'text' },
  cntr: { col: 'contenedor', type: 'text' },
  buque: { col: 'buque', type: 'text' },
  linea: { col: 'linea', type: 'text' },
  pkgs: { col: 'pkgs', type: 'number' },
  kg: { col: 'kg', type: 'number' },
  m3: { col: 'm3', type: 'number' },
  descripcion: { col: 'observacion', type: 'text' },
  fiscal: { col: 'fiscal', type: 'text' },
  destPort: { col: 'dest_port', type: 'text' },
  camion: { col: 'camion', type: 'text' },
  despacho: { col: 'despacho', type: 'text' },
  transporte: { col: 'transporte', type: 'text' },
  seguimiento: { col: 'seguimiento', type: 'text' },
  tlx: { col: 'telex', type: 'bool' },
  wood: { col: 'wood', type: 'bool' },
  noApilable: { col: 'no_apilable', type: 'bool' },
  seguro: { col: 'seguro', type: 'bool' },
  certi: { col: 'certi', type: 'bool' },
  impresa: { col: 'impresa', type: 'bool' },
  status: { col: 'status', type: 'select', options: STATUS_OPTIONS },
}

// Build a new DB shipment row with sensible empty defaults. Only `mode` is
// required; the rest is filled inline in the grid afterwards.
export function newDbShipment(fields: Partial<DbShipment> & { mode: Modality }): DbShipment {
  const rand = Math.random().toString(36).slice(2, 7)
  return {
    id: `shp-${fields.mode}-${Date.now()}-${rand}`,
    ref: '', client_ref: '', agente: '', cliente: '', shipper: '',
    incoterm: '', pkgs: 0, kg: 0, m3: 0, doc_number: '', origin: '', etd: '', eta: '',
    seguimiento: '', contenedor: '', buque: '', linea: '', transbordo: '', seguro: false,
    certi: false, telex: false, impresa: false, despacho: '', deposito: '', fecha_consol: '',
    transporte: '', camion: '', dest_country: '', discharge_port: '', dest_port: '',
    fiscal: '', wood: false, no_apilable: false,
    ftl_ltl: '', costo_extra: '', observacion: '', status: 'en_origen', operator_id: null,
    notes: '', source: 'web', archived: false,
    ...fields,
  }
}
