import { describe, it, expect } from 'vitest'
import { colaSeguimientos, areaDeCarga, areaInicial, type CargaSeguimiento } from './seguimientos'

// La cola ya cubría nunca-enviadas y vencidas; estos tests fijan el cambio del
// 27/08 (caso A7995 de Brian): las "al día" dejan de ser un contador y son
// FILAS ordenadas por próximas a vencer, para laburar proactivo sin ir al modal.

const HOY = new Date(2026, 7, 27) // 27/08/2026

const carga = (over: Partial<CargaSeguimiento>): CargaSeguimiento => ({
  dbId: 'id-' + (over.ref || 'x'),
  ref: 'A1',
  cliente: 'CLIENTE',
  mode: 'fcl',
  archived: false,
  etd: '2026-08-01',
  eta: '2026-09-05',
  seguimiento: '',
  salida: '',
  descarga: '',
  etaFiscal: '',
  ...over,
})

describe('colaSeguimientos — pendientes (reglas que no cambian)', () => {
  it('nunca enviada → pendiente con dias null; 7+ días → pendiente con atraso', () => {
    const cola = colaSeguimientos([
      carga({ ref: 'A1', seguimiento: '' }),
      carga({ ref: 'A2', seguimiento: '2026-08-20' }), // justo 7 días
    ], HOY)
    expect(cola.pendientes.map(f => f.carga.ref)).toEqual(['A1', 'A2'])
    expect(cola.pendientes[0].dias).toBe(null)
    expect(cola.pendientes[1].dias).toBe(7)
  })

  it('archivadas y no marítimas no entran a ningún lado', () => {
    const cola = colaSeguimientos([
      carga({ ref: 'A1', archived: true, seguimiento: '2026-08-26' }),
      carga({ ref: 'A2', mode: 'aereo', seguimiento: '2026-08-26' }),
    ], HOY)
    expect(cola.pendientes).toHaveLength(0)
    expect(cola.alDia).toHaveLength(0)
  })
})

describe('colaSeguimientos — al día como filas (27/08)', () => {
  it('caso A7995: seguimiento hace 2 días → fila en alDia con dias=2, no en pendientes', () => {
    const cola = colaSeguimientos([carga({ ref: 'A7995', seguimiento: '2026-08-25' })], HOY)
    expect(cola.pendientes).toHaveLength(0)
    expect(cola.alDia).toHaveLength(1)
    expect(cola.alDia[0].carga.ref).toBe('A7995')
    expect(cola.alDia[0].dias).toBe(2)
  })

  it('ordenadas por más próximas a vencer (dias desc); a igualdad, ETA más próxima primero', () => {
    const cola = colaSeguimientos([
      carga({ ref: 'FRESCA', seguimiento: '2026-08-26' }),                       // 1 día
      carga({ ref: 'CASI', seguimiento: '2026-08-21' }),                          // 6 días
      carga({ ref: 'EMPATE-LEJOS', seguimiento: '2026-08-24', eta: '2026-09-15' }), // 3 días
      carga({ ref: 'EMPATE-CERCA', seguimiento: '2026-08-24', eta: '2026-09-01' }), // 3 días
    ], HOY)
    expect(cola.alDia.map(f => f.carga.ref)).toEqual(['CASI', 'EMPATE-CERCA', 'EMPATE-LEJOS', 'FRESCA'])
  })

  it('al día con ETA vencida sin señales de llegada conserva la marca "¿llegó?"', () => {
    const cola = colaSeguimientos([
      carga({ ref: 'A9', seguimiento: '2026-08-26', eta: '2026-08-24' }),
    ], HOY)
    expect(cola.alDia).toHaveLength(1)
    expect(cola.alDia[0].etaVencidaDias).toBe(3)
  })
})

// ─── Dos colas: FCL y LCL (Brian 04/09/2026) ────────────────────────────
// "En la parte de seguimientos, debe estar separado FCL de LCL". La regla de
// quién entra a la cola NO cambia: solo se parte por modalidad, y el progreso
// del día se cuenta por área (antes el % de Nico contaba updates de LCL).

describe('areaDeCarga', () => {
  it('fcl y lcl son áreas; el resto no tiene seguimiento semanal', () => {
    expect(areaDeCarga('fcl')).toBe('fcl')
    expect(areaDeCarga('LCL')).toBe('lcl')
    expect(areaDeCarga(' Fcl ')).toBe('fcl')
    expect(areaDeCarga('aereo')).toBe(null)
    expect(areaDeCarga('')).toBe(null)
    expect(areaDeCarga(null)).toBe(null)
  })
})

