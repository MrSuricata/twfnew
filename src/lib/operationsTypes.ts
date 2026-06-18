// ─── Unified Operations model ─────────────────────────────────────────
// TAREA C — una vista única de TODA carga (FCL/LCL/aéreo/terrestre) para la
// grilla tipo-planilla. Por ahora NO migra datos: es un adaptador que une
// las fuentes existentes (FCL del cache de la Sheet, read-only · LCL/aéreo
// de lcl_air_shipments, editable). El operativo se asigna vía overlay por
// ref (operator_assignments), sin tocar la planilla.
// ──────────────────────────────────────────────────────────────────────

import type { ParsedShipment, OperativasRecord } from './shipmentTypes'
import { getShipmentStatus, parseLocalDate } from './shipmentTypes'
import type { Truck, TruckLoad } from './truckTypes'

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

// Estado de una carga DERIVADO del camión donde va, indexado por su ref de origen.
export interface TruckRefInfo { truckCode: string; status: string }

/** Mapa ref-de-origen → { truckCode, status-derivado } a partir de los camiones y
 *  sus cargas. Mismo criterio que la grilla: ignora cargas borrador (pending==='add')
 *  y camiones borrador (t.draft); el estado se DERIVA de las fechas del camión vía
 *  deriveTruckCargoStatus (nunca se copia). Compartido por OperationsGrid y
 *  OperationDetailOverlay para no duplicar la lógica. */
export function buildTruckByRef(
  trucks: Truck[] | undefined,
  truckLoads: TruckLoad[] | undefined,
  today: Date,
): Map<string, TruckRefInfo> {
  const m = new Map<string, TruckRefInfo>()
  if (!trucks?.length || !truckLoads?.length) return m
  const tById = new Map(trucks.map(t => [t.id, t]))
  for (const l of truckLoads) {
    if (l.pending === 'add') continue          // borrador: la carga aún no está en el camión
    const t = tById.get(l.truckId)
    if (!t || t.draft) continue                // camiones borrador: invisibles para estados
    const status = deriveTruckCargoStatus(
      { status: t.status, loadDate: t.loadDate, departureDate: t.departureDate, arrivalDate: t.arrivalDate },
      today,
    )
    if (status) m.set(l.sourceRef, { truckCode: t.code, status })
  }
  return m
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

// Depósitos UY conocidos para el combobox del bloque de viabilidad.
// El input igual acepta uno nuevo (datalist) + se le suman los ya usados.
export const DEPOSITOS_UY = ['GODILCO', 'PLANIR', 'LOBRAUS', 'TCP', 'MONTECON', 'STL']

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
  // FCL operativas (PR-A flip Etapa 4): columnas reales para los campos de la hoja Operativas.
  // Vacías en LCL/aéreo/terrestre; se pueblan al hornear las FCL (PR-C).
  libre: string
  salida: string
  eta_fiscal: string
  operativa: string
  descarga: string
  dev: string
  terminal: string
  n_cntr: number
  origin_ref: string
  wood: boolean
  no_apilable: boolean
  oog: boolean
  desconsol_date?: string
  entrega_planta?: boolean
  imo: boolean
  tipo: string
  ftl_ltl: string
  costo_extra: string
  observacion: string
  status: string
  operator_id: string | null
  notes: string
  source: string
  archived: boolean
  operativas?: OperativasRecord[] | null
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
  operativas?: OperativasRecord[] // array por contenedor (FCL horneada + FCL espejo con datos)
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
  desconsol: string              // fecha de desconsolidación (DB: desconsol_date · FCL: = descarga)
  entregaPlanta: boolean         // entrega en planta (sí/no)
  dev: string
  despacho: string
  tipo: string
  terminal: string               // FCL: terminal del SG (TCP/MONTECON) · DB: ''
  n: number                      // FCL: cantidad de contenedores (col N) · DB: 0
  wood: boolean
  noApilable: boolean            // carga NO apilable
  oog: boolean                   // sobredimensionada (out of gauge) — FCL
  imo: boolean                   // mercancía peligrosa — FCL/LCL
  transporte: string
  seguimiento: string            // fecha de seguimiento
  seguro: boolean
  certi: boolean
  impresa: boolean
  archived: boolean              // solo filas DB; visible con "Ver archivadas"
  webEdited?: string[]           // FCL espejo: campos editados en la web (badge ✏️)
  status: string                 // DB: código editable · FCL: label derivado de la planilla
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return isFinite(n) ? n : 0
}

