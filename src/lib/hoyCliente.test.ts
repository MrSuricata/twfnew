import { describe, it, expect } from 'vitest'
import type { ParsedShipment, OperativasRecord, ShipmentAlert } from './shipmentTypes'
import {
  estadoCliente, etiquetaEstado, proximoHito, esActivaParaCliente,
  llegadasADestino, esperandoSalida, llegadasAMontevideo, embarcadas, hoyCliente, alertasCliente,
  pasoSiguiente, textoDias, rutaDe, tipoDe, filtrarCargas, opcionesFiltro, FILTRO_TODO,
  DESTINO_DIAS_ADELANTE, MVD_DIAS_ADELANTE, CLIENTE_ENTREGADA_DIAS, DIAS_LLEGADA_SUPUESTA,
  novedadesCliente,
} from './hoyCliente'

const HOY = '2026-09-02'

const dia = (n: number) => {
  const d = new Date(Date.UTC(2026, 8, 2 + n))
  return d.toISOString().slice(0, 10)
}

const op = (o: Partial<OperativasRecord> & { CAMION?: string } = {}): OperativasRecord => ({
  REF: 'A8045', TLX: '', DEPOSITO: 'GODILCO', ETA_OP: '', SALIDA: '', ETA_FISC: '', LIBRE: '',
  OPERATIVA: 'TRASIEGO', CNTR_OP: 'FANU1858496', PKGS: 10, KG: 1000, M3: 20,
  DESCRIPCION: 'MOTOPARTES', FISCAL: 'CACEC', DESCARGA: '', DEV: '', TIPO: '40HC', WOOD: '',
  TRANSPORTE: '', LUGAR_SALIDA: '',
  ...o,
} as unknown as OperativasRecord)

type Extra = { CLIENT_REF?: string; MODE?: string }
const carga = (c: Partial<ParsedShipment> & Extra = {}, operativas: OperativasRecord[] = [op()]): ParsedShipment => ({
  REF: 'A8045', CLIENT_REF: '1417', MODE: 'fcl', PAIS: 'UY', POD: 'MONTEVIDEO', ETD: dia(-30), ETA: dia(4),
  CNTR: 'FANU1858496', N: 1, BUQUE: 'SANTA CATARINA EXPRESS', LIBRE_HASTA: '', TERMINAL: 'TCP',
  containers: [], calculatedN: 1, calculatedLibreHasta: '', operativas, ...c,
} as unknown as ParsedShipment)

/** Chile directo: sin tramo terrestre cargado, el puerto es el destino. */
const chile = (c: Partial<ParsedShipment> & Extra = {}, operativas: OperativasRecord[] = []) =>
  carga({ REF: 'A8009', PAIS: 'CL', POD: 'SAN ANTONIO', TERMINAL: 'SAN ANTONIO', ...c }, operativas)

/** LCL por Montevideo; con camión trae la operativa CONSOLIDADO que arma la API. */
const lcl = (c: Partial<ParsedShipment> & Extra = {}, operativas: OperativasRecord[] = []) =>
  carga({ REF: 'E234', CLIENT_REF: '', MODE: 'lcl', CNTR: '', N: 0, ...c }, operativas)
const opCamion = (o: Partial<OperativasRecord> & { CAMION?: string } = {}) =>
  op({ OPERATIVA: 'CONSOLIDADO', CNTR_OP: '', CAMION: 'C463', DEPOSITO: 'PLANIR', LUGAR_SALIDA: 'PLANIR', FISCAL: 'ZF RAFAELA', ...o })

describe('ruta, tipo y filtros (Brian 02/09: por país y por tipo)', () => {
  it('rutaDe y tipoDe leen PAIS y MODE con defaults sanos', () => {
    expect(rutaDe({ PAIS: 'UY' })).toBe('UY')
    expect(rutaDe({ PAIS: 'CL' })).toBe('CL')
    expect(rutaDe({ PAIS: 'AR' })).toBe('AR')
    expect(rutaDe({ PAIS: 'PY' })).toBe('OTRO')
    // Sin país (o el genérico OTRO): decide el puerto; sin puerto, vía Montevideo (la operación de la casa)
    expect(rutaDe({})).toBe('UY')
    expect(rutaDe({ PAIS: '', POD: 'MONTEVIDEO' })).toBe('UY')
    expect(rutaDe({ PAIS: 'OTRO', POD: 'MONTEVIDEO' })).toBe('UY')
    expect(rutaDe({ PAIS: 'OTRO', POD: 'ASUNCION' })).toBe('OTRO')
    expect(rutaDe({ PAIS: '', POD: 'SAN ANTONIO' })).toBe('OTRO')
    expect(tipoDe({ MODE: 'lcl' })).toBe('lcl')
    expect(tipoDe({ MODE: 'FCL' })).toBe('fcl')
    expect(tipoDe({})).toBe('fcl')
    expect(tipoDe({ MODE: 'air' })).toBe('air')
  })
  it('filtrarCargas combina ruta y tipo; FILTRO_TODO no filtra', () => {
    const lista = [carga({ REF: 'UYF' }), lcl({ REF: 'UYL' }), chile({ REF: 'CLF' })]
    expect(filtrarCargas(lista, FILTRO_TODO).map(s => s.REF)).toEqual(['UYF', 'UYL', 'CLF'])
    expect(filtrarCargas(lista, { ruta: 'UY', tipo: 'todos' }).map(s => s.REF)).toEqual(['UYF', 'UYL'])
    expect(filtrarCargas(lista, { ruta: 'UY', tipo: 'lcl' }).map(s => s.REF)).toEqual(['UYL'])
    expect(filtrarCargas(lista, { ruta: 'CL', tipo: 'fcl' }).map(s => s.REF)).toEqual(['CLF'])
    expect(filtrarCargas(lista, { ruta: 'CL', tipo: 'lcl' })).toEqual([])
  })
  it('opcionesFiltro ofrece solo lo que el cliente tiene, en orden fijo', () => {
    expect(opcionesFiltro([chile(), carga(), lcl()])).toEqual({ rutas: ['UY', 'CL'], tipos: ['fcl', 'lcl'] })
    expect(opcionesFiltro([carga()])).toEqual({ rutas: ['UY'], tipos: ['fcl'] })
  })
})

