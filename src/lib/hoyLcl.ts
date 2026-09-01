/**
 * HOY para el equipo LCL (Montevideo). Todo derivado en el momento de leer:
 * ningún estado se guarda, cada card sale de las mismas filas `shipments`
 * (mode='lcl') y de los camiones que ya tiene el cliente cargados.
 *
 * La regla que Brian quiere instalar: "el camión se arma con lo que está en la
 * app; carga que no está, no viaja". Por eso la card de datos faltantes es
 * parte del HOY y no una pantalla aparte: lo que falta tiene que verse todos
 * los días hasta que alguien lo complete.
 *
 * Funciones puras, testeadas en hoyLcl.test.ts. La UI (HoyLcl.tsx) solo pinta.
 */
import type { DbShipment } from './operationsTypes'
import type { Truck, TruckLoad, TruckStatus, TruckTotals } from './truckTypes'
import { computeTruckTotals, deriveTruckDisplayInfo, effectiveTruckLoads } from './truckTypes'
import { estadoLcl, almacenaje, diasEsperando, type Almacenaje } from './lclEstados'

/** Lo mínimo de una fila `shipments` que estas derivaciones necesitan. Es un
 *  subconjunto de DbShipment para que los tests no tengan que armar la fila
 *  entera; en la app se le pasa el DbShipment tal cual. */
export type LclRow = Pick<DbShipment, 'id' | 'ref' | 'mode' | 'archived'> &
  Partial<Pick<DbShipment,
    'cliente' | 'doc_number' | 'hbl' | 'pkgs' | 'kg' | 'm3' | 'stock' | 'desconsol_date' |
    'fiscal' | 'deposito' | 'eta' | 'marca_cliente' | 'marca_motivo' | 'wood' |
    'entrega_planta' | 'imo' | 'no_apilable'
  >>

const REF = (r: unknown): string => String(r ?? '').trim().toUpperCase()
const txt = (v: unknown): string => String(v ?? '').trim()
const vacio = (v: unknown): boolean => !txt(v)
const num = (v: unknown): number => {
  const n = Number(v)
  return isFinite(n) ? n : 0
}

// ── Fechas (locales, sin huso: las ETAs son días, no instantes) ─────────

const aFecha = (iso: string): Date => {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(a, (m || 1) - 1, d || 1)
}

export const fechaISO = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function sumarDiasISO(iso: string, dias: number): string {
  const f = aFecha(iso)
  f.setDate(f.getDate() + dias)
  return fechaISO(f)
}

const diasEntre = (desdeISO: string, hastaISO: string): number =>
  Math.round((aFecha(hastaISO).getTime() - aFecha(desdeISO).getTime()) / 86_400_000)

// ── Camiones: qué ref ya viaja y cuál ya salió ──────────────────────────

/** Mismo criterio que el armador: camión no borrador y con fecha (carga o
 *  salida) reserva sus cargas confirmadas; una carga `pending='add'` todavía
 *  no existe. Si el camión tiene salida, la carga está despachada. */
export function refsPorCamion(trucks: Truck[], loads: TruckLoad[]): { enCamion: Set<string>; despachadas: Set<string> } {
  const enCamion = new Set<string>()
  const despachadas = new Set<string>()
  for (const t of trucks) {
    if (!t || t.draft) continue
    if (!(t.loadDate || t.departureDate)) continue
    for (const l of loads) {
      if (l.truckId !== t.id || l.pending === 'add') continue
      const r = REF(l.sourceRef)
      if (!r) continue
      enCamion.add(r)
      if (t.departureDate) despachadas.add(r)
    }
  }
  return { enCamion, despachadas }
}

// ── Universo ────────────────────────────────────────────────────────────

/** LCL vivas para Montevideo: no archivadas y cuyo camión no salió todavía. */
export function lclActivas<T extends LclRow>(rows: T[], refsDespachadas: Set<string>): T[] {
  return rows.filter(s => s.mode === 'lcl' && !s.archived && !refsDespachadas.has(REF(s.ref)))
}

