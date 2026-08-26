import { describe, it, expect } from 'vitest'
import {
  cargasMontecon, estadoAgenda, MONTECON_DIAS_ADELANTE, MONTECON_DIAS_ATRAS,
  type CargaMonteconInput, type AgendaRow,
} from './monteconAgenda'

const HOY = '2026-08-22'

const carga = (c: Partial<CargaMonteconInput> = {}): CargaMonteconInput => ({
  dbId: 'x', ref: 'A8045', cliente: 'CHIAPERO', terminal: 'MONTECON',
  contenedor: 'FANU1858496', eta: '2026-08-24', mode: 'fcl', archived: false, ...c,
})

const agenda = (ref: string, eta: string): AgendaRow => ({ ref, eta_agendada: eta })

describe('estadoAgenda', () => {
  it('sin fila = sin agendar', () => {
    expect(estadoAgenda('2026-08-24', undefined)).toBe('sin_agendar')
  })

  it('agendada contra la MISMA eta = agendada', () => {
    expect(estadoAgenda('2026-08-24', agenda('A8045', '2026-08-24'))).toBe('agendada')
  })

  it('la ETA se movió aunque sea un día = reagendar', () => {
    // El corazón del pedido de Brian: "si cambia la fecha de arribo del buque
    // me puede decir SE MODIFICO FECHA DE ARRIBO, VOLVER A AGENDAR".
    expect(estadoAgenda('2026-08-27', agenda('A8045', '2026-08-24'))).toBe('reagendar')
  })
})

describe('cargasMontecon — quién entra y cómo se ordena', () => {
  it('solo FCL vivas con terminal MONTECON', () => {
    const l = cargasMontecon([
      carga(),
      carga({ ref: 'TCP1', terminal: 'TCP' }),
      carga({ ref: 'LCL1', mode: 'lcl' }),
      carga({ ref: 'ARCH', archived: true }),
    ], [], HOY)
    expect(l.map(c => c.ref)).toEqual(['A8045'])
  })

  it('la ventana: llegadas recientes (retiro pendiente) y próximas dos semanas', () => {
    const dia = (n: number) => {
      const d = new Date(2026, 7, 22 + n)
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      return d.getFullYear() + '-' + mm + '-' + dd
    }
    const dentro = cargasMontecon([
      carga({ ref: 'LLEGO', eta: dia(-MONTECON_DIAS_ATRAS) }),
      carga({ ref: 'VIENE', eta: dia(MONTECON_DIAS_ADELANTE) }),
    ], [], HOY)
    expect(dentro).toHaveLength(2)
    const fuera = cargasMontecon([
      carga({ ref: 'VIEJA', eta: dia(-MONTECON_DIAS_ATRAS - 1) }),
      carga({ ref: 'LEJOS', eta: dia(MONTECON_DIAS_ADELANTE + 1) }),
    ], [], HOY)
    expect(fuera).toEqual([])
  })

  it('sin ETA parseable no entra (no hay contra qué agendar)', () => {
    expect(cargasMontecon([carga({ eta: 'CONFIRMAR' })], [], HOY)).toEqual([])
  })

  it('las que hay que REAGENDAR van primero — son el fuego', () => {
    const l = cargasMontecon([
      carga({ ref: 'OK', eta: '2026-08-23' }),
      carga({ ref: 'MOVIDA', eta: '2026-08-26' }),
      carga({ ref: 'NUEVA', eta: '2026-08-24' }),
    ], [agenda('OK', '2026-08-23'), agenda('MOVIDA', '2026-08-24')], HOY)
    expect(l.map(c => c.ref + ':' + c.estado)).toEqual(
      ['MOVIDA:reagendar', 'NUEVA:sin_agendar', 'OK:agendada'])
  })

  it('la fila de agenda de una carga fuera de ventana no rompe nada', () => {
    const l = cargasMontecon([carga({ ref: 'A1', eta: '2026-08-24' })],
      [agenda('VIEJA', '2026-06-01')], HOY)
    expect(l).toHaveLength(1)
    expect(l[0].estado).toBe('sin_agendar')
  })

  it('guarda la ETA agendada para poder mostrar "estaba para el X"', () => {
    const l = cargasMontecon([carga({ eta: '2026-08-27' })],
      [agenda('A8045', '2026-08-24')], HOY)
    expect(l[0].etaAgendada).toBe('2026-08-24')
  })

  it('el matcheo de agenda ignora mayúsculas y espacios en la ref', () => {
    const l = cargasMontecon([carga({ ref: 'A8045' })],
      [agenda(' a8045 ', '2026-08-24')], HOY)
    expect(l[0].estado).toBe('agendada')
  })
})