const EMPTY = {
  clientRef: '', shipper: '', agente: '', incoterm: '', origin: '', etd: '',
  buque: '', linea: '', camion: '', docNumber: '', destPort: '', despacho: '',
  dischargePort: '', pais: '', noApilable: false, oog: false, imo: false,
  seguimiento: '', seguro: false, certi: false, impresa: false,
  archived: false, desconsol: '', entregaPlanta: false,
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
    dbId: s.__dbId,                // espejo en DB → habilita edición Etapa 3
    webEdited: s.__webEdited,
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
    desconsol: firstWith('DESCARGA'),   // misma fuente que descarga
    // entregaPlanta queda en false (viene de EMPTY) — no hay dato en el Sheet
    dev: firstWith('DEV'),
    tipo: s.TIPO || firstWith('TIPO') || 'FCL',
    terminal: s.TERMINAL || '',
    n: num(s.N),
    wood,
    transporte: firstWith('TRANSPORTE'),
    status: getShipmentStatus(s).label,   // derivado de la planilla (read-only)
    operativas: ops.length > 0 ? ops : undefined,
  }
}

/** Hornear (flip Etapa 4): mapea una FCL (estado efectivo = sheet_raw + web_edits
 *  ya aplicados) a columnas reales de `shipments`. Colapsa N operativas igual que
 *  fclToOperation (suma kg/m³/bultos, junta CNTR, firstWith para fechas). El detalle
 *  por contenedor queda en sheet_raw de respaldo. El estado NO se hornea: se sigue
 *  derivando al leer (derive-on-read) desde las columnas salida/eta_fiscal/dev/...
 *  Devuelve columnas; el id y sheet_raw se conservan en el upsert. */
export function fclToColumns(s: ParsedShipment): Partial<DbShipment> {
  const ops = s.operativas || []
  const firstWith = (key: keyof NonNullable<ParsedShipment['operativas']>[number]): string =>
    (ops.find(o => o[key])?.[key] as string) || ''
  const ref = s.REF || ''
  const baseRef = ref.replace(/\s*[AB]$/i, '').trim()
  return {
    mode: 'fcl',
    source: 'fcl',
    ref,
    origin_ref: baseRef && baseRef !== ref ? baseRef : '',
    cliente: s.CLIENTE || firstWith('CLIENTE_OP'),
    doc_number: s.MBL || '',
    etd: s.ETD || '',
    eta: s.ETA || firstWith('ETA_OP'),
    buque: s.BUQUE || '',
    linea: s.LINEA || '',
    origin: s.POL || '',
    discharge_port: s.POD || '',
    dest_country: s.PAIS || 'OTRO',
    seguimiento: s.SEGUIMIENTO || '',
    contenedor: s.CNTR || ops.map(o => o.CNTR_OP).filter(Boolean).join(', '),
    pkgs: ops.reduce((a, o) => a + num(o.PKGS), 0),
    kg: ops.reduce((a, o) => a + num(o.KG), 0),
    m3: ops.reduce((a, o) => a + num(o.M3), 0),
    observacion: firstWith('DESCRIPCION'),
    fiscal: firstWith('FISCAL'),
    deposito: firstWith('DEPOSITO'),
    telex: !!firstWith('TLX'),
    libre: s.LIBRE_HASTA || firstWith('LIBRE'),
    salida: firstWith('SALIDA'),
    eta_fiscal: firstWith('ETA_FISC'),
    operativa: firstWith('OPERATIVA'),
    descarga: firstWith('DESCARGA'),
    dev: firstWith('DEV'),
    terminal: s.TERMINAL || '',
    n_cntr: num(s.N),
    tipo: s.TIPO || firstWith('TIPO') || 'FCL',
    wood: ops.some(o => (o.WOOD || '').toUpperCase().startsWith('SI')),
    transporte: firstWith('TRANSPORTE'),
  }
}

