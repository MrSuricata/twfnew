import { describe, it, expect } from 'vitest'
import type { ParsedShipment, OperativasRecord, ShipmentAlert } from './shipmentTypes'
import {
  refsCliente, estadoCliente, proximoHito, progresoCliente, esActivaParaCliente,
  llegadasADeposito, esperandoSalida, llegadasAMontevideo, embarcadas, hoyCliente, alertasCliente,
  pasoSiguiente, textoDias, DEPOSITO_DIAS_ADELANTE, MVD_DIAS_ADELANTE, CLIENTE_ENTREGADA_DIAS, DIAS_LLEGADA_SUPUESTA,
} from './hoyCliente'

const HOY = '2026-09-02'

const dia = (n: number) => {
  const d = new Date(Date.UTC(2026, 8, 2 + n))
  return d.toISOString().slice(0, 10)
}

const op = (o: Partial<OperativasRecord> = {}): OperativasRecord => ({
  REF: 'A8045', TLX: '', DEPOSITO: 'GODILCO', ETA_OP: '', SALIDA: '', ETA_FISC: '', LIBRE: '',
  OPERATIVA: 'TRASIEGO', CNTR_OP: 'FANU1858496', PKGS: 10, KG: 1000, M3: 20,
  DESCRIPCION: 'MOTOPARTES', FISCAL: 'CACEC', DESCARGA: '', DEV: '', TIPO: '40HC', WOOD: '',
  TRANSPORTE: '', LUGAR_SALIDA: '',
  ...o,
} as unknown as OperativasRecord)

const carga = (c: Partial<ParsedShipment> & { CLIENT_REF?: string } = {}, operativas: OperativasRecord[] = [op()]): ParsedShipment => ({
  REF: 'A8045', CLIENT_REF: '1417', ETD: dia(-30), ETA: dia(4), CNTR: 'FANU1858496', N: 1,
  BUQUE: 'SANTA CATARINA EXPRESS', LIBRE_HASTA: '', TERMINAL: 'TCP', containers: [], calculatedN: 1,
  calculatedLibreHasta: '', operativas, ...c,
} as unknown as ParsedShipment)

describe('refsCliente — una sola regla para nombrar la carga', () => {
  it('con ref propia: la propia grande y "TWF 8045" chica', () => {
    expect(refsCliente({ REF: 'A8045', CLIENT_REF: '1417' })).toEqual({ principal: '1417', secundaria: 'TWF 8045', propia: true })
  })
  it('sin ref propia: "TWF 8216" grande y nada chico (no una ref sin dueño)', () => {
    expect(refsCliente({ REF: 'A8216', CLIENT_REF: '' })).toEqual({ principal: 'TWF 8216', secundaria: '', propia: false })
    expect(refsCliente({ REF: 'A8216' })).toEqual({ principal: 'TWF 8216', secundaria: '', propia: false })
  })
})