/** El BL puede venir en `doc_number` (alta guiada) o en `hbl` (registro LCL). */
export function blDe(row: LclRow): string {
  return txt(row.doc_number) || txt(row.hbl)
}

// ── Card 1: llegan a Montevideo ─────────────────────────────────────────

export interface LlegadaItem {
  row: LclRow
  sinFiscal: boolean
  sinBL: boolean
}

export interface GrupoLlegadaFiscal {
  /** null = sin fiscal cargado. */
  fiscal: string | null
  cargas: LlegadaItem[]
  m3: number
  kg: number
}

export interface DiaLlegadas {
  fecha: string
  esHoy: boolean
  grupos: GrupoLlegadaFiscal[]
  total: number
  /** Cuántas llegan sin fiscal o sin BL: lo que hay que completar antes. */
  incompletas: number
}

export function llegadasProximas(rows: LclRow[], hoyISO: string, dias = 7): DiaLlegadas[] {
  const hasta = sumarDiasISO(hoyISO, dias)
  const porDia = new Map<string, LclRow[]>()
  for (const r of rows) {
    const eta = txt(r.eta).slice(0, 10)
    if (!eta || eta < hoyISO || eta > hasta) continue
    const arr = porDia.get(eta) || []
    arr.push(r)
    porDia.set(eta, arr)
  }
  return Array.from(porDia.keys()).sort().map(fecha => {
    const cargas = porDia.get(fecha) || []
    const porFiscal = new Map<string | null, GrupoLlegadaFiscal>()
    for (const row of cargas) {
      const fiscal = txt(row.fiscal).toUpperCase() || null
      const g = porFiscal.get(fiscal) || { fiscal, cargas: [], m3: 0, kg: 0 }
      g.cargas.push({ row, sinFiscal: fiscal === null, sinBL: !blDe(row) })
      g.m3 += num(row.m3)
      g.kg += num(row.kg)
      porFiscal.set(fiscal, g)
    }
    const grupos = Array.from(porFiscal.values()).sort((a, b) => {
      if (a.fiscal === null) return 1
      if (b.fiscal === null) return -1
      return b.m3 - a.m3
    })
    const incompletas = grupos.reduce((n, g) => n + g.cargas.filter(c => c.sinFiscal || c.sinBL).length, 0)
    return { fecha, esHoy: fecha === hoyISO, grupos, total: cargas.length, incompletas }
  })
}

// ── Card 2: aguardan stock ──────────────────────────────────────────────

export interface AguardaStockItem {
  row: LclRow
  diasDesdeEta: number
}

/** Llegaron y el depósito no dio el stock. La que más lleva esperando, primero. */
export function aguardanStock(rows: LclRow[], hoyISO: string, refsEnCamion: Set<string>): AguardaStockItem[] {
  return rows
    .filter(s => !refsEnCamion.has(REF(s.ref)))
    .filter(s => estadoLcl({ ref: s.ref, eta: s.eta, stock: s.stock, desconsol: s.desconsol_date }, hoyISO) === 'aguarda_stock')
    .map(row => ({ row, diasDesdeEta: Math.max(0, diasEntre(txt(row.eta), hoyISO)) }))
    .sort((a, b) => b.diasDesdeEta - a.diasDesdeEta || String(a.row.ref).localeCompare(String(b.row.ref)))
}

// ── Card 3: con stock, listas para camión ───────────────────────────────

export interface ListaItem {
  row: LclRow
  diasEsperando: number | null
  almacenaje: Almacenaje | null
  marca: 'stand_by' | 'prioridad' | null
}

export interface GrupoDeposito {
  /** null = sin depósito cargado. */
  deposito: string | null
  items: ListaItem[]
  /** Totales de las candidatas (sin las stand by). */
  m3: number
  kg: number
}

