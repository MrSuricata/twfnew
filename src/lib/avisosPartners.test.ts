import { describe, it, expect } from 'vitest'
import {
  avisosDeArea, construirModoPorRef, separarAvisos, haceCuanto, textoDato,
  resumenResuelto, quienPartner, HORAS_RECIENTES,
} from './avisosPartners'
import type { PartnerAviso } from './partnerAvisos'

const AHORA = new Date(2026, 8, 1, 12, 0, 0) // 01/09/2026 12:00 local

let seq = 0
const aviso = (over: Partial<PartnerAviso> = {}): PartnerAviso => ({
  id: `av-${++seq}`, tipo: 'devolvi', ref: 'A7600', cntr: 'MRKU1234567',
  partnerRole: 'depot', partnerFilter: 'PLANIR', partnerEmail: 'leo@planir.com.uy', partnerName: 'Leo',
  dato: { fecha: '2026-09-01' }, estado: 'pendiente', motivoRechazo: null,
  createdAt: new Date(2026, 8, 1, 11, 0, 0).toISOString(), resolvedAt: null, resolvedBy: null,
  ...over,
})

describe('construirModoPorRef', () => {
  it('indexa por ref normalizada (mayúsculas, sin espacios)', () => {
    const m = construirModoPorRef([{ ref: ' a7600 ', mode: 'fcl' }, { ref: 'LCL201', mode: 'lcl' }])
    expect(m.get('A7600')).toBe('fcl')
    expect(m.get('LCL201')).toBe('lcl')
  })
  it('si la misma ref aparece con dos modos, gana el primero que no es lcl (split FCL A/B)', () => {
    const m = construirModoPorRef([{ ref: 'A7600', mode: 'lcl' }, { ref: 'A7600', mode: 'fcl' }])
    expect(m.get('A7600')).toBe('fcl')
  })
})

describe('avisosDeArea — qué HOY atiende cada aviso', () => {
  const modos = construirModoPorRef([{ ref: 'A7600', mode: 'fcl' }, { ref: 'LCL201', mode: 'lcl' }])

  it('retire y devolvi van a FCL, nunca a LCL', () => {
    const avs = [aviso({ tipo: 'retire' }), aviso({ tipo: 'devolvi' })]
    expect(avisosDeArea(avs, 'fcl', modos)).toHaveLength(2)
    expect(avisosDeArea(avs, 'lcl', modos)).toHaveLength(0)
  })

  it('desconsolide va a LCL, nunca a FCL', () => {
    const avs = [aviso({ tipo: 'desconsolide', ref: 'LCL201', cntr: '', dato: { stock: '12345' } })]
    expect(avisosDeArea(avs, 'lcl', modos)).toHaveLength(1)
    expect(avisosDeArea(avs, 'fcl', modos)).toHaveLength(0)
  })

  it('senasa va donde está la carga: ref FCL → FCL, ref LCL → LCL', () => {
    const fcl = aviso({ tipo: 'senasa', ref: 'A7600', partnerRole: 'transport', partnerFilter: 'TRANSCAL' })
    const lcl = aviso({ tipo: 'senasa', ref: 'LCL201', cntr: '', partnerRole: 'transport', partnerFilter: 'TRANSCAL' })
    expect(avisosDeArea([fcl, lcl], 'fcl', modos).map(a => a.ref)).toEqual(['A7600'])
    expect(avisosDeArea([fcl, lcl], 'lcl', modos).map(a => a.ref)).toEqual(['LCL201'])
  })

  it('senasa de una ref que no está en la DB se muestra en AMBAS (no perder el aviso)', () => {
    const av = aviso({ tipo: 'senasa', ref: 'A9999', partnerRole: 'transport', partnerFilter: 'TRANSCAL' })
    expect(avisosDeArea([av], 'fcl', modos)).toHaveLength(1)
    expect(avisosDeArea([av], 'lcl', modos)).toHaveLength(1)
  })

  it('senasa de una ref aérea/terrestre cae en FCL (lo que no es LCL lo mira Brian)', () => {
    const modos2 = construirModoPorRef([{ ref: 'AIR1', mode: 'air' }])
    const av = aviso({ tipo: 'senasa', ref: 'AIR1', cntr: '', partnerRole: 'transport', partnerFilter: 'TRANSCAL' })
    expect(avisosDeArea([av], 'fcl', modos2)).toHaveLength(1)
    expect(avisosDeArea([av], 'lcl', modos2)).toHaveLength(0)
  })

  it('compara la ref sin importar mayúsculas ni espacios', () => {
    const av = aviso({ tipo: 'senasa', ref: ' lcl201 ', cntr: '' })
    expect(avisosDeArea([av], 'lcl', modos)).toHaveLength(1)
  })
})