describe('estadoCliente — 6 pasos en lenguaje del cliente (ruta Montevideo)', () => {
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
    expect(etiquetaEstado(carga(), 'en_montevideo')).toBe('En Montevideo')
  })
  it('algo salió antes de hoy y no llegó → en camino (también parcial)', () => {
    expect(estadoCliente(carga({ ETA: dia(-5) }, [op({ SALIDA: dia(-1), ETA_FISC: dia(1) })]), HOY)).toBe('en_camino')
    expect(estadoCliente(carga({ ETA: dia(-5) }, [op({ SALIDA: dia(-1) }), op({ CNTR_OP: 'B', SALIDA: '' })]), HOY)).toBe('en_camino')
  })
  it('parcial: uno ya en destino y el otro sin salir → en Montevideo (hay que coordinar), no "en camino"', () => {
    const s = carga({ ETA: dia(-9) }, [op({ SALIDA: dia(-5), ETA_FISC: dia(-3) }), op({ CNTR_OP: 'B', SALIDA: '' })])
    expect(estadoCliente(s, HOY)).toBe('en_montevideo')
    expect(proximoHito(s, HOY)).toEqual({ label: 'Salida', fecha: 'A coordinar', iso: '' })
  })
  it('todo llegó a destino → en destino; DEVUELTO (en OPERATIVA o en LIBRE) → entregada', () => {
    expect(estadoCliente(carga({ ETA: dia(-9) }, [op({ SALIDA: dia(-4), ETA_FISC: dia(-2) })]), HOY)).toBe('en_deposito')
    expect(etiquetaEstado(carga(), 'en_deposito')).toBe('En destino')
    expect(estadoCliente(carga({ ETA: dia(-9) }, [op({ SALIDA: dia(-4), ETA_FISC: dia(-2), OPERATIVA: 'DEVUELTO' })]), HOY)).toBe('entregada')
    expect(estadoCliente(carga({ ETA: dia(-9) }, [op({ SALIDA: dia(-4), ETA_FISC: dia(-2), LIBRE: 'DEVUELTO' })]), HOY)).toBe('entregada')
    expect(estadoCliente(carga({ ETA: dia(-9), LIBRE_HASTA: 'DEVUELTO' }, [op({ SALIDA: dia(-4), ETA_FISC: dia(-2) })]), HOY)).toBe('entregada')
  })
  it('DESCARGA (fecha en que se confirmó el arribo del buque) y DEV (un lugar) NO son entrega', () => {
    expect(estadoCliente(carga({ ETA: dia(-11) }, [op({ DESCARGA: dia(-11) })]), HOY)).toBe('en_montevideo')
    expect(estadoCliente(carga({ ETA: dia(-9) }, [op({ SALIDA: dia(-4), ETA_FISC: dia(0), DESCARGA: dia(-9), DEV: 'STL' })]), HOY)).toBe('en_deposito')
  })
  it('salida vieja sin fecha de llegada: se da por llegada a los 14 días, nunca "en camino" para siempre', () => {
    const reciente = carga({ ETA: dia(-20) }, [op({ SALIDA: dia(-DIAS_LLEGADA_SUPUESTA + 1) })])
    expect(estadoCliente(reciente, HOY)).toBe('en_camino')
    const vieja = carga({ ETA: dia(-40) }, [op({ SALIDA: dia(-DIAS_LLEGADA_SUPUESTA) })])
    expect(estadoCliente(vieja, HOY)).toBe('en_deposito')
    expect(proximoHito(vieja, HOY)).toEqual({ label: 'En destino (estimado)', fecha: '02/09/2026', iso: HOY })
    expect(llegadasADestino([vieja], HOY)).toEqual([])
    expect(estadoCliente(carga({ ETA: dia(-60), LIBRE_HASTA: 'DEVUELTO' }, [op({ SALIDA: dia(-30) })]), HOY)).toBe('entregada')
  })
  it('DEVUELTO sin salida (carga a piso) NO es entregada: sigue esperando salida', () => {
    const s = carga({ ETA: dia(-6) }, [op({ OPERATIVA: 'CARGA A PISO', LIBRE: 'DEVUELTO' })])
    expect(estadoCliente(s, HOY)).toBe('en_montevideo')
    expect(esperandoSalida([s], HOY)).toHaveLength(1)
  })
})

