import { describe, it, expect } from 'vitest'
import {
  addDaysISO, diffDaysISO, esLineaOne, esLineaRepremar, deriveFormaPago,
  normalizeFormaPago, formaPagoEfectiva, venceRubro, buildPagoItems, corteHasta, kpisPagos,
  costoTerminalDefault, costoDevDefault, empresaRubro, agruparPorAcreedor, SIN_ACREEDOR,
  ordenarPagos, type PagoItem,
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
  it('cargas por Chile (dest_country CL) quedan fuera — las maneja el equipo de Chile (caso A7793)', () => {
    const { items, sinDatos } = buildPagoItems([
      base({ id: 'cl-con-montos', dest_country: 'CL', monto_flete: 2600 }),
      base({ id: 'cl-sin-montos', dest_country: 'CL', eta: '2026-08-01' }),
    ], hoy)
    expect(items).toHaveLength(0)
    expect(sinDatos).toHaveLength(0)
  })
  it('empresa por rubro: flete/locales → naviera · terminal → terminal · devolución → DEV', () => {
    const { items } = buildPagoItems([base({
      linea: 'HMM', terminal: 'MONTECON', dev: 'STL',
      monto_flete: 1, monto_locales: 1, monto_terminal: 1, monto_devolucion: 1,
    })], hoy)
    const by = Object.fromEntries(items.map(i => [i.rubro, i.empresa]))
    expect(by).toEqual({ flete: 'HMM', locales: 'HMM', terminal: 'MONTECON', devolucion: 'STL' })
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

describe('costos default por terminal/devolución (17/07)', () => {
  it('terminal: MONTECON 618 · TCP 507,16 · case/espacios insensible · sin regla → null', () => {
    expect(costoTerminalDefault('MONTECON')).toBe(618)
    expect(costoTerminalDefault(' tcp ')).toBe(507.16)
    expect(costoTerminalDefault('OTRA')).toBeNull()
    expect(costoTerminalDefault('')).toBeNull()
    expect(costoTerminalDefault(null)).toBeNull()
  })
  it('devolución: STL 205 · MPS 189 · sin regla → null', () => {
    expect(costoDevDefault('stl')).toBe(205)
    expect(costoDevDefault('MPS')).toBe(189)
    expect(costoDevDefault('MURCHISON')).toBeNull()
  })
})

describe('empresaRubro — a quién se le paga', () => {
  it('con agente REPREMAR se le paga a Repremar, sin importar la línea', () => {
    // Regla de Brian (19/08): Repremar cobra flete y locales de sus cargas
    // aunque el carrier sea Maersk o cualquier otro.
    const s = base({ linea: 'MAERSK', agente: 'REPREMAR' })
    expect(empresaRubro('flete', s)).toBe('REPREMAR')
    expect(empresaRubro('locales', s)).toBe('REPREMAR')
  })

  it('con cualquier OTRO agente se paga directo a la LÍNEA', () => {
    // La regla del 12/08 (pagar al agente cargado, ej. Craft) estaba mal:
    // salvo Repremar, la factura de flete/locales es de la línea.
    const s = base({ linea: 'MSC', agente: 'CRAFT' })
    expect(empresaRubro('flete', s)).toBe('MSC')
    expect(empresaRubro('locales', s)).toBe('MSC')
  })

  it('agente Repremar con variantes del nombre también gana', () => {
    const s = base({ linea: 'HAPAG', agente: 'Repremar Shipping' })
    expect(empresaRubro('flete', s)).toBe('Repremar Shipping')
  })

  it('sin agente cargado cae en la línea', () => {
    const s = base({ linea: 'ONE', agente: '' })
    expect(empresaRubro('flete', s)).toBe('ONE')
  })

  it('sin línea cargada cae en el agente (mejor que SIN ACREEDOR)', () => {
    const s = base({ linea: '', agente: 'CRAFT' })
    expect(empresaRubro('flete', s)).toBe('CRAFT')
  })

  it('terminal se le paga a la terminal, no al agente', () => {
    expect(empresaRubro('terminal', base({ terminal: 'MONTECON', agente: 'REPREMAR' }))).toBe('MONTECON')
  })

  it('la devolución se le paga a la terminal donde se devuelve', () => {
    expect(empresaRubro('devolucion', base({ dev: 'STL', agente: 'REPREMAR' }))).toBe('STL')
  })

  it('buildPagoItems usa el agente en el campo empresa', () => {
    const { items } = buildPagoItems(
      [base({ linea: 'MAERSK', agente: 'REPREMAR', monto_flete: 5000, monto_terminal: 600, dev: 'STL' })],
      '2026-07-01')
    expect(items.find(i => i.rubro === 'flete')!.empresa).toBe('REPREMAR')
    expect(items.find(i => i.rubro === 'terminal')!.empresa).toBe('TCP')
  })
})

describe('agruparPorAcreedor', () => {
  const items = (over: Partial<DbShipment>[] = []) =>
    buildPagoItems(over.map(o => base(o)), '2026-07-01').items

  it('junta todo lo de un mismo acreedor', () => {
    const g = agruparPorAcreedor(items([
      { id: '1', ref: 'A1', linea: 'ONE', monto_flete: 5000 },
      { id: '2', ref: 'A2', linea: 'ONE', monto_locales: 700 },
    ]))
    expect(g).toHaveLength(1)
    expect(g[0].acreedor).toBe('ONE')
    expect(g[0].total).toBe(5700)
    expect(g[0].items).toHaveLength(2)
  })

  it('separa acreedores distintos y ordena por monto', () => {
    const g = agruparPorAcreedor(items([
      { id: '1', ref: 'A1', linea: 'ONE', monto_flete: 500 },
      { id: '2', ref: 'A2', linea: 'MAERSK', agente: 'REPREMAR', monto_flete: 9000 },
    ]))
    expect(g.map(x => x.acreedor)).toEqual(['REPREMAR', 'ONE'])
  })

  it('deja fuera lo ya pagado', () => {
    const g = agruparPorAcreedor(items([
      { id: '1', ref: 'A1', linea: 'ONE', monto_flete: 0 },              // 0 = pagado
      { id: '2', ref: 'A2', linea: 'ONE', monto_locales: 700, pago_locales_at: '2026-06-30' },
    ]))
    expect(g).toHaveLength(0)
  })

  it('los ítems sin acreedor van juntos a un grupo aparte', () => {
    const g = agruparPorAcreedor(items([{ id: '1', ref: 'A1', dev: '', monto_devolucion: 200 }]))
    expect(g[0].acreedor).toBe(SIN_ACREEDOR)
  })

  it('cuenta el primer vencimiento y lo que vence en la ventana', () => {
    const g = agruparPorAcreedor(items([
      { id: '1', ref: 'A1', linea: 'ONE', eta: '2026-07-05', monto_terminal: 600 },
      { id: '2', ref: 'A2', linea: 'ONE', eta: '2026-08-20', monto_terminal: 600 },
    ]), '2026-07-01', 7)
    expect(g[0].primerVto).toBe('2026-07-05')
    expect(g[0].enVentana).toBe(1)
    expect(g[0].totalVentana).toBe(600)
  })

  it('marca el grupo como vencido si algo ya pasó de fecha', () => {
    const g = agruparPorAcreedor(items([
      { id: '1', ref: 'A1', linea: 'ONE', eta: '2026-06-01', monto_terminal: 600 },
    ]), '2026-07-01')
    expect(g[0].vencido).toBe(true)
  })

  it('sin ítems no devuelve grupos', () => {
    expect(agruparPorAcreedor([])).toEqual([])
  })
})


describe('ordenarPagos — la tabla se ordena, los totales no se tocan', () => {
  const it_ = (over: Partial<PagoItem>): PagoItem => ({
    id: over.ref || 'x', ref: 'A1', cliente: 'PERETTI', docNumber: '', contenedor: '',
    linea: 'ONE', terminal: 'TCP', empresa: 'ONE', rubro: 'flete', monto: 100,
    eta: '2026-07-10', vence: '2026-08-14', dias: 5, pagadoAt: null, pagadoBy: '',
    formaPago: 'cuenta corriente', formaPagoOverride: false, estado: 'pendiente',
    ...over,
  })

  const refs = (l: PagoItem[]) => l.map(i => i.ref)
  // Sin `.at(-1)`: el tsconfig apunta a ES2020 y Array.prototype.at es ES2022,
  // así que el typecheck del repo lo rechaza aunque en runtime funcione.
  const ultimo = (l: string[]): string => l[l.length - 1]

  it('por ETA: ascendente lo que llega primero, descendente al revés', () => {
    const l = [
      it_({ ref: 'A2', eta: '2026-07-20' }),
      it_({ ref: 'A1', eta: '2026-07-05' }),
      it_({ ref: 'A3', eta: '2026-08-01' }),
    ]
    expect(refs(ordenarPagos(l, 'eta', 'asc'))).toEqual(['A1', 'A2', 'A3'])
    expect(refs(ordenarPagos(l, 'eta', 'desc'))).toEqual(['A3', 'A2', 'A1'])
  })

  it('la carga SIN ETA queda al final en las dos direcciones', () => {
    // Al invertir, un null saltaba arriba de todo y tapaba lo que se miraba.
    const l = [
      it_({ ref: 'SIN', eta: null }),
      it_({ ref: 'A1', eta: '2026-07-05' }),
      it_({ ref: 'A2', eta: '2026-07-20' }),
    ]
    expect(ultimo(refs(ordenarPagos(l, 'eta', 'asc')))).toBe('SIN')
    expect(ultimo(refs(ordenarPagos(l, 'eta', 'desc')))).toBe('SIN')
  })

  it('por monto: de menor a mayor y al revés', () => {
    const l = [it_({ ref: 'A1', monto: 500 }), it_({ ref: 'A2', monto: 100 }), it_({ ref: 'A3', monto: 900 })]
    expect(refs(ordenarPagos(l, 'monto', 'asc'))).toEqual(['A2', 'A1', 'A3'])
    expect(refs(ordenarPagos(l, 'monto', 'desc'))).toEqual(['A3', 'A1', 'A2'])
  })

  it('por vencimiento, con los sin-fecha al final', () => {
    const l = [
      it_({ ref: 'A2', vence: '2026-08-20' }),
      it_({ ref: 'SIN', vence: null }),
      it_({ ref: 'A1', vence: '2026-08-01' }),
    ]
    expect(refs(ordenarPagos(l, 'vence', 'asc'))).toEqual(['A1', 'A2', 'SIN'])
  })

  it('empate → por ref, así el orden no baila entre renders', () => {
    const l = [it_({ ref: 'A9', eta: '2026-07-05' }), it_({ ref: 'A3', eta: '2026-07-05' })]
    expect(refs(ordenarPagos(l, 'eta', 'asc'))).toEqual(['A3', 'A9'])
    expect(refs(ordenarPagos(l, 'eta', 'desc'))).toEqual(['A3', 'A9'])
  })

  it('no muta la lista original', () => {
    const l = [it_({ ref: 'A2', eta: '2026-07-20' }), it_({ ref: 'A1', eta: '2026-07-05' })]
    ordenarPagos(l, 'eta', 'asc')
    expect(refs(l)).toEqual(['A2', 'A1'])
  })
})
