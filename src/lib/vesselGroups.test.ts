import { describe, it, expect } from 'vitest'
import { groupByVoyage, buildEtaShiftPatch, VOYAGE_WINDOW_DAYS } from './vesselGroups'
import type { OperativasRecord } from './shipmentTypes'

// El agrupador es genérico estructural: alcanza con { buque, eta }.
const o = (buque: string, eta: string, ref = 'X') => ({ buque, eta, ref })

describe('groupByVoyage — un grupo por VIAJE, no por buque', () => {
  it('mismo buque con ETAs cercanas (≤ ventana) → UN viaje', () => {
    const groups = groupByVoyage([
      o('MAERSK SAN LAZARO', '2026-07-10', 'A1'),
      o('MAERSK SAN LAZARO', '2026-07-12', 'A2'),
      o('MAERSK SAN LAZARO', '2026-07-25', 'A3'),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].ops.map(x => x.ref)).toEqual(['A1', 'A2', 'A3'])
    expect(groups[0].etaMin).toBe('2026-07-10')
    expect(groups[0].etaMax).toBe('2026-07-25')
  })

  it('CASO BRIAN: mismo buque en enero y en mayo → DOS viajes separados', () => {
    const groups = groupByVoyage([
      o('CAPE ARTEMISIO', '2026-01-15', 'ENE1'),
      o('CAPE ARTEMISIO', '2026-01-18', 'ENE2'),
      o('CAPE ARTEMISIO', '2026-05-20', 'MAY1'),
    ])
    expect(groups).toHaveLength(2)
    const enero = groups.find(g => g.etaMin === '2026-01-15')!
    const mayo = groups.find(g => g.etaMin === '2026-05-20')!
    expect(enero.ops.map(x => x.ref)).toEqual(['ENE1', 'ENE2'])
    expect(mayo.ops.map(x => x.ref)).toEqual(['MAY1'])
  })

  it('buques distintos nunca se mezclan aunque compartan ETA', () => {
    const groups = groupByVoyage([
      o('TIGER GAUCHO', '2026-07-10', 'T1'),
      o('ONE STRENGTH', '2026-07-10', 'O1'),
    ])
    expect(groups).toHaveLength(2)
  })

  it('normaliza el nombre del buque (mayúsculas/espacios): "Maersk  San Lazaro" = "MAERSK SAN LAZARO"', () => {
    const groups = groupByVoyage([
      o('Maersk  San Lazaro', '2026-07-10', 'A1'),
      o('MAERSK SAN LAZARO ', '2026-07-11', 'A2'),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].ops).toHaveLength(2)
  })

  it('cargas sin ETA (vacía o no-ISO tipo "CONFIRMAR") → grupo aparte "sin ETA" del buque', () => {
    const groups = groupByVoyage([
      o('EVER FAR', '2026-07-05', 'A1'),
      o('EVER FAR', '', 'A2'),
      o('EVER FAR', 'CONFIRMAR', 'A3'),
    ])
    expect(groups).toHaveLength(2)
    const sinEta = groups.find(g => g.sinEta)!
    expect(sinEta.ops.map(x => x.ref).sort()).toEqual(['A2', 'A3'])
    expect(groups.find(g => !g.sinEta)!.ops.map(x => x.ref)).toEqual(['A1'])
  })

  it('cargas sin buque se ignoran', () => {
    const groups = groupByVoyage([o('', '2026-07-05', 'A1'), o('  ', '2026-07-06', 'A2')])
    expect(groups).toHaveLength(0)
  })

  it(`la ventana es entre cargas CONSECUTIVAS (${VOYAGE_WINDOW_DAYS}d): gap mayor corta el viaje`, () => {
    const gap = VOYAGE_WINDOW_DAYS + 5
    const d1 = '2026-03-01'
    const d2 = new Date(2026, 2, 1 + gap).toISOString().slice(0, 10)
    const groups = groupByVoyage([o('MSC INSA', d1, 'A1'), o('MSC INSA', d2, 'A2')])
    expect(groups).toHaveLength(2)
  })

  it('ordena los grupos por ETA ascendente (sin-ETA al final)', () => {
    const groups = groupByVoyage([
      o('B2', '2026-08-01', 'X2'),
      o('B1', '2026-07-01', 'X1'),
      o('B3', '', 'X3'),
    ])
    expect(groups.map(g => g.etaMin)).toEqual(['2026-07-01', '2026-08-01', ''])
  })
})

describe('buildEtaShiftPatch — cambiar la ETA del viaje sin romper nada', () => {
  const rec = (over: Partial<OperativasRecord>): OperativasRecord => ({
    REF: 'A1', TLX: '', DEPOSITO: 'GODILCO', ETA_OP: '2026-07-10', SALIDA: '2026-07-15',
    ETA_FISC: '2026-07-20', LIBRE: '2026-07-25', OPERATIVA: 'TRASIEGO', CNTR_OP: 'AAAA1111111',
    PKGS: 10, KG: 500, M3: 5, DESCRIPCION: 'BICIS', FISCAL: 'ZP RAFAELA', DESCARGA: '',
    DEV: 'STL', CLIENTE_OP: 'PERETTI', TIPO: '40HC', WOOD: '', TRANSPORTE: '', HORARIO: '', LUGAR_SALIDA: '',
    ...over,
  })

  it('setea la columna eta Y propaga ETA_OP a todos los contenedores, preservando el resto', () => {
    const patch = buildEtaShiftPatch(
      { eta: '2026-07-10', operativas: [rec({}), rec({ CNTR_OP: 'BBBB2222222', KG: 800 })] },
      '2026-07-18',
    )
    expect(patch.eta).toBe('2026-07-18')
    const ops = patch.operativas as OperativasRecord[]
    expect(ops).toHaveLength(2)
    expect(ops.every(r => r.ETA_OP === '2026-07-18')).toBe(true)
    // Nada más se toca: salida, fiscal, LIBRE, kg… intactos
    expect(ops[0].SALIDA).toBe('2026-07-15')
    expect(ops[0].ETA_FISC).toBe('2026-07-20')
    expect(ops[0].LIBRE).toBe('2026-07-25')
    expect(ops[1].KG).toBe(800)
    expect(ops[1].CNTR_OP).toBe('BBBB2222222')
  })

  it('sin array operativas → patch solo de la columna eta', () => {
    const patch = buildEtaShiftPatch({ eta: '2026-07-10' }, '2026-07-18')
    expect(patch).toEqual({ eta: '2026-07-18' })
  })
})
