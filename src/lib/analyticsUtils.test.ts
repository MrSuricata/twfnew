import { describe, it, expect } from 'vitest'
import type { UnifiedOperation } from './operationsTypes'
import { filterOperations, zoneOf, opYear } from './analyticsUtils'

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
