import { describe, it, expect } from 'vitest'
import {
  salidasProgramadas,
  totalCargas,
  esCargaEspecial,
  libreProximoAVencer,
  llegadaAtipicaAFiscal,
  SALIDAS_DIAS_ADELANTE,
} from './partnerSalidas'
import type { ParsedShipment, OperativasRecord } from './shipmentTypes'

const HOY = new Date(2026, 8, 1) // martes 01/09/2026

const op = (o: Partial<OperativasRecord>): OperativasRecord => ({
  REF: 'A1', TLX: '', DEPOSITO: '', ETA_OP: '', SALIDA: '', ETA_FISC: '', LIBRE: '',
  OPERATIVA: '', CNTR_OP: '', PKGS: 0, KG: 0, M3: 0, DESCRIPCION: '', FISCAL: '',
  DESCARGA: '', DEV: '', CLIENTE_OP: '', TIPO: '', WOOD: '',
} as unknown as OperativasRecord & typeof o)

const carga = (ref: string, ops: Partial<OperativasRecord>[]): ParsedShipment => ({
  REF: ref, CLIENTE: 'BICI PERETTI S.A.', ETA: '2026-08-20', BUQUE: 'MSC SOFIA',
  operativas: ops.map(o => ({ ...op(o), REF: ref, ...o })),
} as unknown as ParsedShipment)

describe('salidasProgramadas — el plan de carga del partner', () => {
  it('agrupa por día de carga y ordena los días', () => {
    const dias = salidasProgramadas([
      carga('A8131', [{ SALIDA: '2026-09-11' }]),
      carga('A7996', [{ SALIDA: '2026-09-07' }]),
      carga('A7997', [{ SALIDA: '2026-09-09' }]),
    ], HOY)
    expect(dias.map(d => d.fecha)).toEqual(['2026-09-07', '2026-09-09', '2026-09-11'])
    expect(totalCargas(dias)).toBe(3)
  })

  it('varias cargas del mismo día caen en el mismo grupo', () => {
    const dias = salidasProgramadas([
      carga('A7996', [{ SALIDA: '2026-09-07', DEPOSITO: 'PLANIR' }]),
      carga('A7995', [{ SALIDA: '2026-09-07', DEPOSITO: 'GODILCO' }]),
    ], HOY)
    expect(dias).toHaveLength(1)
    expect(dias[0].cargas.map(c => c.ref)).toEqual(['A7995', 'A7996']) // ordenado por depósito
  })

  it('sin fecha de carga NO entra: lo que se está acomodando no se publica', () => {
    expect(salidasProgramadas([carga('A8276', [{ SALIDA: '', DEPOSITO: 'GODILCO' }])], HOY)).toEqual([])
  })

  it('lo que ya salió NO entra: el plan mira para adelante', () => {
    expect(salidasProgramadas([carga('A7781', [{ SALIDA: '2026-08-25' }])], HOY)).toEqual([])
  })

  it('lo de hoy entra', () => {
    const dias = salidasProgramadas([carga('A7958', [{ SALIDA: '2026-09-01' }])], HOY)
    expect(dias.map(d => d.fecha)).toEqual(['2026-09-01'])
  })

  it('respeta el horizonte de dos semanas', () => {
    const dentro = new Date(HOY.getTime() + SALIDAS_DIAS_ADELANTE * 86400000)
    const fuera = new Date(HOY.getTime() + (SALIDAS_DIAS_ADELANTE + 1) * 86400000)
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    expect(salidasProgramadas([carga('BORDE', [{ SALIDA: iso(dentro) }])], HOY)).toHaveLength(1)
    expect(salidasProgramadas([carga('LEJOS', [{ SALIDA: iso(fuera) }])], HOY)).toEqual([])
  })

  it('una fecha basura no se cuela como si fuera un día real', () => {
    expect(salidasProgramadas([carga('A1', [{ SALIDA: 'CONFIRMAR' }])], HOY)).toEqual([])
    expect(salidasProgramadas([carga('A2', [{ SALIDA: '2/9' }])], HOY)).toEqual([])
  })

  it('cada contenedor es una fila: el camión lleva uno', () => {
    const dias = salidasProgramadas([
      carga('A7995', [
        { SALIDA: '2026-09-07', CNTR_OP: 'ONEU9465392' },
        { SALIDA: '2026-09-07', CNTR_OP: 'TTNU8763291' },
      ]),
    ], HOY)
    expect(dias[0].cargas.map(c => c.cntr)).toEqual(['ONEU9465392', 'TTNU8763291'])
  })

  it('un contenedor sin coordinar no arrastra al que sí tiene fecha', () => {
    const dias = salidasProgramadas([
      carga('A8151', [
        { SALIDA: '2026-09-07', CNTR_OP: 'CON_FECHA' },
        { SALIDA: '', CNTR_OP: 'SIN_FECHA' },
      ]),
    ], HOY)
    expect(dias[0].cargas.map(c => c.cntr)).toEqual(['CON_FECHA'])
  })

  it('suma los kilos del día: es lo que define cuántas unidades hacen falta', () => {
    const dias = salidasProgramadas([
      carga('A1', [{ SALIDA: '2026-09-07', KG: 26000 }]),
      carga('A2', [{ SALIDA: '2026-09-07', KG: 12900 }]),
    ], HOY)
    expect(dias[0].kgTotal).toBe(38900)
  })

  it('trae lo que hace falta para mandar la unidad', () => {
    const dias = salidasProgramadas([
      carga('A7958', [{
        SALIDA: '2026-09-01', LUGAR_SALIDA: 'PLANIR', DEPOSITO: 'PLANIR',
        TRANSPORTE: 'TRANSCAL', OPERATIVA: 'TRASIEGO', CNTR_OP: 'TEMU1789917',
        TIPO: '20GP', PKGS: 24, KG: 12900, M3: 21.75, FISCAL: 'CACEC',
        ETA_FISC: '2026-09-03', LIBRE: '2026-09-02', DESCRIPCION: 'AUTOPARTES',
        HORARIO: '08:00',
      }]),
    ], HOY)
    expect(dias[0].cargas[0]).toMatchObject({
      ref: 'A7958', cliente: 'BICI PERETTI S.A.', cntr: 'TEMU1789917', tipo: '20GP',
      deposito: 'PLANIR', transporte: 'TRANSCAL', operativa: 'TRASIEGO',
      fiscal: 'CACEC', etaFiscal: '2026-09-03', kg: 12900, m3: 21.75, pkgs: 24,
      horario: '08:00',
    })
  })

  it('usa LUGAR_SALIDA cuando difiere del depósito de la carga', () => {
    const dias = salidasProgramadas([
      carga('A1', [{ SALIDA: '2026-09-07', DEPOSITO: 'TCP', LUGAR_SALIDA: 'GODILCO' }]),
    ], HOY)
    expect(dias[0].cargas[0].deposito).toBe('GODILCO')
  })
})

