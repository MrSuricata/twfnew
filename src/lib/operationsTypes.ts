// ─── Unified Operations model ─────────────────────────────────────────
// TAREA C — una vista única de TODA carga (FCL/LCL/aéreo/terrestre) para la
// grilla tipo-planilla. Por ahora NO migra datos: es un adaptador que une
// las fuentes existentes (FCL del cache de la Sheet, read-only · LCL/aéreo
// de lcl_air_shipments, editable). El operativo se asigna vía overlay por
// ref (operator_assignments), sin tocar la planilla.
// ──────────────────────────────────────────────────────────────────────

import type { ParsedShipment } from './shipmentTypes'
import type { LclAirShipment } from './truckTypes'

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

// ── Fila unificada de la grilla ──
export interface UnifiedOperation {
  ref: string
  mode: Modality
  source: 'fcl' | 'lcl_air'
  readOnly: boolean              // FCL = espejo de la Sheet (read-only) hasta C2
  operatorId: string | null
  cliente: string
  tlx: string
  deposito: string
  eta: string                    // ETA MVD
  salida: string
  etaFisc: string
  libre: string
  operativa: string
  cntr: string
  pkgs: number
  kg: number
  m3: number
  descripcion: string
  fiscal: string
  descarga: string
  dev: string
  tipo: string
  wood: boolean
  transporte: string
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return isFinite(n) ? n : 0
}

/** Collapse a FCL ParsedShipment (1+ operativas) into a single unified row. */
function fclToOperation(s: ParsedShipment, operatorId: string | null): UnifiedOperation {
  const ops = s.operativas || []
  const firstWith = (key: keyof NonNullable<ParsedShipment['operativas']>[number]): string =>
    (ops.find(o => o[key])?.[key] as string) || ''
  const wood = ops.some(o => (o.WOOD || '').toUpperCase().startsWith('SI'))
  return {
    ref: s.REF,
    mode: 'fcl',
    source: 'fcl',
    readOnly: true,
    operatorId,
    cliente: s.CLIENTE || firstWith('CLIENTE_OP'),
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

/** Map an LCL/Air/Land shipment (DB-native, editable) into a unified row. */
function lclAirToOperation(s: LclAirShipment, operatorId: string | null): UnifiedOperation {
  return {
    ref: s.ref,
    mode: (s.modality as Modality) || 'lcl',
    source: 'lcl_air',
    readOnly: false,
    operatorId,
    cliente: s.client,
    tlx: '',
    deposito: '',
    eta: s.etaMvd,
    salida: '',
    etaFisc: '',
    libre: '',
    operativa: '',
    cntr: '',
    pkgs: s.pkgs,
    kg: s.kg,
    m3: s.m3,
    descripcion: s.description,
    fiscal: s.fiscal,
    descarga: '',
    dev: '',
    tipo: MODALITY_LABELS[(s.modality as Modality) || 'lcl'],
    wood: s.wood,
    transporte: '',
  }
}

/** Build the unified operations list from all current sources. */
export function buildOperations(
  shipments: ParsedShipment[],
  lclAir: LclAirShipment[],
  assignments: Map<string, string | null>
): UnifiedOperation[] {
  const out: UnifiedOperation[] = []
  for (const s of shipments) {
    if (!s.REF) continue
    out.push(fclToOperation(s, assignments.get(s.REF) ?? null))
  }
  for (const s of lclAir) {
    out.push(lclAirToOperation(s, assignments.get(s.ref) ?? null))
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
}

export const OPERATION_COLUMNS: ColumnDef[] = [
  { key: 'ref', label: 'Ref', defaultOn: true, sticky: true },
  { key: 'operator', label: 'Operativo', defaultOn: true },
  { key: 'cliente', label: 'Cliente', defaultOn: true },
  { key: 'tlx', label: 'TLX', defaultOn: false },
  { key: 'deposito', label: 'Depósito', defaultOn: true },
  { key: 'eta', label: 'ETA MVD', defaultOn: true },
  { key: 'salida', label: 'Salida', defaultOn: true },
  { key: 'etaFisc', label: 'ETA Fisc', defaultOn: true },
  { key: 'libre', label: 'Libre', defaultOn: true },
  { key: 'operativa', label: 'Operativa', defaultOn: true },
  { key: 'cntr', label: 'CNTR', defaultOn: true },
  { key: 'pkgs', label: 'Bultos', defaultOn: true, numeric: true },
  { key: 'kg', label: 'Kg', defaultOn: true, numeric: true },
  { key: 'm3', label: 'M³', defaultOn: true, numeric: true },
  { key: 'descripcion', label: 'Descripción', defaultOn: true },
  { key: 'fiscal', label: 'Fiscal', defaultOn: true },
  { key: 'descarga', label: 'Descarga', defaultOn: false },
  { key: 'dev', label: 'DEV', defaultOn: false },
  { key: 'tipo', label: 'Tipo', defaultOn: true },
  { key: 'wood', label: 'Wood', defaultOn: true },
  { key: 'transporte', label: 'Transporte', defaultOn: true },
]