/** Estado de una FCL horneada: se DERIVA de las columnas de operativa (no se
 *  guarda — derive-on-read), reusando getShipmentStatus con un ParsedShipment
 *  mínimo. Si la fila tiene el array por contenedor (post Fase 1), lo usa;
 *  si no, reconstruye 1 operativa sintética. Si la FCL no tiene datos de
 *  operativa (Chile/BA, históricas), el estado sale de ETA como en la planilla. */
function fclColumnsStatus(s: DbShipment): string {
  if (Array.isArray(s.operativas) && s.operativas.length) {
    return getShipmentStatus({ REF: s.ref, ETD: s.etd, ETA: s.eta, operativas: s.operativas } as any).label
  }
  // …fallback colapsado actual…
  const hasOp = !!(s.salida || s.eta_fiscal || s.dev || s.descarga || s.operativa)
  const parsed = {
    REF: s.ref, ETD: s.etd, ETA: s.eta,
    operativas: hasOp
      ? [{ SALIDA: s.salida, ETA_FISC: s.eta_fiscal, DEV: s.dev, DESCARGA: s.descarga, OPERATIVA: s.operativa }]
      : [],
  } as unknown as ParsedShipment
  return getShipmentStatus(parsed).label
}

/** Inverso de fclToColumns: reconstruye un ParsedShipment desde una FCL horneada
 *  (columnas) para los consumidores que todavía esperan el modelo de la planilla
 *  (Agenda, HOY, búsqueda, vista de clientes). Si la fila tiene el array por
 *  contenedor (post Fase 1), lo usa; si no (legacy/colapsado), reconstruye 1
 *  operativa sintética desde las columnas sueltas. */
