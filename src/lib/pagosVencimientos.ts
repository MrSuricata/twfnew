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
  id: string
  ref: string
  cliente: string
  linea: string
  terminal: string
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

/** "Sin datos de pago": FCL viva y vigente (ETA ISO no más vieja de 60 días) sin ningún monto cargado. */
export function esCargaSinDatosPago(s: DbShipment, hoyISO: string): boolean {
  if (s.archived || s.mode !== 'fcl' || s.source === 'sheet') return false
  if (PAGO_RUBROS.some(r => montoNum(s[MONTO_KEYS[r]]) !== null)) return false
  const limite = addDaysISO(s.eta, SIN_DATOS_ETA_MAX_DIAS)
  return limite !== null && limite >= hoyISO
}

export function buildPagoItems(dbShipments: DbShipment[], hoyISO: string): { items: PagoItem[]; sinDatos: DbShipment[] } {
  const items: PagoItem[] = []
  const sinDatos: DbShipment[] = []
  for (const s of dbShipments || []) {
    if (!s || s.archived || s.source === 'sheet') continue
    const fp = formaPagoEfectiva(s)
    let alguno = false
    for (const rubro of PAGO_RUBROS) {
      const monto = montoNum(s[MONTO_KEYS[rubro]])
      if (monto === null) continue
      alguno = true
      const pagadoAt = s[PAGO_AT_KEYS[rubro]] || null
      const vence = venceRubro(rubro, s.eta, fp.value, s.terminal)
      items.push({
        id: s.id, ref: s.ref, cliente: s.cliente || '', linea: s.linea || '', terminal: s.terminal || '',
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