describe('marcas operativas — las mismas que manda el mail', () => {
  const conOp = (o: Partial<OperativasRecord>) =>
    salidasProgramadas([carga('A1', [{ SALIDA: '2026-09-07', ...o }])], HOY)[0].cargas[0]

  it('marca la carga que pasa los 26 t', () => {
    expect(conOp({ KG: 26001 }).pesada).toBe(true)
    expect(conOp({ KG: 26000 }).pesada).toBe(false)
  })

  it('marca la carga de más de 1000 bultos', () => {
    expect(conOp({ PKGS: 1578 }).muchosBultos).toBe(true)
    expect(conOp({ PKGS: 24 }).muchosBultos).toBe(false)
  })

  it('marca madera, IMO y no apilable', () => {
    const c = conOp({ WOOD: 'SI', IMO: 'SI', NO_APILABLE: 'SI' })
    expect([c.madera, c.imo, c.noApilable]).toEqual([true, true, true])
    const limpia = conOp({ WOOD: 'NO', IMO: '', NO_APILABLE: 'NO' })
    expect([limpia.madera, limpia.imo, limpia.noApilable]).toEqual([false, false, false])
  })
})

describe('esCargaEspecial', () => {
  it('reconoce la mercadería que no se carga como una caja más', () => {
    expect(esCargaEspecial('MAQUINA CNC')).toBe(true)
    expect(esCargaEspecial('rollos de tela')).toBe(true)
    expect(esCargaEspecial('CUBIERTAS 17.5')).toBe(true)
    expect(esCargaEspecial('AUTOPARTES')).toBe(false)
    expect(esCargaEspecial('')).toBe(false)
  })
})

describe('libreProximoAVencer', () => {
  it('avisa cuando el libre vence dentro de los próximos días', () => {
    expect(libreProximoAVencer('2026-09-02', HOY)).toBe(true)
    expect(libreProximoAVencer('2026-09-01', HOY)).toBe(true)
    expect(libreProximoAVencer('2026-09-05', HOY)).toBe(true)
  })

  it('no avisa por un libre lejano ni por uno ya vencido', () => {
    expect(libreProximoAVencer('2026-09-19', HOY)).toBe(false)
    expect(libreProximoAVencer('2026-08-20', HOY)).toBe(false)
  })

  it('DEVUELTO no es una fecha y no dispara aviso', () => {
    expect(libreProximoAVencer('DEVUELTO', HOY)).toBe(false)
    expect(libreProximoAVencer('', HOY)).toBe(false)
  })
})

describe('llegadaAtipicaAFiscal', () => {
  it('marca sábado, domingo y martes', () => {
    expect(llegadaAtipicaAFiscal('2026-09-05')).toBe(true) // sábado
    expect(llegadaAtipicaAFiscal('2026-09-06')).toBe(true) // domingo
    expect(llegadaAtipicaAFiscal('2026-09-08')).toBe(true) // martes
  })

  it('no marca un día hábil normal', () => {
    expect(llegadaAtipicaAFiscal('2026-09-03')).toBe(false) // jueves
    expect(llegadaAtipicaAFiscal('2026-09-11')).toBe(false) // viernes
  })

  it('sin fecha no marca nada', () => {
    expect(llegadaAtipicaAFiscal('')).toBe(false)
    expect(llegadaAtipicaAFiscal('a confirmar')).toBe(false)
  })
})
