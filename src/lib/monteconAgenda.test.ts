import { describe, it, expect } from 'vitest'
import {
  cargasMontecon, estadoAgenda, MONTECON_DIAS_ADELANTE, MONTECON_DIAS_ATRAS,
  RETIRADO_DIAS_RECORDATORIO,
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

describe('cargasMontecon — ciclo retirado → avisado (Brian 26/08)', () => {
  const retirada = (ref: string, retiradoAt: string, extra: Partial<AgendaRow> = {}): AgendaRow =>
    ({ ref, eta_agendada: '2026-08-20', retirado_at: retiradoAt, ...extra })

  it('retirada queda con estado retirado, al FONDO, con el día del retiro', () => {
    const l = cargasMontecon([
      carga({ ref: 'RET', eta: '2026-08-20' }),
      carga({ ref: 'NUEVA', eta: '2026-08-24' }),
    ], [retirada('RET', '2026-08-21T14:00:00.000Z')], HOY)
    expect(l.map(c => c.ref + ':' + c.estado)).toEqual(['NUEVA:sin_agendar', 'RET:retirado'])
    expect(l[1].retiradoEl).toBe('2026-08-21')
  })

  it('retirada ignora la ventana de ETA — el recordatorio no depende del buque', () => {
    // ETA de hace 3 semanas (fuera de ventana): sin retiro no aparecería.
    const l = cargasMontecon([carga({ eta: '2026-08-01' })],
      [retirada('A8045', '2026-08-21T14:00:00.000Z')], HOY)
    expect(l).toHaveLength(1)
    expect(l[0].estado).toBe('retirado')
  })

  it('sin AVISADO desaparece recién pasado el tope de días', () => {
    const dia = (n: number) => `2026-08-${String(22 - n).padStart(2, '0')}T12:00:00.000Z`
    const enTope = cargasMontecon([carga()], [retirada('A8045', dia(RETIRADO_DIAS_RECORDATORIO))], HOY)
    expect(enTope).toHaveLength(1)
    const pasada = cargasMontecon([carga()], [retirada('A8045', dia(RETIRADO_DIAS_RECORDATORIO + 1))], HOY)
    expect(pasada).toEqual([])
  })

  it('AVISADO cierra el ciclo: sale de la card', () => {
    const l = cargasMontecon([carga()],
      [retirada('A8045', '2026-08-21T14:00:00.000Z', { avisado_at: '2026-08-22T10:00:00.000Z' })], HOY)
    expect(l).toEqual([])
  })

  it('un retiro de anoche estampado "mañana" en UTC no se esconde', () => {
    // Retiro 21:30 de Montevideo = 00:30 UTC del día siguiente a HOY.
    const l = cargasMontecon([carga()], [retirada('A8045', '2026-08-23T00:30:00.000Z')], HOY)
    expect(l).toHaveLength(1)
    expect(l[0].estado).toBe('retirado')
  })

  it('retiro directo sin agenda previa (eta_agendada vacía) funciona igual', () => {
    const l = cargasMontecon([carga({ eta: '2026-08-20' })],
      [{ ref: 'A8045', eta_agendada: '', retirado_at: '2026-08-22T12:00:00.000Z' }], HOY)
    expect(l).toHaveLength(1)
    expect(l[0].estado).toBe('retirado')
    expect(l[0].etaAgendada).toBe('')
  })
})
