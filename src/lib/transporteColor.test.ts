import { describe, it, expect } from 'vitest'
import { colorTransporte, COLOR_TRANSPORTE } from './transporteColor'

describe('colorTransporte — un color por transporte, como los depósitos', () => {
  it('cada transporte conocido tiene su color', () => {
    expect(colorTransporte('TRANSCAL')).toBe(COLOR_TRANSPORTE.TRANSCAL)
    expect(colorTransporte('RIGATOSSO')).toBe(COLOR_TRANSPORTE.RIGATOSSO)
    expect(colorTransporte('VAIROLATTI')).toBe(COLOR_TRANSPORTE.VAIROLATTI)
  })
  it('no importa cómo esté escrito', () => {
    expect(colorTransporte(' transcal ')).toBe(COLOR_TRANSPORTE.TRANSCAL)
    expect(colorTransporte('Transporte Rigatosso')).toBe(COLOR_TRANSPORTE.RIGATOSSO)
  })
  it('un transporte desconocido o vacío sale gris, nunca rompe', () => {
    const gris = colorTransporte('')
    expect(gris).toContain('slate')
    expect(colorTransporte('FLETES PEPE')).toBe(gris)
    expect(colorTransporte(null)).toBe(gris)
  })
  it('la paleta no se cruza con la de depósitos', () => {
    const deDepositos = ['red-', 'blue-', 'amber-', 'green-']
    for (const clase of Object.values(COLOR_TRANSPORTE)) {
      for (const d of deDepositos) expect(clase).not.toContain(d)
    }
  })
})