export function dbFclToParsedShipment(d: DbShipment): ParsedShipment {
  const hasOp = !!(d.salida || d.eta_fiscal || d.libre || d.operativa || d.deposito || d.descarga || d.dev)
  const op: OperativasRecord = {
    REF: d.ref, TLX: '', DEPOSITO: d.deposito || '', ETA_OP: '', SALIDA: d.salida || '',
    ETA_FISC: d.eta_fiscal || '', LIBRE: d.libre || '', OPERATIVA: d.operativa || '',
    CNTR_OP: d.contenedor || '', PKGS: d.pkgs || 0, KG: d.kg || 0, M3: d.m3 || 0,
    DESCRIPCION: d.observacion || '', FISCAL: d.fiscal || '', DESCARGA: d.descarga || '',
    DEV: d.dev || '', CLIENTE_OP: d.cliente || '', TIPO: d.tipo || '',
    WOOD: d.wood ? 'SI' : '', TRANSPORTE: d.transporte || '', HORARIO: '',
  }
  // Si la fila tiene el array por contenedor (post Fase 1), usarlo tal cual;
  // si no (legacy/colapsado), reconstruir 1 operativa desde las columnas.
  const ops: OperativasRecord[] = Array.isArray(d.operativas) && d.operativas.length
    ? d.operativas.map(o => ({
        REF: d.ref, TLX: '', DEPOSITO: o.DEPOSITO || d.deposito || '', ETA_OP: o.ETA_OP || '',
        SALIDA: o.SALIDA || '', ETA_FISC: o.ETA_FISC || '', LIBRE: o.LIBRE || d.libre || '',
        OPERATIVA: o.OPERATIVA || d.operativa || '', CNTR_OP: o.CNTR_OP || '',
        PKGS: o.PKGS || 0, KG: o.KG || 0, M3: o.M3 || 0, DESCRIPCION: o.DESCRIPCION || '',
        FISCAL: o.FISCAL || d.fiscal || '', DESCARGA: o.DESCARGA || '', DEV: o.DEV || '',
        CLIENTE_OP: o.CLIENTE_OP || d.cliente || '', TIPO: o.TIPO || d.tipo || '',
        WOOD: o.WOOD || '', TRANSPORTE: o.TRANSPORTE || d.transporte || '', HORARIO: '',
        LUGAR_SALIDA: o.LUGAR_SALIDA || '',
      }))
    : (hasOp ? [op] : [])
  return {
    REF: d.ref, CLIENTE: d.cliente || '', ETD: d.etd || '', ETA: d.eta || '',
    FT: 0, LIBRE_HASTA: d.libre || '', CNTR: d.contenedor || '', N: d.n_cntr || 0,
    MBL: d.doc_number || '', LINEA: d.linea || '', BUQUE: d.buque || '', TERMINAL: d.terminal || '',
    C_TERMINAL: 0, C_DEV: 0, LOCALES: 0, FLETE: 0, FORMA_DE_PAGO: 'al arribo', VTO: '',
    CR: false, BL: false, AD: false, AT: false,
    POL: d.origin || '', POD: d.discharge_port || '',
    PAIS: (d.dest_country as ParsedShipment['PAIS']) || 'OTRO',
    SEGUIMIENTO: d.seguimiento || '', TIPO: d.tipo || '',
    containers: [], calculatedN: d.n_cntr || 0, calculatedLibreHasta: d.libre || '',
    operativas: ops,
    __dbId: d.id,
  }
}

/** Une la FCL del cache legacy de la planilla (vacío post-flip) con la FCL de la
 *  DB (source='fcl', master post-flip), DEDUPLICANDO por REF — la versión de la
 *  DB gana. Evita el doble conteo si el cache se contamina con FCL de la DB
 *  (p.ej. el onSave de HOY que reescribe la lista completa). Una sola carga por REF. */
export function mergeFclShipments(cache: ParsedShipment[], dbShipments: DbShipment[]): ParsedShipment[] {
  const fromDb = dbShipments.filter(d => d.mode === 'fcl').map(dbFclToParsedShipment)
  const dbRefs = new Set(fromDb.map(s => s.REF))
  const fromCache = (cache || []).filter(s => !dbRefs.has(s.REF))
  return [...fromCache, ...fromDb]
}

/** Map a DB shipment (LCL/aéreo/terrestre + FCL horneada) into a unified grid row. */
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
    salida: s.salida || '',
    etaFisc: s.eta_fiscal || '',
    libre: s.libre || '',
    operativa: s.operativa || '',
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
    descarga: s.descarga || '',
    desconsol: s.desconsol_date || '',
    entregaPlanta: !!s.entrega_planta,
    dev: s.dev || '',
    despacho: s.despacho || '',
    // FCL muestra el tipo de contenedor (40HC/20DRY…); el resto, el label de modalidad.
    tipo: s.mode === 'fcl' ? (s.tipo || 'FCL') : (MODALITY_LABELS[s.mode] || ''),
    terminal: s.terminal || '',
    n: s.n_cntr || 0,
    wood: !!s.wood,
    noApilable: !!s.no_apilable,
    oog: !!s.oog,
    imo: !!s.imo,
    transporte: s.transporte || '',
    seguimiento: s.seguimiento || '',
    seguro: !!s.seguro,
    certi: !!s.certi,
    impresa: !!s.impresa,
    archived: !!s.archived,
    // FCL: estado derivado de las columnas de operativa (label, como la planilla).
    // Resto: código editable guardado en la columna status.
    status: s.mode === 'fcl' ? fclColumnsStatus(s) : (s.status || ''),
    // Array por contenedor: presente en FCL horneada post Fase 1 (jsonb operativas).
    // Permitimos que LCL/aéreo/terrestre lo lleve vacío (no usan este bloque).
    operativas: Array.isArray(s.operativas) && s.operativas.length > 0
      ? s.operativas
      : undefined,
  }
}

