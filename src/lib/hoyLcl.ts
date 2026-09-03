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
import { computeTruckTotals, deriveTruckDisplayInfo, effectiveTruckLoads, DIAS_CAMION_RECIENTE } from './truckTypes'
import { estadoLcl, almacenaje, diasEsperando, esLclMontevideo, type Almacenaje } from './lclEstados'
import { depositoSugerido, type DepositoSugerido } from './lclSugerencias'
import { reclamables, datosQueFaltan, type DatoClave } from './datosClave'
import { parseNum } from './lclAlta'

/** Lo mínimo de una fila `shipments` que estas derivaciones necesitan. Es un
 *  subconjunto de DbShipment para que los tests no tengan que armar la fila
 *  entera; en la app se le pasa el DbShipment tal cual. */
export type LclRow = Pick<DbShipment, 'id' | 'ref' | 'mode' | 'archived'> &
  Partial<Pick<DbShipment,
    'cliente' | 'doc_number' | 'hbl' | 'pkgs' | 'kg' | 'm3' | 'stock' | 'desconsol_date' |
    'fiscal' | 'deposito' | 'eta' | 'marca_cliente' | 'marca_motivo' | 'wood' |
    'entrega_planta' | 'imo' | 'no_apilable' | 'agente' | 'discharge_port' | 'dest_country'
  >>

const REF = (r: unknown): string => String(r ?? '').trim().toUpperCase()
const txt = (v: unknown): string => String(v ?? '').trim()
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

/** LCL vivas para Montevideo: las del universo `esLclMontevideo` (LCL, no
 *  archivada, ni país AR ni puerto que no sea Montevideo — el bloque LCL
 *  BUENOS AIRES de la planilla no pasa por acá) cuyo camión no salió todavía.
 *  Mismo criterio que las sugerencias de camión: una carga que HOY no ve,
 *  tampoco se propone. */
export function lclActivas<T extends LclRow>(rows: T[], refsDespachadas: Set<string>): T[] {
  return rows.filter(s => esLclMontevideo(s) && !refsDespachadas.has(REF(s.ref)))
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
  /** El depósito de la fila no está cargado: se supone por el agente (CRAFT→PLANIR, SACO→TCP). */
  depositoSupuesto: boolean
}

