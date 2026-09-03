import { describe, it, expect } from 'vitest'
import {
  cargasMontecon, cargasSinTerminal, estadoAgenda, MONTECON_DIAS_ADELANTE, MONTECON_DIAS_ATRAS,
  RETIRADO_DIAS_RECORDATORIO,
  esDirecto,
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
  it('FCL vivas de MONTECON o TCP; TCP por llegar entra informativa (Brian 02/09)', () => {
    const l = cargasMontecon([
      carga(),
      carga({ ref: 'TCP1', terminal: 'TCP' }), // ETA en 2 días: se ve, sin botones
      carga({ ref: 'OTRA', terminal: 'GODILCO' }),
      carga({ ref: 'LCL1', mode: 'lcl' }),
      carga({ ref: 'ARCH', archived: true }),
    ], [], HOY)
    expect(l.map(c => c.ref + ':' + c.estado)).toEqual(['A8045:sin_agendar', 'TCP1:por_llegar'])
    expect(l[0].terminal).toBe('MONTECON')
    expect(l[1].terminal).toBe('TCP')
  })

  it('la ventana: llegadas recientes (retiro pendiente) y próximos 8 días (Brian 02/09)', () => {
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

  it('REAGENDAR queda en su lugar por ETA (se ve en rojo + chip del header), ya no salta arriba (Brian 02/09)', () => {
    const l = cargasMontecon([
      carga({ ref: 'OK', eta: '2026-08-23' }),
      carga({ ref: 'MOVIDA', eta: '2026-08-26' }),
      carga({ ref: 'NUEVA', eta: '2026-08-24' }),
    ], [agenda('OK', '2026-08-23'), agenda('MOVIDA', '2026-08-24')], HOY)
    expect(l.map(c => c.ref + ':' + c.estado)).toEqual(
      ['OK:agendada', 'NUEVA:sin_agendar', 'MOVIDA:reagendar'])
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

  it('la fecha del TURNO conseguido viaja a la fila (Brian 26/08)', () => {
    const l = cargasMontecon([carga({ eta: '2026-08-24' })],
      [{ ref: 'A8045', eta_agendada: '2026-08-24', fecha_retiro: '2026-08-25' }], HOY)
    expect(l[0].estado).toBe('agendada')
    expect(l[0].fechaRetiro).toBe('2026-08-25')
    // Y sigue disponible cuando la ETA se corre (para decir "tenías turno el X").
    const movida = cargasMontecon([carga({ eta: '2026-08-27' })],
      [{ ref: 'A8045', eta_agendada: '2026-08-24', fecha_retiro: '2026-08-25' }], HOY)
    expect(movida[0].estado).toBe('reagendar')
    expect(movida[0].fechaRetiro).toBe('2026-08-25')
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

describe('cargasMontecon — TCP sin turnos (Brian 26/08)', () => {
  const tcp = (c: Partial<CargaMonteconInput> = {}) => carga({ terminal: 'TCP', ...c })

  it('por llegar mientras viene, "retirar" desde que el buque llegó; misma ventana que Montecon', () => {
    const l = cargasMontecon([
      tcp({ ref: 'HOY-LLEGA', eta: '2026-08-22' }),
      tcp({ ref: 'LLEGO', eta: '2026-08-19' }),
      tcp({ ref: 'FUTURA', eta: '2026-08-23' }),
      tcp({ ref: 'LEJOS', eta: '2026-09-06' }), // 15 días: fuera de ventana
      tcp({ ref: 'VIEJA', eta: '2026-08-10' }),
    ], [], HOY)
    expect(l.map(c => c.ref + ':' + c.estado)).toEqual(['LLEGO:retirar', 'HOY-LLEGA:retirar', 'FUTURA:por_llegar'])
    expect(l.every(c => c.terminal === 'TCP')).toBe(true)
  })

  it('sigue el mismo ciclo retirado → avisado que Montecon', () => {
    const retirada = cargasMontecon([tcp({ eta: '2026-08-20' })],
      [{ ref: 'A8045', eta_agendada: '', retirado_at: '2026-08-21T14:00:00.000Z' }], HOY)
    expect(retirada[0].estado).toBe('retirado')
    const avisada = cargasMontecon([tcp({ eta: '2026-08-20' })],
      [{ ref: 'A8045', eta_agendada: '', retirado_at: '2026-08-21T14:00:00.000Z', avisado_at: '2026-08-22T10:00:00.000Z' }], HOY)
    expect(avisada).toEqual([])
  })

  it('orden = llegada del buque, Montecon y TCP mezcladas; retiradas al fondo (Brian 02/09)', () => {
    const l = cargasMontecon([
      carga({ ref: 'MOVIDA', eta: '2026-08-26' }),
      tcp({ ref: 'RETIRAR', eta: '2026-08-21' }),
      carga({ ref: 'NUEVA', eta: '2026-08-24' }),
      tcp({ ref: 'VIENE', eta: '2026-08-23' }),
      carga({ ref: 'OK', eta: '2026-08-23' }),
      tcp({ ref: 'RETIRADA', eta: '2026-08-20' }),
    ], [
      agenda('MOVIDA', '2026-08-24'),
      agenda('OK', '2026-08-23'),
      { ref: 'RETIRADA', eta_agendada: '', retirado_at: '2026-08-21T14:00:00.000Z' },
    ], HOY)
    expect(l.map(c => c.ref + ':' + c.estado)).toEqual([
      'RETIRAR:retirar', 'OK:agendada', 'VIENE:por_llegar', 'NUEVA:sin_agendar', 'MOVIDA:reagendar', 'RETIRADA:retirado',
    ])
  })
})

describe('cargasSinTerminal — llegan sin terminal confirmada (Brian 02/09)', () => {
  const dia = (n: number) => {
    const d = new Date(2026, 7, 22 + n)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return d.getFullYear() + '-' + mm + '-' + dd
  }
  const sinTerm = (c: Partial<CargaMonteconInput> = {}) => carga({ terminal: '', pais: 'UY', ...c })

  it('solo FCL vivas por Uruguay con la terminal vacía; ordenadas por llegada', () => {
    const l = cargasSinTerminal([
      sinTerm({ ref: 'EN4', eta: dia(4) }),
      sinTerm({ ref: 'LLEGO', eta: dia(-1) }),
      sinTerm({ ref: 'CONTERM', terminal: 'TCP' }),           // dato cargado
      sinTerm({ ref: 'OTRATERM', terminal: 'TRP' }),          // terminal ajena, no es faltante
      sinTerm({ ref: 'BSAS', pais: 'AR' }),                   // Buenos Aires directo
      sinTerm({ ref: 'CHILE', pais: 'CL' }),
      sinTerm({ ref: 'SINPAIS', pais: '' }),
      sinTerm({ ref: 'LCL1', mode: 'lcl' }),
      sinTerm({ ref: 'ARCH', archived: true }),
      sinTerm({ ref: 'SINETA', eta: '' }),
    ], HOY)
    expect(l.map(c => c.ref + ':' + c.dias)).toEqual(['LLEGO:-1', 'EN4:4'])
  })

  it('una terminal de solo espacios cuenta como vacía', () => {
    expect(cargasSinTerminal([sinTerm({ terminal: '   ' })], HOY)).toHaveLength(1)
  })

  it('usa la MISMA ventana que los retiros', () => {
    const dentro = cargasSinTerminal([
      sinTerm({ ref: 'ATRAS', eta: dia(-MONTECON_DIAS_ATRAS) }),
      sinTerm({ ref: 'ADELANTE', eta: dia(MONTECON_DIAS_ADELANTE) }),
    ], HOY)
    expect(dentro.map(c => c.ref)).toEqual(['ATRAS', 'ADELANTE'])
    const fuera = cargasSinTerminal([
      sinTerm({ ref: 'VIEJA', eta: dia(-MONTECON_DIAS_ATRAS - 1) }),
      sinTerm({ ref: 'LEJOS', eta: dia(MONTECON_DIAS_ADELANTE + 1) }),
    ], HOY)
    expect(fuera).toEqual([])
  })

  it('lleva lo que la fila necesita mostrar (dbId, cliente, contenedor, eta)', () => {
    const [c] = cargasSinTerminal([sinTerm({ dbId: 'db-1', eta: dia(2) })], HOY)
    expect(c).toEqual({ dbId: 'db-1', ref: 'A8045', cliente: 'CHIAPERO', cntr: 'FANU1858496', eta: dia(2), dias: 2 })
  })

  it('la ventana de los retiros es de 8 días hacia adelante (Brian 02/09)', () => {
    expect(MONTECON_DIAS_ADELANTE).toBe(8)
  })
})

describe('cargasMontecon — la ventana no esconde lo urgente (revisión 02/09)', () => {
  it('REAGENDAR no se esconde aunque la ETA nueva caiga más allá de la ventana', () => {
    // Agendada contra el 24/08; el buque se corre 10 días (más que la ventana de 8)
    const l = cargasMontecon([carga({ eta: '2026-09-03' })], [agenda('A8045', '2026-08-24')], HOY)
    expect(l.map(c => c.ref + ':' + c.estado)).toEqual(['A8045:reagendar'])
    expect(l[0].dias).toBe(12)
  })

  it('agendada/sin agendar/TCP por llegar SÍ respetan el tope de 8 días', () => {
    const l = cargasMontecon([
      carga({ ref: 'AGENDADA', eta: '2026-09-03' }),
      carga({ ref: 'NUEVA', eta: '2026-09-03' }),
      carga({ ref: 'TCPLEJOS', terminal: 'TCP', eta: '2026-09-03' }),
    ], [agenda('AGENDADA', '2026-09-03')], HOY)
    expect(l).toEqual([])
  })

  it('una carga con SALIDA ya pasada salió de la terminal: no es retiro pendiente', () => {
    const l = cargasMontecon([
      carga({ ref: 'SALIO', eta: '2026-08-20', salida: '2026-08-21' }),
      carga({ ref: 'SALEMANANA', eta: '2026-08-20', salida: '2026-08-23' }),
      carga({ ref: 'SINSALIDA', eta: '2026-08-20' }),
    ], [], HOY)
    expect(l.map(c => c.ref).sort()).toEqual(['SALEMANANA', 'SINSALIDA'])
  })
})

describe('cargasSinTerminal ↔ cargasMontecon — ida y vuelta (la promesa del toast)', () => {
  const dia = (n: number) => {
    const d = new Date(2026, 7, 22 + n)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return d.getFullYear() + '-' + mm + '-' + dd
  }
  const base = [-MONTECON_DIAS_ATRAS, 0, MONTECON_DIAS_ADELANTE].map((n, i) =>
    carga({ ref: 'R' + i, terminal: '', pais: 'UY', eta: dia(n) }))

  it('sin terminal: están en sinTerminal y en ningún retiro', () => {
    expect(cargasSinTerminal(base, HOY).map(c => c.ref)).toEqual(['R0', 'R1', 'R2'])
    expect(cargasMontecon(base, [], HOY)).toEqual([])
  })

  it('al completar TCP salen de sinTerminal y entran a retiros con el estado que corresponde', () => {
    const conTcp = base.map(c => ({ ...c, terminal: 'TCP' }))
    expect(cargasSinTerminal(conTcp, HOY)).toEqual([])
    expect(cargasMontecon(conTcp, [], HOY).map(c => c.ref + ':' + c.estado)).toEqual(['R0:retirar', 'R1:retirar', 'R2:por_llegar'])
  })

  it('al completar MONTECON entran como sin agendar', () => {
    const conMon = base.map(c => ({ ...c, terminal: 'MONTECON' }))
    expect(cargasSinTerminal(conMon, HOY)).toEqual([])
    expect(cargasMontecon(conMon, [], HOY).every(c => c.estado === 'sin_agendar')).toBe(true)
    expect(cargasMontecon(conMon, [], HOY)).toHaveLength(3)
  })

  it('una carga sin terminal que ya salió tampoco se reclama', () => {
    expect(cargasSinTerminal([carga({ terminal: '', pais: 'UY', eta: dia(-2), salida: dia(-1) })], HOY)).toEqual([])
  })
})

describe('a qué depósito va el contenedor — Brian 03/09', () => {
  const base = {
    ref: 'A9001', cliente: 'DEMO', terminal: 'TCP', contenedor: 'X1',
    eta: '2026-09-05', mode: 'fcl', archived: false,
  }
  const hoy = '2026-09-03'
  it('un TRASIEGO muestra el depósito que lo recibe, en mayúsculas', () => {
    const [c] = cargasMontecon([{ ...base, operativa: 'TRASIEGO', deposito: 'godilco' }], [], hoy)
    expect(c.deposito).toBe('GODILCO')
    expect(c.directo).toBe(false)
  })
  it('un CONTENEDOR directo no tiene depósito: va al fiscal', () => {
    const [c] = cargasMontecon([{ ...base, operativa: 'CONTENEDOR', deposito: 'GODILCO', fiscal: 'rafaela' }], [], hoy)
    expect(c.directo).toBe(true)
    expect(c.deposito).toBe('')
    expect(c.fiscal).toBe('RAFAELA')
  })
  it('sin depósito cargado queda vacío, para que la fila lo reclame', () => {
    const [c] = cargasMontecon([{ ...base, operativa: 'TRASIEGO' }], [], hoy)
    expect(c.deposito).toBe('')
    expect(c.directo).toBe(false)
  })
  it('esDirecto reconoce la operativa aunque venga con texto alrededor', () => {
    expect(esDirecto('CONTENEDOR')).toBe(true)
    expect(esDirecto(' contenedor directo ')).toBe(true)
    expect(esDirecto('TRASIEGO')).toBe(false)
    expect(esDirecto(null)).toBe(false)
  })
})