describe('rutas directas (Chile / Buenos Aires): el puerto es el destino', () => {
  it('embarcada → "Llega a destino"; llegó sin tramo terrestre → En destino desde la ETA', () => {
    const viene = chile({ ETD: dia(-10), ETA: dia(4) })
    expect(estadoCliente(viene, HOY)).toBe('embarcada')
    expect(proximoHito(viene, HOY)).toEqual({ label: 'Llega a destino', fecha: '06/09/2026', iso: dia(4) })
    const llego = chile({ ETA: dia(-3) })
    expect(estadoCliente(llego, HOY)).toBe('en_deposito')
    expect(etiquetaEstado(llego, 'en_deposito')).toBe('En destino')
    expect(proximoHito(llego, HOY)).toEqual({ label: 'En destino desde', fecha: '30/08/2026', iso: dia(-3) })
  })
  it('el día de la ETA todavía "llega hoy" (embarcada), no en destino', () => {
    expect(estadoCliente(chile({ ETA: dia(0) }), HOY)).toBe('embarcada')
  })
  it('con tramo terrestre cargado (Buenos Aires con fiscal) se sigue como cualquier carga, con etiqueta "En puerto"', () => {
    const ba = carga({ REF: 'A8085', PAIS: 'AR', POD: 'BUENOS AIRES', ETA: dia(-2) }, [op({ SALIDA: dia(3), ETA_FISC: dia(4) })])
    expect(estadoCliente(ba, HOY)).toBe('en_montevideo')
    expect(etiquetaEstado(ba, 'en_montevideo')).toBe('En puerto')
    expect(proximoHito(ba, HOY)).toEqual({ label: 'Sale del puerto', fecha: '05/09/2026', iso: dia(3) })
  })
  it('Buenos Aires con FISCAL cargado pero sin fechas: sigue "En puerto" esperando salida, no "En destino" (así no retrocede al cargar la salida)', () => {
    const ba = carga({ REF: 'A8085', PAIS: 'AR', POD: 'BUENOS AIRES', ETA: dia(-2) }, [op({ FISCAL: 'CACEC' })])
    expect(estadoCliente(ba, HOY)).toBe('en_montevideo')
    expect(etiquetaEstado(ba, 'en_montevideo')).toBe('En puerto')
    const e = esperandoSalida([ba], HOY)
    expect(e).toHaveLength(1)
    expect(e[0]).toMatchObject({ lugar: 'puerto BUENOS AIRES', enPuerto: true, ruta: 'AR' })
    // sin fiscal ni tramo, el puerto es el destino
    const sinFiscal = carga({ REF: 'A8086', PAIS: 'AR', POD: 'BUENOS AIRES', ETA: dia(-2) }, [op({ FISCAL: '' })])
    expect(estadoCliente(sinFiscal, HOY)).toBe('en_deposito')
    expect(esperandoSalida([sinFiscal], HOY)).toEqual([])
    // llegando al puerto: en "Llegan a destino" como LLEGA, con o sin fiscal
    expect(llegadasADestino([carga({ REF: 'A8087', PAIS: 'AR', POD: 'BUENOS AIRES', ETA: dia(2) }, [op({ FISCAL: 'CACEC' })])], HOY).map(f => f.estado)).toEqual(['llega'])
  })
  it('activa hasta 10 días después de llegar al puerto de destino; después Historial', () => {
    expect(esActivaParaCliente(chile({ ETA: dia(-CLIENTE_ENTREGADA_DIAS) }), HOY)).toBe(true)
    expect(esActivaParaCliente(chile({ ETA: dia(-CLIENTE_ENTREGADA_DIAS - 1) }), HOY)).toBe(false)
  })
})