describe('colaSeguimientos — partición por área', () => {
  const mixtas = () => [
    carga({ ref: 'F1', mode: 'fcl' }),
    carga({ ref: 'F2', mode: 'fcl', seguimiento: '2026-08-25' }), // al día
    carga({ ref: 'L1', mode: 'lcl' }),
    carga({ ref: 'A1', mode: 'aereo' }),
  ]

  it('area=fcl trae solo FCL; area=lcl solo LCL', () => {
    const fcl = colaSeguimientos(mixtas(), HOY, 'fcl')
    expect(fcl.pendientes.map(f => f.carga.ref)).toEqual(['F1'])
    expect(fcl.alDia.map(f => f.carga.ref)).toEqual(['F2'])

    const lcl = colaSeguimientos(mixtas(), HOY, 'lcl')
    expect(lcl.pendientes.map(f => f.carga.ref)).toEqual(['L1'])
    expect(lcl.alDia).toHaveLength(0)
  })

  it('sin área vienen las dos juntas (badge de la pestaña)', () => {
    const todas = colaSeguimientos(mixtas(), HOY)
    expect(todas.pendientes.map(f => f.carga.ref).sort()).toEqual(['F1', 'L1'])
  })

  it('la regla de quién entra no cambia al partir: archivada LCL sigue afuera', () => {
    const cola = colaSeguimientos([
      carga({ ref: 'L1', mode: 'lcl', archived: true }),
      carga({ ref: 'L2', mode: 'lcl', etd: '2026-01-01', eta: '2027-06-01' }), // ni embarcada ni cerca
    ], HOY, 'lcl')
    expect(cola.pendientes).toHaveLength(0)
    expect(cola.alDia).toHaveLength(0)
  })
})

describe('progreso del día por área', () => {
  it('el % de FCL no cuenta los updates de LCL enviados hoy', () => {
    const cargas = [
      carga({ ref: 'F1', mode: 'fcl', seguimiento: '2026-08-27' }), // enviado hoy
      carga({ ref: 'F2', mode: 'fcl', seguimiento: '' }),            // falta
      carga({ ref: 'L1', mode: 'lcl', seguimiento: '2026-08-27' }),
      carga({ ref: 'L2', mode: 'lcl', seguimiento: '2026-08-27' }),
    ]
    const fcl = colaSeguimientos(cargas, HOY, 'fcl').progreso
    expect(fcl).toEqual({ enviados: 1, faltan: 1, total: 2, pct: 50 })
    const lcl = colaSeguimientos(cargas, HOY, 'lcl').progreso
    expect(lcl).toEqual({ enviados: 2, faltan: 0, total: 2, pct: 100 })
  })

  it('sin trabajo del día el progreso es 0 (y no divide por cero)', () => {
    const cola = colaSeguimientos([carga({ ref: 'F1', seguimiento: '2026-08-25' })], HOY, 'fcl')
    expect(cola.progreso).toEqual({ enviados: 0, faltan: 0, total: 0, pct: 0 })
  })

  it('un update mandado hoy sobre una carga que ya llegó sigue contando como hecho', () => {
    // Sale de la cola por la descarga cargada, pero el laburo del día fue.
    const cola = colaSeguimientos([
      carga({ ref: 'F1', seguimiento: '2026-08-27', eta: '2026-08-26', descarga: '2026-08-26' }),
      carga({ ref: 'F2', seguimiento: '' }),
    ], HOY, 'fcl')
    expect(cola.pendientes.map(f => f.carga.ref)).toEqual(['F2'])
    expect(cola.progreso).toEqual({ enviados: 1, faltan: 1, total: 2, pct: 50 })
  })

  it('el sello legacy D/M/YYYY de hoy también cuenta', () => {
    const cola = colaSeguimientos([carga({ ref: 'F1', seguimiento: '27/8/2026' })], HOY, 'fcl')
    expect(cola.progreso.enviados).toBe(1)
  })
})

describe('areaInicial — con qué área abre el tablero', () => {
  it('home_area lcl manda aunque en este navegador se haya mirado FCL', () => {
    expect(areaInicial('lcl', 'fcl')).toBe('lcl')
  })

  it('sin home_area de área vale la última elección guardada', () => {
    expect(areaInicial('seguimientos', 'lcl')).toBe('lcl')
    expect(areaInicial('', 'fcl')).toBe('fcl')
  })

  it('sin nada (o con basura guardada) abre en FCL', () => {
    expect(areaInicial(null, null)).toBe('fcl')
    expect(areaInicial('hoy', 'cualquiera')).toBe('fcl')
  })
})
