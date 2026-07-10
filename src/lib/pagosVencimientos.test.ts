import { describe, it, expect } from 'vitest'
import {
  addDaysISO, diffDaysISO, esLineaOne, esLineaRepremar, deriveFormaPago,
  normalizeFormaPago, formaPagoEfectiva, venceRubro, buildPagoItems, corteHasta, kpisPagos,
} from './pagosVencimientos'
import type { DbShipment } from './operationsTypes'

const base = (over: Partial<DbShipment>): DbShipment => ({
  id: 'x', ref: 'A7900', mode: 'fcl', source: 'fcl', archived: false,
  cliente: 'PERETTI', linea: 'ONE', terminal: 'TCP', eta: '2026-07-01',
  ...over,
} as DbShipment)

describe('addDaysISO', () => {
  it('suma días', () => expect(addDaysISO('2026-07-01', 35)).toBe('2026-08-05'))
  it('resta días (MONTECON)', () => expect(addDaysISO('2026-07-01', -5)).toBe('2026-06-26'))
  it('no-ISO → null (COORDINADO, dd/MM/yyyy, vacío)', () => {
    expect(addDaysISO('COORDINADO', 5)).toBeNull()
    expect(addDaysISO('2/06/2026', 5)).toBeNull()
    expect(addDaysISO('', 0)).toBeNull()
    expect(addDaysISO(undefined, 0)).toBeNull()
  })
  it('cruza fin de mes y de año', () => expect(addDaysISO('2026-12-20', 30)).toBe('2027-01-19'))
})

describe('diffDaysISO', () => {
  it('b − a en días', () => {
    expect(diffDaysISO('2026-07-10', '2026-07-15')).toBe(5)
    expect(diffDaysISO('2026-07-10', '2026-07-05')).toBe(-5)
    expect(diffDaysISO('2026-07-10', '2026-07-10')).toBe(0)
  })
  it('no-ISO → null', () => expect(diffDaysISO('2026-07-10', 'DEVUELTO')).toBeNull())
})

describe('detección de naviera', () => {
  it('ONE exacto', () => {
    expect(esLineaOne('ONE')).toBe(true)
    expect(esLineaOne(' one ')).toBe(true)
  })
  it('CONSOLTAINERLINE NO es ONE', () => expect(esLineaOne('CONSOLTAINERLINE')).toBe(false))
  it('MAERSK y REPREMAR son Repremar', () => {
    expect(esLineaRepremar('MAERSK')).toBe(true)
    expect(esLineaRepremar('maersk ')).toBe(true)
    expect(esLineaRepremar('REPREMAR')).toBe(true)
    expect(esLineaRepremar('HMM')).toBe(false)
  })
  it('deriva forma de pago', () => {
    expect(deriveFormaPago('ONE')).toBe('cuenta corriente')
    expect(deriveFormaPago('MAERSK')).toBe('programado')
    expect(deriveFormaPago('COSCO')).toBe('al arribo')
    expect(deriveFormaPago('')).toBe('al arribo')
  })
})

describe('normalizeFormaPago / formaPagoEfectiva', () => {
  it('normaliza variantes', () => {
    expect(normalizeFormaPago('PROGRAMADO')).toBe('programado')
    expect(normalizeFormaPago('C CORRIENTE')).toBe('cuenta corriente')
    expect(normalizeFormaPago('cuenta corriente')).toBe('cuenta corriente')
    expect(normalizeFormaPago('al arribo')).toBe('al arribo')
    expect(normalizeFormaPago('FALTA')).toBeNull()
    expect(normalizeFormaPago('')).toBeNull()
    expect(normalizeFormaPago(undefined)).toBeNull()
  })
  it('override explícito gana a la derivada (caso real: HMM PROGRAMADO en la planilla)', () => {
    const r = formaPagoEfectiva(base({ linea: 'HMM', forma_pago: 'programado' }))
    expect(r).toEqual({ value: 'programado', overridden: true })
  })
  it('sin override deriva de la línea', () => {
    expect(formaPagoEfectiva(base({ linea: 'ONE', forma_pago: null }))).toEqual({ value: 'cuenta corriente', overridden: false })
  })
})