describe('esActivaParaCliente — qué va a Mis cargas y qué a Historial', () => {
  it('un TRASIEGO que salió ayer y llega mañana sigue ACTIVO (el admin lo daba por completado)', () => {
    const s = carga({ ETA: dia(-5) }, [op({ OPERATIVA: 'TRASIEGO', SALIDA: dia(-1), ETA_FISC: dia(1) })])
    expect(esActivaParaCliente(s, HOY)).toBe(true)
    expect(llegadasADestino([s], HOY).map(f => f.estado)).toEqual(['en_frontera'])
  })
  it('en destino hace poco → activa; hace más de 10 días → Historial', () => {
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
  it('sin operativas (ruta UY): activa hasta 60 días después de la ETA', () => {
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
  it('en camino → Llega a destino (la más próxima de las que viajan)', () => {
    const h = proximoHito(carga({ ETA: dia(-5) }, [
      op({ SALIDA: dia(-1), ETA_FISC: dia(2) }),
      op({ CNTR_OP: 'B', SALIDA: dia(-1), ETA_FISC: dia(1) }),
    ]), HOY)
    expect(h).toEqual({ label: 'Llega a destino', fecha: '03/09/2026', iso: dia(1) })
  })
  it('en destino → desde cuándo; entregada → sin fecha', () => {
    expect(proximoHito(carga({ ETA: dia(-9) }, [op({ SALIDA: dia(-4), ETA_FISC: dia(-2) })]), HOY).label).toBe('En destino desde')
    expect(proximoHito(carga({ ETA: dia(-9) }, [op({ SALIDA: dia(-4), ETA_FISC: dia(-2), LIBRE: 'DEVUELTO' })]), HOY)).toEqual({ label: 'Entregada', fecha: '', iso: '' })
  })
})

describe('llegadasADestino — card 1', () => {
  it('en frontera primero, después sale hoy, después por fecha de llegada', () => {
    const l = llegadasADestino([
      carga({ REF: 'A1', CLIENT_REF: '', ETA: dia(-6) }, [op({ SALIDA: dia(3), ETA_FISC: dia(5) })]),
      carga({ REF: 'A2', ETA: dia(-6) }, [op({ SALIDA: dia(-2), ETA_FISC: dia(1) })]),
      carga({ REF: 'A3', ETA: dia(-6) }, [op({ SALIDA: dia(0), ETA_FISC: dia(2) })]),
    ], HOY)
    expect(l.map(f => f.ref + ':' + f.estado)).toEqual(['A2:en_frontera', 'A3:sale_hoy', 'A1:sale'])
    expect(l[0]).toMatchObject({ fecha: dia(1), dias: 1, cntr: 'FANU1858496', descripcion: 'MOTOPARTES', fiscal: 'CACEC', ruta: 'UY', tipo: 'fcl', camion: '' })
    expect(l[2].refs.principal).toBe('1')
  })
  it('rutas directas: el buque que llega al puerto de destino en los próximos 7 días entra como "llega"', () => {
    const l = llegadasADestino([
      chile({ REF: 'HOY', ETA: dia(0) }),
      chile({ REF: 'EN7', ETA: dia(DESTINO_DIAS_ADELANTE) }),
      chile({ REF: 'EN8', ETA: dia(DESTINO_DIAS_ADELANTE + 1) }),
      chile({ REF: 'LLEGO', ETA: dia(-1) }),
    ], HOY)
    expect(l.map(f => f.ref + ':' + f.estado + ':' + f.dias)).toEqual(['HOY:llega:0', `EN7:llega:${DESTINO_DIAS_ADELANTE}`])
    expect(l[0]).toMatchObject({ ruta: 'CL', fecha: HOY, fiscal: 'SAN ANTONIO', salida: '' })
  })
  it('LCL en camión: tránsito supuesto de 3 días sin fecha de llegada; si el equipo marcó el camión entregado, llegó', () => {
    const viajando = lcl({ ETA: dia(-10) }, [opCamion({ SALIDA: dia(-2) })])
    expect(estadoCliente(viajando, HOY)).toBe('en_camino')
    const llegada = lcl({ ETA: dia(-10) }, [opCamion({ SALIDA: dia(-3) })])
    expect(estadoCliente(llegada, HOY)).toBe('en_deposito')
    expect(proximoHito(llegada, HOY)).toEqual({ label: 'En destino (estimado)', fecha: '02/09/2026', iso: HOY })
    const entregado = lcl({ ETA: dia(-10) }, [opCamion({ SALIDA: dia(-1), ENTREGADO: true } as never)])
    expect(estadoCliente(entregado, HOY)).toBe('en_deposito')
    expect(proximoHito(entregado, HOY).iso).toBe(HOY) // a más tardar hoy
    expect(llegadasADestino([entregado], HOY)).toEqual([])
  })
  it('LCL con camión: la fila lleva el código del camión y el fiscal de esa carga', () => {
    const l = llegadasADestino([lcl({ ETA: dia(-10) }, [opCamion({ SALIDA: dia(-1), ETA_FISC: dia(1) })])], HOY)
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ estado: 'en_frontera', camion: 'C463', cntr: '', fiscal: 'ZF RAFAELA', tipo: 'lcl', ruta: 'UY' })
    expect(l[0].refs.principal).toBe('E234')
  })
  it('sin SALIDA no entra (es "esperando salida"); ya llegado, lejano, en el mar sin fiscal y devuelto tampoco', () => {
    const l = llegadasADestino([
      carga({ REF: 'SINSALIDA', ETA: dia(-1) }, [op({ ETA_FISC: dia(3) })]),
      carga({ REF: 'LLEGO', ETA: dia(-9) }, [op({ SALIDA: dia(-4), ETA_FISC: dia(-1) })]),
      carga({ REF: 'ENMAR', ETA: dia(2) }, [op({ SALIDA: dia(4) })]),
      carga({ REF: 'LEJOS', ETA: dia(-1) }, [op({ SALIDA: dia(DESTINO_DIAS_ADELANTE + 1) })]),
      carga({ REF: 'DEVUELTA', ETA: dia(-9) }, [op({ SALIDA: dia(-1), LIBRE: 'DEVUELTO' })]),
    ], HOY)
    expect(l).toEqual([])
  })
  it('salió sin fecha de llegada: en frontera con llegada a confirmar', () => {
    const [f] = llegadasADestino([carga({ ETA: dia(-3) }, [op({ SALIDA: dia(-1) })])], HOY)
    expect(f).toMatchObject({ estado: 'en_frontera', fecha: '', dias: null, salida: dia(-1) })
  })
})

// El caso que lo motivó (Brian, 04/09, mirando el portal como CHIAPERO): la
// A8045 llega a Montevideo el 8, sale el 9 y arriba a RAFAELA el 11, y no
// aparecía en "Llegan a destino" porque el buque todavía no había atracado.
// Decisión: que aparezca MARCADA —fecha estimada + "todavía en el buque, llega
// a Montevideo el 8"—, no que desaparezca.
describe('llegadasADestino — todavía en el buque (Brian 04/09)', () => {
  const a8045 = (o: Partial<OperativasRecord> = {}) =>
    carga({ REF: 'A8045', ETA: dia(4) }, [op({ SALIDA: dia(5), ETA_FISC: dia(7), FISCAL: 'ZP RAFAELA', ...o })])

  it('con fecha de fiscal entra marcada `en_buque`, con la ETA a Montevideo al lado', () => {
    const l = llegadasADestino([a8045()], HOY)
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({
      ref: 'A8045', estado: 'en_buque', fecha: dia(7), dias: 7,
      etaPuerto: dia(4), salida: dia(5), fiscal: 'ZP RAFAELA', cntr: 'FANU1858496',
    })
  })

  it('sin fecha de fiscal no entra: no hay nada que anunciar', () => {
    expect(llegadasADestino([a8045({ ETA_FISC: '' })], HOY)).toEqual([])
    // ni siquiera sin salida cargada todavía
    expect(llegadasADestino([a8045({ ETA_FISC: '', SALIDA: '' })], HOY)).toEqual([])
  })

  it('con fecha de fiscal pero sin salida cargada entra igual (la fecha ya es un dato)', () => {
    const l = llegadasADestino([a8045({ SALIDA: '' })], HOY)
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ estado: 'en_buque', salida: '', fecha: dia(7) })
  })

  it('la ventana es la de la card de llegada que le toca: 14 días por Montevideo, 7 en ruta directa', () => {
    const uyBorde = carga({ REF: 'UY14', ETA: dia(MVD_DIAS_ADELANTE) }, [op({ ETA_FISC: dia(MVD_DIAS_ADELANTE + 2) })])
    const uyLejos = carga({ REF: 'UY15', ETA: dia(MVD_DIAS_ADELANTE + 1) }, [op({ ETA_FISC: dia(MVD_DIAS_ADELANTE + 3) })])
    expect(llegadasADestino([uyBorde], HOY).map(f => f.ref + ':' + f.estado)).toEqual(['UY14:en_buque'])
    expect(llegadasADestino([uyLejos], HOY)).toEqual([])
    const ar = (n: number) => carga(
      { REF: 'AR' + n, PAIS: 'AR', POD: 'BUENOS AIRES', ETA: dia(n) },
      [op({ FISCAL: 'CACEC', ETA_FISC: dia(n + 2) })],
    )
    expect(llegadasADestino([ar(DESTINO_DIAS_ADELANTE)], HOY).map(f => f.estado)).toEqual(['en_buque'])
    expect(llegadasADestino([ar(DESTINO_DIAS_ADELANTE + 1)], HOY)).toEqual([])
  })

  it('lo estimado va al final: primero lo que está en tierra', () => {
    const l = llegadasADestino([
      a8045(),
      carga({ REF: 'SALE', ETA: dia(-6) }, [op({ SALIDA: dia(3), ETA_FISC: dia(5) })]),
      carga({ REF: 'FRONTERA', ETA: dia(-6) }, [op({ SALIDA: dia(-2), ETA_FISC: dia(1) })]),
      carga({ REF: 'HOY', ETA: dia(-6) }, [op({ SALIDA: dia(0), ETA_FISC: dia(2) })]),
    ], HOY)
    expect(l.map(f => f.ref)).toEqual(['FRONTERA', 'HOY', 'SALE', 'A8045'])
  })

  it('el estado de la carga no se toca: sigue "embarcada" y su hito sigue siendo la llegada a Montevideo', () => {
    const s = a8045()
    expect(estadoCliente(s, HOY)).toBe('embarcada')
    expect(proximoHito(s, HOY)).toEqual({ label: 'Llega a Montevideo', fecha: '06/09/2026', iso: dia(4) })
  })

  it('sigue anunciándose en "Llegan a Montevideo" y no se repite en Embarcadas ni aparece dos veces', () => {
    const h = hoyCliente([a8045()], HOY)
    expect(h.destino.map(f => f.ref)).toEqual(['A8045'])
    expect(h.montevideo.map(f => f.ref)).toEqual(['A8045'])   // no desaparece de la card 3
    expect(h.embarques).toEqual([])
    expect(h.esperando).toEqual([])
    // una fila por card, nunca dos filas de la misma operativa en la misma card
    expect(h.destino).toHaveLength(1)
  })

  it('la fecha de fiscal ya pasada con el buque en el mar es un dato viejo: no entra', () => {
    expect(llegadasADestino([a8045({ ETA_FISC: dia(-1) })], HOY)).toEqual([])
    expect(llegadasADestino([a8045({ ETA_FISC: HOY })], HOY)).toEqual([])
  })

  it('dos contenedores: entra el que tiene fecha de fiscal, el otro espera', () => {
    const s = carga({ REF: 'A8100', ETA: dia(3) }, [
      op({ CNTR_OP: 'A', SALIDA: dia(4), ETA_FISC: dia(6) }),
      op({ CNTR_OP: 'B' }),
    ])
    const l = llegadasADestino([s], HOY)
    expect(l.map(f => f.cntr + ':' + f.estado)).toEqual(['A:en_buque'])
  })
})