export interface GrupoFiscal {
  /** null = sin fiscal cargado. */
  fiscal: string | null
  depositos: GrupoDeposito[]
  /** Candidatas reales (sin stand by). */
  cargas: number
  m3: number
  kg: number
  standBy: number
  /** Alguna carga del fiscal tiene marca prioridad → el grupo va primero. */
  prioridad: boolean
  /** Almacenaje vencido o por vencer (≤ 5 días) en alguna candidata. */
  almacenajeApura: boolean
}

const ordenItem = (a: ListaItem, b: ListaItem): number => {
  const peso = (i: ListaItem) => i.marca === 'prioridad' ? 0 : i.marca === 'stand_by' ? 2 : 1
  const d = peso(a) - peso(b)
  if (d !== 0) return d
  return (b.diasEsperando ?? -1) - (a.diasEsperando ?? -1)
}

export function listasParaCamion(rows: LclRow[], hoyISO: string, refsEnCamion: Set<string>): GrupoFiscal[] {
  const candidatas = rows
    .filter(s => !refsEnCamion.has(REF(s.ref)))
    .filter(s => estadoLcl({ ref: s.ref, eta: s.eta, stock: s.stock, desconsol: s.desconsol_date }, hoyISO) === 'con_stock')

  const porFiscal = new Map<string | null, Map<string | null, ListaItem[]>>()
  for (const row of candidatas) {
    const fiscal = txt(row.fiscal).toUpperCase() || null
    const deposito = txt(row.deposito).toUpperCase() || null
    const item: ListaItem = {
      row,
      diasEsperando: diasEsperando({ ref: row.ref, stock: row.stock, desconsol: row.desconsol_date }, hoyISO),
      almacenaje: almacenaje({ ref: row.ref, desconsol: row.desconsol_date }, hoyISO),
      marca: row.marca_cliente ?? null,
    }
    const deps = porFiscal.get(fiscal) || new Map<string | null, ListaItem[]>()
    const arr = deps.get(deposito) || []
    arr.push(item)
    deps.set(deposito, arr)
    porFiscal.set(fiscal, deps)
  }

  const grupos: GrupoFiscal[] = []
  for (const [fiscal, deps] of porFiscal) {
    const depositos: GrupoDeposito[] = []
    for (const [deposito, items] of deps) {
      items.sort(ordenItem)
      const cand = items.filter(i => i.marca !== 'stand_by')
      depositos.push({
        deposito,
        items,
        m3: cand.reduce((s, i) => s + num(i.row.m3), 0),
        kg: cand.reduce((s, i) => s + num(i.row.kg), 0),
      })
    }
    depositos.sort((a, b) => {
      if (a.deposito === null) return 1
      if (b.deposito === null) return -1
      return b.m3 - a.m3
    })
    const todos = depositos.flatMap(d => d.items)
    const cand = todos.filter(i => i.marca !== 'stand_by')
    grupos.push({
      fiscal,
      depositos,
      cargas: cand.length,
      m3: depositos.reduce((s, d) => s + d.m3, 0),
      kg: depositos.reduce((s, d) => s + d.kg, 0),
      standBy: todos.length - cand.length,
      prioridad: cand.some(i => i.marca === 'prioridad'),
      almacenajeApura: cand.some(i => i.almacenaje && i.almacenaje.diasRestantes <= 5),
    })
  }
  return grupos.sort((a, b) => {
    if (a.prioridad !== b.prioridad) return a.prioridad ? -1 : 1
    if (a.fiscal === null) return 1
    if (b.fiscal === null) return -1
    return b.m3 - a.m3
  })
}

// ── Card 4: camiones LCL ────────────────────────────────────────────────

export interface CamionLcl {
  truck: Truck
  info: { status: TruckStatus; label: string; hoy: boolean }
  /** Cargas confirmadas (más las marcadas para quitar, que siguen siendo del camión hasta guardar). */
  loads: TruckLoad[]
  lclRefs: string[]
  totals: TruckTotals
}

