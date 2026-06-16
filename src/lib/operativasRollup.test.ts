import { describe, it, expect } from 'vitest'
import { rollupFromOperativas } from './operativasRollup'

describe('rollupFromOperativas', () => {
  it('salida = más temprana, eta_fiscal = más tardía, varias=flag', () => {
    const r = rollupFromOperativas([
      { SALIDA: '2026-06-18', ETA_FISC: '2026-06-20' } as any,
      { SALIDA: '2026-06-16', ETA_FISC: '2026-06-22' } as any,
    ])
    expect(r.salida).toBe('2026-06-16')
    expect(r.eta_fiscal).toBe('2026-06-22')
    expect(r.salidaVaria).toBe(true)
  })
  it('vacío → strings vacíos', () => {
    expect(rollupFromOperativas([]).salida).toBe('')
  })
})
