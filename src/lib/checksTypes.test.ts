import { describe, expect, it } from 'vitest'
import {
  CHECK_STEPS,
  buildChecksUniverse,
  checksProgress,
  isPorUruguay,
  mergeChecksSteps,
  nextPendingStep,
  stepsForOperativa,
  type RefCheckSteps,
} from './checksTypes'
import type { UnifiedOperation } from './operationsTypes'

// 03/07/2026 — fecha fija para que los tests no dependan del reloj.
const TODAY = new Date(2026, 6, 3)

const mkOp = (over: Partial<UnifiedOperation> = {}): UnifiedOperation => ({
  uid: 'u1', ref: 'A7600', clientRef: '', mode: 'fcl', source: 'db', dbId: 'id1',
  readOnly: false, operatorId: null, cliente: 'PERETTI', shipper: '', agente: '',
  incoterm: '', tlx: '', deposito: 'GODILCO', origin: '', etd: '', eta: '2026-07-10',
  salida: '', etaFisc: '', libre: '2026-07-20', operativa: 'TRASIEGO', cntr: '',
  docNumber: '', buque: '', linea: '', camion: '', pkgs: 0, kg: 0, m3: 0,
  descripcion: '', fiscal: '', dischargePort: 'MONTEVIDEO', pais: 'UY', destPort: '',
  descarga: '', desconsol: '', entregaPlanta: false, dev: '', despacho: '',
  tipo: '40HC', terminal: '', n: 1, wood: false, noApilable: false, oog: false,
  imo: false, transporte: '', seguimiento: '', seguro: false, certi: false,
  impresa: false, archived: false, status: '',
  ...over,
})

describe('stepsForOperativa', () => {
  it('TRASIEGO muestra 11 pasos: los 9 comunes + los 2 de trasiego intercalados', () => {
    const keys = stepsForOperativa('TRASIEGO').map(s => s.key)
    expect(keys).toEqual([
      'salida_origen', 'arribo_buque', 'carta_resp', 'bl_naviera', 'pagos_liberacion',
      'traslado_deposito', 'coord_trasiego',
      'fotos_carga', 'aviso_salida', 'cruce_frontera', 'arribo_fiscal',
    ])
    // Los pasos solo-CONTENEDOR no aparecen en trasiego
    expect(keys).not.toContain('confirmar_dev_arg')
    expect(keys).not.toContain('transferir_cntr')
  })

  it('CONTENEDOR muestra 13 pasos: confirmar dev AR tras liberar + transferencia/drop off/gate in al final', () => {
    const keys = stepsForOperativa('CONTENEDOR').map(s => s.key)
    expect(keys).toEqual([
      'salida_origen', 'arribo_buque', 'carta_resp', 'bl_naviera', 'pagos_liberacion',
      'confirmar_dev_arg',
      'fotos_carga', 'aviso_salida', 'cruce_frontera', 'arribo_fiscal',
      'transferir_cntr', 'pagar_dropoff', 'pagar_gatein',
    ])
    expect(keys).not.toContain('traslado_deposito')
    expect(keys).not.toContain('coord_trasiego')
  })

  it('resto de operativas (CARGA A PISO / vacío) → solo los 9 pasos comunes', () => {
    for (const operativa of ['CARGA A PISO', '', undefined]) {
      const keys = stepsForOperativa(operativa).map(s => s.key)
      expect(keys).toHaveLength(9)
      expect(keys).toEqual(CHECK_STEPS.filter(s => !s.solo).map(s => s.key))
    }
  })
})

describe('checksProgress', () => {
  it('cuenta hechos sobre el total visible según la operativa (11 / 13 / 9)', () => {
    const steps: RefCheckSteps = {
      salida_origen: { done: true, date: '2026-06-01' },
      coord_trasiego: { done: true, date: '2026-06-20' },
    }
    expect(checksProgress(steps, 'TRASIEGO')).toEqual({ done: 2, total: 11 })
    // En CONTENEDOR el paso de trasiego marcado NO cuenta (no es visible)
    expect(checksProgress(steps, 'CONTENEDOR')).toEqual({ done: 1, total: 13 })
    expect(checksProgress({}, '')).toEqual({ done: 0, total: 9 })
  })

  it('los pasos solo-CONTENEDOR cuentan en CONTENEDOR pero no en TRASIEGO', () => {
    const steps: RefCheckSteps = {
      confirmar_dev_arg: { done: true, date: '2026-06-25' },
      pagar_gatein: { done: true, date: '2026-07-01' },
    }
    expect(checksProgress(steps, 'CONTENEDOR')).toEqual({ done: 2, total: 13 })
    expect(checksProgress(steps, 'TRASIEGO')).toEqual({ done: 0, total: 11 })
  })
})

