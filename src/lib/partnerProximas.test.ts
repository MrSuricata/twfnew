import { describe, it, expect } from 'vitest'
import { proximasSinCoordinar, PROXIMAS_DIAS_ATRAS, type CargaProxima } from './partnerProximas'
import type { ParsedShipment, OperativasRecord } from './shipmentTypes'

const HOY = new Date(2026, 8, 1) // martes 01/09/2026

const op = (o: Partial<OperativasRecord>): OperativasRecord => ({
  REF: 'A1', TLX: '', DEPOSITO: '', ETA_OP: '', SALIDA: '', ETA_FISC: '', LIBRE: '',
  OPERATIVA: '', CNTR_OP: '', PKGS: 0, KG: 0, M3: 0, DESCRIPCION: '', FISCAL: '',
  DESCARGA: '', DEV: '', CLIENTE_OP: '', TIPO: '', WOOD: '', ...o,
} as OperativasRecord)

const carga = (ref: string, eta: string, ops: Partial<OperativasRecord>[]): ParsedShipment => ({
  REF: ref, CLIENTE: 'BICI PERETTI', ETA: eta, BUQUE: 'MSC SOFIA',
  operativas: ops.map(o => op({ REF: ref, ...o })),
} as unknown as ParsedShipment)

describe('proximasSinCoordinar — lo que se le viene al transporte', () => {
  it('una carga que llega y no tiene fecha de carga aparece', () => {
    const r = proximasSinCoordinar([carga('A8276', '2026-09-11', [{ DEPOSITO: 'GODILCO' }])], HOY)
    expect(r.map(x => x.ref)).toEqual(['A8276'])
    expect(r[0].deposito).toBe('GODILCO')
    expect(r[0].diasAEta).toBe(10)
  })

  it('si ya tiene fecha de carga NO aparece: eso ya está en el calendario', () => {
    expect(proximasSinCoordinar([carga('A8276', '2026-09-11', [{ SALIDA: '2026-09-12' }])], HOY)).toEqual([])
  })

  it('si ya llegó a fiscal NO aparece: el viaje terminó', () => {
    expect(proximasSinCoordinar([carga('A7958', '2026-08-20', [{ ETA_FISC: '2026-08-25' }])], HOY)).toEqual([])
  })

  it('llegó hace poco y sigue sin coordinar: aparece, es la más urgente', () => {
    const r = proximasSinCoordinar([carga('A8082', '2026-08-30', [{ DEPOSITO: 'PLANIR' }])], HOY)
    expect(r).toHaveLength(1)
    expect(r[0].diasAEta).toBe(-2)
  })

  it('una llegada vieja es historia, no trabajo: queda afuera', () => {
    const vieja = new Date(HOY.getTime() - (PROXIMAS_DIAS_ATRAS + 5) * 86400000)
    const iso = vieja.toISOString().slice(0, 10)
    expect(proximasSinCoordinar([carga('A7000', iso, [{}])], HOY)).toEqual([])
  })

  it('sin ETA no se puede prever nada: queda afuera', () => {
    expect(proximasSinCoordinar([carga('A9000', '', [{}])], HOY)).toEqual([])
  })

  it('ordena por llegada: primero lo que ya llegó, después lo más próximo', () => {
    const r = proximasSinCoordinar([
      carga('LEJOS', '2026-09-20', [{}]),
      carga('LLEGADA', '2026-08-30', [{}]),
      carga('PRONTO', '2026-09-03', [{}]),
    ], HOY)
    expect(r.map(x => x.ref)).toEqual(['LLEGADA', 'PRONTO', 'LEJOS'])
  })

  it('con varios contenedores, cada uno es una fila: el camión lleva uno', () => {
    const r = proximasSinCoordinar([
      carga('A8300', '2026-09-05', [
        { CNTR_OP: 'MSKU1111111', DEPOSITO: 'GODILCO' },
        { CNTR_OP: 'MSKU2222222', DEPOSITO: 'GODILCO' },
      ]),
    ], HOY)
    expect(r).toHaveLength(2)
    expect(r.map(x => x.cntr)).toEqual(['MSKU1111111', 'MSKU2222222'])
  })

  it('un contenedor ya coordinado no arrastra al otro que falta', () => {
    const r = proximasSinCoordinar([
      carga('A8301', '2026-09-05', [
        { CNTR_OP: 'AAA1111111', SALIDA: '2026-09-06' },
        { CNTR_OP: 'BBB2222222' },
      ]),
    ], HOY)
    expect(r.map(x => x.cntr)).toEqual(['BBB2222222'])
  })

  it('trae lo que el chofer necesita saber antes de salir', () => {
    const r = proximasSinCoordinar([
      carga('A8276', '2026-09-11', [{
        DEPOSITO: 'GODILCO', FISCAL: 'RAFAELA', KG: 26425, M3: 40, PKGS: 25,
        DESCRIPCION: 'POLYOL', WOOD: 'SI', TIPO: '40HC', CNTR_OP: 'MSNU7878739',
      }]),
    ], HOY)
    const c: CargaProxima = r[0]
    expect(c).toMatchObject({
      ref: 'A8276', cliente: 'BICI PERETTI', deposito: 'GODILCO', fiscal: 'RAFAELA',
      kg: 26425, m3: 40, pkgs: 25, madera: true, tipo: '40HC',
    })
  })

  it('la marca de madera reconoce SI y no se confunde con NO', () => {
    const conMadera = proximasSinCoordinar([carga('A1', '2026-09-05', [{ WOOD: 'SI' }])], HOY)
    const sinMadera = proximasSinCoordinar([carga('A2', '2026-09-05', [{ WOOD: 'NO' }])], HOY)
    expect(conMadera[0].madera).toBe(true)
    expect(sinMadera[0].madera).toBe(false)
  })
})
