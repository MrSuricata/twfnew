import { describe, it, expect } from 'vitest'
import { isSalidaBeforeArrival } from './salidaCheck'

describe('isSalidaBeforeArrival', () => {
  it('salida anterior a la llegada → true', () => {
    expect(isSalidaBeforeArrival('2026-06-20', '2026-06-21')).toBe(true)
  })

  it('salida posterior a la llegada → false', () => {
    expect(isSalidaBeforeArrival('2026-06-22', '2026-06-21')).toBe(false)
  })

  it('mismo día (llega y sale el mismo día) → false (no es "antes")', () => {
    expect(isSalidaBeforeArrival('2026-06-21', '2026-06-21')).toBe(false)
  })

  it('sin salida → false (no hay con qué comparar)', () => {
    expect(isSalidaBeforeArrival('', '2026-06-21')).toBe(false)
    expect(isSalidaBeforeArrival(undefined, '2026-06-21')).toBe(false)
  })

  it('sin ETA → false', () => {
    expect(isSalidaBeforeArrival('2026-06-20', '')).toBe(false)
    expect(isSalidaBeforeArrival('2026-06-20', null)).toBe(false)
  })

  it('placeholders no-fecha (CONFIRMAR / #N/A) → false', () => {
    expect(isSalidaBeforeArrival('CONFIRMAR', '2026-06-21')).toBe(false)
    expect(isSalidaBeforeArrival('2026-06-20', 'CONFIRMAR')).toBe(false)
  })

  it('caso real A6820-like: ETA se corrió a 21, salida quedó en 20 → true', () => {
    expect(isSalidaBeforeArrival('2026-06-20', '2026-06-21')).toBe(true)
  })
})