describe('mergeChecksSteps', () => {
  it('mergea el patch parcial sin pisar los pasos no tocados', () => {
    const base: RefCheckSteps = {
      salida_origen: { done: true, date: '2026-06-01', by: 'brian@twf.uy' },
    }
    const out = mergeChecksSteps(base, { arribo_buque: { done: true, date: '2026-06-28', by: 'diego' } })
    expect(out.salida_origen).toEqual({ done: true, date: '2026-06-01', by: 'brian@twf.uy' })
    expect(out.arribo_buque?.date).toBe('2026-06-28')
    // Reemplaza solo la clave tocada (edición de fecha)
    const out2 = mergeChecksSteps(out, { arribo_buque: { done: true, date: '2026-06-29', by: 'diego' } })
    expect(out2.arribo_buque?.date).toBe('2026-06-29')
    expect(Object.keys(out2)).toHaveLength(2)
  })

  it('done=false elimina el paso (vuelve a pendiente)', () => {
    const base: RefCheckSteps = {
      salida_origen: { done: true, date: '2026-06-01' },
      arribo_buque: { done: true, date: '2026-06-28' },
    }
    const out = mergeChecksSteps(base, { salida_origen: { done: false } })
    expect(out.salida_origen).toBeUndefined()
    expect(out.arribo_buque?.done).toBe(true)
  })
})

describe('isPorUruguay', () => {
  it("solo PAIS='UY' (POD Montevideo) cuenta como por Uruguay", () => {
    expect(isPorUruguay('UY')).toBe(true)
    expect(isPorUruguay(' uy ')).toBe(true)
    expect(isPorUruguay('CL')).toBe(false)      // San Antonio/Valparaíso directo
    expect(isPorUruguay('AR')).toBe(false)      // Buenos Aires directo, sin tocar MVD
    expect(isPorUruguay('OTRO')).toBe(false)
    expect(isPorUruguay('')).toBe(false)
    expect(isPorUruguay(undefined)).toBe(false)
  })
})

describe('buildChecksUniverse', () => {
  it('filtra: solo FCL activas por Uruguay, sin archivadas ni devueltas', () => {
    const ops = [
      mkOp({ uid: 'a', ref: 'A7601' }),                                          // ✓ UY activa
      mkOp({ uid: 'b', ref: 'A7602', pais: 'CL' }),                              // ✗ Chile directo
      mkOp({ uid: 'c', ref: 'A7603', pais: 'AR' }),                              // ✗ Buenos Aires directo
      mkOp({ uid: 'd', ref: 'A7604', archived: true }),                          // ✗ archivada
      mkOp({ uid: 'e', ref: 'A7605', libre: 'DEVUELTO', etaFisc: '' }),          // ✗ DEVUELTO (vive en LIBRE) + sin tramo fiscal
      mkOp({ uid: 'f', ref: 'A7606', mode: 'lcl' }),                             // ✗ no FCL
    ]
    const out = buildChecksUniverse(ops, TODAY)
    expect(out.map(o => o.ref)).toEqual(['A7601'])
  })

  it('deduplica por ref (gana la fila DB) y ordena por ETA asc con sin-ETA al final', () => {
    const ops = [
      mkOp({ uid: 'cache', ref: 'A7610', source: 'fcl', cliente: 'VIEJA', eta: '2026-07-05' }),
      mkOp({ uid: 'db', ref: 'A7610', source: 'db', cliente: 'NUEVA', eta: '2026-07-05' }),
      mkOp({ uid: 'x', ref: 'A7611', eta: '2026-07-01' }),
      mkOp({ uid: 'y', ref: 'A7612', eta: '' }),
    ]
    const out = buildChecksUniverse(ops, TODAY)
    expect(out.map(o => o.ref)).toEqual(['A7611', 'A7610', 'A7612'])
    expect(out.find(o => o.ref === 'A7610')?.cliente).toBe('NUEVA')
  })
})

describe('nextPendingStep', () => {
  it('sugiere el primer paso visible sin marcar según la operativa', () => {
    const steps: RefCheckSteps = {
      salida_origen: { done: true },
      arribo_buque: { done: true },
      carta_resp: { done: true },
      bl_naviera: { done: true },
      pagos_liberacion: { done: true },
    }
    expect(nextPendingStep(steps, 'TRASIEGO')).toBe('traslado_deposito')
    // En CONTENEDOR lo que sigue a la liberación es confirmar la devolución en AR
    expect(nextPendingStep(steps, 'CONTENEDOR')).toBe('confirmar_dev_arg')
    expect(nextPendingStep(steps, 'CARGA A PISO')).toBe('fotos_carga')
    expect(nextPendingStep({}, 'TRASIEGO')).toBe('salida_origen')
  })

  it('devuelve null cuando todos los pasos visibles están hechos; los post-arribo cierran CONTENEDOR', () => {
    const all: RefCheckSteps = {}
    for (const s of stepsForOperativa('CONTENEDOR')) all[s.key] = { done: true }
    expect(nextPendingStep(all, 'CONTENEDOR')).toBeNull()
    // Pero en TRASIEGO faltan los 2 pasos propios
    expect(nextPendingStep(all, 'TRASIEGO')).toBe('traslado_deposito')
    // Y si en CONTENEDOR falta solo el gate in, es lo próximo
    const casiTodo = { ...all }
    delete casiTodo.pagar_gatein
    expect(nextPendingStep(casiTodo, 'CONTENEDOR')).toBe('pagar_gatein')
  })
})
