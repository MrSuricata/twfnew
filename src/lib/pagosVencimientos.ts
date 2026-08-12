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

/**
 * A quién se le paga cada rubro.
 *
 * Flete y locales van al AGENTE, no a la línea: el carrier puede ser Maersk y
 * la factura venir de Repremar, Craft o Trans-China, que son los que venden el
 * espacio (verificado contra el mail, 12/08/2026). Sin agente cargado se cae en
 * la línea, que es lo que había antes.
 */
export function empresaRubro(rubro: PagoRubro, s: Pick<DbShipment, 'linea' | 'terminal' | 'dev' | 'agente'>): string {
  if (rubro === 'devolucion') return (s.dev || '').trim()
  if (rubro === 'terminal') return (s.terminal || '').trim()
  return ((s.agente || '').trim() || (s.linea || '').trim())
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
        rubro, monto, vence,
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
