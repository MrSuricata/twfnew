import { describe, it, expect } from 'vitest'
import {
  statsDe, tiemposResumen, transitoPorLinea, transitoPorOrigen,
  coordinacionPorDeposito, tiemposPorMes, MIN_MUESTRA_GRUPO,
} from './tiemposUtils'
import { op } from './analyticsTestFactories'

describe('statsDe — mediana manda, el promedio acompaña', () => {
  it('impar: mediana exacta del medio', () => {
    expect(statsDe([10, 40, 20])).toEqual({ n: 3, mediana: 20, promedio: 23.3, p90: 40 })
  })

  it('par: promedio de los dos del medio', () => {
    const s = statsDe([10, 20, 30, 40])!
    expect(s.mediana).toBe(25)
    expect(s.n).toBe(4)
  })

  it('sin datos → null (nunca inventar un cero)', () => {
    expect(statsDe([])).toBeNull()
  })

  it('un outlier no arrastra la mediana (por eso es el número principal)', () => {
    const s = statsDe([30, 32, 34, 36, 300])!
    expect(s.mediana).toBe(34)
    expect(s.promedio).toBeGreaterThan(80)
  })
})

describe('tiemposResumen — los cuatro tramos', () => {
  it('mide tránsito, coordinación, a fiscal y puerta a puerta', () => {
    const r = tiemposResumen([op({
      etd: '2026-07-06', eta: '2026-08-21',
      operativas: [{ CNTR_OP: 'C1', SALIDA: '2026-08-24', ETA_FISC: '2026-08-26' } as never],
    })])
    expect(r.transito?.mediana).toBe(46)       // ETD→ETA
    expect(r.coordinacion?.mediana).toBe(3)    // ETA→salida
    expect(r.aFiscal?.mediana).toBe(2)         // salida→fiscal
    expect(r.puertaAPuerta?.mediana).toBe(51)  // ETD→fiscal
  })

  it('cada contenedor aporta su propia medición', () => {
    const r = tiemposResumen([op({
      eta: '2026-08-21',
      operativas: [
        { CNTR_OP: 'C1', SALIDA: '2026-08-22' } as never,
        { CNTR_OP: 'C2', SALIDA: '2026-08-26' } as never,
      ],
    })])
    expect(r.coordinacion).toEqual({ n: 2, mediana: 3, promedio: 3, p90: 5 })
  })

  it('sin array de contenedores cae a las columnas colapsadas', () => {
    const r = tiemposResumen([op({ eta: '2026-08-21', salida: '2026-08-25' })])
    expect(r.coordinacion?.mediana).toBe(4)
  })

  it('las fechas rotas quedan fuera por el rango de sanidad', () => {
    const r = tiemposResumen([
      op({ etd: '2026-08-21', eta: '2026-08-01' }),   // tránsito negativo: basura
      op({ etd: '2020-01-01', eta: '2026-08-01' }),   // 2400 días: basura
      op({ etd: '2026-07-01', eta: '2026-08-15' }),   // 45 días: real
    ])
    expect(r.transito?.n).toBe(1)
    expect(r.transito?.mediana).toBe(45)
  })

  it('aéreo y terrestre no entran en los tiempos marítimos', () => {
    const r = tiemposResumen([op({ mode: 'air', etd: '2026-08-01', eta: '2026-08-03' })])
    expect(r.transito).toBeNull()
  })

  it('acepta el formato de fecha de la planilla (D/M/YYYY)', () => {
    const r = tiemposResumen([op({ etd: '6/7/2026', eta: '21/8/2026' })])
    expect(r.transito?.mediana).toBe(46)
  })
})

describe('grupos — línea, origen, depósito', () => {
  const viaje = (linea: string, origin: string, etd: string, eta: string) =>
    op({ linea, origin, etd, eta })

  it('tránsito por línea: mediana, la más rápida primero, mínimo de muestra', () => {
    const ops = [
      viaje('MAERSK', '', '2026-07-01', '2026-08-10'),  // 40
      viaje('MAERSK', '', '2026-07-01', '2026-08-14'),  // 44
      viaje('MAERSK', '', '2026-07-01', '2026-08-12'),  // 42
      viaje('ONE', '', '2026-07-01', '2026-08-05'),     // 35 — pero solo 1 viaje
    ]
    const g = transitoPorLinea(ops)
    expect(MIN_MUESTRA_GRUPO).toBe(3)
    expect(g.map(x => x.nombre)).toEqual(['MAERSK'])   // ONE no llega a la muestra mínima
    expect(g[0].stats.mediana).toBe(42)
  })

  it('tránsito por puerto de origen', () => {
    const ops = [1, 2, 3].map(i => viaje('X', 'SHANGHAI', '2026-07-01', `2026-08-1${i}`))
    const g = transitoPorOrigen(ops)
    expect(g[0].nombre).toBe('SHANGHAI')
    expect(g[0].stats.n).toBe(3)
  })

  it('coordinación por depósito', () => {
    const ops = [2, 3, 4].map(d => op({
      deposito: 'GODILCO', eta: '2026-08-20',
      operativas: [{ CNTR_OP: 'C', SALIDA: `2026-08-2${d}` } as never],
    }))
    const g = coordinacionPorDeposito(ops)
    expect(g[0]).toEqual({ nombre: 'GODILCO', stats: { n: 3, mediana: 3, promedio: 3, p90: 4 } })
  })
})

describe('tiemposPorMes — la tendencia', () => {
  it('mediana de tránsito y coordinación por mes de ETA, en orden', () => {
    const m = tiemposPorMes([
      op({ etd: '2026-06-01', eta: '2026-07-15', operativas: [{ CNTR_OP: 'C', SALIDA: '2026-07-18' } as never] }),
      op({ etd: '2026-07-01', eta: '2026-08-10', operativas: [{ CNTR_OP: 'C', SALIDA: '2026-08-16' } as never] }),
    ])
    expect(m).toEqual([
      { mes: '2026-07', transito: 44, coordinacion: 3 },
      { mes: '2026-08', transito: 40, coordinacion: 6 },
    ])
  })
})
