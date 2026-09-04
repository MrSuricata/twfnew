import { describe, it, expect } from 'vitest'
import { eventosCliente, agendaCliente } from './clientAgenda'
import type { ParsedShipment } from './shipmentTypes'

const HOY = '2026-08-26'

const carga = (over: Partial<ParsedShipment> & { CLIENT_REF?: string } = {}): ParsedShipment => ({
  REF: 'A8045', CLIENTE: '', ETD: '2026-07-06', ETA: '2026-09-06',
  FT: 0, LIBRE_HASTA: '', CNTR: 'FANU1858496', N: 1,
  MBL: '', LINEA: 'HAPAG', BUQUE: 'SAN LORENZO MAERSK 630W', TERMINAL: 'TCP',
  C_TERMINAL: 0, C_DEV: 0, LOCALES: 0, FLETE: 0, FORMA_DE_PAGO: 'al arribo', VTO: '',
  CR: false, BL: false, AD: false, AT: false, POL: '', POD: '', PAIS: 'UY',
  SEGUIMIENTO: '', TIPO: '', containers: [], calculatedN: 1, calculatedLibreHasta: '',
  operativas: [], ...over,
} as unknown as ParsedShipment)

describe('eventosCliente — los movimientos derivados de las cargas', () => {
  it('llegada MVD de la ETA + salida y llegada a depósito por contenedor', () => {
    const evs = eventosCliente([carga({
      CLIENT_REF: '1417',
      operativas: [{ CNTR_OP: 'FANU1858496', SALIDA: '2026-09-08', ETA_FISC: '2026-09-10' } as never],
    })], HOY)
    expect(evs.map(e => `${e.tipo}:${e.fecha}`)).toEqual([
      'llegada_mvd:2026-09-06', 'salida:2026-09-08', 'llegada_deposito:2026-09-10',
    ])
    expect(evs[0].clientRef).toBe('1417')
    expect(evs[0].buque).toBe('SAN LORENZO MAERSK 630W')
    expect(evs[1].dias).toBe(13)
  })

  it('fechas no parseables no generan eventos', () => {
    const evs = eventosCliente([carga({
      ETA: 'CONFIRMAR',
      operativas: [{ CNTR_OP: 'X', SALIDA: '', ETA_FISC: 'COORDINADO' } as never],
    })], HOY)
    expect(evs).toEqual([])
  })

  it('dos contenedores = dos salidas, cada una con su fecha', () => {
    const evs = eventosCliente([carga({
      operativas: [
        { CNTR_OP: 'C1', SALIDA: '2026-09-08' } as never,
        { CNTR_OP: 'C2', SALIDA: '2026-09-09' } as never,
      ],
    })], HOY)
    expect(evs.filter(e => e.tipo === 'salida').map(e => e.cntr)).toEqual(['C1', 'C2'])
  })
})

describe('agendaCliente — semana, mes, últimas y próximos', () => {
  const cargas = [
    carga({ REF: 'SEMANA', ETA: '2026-08-28', operativas: [{ CNTR_OP: 'S1', SALIDA: '2026-09-01' } as never] }),
    carga({ REF: 'MES', ETA: '2026-08-05' }),          // llegó este mes, hace 21 días
    carga({ REF: 'RECIEN', ETA: '2026-08-21' }),       // llegada de hace 5 días
    carga({ REF: 'LEJOS', ETA: '2026-10-02' }),        // el mes que viene
  ]

  it('esta semana: hoy a +7, en orden', () => {
    const a = agendaCliente(cargas, HOY)
    expect(a.estaSemana.map(e => e.ref)).toEqual(['SEMANA', 'SEMANA'])
    expect(a.estaSemana[0].tipo).toBe('llegada_mvd')  // 28/08 antes que la salida 01/09
  })

  it('este mes: todo lo del mes calendario, pasado y futuro', () => {
    const a = agendaCliente(cargas, HOY)
    expect(a.esteMes.map(e => e.ref).sort()).toEqual(['MES', 'RECIEN', 'SEMANA'])
  })

  it('últimas llegadas: solo llegadas MVD de los últimos 14 días, la más nueva primero', () => {
    const a = agendaCliente(cargas, HOY)
    expect(a.ultimasLlegadas.map(e => e.ref)).toEqual(['RECIEN'])  // MES quedó a 21 días
  })

  it('próximos: todo lo que viene ordenado — incluye el mes que viene', () => {
    const a = agendaCliente(cargas, HOY)
    expect(a.proximos.map(e => e.ref)).toEqual(['SEMANA', 'SEMANA', 'LEJOS'])
  })
})