describe('esperandoSalida — card 2 (solo vía Montevideo)', () => {
  it('arribadas ANTES de hoy sin salida, la que más espera primero, con dónde está', () => {
    const l = esperandoSalida([
      carga({ REF: 'A1', ETA: dia(-2), TERMINAL: 'TCP' }, [op({ LUGAR_SALIDA: '' })]),
      carga({ REF: 'A2', ETA: dia(-7) }, [op({ LUGAR_SALIDA: 'PLANIR' })]),
      carga({ REF: 'PROG', ETA: dia(-3) }, [op({ SALIDA: dia(2) })]),
      carga({ REF: 'SALIO', ETA: dia(-3) }, [op({ SALIDA: dia(-1) })]),
      carga({ REF: 'HOYLLEGA', ETA: dia(0) }, [op()]),
      carga({ REF: 'ENMAR', ETA: dia(2) }, [op()]),
      carga({ REF: 'SINETA', ETA: '' }, [op()]),
      carga({ REF: 'PISO', ETA: dia(-20) }, [op({ OPERATIVA: 'CARGA A PISO', LIBRE: 'DEVUELTO' })]),
      carga({ REF: 'DESCARGADA', ETA: dia(-4) }, [op({ DESCARGA: dia(-4) })]),
      chile({ REF: 'CHILE', ETA: dia(-3) }, [op({ LUGAR_SALIDA: '' })]),   // ruta directa: no espera salida
    ], HOY)
    expect(l.map(f => f.ref + ':' + f.lugar + ':' + f.dias)).toEqual(['PISO:terminal TCP:20', 'A2:PLANIR:7', 'DESCARGADA:terminal TCP:4', 'A1:terminal TCP:2'])
  })
  it('LCL arribada sin camión: espera en su depósito de desconsolidación', () => {
    const l = esperandoSalida([lcl({ ETA: dia(-5) }, [op({ OPERATIVA: '', CNTR_OP: '', DEPOSITO: 'PLANIR', LUGAR_SALIDA: 'PLANIR' })])], HOY)
    expect(l.map(f => f.ref + ':' + f.lugar + ':' + f.tipo)).toEqual(['E234:PLANIR:lcl'])
  })
})

