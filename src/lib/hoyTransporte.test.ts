import { describe, it, expect } from 'vitest'
import {
  alertasDe,
  hoyCargan,
  cargasEspeciales,
  avisosRecientes,
  ESPECIALES_DIAS_ADELANTE,
  ORDEN_ALERTAS,
} from './hoyTransporte'
import type { ParsedShipment, OperativasRecord } from './shipmentTypes'
import type { PartnerAviso } from './partnerAvisos'

const HOY = '2026-09-01' // martes

const op = (o: Partial<OperativasRecord> & Record<string, unknown>): OperativasRecord => ({
  REF: 'A1', TLX: '', DEPOSITO: '', ETA_OP: '', SALIDA: '', ETA_FISC: '', LIBRE: '',
  OPERATIVA: '', CNTR_OP: '', PKGS: 0, KG: 0, M3: 0, DESCRIPCION: '', FISCAL: '',
  DESCARGA: '', DEV: '', CLIENTE_OP: '', TIPO: '', WOOD: '', TRANSPORTE: 'TRANSCAL', HORARIO: '',
  ...o,
} as unknown as OperativasRecord)

const carga = (ref: string, ops: Array<Partial<OperativasRecord> & Record<string, unknown>>, cab: Record<string, unknown> = {}): ParsedShipment => ({
  REF: ref, CLIENTE: 'BICI PERETTI S.A.', ETA: '2026-08-20', BUQUE: 'MSC SOFIA',
  ...cab,
  operativas: ops.map(o => op({ ...o, REF: ref })),
} as unknown as ParsedShipment)

describe('alertasDe — las marcas que cambian cómo se carga', () => {
  it('lee SI/NO de la planilla (madera, IMO, no apilable)', () => {
    expect(alertasDe(op({ WOOD: 'SI', IMO: 'si', NO_APILABLE: 'SI' }))).toMatchObject({ madera: true, imo: true, noApilable: true })
    expect(alertasDe(op({ WOOD: 'NO', IMO: '', NO_APILABLE: 'no' }))).toMatchObject({ madera: false, imo: false, noApilable: false })
  })

  it('OOG llega desde la API como SI o como booleano; si falta, no es OOG', () => {
    expect(alertasDe(op({ OOG: 'SI' })).oog).toBe(true)
    expect(alertasDe(op({ OOG: true })).oog).toBe(true)
    expect(alertasDe(op({ OOG: 'NO' })).oog).toBe(false)
    expect(alertasDe(op({})).oog).toBe(false)
  })

  it('TLX pendiente sólo cuando el dato viaja y no está liberado', () => {
    expect(alertasDe(op({ TLX: '' })).tlxPendiente).toBe(true)
    expect(alertasDe(op({ TLX: 'SI' })).tlxPendiente).toBe(false)
    expect(alertasDe(op({ TLX: 'TRUE' })).tlxPendiente).toBe(false)
    const sinDato = op({}) as unknown as Record<string, unknown>
    delete sinDato.TLX
    expect(alertasDe(sinDato as unknown as OperativasRecord).tlxPendiente).toBe(false)
  })

  it('una LCL no tiene telex que liberar: nunca marca TLX pendiente', () => {
    expect(alertasDe(op({ TLX: '', MODE: 'lcl' })).tlxPendiente).toBe(false)
  })

  it('alguna = hay al menos una alerta grande (TLX no cuenta como especial)', () => {
    expect(alertasDe(op({})).alguna).toBe(false)
    expect(alertasDe(op({ WOOD: 'SI' })).alguna).toBe(true)
    expect(alertasDe(op({ TLX: '' })).alguna).toBe(false)
  })
})

