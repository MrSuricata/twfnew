import { describe, it, expect } from 'vitest'
import { isLibreDevuelto, libreDevueltoToggle, LIBRE_DEVUELTO } from './libreDevuelto'

describe('isLibreDevuelto', () => {
  it('detecta DEVUELTO case-insensitive y con texto alrededor (criterio de isOperationActive)', () => {
    expect(isLibreDevuelto('DEVUELTO')).toBe(true)
    expect(isLibreDevuelto('devuelto 02/07')).toBe(true)
  })
  it('fechas, vacío y undefined NO son devuelto', () => {
    expect(isLibreDevuelto('2026-07-10')).toBe(false)
    expect(isLibreDevuelto('')).toBe(false)
    expect(isLibreDevuelto(undefined)).toBe(false)
  })
})

describe('libreDevueltoToggle', () => {
  it('marcar: fecha o vacío → DEVUELTO, capturando el valor EXACTO anterior para Deshacer', () => {
    expect(libreDevueltoToggle('2026-07-10')).toEqual({ next: LIBRE_DEVUELTO, prev: '2026-07-10' })
    expect(libreDevueltoToggle('')).toEqual({ next: LIBRE_DEVUELTO, prev: '' })
  })
  it('deshacer devuelto: DEVUELTO → vacío (la fecha original ya fue pisada)', () => {
    expect(libreDevueltoToggle('DEVUELTO')).toEqual({ next: '', prev: 'DEVUELTO' })
  })
})
