import { describe, it, expect } from 'vitest'
import { isSalidaBeforeArrival, margenSalida, avisoSalida, isSalidaAjustada } from './salidaCheck'

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

// ── Margen mínimo de 2 días (Brian 10/08/2026) ─────────────────────────
// "lo normal es que sea dos días después de que llegue el buque por lo menos
//  y sino me debería saltar algún aviso visible"
describe('margen entre la llegada del buque y la salida', () => {
  it('cuenta los días entre llegada y salida', () => {
    expect(margenSalida('2026-08-13', '2026-08-10')).toBe(3)
    expect(margenSalida('2026-08-10', '2026-08-10')).toBe(0)
    expect(margenSalida('2026-08-08', '2026-08-10')).toBe(-2)
  })

  it('sin alguna de las dos fechas no inventa nada', () => {
    expect(margenSalida('', '2026-08-10')).toBeNull()
    expect(margenSalida('2026-08-10', '')).toBeNull()
    expect(avisoSalida('', '2026-08-10')).toBe('')
  })

  it('2 días o más: sin aviso', () => {
    expect(avisoSalida('2026-08-12', '2026-08-10')).toBe('')
    expect(avisoSalida('2026-08-20', '2026-08-10')).toBe('')
    expect(isSalidaAjustada('2026-08-12', '2026-08-10')).toBe(false)
  })

  it('mismo día y 1 día: avisa, pero no es "antes de llegar"', () => {
    expect(avisoSalida('2026-08-10', '2026-08-10')).toContain('MISMO día')
    expect(avisoSalida('2026-08-11', '2026-08-10')).toContain('1 día')
    expect(isSalidaAjustada('2026-08-10', '2026-08-10')).toBe(true)
    expect(isSalidaAjustada('2026-08-11', '2026-08-10')).toBe(true)
    expect(isSalidaBeforeArrival('2026-08-11', '2026-08-10')).toBe(false)
  })

  it('antes de llegar: sigue siendo el aviso grave', () => {
    expect(avisoSalida('2026-08-08', '2026-08-10')).toContain('ANTES')
    expect(isSalidaBeforeArrival('2026-08-08', '2026-08-10')).toBe(true)
    // no lo cuenta como "ajustada": es otra cosa, más grave
    expect(isSalidaAjustada('2026-08-08', '2026-08-10')).toBe(false)
  })

  it('caso real A7867: 09/08 llega, 11/08 sale → justo en el mínimo, sin aviso', () => {
    expect(avisoSalida('2026-08-11', '2026-08-09')).toBe('')
  })
})