describe('hoyCargan — lo que el transporte carga hoy', () => {
  it('trae sólo las operativas con SALIDA = hoy (fecha local, no UTC)', () => {
    const filas = hoyCargan([
      carga('A7958', [{ SALIDA: '2026-09-01', CNTR_OP: 'TEMU1789917' }]),
      carga('A7996', [{ SALIDA: '2026-09-02' }]),
      carga('A7781', [{ SALIDA: '2026-08-31' }]),
      carga('A8276', [{ SALIDA: '' }]),
    ], HOY)
    expect(filas.map(f => f.ref)).toEqual(['A7958'])
    expect(filas[0].cntr).toBe('TEMU1789917')
  })

  it('acepta la fecha con hora pegada (ISO largo) mirando sólo el día', () => {
    expect(hoyCargan([carga('A1', [{ SALIDA: '2026-09-01T00:00:00' }])], HOY)).toHaveLength(1)
  })

  it('una fecha basura no es hoy', () => {
    expect(hoyCargan([carga('A1', [{ SALIDA: 'CONFIRMAR' }])], HOY)).toEqual([])
  })

  it('una fila por contenedor, con lo que hace falta para mandar la unidad', () => {
    const filas = hoyCargan([
      carga('A7958', [{
        SALIDA: '2026-09-01', LUGAR_SALIDA: 'PLANIR', DEPOSITO: 'GODILCO', OPERATIVA: 'TRASIEGO',
        CNTR_OP: 'TEMU1789917', TIPO: '20GP', PKGS: 24, KG: 12900, M3: 21.75, FISCAL: 'CACEC',
        ETA_FISC: '2026-09-03', DESCRIPCION: 'AUTOPARTES', HORARIO: '08:00', WOOD: 'SI', CLIENTE_OP: 'PERETTI',
      }]),
    ], HOY)
    expect(filas[0]).toMatchObject({
      ref: 'A7958', cliente: 'PERETTI', cntr: 'TEMU1789917', tipo: '20GP',
      deposito: 'PLANIR', operativa: 'TRASIEGO', fiscal: 'CACEC', etaFiscal: '2026-09-03',
      descripcion: 'AUTOPARTES', horario: '08:00', pkgs: 24, kg: 12900, m3: 21.75,
    })
    expect(filas[0].alertas.madera).toBe(true)
  })

  it('sin LUGAR_SALIDA carga en el depósito de la carga; sin CLIENTE_OP usa el de la cabecera', () => {
    const [f] = hoyCargan([carga('A1', [{ SALIDA: '2026-09-01', DEPOSITO: 'GODILCO' }])], HOY)
    expect(f.deposito).toBe('GODILCO')
    expect(f.cliente).toBe('BICI PERETTI S.A.')
  })

  it('ordena por horario y después por depósito: el camión hace una parada por vez', () => {
    const filas = hoyCargan([
      carga('A3', [{ SALIDA: '2026-09-01', DEPOSITO: 'PLANIR', HORARIO: '' }]),
      carga('A2', [{ SALIDA: '2026-09-01', DEPOSITO: 'GODILCO', HORARIO: '10:00' }]),
      carga('A1', [{ SALIDA: '2026-09-01', DEPOSITO: 'GODILCO', HORARIO: '08:00' }]),
    ], HOY)
    expect(filas.map(f => f.ref)).toEqual(['A1', 'A2', 'A3'])
  })
})