/** Build the unified operations list: FCL from the Sheet cache (operator via
 *  overlay) + LCL/aéreo/terrestre from the DB shipments table. */
export function buildOperations(
  shipments: ParsedShipment[],
  dbShipments: DbShipment[],
  assignments: Map<string, string | null>,
  includeArchived = false
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
    if (s.archived && !includeArchived) continue
    out.push(dbShipmentToOperation(s))
  }
  return out
}

/** Seguimiento vencido (Brian 10/06/2026): pasaron 7+ días desde la fecha de
 *  seguimiento y la carga sigue ACTIVA — recordatorio de actualizar el
 *  seguimiento. Si ya llegó a fiscal / se entregó, no molesta. Sin fecha de
 *  seguimiento no alerta. Acepta 'YYYY-MM-DD' (web) y 'D/M/YYYY' (planilla). */
export const SEGUIMIENTO_DIAS = 7
function parseSegDate(s: string): Date | null {
  const t = (s || '').trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t)
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    return new Date(y, +m[2] - 1, +m[1])
  }
  return null
}
export function isSeguimientoVencido(op: UnifiedOperation, truckStatus: string | undefined, today: Date): boolean {
  if (!op.seguimiento) return false
  const d = parseSegDate(op.seguimiento)
  if (!d || isNaN(d.getTime())) return false
  if (!isOperationActive(op, truckStatus, today)) return false
  return today.getTime() - d.getTime() >= SEGUIMIENTO_DIAS * 86400000
}

/** Criterio de Brian (10/06/2026): una carga deja de estar "activa" cuando el
 *  contenedor se devolvió Y la carga llegó a fiscal; sin tramo fiscal cuenta
 *  solo la devolución. FCL sin datos de operativa (Chile/BA, históricas): se
 *  considera inactiva si la ETA pasó hace más de 60 días. DB (LCL/aéreo/
 *  terrestre): estado terminal — en fiscal o entregado — derivado del camión
 *  si está cargada en uno. */
