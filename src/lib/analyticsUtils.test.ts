import { describe, it, expect } from 'vitest'
import { filterOperations, zoneOf, opYear, kpisGenerales, volumenes, porModalidad, porZona, topClientes, porLinea, porTerminal, porOperativa, porTransporte, porFiscal, porTipoContenedor, porMes, truckYear, kpisConsolidados, consolidadosPorMes, volumenPorTransportista } from './analyticsUtils'
import type { Truck, TruckLoad } from './truckTypes'
import { op } from './analyticsTestFactories'

describe('zoneOf — bucket de zona', () => {
  it('UY/AR/CL pasan directo; resto (incluido vacío) es OTRO', () => {
    expect(zoneOf(op({ pais: 'UY' }))).toBe('UY')
    expect(zoneOf(op({ pais: 'CL' }))).toBe('CL')
    expect(zoneOf(op({ pais: 'OTRO' }))).toBe('OTRO')
    expect(zoneOf(op({ pais: '' }))).toBe('OTRO')
  })
})

describe('opYear — año por ETA, ambos formatos de fecha', () => {
  it('planilla D/M/YYYY y web YYYY-MM-DD', () => {
    expect(opYear(op({ eta: '15/3/2026' }))).toBe(2026)
    expect(opYear(op({ eta: '2026-03-15' }))).toBe(2026)
    expect(opYear(op({ eta: '' }))).toBe(null)
    expect(opYear(op({ eta: 'basura' }))).toBe(null)
  })
})

describe('filterOperations — año + modalidad + zona combinados', () => {
  const ops = [
    op({ uid: 'a', eta: '15/3/2026', mode: 'fcl', pais: 'UY' }),
    op({ uid: 'b', eta: '2026-04-01', mode: 'lcl', pais: 'UY' }),
    op({ uid: 'c', eta: '15/3/2026', mode: 'fcl', pais: 'CL' }),
    op({ uid: 'd', eta: '15/3/2025', mode: 'fcl', pais: 'UY' }),
    op({ uid: 'e', eta: '', mode: 'air', pais: '' }),
  ]
  it('filtra por año (sin ETA queda fuera)', () => {
    expect(filterOperations(ops, 2026, 'all', 'all').map(o => o.uid)).toEqual(['a', 'b', 'c'])
  })
  it('modalidad y zona se combinan con el año', () => {
    expect(filterOperations(ops, 2026, 'fcl', 'all').map(o => o.uid)).toEqual(['a', 'c'])
    expect(filterOperations(ops, 2026, 'all', 'UY').map(o => o.uid)).toEqual(['a', 'b'])
    expect(filterOperations(ops, 2026, 'fcl', 'CL').map(o => o.uid)).toEqual(['c'])
  })
})

describe('kpisGenerales', () => {
  it('cuenta cargas, contenedores FCL (n), tránsito promedio y clientes únicos', () => {
    const ops = [
      op({ cliente: 'PERETTI', n: 2, etd: '1/3/2026', eta: '31/3/2026' }),   // 30 días
      op({ cliente: 'PERETTI', n: 1, etd: '1/3/2026', eta: '21/3/2026' }),   // 20 días
      op({ cliente: 'CHIAPERO', mode: 'lcl', n: 0, etd: '', eta: '2026-04-01' }),
    ]
    const k = kpisGenerales(ops)
    expect(k.cargas).toBe(3)
    expect(k.contenedores).toBe(3)
    expect(k.transitoPromedio).toBe(25)
    expect(k.clientes).toBe(2)
  })
  it('tránsitos inválidos (negativos, >365d, sin fechas) no cuentan', () => {
    const k = kpisGenerales([
      op({ etd: '10/3/2026', eta: '1/3/2026' }),
      op({ etd: '1/1/2020', eta: '1/3/2026' }),
      op({ etd: '', eta: '1/3/2026' }),
    ])
    expect(k.transitoPromedio).toBe(0)
  })
})

