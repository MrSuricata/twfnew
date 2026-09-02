import { describe, it, expect } from 'vitest'
import { despachantesUsados, despachanteSugerido, type CargaConDespachante } from './despachante'

const c = (cliente: string, despacho: string, eta = '2026-08-01', extra: Partial<CargaConDespachante> = {}): CargaConDespachante =>
  ({ cliente, despacho, eta, fiscal: 'CACEC', ...extra })

describe('despachantesUsados', () => {
  it('devuelve los usados, los más frecuentes primero', () => {
    const lista = [c('A', 'GOMEZ'), c('B', 'PEREZ'), c('C', 'GOMEZ'), c('D', ''), c('E', 'GOMEZ')]
    expect(despachantesUsados(lista)).toEqual(['GOMEZ', 'PEREZ'])
  })
  it('no repite el mismo escrito distinto', () => {
    expect(despachantesUsados([c('A', 'GOMEZ S.A.'), c('B', 'GOMEZ SA')])).toEqual(['GOMEZ S.A.'])
  })
  it('sin datos, lista vacía', () => {
    expect(despachantesUsados([])).toEqual([])
    expect(despachantesUsados([c('A', '')])).toEqual([])
  })
})

describe('despachanteSugerido — por historial del cliente', () => {
  const historial = [
    c('CHIAPERO', 'GOMEZ', '2026-08-20'),
    c('CHIAPERO', 'GOMEZ', '2026-08-10'),
    c('CHIAPERO', 'PEREZ', '2026-07-01'),
    c('OTRO', 'LOPEZ', '2026-08-15'),
  ]

  it('sugiere el que más usa ese cliente, con el motivo a la vista', () => {
    const s = despachanteSugerido('CHIAPERO', 'CACEC', historial)
    expect(s).toEqual({ valor: 'GOMEZ', motivo: '2 de las últimas 3 de este cliente', origen: 'cliente' })
  })

  it('si siempre usó el mismo, lo dice así', () => {
    const s = despachanteSugerido('OTRO', '', historial)
    expect(s).toEqual({ valor: 'LOPEZ', motivo: 'la última carga de este cliente', origen: 'cliente' })
  })

  it('el nombre del cliente puede venir escrito distinto', () => {
    expect(despachanteSugerido('chiapero', '', historial)?.valor).toBe('GOMEZ')
  })

  it('empate: gana el de la carga más reciente', () => {
    const empate = [c('X', 'PEREZ', '2026-08-20'), c('X', 'GOMEZ', '2026-08-01')]
    expect(despachanteSugerido('X', '', empate)?.valor).toBe('PEREZ')
  })

  it('las archivadas no cuentan', () => {
    const s = despachanteSugerido('Z', '', [c('Z', 'VIEJO', '2026-01-01', { archived: true })])
    expect(s).toBeNull()
  })

  it('solo mira las últimas N del cliente', () => {
    const muchas = [
      ...Array.from({ length: 8 }, (_, i) => c('Y', 'NUEVO', `2026-08-${String(20 - i).padStart(2, '0')}`)),
      c('Y', 'ANTIGUO', '2026-01-01'),
    ]
    const s = despachanteSugerido('Y', '', muchas)
    expect(s).toEqual({ valor: 'NUEVO', motivo: 'las últimas 8 de este cliente', origen: 'cliente' })
  })
})

describe('despachanteSugerido — respaldo por depósito fiscal', () => {
  const historial = [
    c('OTRO CLIENTE', 'LOPEZ', '2026-08-15', { fiscal: 'ZP RAFAELA' }),
    c('OTRO MAS', 'LOPEZ', '2026-08-10', { fiscal: 'ZP RAFAELA' }),
    c('TERCERO', 'GOMEZ', '2026-08-12', { fiscal: 'CACEC' }),
  ]
  it('cliente nuevo: propone el que más entra a ese fiscal', () => {
    const s = despachanteSugerido('CLIENTE NUEVO', 'ZP RAFAELA', historial)
    expect(s).toEqual({ valor: 'LOPEZ', motivo: 'el que más entra en ZP RAFAELA', origen: 'fiscal' })
  })
  it('el historial del cliente le gana al del fiscal', () => {
    const s = despachanteSugerido('TERCERO', 'ZP RAFAELA', historial)
    expect(s?.valor).toBe('GOMEZ')
    expect(s?.origen).toBe('cliente')
  })
  it('sin nada que mirar, no inventa', () => {
    expect(despachanteSugerido('NUEVO', 'FISCAL NUEVO', historial)).toBeNull()
    expect(despachanteSugerido('', '', [])).toBeNull()
  })
})