export function isOperationActive(op: UnifiedOperation, truckStatus: string | undefined, today: Date): boolean {
  // No-FCL (LCL/aéreo/terrestre): estado terminal por código (derivado del camión
  // si va en uno). Se basa en `mode` (no en source) para que la FCL horneada (que
  // pasa a source='db') siga usando la lógica FCL de abajo.
  if (op.mode !== 'fcl') {
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
  { key: 'cliente', label: 'Cliente / Cnee', defaultOn: true, wrap: true, w: 'max-w-[150px]' },
  { key: 'shipper', label: 'Shipper', defaultOn: false, wrap: true, w: 'max-w-[120px]' },
  { key: 'agente', label: 'Agente', defaultOn: false, wrap: true, w: 'max-w-[110px]' },
  { key: 'incoterm', label: 'Incoterm', defaultOn: false, w: 'max-w-[72px]' },
  { key: 'origin', label: 'Origen', defaultOn: false, wrap: true, w: 'max-w-[100px]' },
  { key: 'dischargePort', label: 'Pto. Descarga', defaultOn: false, wrap: true, w: 'max-w-[100px]' },
  { key: 'pais', label: 'País', defaultOn: false, w: 'max-w-[64px]' },
  { key: 'docNumber', label: 'BL / MAWB / CRT', defaultOn: true, wrap: true, w: 'max-w-[110px]' },
  { key: 'tlx', label: 'TLX', defaultOn: false, w: 'max-w-[60px]' },
  { key: 'deposito', label: 'Depósito', defaultOn: true, w: 'max-w-[90px]' },
  { key: 'etd', label: 'ETD', defaultOn: false, w: 'max-w-[84px]' },
  { key: 'eta', label: 'ETA', defaultOn: true, w: 'max-w-[84px]' },
  { key: 'salida', label: 'Salida', defaultOn: false, w: 'max-w-[84px]' },
  { key: 'etaFisc', label: 'ETA Fisc', defaultOn: false, w: 'max-w-[84px]' },
  { key: 'libre', label: 'Libre', defaultOn: false, w: 'max-w-[84px]' },
  { key: 'operativa', label: 'Operativa', defaultOn: false, wrap: true, w: 'max-w-[100px]' },
  { key: 'cntr', label: 'CNTR', defaultOn: true, wrap: true, w: 'max-w-[130px]' },
  { key: 'buque', label: 'Buque', defaultOn: false, wrap: true, w: 'max-w-[110px]' },
  { key: 'linea', label: 'Línea', defaultOn: false, w: 'max-w-[90px]' },
  { key: 'pkgs', label: 'Bultos', defaultOn: false, numeric: true },
  { key: 'kg', label: 'Kg', defaultOn: true, numeric: true },
  { key: 'm3', label: 'M³', defaultOn: false, numeric: true },
  { key: 'descripcion', label: 'Descripción', defaultOn: false, wrap: true, w: 'max-w-[180px]' },
  { key: 'fiscal', label: 'Fiscal', defaultOn: true, wrap: true, w: 'max-w-[100px]' },
  { key: 'destPort', label: 'Destino', defaultOn: false, wrap: true, w: 'max-w-[100px]' },
  { key: 'camion', label: 'Camión', defaultOn: true, w: 'max-w-[72px]' },
  { key: 'despacho', label: 'Despacho', defaultOn: false, wrap: true, w: 'max-w-[100px]' },
  { key: 'descarga', label: 'Descarga', defaultOn: false, w: 'max-w-[84px]' },
  { key: 'dev', label: 'DEV', defaultOn: false, w: 'max-w-[90px]' },
  { key: 'tipo', label: 'Tipo', defaultOn: false },
  { key: 'status', label: 'Estado', defaultOn: true, w: 'max-w-[130px]' },
  { key: 'seguimiento', label: 'Seguimiento', defaultOn: true, w: 'max-w-[92px]' },
  { key: 'wood', label: 'Wood', defaultOn: false, w: 'max-w-[56px]' },
  { key: 'noApilable', label: 'No apilable', defaultOn: false, w: 'max-w-[64px]' },
  { key: 'oog', label: 'OOG', defaultOn: false, w: 'max-w-[56px]' },
  { key: 'imo', label: 'IMO', defaultOn: false, w: 'max-w-[56px]' },
  { key: 'seguro', label: 'Seguro', defaultOn: false, w: 'max-w-[56px]' },
  { key: 'certi', label: 'Certi', defaultOn: false, w: 'max-w-[56px]' },
  { key: 'impresa', label: 'Impresa', defaultOn: false, w: 'max-w-[60px]' },
  { key: 'transporte', label: 'Transporte', defaultOn: false, wrap: true, w: 'max-w-[110px]' },
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
  // 'camion' NO es editable: setear este texto NO sube la carga al camión (eso se
  // hace en el armador → truck_loads). El camión real se deriva de las cargas.
  despacho: { col: 'despacho', type: 'text' },
  transporte: { col: 'transporte', type: 'text' },
  seguimiento: { col: 'seguimiento', type: 'text' },
  desconsol: { col: 'desconsol_date', type: 'text' },
  entregaPlanta: { col: 'entrega_planta', type: 'bool' },
  // Campos de Operativas (editables tras el flip; columnas reales en shipments)
  libre: { col: 'libre', type: 'text' },
  salida: { col: 'salida', type: 'text' },
  etaFisc: { col: 'eta_fiscal', type: 'text' },
  operativa: { col: 'operativa', type: 'text' },
  descarga: { col: 'descarga', type: 'text' },
  dev: { col: 'dev', type: 'text' },
  terminal: { col: 'terminal', type: 'text' },
  tlx: { col: 'telex', type: 'bool' },
  wood: { col: 'wood', type: 'bool' },
  noApilable: { col: 'no_apilable', type: 'bool' },
  oog: { col: 'oog', type: 'bool' },
  imo: { col: 'imo', type: 'bool' },
  seguro: { col: 'seguro', type: 'bool' },
  certi: { col: 'certi', type: 'bool' },
  impresa: { col: 'impresa', type: 'bool' },
  status: { col: 'status', type: 'select', options: STATUS_OPTIONS },
}

// ── Edición inline de FCL espejo (Etapa 3 migración) ──
// Columna de la grilla → clave del ParsedShipment que pisa el overlay
// web_edits. Solo campos del nivel SG; los de operativas por contenedor
// (salida/etaFisc/libre/operativa/depósito...) se siguen editando en la
// planilla hasta el flip. La REF nunca (flujo aparte con confirmación).
export const EDITABLE_FCL_FIELDS: Partial<Record<keyof UnifiedOperation, string>> = {
  cliente: 'CLIENTE',
  etd: 'ETD',
  eta: 'ETA',
  cntr: 'CNTR',
  docNumber: 'MBL',
  buque: 'BUQUE',
  linea: 'LINEA',
  origin: 'POL',
  dischargePort: 'POD',
  seguimiento: 'SEGUIMIENTO',
  tipo: 'TIPO',
}

/**
 * Columnas de shipments que TAMBIÉN viven por contenedor en el array `operativas`.
 * Editarlas en el panel (a nivel carga) debe propagarse a TODOS los contenedores:
 * la Agenda/HOY/chips leen el valor POR CONTENEDOR (op.OPERATIVA, op.LIBRE,
 * op.DEPOSITO…), no la columna colapsada. (Mapa: columna DB → campo del array.)
 */
const OP_ARRAY_FIELD_BY_COL: Partial<Record<string, keyof OperativasRecord>> = {
  operativa: 'OPERATIVA',
  libre: 'LIBRE',
  salida: 'SALIDA',
  eta_fiscal: 'ETA_FISC',
  dev: 'DEV',
  descarga: 'DESCARGA',
  deposito: 'DEPOSITO',
}

/**
 * Patch para editar un campo de una FCL desde el panel de detalle.
 *
 * Varios campos viven en DOS lados: la columna top-level (la lee la grilla vía
 * dbShipmentToOperation) Y el array por contenedor `operativas[]` (lo leen
 * Agenda/HOY/chips). Editar solo la columna dejaba esas vistas sin cambiar
 * (casos reales: TRASIEGO↔CONTENEDOR no repintaba el chip; cambiar el LIBRE no
 * actualizaba la tarjeta de "Pendientes de salida"). Para los campos del mapa,
 * este patch setea la columna Y propaga el valor a TODOS los contenedores del
 * array. Para el resto, solo la columna.
 */
export function buildPerContainerPatch(op: UnifiedOperation, col: string, value: unknown): Record<string, unknown> {
  const patch: Record<string, unknown> = { [col]: value }
  const opField = OP_ARRAY_FIELD_BY_COL[col]
  if (opField && op.operativas && op.operativas.length > 0) {
    patch.operativas = op.operativas.map(o => ({ ...o, [opField]: value }))
  }
  return patch
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
    fiscal: '', wood: false, no_apilable: false, oog: false, imo: false, tipo: '',
    libre: '', salida: '', eta_fiscal: '', operativa: '', descarga: '', dev: '', terminal: '', n_cntr: 0, origin_ref: '',
    ftl_ltl: '', costo_extra: '', observacion: '', status: 'en_origen', operator_id: null,
    notes: '', source: 'web', archived: false,
    ...fields,
  }
}