describe('llegadasAMontevideo — card 3 (solo vía Montevideo)', () => {
  it('ETA de hoy a 14 días, con el paso siguiente en palabras del cliente', () => {
    const l = llegadasAMontevideo([
      carga({ REF: 'HOY', ETA: dia(0) }, [op({ OPERATIVA: 'TRASIEGO', DEPOSITO: 'PLANIR' })]),
      carga({ REF: 'DIRECTO', ETA: dia(4) }, [op({ OPERATIVA: 'CONTENEDOR' })]),
      lcl({ REF: 'E1', ETA: dia(6) }, [op({ OPERATIVA: '', DEPOSITO: 'TCP' })]),
      carga({ REF: 'PISO', ETA: dia(MVD_DIAS_ADELANTE) }, [op({ OPERATIVA: 'CARGA A PISO', DEPOSITO: 'GODILCO' })]),
      carga({ REF: 'AYER', ETA: dia(-1) }),
      carga({ REF: 'LEJOS', ETA: dia(MVD_DIAS_ADELANTE + 1) }),
      chile({ REF: 'CHILE', ETA: dia(3) }),
    ], HOY)
    expect(l.map(f => f.ref + ':' + f.dias + ':' + f.pasoSiguiente)).toEqual([
      'HOY:0:Trasiego en PLANIR', 'DIRECTO:4:Directo a tu depósito', 'E1:6:Desconsolida en TCP', `PISO:${MVD_DIAS_ADELANTE}:Desconsolida en GODILCO`,
    ])
    expect(l[0]).toMatchObject({ buque: 'SANTA CATARINA EXPRESS', cntrs: 1 })
  })
  it('sin operativa el paso siguiente queda vacío (FCL) o "Desconsolida" (LCL)', () => {
    expect(pasoSiguiente(carga({}, []))).toBe('')
    expect(pasoSiguiente(lcl({}, []))).toBe('Desconsolida en depósito')
  })
})

describe('embarcadas — card 4', () => {
  it('ETD de −7 a +7 días, sin lo que ya está en una card de llegada', () => {
    const l = embarcadas([
      carga({ REF: 'ZARPO', ETD: dia(-3), ETA: dia(30) }),
      carga({ REF: 'ZARPA', ETD: dia(5), ETA: dia(40) }),
      carga({ REF: 'VIEJA', ETD: dia(-8), ETA: dia(25) }),
      carga({ REF: 'CORTA', ETD: dia(-3), ETA: dia(5) }),            // ya en "Llegan a Montevideo"
      chile({ REF: 'CLCERCA', ETD: dia(-3), ETA: dia(5) }),          // ya en "Llegan a destino"
      chile({ REF: 'CLLEJOS', ETD: dia(-3), ETA: dia(10) }),         // todavía no está en ninguna llegada
      carga({ REF: 'LLEGAHOY', ETD: dia(-2), ETA: dia(0) }),
      carga({ REF: 'SINETD', ETD: '', ETA: dia(30) }),
    ], HOY)
    expect(l.map(f => f.ref)).toEqual(['CLLEJOS', 'ZARPO', 'ZARPA']) // mismo ETD → por ref
    expect(l[1]).toMatchObject({ zarpo: true, dias: -3, eta: dia(30), ruta: 'UY' })
    expect(l[0]).toMatchObject({ ruta: 'CL', eta: dia(10) })
  })
})

