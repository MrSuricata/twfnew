// Vencimientos de pagos por carga — derive-on-read (el VTO NUNCA se guarda; se
// deriva SIEMPRE de ETA + forma de pago efectiva + terminal).
// Reglas Brian 10/07/2026 (WEB_TWF/SPEC_PAGOS_2026-07-10.md):
//   FLETE      · cuenta corriente (ONE)       → ETA + 35 días
//              · programado (MAERSK/Repremar) → ETA + 40 días
//              · al arribo (resto)            → ETA
//   LOCALES    · cuenta corriente             → ETA + 35 días
//              · programado / al arribo       → ETA
//   TERMINAL   · MONTECON                     → ETA − 5 días
//              · TCP / resto                  → ETA
//   DEVOLUCIÓN · siempre                      → ETA
// Convención de montos: null = sin datos · 0 = ya pagado (regla histórica de la
// SG) · >0 = pendiente, salvo pago_*_at estampado.
import type { DbShipment } from './operationsTypes'

export type PagoRubro = 'devolucion' | 'terminal' | 'locales' | 'flete'
export type FormaPago = 'programado' | 'cuenta corriente' | 'al arribo'

export const PAGO_RUBROS: PagoRubro[] = ['devolucion', 'terminal', 'locales', 'flete']
export const RUBRO_LABELS: Record<PagoRubro, string> = {
  devolucion: 'Devolución', terminal: 'Terminal', locales: 'Locales', flete: 'Flete',
}
export const FORMA_PAGO_LABELS: Record<FormaPago, string> = {
  'programado': 'Programado', 'cuenta corriente': 'C. corriente', 'al arribo': 'Al arribo',
}
export const MONTO_KEYS = {
  devolucion: 'monto_devolucion', terminal: 'monto_terminal',
  locales: 'monto_locales', flete: 'monto_flete',
} as const satisfies Record<PagoRubro, keyof DbShipment>
export const PAGO_AT_KEYS = {
  devolucion: 'pago_devolucion_at', terminal: 'pago_terminal_at',
  locales: 'pago_locales_at', flete: 'pago_flete_at',
} as const satisfies Record<PagoRubro, keyof DbShipment>
export const PAGO_BY_KEYS = {
  devolucion: 'pago_devolucion_by', terminal: 'pago_terminal_by',
  locales: 'pago_locales_by', flete: 'pago_flete_by',
} as const satisfies Record<PagoRubro, keyof DbShipment>

export const FLETE_CTA_CTE_DIAS = 35
export const FLETE_PROGRAMADO_DIAS = 40   // confirmado por Brian 10/07/2026
export const LOCALES_CTA_CTE_DIAS = 35
export const TERMINAL_MONTECON_DIAS = -5
// "Sin datos de pago" solo molesta con cargas vigentes: ETA no más vieja que esto.
const SIN_DATOS_ETA_MAX_DIAS = 60

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const up = (v: string | null | undefined) => String(v ?? '').trim().toUpperCase()

