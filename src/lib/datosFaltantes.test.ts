import { describe, it, expect } from 'vitest'
import { datosFaltantes, faltantesUrgentes, resumenFaltantes, type CargaCampos } from './datosFaltantes'

const HOY = new Date(2026, 7, 17) // lunes 17/08/2026

// Carga completa en origen lejano: no debe nada todavía.
function carga(c: Partial<CargaCampos> = {}): CargaCampos {
  return {
    mode: 'fcl', pais: 'UY', cliente: 'PERETTI', eta: '2026-10-20', etd: '',
    buque: '', docNumber: '', cntr: '', pkgs: 0, kg: 0, m3: 0, agente: '',
    deposito: '', operativa: '', transporte: '', fiscal: '', salida: '', ...c,
  }
}

describe('datosFaltantes — exigencia por etapa', () => {
  it('en origen lejano con lo básico completo no debe nada', () => {
    expect(datosFaltantes(carga(), HOY)).toEqual([])
  })

  it('lo básico falta SIEMPRE: cliente, país, ETA', () => {
    const f = datosFaltantes(carga({ cliente: '', pais: '', eta: '' }), HOY)
    expect(f.map(x => x.campo)).toEqual(['cliente', 'pais', 'eta'])
  })

  it('embarcada (ETD pasó) exige buque, BL y contenedor', () => {
    const f = datosFaltantes(carga({ etd: '2026-08-10' }), HOY)
    expect(f.map(x => x.campo)).toEqual(['buque', 'docNumber', 'cntr'])
  })

  it('LCL embarcada no pide contenedor propio', () => {
    const f = datosFaltantes(carga({ mode: 'lcl', etd: '2026-08-10' }), HOY)
    expect(f.map(x => x.campo)).toEqual(['buque', 'docNumber'])
  })

  it('a 14 días de llegar exige bultos/kg/m³/agente aunque no tenga ETD', () => {
    const f = datosFaltantes(carga({ eta: '2026-08-31' }), HOY)
    expect(f.map(x => x.campo)).toEqual(
      ['buque', 'docNumber', 'cntr', 'pkgs', 'kg', 'm3', 'agente'])
  })

  it('a 7 días, por Uruguay, suma la coordinación completa', () => {
    const f = datosFaltantes(carga({ eta: '2026-08-22' }), HOY)
    expect(f.map(x => x.campo)).toContain('deposito')
    expect(f.map(x => x.campo)).toContain('transporte')
    expect(f.map(x => x.campo)).toContain('fiscal')
  })

  it('a 7 días por CHILE no pide la coordinación uruguaya', () => {
    const f = datosFaltantes(carga({ eta: '2026-08-22', pais: 'CL' }), HOY)
    expect(f.map(x => x.campo)).not.toContain('deposito')
    expect(f.map(x => x.campo)).not.toContain('transporte')
  })

  it('con todo cargado no molesta ni encima de la llegada', () => {
    const completa = carga({
      eta: '2026-08-19', etd: '2026-07-10', buque: 'MAERSK X 001W',
      docNumber: 'MAEU123', cntr: 'MSKU1234567', pkgs: 10, kg: 5000, m3: 20,
      agente: 'REPREMAR', deposito: 'GODILCO', operativa: 'TRASIEGO',
      transporte: 'TRANSCAL', fiscal: 'RAFAELA',
    })
    expect(datosFaltantes(completa, HOY)).toEqual([])
  })

  it('archivadas y no marítimas quedan afuera', () => {
    expect(datosFaltantes(carga({ archived: true, cliente: '' }), HOY)).toEqual([])
    expect(datosFaltantes(carga({ mode: 'air', cliente: '' }), HOY)).toEqual([])
  })
})

describe('faltantesUrgentes — la tarjeta de HOY', () => {
  it('solo llegan-pronto o llegadas sin salida, ordenadas por llegada', () => {
    const cargas = [
      { ...carga({ eta: '2026-08-22' }), ref: 'CERCA' },                       // en 5 días, incompleta
      { ...carga({ eta: '2026-09-30' }), ref: 'LEJOS' },                       // fuera de ventana
      { ...carga({ eta: '2026-08-15', salida: '' }), ref: 'LLEGADA' },         // llegó, sin salida
      { ...carga({ eta: '2026-08-15', salida: '2026-08-20' }), ref: 'COORDINADA' }, // llegó pero ya coordinada
    ]
    const out = faltantesUrgentes(cargas, HOY)
    expect(out.map(u => u.carga.ref)).toEqual(['LLEGADA', 'CERCA'])
    expect(out[0].diasAEta).toBe(-2)
  })

  it('una carga completa no aparece aunque llegue mañana', () => {
    const completa = {
      ...carga({
        eta: '2026-08-18', etd: '2026-07-10', buque: 'X 1W', docNumber: 'B',
        cntr: 'MSKU1234567', pkgs: 1, kg: 1, m3: 1, agente: 'REPREMAR',
        deposito: 'GODILCO', operativa: 'TRASIEGO', transporte: 'TRANSCAL', fiscal: 'RAFAELA',
      }), ref: 'OK',
    }
    expect(faltantesUrgentes([completa], HOY)).toEqual([])
  })
})

describe('resumenFaltantes', () => {
  it('arma la lista legible', () => {
    const f = datosFaltantes(carga({ eta: '2026-08-31' }), HOY)
    expect(resumenFaltantes(f)).toBe('Buque, BL, Contenedor, Bultos, Kg, M³, Agente')
  })
})