describe('estadoCliente — 6 pasos en lenguaje del cliente', () => {
  it('sin ETD o ETD futuro y ETA futura → por embarcar', () => {
    expect(estadoCliente(carga({ ETD: '', ETA: dia(30) }), HOY)).toBe('por_embarcar')
    expect(estadoCliente(carga({ ETD: dia(3), ETA: dia(30) }), HOY)).toBe('por_embarcar')
  })
  it('ETD pasado y ETA futura → embarcada; el DÍA de la ETA sigue "embarcada" (llega hoy)', () => {
    expect(estadoCliente(carga({ ETD: dia(-10), ETA: dia(4) }), HOY)).toBe('embarcada')
    expect(estadoCliente(carga({ ETD: dia(-10), ETA: dia(0) }), HOY)).toBe('embarcada')
  })
  it('llegó y nada viaja → en Montevideo (sin salida, con salida programada, con salida HOY, sin operativas)', () => {
    expect(estadoCliente(carga({ ETA: dia(-2) }, [op({ SALIDA: '' })]), HOY)).toBe('en_montevideo')
    expect(estadoCliente(carga({ ETA: dia(-2) }, [op({ SALIDA: dia(3) })]), HOY)).toBe('en_montevideo')
    expect(estadoCliente(carga({ ETA: dia(-2) }, [op({ SALIDA: dia(0), ETA_FISC: dia(2) })]), HOY)).toBe('en_montevideo')
    expect(estadoCliente(carga({ ETA: dia(-2) }, []), HOY)).toBe('en_montevideo')
  })
  it('algo salió antes de hoy y no llegó → en camino (también parcial)', () => {
    expect(estadoCliente(carga({ ETA: dia(-5) }, [op({ SALIDA: dia(-1), ETA_FISC: dia(1) })]), HOY)).toBe('en_camino')
    expect(estadoCliente(carga({ ETA: dia(-5) }, [op({ SALIDA: dia(-1) }), op({ CNTR_OP: 'B', SALIDA: '' })]), HOY)).toBe('en_camino')
  })
  it('parcial: uno ya en el depósito y el otro sin salir → en Montevideo (hay que coordinar), no "en camino"', () => {
    const s = carga({ ETA: dia(-9) }, [op({ SALIDA: dia(-5), ETA_FISC: dia(-3) }), op({ CNTR_OP: 'B', SALIDA: '' })])
    expect(estadoCliente(s, HOY)).toBe('en_montevideo')
    expect(proximoHito(s, HOY)).toEqual({ label: 'Salida', fecha: 'A coordinar', iso: '' })
  })
  it('todo llegó al depósito → en tu depósito; DEVUELTO (en OPERATIVA o en LIBRE) → entregada', () => {
    expect(estadoCliente(carga({ ETA: dia(-9) }, [op({ SALIDA: dia(-4), ETA_FISC: dia(-2) })]), HOY)).toBe('en_deposito')
    expect(estadoCliente(carga({ ETA: dia(-9) }, [op({ SALIDA: dia(-4), ETA_FISC: dia(-2), OPERATIVA: 'DEVUELTO' })]), HOY)).toBe('entregada')
    expect(estadoCliente(carga({ ETA: dia(-9) }, [op({ SALIDA: dia(-4), ETA_FISC: dia(-2), LIBRE: 'DEVUELTO' })]), HOY)).toBe('entregada')
    expect(estadoCliente(carga({ ETA: dia(-9), LIBRE_HASTA: 'DEVUELTO' }, [op({ SALIDA: dia(-4), ETA_FISC: dia(-2) })]), HOY)).toBe('entregada')
  })
  it('DESCARGA (fecha en que se confirmó el arribo del buque) y DEV (un lugar) NO son entrega', () => {
    // "¿Llegó?" en Seguimientos estampa DESCARGA = ETA. Sin salida sigue en Montevideo.
    expect(estadoCliente(carga({ ETA: dia(-11) }, [op({ DESCARGA: dia(-11) })]), HOY)).toBe('en_montevideo')
    expect(estadoCliente(carga({ ETA: dia(-9) }, [op({ SALIDA: dia(-4), ETA_FISC: dia(0), DESCARGA: dia(-9), DEV: 'STL' })]), HOY)).toBe('en_deposito')
  })
  it('salida vieja sin fecha de llegada: se da por llegada a los 14 días, nunca "en camino" para siempre', () => {
    const reciente = carga({ ETA: dia(-20) }, [op({ SALIDA: dia(-DIAS_LLEGADA_SUPUESTA + 1) })])
    expect(estadoCliente(reciente, HOY)).toBe('en_camino')
    const vieja = carga({ ETA: dia(-40) }, [op({ SALIDA: dia(-DIAS_LLEGADA_SUPUESTA) })])
    expect(estadoCliente(vieja, HOY)).toBe('en_deposito')
    expect(proximoHito(vieja, HOY)).toEqual({ label: 'En tu depósito (estimado)', fecha: '02/09/2026', iso: HOY })
    expect(llegadasADeposito([vieja], HOY)).toEqual([])
    // devuelta después de una salida vieja → entregada aunque falte ETA_FISC
    expect(estadoCliente(carga({ ETA: dia(-60), LIBRE_HASTA: 'DEVUELTO' }, [op({ SALIDA: dia(-30) })]), HOY)).toBe('entregada')
  })
  it('DEVUELTO sin salida (carga a piso: el contenedor vuelve vacío, la mercadería sigue en depósito) NO es entregada', () => {
    const s = carga({ ETA: dia(-6) }, [op({ OPERATIVA: 'CARGA A PISO', LIBRE: 'DEVUELTO' })])
    expect(estadoCliente(s, HOY)).toBe('en_montevideo')
    expect(esperandoSalida([s], HOY)).toHaveLength(1)
  })
  it('progresoCliente crece con el estado', () => {
    expect(progresoCliente('por_embarcar')).toBe(0)
    expect(progresoCliente('en_montevideo')).toBe(40)
    expect(progresoCliente('entregada')).toBe(100)
  })
})