// Una carga (de un contenedor) vive en UNA sola card. La única excepción, y es
// a propósito (Brian 04/09), es la que todavía viaja en el buque con fecha de
// fiscal cargada: se anuncia en "Llegan a Montevideo" (cuándo atraca) y en
// "Llegan a destino" marcada como estimada (cuándo llega al fiscal). Nunca en
// más de esas dos, ni dos veces en la misma.
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
    ['Chile llega hoy', chile({ ETD: dia(-20), ETA: dia(0) })],
    ['Chile zarpó hace 3, llega en 5', chile({ ETD: dia(-3), ETA: dia(5) })],
    ['Chile zarpó hace 3, llega en 10', chile({ ETD: dia(-3), ETA: dia(10) })],
    ['Chile llegó ayer', chile({ ETA: dia(-1) })],
    ['LCL en camión', lcl({ ETA: dia(-10) }, [opCamion({ SALIDA: dia(-1), ETA_FISC: dia(1) })])],
    ['LCL esperando', lcl({ ETA: dia(-5) }, [op({ OPERATIVA: '', CNTR_OP: '', LUGAR_SALIDA: 'PLANIR' })])],
    ['LCL sin país ni puerto, esperando', lcl({ PAIS: '' as unknown as ParsedShipment['PAIS'], POD: '', ETA: dia(-5) }, [op({ OPERATIVA: '', CNTR_OP: '' })])],
    ['Bs. As. con fiscal, llegó ayer', carga({ PAIS: 'AR', POD: 'BUENOS AIRES', ETA: dia(-1) }, [op({ FISCAL: 'CACEC' })])],
    ['Bs. As. con fiscal, llega en 3', carga({ PAIS: 'AR', POD: 'BUENOS AIRES', ETA: dia(3) }, [op({ FISCAL: 'CACEC' })])],
    ['Bs. As. con fiscal, sale en 2', carga({ PAIS: 'AR', POD: 'BUENOS AIRES', ETA: dia(-3) }, [op({ FISCAL: 'CACEC', SALIDA: dia(2) })])],
    ['LCL en camión entregado', lcl({ ETA: dia(-10) }, [opCamion({ SALIDA: dia(-1), ENTREGADO: true } as never)])],
  ]
  for (const [nombre, s] of casos) {
    it(nombre, () => {
      const h = hoyCliente([s], HOY)
      const conFilas = [h.destino, h.esperando, h.montevideo, h.embarques].filter(l => l.length > 0)
      const enBuque = h.destino.some(f => f.estado === 'en_buque')
      if (enBuque) {
        // La excepción: destino (estimado) + Montevideo (firme), nada más.
        expect(conFilas).toEqual([h.destino, h.montevideo])
        expect(h.destino).toHaveLength(1)
        expect(h.montevideo).toHaveLength(1)
      } else {
        expect(conFilas.length).toBeLessThanOrEqual(1)
      }
    })
  }
  it('la única carga que está en dos cards es la del buque con fecha de fiscal', () => {
    const enBuque = carga({ REF: 'BUQUE', ETD: dia(-20), ETA: dia(4) }, [op({ SALIDA: dia(5), ETA_FISC: dia(7) })])
    const h = hoyCliente([enBuque], HOY)
    expect(h.destino.map(f => f.estado)).toEqual(['en_buque'])
    expect(h.montevideo.map(f => f.ref)).toEqual(['BUQUE'])
    expect([...h.esperando, ...h.embarques]).toEqual([])
  })
})

