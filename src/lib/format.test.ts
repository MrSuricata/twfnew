import { describe, it, expect } from 'vitest'
import { fmtDateDMY, fmtNum, fmtHorasAtraso } from './format'

describe('fmtDateDMY', () => {
  it('convierte ISO yyyy-MM-dd a dd/MM/yyyy con ceros', () => {
    expect(fmtDateDMY('2026-07-02')).toBe('02/07/2026')
    expect(fmtDateDMY('2025-12-31')).toBe('31/12/2025')
  })
  it('devuelve tal cual lo que no es ISO (textos como DEVUELTO)', () => {
    expect(fmtDateDMY('DEVUELTO')).toBe('DEVUELTO')
    expect(fmtDateDMY('22/06/2026')).toBe('22/06/2026')
    expect(fmtDateDMY('')).toBe('')
    expect(fmtDateDMY(undefined)).toBe('')
  })
})

describe('fmtNum', () => {
  it('separa miles con formato es-UY', () => {
    expect(fmtNum(1372)).toBe('1.372')
    expect(fmtNum(22706)).toBe('22.706')
    expect(fmtNum(80)).toBe('80')
  })
})

describe('fmtHorasAtraso', () => {
  it('menos de 48 h muestra horas', () => {
    expect(fmtHorasAtraso(5)).toBe('+5h')
    expect(fmtHorasAtraso(47)).toBe('+47h')
  })
  it('48 h o más muestra días redondeados', () => {
    expect(fmtHorasAtraso(48)).toBe('+2d')
    expect(fmtHorasAtraso(1029)).toBe('+43d')
  })
})