describe('esActivaParaCliente — qué va a Mis cargas y qué a Historial', () => {
  it('un TRASIEGO que salió ayer y llega mañana sigue ACTIVO (el admin lo daba por completado)', () => {
    const s = carga({ ETA: dia(-5) }, [op({ OPERATIVA: 'TRASIEGO', SALIDA: dia(-1), ETA_FISC: dia(1) })])
    expect(esActivaParaCliente(s, HOY)).toBe(true)
    expect(llegadasADeposito([s], HOY).map(f => f.estado)).toEqual(['en_frontera'])
  })
  it('en tu depósito hace poco → activa; hace más de 10 días → Historial', () => {
    expect(esActivaParaCliente(carga({ ETA: dia(-20) }, [op({ SALIDA: dia(-9), ETA_FISC: dia(-CLIENTE_ENTREGADA_DIAS) })]), HOY)).toBe(true)
    expect(esActivaParaCliente(carga({ ETA: dia(-20) }, [op({ SALIDA: dia(-15), ETA_FISC: dia(-CLIENTE_ENTREGADA_DIAS - 1) })]), HOY)).toBe(false)
  })
  it('entregada → Historial', () => {
    expect(esActivaParaCliente(carga({ ETA: dia(-9) }, [op({ SALIDA: dia(-4), ETA_FISC: dia(-2), LIBRE: 'DEVUELTO' })]), HOY)).toBe(false)
  })
  it('salida vieja sin ETA_FISC: activa hasta 14 + 10 días después de la salida, después Historial', () => {
    expect(esActivaParaCliente(carga({ ETA: dia(-40) }, [op({ SALIDA: dia(-(DIAS_LLEGADA_SUPUESTA + CLIENTE_ENTREGADA_DIAS)) })]), HOY)).toBe(true)
    expect(esActivaParaCliente(carga({ ETA: dia(-40) }, [op({ SALIDA: dia(-(DIAS_LLEGADA_SUPUESTA + CLIENTE_ENTREGADA_DIAS + 1)) })]), HOY)).toBe(false)
  })
  it('sin operativas: activa hasta 60 días después de la ETA', () => {
    expect(esActivaParaCliente(carga({ ETA: dia(-50) }, []), HOY)).toBe(true)
    expect(esActivaParaCliente(carga({ ETA: dia(-61) }, []), HOY)).toBe(false)
    expect(esActivaParaCliente(carga({ ETA: dia(20) }, []), HOY)).toBe(true)
  })
})

