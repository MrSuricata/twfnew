/**
 * Sugerencias para armar camión con LCL (Brian 31/08/2026: "que recomiende
 * cargas LCL para armar camión").
 *
 * La unidad de una propuesta es (FISCAL argentino, DEPÓSITO uruguayo): allá
 * descarga el camión, acá carga. Brian (01/09): "el depósito de
 * desconsolidación normalmente va a ser el depósito del cual salga el camión".
 * Sumar un segundo depósito "se evita pero se hace si conviene" — se propone
 * marcando que es una parada más.
 *
 * Depósito sin cargar: "normalmente las que desconsolidan en PLANIR vienen con
 * el agente CRAFT y las de TCP con el agente SACO". Es un normalmente, no una
 * verdad: la carga entra a la propuesta del depósito SUPUESTO por el agente,
 * marcada como tal, y en HOY se ofrece con un click — nunca se escribe sola.
 * Sin agente ni depósito, la carga no se propone: va a la lista "sin
 * depósito, completar antes de armar".
 *
 * Los tres relojes que apuran una carga (spec consolidados LCL):
 *   - almacenaje: 30 días desde la desconsolidación (lclEstados.almacenaje)
 *   - días parada: desde que tiene stock (lclEstados.diasEsperando)
 *   - la marca del cliente: prioridad pesa más que llenar el camión; stand_by
 *     la saca de las candidatas.
 *
 * Todo puro: sin React, sin fetch. La UI (SugerenciasCamion) y el armador
 * (TruckBuilder) llaman esto con las shipments que ya tienen cargadas.
 * Nada de acá bloquea: son propuestas y avisos.
 */
import {
  estadoLcl, almacenaje, diasEsperando, sumarDias,
  type Almacenaje,
} from './lclEstados'

// ── Entrada ────────────────────────────────────────────────────────────

/** Lo mínimo que hace falta de una fila de `shipments`. DbShipment lo cumple
 *  estructuralmente; los tests usan objetos sueltos. */
export interface CargaLclFuente {
  id?: string
  ref: string
  cliente?: string | null
  mode?: string | null
  archived?: boolean | null
  fiscal?: string | null
  deposito?: string | null
  /** Agente de origen (CRAFT, SACO…): sugiere el depósito cuando falta. */
  agente?: string | null
  kg?: number | string | null
  m3?: number | string | null
  pkgs?: number | string | null
  wood?: boolean | null
  no_apilable?: boolean | null
  imo?: boolean | null
  entrega_planta?: boolean | null
  /** Llegada a Montevideo. */
  eta?: string | null
  stock?: string | null
  desconsol_date?: string | null
  marca_cliente?: string | null
}

export interface Limites { kgMax: number; m3Max: number }

// ── Constantes de negocio ──────────────────────────────────────────────

/** Almacenaje "por vencer": lo que queda del mes libre y ya hay que moverse. */
export const ALMACENAJE_POR_VENCER_DIAS = 5
/** Llenado a partir del cual el camión ya "está" (misma barra que el armador). */
export const LLENO_PCT = 0.8
/** Llenado desde el cual conviene buscar con qué completar en vez de esperar. */
export const MEDIO_PCT = 0.5
/** Mejora mínima de llenado (fracción del m³ máximo) para proponer una parada más. */
export const MEJORA_MINIMA_PCT = 0.15
/** Días que se miran hacia adelante al publicar un camión con lugar libre. */
export const AVISO_VENTANA_DIAS = 3
/** Días parada a partir de los cuales se anota "esperando hace N días". */
export const ESPERA_LARGA_DIAS = 7

export const SIN_FISCAL = 'SIN FISCAL'
export const SIN_DEPOSITO = 'SIN DEPÓSITO'

// ── Helpers ────────────────────────────────────────────────────────────

const norm = (v: unknown): string => String(v ?? '').trim().toUpperCase()
const ref = (v: unknown): string => norm(v)

