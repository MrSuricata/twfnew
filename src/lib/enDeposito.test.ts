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

describe('fechas por contenedor (caso A8025, 19/08)', () => {
  const a8025 = (): CargaRendimiento => carga({
    ref: 'A8025', cntr: 'EGSU0310260, EMCU1818703',
    salida: '2026-08-18',   // rollup: la salida más temprana (la del EMCU)
    operativas: [
      { cntr: 'EGSU0310260', salida: '2026-08-19' },
      { cntr: 'EMCU1818703', salida: '2026-08-18' },
    ],
  })

  it('el trasiego de HOY manda aunque el otro contenedor salió ayer', () => {
    // Con una sola fecha por carga, A8025 aparecía como "Ayer" y el trasiego
    // de HOY del EGSU era invisible.
    const hoy = '2026-08-19'
    const l = cargasEnDeposito([a8025()], hoy)
    expect(l).toHaveLength(1)
    expect(l[0].cuando).toBe('hoy')
    expect(l[0].fecha).toBe('2026-08-19')
  })

  it('cada bloque lleva su propia fecha', () => {
    const l = cargasEnDeposito([a8025()], '2026-08-19')
    const por = Object.fromEntries(l[0].bloques.map(b => [b.cntr, b.cuando]))
    expect(por['EGSU0310260']).toBe('hoy')
    expect(por['EMCU1818703']).toBe('pasada')
  })

  it('entra a la ventana si ALGÚN contenedor cae adentro', () => {
    // El EMCU salió hace 10 días (fuera de la ventana de 3), pero el EGSU
    // sale mañana: la carga tiene que aparecer igual.
    const c = carga({
      ref: 'A9100', cntr: 'UNO, DOS', salida: '2026-08-09',
      operativas: [
        { cntr: 'UNO', salida: '2026-08-09' },
        { cntr: 'DOS', salida: '2026-08-20' },
      ],
    })
    const l = cargasEnDeposito([c], '2026-08-19')
    expect(l).toHaveLength(1)
    expect(l[0].cuando).toBe('futura')
    // El bloque viejo se muestra igual (con su badge), aunque no ubique a la carga.
    expect(l[0].bloques.find(b => b.cntr === 'UNO')?.cuando).toBe('pasada')
  })

  it('con todos los contenedores fuera de ventana, la carga no aparece', () => {
    const c = carga({
      ref: 'A9200', cntr: 'UNO, DOS', salida: '2026-07-01',
      operativas: [
        { cntr: 'UNO', salida: '2026-07-01' },
        { cntr: 'DOS', salida: '2026-07-05' },
      ],
    })
    expect(cargasEnDeposito([c], '2026-08-19')).toEqual([])
  })

  it('sin fila propia en Operativas cae a la fecha de la carga (como antes)', () => {
    const l = cargasEnDeposito([carga({ cntr: 'SOLO1234567', salida: HOY, operativas: [] })], HOY)
    expect(l).toHaveLength(1)
    expect(l[0].bloques[0].cuando).toBe('hoy')
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