describe('proximoHito — siempre el mismo dato por estado', () => {
  it('por embarcar → Zarpa (o a confirmar)', () => {
    expect(proximoHito(carga({ ETD: dia(3), ETA: dia(30) }), HOY)).toEqual({ label: 'Zarpa', fecha: '05/09/2026', iso: dia(3) })
    expect(proximoHito(carga({ ETD: '', ETA: dia(30) }), HOY).fecha).toBe('A confirmar')
  })
  it('embarcada → Llega a Montevideo (también el día de la ETA)', () => {
    expect(proximoHito(carga({ ETD: dia(-10), ETA: dia(4) }), HOY)).toEqual({ label: 'Llega a Montevideo', fecha: '06/09/2026', iso: dia(4) })
    expect(proximoHito(carga({ ETD: dia(-10), ETA: dia(0) }), HOY).iso).toBe(HOY)
  })
  it('en Montevideo → Sale de Montevideo si hay salida de hoy o futura, si no "A coordinar"', () => {
    expect(proximoHito(carga({ ETA: dia(-2) }, [op({ SALIDA: dia(3) })]), HOY)).toEqual({ label: 'Sale de Montevideo', fecha: '05/09/2026', iso: dia(3) })
    expect(proximoHito(carga({ ETA: dia(-2) }, [op({ SALIDA: dia(0) })]), HOY)).toEqual({ label: 'Sale de Montevideo', fecha: '02/09/2026', iso: HOY })
    expect(proximoHito(carga({ ETA: dia(-2) }, [op()]), HOY)).toEqual({ label: 'Salida', fecha: 'A coordinar', iso: '' })
  })
  it('en camino → Llega a tu depósito (la más próxima de las que viajan)', () => {
    const h = proximoHito(carga({ ETA: dia(-5) }, [
      op({ SALIDA: dia(-1), ETA_FISC: dia(2) }),
      op({ CNTR_OP: 'B', SALIDA: dia(-1), ETA_FISC: dia(1) }),
    ]), HOY)
    expect(h).toEqual({ label: 'Llega a tu depósito', fecha: '03/09/2026', iso: dia(1) })
  })
  it('en depósito → desde cuándo; entregada → sin fecha', () => {
    expect(proximoHito(carga({ ETA: dia(-9) }, [op({ SALIDA: dia(-4), ETA_FISC: dia(-2) })]), HOY).label).toBe('En tu depósito desde')
    expect(proximoHito(carga({ ETA: dia(-9) }, [op({ SALIDA: dia(-4), ETA_FISC: dia(-2), LIBRE: 'DEVUELTO' })]), HOY)).toEqual({ label: 'Entregada', fecha: '', iso: '' })
  })
})

describe('llegadasADeposito — card 1', () => {
  it('en frontera primero, después sale hoy, después por fecha de llegada', () => {
    const l = llegadasADeposito([
      carga({ REF: 'A1', CLIENT_REF: '', ETA: dia(-6) }, [op({ SALIDA: dia(3), ETA_FISC: dia(5) })]),
      carga({ REF: 'A2', ETA: dia(-6) }, [op({ SALIDA: dia(-2), ETA_FISC: dia(1) })]),
      carga({ REF: 'A3', ETA: dia(-6) }, [op({ SALIDA: dia(0), ETA_FISC: dia(2) })]),
    ], HOY)
    expect(l.map(f => f.ref + ':' + f.estado)).toEqual(['A2:en_frontera', 'A3:sale_hoy', 'A1:sale'])
    expect(l[0]).toMatchObject({ fecha: dia(1), dias: 1, cntr: 'FANU1858496', descripcion: 'MOTOPARTES', fiscal: 'CACEC' })
    expect(l[2].refs.principal).toBe('TWF 1')
  })
  it('sin SALIDA no entra (es "esperando salida"); ya llegado, lejano, en el mar y devuelto tampoco', () => {
    const l = llegadasADeposito([
      carga({ REF: 'SINSALIDA', ETA: dia(-1) }, [op({ ETA_FISC: dia(3) })]),
      carga({ REF: 'LLEGO', ETA: dia(-9) }, [op({ SALIDA: dia(-4), ETA_FISC: dia(-1) })]),
      carga({ REF: 'ENMAR', ETA: dia(2) }, [op({ SALIDA: dia(4), ETA_FISC: dia(6) })]),
      carga({ REF: 'LEJOS', ETA: dia(-1) }, [op({ SALIDA: dia(DEPOSITO_DIAS_ADELANTE + 1) })]),
      carga({ REF: 'DEVUELTA', ETA: dia(-9) }, [op({ SALIDA: dia(-1), LIBRE: 'DEVUELTO' })]),
    ], HOY)
    expect(l).toEqual([])
  })
  it('salió sin fecha de llegada: en frontera con llegada a confirmar', () => {
    const [f] = llegadasADeposito([carga({ ETA: dia(-3) }, [op({ SALIDA: dia(-1) })])], HOY)
    expect(f).toMatchObject({ estado: 'en_frontera', fecha: '', dias: null, salida: dia(-1) })
  })
})