describe('cargasEspeciales — para conseguir unidad y permisos con tiempo', () => {
  it('entra lo que es madera, IMO, OOG o no apilable; lo común no', () => {
    const grupos = cargasEspeciales([
      carga('MAD', [{ SALIDA: '2026-09-10', WOOD: 'SI' }]),
      carga('IMO', [{ SALIDA: '2026-09-10', IMO: 'SI' }]),
      carga('OOG', [{ SALIDA: '2026-09-10', OOG: true }]),
      carga('NOAP', [{ SALIDA: '2026-09-10', NO_APILABLE: 'SI' }]),
      carga('COMUN', [{ SALIDA: '2026-09-10' }]),
    ], HOY)
    const refs = grupos.flatMap(g => g.cargas.map(c => c.ref))
    expect(refs.sort()).toEqual(['IMO', 'MAD', 'NOAP', 'OOG'])
  })

  it('agrupa por tipo de alerta en el orden fijo, sin grupos vacíos', () => {
    const grupos = cargasEspeciales([
      carga('MAD', [{ SALIDA: '2026-09-10', WOOD: 'SI' }]),
      carga('OOG', [{ SALIDA: '2026-09-10', OOG: 'SI' }]),
    ], HOY)
    expect(grupos.map(g => g.tipo)).toEqual(['oog', 'madera'])
    expect(ORDEN_ALERTAS).toEqual(['imo', 'oog', 'madera', 'noApilable'])
  })

  it('una carga con dos alertas aparece en los dos grupos (cada grupo es una gestión distinta)', () => {
    const grupos = cargasEspeciales([carga('DOBLE', [{ SALIDA: '2026-09-10', WOOD: 'SI', IMO: 'SI' }])], HOY)
    expect(grupos.map(g => g.tipo)).toEqual(['imo', 'madera'])
    expect(grupos.every(g => g.cargas[0].ref === 'DOBLE')).toBe(true)
  })

  it('ventana: de hoy a +30 días; lo que ya salió no entra', () => {
    const grupos = cargasEspeciales([
      carga('HOY', [{ SALIDA: '2026-09-01', IMO: 'SI' }]),
      carga('BORDE', [{ SALIDA: '2026-10-01', IMO: 'SI' }]),      // +30
      carga('LEJOS', [{ SALIDA: '2026-10-02', IMO: 'SI' }]),      // +31
      carga('PASADA', [{ SALIDA: '2026-08-31', IMO: 'SI' }]),
    ], HOY)
    expect(ESPECIALES_DIAS_ADELANTE).toBe(30)
    expect(grupos[0].cargas.map(c => c.ref)).toEqual(['HOY', 'BORDE'])
  })

  it('sin fecha de carga también entra: está asignada y hay que prepararla', () => {
    const grupos = cargasEspeciales([carga('SINFECHA', [{ SALIDA: '', OOG: 'SI' }])], HOY)
    expect(grupos[0].cargas.map(c => c.ref)).toEqual(['SINFECHA'])
    expect(grupos[0].cargas[0].salida).toBe('')
  })

  it('sin fecha pero ya en fiscal o devuelta: ya se hizo, no se prepara nada', () => {
    const grupos = cargasEspeciales([
      carga('ENFISCAL', [{ SALIDA: '', ETA_FISC: '2026-08-20', IMO: 'SI' }]),
      carga('DEVUELTA', [{ SALIDA: '', LIBRE: 'DEVUELTO', IMO: 'SI' }]),
      carga('VIEJA', [{ SALIDA: '', IMO: 'SI' }], { ETA: '2026-05-01' }), // arribó hace >60 d, sin operativa
    ], HOY)
    expect(grupos).toEqual([])
  })

  it('dentro del grupo: primero las que tienen fecha (ascendente), después las sin fecha', () => {
    const grupos = cargasEspeciales([
      carga('SIN', [{ SALIDA: '', IMO: 'SI' }]),
      carga('B', [{ SALIDA: '2026-09-15', IMO: 'SI' }]),
      carga('A', [{ SALIDA: '2026-09-05', IMO: 'SI' }]),
    ], HOY)
    expect(grupos[0].cargas.map(c => c.ref)).toEqual(['A', 'B', 'SIN'])
  })

  it('trae ref, cliente, contenedor, salida, ETA y fiscal', () => {
    const grupos = cargasEspeciales([
      carga('A7595', [{ SALIDA: '2026-09-20', CNTR_OP: 'MSKU1', FISCAL: 'ZP RAFAELA', IMO: 'SI', DESCRIPCION: 'CENTRO MEC.' }], { ETA: '2026-09-15' }),
    ], HOY)
    expect(grupos[0].cargas[0]).toMatchObject({
      ref: 'A7595', cliente: 'BICI PERETTI S.A.', cntr: 'MSKU1', salida: '2026-09-20', eta: '2026-09-15',
      fiscal: 'ZP RAFAELA', descripcion: 'CENTRO MEC.',
    })
  })
})

describe('avisosRecientes — Mis avisos', () => {
  const aviso = (id: string, createdAt: string, estado: PartnerAviso['estado'] = 'pendiente'): PartnerAviso => ({
    id, tipo: 'senasa', ref: 'A1', cntr: '', partnerRole: 'transport', partnerFilter: 'TRANSCAL',
    partnerEmail: 'x@y', partnerName: 'X', dato: {}, estado, motivoRechazo: null,
    createdAt, resolvedAt: null, resolvedBy: null,
  })

  it('últimos 30 días, del más nuevo al más viejo', () => {
    const lista = avisosRecientes([
      aviso('viejo', '2026-07-20T10:00:00Z'),
      aviso('b', '2026-08-30T10:00:00Z'),
      aviso('a', '2026-09-01T09:00:00Z'),
      aviso('borde', '2026-08-02T10:00:00Z'),
    ], HOY)
    expect(lista.map(a => a.id)).toEqual(['a', 'b', 'borde'])
  })
})
