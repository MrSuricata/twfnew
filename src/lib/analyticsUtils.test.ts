import { describe, it, expect } from 'vitest'
import type { UnifiedOperation } from './operationsTypes'
import { filterOperations, zoneOf, opYear, kpisGenerales, volumenes, porModalidad, porZona, topClientes, porLinea, porTerminal, porOperativa, porTransporte, porFiscal, porTipoContenedor, porMes } from './analyticsUtils'

// Factory mínima: solo los campos que usan las analíticas.
export const op = (over: Partial<UnifiedOperation> = {}): UnifiedOperation =>
  ({
    uid: 'u1', ref: 'A1', mode: 'fcl', source: 'fcl', cliente: '', etd: '', eta: '',
    pais: 'UY', linea: '', terminal: '', n: 0, pkgs: 0, kg: 0, m3: 0,
    operativa: '', transporte: '', fiscal: '', tipo: '', status: '',
    ...over,
  }) as UnifiedOperation

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