export interface GrupoDeposito {
  /** null = sin depósito cargado ni agente que lo sugiera. */
  deposito: string | null
  /** Alguna carga del grupo entró con el depósito supuesto por agente. */
  supuesto: boolean
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
    // Mismo criterio que las sugerencias de camión: depósito real, o el que
    // sugiere el agente (marcado), o "sin depósito".
    const dep = depositoSugerido(row.agente, row.deposito)
    const deposito = dep?.deposito ?? null
    const item: ListaItem = {
      row,
      diasEsperando: diasEsperando({ ref: row.ref, stock: row.stock, desconsol: row.desconsol_date }, hoyISO),
      almacenaje: almacenaje({ ref: row.ref, desconsol: row.desconsol_date }, hoyISO),
      marca: row.marca_cliente ?? null,
      depositoSupuesto: !!dep?.supuesto,
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
        supuesto: items.some(i => i.depositoSupuesto),
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

/** Umbral compartido con HOY FCL — vive en truckTypes. */
export { DIAS_CAMION_RECIENTE }

/** Camiones publicados con alguna carga LCL que todavía no llegaron a fiscal
 *  y que salieron hace poco (o no salieron). */
export function camionesLcl(trucks: Truck[], loads: TruckLoad[], hoy: Date): CamionLcl[] {
  const dia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const hoyISO = fechaISO(dia)
  const out: CamionLcl[] = []
  for (const t of trucks) {
    if (!t || t.draft) continue
    const mine = effectiveTruckLoads(loads, t.id, { includePending: false })
    const lclRefs = mine.filter(l => l.sourceType === 'lcl').map(l => txt(l.sourceRef)).filter(Boolean)
    if (lclRefs.length === 0) continue
    const info = deriveTruckDisplayInfo(t, dia)
    if (info.status === 'delivered') continue
    const salida = txt(t.departureDate).slice(0, 10)
    if (salida && diasEntre(salida, hoyISO) > DIAS_CAMION_RECIENTE) continue
    out.push({ truck: t, info, loads: mine, lclRefs, totals: computeTruckTotals(t, mine) })
  }
  return out.sort((a, b) =>
    ORDEN_STATUS[a.info.status] - ORDEN_STATUS[b.info.status]
    || String(a.truck.loadDate || '9999').localeCompare(String(b.truck.loadDate || '9999'))
    || String(a.truck.code).localeCompare(String(b.truck.code)))
}

// ── Card 5: datos faltantes ─────────────────────────────────────────────
//
// QUÉ se reclama lo dice la lista única lib/datosClave (DATOS_CLAVE.lcl con
// reclamable=true): bultos, kilos, m³, fiscal, madera sin confirmar, llegada
// a Montevideo y depósito de desconsolidación. IMO y entrega en planta son
// tildes (false es un valor) — se muestran para editarlas, no se reclaman.

/** Columnas reclamables de una LCL (subconjunto de DATOS_CLAVE.lcl). */
export type CampoFaltanteLcl = 'fiscal' | 'pkgs' | 'kg' | 'm3' | 'wood' | 'eta' | 'deposito'

/** Los datos que se reclaman, en el orden de la lista única. */
export const CAMPOS_FALTANTES_LCL: DatoClave[] = reclamables('lcl')

/** Etiqueta corta "Sin …" para el título/contadores. */
export const CAMPO_FALTANTE_LABEL: Record<CampoFaltanteLcl, string> = {
  fiscal: 'Sin destino fiscal',
  pkgs: 'Sin bultos',
  kg: 'Sin kilos',
  m3: 'Sin m³',
  wood: 'Madera a confirmar',
  eta: 'Sin llegada a Montevideo',
  deposito: 'Sin depósito de desconsolidación',
}

export interface FaltantesPorCampo {
  campo: CampoFaltanteLcl
  label: string
  rows: LclRow[]
}

export interface FaltantesPorCarga {
  row: LclRow
  /** Datos clave que faltan, en el orden de la lista. */
  faltan: DatoClave[]
  /** Ya llegó (eta pasada) o llega dentro de la ventana: va primero. */
  urgente: boolean
  /** Días hasta la llegada (negativo = ya llegó); null sin ETA. */
  diasAEta: number | null
  /** Depósito que sugiere el agente cuando el campo está vacío (chip con click). */
  depositoSugerido: DepositoSugerido | null
}

export interface DatosFaltantes {
  /** Contadores por tipo de dato, en el orden de la lista (solo los que tienen algo). */
  porCampo: FaltantesPorCampo[]
  /** Una entrada por carga incompleta: primero las urgentes (llegaron o llegan en la ventana). */
  porCarga: FaltantesPorCarga[]
  /** Cargas distintas con algo que completar. */
  total: number
  /** Cuántas de esas ya llegaron o llegan en la ventana. */
  urgentes: number
}

/** Las cargas a las que les falta ESTE dato. Con 147 LCL sin fiscal, la lista
 *  entera no sirve: hay que poder quedarse con un solo tipo de falta (Brian
 *  03/09: "ponerlas como alerta en datos a completar, o una marquita de por
 *  favor completar fiscales"). `null` = sin filtro, la lista completa. */
export function filtrarPorCampoFaltante(
  porCarga: FaltantesPorCarga[],
  campo: string | null,
): FaltantesPorCarga[] {
  if (!campo) return porCarga
  return porCarga.filter(fc => fc.faltan.some(d => d.key === campo))
}

export function faltantesDe(row: LclRow): DatoClave[] {
  return datosQueFaltan('lcl', row as unknown as Record<string, unknown>)
}

/**
 * Qué le falta a cada LCL activa. Orden: primero las que ya llegaron y las que
 * llegan dentro de `diasVentana` (la más próxima a llegar / la que más hace que
 * llegó primero); después el resto por ETA; sin ETA al final de cada bloque.
 */
export function datosFaltantes(rows: LclRow[], hoyISO: string, diasVentana = 7): DatosFaltantes {
  const porCarga: FaltantesPorCarga[] = []
  const porCampo = new Map<CampoFaltanteLcl, LclRow[]>()
  for (const row of rows) {
    const faltan = faltantesDe(row)
    if (faltan.length === 0) continue
    const eta = txt(row.eta).slice(0, 10)
    const diasAEta = eta ? diasEntre(hoyISO, eta) : null
    const urgente = diasAEta !== null && diasAEta <= diasVentana
    const dep = depositoSugerido(row.agente, row.deposito)
    porCarga.push({
      row, faltan, urgente, diasAEta,
      depositoSugerido: dep && dep.supuesto ? dep : null,
    })
    for (const d of faltan) {
      const c = d.key as CampoFaltanteLcl
      const arr = porCampo.get(c) || []
      arr.push(row)
      porCampo.set(c, arr)
    }
  }
  porCarga.sort((a, b) => {
    if (a.urgente !== b.urgente) return a.urgente ? -1 : 1
    const da = a.diasAEta ?? Number.POSITIVE_INFINITY, db = b.diasAEta ?? Number.POSITIVE_INFINITY
    if (da !== db) return da - db
    return String(a.row.ref).localeCompare(String(b.row.ref))
  })
  return {
    porCampo: CAMPOS_FALTANTES_LCL
      .map(d => d.key as CampoFaltanteLcl)
      .filter(c => porCampo.has(c))
      .map(c => ({ campo: c, label: CAMPO_FALTANTE_LABEL[c], rows: porCampo.get(c)! })),
    porCarga,
    total: porCarga.length,
    urgentes: porCarga.filter(x => x.urgente).length,
  }
}

// ── Completar inline: del texto tipeado al PATCH ───────────────────────

export type PatchFaltante =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; error: string }

const anioValido = (iso: string): boolean => {
  const y = Number(iso.slice(0, 4))
  return y >= 2015 && y <= 2100
}

/**
 * Valida lo tipeado en la card "Datos faltantes" y arma el patch de
 * `shipments`. Puro: la UI llama onPatchShipment con el resultado.
 *  - pkgs/kg/m3: número > 0 ("1.250,5" → 1250.5; bultos redondeados)
 *  - eta: YYYY-MM-DD con año razonable
 *  - fiscal/deposito: texto en MAYÚSCULAS
 *  - wood: 'si' | 'no' → true | false (no hay forma de volver a "a confirmar" desde acá)
 */
export function patchFaltanteLcl(campo: CampoFaltanteLcl, crudo: string): PatchFaltante {
  const texto = String(crudo ?? '').trim()
  if (!texto) return { ok: false, error: 'Vacío' }
  switch (campo) {
    case 'pkgs':
    case 'kg':
    case 'm3': {
      const n = parseNum(texto)
      const final = campo === 'pkgs' ? Math.round(n) : n
      if (!Number.isFinite(final) || final <= 0) return { ok: false, error: 'Número inválido' }
      return { ok: true, patch: { [campo]: final } }
    }
    case 'eta': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(texto) || !anioValido(texto)) return { ok: false, error: 'Fecha inválida' }
      return { ok: true, patch: { eta: texto } }
    }
    case 'wood': {
      const v = texto.toLowerCase()
      if (v === 'si' || v === 'sí' || v === 'true') return { ok: true, patch: { wood: true } }
      if (v === 'no' || v === 'false') return { ok: true, patch: { wood: false } }
      return { ok: false, error: 'Madera: Sí o No' }
    }
    case 'fiscal':
    case 'deposito':
      return { ok: true, patch: { [campo]: texto.toUpperCase() } }
  }
}