describe('venceRubro — matriz de reglas', () => {
  const eta = '2026-07-01'
  it('FLETE: cta cte +35 · programado +40 · al arribo ETA', () => {
    expect(venceRubro('flete', eta, 'cuenta corriente', 'TCP')).toBe('2026-08-05')
    expect(venceRubro('flete', eta, 'programado', 'TCP')).toBe('2026-08-10')
    expect(venceRubro('flete', eta, 'al arribo', 'TCP')).toBe('2026-07-01')
  })
  it('LOCALES: cta cte +35 · resto ETA', () => {
    expect(venceRubro('locales', eta, 'cuenta corriente', 'TCP')).toBe('2026-08-05')
    expect(venceRubro('locales', eta, 'programado', 'TCP')).toBe('2026-07-01')
    expect(venceRubro('locales', eta, 'al arribo', 'TCP')).toBe('2026-07-01')
  })
  it('TERMINAL: MONTECON −5 · TCP/desconocido ETA', () => {
    expect(venceRubro('terminal', eta, 'al arribo', 'MONTECON')).toBe('2026-06-26')
    expect(venceRubro('terminal', eta, 'al arribo', ' montecon ')).toBe('2026-06-26')
    expect(venceRubro('terminal', eta, 'al arribo', 'TCP')).toBe('2026-07-01')
    expect(venceRubro('terminal', eta, 'al arribo', '')).toBe('2026-07-01')
  })
  it('DEVOLUCIÓN: siempre ETA (la forma de pago y la terminal no influyen)', () => {
    expect(venceRubro('devolucion', eta, 'programado', 'MONTECON')).toBe('2026-07-01')
    expect(venceRubro('devolucion', eta, 'cuenta corriente', 'TCP')).toBe('2026-07-01')
  })
  it('sin ETA → null en todos los rubros', () => {
    expect(venceRubro('flete', '', 'programado', 'TCP')).toBeNull()
    expect(venceRubro('devolucion', undefined, 'al arribo', '')).toBeNull()
  })
})