describe('volumenes', () => {
  it('suma bultos/kg/m3 de todas las modalidades', () => {
    const v = volumenes([
      op({ pkgs: 10, kg: 1000, m3: 5 }),
      op({ mode: 'lcl', pkgs: 5, kg: 500, m3: 2.5 }),
    ])
    expect(v).toEqual({ pkgs: 15, kg: 1500, m3: 7.5 })
  })
})

describe('agregaciones para charts', () => {
  it('porModalidad usa labels y ordena desc', () => {
    expect(porModalidad([op(), op(), op({ mode: 'lcl' })])).toEqual([
      { name: 'FCL', value: 2 },
      { name: 'LCL', value: 1 },
    ])
  })
  it('porZona agrupa con el bucket OTRO', () => {
    expect(porZona([op({ pais: 'UY' }), op({ pais: '' }), op({ pais: 'UY' })])).toEqual([
      { name: 'UY', value: 2 },
      { name: 'OTRO', value: 1 },
    ])
  })
  it('topClientes cuenta CARGAS (no contenedores) y corta en 7', () => {
    const ops = ['A', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(c => op({ cliente: c }))
    const top = topClientes(ops)
    expect(top).toHaveLength(7)
    expect(top[0]).toEqual({ name: 'A', value: 2 })
  })
  it('vacíos no cuentan (linea/terminal/operativa/transporte/fiscal sin dato)', () => {
    expect(porLinea([op({ linea: '' })])).toEqual([])
    expect(porTerminal([op({ terminal: 'TCP' }), op({ terminal: '' })])).toEqual([
      { name: 'TCP', value: 1 },
    ])
    expect(porOperativa([op()])).toEqual([])
    expect(porTransporte([op()])).toEqual([])
    expect(porFiscal([op()])).toEqual([])
  })
  it('porTipoContenedor solo mira FCL (el tipo DB es el label de modalidad)', () => {
    expect(porTipoContenedor([op({ tipo: '40HC' }), op({ mode: 'lcl', tipo: 'LCL' })])).toEqual([
      { name: '40HC', value: 1 },
    ])
  })
  it('porFiscal trunca nombres largos a 18 chars + …', () => {
    expect(porFiscal([op({ fiscal: 'DEPOSITO FISCAL ZONA OESTE' })])).toEqual([
      { name: 'DEPOSITO FISCAL ZO…', value: 1 },
    ])
  })
  it('porFiscal cuenta por nombre completo y trunca recién al final (no fusiona prefijos)', () => {
    const out = porFiscal([
      op({ fiscal: 'DEPOSITO FISCAL ZONA OESTE' }),
      op({ fiscal: 'DEPOSITO FISCAL ZONA OESTE' }),
      op({ fiscal: 'DEPOSITO FISCAL ZONA ESTE' }),
    ])
    expect(out).toEqual([
      { name: 'DEPOSITO FISCAL ZO…', value: 2 },
      { name: 'DEPOSITO FISCAL ZO…', value: 1 },
    ])
  })
})

describe('porMes', () => {
  const NOW = new Date(2026, 5, 11) // 11/06/2026
  it('agrupa por mes de ETA y no muestra meses futuros', () => {
    const data = porMes(
      [op({ eta: '5/3/2026' }), op({ eta: '20/3/2026' }), op({ eta: '1/9/2026' })],
      NOW
    )
    expect(data).toHaveLength(1)
    expect(data[0].cargas).toBe(2)
  })
  it('en años pasados muestra todos los meses con datos', () => {
    const data = porMes([op({ eta: '5/3/2025' }), op({ eta: '5/9/2025' })], NOW)
    expect(data).toHaveLength(2)
  })
})

const truck = (over: Partial<Truck> = {}): Truck =>
  ({
    id: 't1', code: 'C430', status: 'delivered', isSider: false, transport: 'OLAVERRY',
    driver: '', plate: '', loadDate: '2026-03-05', departureDate: '', arrivalDate: '',
    notes: '', draft: false, pendingEdits: null,
    costDespacho: 0, costFlete: 0, costCarga: 0,
    createdAt: 0, updatedAt: 0, ...over,
  }) as Truck

const load = (over: Partial<TruckLoad> = {}): TruckLoad =>
  ({
    id: 'l1', truckId: 't1', sourceType: 'shipment', sourceRef: 'LCL-1', client: '',
    fiscal: '', kg: 100, m3: 1, pkgs: 2, description: '', mvdArrival: '',
    desconsolDate: '', overrides: {}, position: 0, pending: null, ...over,
  }) as TruckLoad

describe('consolidados', () => {
  it('truckYear usa loadDate con fallback a departureDate', () => {
    expect(truckYear(truck())).toBe(2026)
    expect(truckYear(truck({ loadDate: '', departureDate: '2025-12-20' }))).toBe(2025)
    expect(truckYear(truck({ loadDate: '', departureDate: '' }))).toBe(null)
  })
  it('kpisConsolidados suma solo cargas de camiones del año', () => {
    const trucks = [truck(), truck({ id: 't2', loadDate: '2025-03-05' })]
    const loads = [
      load(), load({ id: 'l2', kg: 200, m3: 2, pkgs: 3 }),
      load({ id: 'l3', truckId: 't2', kg: 999 }),
    ]
    const k = kpisConsolidados(trucks, loads, 2026)
    expect(k).toEqual({ camiones: 1, kg: 300, m3: 3, pkgs: 5, cargasPorCamion: 2 })
  })
  it('cargasPorCamion redondea a 1 decimal y es 0 sin camiones', () => {
    const trucks = [truck(), truck({ id: 't2' })]
    const loads = [load(), load({ id: 'l2' }), load({ id: 'l3', truckId: 't2' })]
    expect(kpisConsolidados(trucks, loads, 2026).cargasPorCamion).toBe(1.5)
    expect(kpisConsolidados([], [], 2026).cargasPorCamion).toBe(0)
  })
  it('consolidadosPorMes agrupa por mes de carga', () => {
    const data = consolidadosPorMes(
      [truck(), truck({ id: 't2', loadDate: '2026-03-20' }), truck({ id: 't3', loadDate: '2026-05-01' })],
      2026,
      new Date(2026, 5, 11)
    )
    expect(data).toHaveLength(2)
    expect(data[0].camiones).toBe(2)
  })
  it('volumenPorTransportista suma kg por transporte del camión', () => {
    const trucks = [truck(), truck({ id: 't2', transport: 'TRANSCAL' })]
    const loads = [load(), load({ id: 'l2', kg: 50 }), load({ id: 'l3', truckId: 't2', kg: 70 })]
    expect(volumenPorTransportista(trucks, loads, 2026)).toEqual([
      { name: 'OLAVERRY', value: 150 },
      { name: 'TRANSCAL', value: 70 },
    ])
  })
  it('los camiones borrador no cuentan en las estadísticas', () => {
    const ts = [truck(), truck({ id: 't2', draft: true })]
    const ls = [load(), load({ id: 'l2', truckId: 't2', kg: 999 })]
    expect(kpisConsolidados(ts, ls, 2026).camiones).toBe(1)
    expect(kpisConsolidados(ts, ls, 2026).kg).toBe(100)
    expect(consolidadosPorMes(ts, 2026, new Date(2026, 5, 12))).toHaveLength(1)
  })
  it('las cargas pending=add de un borrador de edición no suman', () => {
    const ts = [truck()]
    const ls = [load(), load({ id: 'l2', kg: 500, pending: 'add' })]
    expect(kpisConsolidados(ts, ls, 2026).kg).toBe(100)
    expect(volumenPorTransportista(ts, ls, 2026)).toEqual([{ name: 'OLAVERRY', value: 100 }])
  })
})