describe('esperandoSalida — card 2', () => {
  it('arribadas ANTES de hoy sin salida, la que más espera primero, con dónde está', () => {
    const l = esperandoSalida([
      carga({ REF: 'A1', ETA: dia(-2), TERMINAL: 'TCP' }, [op({ LUGAR_SALIDA: '' })]),
      carga({ REF: 'A2', ETA: dia(-7) }, [op({ LUGAR_SALIDA: 'PLANIR' })]),
      carga({ REF: 'PROG', ETA: dia(-3) }, [op({ SALIDA: dia(2) })]),        // tiene salida programada → card 1
      carga({ REF: 'SALIO', ETA: dia(-3) }, [op({ SALIDA: dia(-1) })]),
      carga({ REF: 'HOYLLEGA', ETA: dia(0) }, [op()]),                       // el día de la ETA está en "Llegan a Montevideo"
      carga({ REF: 'ENMAR', ETA: dia(2) }, [op()]),
      carga({ REF: 'SINETA', ETA: '' }, [op()]),                              // sin ETA no se afirma que llegó
      carga({ REF: 'PISO', ETA: dia(-20) }, [op({ OPERATIVA: 'CARGA A PISO', LIBRE: 'DEVUELTO' })]), // contenedor devuelto, mercadería en depósito
      carga({ REF: 'DESCARGADA', ETA: dia(-4) }, [op({ DESCARGA: dia(-4) })]), // "¿Llegó?" no es entrega: sigue esperando
    ], HOY)
    expect(l.map(f => f.ref + ':' + f.lugar + ':' + f.dias)).toEqual(['PISO:terminal TCP:20', 'A2:PLANIR:7', 'DESCARGADA:terminal TCP:4', 'A1:terminal TCP:2'])
  })
})

describe('llegadasAMontevideo — card 3', () => {
  it('ETA de hoy a 14 días, con el paso siguiente en palabras del cliente', () => {
    const l = llegadasAMontevideo([
      carga({ REF: 'HOY', ETA: dia(0) }, [op({ OPERATIVA: 'TRASIEGO', DEPOSITO: 'PLANIR' })]),
      carga({ REF: 'DIRECTO', ETA: dia(4) }, [op({ OPERATIVA: 'CONTENEDOR' })]),
      carga({ REF: 'PISO', ETA: dia(MVD_DIAS_ADELANTE) }, [op({ OPERATIVA: 'CARGA A PISO', DEPOSITO: 'GODILCO' })]),
      carga({ REF: 'AYER', ETA: dia(-1) }),
      carga({ REF: 'LEJOS', ETA: dia(MVD_DIAS_ADELANTE + 1) }),
      carga({ REF: 'SINETA', ETA: '' }),
    ], HOY)
    expect(l.map(f => f.ref + ':' + f.dias + ':' + f.pasoSiguiente)).toEqual([
      'HOY:0:Trasiego en PLANIR', 'DIRECTO:4:Directo a tu depósito', `PISO:${MVD_DIAS_ADELANTE}:Desconsolida en GODILCO`,
    ])
    expect(l[0]).toMatchObject({ buque: 'SANTA CATARINA EXPRESS', cntrs: 1 })
  })
  it('sin operativa el paso siguiente queda vacío', () => {
    expect(pasoSiguiente(carga({}, []))).toBe('')
  })
})

describe('embarcadas — card 4', () => {
  it('ETD de −7 a +7 días, sin las que ya están en "Llegan a Montevideo" (ETA a 14 días o menos)', () => {
    const l = embarcadas([
      carga({ REF: 'ZARPO', ETD: dia(-3), ETA: dia(30) }),
      carga({ REF: 'ZARPA', ETD: dia(5), ETA: dia(40) }),
      carga({ REF: 'VIEJA', ETD: dia(-8), ETA: dia(25) }),
      carga({ REF: 'CORTA', ETD: dia(-3), ETA: dia(5) }),       // ya en "Llegan a Montevideo"
      carga({ REF: 'LLEGAHOY', ETD: dia(-2), ETA: dia(0) }),
      carga({ REF: 'LLEGO', ETD: dia(-2), ETA: dia(-1) }),
      carga({ REF: 'SINETD', ETD: '', ETA: dia(30) }),
    ], HOY)
    expect(l.map(f => f.ref + ':' + f.dias + ':' + f.zarpo)).toEqual(['ZARPO:-3:true', 'ZARPA:5:false'])
    expect(l[0].eta).toBe(dia(30))
  })
})