describe('buildPagoItems', () => {
  const hoy = '2026-07-10'
  it('monto null/undefined no genera item · 0 = pagado · >0 = pendiente', () => {
    const { items } = buildPagoItems([base({ monto_flete: 2000, monto_locales: 0, monto_terminal: null, monto_devolucion: undefined })], hoy)
    expect(items).toHaveLength(2)
    expect(items.find(i => i.rubro === 'flete')?.estado).toBe('pendiente')
    expect(items.find(i => i.rubro === 'locales')?.estado).toBe('pagado')
  })
  it('pago_*_at estampado = pagado aunque monto>0, con quién', () => {
    const { items } = buildPagoItems([base({ monto_flete: 2000, pago_flete_at: '2026-07-09T12:00:00Z', pago_flete_by: 'brian' })], hoy)
    expect(items[0].estado).toBe('pagado')
    expect(items[0].pagadoBy).toBe('brian')
  })
  it('dias: negativo = vencido · 0 = hoy · positivo = por vencer', () => {
    const { items } = buildPagoItems([
      base({ id: 'a', eta: '2026-07-05', monto_devolucion: 100 }),
      base({ id: 'b', eta: '2026-07-10', monto_devolucion: 100 }),
      base({ id: 'c', eta: '2026-07-20', monto_devolucion: 100 }),
    ], hoy)
    expect(items.map(i => i.dias)).toEqual([-5, 0, 10])
  })
  it('sin ETA → vence null y dias null (no inventa fechas)', () => {
    const { items } = buildPagoItems([base({ eta: '', monto_flete: 500 })], hoy)
    expect(items[0].vence).toBeNull()
    expect(items[0].dias).toBeNull()
  })
  it('archivadas y espejo (source=sheet) quedan fuera', () => {
    const { items } = buildPagoItems([
      base({ archived: true, monto_flete: 1 }),
      base({ source: 'sheet', monto_flete: 1 }),
    ], hoy)
    expect(items).toHaveLength(0)
  })
  it('el vencimiento usa la forma de pago efectiva (ONE cta cte: flete ETA+35)', () => {
    const { items } = buildPagoItems([base({ linea: 'ONE', forma_pago: null, eta: '2026-07-01', monto_flete: 1000 })], hoy)
    expect(items[0].vence).toBe('2026-08-05')
    expect(items[0].formaPago).toBe('cuenta corriente')
    expect(items[0].formaPagoOverride).toBe(false)
  })
  it('sinDatos: FCL vigente (ETA ISO no más vieja de 60 días) sin ningún monto', () => {
    const { sinDatos } = buildPagoItems([
      base({ id: 'nueva', eta: '2026-08-01' }),
      base({ id: 'vieja', eta: '2026-03-01' }),
      base({ id: 'sin-eta', eta: '' }),
      base({ id: 'con-datos', eta: '2026-08-01', monto_flete: 0 }),
      base({ id: 'lcl', mode: 'lcl', eta: '2026-08-01' }),
    ], hoy)
    expect(sinDatos.map(s => s.id)).toEqual(['nueva'])
  })
  it('ordena por vencimiento asc, sin-fecha al final', () => {
    const { items } = buildPagoItems([
      base({ id: 'c', eta: '2026-07-20', monto_flete: 1, linea: 'COSCO' }),
      base({ id: 'sin', eta: '', monto_flete: 1 }),
      base({ id: 'a', eta: '2026-07-01', monto_flete: 1, linea: 'COSCO' }),
    ], hoy)
    expect(items.map(i => i.id)).toEqual(['a', 'c', 'sin'])
  })
})

describe('corteHasta', () => {
  it('suma pendientes con vence ≤ fecha (vencidos incluidos), excluye pagados y sin fecha', () => {
    const hoy = '2026-07-10'
    const { items } = buildPagoItems([
      base({ id: 'a', eta: '2026-07-01', monto_devolucion: 100 }),
      base({ id: 'b', eta: '2026-07-15', monto_devolucion: 200 }),
      base({ id: 'c', eta: '2026-07-20', monto_devolucion: 400 }),
      base({ id: 'd', eta: '', monto_devolucion: 800 }),
      base({ id: 'e', eta: '2026-07-01', monto_devolucion: 0 }),
    ], hoy)
    const corte = corteHasta(items, '2026-07-15')
    expect(corte.total).toBe(300)
    expect(corte.porRubro.devolucion).toBe(300)
    expect(corte.porRubro.flete).toBe(0)
    expect(corte.items.map(i => i.id)).toEqual(['a', 'b'])
  })
})

describe('kpisPagos', () => {
  it('vencido / hoy / semana / total pendiente / sin fecha', () => {
    const hoy = '2026-07-10'
    const { items } = buildPagoItems([
      base({ id: 'a', eta: '2026-07-05', monto_devolucion: 100 }),
      base({ id: 'b', eta: '2026-07-10', monto_devolucion: 200 }),
      base({ id: 'c', eta: '2026-07-15', monto_devolucion: 400 }),
      base({ id: 'd', eta: '2026-09-01', monto_devolucion: 800 }),
      base({ id: 'e', eta: '', monto_devolucion: 1600 }),
      base({ id: 'pagada', eta: '2026-07-05', monto_devolucion: 0 }),
    ], hoy)
    const k = kpisPagos(items)
    expect(k.vencido).toEqual({ count: 1, total: 100 })
    expect(k.hoy).toEqual({ count: 1, total: 200 })
    expect(k.semana).toEqual({ count: 1, total: 400 })
    expect(k.pendiente).toEqual({ count: 5, total: 3100 })
    expect(k.sinFecha).toEqual({ count: 1, total: 1600 })
  })
})
