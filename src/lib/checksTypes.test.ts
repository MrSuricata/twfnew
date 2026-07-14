import { describe, expect, it } from 'vitest'
import {
  CHECK_STEPS,
  buildChecksUniverse,
  checksProgress,
  isPorUruguay,
  mergeChecksSteps,
  nextPendingStep,
  stepsForOperativa,
  avisoForCntr,
  avisoAggregate,
  buildAvisoCntrsMap,
  isAvisoStep,
  type RefCheckStep,
  type RefCheckSteps,
} from './checksTypes'
import type { UnifiedOperation } from './operationsTypes'

// 03/07/2026 — fecha fija para que los tests no dependan del reloj.
const TODAY = new Date(2026, 6, 3)

const mkOp = (over: Partial<UnifiedOperation> = {}): UnifiedOperation => ({
  uid: 'u1', ref: 'A7600', clientRef: '', mode: 'fcl', source: 'db', dbId: 'id1',
  readOnly: false, operatorId: null, cliente: 'PERETTI', shipper: '', agente: '',
  incoterm: '', tlx: '', deposito: 'GODILCO', origin: '', paisOrigen: '', etd: '', eta: '2026-07-10',
  salida: '', etaFisc: '', libre: '2026-07-20', operativa: 'TRASIEGO', cntr: '',
  docNumber: '', buque: '', linea: '', camion: '', pkgs: 0, kg: 0, m3: 0,
  descripcion: '', fiscal: '', dischargePort: 'MONTEVIDEO', pais: 'UY', destPort: '',
  descarga: '', desconsol: '', entregaPlanta: false, dev: '', despacho: '',
  tipo: '40HC', terminal: '', n: 1, wood: false, noApilable: false, oog: false,
  imo: false, transporte: '', seguimiento: '', seguro: false, certi: false,
  impresa: false, archived: false, status: '',
  ...over,
})

// Los 4 checks documentarios de Brian (13/07/2026), en su orden.
const DOC_KEYS = ['bl_entregado', 'carta_entregada', 'docs_transporte', 'docs_deposito']

describe('stepsForOperativa', () => {
  it('siempre son los 4 checks documentarios, para cualquier operativa', () => {
    for (const operativa of ['TRASIEGO', 'CONTENEDOR', 'CARGA A PISO', '', undefined]) {
      expect(stepsForOperativa(operativa).map(s => s.key)).toEqual(DOC_KEYS)
    }
  })

  it('los avisos de HOY están en CHECK_STEPS (con flag) pero NO en la pestaña', () => {
    const keys = new Set(CHECK_STEPS.map(s => s.key))
    expect(keys.has('aviso_salida')).toBe(true)
    expect(keys.has('cruce_frontera')).toBe(true)
    expect(keys.has('arribo_fiscal')).toBe(true)
    const visibles = stepsForOperativa('TRASIEGO').map(s => s.key)
    expect(visibles).not.toContain('aviso_salida')
    expect(visibles).not.toContain('cruce_frontera')
    expect(visibles).not.toContain('arribo_fiscal')
  })
})

describe('checksProgress', () => {
  it('cuenta hechos sobre los 4 checks (la operativa ya no cambia el total)', () => {
    const steps: RefCheckSteps = {
      bl_entregado: { done: true, date: '2026-06-01' },
      docs_deposito: { done: true, date: '2026-06-20' },
    }
    expect(checksProgress(steps, 'TRASIEGO')).toEqual({ done: 2, total: 4 })
    expect(checksProgress(steps, 'CONTENEDOR')).toEqual({ done: 2, total: 4 })
    expect(checksProgress({}, '')).toEqual({ done: 0, total: 4 })
  })

  it('los avisos marcados NO suman al progreso de la pestaña', () => {
    const steps: RefCheckSteps = {
      aviso_salida: { done: true },
      cruce_frontera: { done: true },
      carta_entregada: { done: true },
    }
    expect(checksProgress(steps, '')).toEqual({ done: 1, total: 4 })
  })

  it('las keys del checklist viejo que queden en el jsonb se ignoran', () => {
    const legacy = {
      salida_origen: { done: true },
      pagos_liberacion: { done: true },
      bl_entregado: { done: true },
    } as unknown as RefCheckSteps
    expect(checksProgress(legacy, 'TRASIEGO')).toEqual({ done: 1, total: 4 })
  })
})