describe('alertasCliente — card Atención en idioma del cliente', () => {
  const alerta = (a: Partial<ShipmentAlert>): ShipmentAlert => ({
    id: 'x', shipmentRef: 'A8045', type: 'libre_vencido', severity: 'critical',
    title: 'Días libres vencidos', message: 'Vencido hace 3 días (2026-08-30)', date: HOY, ...a,
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
  it('sin la carga a mano, la ref cae a nuestro número (sin la A)', () => {
    const [a] = alertasCliente([alerta({ shipmentRef: 'A9999' })], [])
    expect(a.refs.principal).toBe('9999')
  })
  it('el nombre del cliente llega hasta las filas: una client_ref que lo repite se descarta', () => {
    const chiapero = carga({ REF: 'A8121', CLIENT_REF: 'CHIAPERO S.R.L.' })
    const [con] = alertasCliente([alerta({ shipmentRef: 'A8121' })], [chiapero], 'CHIAPERO S.R.L.')
    expect(con.refs).toEqual({ principal: '8121', secundaria: '', propia: false })
  })
  it('y se descarta IGUAL cuando no sabemos el nombre del cliente', () => {
    // El portal saca el nombre de `client_users`, donde puede estar cargada la
    // persona de contacto y no la razón social. Si el descarte dependiera solo
    // de esa comparación, la razón social saldría de título grande. La regla
    // `pareceNombre` (sin dígitos + más de una palabra) lo ataja sin saber
    // quién mira.
    const chiapero = carga({ REF: 'A8121', CLIENT_REF: 'CHIAPERO S.R.L.' })
    const [sin] = alertasCliente([alerta({ shipmentRef: 'A8121' })], [chiapero])
    expect(sin.refs.principal).toBe('8121')
    expect(sin.refs.propia).toBe(false)
  })
})

describe('textoDias', () => {
  it('habla como la card', () => {
    expect([null, 0, 1, 4, -1, -3].map(textoDias)).toEqual(['', 'hoy', 'mañana', 'en 4d', 'ayer', 'hace 3d'])
  })
})

describe('el cliente ve "en depósito" cuando el contenedor ya se retiró (Brian 03/09)', () => {
  const hoy = '2026-09-10'
  const carga = (extra: Record<string, unknown>, op: Record<string, unknown>) => ({
    REF: 'A9100', CLIENTE: 'DEMO', ETD: '2026-08-01', ETA: '2026-09-05',
    PAIS: 'UY', POD: 'MONTEVIDEO', TERMINAL: 'TCP', N: 1, CNTR: 'X1', MODE: 'fcl',
    operativas: [{ REF: 'A9100', CNTR_OP: 'X1', OPERATIVA: 'TRASIEGO', ...op }],
    ...extra,
  }) as unknown as Parameters<typeof esperandoSalida>[0][number]

  it('sin retirar dice dónde está: la terminal', () => {
    const [f] = esperandoSalida([carga({}, {})], hoy)
    expect(f.lugar).toBe('terminal TCP')
    expect(f.retirado).toBe('')
  })
  it('retirada dice el depósito y desde cuándo', () => {
    const [f] = esperandoSalida([carga({ RETIRADO: '2026-09-08' }, { DEPOSITO: 'GODILCO' })], hoy)
    expect(f.lugar).toBe('depósito GODILCO')
    expect(f.retirado).toBe('2026-09-08')
  })
  it('retirada sin depósito cargado no inventa el nombre', () => {
    const [f] = esperandoSalida([carga({ RETIRADO: '2026-09-08' }, {})], hoy)
    expect(f.lugar).toBe('depósito')
  })
  it('con salida cargada ya no espera: sale de esta card', () => {
    expect(esperandoSalida([carga({ RETIRADO: '2026-09-08' }, { SALIDA: '2026-09-09' })], hoy)).toEqual([])
  })
})

describe('novedadesCliente — fotos e informes que el cliente todavía no vio', () => {
  const HOY_N = '2026-09-10'
  const dia = (iso: string) => Date.parse(iso + 'T12:00:00Z')
  const carga = (ref: string, op: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
    REF: ref, CLIENTE: 'DEMO', ETD: '2026-08-01', ETA: '2026-09-05', PAIS: 'UY',
    POD: 'MONTEVIDEO', POL: 'SHANGHAI', TERMINAL: 'TCP', N: 1, CNTR: 'X1', MODE: 'fcl',
    operativas: [{ REF: ref, CNTR_OP: 'X1', OPERATIVA: 'TRASIEGO', ...op }],
    ...extra,
  }) as unknown as Parameters<typeof novedadesCliente>[0][number]

  it('agrupa las fotos por carga y lugar, y dice dónde se sacaron', () => {
    const n = novedadesCliente(
      [carga('A1', { DEPOSITO: 'GODILCO' })],
      [
        { shipmentRef: 'A1', photoType: 'origen', createdAt: dia('2026-09-08') },
        { shipmentRef: 'A1', photoType: 'origen', createdAt: dia('2026-09-09') },
        { shipmentRef: 'A1', photoType: 'uruguay', createdAt: dia('2026-09-10') },
      ],
      [], HOY_N,
    )
    expect(n).toHaveLength(2)
    const uy = n.find(x => x.lugar.includes('GODILCO'))!
    expect(uy.cantidad).toBe(1)
    expect(uy.dias).toBe(0)
    const origen = n.find(x => x.lugar.includes('origen'))!
    expect(origen.cantidad).toBe(2)
    expect(origen.lugar).toBe('en origen (SHANGHAI)')
    expect(origen.fecha).toBe('2026-09-09')   // la más reciente del grupo
  })
  it('marca CARGANDO AHORA cuando el camión carga hoy y las fotos son de acá', () => {
    const n = novedadesCliente(
      [carga('A2', { SALIDA: HOY_N, DEPOSITO: 'PLANIR' })],
      [{ shipmentRef: 'A2', photoType: 'uruguay', createdAt: dia(HOY_N) }],
      [], HOY_N,
    )
    expect(n[0].cargandoAhora).toBe(true)
  })
  it('las fotos de origen nunca son "cargando ahora"', () => {
    const n = novedadesCliente(
      [carga('A3', { SALIDA: HOY_N })],
      [{ shipmentRef: 'A3', photoType: 'origen', createdAt: dia(HOY_N) }],
      [], HOY_N,
    )
    expect(n[0].cargandoAhora).toBe(false)
  })
  it('el informe operativo entra como novedad propia', () => {
    const n = novedadesCliente(
      [carga('A4')], [],
      [{ shipmentRef: 'A4', title: 'Informe de carga', createdAt: dia('2026-09-09') }],
      HOY_N,
    )
    expect(n[0].clase).toBe('informe')
    expect(n[0].lugar).toBe('Informe de carga')
  })
  it('lo viejo no aparece, y lo de otro cliente tampoco', () => {
    const n = novedadesCliente(
      [carga('A5')],
      [
        { shipmentRef: 'A5', photoType: 'origen', createdAt: dia('2026-08-01') },
        { shipmentRef: 'OTRA', photoType: 'origen', createdAt: dia(HOY_N) },
      ],
      [], HOY_N,
    )
    expect(n).toEqual([])
  })
  it('cada fila dice de qué lugar son sus fotos, para poder traer las miniaturas', () => {
    const n = novedadesCliente(
      [carga('A8', { DEPOSITO: 'GODILCO' })],
      [
        { shipmentRef: 'A8', photoType: 'origen', createdAt: dia('2026-09-09') },
        { shipmentRef: 'A8', photoType: 'uruguay', createdAt: dia(HOY_N) },
      ],
      [], HOY_N,
    )
    expect(n.map(x => x.lugarFoto).sort()).toEqual(['origen', 'uruguay'])
    expect(n.every(x => x.informeId === '')).toBe(true)
  })

  it('el informe trae su id: es lo que abre el PDF desde el aviso', () => {
    const n = novedadesCliente(
      [carga('A9')], [],
      [{ id: 'inf-1', shipmentRef: 'A9', title: 'Informe de trasiego', createdAt: dia(HOY_N) }],
      HOY_N,
    )
    expect(n[0].informeId).toBe('inf-1')
    expect(n[0].lugarFoto).toBeNull()
  })

  it('las filas de fotos nombran la carga como el cliente la nombra (D2)', () => {
    // Sin pasar el nombre del cliente, una CLIENT_REF que dice el nombre del
    // cliente se colaba como título: la fila de fotos no lo estaba pasando.
    const n = novedadesCliente(
      [carga('A8121', {}, { CLIENT_REF: 'CHIAPERO S.R.L.' })],
      [{ shipmentRef: 'A8121', photoType: 'origen', createdAt: dia(HOY_N) }],
      [], HOY_N, undefined, 'CHIAPERO S.R.L.',
    )
    expect(n[0].refs.principal).toBe('8121')
  })

  it('primero lo de hoy', () => {
    const n = novedadesCliente(
      [carga('A6'), carga('A7')],
      [
        { shipmentRef: 'A6', photoType: 'origen', createdAt: dia('2026-09-06') },
        { shipmentRef: 'A7', photoType: 'origen', createdAt: dia(HOY_N) },
      ],
      [], HOY_N,
    )
    expect(n.map(x => x.ref)).toEqual(['A7', 'A6'])
  })
})