describe('las cards son excluyentes: una carga (de un contenedor) está en UNA sola', () => {
  const casos: [string, ParsedShipment][] = [
    ['ETA hoy sin salida', carga({ ETD: dia(-20), ETA: dia(0) }, [op()])],
    ['ETA hoy con salida programada', carga({ ETD: dia(-20), ETA: dia(0) }, [op({ SALIDA: dia(2), ETA_FISC: dia(4) })])],
    ['ETD hace 2 y ETA hoy', carga({ ETD: dia(-2), ETA: dia(0) }, [op()])],
    ['llegó ayer sin salida', carga({ ETA: dia(-1) }, [op()])],
    ['llegó ayer, salida programada', carga({ ETA: dia(-1) }, [op({ SALIDA: dia(3) })])],
    ['llegó ayer, ETA_FISC cargada sin salida', carga({ ETA: dia(-1) }, [op({ ETA_FISC: dia(3) })])],
    ['sale hoy', carga({ ETA: dia(-3) }, [op({ SALIDA: dia(0), ETA_FISC: dia(2) })])],
    ['en frontera', carga({ ETA: dia(-3) }, [op({ SALIDA: dia(-1), ETA_FISC: dia(1) })])],
    ['zarpó hace 3', carga({ ETD: dia(-3), ETA: dia(20) }, [op()])],
    ['zarpó hace 3 y llega en 5 (ruta corta)', carga({ ETD: dia(-3), ETA: dia(5) }, [op()])],
    ['zarpa en 2 y llega en 10', carga({ ETD: dia(2), ETA: dia(10) }, [op()])],
    ['salida vieja sin llegada cargada', carga({ ETA: dia(-40) }, [op({ SALIDA: dia(-20) })])],
  ]
  for (const [nombre, s] of casos) {
    it(nombre, () => {
      const h = hoyCliente([s], HOY)
      const n = [h.deposito, h.esperando, h.montevideo, h.embarques].filter(l => l.length > 0).length
      expect(n).toBeLessThanOrEqual(1)
    })
  }
})

describe('alertasCliente — card Atención en idioma del cliente', () => {
  const alerta = (a: Partial<ShipmentAlert>): ShipmentAlert => ({
    id: 'x', shipmentRef: 'A8045', type: 'libre_vencido', severity: 'critical',
    title: 'Días libres vencidos', message: 'A8045: vencido hace 3 días (2026-08-30)', date: HOY, ...a,
  })
  it('traduce las de días libres y muestra la ref del cliente', () => {
    const [a] = alertasCliente([alerta({})], [carga()])
    expect(a.refs.principal).toBe('1417')
    expect(a.titulo).toBe('Conviene coordinar la salida')
    expect(a.detalle).toContain('costos de demora')
    expect(a.critica).toBe(true)
  })
  it('las info/success no entran; las de estado conservan su mensaje', () => {
    const l = alertasCliente([
      alerta({ id: 'i', type: 'status_salio', severity: 'info' }),
      alerta({ id: 'w', type: 'status_fiscal', severity: 'warning', title: 'Llegó a depósito', message: 'El contenedor llegó a CACEC' }),
    ], [carga()])
    expect(l.map(a => a.id)).toEqual(['w'])
    expect(l[0].titulo).toBe('Llegó a depósito')
  })
  it('sin la carga a mano, la ref cae a TWF', () => {
    const [a] = alertasCliente([alerta({ shipmentRef: 'A9999' })], [])
    expect(a.refs.principal).toBe('TWF 9999')
  })
})

describe('textoDias', () => {
  it('habla como la card', () => {
    expect([null, 0, 1, 4, -1, -3].map(textoDias)).toEqual(['', 'hoy', 'mañana', 'en 4d', 'ayer', 'hace 3d'])
  })
})
