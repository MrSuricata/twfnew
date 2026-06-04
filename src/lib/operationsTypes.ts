// ─── Unified Operations model ─────────────────────────────────────────
// TAREA C — una vista única de TODA carga (FCL/LCL/aéreo/terrestre) para la
// grilla tipo-planilla. Por ahora NO migra datos: es un adaptador que une
// las fuentes existentes (FCL del cache de la Sheet, read-only · LCL/aéreo
// de lcl_air_shipments, editable). El operativo se asigna vía overlay por
// ref (operator_assignments), sin tocar la planilla.
// ──────────────────────────────────────────────────────────────────────

import type { ParsedShipment } from './shipmentTypes'

export type Modality = 'fcl' | 'lcl' | 'air' | 'land'

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
  dest_port: string
  fiscal: string
  wood: boolean
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
  destPort: string
  descarga: string
  dev: string
  despacho: string
  tipo: string
  wood: boolean
  transporte: string
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return isFinite(n) ? n : 0
}

const EMPTY = {
  clientRef: '', shipper: '', agente: '', incoterm: '', origin: '', etd: '',
  buque: '', linea: '', camion: '', docNumber: '', destPort: '', despacho: '',
}

/** Collapse a FCL ParsedShipment (1+ operativas) into a single unified row. */
function fclToOperation(s: ParsedShipment, operatorId: string | null): UnifiedOperation {
  const ops = s.operativas || []
  const firstWith = (key: keyof NonNullable<ParsedShipment['operativas']>[number]): string =>
    (ops.find(o => o[key])?.[key] as string) || ''
  const wood = ops.some(o => (o.WOOD || '').toUpperCase().startsWith('SI'))
  return {
    ...EMPTY,
    ref: s.REF,
    mode: 'fcl',
    source: 'fcl',
    readOnly: true,
    operatorId,
    cliente: s.CLIENTE || firstWith('CLIENTE_OP'),
    docNumber: s.MBL || '',
    etd: s.ETD || '',
    buque: s.BUQUE || '',
    linea: s.LINEA || '',
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
    tipo: firstWith('TIPO') || 'FCL',
    wood,
    transporte: firstWith('TRANSPORTE'),
  }
}

/** Map a DB shipment (LCL/aéreo/terrestre) into a unified grid row. */
export function dbShipmentToOperation(s: DbShipment): UnifiedOperation {
  return {
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
    destPort: s.dest_port || '',
    descarga: '',
    dev: '',
    despacho: s.despacho || '',
    tipo: MODALITY_LABELS[s.mode] || '',
    wood: !!s.wood,
    transporte: s.transporte || '',
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
  for (const s of shipments) {
    if (!s.REF) continue
    out.push(fclToOperation(s, assignments.get(s.REF) ?? null))
  }
  for (const s of dbShipments) {
    if (s.archived) continue
    out.push(dbShipmentToOperation(s))
  }
  return out
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
  { key: 'wood', label: 'Wood', defaultOn: true, w: 'max-w-[56px]' },
  { key: 'transporte', label: 'Transporte', defaultOn: true, wrap: true, w: 'max-w-[110px]' },
]