/** "1.500" → 1500 · "12,5" → 12.5 · basura → 0. */
export const aNumero = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v ?? '').trim()
  if (!s) return 0
  // Formato rioplatense: punto de miles, coma decimal. Si hay coma, el punto
  // es de miles; si solo hay un punto y ≤3 decimales, se toma como decimal.
  const limpio = s.includes(',') ? s.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s
  const n = Number(limpio)
  return Number.isFinite(n) ? n : 0
}

const esLcl = (s: CargaLclFuente): boolean => norm(s.mode) === 'LCL' && !s.archived

const fmtM3 = (n: number): string => {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',')
}

const fmtDMY = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[3]}/${m[2]}` : iso
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
/** "miércoles 02/09" — para leer el aviso de un saque. */
export const nombreDia = (iso: string): string => {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  const f = new Date(a, (m || 1) - 1, d || 1)
  return `${DIAS_SEMANA[f.getDay()]} ${fmtDMY(iso)}`
}

const esUrgenteAlmacenaje = (a: Almacenaje | null): boolean =>
  !!a && a.diasRestantes <= ALMACENAJE_POR_VENCER_DIAS

const textoAlmacenaje = (r: string, a: Almacenaje): string => {
  if (a.vencido) return `${r}: almacenaje vencido hace ${-a.diasRestantes} días`
  if (a.diasRestantes === 0) return `${r}: almacenaje vence hoy`
  if (a.diasRestantes === 1) return `${r}: almacenaje vence mañana`
  return `${r}: almacenaje vence en ${a.diasRestantes} días`
}

// ── Depósito sugerido por agente ───────────────────────────────────────

/** Regla de Brian (01/09/2026): agente → depósito de desconsolidación. Es
 *  "normalmente": se sugiere, nunca se escribe sin un click. */
export const DEPOSITO_POR_AGENTE: readonly { agente: string; deposito: string }[] = [
  { agente: 'CRAFT', deposito: 'PLANIR' },
  { agente: 'SACO', deposito: 'TCP' },
]

export interface DepositoSugerido {
  deposito: string
  /** true = no está cargado, se supone por el agente. */
  supuesto: boolean
  /** El agente que lo sugiere (solo cuando supuesto). */
  agente?: string
}

/**
 * Depósito a usar para agrupar/proponer: el real si está cargado (supuesto
 * false); si no, el que sugiere el agente (supuesto true); null si no hay
 * ni uno ni otro.
 */
export function depositoSugerido(agente: unknown, deposito: unknown): DepositoSugerido | null {
  const real = norm(deposito)
  if (real) return { deposito: real, supuesto: false }
  const ag = norm(agente)
  if (!ag) return null
  const regla = DEPOSITO_POR_AGENTE.find(r => ag.includes(r.agente))
  return regla ? { deposito: regla.deposito, supuesto: true, agente: regla.agente } : null
}

// ── Candidatas ─────────────────────────────────────────────────────────

export interface Candidata<T extends CargaLclFuente = CargaLclFuente> {
  id?: string
  ref: string
  cliente: string
  fiscal: string
  /** Depósito real o supuesto por agente; SIN_DEPOSITO si no hay ninguno. */
  deposito: string
  /** true = el depósito no está cargado y se supone por el agente. */
  depositoSupuesto: boolean
  /** Agente que justifica el supuesto (CRAFT / SACO). */
  agenteDeposito: string | null
  kg: number
  m3: number
  pkgs: number
  wood: boolean | null
  no_apilable: boolean
  imo: boolean
  entrega_planta: boolean
  prioridad: boolean
  diasEsperando: number | null
  almacenaje: Almacenaje | null
  /** La fila original, para que la UI la suba al camión con el flujo existente. */
  fuente: T
}

export interface ContextoCandidatas {
  hoy: string
  /** Refs (normalizadas) que ya viajan en algún camión: no se vuelven a proponer. */
  refsEnCamion: Set<string>
}

const aCandidata = <T extends CargaLclFuente>(s: T, hoy: string): Candidata<T> => {
  const base = { ref: s.ref, eta: s.eta, stock: s.stock, desconsol: s.desconsol_date }
  const dep = depositoSugerido(s.agente, s.deposito)
  return {
    id: s.id,
    ref: String(s.ref || '').trim(),
    cliente: String(s.cliente || '').trim(),
    fiscal: norm(s.fiscal) || SIN_FISCAL,
    deposito: dep?.deposito ?? SIN_DEPOSITO,
    depositoSupuesto: !!dep?.supuesto,
    agenteDeposito: dep?.agente ?? null,
    kg: aNumero(s.kg),
    m3: aNumero(s.m3),
    pkgs: aNumero(s.pkgs),
    wood: s.wood ?? null,
    no_apilable: !!s.no_apilable,
    imo: !!s.imo,
    entrega_planta: !!s.entrega_planta,
    prioridad: norm(s.marca_cliente) === 'PRIORIDAD',
    diasEsperando: diasEsperando(base, hoy),
    almacenaje: almacenaje(base, hoy),
    fuente: s,
  }
}

/**
 * LCL que HOY pueden subir a un camión: activas, con stock, sin stand by del
 * cliente y fuera de todo camión.
 */
export function candidatasLcl<T extends CargaLclFuente>(shipments: T[], ctx: ContextoCandidatas): Candidata<T>[] {
  const out: Candidata<T>[] = []
  for (const s of shipments) {
    if (!esLcl(s)) continue
    if (norm(s.marca_cliente) === 'STAND_BY') continue
    const r = ref(s.ref)
    if (!r || ctx.refsEnCamion.has(r)) continue
    const estado = estadoLcl(
      { ref: s.ref, eta: s.eta, stock: s.stock, desconsol: s.desconsol_date },
      ctx.hoy,
    )
    if (estado !== 'con_stock') continue
    out.push(aCandidata(s, ctx.hoy))
  }
  return out
}

/** Las candidatas que no tienen depósito ni agente que lo sugiera: no entran
 *  a ninguna propuesta hasta que alguien complete el depósito. */
export function candidatasSinDeposito<T extends CargaLclFuente>(candidatas: Candidata<T>[]): Candidata<T>[] {
  return candidatas.filter(c => c.deposito === SIN_DEPOSITO)
}

// ── Orden de urgencia ──────────────────────────────────────────────────

/** Prioridad → almacenaje vencido/por vencer (el más apurado primero) → más
 *  días esperando → más m³. Es el orden en que se llena el camión. */
export function compararUrgencia(a: Candidata, b: Candidata): number {
  if (a.prioridad !== b.prioridad) return a.prioridad ? -1 : 1
  const ua = esUrgenteAlmacenaje(a.almacenaje), ub = esUrgenteAlmacenaje(b.almacenaje)
  if (ua !== ub) return ua ? -1 : 1
  if (ua && ub) {
    const d = (a.almacenaje!.diasRestantes) - (b.almacenaje!.diasRestantes)
    if (d !== 0) return d
  }
  const ea = a.diasEsperando ?? -1, eb = b.diasEsperando ?? -1
  if (ea !== eb) return eb - ea
  if (a.m3 !== b.m3) return b.m3 - a.m3
  return a.ref.localeCompare(b.ref)
}

// ── Propuestas ─────────────────────────────────────────────────────────

export type Sugerencia = 'salir' | 'esperar' | 'completar'

export interface Propuesta {
  /** `${fiscal}|${depositos.join('+')}` — estable para keys de UI. */
  id: string
  fiscal: string
  /** Depósitos UY donde carga, en orden de parada. Normalmente uno. */
  depositos: string[]
  cargas: Candidata[]
  kg: number
  m3: number
  pkgs: number
  /** 0–1 (puede pasar de 1 solo si el límite es 0). */
  ocupacionM3: number
  ocupacionKg: number
  /** Frases cortas en español para mostrar al lado. */
  motivos: string[]
  sugerencia: Sugerencia
  /** true = la misma propuesta sumando otro depósito (una parada más). */
  alternativa: boolean
  /** Alguna carga entró con el depósito SUPUESTO por su agente (no cargado). */
  depositoSupuesto: boolean
  /** Refs del mismo (fiscal, depósito) que no entraron por kg/m³. */
  noEntran: string[]
}

export interface OpcionesSugerir { limites: Limites }

interface Llenado { cargas: Candidata[]; kg: number; m3: number; noEntran: string[] }

/** Greedy en orden de urgencia: entra si no pasa ni kg ni m³. */
function llenar(candidatas: Candidata[], lim: Limites, base: Llenado = { cargas: [], kg: 0, m3: 0, noEntran: [] }): Llenado {
  const orden = [...candidatas].sort(compararUrgencia)
  const out: Llenado = { cargas: [...base.cargas], kg: base.kg, m3: base.m3, noEntran: [...base.noEntran] }
  for (const c of orden) {
    if (out.kg + c.kg <= lim.kgMax && out.m3 + c.m3 <= lim.m3Max) {
      out.cargas.push(c); out.kg += c.kg; out.m3 += c.m3
    } else {
      out.noEntran.push(c.ref)
    }
  }
  return out
}

function motivosDe(cargas: Candidata[], lim: Limites): { motivos: string[]; urgente: boolean } {
  const motivos: string[] = []
  const prio = cargas.filter(c => c.prioridad)
  if (prio.length) motivos.push(`${prio.length} con prioridad del cliente: ${prio.map(c => c.ref).join(', ')}`)
  const urgentes = cargas
    .filter(c => esUrgenteAlmacenaje(c.almacenaje))
    .sort((a, b) => a.almacenaje!.diasRestantes - b.almacenaje!.diasRestantes)
  for (const c of urgentes) motivos.push(textoAlmacenaje(c.ref, c.almacenaje!))
  const largas = cargas.filter(c => (c.diasEsperando ?? 0) >= ESPERA_LARGA_DIAS)
  if (largas.length) {
    const m3 = largas.reduce((a, c) => a + c.m3, 0)
    const max = Math.max(...largas.map(c => c.diasEsperando ?? 0))
    motivos.push(`${fmtM3(m3)} m³ esperando hace ${max} días`)
  }
  const m3 = cargas.reduce((a, c) => a + c.m3, 0)
  const kg = cargas.reduce((a, c) => a + c.kg, 0)
  const pctM3 = lim.m3Max > 0 ? m3 / lim.m3Max : 0
  const pctKg = lim.kgMax > 0 ? kg / lim.kgMax : 0
  if (pctM3 >= LLENO_PCT) motivos.push(`Camión al ${Math.round(pctM3 * 100)} % en volumen`)
  else if (pctKg >= LLENO_PCT) motivos.push(`Camión al ${Math.round(pctKg * 100)} % en peso`)
  const supuestas = cargas.filter(c => c.depositoSupuesto)
  if (supuestas.length) {
    const porAgente = new Map<string, string[]>()
    for (const c of supuestas) {
      const ag = c.agenteDeposito || 'agente'
      porAgente.set(ag, [...(porAgente.get(ag) ?? []), c.ref])
    }
    for (const [ag, refs] of porAgente) {
      motivos.push(`Depósito supuesto por agente ${ag} (sin cargar): ${refs.join(', ')}`)
    }
  }
  const especiales: string[] = []
  const imo = cargas.filter(c => c.imo).length
  const noAp = cargas.filter(c => c.no_apilable).length
  const madera = cargas.filter(c => c.wood === true).length
  if (imo) especiales.push(`${imo} IMO`)
  if (noAp) especiales.push(`${noAp} no apilable`)
  if (madera) especiales.push(`${madera} con madera (SENASA)`)
  if (especiales.length) motivos.push(especiales.join(' · '))
  return { motivos, urgente: prio.length > 0 || urgentes.length > 0 }
}

function sugerenciaDe(urgente: boolean, ocM3: number, ocKg: number): Sugerencia {
  if (urgente) return 'salir'
  const oc = Math.max(ocM3, ocKg)
  if (oc >= LLENO_PCT) return 'salir'
  if (oc >= MEDIO_PCT) return 'completar'
  return 'esperar'
}

function armar(fiscal: string, depositos: string[], ll: Llenado, lim: Limites, alternativa: boolean, motivosExtra: string[] = []): Propuesta {
  const { motivos, urgente } = motivosDe(ll.cargas, lim)
  const ocupacionM3 = lim.m3Max > 0 ? ll.m3 / lim.m3Max : 0
  const ocupacionKg = lim.kgMax > 0 ? ll.kg / lim.kgMax : 0
  return {
    id: `${fiscal}|${depositos.join('+')}`,
    fiscal,
    depositos,
    cargas: ll.cargas,
    kg: ll.kg,
    m3: ll.m3,
    pkgs: ll.cargas.reduce((a, c) => a + c.pkgs, 0),
    ocupacionM3,
    ocupacionKg,
    motivos: [...motivosExtra, ...motivos],
    sugerencia: sugerenciaDe(urgente, ocupacionM3, ocupacionKg),
    alternativa,
    depositoSupuesto: ll.cargas.some(c => c.depositoSupuesto),
    noEntran: ll.noEntran,
  }
}

const PESO_SUGERENCIA: Record<Sugerencia, number> = { salir: 0, completar: 1, esperar: 2 }

function compararPropuestas(a: Propuesta, b: Propuesta): number {
  const s = PESO_SUGERENCIA[a.sugerencia] - PESO_SUGERENCIA[b.sugerencia]
  if (s !== 0) return s
  const pa = a.cargas.filter(c => c.prioridad).length, pb = b.cargas.filter(c => c.prioridad).length
  if (pa !== pb) return pb - pa
  const minAlm = (p: Propuesta) => Math.min(...p.cargas.map(c => c.almacenaje?.diasRestantes ?? Infinity))
  const ma = minAlm(a), mb = minAlm(b)
  if (ma !== mb) return ma - mb
  const maxEsp = (p: Propuesta) => Math.max(...p.cargas.map(c => c.diasEsperando ?? -1))
  const ea = maxEsp(a), eb = maxEsp(b)
  if (ea !== eb) return eb - ea
  if (a.m3 !== b.m3) return b.m3 - a.m3
  return a.id.localeCompare(b.id)
}

/**
 * Un camión por (fiscal, depósito), lleno en orden de urgencia sin pasar los
 * límites. Para cada fiscal con más de un depósito, si sumando los otros al
 * mejor camión se gana bastante llenado, se agrega una propuesta alternativa
 * que lo dice con el costo: "Es una parada más".
 */
export function sugerirCamiones(candidatas: Candidata[], opts: OpcionesSugerir): Propuesta[] {
  const lim = opts.limites
  const porFiscal = new Map<string, Map<string, Candidata[]>>()
  for (const c of candidatas) {
    // Sin depósito (ni real ni supuesto) no hay de dónde cargar: no se propone.
    if (c.deposito === SIN_DEPOSITO) continue
    const deps = porFiscal.get(c.fiscal) ?? new Map<string, Candidata[]>()
    deps.set(c.deposito, [...(deps.get(c.deposito) ?? []), c])
    porFiscal.set(c.fiscal, deps)
  }

  const bases: Propuesta[] = []
  const alternativas = new Map<string, Propuesta>()   // id base → alternativa

  for (const [fiscal, deps] of porFiscal) {
    const delFiscal: Propuesta[] = []
    for (const [deposito, cargas] of deps) {
      const ll = llenar(cargas, lim)
      if (ll.cargas.length === 0) continue
      delFiscal.push(armar(fiscal, [deposito], ll, lim, false))
    }
    bases.push(...delFiscal)

    // ¿Vale la pena la parada extra? Se prueba sobre el camión más lleno del fiscal.
    if (delFiscal.length < 2) continue
    const base = [...delFiscal].sort((a, b) => b.m3 - a.m3)[0]
    // Si el camión base ya "está" (≥ LLENO_PCT), la sugerencia es salir: no se
    // propone una parada más para pasar de 82 % a 97 %.
    if (base.ocupacionM3 >= LLENO_PCT) continue
    const otros = delFiscal.filter(p => p !== base).sort((a, b) => b.m3 - a.m3)
    let ll: Llenado = { cargas: base.cargas, kg: base.kg, m3: base.m3, noEntran: [] }
    const sumados: string[] = []
    for (const o of otros) {
      const antes = ll.m3
      const despues = llenar(deps.get(o.depositos[0]) ?? [], lim, ll)
      if (despues.m3 > antes) { ll = despues; sumados.push(o.depositos[0]) }
    }
    const mejora = lim.m3Max > 0 ? (ll.m3 - base.m3) / lim.m3Max : 0
    if (sumados.length === 0 || mejora < MEJORA_MINIMA_PCT) continue
    const paradas = sumados.length === 1 ? 'Es una parada más.' : `Son ${sumados.length} paradas más.`
    const motivo = `Sumando ${sumados.join(' y ')} llegás a ${fmtM3(ll.m3)} m³. ${paradas}`
    alternativas.set(base.id, armar(fiscal, [...base.depositos, ...sumados], { ...ll, noEntran: [] }, lim, true, [motivo]))
  }

  bases.sort(compararPropuestas)
  const out: Propuesta[] = []
  for (const b of bases) {
    out.push(b)
    const alt = alternativas.get(b.id)
    if (alt) out.push(alt)
  }
  return out
}

// ── Previsión por fiscal ───────────────────────────────────────────────

export interface VolumenPorDeposito { total: number; porDeposito: Record<string, number> }

export interface LlegadaDia extends VolumenPorDeposito { fecha: string }

export interface PrevisionFiscal {
  fiscal: string
  /** Todos los depósitos que aparecen, ordenados alfabéticamente. */
  depositos: string[]
  /** Con stock hoy, disponible para camión (sin stand by, fuera de camión). */
  conStock: VolumenPorDeposito
  /** Llegó y el depósito todavía no dio el stock: ya está, pero no se puede subir. */
  sinStock: VolumenPorDeposito
  /** Una entrada por día de la ventana (hoy+1 … hoy+dias), con ceros incluidos. */
  llegadas: LlegadaDia[]
  /** m³ que llegan en toda la ventana. */
  totalVentana: number
}

export interface OpcionesPrevision {
  hoy: string
  dias: number
  refsEnCamion?: Set<string>
}

const vacioVol = (): VolumenPorDeposito => ({ total: 0, porDeposito: {} })
const sumarVol = (v: VolumenPorDeposito, dep: string, m3: number) => {
  v.total += m3
  v.porDeposito[dep] = (v.porDeposito[dep] ?? 0) + m3
}

/**
 * La vista de la spec: por fiscal, cuánto hay hoy en cada depósito y cuánto
 * llega cada día de la ventana. Lo que llega sale de la ETA, tenga stock o no
 * — es previsión, no disponibilidad.
 */
export function previsionPorFiscal(shipments: CargaLclFuente[], opts: OpcionesPrevision): PrevisionFiscal[] {
  const refsEnCamion = opts.refsEnCamion ?? new Set<string>()
  const fechas: string[] = []
  for (let i = 1; i <= Math.max(0, opts.dias); i++) fechas.push(sumarDias(opts.hoy, i))
  const ultimo = fechas.length ? fechas[fechas.length - 1] : opts.hoy

  const porFiscal = new Map<string, PrevisionFiscal>()
  const fila = (fiscal: string): PrevisionFiscal => {
    let f = porFiscal.get(fiscal)
    if (!f) {
      f = {
        fiscal, depositos: [], conStock: vacioVol(), sinStock: vacioVol(),
        llegadas: fechas.map(fecha => ({ fecha, total: 0, porDeposito: {} })),
        totalVentana: 0,
      }
      porFiscal.set(fiscal, f)
    }
    return f
  }

  for (const s of shipments) {
    if (!esLcl(s)) continue
    if (refsEnCamion.has(ref(s.ref))) continue
    const c = aCandidata(s, opts.hoy)
    const estado = estadoLcl({ ref: s.ref, eta: s.eta, stock: s.stock, desconsol: s.desconsol_date }, opts.hoy)
    const standBy = norm(s.marca_cliente) === 'STAND_BY'
    const eta = String(s.eta || '').slice(0, 10)
    // Primero se decide a qué columna va; la fila del fiscal se crea solo si aporta algo.
    // El ESTADO manda: si tiene stock es disponible hoy (aunque la ETA cargada
    // sea futura — dato viejo o stock anticipado); es lo mismo que ve
    // sugerirCamiones, así la misma carga no aparece en una propuesta y a la
    // vez como "llega el jueves". Solo lo que no tiene stock se reparte por ETA.
    let destino: 'conStock' | 'sinStock' | 'llegada' | null = null
    if (estado === 'con_stock') { if (!standBy) destino = 'conStock' }
    else if (eta > opts.hoy) { if (eta <= ultimo) destino = 'llegada' }
    else if (estado === 'aguarda_stock') destino = 'sinStock'
    if (!destino) continue
    const f = fila(c.fiscal)
    if (destino === 'conStock') sumarVol(f.conStock, c.deposito, c.m3)
    else if (destino === 'sinStock') sumarVol(f.sinStock, c.deposito, c.m3)
    else {
      const dia = f.llegadas.find(l => l.fecha === eta)
      if (dia) { sumarVol(dia, c.deposito, c.m3); f.totalVentana += c.m3 }
    }
    if (!f.depositos.includes(c.deposito)) f.depositos.push(c.deposito)
  }

  const out = [...porFiscal.values()]
  for (const f of out) f.depositos.sort()
  const peso = (f: PrevisionFiscal) => f.conStock.total + f.sinStock.total + f.totalVentana
  out.sort((a, b) => peso(b) - peso(a) || a.fiscal.localeCompare(b.fiscal))
  return out
}

// ── Aviso al publicar ──────────────────────────────────────────────────

export interface CamionParaAviso {
  code?: string
  /** Refs de todas sus cargas (FCL incluidas: se filtran acá). */
  refs: string[]
  kg: number
  m3: number
  limites: Limites
  /** Fecha de salida (o de carga) si ya la tiene. Sin fecha se asume hoy. */
  departureDate?: string | null
}

export interface Aviso {
  tipo: 'esperar' | 'salir'
  texto: string
}

/**
 * Al publicar un camión con lugar libre: si viene carga del mismo fiscal y el
 * mismo depósito en los próximos días, pregunta si conviene correrlo. Pero si
 * alguna carga del camión tiene el almacenaje por vencer o es prioridad del
 * cliente, dice lo contrario: sacala ahora. Si no hay nada que esperar, no
 * hay decisión que avisar → null. Nunca bloquea.
 */
export function avisoAlPublicar(camion: CamionParaAviso, shipments: CargaLclFuente[], hoy: string): Aviso | null {
  const refsCamion = new Set(camion.refs.map(ref))
  const lcls = shipments.filter(esLcl)
  const enCamion = lcls.filter(s => refsCamion.has(ref(s.ref))).map(s => aCandidata(s, hoy))
  if (enCamion.length === 0) return null

  const fiscales = [...new Set(enCamion.map(c => c.fiscal))]
  const depositos = [...new Set(enCamion.map(c => c.deposito))]
  // Pares REALES (fiscal, depósito) de las cargas del camión: con dos fiscales
  // y dos depósitos, el producto cruzado (fiscal de una con depósito de otra)
  // no es "mismo fiscal y mismo depósito".
  const pares = new Set(enCamion.map(c => `${c.fiscal}|${c.deposito}`))
  const ocM3 = camion.limites.m3Max > 0 ? camion.m3 / camion.limites.m3Max : 1
  if (ocM3 >= LLENO_PCT) return null

  const salida = String(camion.departureDate || '').slice(0, 10)
  const base = salida && salida > hoy ? salida : hoy
  const hasta = sumarDias(base, AVISO_VENTANA_DIAS)

  const llegadas: Candidata[] = []
  const disponibles: Candidata[] = []
  for (const s of lcls) {
    const r = ref(s.ref)
    if (!r || refsCamion.has(r)) continue
    if (norm(s.marca_cliente) === 'STAND_BY') continue
    const c = aCandidata(s, hoy)
    if (!pares.has(`${c.fiscal}|${c.deposito}`)) continue
    const estado = estadoLcl({ ref: s.ref, eta: s.eta, stock: s.stock, desconsol: s.desconsol_date }, hoy)
    if (estado === 'con_stock') { disponibles.push(c); continue }
    const eta = String(s.eta || '').slice(0, 10)
    if ((estado === 'en_viaje' || estado === 'aguarda_stock') && eta >= hoy && eta <= hasta) llegadas.push(c)
  }
  if (llegadas.length === 0 && disponibles.length === 0) return null

  const va = `va a ${fiscales.join(' y ')}`
  const desde = `desde ${depositos.join(' y ')}`
  const cabecera = `Este camión ${va} y sale con ${fmtM3(camion.m3)} de ${fmtM3(camion.limites.m3Max)} m³ ${desde}.`

  // Llegadas agrupadas por día, en orden.
  const porDia = new Map<string, number>()
  for (const c of llegadas) {
    const eta = String(c.fuente.eta || '').slice(0, 10)
    porDia.set(eta, (porDia.get(eta) ?? 0) + c.m3)
  }
  const dias = [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b))
  const fraseLlegan = dias.length === 0 ? '' : dias.length === 1
    ? `El ${nombreDia(dias[0][0])} llegan ${fmtM3(dias[0][1])} m³ más para el mismo fiscal y el mismo depósito.`
    : `Llegan ${dias.map(([f, m]) => `${fmtM3(m)} m³ el ${nombreDia(f)}`).join(' y ')} para el mismo fiscal y el mismo depósito.`
  const m3Disp = disponibles.reduce((a, c) => a + c.m3, 0)
  const depsDisp = [...new Set(disponibles.map(c => c.deposito))].join(' y ')
  const fraseDisp = disponibles.length === 0 ? ''
    : `Hay ${fmtM3(m3Disp)} m³ con stock en ${depsDisp} para el mismo fiscal que no están en el camión (${disponibles.map(c => c.ref).join(', ')}).`

  // Los relojes del camión: si esperar hace que algo se pase, el aviso es el contrario.
  const prio = enCamion.filter(c => c.prioridad)
  const urg = enCamion.filter(c => esUrgenteAlmacenaje(c.almacenaje))
    .sort((a, b) => a.almacenaje!.diasRestantes - b.almacenaje!.diasRestantes)
  if (prio.length || urg.length) {
    const razones: string[] = []
    for (const c of urg) {
      const a = c.almacenaje!
      razones.push(a.vencido
        ? `${c.ref} tiene el almacenaje vencido desde el ${fmtDMY(a.vence)}`
        : `${c.ref} vence almacenaje el ${fmtDMY(a.vence)} (${a.diasRestantes === 0 ? 'hoy' : `en ${a.diasRestantes} días`})`)
    }
    for (const c of prio) razones.push(`${c.ref} es prioridad del cliente`)
    const contexto = [fraseLlegan, fraseDisp].filter(Boolean).join(' ')
    return {
      tipo: 'salir',
      texto: `Sacala ahora: ${razones.join('; ')}. ${cabecera} ${contexto} No conviene esperar.`.replace(/\s+/g, ' ').trim(),
    }
  }

  const pregunta = dias.length > 0 ? '¿Sale igual o lo corrés un día?' : '¿Sale igual o las sumás?'
  return {
    tipo: 'esperar',
    texto: [cabecera, fraseLlegan, fraseDisp, pregunta].filter(Boolean).join(' '),
  }
}
