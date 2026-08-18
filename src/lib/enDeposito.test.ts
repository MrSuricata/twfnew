import { describe, it, expect } from 'vitest'
import {
  DIAS_ATRAS, DIAS_ADELANTE,
  cargasEnDeposito, filtrarCargas, etiquetaCuando,
} from './enDeposito'
import type { CargaRendimiento } from './miRendimiento'

const HOY = '2026-08-18'

const carga = (c: Partial<CargaRendimiento> = {}): CargaRendimiento => ({
  ref: 'A7938', cliente: 'TOMASELLI', deposito: 'GODILCO', operativa: 'TRASIEGO',
  cntr: 'CSLU6176200', eta: HOY, salida: HOY, pais: 'UY',
  mode: 'fcl', archived: false, ...c,
})

describe('cargasEnDeposito', () => {
  it('trae la operativa de depósito de hoy', () => {
    const l = cargasEnDeposito([carga()], HOY)
    expect(l).toHaveLength(1)
    expect(l[0].ref).toBe('A7938')
    expect(l[0].dias).toBe(0)
    expect(l[0].cuando).toBe('hoy')
  })

  it('deja afuera lo que no es operativa de depósito', () => {
    // El criterio es el mismo de /mirendimiento: marítima, por Uruguay,
    // con operativa de depósito y no archivada.
    expect(cargasEnDeposito([carga({ operativa: 'DIRECTO A FISCAL' })], HOY)).toEqual([])
    expect(cargasEnDeposito([carga({ mode: 'aereo' })], HOY)).toEqual([])
    expect(cargasEnDeposito([carga({ archived: true })], HOY)).toEqual([])
  })

  it('incluye CARGA A PISO, no solo TRASIEGO', () => {
    expect(cargasEnDeposito([carga({ operativa: 'CARGA A PISO' })], HOY)).toHaveLength(1)
  })

  it('toma la ETA cuando SALIDA es texto y no una fecha', () => {
    // 'CONFIRMAR' es truthy: sin el guard la carga parada en depósito —
    // justo la que uno va a ver— se caía de la lista.
    const l = cargasEnDeposito([carga({ salida: 'CONFIRMAR', eta: HOY })], HOY)
    expect(l).toHaveLength(1)
    expect(l[0].fecha).toBe(HOY)
  })

  it('respeta la ventana: nada más viejo ni más nuevo de la cuenta', () => {
    const dia = (n: number) => {
      const d = new Date(2026, 7, 18 + n)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const dentro = cargasEnDeposito([
      carga({ ref: 'BORDE_ATRAS', salida: dia(-DIAS_ATRAS) }),
      carga({ ref: 'BORDE_ADELANTE', salida: dia(DIAS_ADELANTE) }),
    ], HOY)
    expect(dentro.map(c => c.ref).sort()).toEqual(['BORDE_ADELANTE', 'BORDE_ATRAS'])

    const fuera = cargasEnDeposito([
      carga({ ref: 'VIEJA', salida: dia(-DIAS_ATRAS - 1) }),
      carga({ ref: 'LEJANA', salida: dia(DIAS_ADELANTE + 1) }),
    ], HOY)
    expect(fuera).toEqual([])
  })

  it('la ventana se puede ampliar', () => {
    const l = cargasEnDeposito([carga({ salida: '2026-09-30' })], HOY, { adelante: 60 })
    expect(l).toHaveLength(1)
  })

  it('ordena: hoy primero, después lo que viene, después lo que pasó', () => {
    const l = cargasEnDeposito([
      carga({ ref: 'PASADA_3', salida: '2026-08-15' }),
      carga({ ref: 'FUTURA_2', salida: '2026-08-20' }),
      carga({ ref: 'HOY', salida: HOY }),
      carga({ ref: 'PASADA_1', salida: '2026-08-17' }),
      carga({ ref: 'FUTURA_1', salida: '2026-08-19' }),
    ], HOY)
    expect(l.map(c => c.ref)).toEqual(['HOY', 'FUTURA_1', 'FUTURA_2', 'PASADA_1', 'PASADA_3'])
  })

  it('una carga sin fecha usable no entra (no se puede ubicar)', () => {
    expect(cargasEnDeposito([carga({ salida: '#N/A', eta: '' })], HOY)).toEqual([])
  })

  it('lista vacía no rompe', () => {
    expect(cargasEnDeposito([], HOY)).toEqual([])
  })

  it('conserva los datos que la pantalla necesita', () => {
    const l = cargasEnDeposito([carga({ deposito: 'PLANIR', cntr: 'MRKU1234567' })], HOY)
    expect(l[0]).toMatchObject({
      cliente: 'TOMASELLI', deposito: 'PLANIR', operativa: 'TRASIEGO', cntr: 'MRKU1234567',
    })
  })
})

describe('filtrarCargas', () => {
  const lista = cargasEnDeposito([
    carga({ ref: 'A7938', cliente: 'TOMASELLI', deposito: 'GODILCO', cntr: 'CSLU6176200' }),
    carga({ ref: 'A8000', cliente: 'NAVATTA', deposito: 'PLANIR', cntr: 'MRKU1234567' }),
  ], HOY)

  it('sin texto devuelve todo', () => {
    expect(filtrarCargas(lista, '')).toHaveLength(2)
    expect(filtrarCargas(lista, '   ')).toHaveLength(2)
  })

  it('busca por ref, cliente, depósito y contenedor', () => {
    expect(filtrarCargas(lista, 'a7938')).toHaveLength(1)
    expect(filtrarCargas(lista, 'navatta')).toHaveLength(1)
    expect(filtrarCargas(lista, 'planir')).toHaveLength(1)
    expect(filtrarCargas(lista, 'mrku')).toHaveLength(1)
  })

  it('sin coincidencias devuelve vacío', () => {
    expect(filtrarCargas(lista, 'zzz')).toEqual([])
  })
})

describe('etiquetaCuando', () => {
  it('nombra los días cercanos', () => {
    expect(etiquetaCuando(0)).toBe('Hoy')
    expect(etiquetaCuando(1)).toBe('Mañana')
    expect(etiquetaCuando(-1)).toBe('Ayer')
  })

  it('los lejanos van con número', () => {
    expect(etiquetaCuando(3)).toBe('En 3 días')
    expect(etiquetaCuando(-3)).toBe('Hace 3 días')
  })
})
