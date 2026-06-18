import { describe, it, expect } from 'vitest'
import { rollupFromOperativas, withRollupColumns } from './operativasRollup'

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

describe('withRollupColumns — augmenta el patch con columnas sueltas', () => {
  it('patch con operativas → recomputa salida (más temprana) y eta_fiscal (más tardía)', () => {
    const patch = withRollupColumns({
      operativas: [
        { CNTR_OP: 'C1', SALIDA: '2026-06-18', ETA_FISC: '2026-06-20', DEPOSITO: 'GODILCO', OPERATIVA: 'TRASIEGO' },
        { CNTR_OP: 'C2', SALIDA: '2026-06-16', ETA_FISC: '2026-06-22', DEPOSITO: 'GODILCO', OPERATIVA: 'TRASIEGO' },
      ],
    })
    expect(patch.salida).toBe('2026-06-16')
    expect(patch.eta_fiscal).toBe('2026-06-22')
    expect(patch.deposito).toBe('GODILCO')
    expect(patch.operativa).toBe('TRASIEGO')
    expect(patch.contenedor).toBe('C1, C2')
    // conserva el array original
    expect(Array.isArray(patch.operativas)).toBe(true)
  })

  it('patch sin operativas → sin cambios', () => {
    const patch = withRollupColumns({ cliente: 'PERETTI' })
    expect(patch).toEqual({ cliente: 'PERETTI' })
    expect('salida' in patch).toBe(false)
  })

  it('patch con operativas vacío → sin cambios', () => {
    const patch = withRollupColumns({ operativas: [] })
    expect('salida' in patch).toBe(false)
  })
})
