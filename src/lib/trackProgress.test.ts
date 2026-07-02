import { describe, it, expect } from 'vitest'
import { voyageProgress, voyageCaption } from './trackProgress'

const at = (iso: string) => new Date(`${iso}T12:00:00`)

describe('voyageProgress', () => {
  it('devuelve null sin fechas o con formato no-ISO', () => {
    expect(voyageProgress(undefined, '2026-05-17')).toBeNull()
    expect(voyageProgress('2026-03-26', undefined)).toBeNull()
    expect(voyageProgress('', '')).toBeNull()
    expect(voyageProgress('26/03/2026', '17/05/2026')).toBeNull()
    expect(voyageProgress('2026-3-26', '2026-05-17')).toBeNull()
  })

  it('devuelve null si la ETA es anterior o igual a la ETD', () => {
    expect(voyageProgress('2026-05-17', '2026-03-26')).toBeNull()
    expect(voyageProgress('2026-05-17', '2026-05-17')).toBeNull()
  })

  it('clampea a 0 antes de la salida', () => {
    const v = voyageProgress('2026-03-26', '2026-05-17', at('2026-03-01'))!
    expect(v.pct).toBe(0)
  })

  it('interpola a mitad de viaje', () => {
    const v = voyageProgress('2026-03-01', '2026-03-21', at('2026-03-11'))!
    expect(v.pct).toBeCloseTo(0.525, 2) // mediodía del día 10 de 20
    expect(v.daysLeft).toBe(10)
  })

  it('clampea a 1 después de la ETA y daysLeft queda en 0', () => {
    const v = voyageProgress('2026-03-26', '2026-05-17', at('2026-06-01'))!
    expect(v.pct).toBe(1)
    expect(v.daysLeft).toBe(0)
  })

  it('día de llegada: pct alto y daysLeft 0 (ETA a la medianoche ya pasó al mediodía)', () => {
    const v = voyageProgress('2026-03-01', '2026-03-21', at('2026-03-21'))!
    expect(v.pct).toBe(1)
    expect(v.daysLeft).toBe(0)
  })
})

describe('voyageCaption', () => {
  it('arma la leyenda con porcentaje y días', () => {
    expect(voyageCaption({ pct: 0.62, daysLeft: 13 })).toBe('En navegación: 62% del viaje · faltan ~13 días')
  })
  it('singulariza 1 día', () => {
    expect(voyageCaption({ pct: 0.97, daysLeft: 1 })).toBe('En navegación: 97% del viaje · faltan ~1 día')
  })
  it('llegando con 0 días', () => {
    expect(voyageCaption({ pct: 1, daysLeft: 0 })).toBe('En navegación: 100% del viaje · llegando (ETA hoy)')
  })
})