/** Suma días a una fecha ISO (yyyy-MM-dd). No-ISO / vacío → null (nunca inventar). */
export function addDaysISO(iso: string | null | undefined, days: number): string | null {
  const s = String(iso ?? '').slice(0, 10)
  if (!ISO_RE.test(s)) return null
  const d = new Date(s + 'T00:00:00Z')
  if (isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** b − a en días (ambos ISO); null si alguno no lo es. */
export function diffDaysISO(a: string, b: string): number | null {
  const pa = addDaysISO(a, 0)
  const pb = addDaysISO(b, 0)
  if (!pa || !pb) return null
  return Math.round((Date.parse(pb + 'T00:00:00Z') - Date.parse(pa + 'T00:00:00Z')) / 86400000)
}

/** ONE exacto — ojo: CONSOLTAINERLINE contiene "ONE" y NO es ONE. */
export function esLineaOne(linea: string | null | undefined): boolean {
  const s = up(linea)
  return s === 'ONE' || s.startsWith('ONE ')
}
/** Repremar = MAERSK y representadas. */
export function esLineaRepremar(linea: string | null | undefined): boolean {
  const s = up(linea)
  return s.includes('MAERSK') || s.includes('REPREMAR')
}
export function deriveFormaPago(linea: string | null | undefined): FormaPago {
  if (esLineaOne(linea)) return 'cuenta corriente'
  if (esLineaRepremar(linea)) return 'programado'
  return 'al arribo'
}
export function normalizeFormaPago(v: string | null | undefined): FormaPago | null {
  const s = up(v)
  if (s === 'PROGRAMADO') return 'programado'
  if (s === 'C CORRIENTE' || s === 'CUENTA CORRIENTE' || s === 'CTA CORRIENTE') return 'cuenta corriente'
  if (s === 'AL ARRIBO' || s === 'ARRIBO') return 'al arribo'
  return null   // '' / 'FALTA' / basura → se deriva de la línea
}
/** Override explícito (columna forma_pago) gana; si no, se deriva de la naviera. */
export function formaPagoEfectiva(s: Pick<DbShipment, 'forma_pago' | 'linea'>): { value: FormaPago; overridden: boolean } {
  const explicit = normalizeFormaPago(s.forma_pago)
  return explicit
    ? { value: explicit, overridden: true }
    : { value: deriveFormaPago(s.linea), overridden: false }
}

export function venceRubro(rubro: PagoRubro, eta: string | null | undefined, formaPago: FormaPago, terminal: string | null | undefined): string | null {
  switch (rubro) {
    case 'devolucion': return addDaysISO(eta, 0)
    case 'terminal': return addDaysISO(eta, up(terminal).includes('MONTECON') ? TERMINAL_MONTECON_DIAS : 0)
    case 'locales': return addDaysISO(eta, formaPago === 'cuenta corriente' ? LOCALES_CTA_CTE_DIAS : 0)
    case 'flete':
      if (formaPago === 'cuenta corriente') return addDaysISO(eta, FLETE_CTA_CTE_DIAS)
      if (formaPago === 'programado') return addDaysISO(eta, FLETE_PROGRAMADO_DIAS)
      return addDaysISO(eta, 0)
  }
}

export interface PagoItem {
  /** id de la fila shipments (dbId) — sirve para abrir el panel de la carga. */
  id: string
  ref: string
  cliente: string
  /** BL/MAWB y contenedores de la carga — para buscar por documento (16/07). */
  docNumber: string
  contenedor: string
  linea: string
  terminal: string
  /** A quién se le paga este rubro: flete/locales → naviera · terminal → terminal · devolución → DEV. */
  empresa: string
  rubro: PagoRubro
  monto: number
  /** Llegada de la carga (ISO). El vencimiento se DERIVA de acá, pero Brian
   *  ordena por la llegada: es la fecha con la que piensa la semana. */
  eta: string | null
  vence: string | null
  /** vence − hoy: negativo = vencido hace |n| · 0 = hoy · positivo = vence en n. null = sin ETA. */
  dias: number | null
  pagadoAt: string | null
  pagadoBy: string
  formaPago: FormaPago
  formaPagoOverride: boolean
  estado: 'pendiente' | 'pagado'
}

const montoNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isFinite(n) ? n : null
}

// ── Helpers de formato de montos (compartidos: pestaña Pagos + sección Pagos
// del panel de detalle) ──
/** "1.234,56" / "1234.56" → número. Coma = decimal (es-UY); sin coma, el punto decide. */
export function parseMontoUY(s: string): number {
  const t = (s || '').trim().replace(/\s/g, '')
  if (!t) return 0
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = parseFloat(norm)
  return Number.isFinite(n) ? n : 0
}
/** Número → valor de input (coma decimal); null = campo vacío (sin datos). */
export const montoToInput = (n: number | null): string => (n === null ? '' : String(n).replace('.', ','))

/** Cargas por Chile (POD San Antonio/Valparaíso → dest_country CL): las maneja
 *  el equipo de Chile, sus pagos no entran acá (pedido Brian 10/07, caso A7793). */
const esCargaChile = (s: DbShipment): boolean => up(s.dest_country) === 'CL'

// ── Costos DEFAULT por terminal / devolución (Brian 17/07/2026) ──
// Se MATERIALIZAN al setear Terminal o "Devuelve en" en la ficha, SOLO si el
// monto está sin datos (null). Un 0 ya cargado se respeta (= pagado, convención
// SG) y cualquier valor queda siempre editable. Si el default cambia de precio,
// actualizar acá (las cargas ya materializadas conservan su valor).
export const COSTO_TERMINAL_DEFAULT: Record<string, number> = { MONTECON: 618, TCP: 507.16 }
export const COSTO_DEV_DEFAULT: Record<string, number> = { STL: 205, MPS: 189 }

/** Costo default de terminal para el valor tipeado (MONTECON/TCP) — null si no hay regla. */
export function costoTerminalDefault(terminal: string | null | undefined): number | null {
  return COSTO_TERMINAL_DEFAULT[up(terminal)] ?? null
}
/** Costo default de devolución para la terminal de devolución (STL/MPS) — null si no hay regla. */
export function costoDevDefault(dev: string | null | undefined): number | null {
  return COSTO_DEV_DEFAULT[up(dev)] ?? null
}

/** ¿El AGENTE es Repremar? (campo agente, no confundir con esLineaRepremar,
 *  que mira la LÍNEA para derivar la forma de pago). */
export function esAgenteRepremar(agente: string | null | undefined): boolean {
  return up(agente).includes('REPREMAR')
}

/**
 * A quién se le paga cada rubro.
 *
 * Flete y locales van a la LÍNEA marítima, salvo UNA excepción: si el agente
 * es REPREMAR, se le paga a Repremar sin importar la línea (regla de Brian,
 * 19/08/2026). La versión anterior (12/08) pagaba a CUALQUIER agente cargado
 * —Craft, Trans-China…— y estaba mal: a esos no se les paga a ellos, se les
 * paga directo a la línea.
 *
 * Sin línea cargada se cae en el agente: mejor un acreedor probable que un
 * ítem mudo en SIN ACREEDOR.
 */
export function empresaRubro(rubro: PagoRubro, s: Pick<DbShipment, 'linea' | 'terminal' | 'dev' | 'agente'>): string {
  if (rubro === 'devolucion') return (s.dev || '').trim()
  if (rubro === 'terminal') return (s.terminal || '').trim()
  const agente = (s.agente || '').trim()
  if (esAgenteRepremar(agente)) return agente
  return ((s.linea || '').trim() || agente)
}

/**
 * Orden de la lista "sin datos de pago": por ETA ascendente — la carga que ya
 * llegó (o llega primero) va ARRIBA, porque su pago vence primero y es la que
 * urge cargar para la previsión de finanzas (Brian 20/08). Sin ETA parseable
 * van al final: no se les puede derivar vencimiento hasta cargar la ETA.
 */
export function ordenarSinDatos<T extends Pick<DbShipment, 'ref' | 'eta'>>(list: T[]): T[] {
  const clave = (s: T): string | null => {
    const e = String(s.eta || '').trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(e) ? e : null
  }
  return [...list].sort((a, b) => {
    const ka = clave(a)
    const kb = clave(b)
    if (ka === null && kb === null) return String(a.ref).localeCompare(String(b.ref))
    if (ka === null) return 1
    if (kb === null) return -1
    if (ka !== kb) return ka < kb ? -1 : 1
    return String(a.ref).localeCompare(String(b.ref))
  })
}

/** País para filtrar la lista "sin datos": el chip agrupa por destino.
 *  Vacío u OTRO = 'SIN PAÍS' (Chile nunca llega acá: queda afuera de Pagos). */
export function paisDePago(s: Pick<DbShipment, 'dest_country'>): string {
  const p = up(s.dest_country)
  return p && p !== 'OTRO' ? p : 'SIN PAÍS'
}

/** Chips del filtro por país: cada país con su cuenta, el más cargado primero.
 *  Orden estable (alfabético a igual cuenta) para que los chips no bailen. */
export function agruparPorPais(list: Pick<DbShipment, 'dest_country'>[]): { pais: string; n: number }[] {
  const m = new Map<string, number>()
  for (const s of list || []) {
    const p = paisDePago(s)
    m.set(p, (m.get(p) || 0) + 1)
  }
  return [...m.entries()]
    .map(([pais, n]) => ({ pais, n }))
    .sort((a, b) => (a.n !== b.n ? b.n - a.n : a.pais.localeCompare(b.pais)))
}

/**
 * La tajada URGENTE de "sin datos de pago" para la card de HOY: cargas sin
 * montos que llegan dentro de `dias` (o ya llegaron — el tope de 60 días para
 * atrás lo pone esCargaSinDatosPago). MISMO criterio que la pestaña Pagos,
 * derivado de la misma regla: dos vistas, un solo número posible.
 * (Decisión de Brian 20/08, que revisa la del 18/08 de no mostrar montos en
 * HOY: ahora van en una sub-pestaña propia, no como campos de cada fila.)
 */
export function montosUrgentes(dbShipments: DbShipment[], hoyISO: string, dias: number): DbShipment[] {
  const filtradas = (dbShipments || []).filter(s => {
    if (!esCargaSinDatosPago(s, hoyISO)) return false
    const d = diffDaysISO(hoyISO, String(s.eta || ''))
    return d !== null && d <= dias
  })
  return ordenarSinDatos(filtradas)
}

/** Etiqueta de los ítems cuyo acreedor todavía no se cargó. */
export const SIN_ACREEDOR = 'SIN ACREEDOR'

export interface GrupoAcreedor {
  acreedor: string
  items: PagoItem[]
  total: number
  /** Primer vencimiento del grupo (ISO) — null si ningún ítem tiene fecha. */
  primerVto: string | null
  /** Algo del grupo ya venció. */
  vencido: boolean
  /** Ítems y monto que vencen dentro de la ventana pedida. */
  enVentana: number
  totalVentana: number
}

/**
 * Agrupa los pagos PENDIENTES por acreedor: es como se paga en la práctica —
 * una transferencia a Repremar cubre varias cargas, no una por carga.
 *
 * `hoyISO` y `dias` solo definen el corte de "vence pronto"; sin ellos el grupo
 * igual trae el total y el primer vencimiento.
 */
export function agruparPorAcreedor(
  items: PagoItem[],
  hoyISO?: string,
  dias = 7,
): GrupoAcreedor[] {
  const hasta = hoyISO ? addDaysISO(hoyISO, dias) : null
  const map = new Map<string, GrupoAcreedor>()
  for (const it of items) {
    if (it.estado === 'pagado') continue
    const acreedor = (it.empresa || '').trim().toUpperCase() || SIN_ACREEDOR
    const g = map.get(acreedor) || {
      acreedor, items: [], total: 0, primerVto: null, vencido: false, enVentana: 0, totalVentana: 0,
    }
    g.items.push(it)
    g.total += it.monto
    if (it.vence) {
      if (!g.primerVto || it.vence < g.primerVto) g.primerVto = it.vence
      if (hoyISO && it.vence < hoyISO) g.vencido = true
      if (hasta && it.vence <= hasta) { g.enVentana++; g.totalVentana += it.monto }
    }
    map.set(acreedor, g)
  }
  // Primero el que más plata debe: es el orden en que se resuelve.
  return [...map.values()].sort((a, b) => b.total - a.total)
}

/** "Sin datos de pago": FCL viva y vigente (ETA ISO no más vieja de 60 días) sin ningún monto cargado. */
export function esCargaSinDatosPago(s: DbShipment, hoyISO: string): boolean {
  if (s.archived || s.mode !== 'fcl' || s.source === 'sheet' || esCargaChile(s)) return false
  if (PAGO_RUBROS.some(r => montoNum(s[MONTO_KEYS[r]]) !== null)) return false
  const limite = addDaysISO(s.eta, SIN_DATOS_ETA_MAX_DIAS)
  return limite !== null && limite >= hoyISO
}

export function buildPagoItems(dbShipments: DbShipment[], hoyISO: string): { items: PagoItem[]; sinDatos: DbShipment[] } {
  const items: PagoItem[] = []
  const sinDatos: DbShipment[] = []
  for (const s of dbShipments || []) {
    if (!s || s.archived || s.source === 'sheet' || esCargaChile(s)) continue
    const fp = formaPagoEfectiva(s)
    let alguno = false
    for (const rubro of PAGO_RUBROS) {
      const monto = montoNum(s[MONTO_KEYS[rubro]])
      if (monto === null) continue
      alguno = true
      const pagadoAt = s[PAGO_AT_KEYS[rubro]] || null
      const vence = venceRubro(rubro, s.eta, fp.value, s.terminal)
      items.push({
        id: s.id, ref: s.ref, cliente: s.cliente || '',
        docNumber: s.doc_number || '', contenedor: s.contenedor || '',
        linea: s.linea || '', terminal: s.terminal || '',
        empresa: empresaRubro(rubro, s),
        rubro, monto, eta: s.eta || null, vence,
        dias: vence ? diffDaysISO(hoyISO, vence) : null,
        pagadoAt, pagadoBy: s[PAGO_BY_KEYS[rubro]] || '',
        formaPago: fp.value, formaPagoOverride: fp.overridden,
        estado: pagadoAt || monto === 0 ? 'pagado' : 'pendiente',
      })
    }
    if (!alguno && esCargaSinDatosPago(s, hoyISO)) sinDatos.push(s)
  }
  items.sort((a, b) => {
    if (a.vence === null && b.vence === null) return a.ref.localeCompare(b.ref)
    if (a.vence === null) return 1
    if (b.vence === null) return -1
    return a.vence.localeCompare(b.vence) || a.ref.localeCompare(b.ref)
  })
  return { items, sinDatos }
}

/** Campos por los que se puede ordenar la lista de pagos. */
export type OrdenPagoCampo = 'vence' | 'eta' | 'monto' | 'ref' | 'cliente'
export type OrdenPagoDir = 'asc' | 'desc'

export const ORDEN_PAGO_LABELS: Record<OrdenPagoCampo, string> = {
  vence: 'Vencimiento',
  eta: 'Llegada (ETA)',
  monto: 'Monto',
  ref: 'Ref',
  cliente: 'Cliente',
}

/**
 * Ordena los pagos sin mutar la lista original.
 *
 * Las cargas SIN el dato (sin ETA, sin vencimiento) van SIEMPRE al final, en
 * las dos direcciones: al invertir el orden saltaban arriba de todo y tapaban
 * justo lo que se estaba mirando. Empate → por ref, para que el orden sea
 * estable entre renders.
 */
export function ordenarPagos(items: PagoItem[], campo: OrdenPagoCampo, dir: OrdenPagoDir): PagoItem[] {
  const signo = dir === 'asc' ? 1 : -1
  const texto = (i: PagoItem): string | null => {
    if (campo === 'vence') return i.vence
    if (campo === 'eta') return i.eta
    if (campo === 'ref') return i.ref
    if (campo === 'cliente') return i.cliente || null
    return null
  }
  return [...items].sort((a, b) => {
    if (campo === 'monto') {
      if (a.monto !== b.monto) return (a.monto - b.monto) * signo
      return a.ref.localeCompare(b.ref)
    }
    const x = texto(a)
    const y = texto(b)
    // Sin dato: al final SIEMPRE (no multiplica por el signo a propósito).
    if (!x && !y) return a.ref.localeCompare(b.ref)
    if (!x) return 1
    if (!y) return -1
    return x.localeCompare(y) * signo || a.ref.localeCompare(b.ref)
  })
}

/** "¿Cuánto tengo que pagar hasta el X?": pendientes con vence ≤ fecha (vencidos incluidos). */
export function corteHasta(items: PagoItem[], fechaISO: string): { total: number; porRubro: Record<PagoRubro, number>; items: PagoItem[] } {
  const sel = items.filter(i => i.estado === 'pendiente' && i.vence !== null && i.vence <= fechaISO)
  const porRubro: Record<PagoRubro, number> = { devolucion: 0, terminal: 0, locales: 0, flete: 0 }
  let total = 0
  for (const i of sel) {
    porRubro[i.rubro] += i.monto
    total += i.monto
  }
  return { total, porRubro, items: sel }
}

export interface KpiBucket { count: number; total: number }
export function kpisPagos(items: PagoItem[]): { vencido: KpiBucket; hoy: KpiBucket; semana: KpiBucket; pendiente: KpiBucket; sinFecha: KpiBucket } {
  const empty = (): KpiBucket => ({ count: 0, total: 0 })
  const r = { vencido: empty(), hoy: empty(), semana: empty(), pendiente: empty(), sinFecha: empty() }
  for (const i of items) {
    if (i.estado !== 'pendiente') continue
    r.pendiente.count++; r.pendiente.total += i.monto
    if (i.dias === null) { r.sinFecha.count++; r.sinFecha.total += i.monto }
    else if (i.dias < 0) { r.vencido.count++; r.vencido.total += i.monto }
    else if (i.dias === 0) { r.hoy.count++; r.hoy.total += i.monto }
    else if (i.dias <= 7) { r.semana.count++; r.semana.total += i.monto }
  }
  return r
}