describe('mergeChecksSteps', () => {
  it('mergea el patch parcial sin pisar los pasos no tocados', () => {
    const base: RefCheckSteps = {
      bl_entregado: { done: true, date: '2026-06-01', by: 'brian@twf.uy' },
    }
    const out = mergeChecksSteps(base, { carta_entregada: { done: true, date: '2026-06-28', by: 'diego' } })
    expect(out.bl_entregado).toEqual({ done: true, date: '2026-06-01', by: 'brian@twf.uy' })
    expect(out.carta_entregada?.date).toBe('2026-06-28')
    // Reemplaza solo la clave tocada (edición de fecha)
    const out2 = mergeChecksSteps(out, { carta_entregada: { done: true, date: '2026-06-29', by: 'diego' } })
    expect(out2.carta_entregada?.date).toBe('2026-06-29')
    expect(Object.keys(out2)).toHaveLength(2)
  })

  it('done=false elimina el paso (vuelve a pendiente)', () => {
    const base: RefCheckSteps = {
      bl_entregado: { done: true, date: '2026-06-01' },
      docs_transporte: { done: true, date: '2026-06-28' },
    }
    const out = mergeChecksSteps(base, { bl_entregado: { done: false } })
    expect(out.bl_entregado).toBeUndefined()
    expect(out.docs_transporte?.done).toBe(true)
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
  it('sugiere el primer check sin marcar, en el orden de Brian', () => {
    expect(nextPendingStep({}, '')).toBe('bl_entregado')
    expect(nextPendingStep({ bl_entregado: { done: true } }, '')).toBe('carta_entregada')
    expect(nextPendingStep({
      bl_entregado: { done: true },
      carta_entregada: { done: true },
      docs_transporte: { done: true },
    }, '')).toBe('docs_deposito')
  })

  it('devuelve null cuando los 4 están hechos', () => {
    const all: RefCheckSteps = {}
    for (const s of stepsForOperativa('')) all[s.key] = { done: true }
    expect(nextPendingStep(all, '')).toBeNull()
  })
})

// ── Avisos por contenedor (salida/frontera/fiscal — pestaña HOY) ────────
describe('avisos por contenedor', () => {
  const CNTRS = ['ABCU1111111', 'ABCU2222222']

  it('isAvisoStep: solo salida/frontera/fiscal son por contenedor', () => {
    expect(isAvisoStep('aviso_salida')).toBe(true)
    expect(isAvisoStep('cruce_frontera')).toBe(true)
    expect(isAvisoStep('arribo_fiscal')).toBe(true)
    expect(isAvisoStep('bl_entregado')).toBe(false)
    expect(isAvisoStep('carta_entregada')).toBe(false)
    expect(isAvisoStep('docs_transporte')).toBe(false)
    expect(isAvisoStep('docs_deposito')).toBe(false)
  })

  it('avisoForCntr: con cntrs, cada contenedor es independiente', () => {
    const step: RefCheckStep = { done: true, cntrs: { ABCU1111111: { done: true, date: '2026-07-06', by: 'brian' } } }
    expect(avisoForCntr(step, 'ABCU1111111')?.done).toBe(true)
    expect(avisoForCntr(step, 'ABCU2222222')).toBeUndefined() // no está en el mapa → NO avisado
  })

  it('avisoForCntr: contenedor con {done:false} explícito NO está avisado', () => {
    const step: RefCheckStep = { done: true, cntrs: { ABCU1111111: { done: false } } }
    expect(avisoForCntr(step, 'ABCU1111111')).toBeUndefined()
  })

  it('avisoForCntr: fila legacy (sin cntrs) — el done aplica a TODOS los contenedores', () => {
    const legacy: RefCheckStep = { done: true, date: '2026-07-01', by: 'joaco' }
    expect(avisoForCntr(legacy, 'ABCU1111111')?.done).toBe(true)
    expect(avisoForCntr(legacy, 'CUALQUIERA')?.done).toBe(true)
  })

  it('avisoAggregate: cuenta avisados sobre la lista de contenedores', () => {
    const step: RefCheckStep = { done: true, cntrs: { ABCU1111111: { done: true } } }
    expect(avisoAggregate(step, CNTRS)).toEqual({ done: 1, total: 2 })
    const both: RefCheckStep = { done: true, cntrs: { ABCU1111111: { done: true }, ABCU2222222: { done: true } } }
    expect(avisoAggregate(both, CNTRS)).toEqual({ done: 2, total: 2 })
    expect(avisoAggregate(undefined, CNTRS)).toEqual({ done: 0, total: 2 })
  })

  it('buildAvisoCntrsMap: siembra todos los contenedores y aplica el toggle a UNO', () => {
    // Estado previo: legacy nivel-ref → ambos avisados
    const legacy: RefCheckStep = { done: true, date: '2026-07-01', by: 'joaco' }
    // Marco NO avisado el contenedor 2; el 1 debe conservarse avisado (no se pierde)
    const map = buildAvisoCntrsMap(legacy, CNTRS, 'ABCU2222222', false, { date: '2026-07-06', by: 'brian' })
    expect(map['ABCU1111111'].done).toBe(true)  // sembrado desde legacy
    expect(map['ABCU2222222'].done).toBe(false) // el toggle
  })

  it('buildAvisoCntrsMap: target=null marca TODOS (bulk)', () => {
    const map = buildAvisoCntrsMap(undefined, CNTRS, null, true, { date: '2026-07-06', by: 'brian' })
    expect(map['ABCU1111111'].done).toBe(true)
    expect(map['ABCU2222222'].done).toBe(true)
  })
})