const ORDEN_STATUS: Record<TruckStatus, number> = { in_transit: 0, loaded: 1, planning: 2, delivered: 3 }

/** Camiones publicados con alguna carga LCL que todavía no llegaron a fiscal. */
export function camionesLcl(trucks: Truck[], loads: TruckLoad[], hoy: Date): CamionLcl[] {
  const dia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const out: CamionLcl[] = []
  for (const t of trucks) {
    if (!t || t.draft) continue
    const mine = effectiveTruckLoads(loads, t.id, { includePending: false })
    const lclRefs = mine.filter(l => l.sourceType === 'lcl').map(l => txt(l.sourceRef)).filter(Boolean)
    if (lclRefs.length === 0) continue
    const info = deriveTruckDisplayInfo(t, dia)
    if (info.status === 'delivered') continue
    out.push({ truck: t, info, loads: mine, lclRefs, totals: computeTruckTotals(t, mine) })
  }
  return out.sort((a, b) =>
    ORDEN_STATUS[a.info.status] - ORDEN_STATUS[b.info.status]
    || String(a.truck.loadDate || '9999').localeCompare(String(b.truck.loadDate || '9999'))
    || String(a.truck.code).localeCompare(String(b.truck.code)))
}

// ── Card 5: datos faltantes ─────────────────────────────────────────────

export type CampoFaltanteLcl = 'cliente' | 'eta' | 'fiscal' | 'bl' | 'kg' | 'm3'

export const CAMPO_FALTANTE_LABEL: Record<CampoFaltanteLcl, string> = {
  cliente: 'Sin cliente',
  eta: 'Sin ETA a Montevideo',
  fiscal: 'Sin destino fiscal',
  bl: 'Sin BL',
  kg: 'Sin kilos',
  m3: 'Sin m³',
}

/** Orden en que se muestran: primero lo que impide identificar la carga,
 *  después lo que impide armar el camión. */
export const CAMPOS_FALTANTES_LCL: CampoFaltanteLcl[] = ['cliente', 'eta', 'fiscal', 'bl', 'kg', 'm3']

export interface FaltantesPorCampo {
  campo: CampoFaltanteLcl
  label: string
  rows: LclRow[]
}

export interface FaltantesPorCarga {
  row: LclRow
  faltan: CampoFaltanteLcl[]
}

export interface DatosFaltantes {
  porCampo: FaltantesPorCampo[]
  porCarga: FaltantesPorCarga[]
  /** Cargas distintas con algo que completar. */
  total: number
}

export function faltantesDe(row: LclRow): CampoFaltanteLcl[] {
  const f: CampoFaltanteLcl[] = []
  if (vacio(row.cliente)) f.push('cliente')
  if (vacio(row.eta)) f.push('eta')
  if (vacio(row.fiscal)) f.push('fiscal')
  if (!blDe(row)) f.push('bl')
  if (num(row.kg) <= 0) f.push('kg')
  if (num(row.m3) <= 0) f.push('m3')
  return f
}

export function datosFaltantes(rows: LclRow[]): DatosFaltantes {
  const porCarga: FaltantesPorCarga[] = []
  const porCampo = new Map<CampoFaltanteLcl, LclRow[]>()
  for (const row of rows) {
    const faltan = faltantesDe(row)
    if (faltan.length === 0) continue
    porCarga.push({ row, faltan })
    for (const c of faltan) {
      const arr = porCampo.get(c) || []
      arr.push(row)
      porCampo.set(c, arr)
    }
  }
  return {
    porCampo: CAMPOS_FALTANTES_LCL
      .filter(c => porCampo.has(c))
      .map(c => ({ campo: c, label: CAMPO_FALTANTE_LABEL[c], rows: porCampo.get(c)! })),
    porCarga,
    total: porCarga.length,
  }
}