describe('separarAvisos — pendientes arriba, resueltos recientes plegados', () => {
  it('pendientes ordenados del más viejo al más nuevo (el que más espera, primero)', () => {
    const viejo = aviso({ createdAt: new Date(2026, 8, 1, 8, 0).toISOString() })
    const nuevo = aviso({ createdAt: new Date(2026, 8, 1, 11, 30).toISOString() })
    const { pendientes } = separarAvisos([nuevo, viejo], AHORA)
    expect(pendientes.map(a => a.id)).toEqual([viejo.id, nuevo.id])
  })

  it('resueltos de las últimas 24 h entran en recientes (los más nuevos primero); los más viejos no', () => {
    const hace2h = aviso({ estado: 'confirmado', resolvedAt: new Date(2026, 8, 1, 10, 0).toISOString(), resolvedBy: 'Joaquín' })
    const hace20h = aviso({ estado: 'rechazado', motivoRechazo: 'No coincide', resolvedAt: new Date(2026, 7, 31, 16, 0).toISOString(), resolvedBy: 'Diego' })
    const hace30h = aviso({ estado: 'confirmado', resolvedAt: new Date(2026, 7, 31, 6, 0).toISOString(), resolvedBy: 'Brian' })
    const { recientes, pendientes } = separarAvisos([hace20h, hace30h, hace2h], AHORA)
    expect(pendientes).toHaveLength(0)
    expect(recientes.map(a => a.id)).toEqual([hace2h.id, hace20h.id])
  })

  it('un resuelto sin resolvedAt no rompe: no entra en recientes', () => {
    const raro = aviso({ estado: 'confirmado', resolvedAt: null })
    expect(separarAvisos([raro], AHORA).recientes).toHaveLength(0)
  })

  it('HORAS_RECIENTES es 24', () => {
    expect(HORAS_RECIENTES).toBe(24)
  })
})

describe('haceCuanto', () => {
  it('recién / minutos / horas / días', () => {
    const t = (min: number) => new Date(AHORA.getTime() - min * 60_000).toISOString()
    expect(haceCuanto(t(0), AHORA)).toBe('recién')
    expect(haceCuanto(t(1), AHORA)).toBe('hace 1 min')
    expect(haceCuanto(t(45), AHORA)).toBe('hace 45 min')
    expect(haceCuanto(t(60), AHORA)).toBe('hace 1 h')
    expect(haceCuanto(t(60 * 5 + 10), AHORA)).toBe('hace 5 h')
    expect(haceCuanto(t(60 * 24), AHORA)).toBe('hace 1 día')
    expect(haceCuanto(t(60 * 24 * 3), AHORA)).toBe('hace 3 días')
  })
  it('fecha inválida o futura → cadena vacía / recién', () => {
    expect(haceCuanto('', AHORA)).toBe('')
    expect(haceCuanto('no-es-fecha', AHORA)).toBe('')
    expect(haceCuanto(new Date(AHORA.getTime() + 60_000).toISOString(), AHORA)).toBe('recién')
  })
})

describe('textoDato — el dato que aporta el partner', () => {
  it('fecha en D/M/AAAA', () => {
    expect(textoDato(aviso({ dato: { fecha: '2026-09-01' } }))).toBe('01/09/2026')
  })
  it('stock + fecha para desconsolide', () => {
    expect(textoDato(aviso({ tipo: 'desconsolide', dato: { stock: '12345', fecha: '2026-08-30' } }))).toBe('stock Nº 12345 · 30/08/2026')
    expect(textoDato(aviso({ tipo: 'desconsolide', dato: { stock: '12345' } }))).toBe('stock Nº 12345')
  })
  it('sin dato → vacío', () => {
    expect(textoDato(aviso({ dato: {} }))).toBe('')
  })
})

describe('quienPartner / resumenResuelto', () => {
  it('quién: el alcance (PLANIR) manda; si no hay, el nombre; si no, el email', () => {
    expect(quienPartner(aviso())).toBe('PLANIR')
    expect(quienPartner(aviso({ partnerFilter: '', partnerName: 'Leo' }))).toBe('Leo')
    expect(quienPartner(aviso({ partnerFilter: '', partnerName: '', partnerEmail: 'leo@planir.com.uy' }))).toBe('leo@planir.com.uy')
  })

  it('confirmado: "PLANIR marcó devuelto MRKU1234567 (A7600), confirmado por Joaquín"', () => {
    const a = aviso({ estado: 'confirmado', resolvedBy: 'Joaquín', resolvedAt: AHORA.toISOString() })
    expect(resumenResuelto(a)).toBe('PLANIR marcó devuelto MRKU1234567 (A7600), confirmado por Joaquín')
  })

  it('rechazado con motivo', () => {
    const a = aviso({ tipo: 'retire', estado: 'rechazado', resolvedBy: 'Diego', motivoRechazo: 'Todavía está en TCP' })
    expect(resumenResuelto(a)).toBe('PLANIR marcó retirado MRKU1234567 (A7600), rechazado por Diego: Todavía está en TCP')
  })

  it('sin contenedor (LCL) usa solo la ref; senasa desde el transporte', () => {
    const a = aviso({ tipo: 'desconsolide', ref: 'LCL201', cntr: '', estado: 'confirmado', resolvedBy: 'Agustina', dato: { stock: '55555' } })
    expect(resumenResuelto(a)).toBe('PLANIR marcó desconsolidada LCL201 (stock Nº 55555), confirmado por Agustina')
    const s = aviso({ tipo: 'senasa', partnerRole: 'transport', partnerFilter: 'TRANSCAL', estado: 'confirmado', resolvedBy: 'Brian' })
    expect(resumenResuelto(s)).toBe('TRANSCAL marcó SENASA solicitado MRKU1234567 (A7600), confirmado por Brian')
  })

  it('sin quién resolvió → "por el equipo"', () => {
    const a = aviso({ estado: 'confirmado', resolvedBy: null })
    expect(resumenResuelto(a)).toBe('PLANIR marcó devuelto MRKU1234567 (A7600), confirmado por el equipo')
  })
})
