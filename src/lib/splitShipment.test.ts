import { describe, it, expect } from 'vitest'
import { planSplit, validateSplit } from './splitShipment'
import type { DbShipment } from './operationsTypes'
import type { OperativasRecord } from './shipmentTypes'

const op = (over: Partial<OperativasRecord> = {}): OperativasRecord =>
  ({
    REF: 'A9000', CNTR_OP: 'MSKU1111111', OPERATIVA: 'TRASIEGO', SALIDA: '',
    ETA_FISC: '', LIBRE: '2026-08-01', PKGS: 10, KG: 1000, M3: 5,
    DESCRIPCION: 'BICICLETAS', TIPO: '40HC',
    ...over,
  } as OperativasRecord)

const base = (over: Partial<DbShipment> = {}): DbShipment =>
  ({
    id: 'shp-1', ref: 'A9000', mode: 'fcl', source: 'web', archived: false,
    cliente: 'PERETTI', shipper: 'SHZ TRADING', linea: 'ONE', eta: '2026-08-10',
    contenedor: '', pkgs: 0, kg: 0, m3: 0, n_cntr: 0, origin_ref: '',
    doc_number: 'ONEY123', telex: true,
    ...over,
  } as DbShipment)

const CUATRO = 'MSKU1111111, MSKU2222222, MSKU3333333, MSKU4444444'

describe('validateSplit', () => {
  it('exige ref B distinta y algo para B', () => {
    const o = base({ contenedor: CUATRO })
    expect(validateSplit({ original: o, refB: '', cntrsB: ['MSKU1111111'] })).toMatch(/ref/i)
    expect(validateSplit({ original: o, refB: 'a9000', cntrsB: ['MSKU1111111'] })).toMatch(/igual/i)
    expect(validateSplit({ original: o, refB: 'A9000 B', cntrsB: [] })).toMatch(/al menos un contenedor/i)
    expect(validateSplit({ original: o, refB: 'A9000 B', cntrsB: ['MSKU1111111'] })).toBeNull()
  })

  it('el compartido no puede irse entero a B a la vez, y debe llevar algo', () => {
    const o = base({ contenedor: CUATRO })
    expect(validateSplit({
      original: o, refB: 'A9000 B', cntrsB: ['MSKU1111111'],
      parcial: { cntr: 'MSKU1111111', pkgsB: 1, kgB: 0, m3B: 0 },
    })).toMatch(/compartido/i)
    expect(validateSplit({
      original: o, refB: 'A9000 B', cntrsB: [],
      parcial: { cntr: 'MSKU2222222', pkgsB: 0, kgB: 0, m3B: 0 },
    })).toMatch(/bultos/i)
  })

  it('sin contenedores (LCL) exige totales para B', () => {
    const o = base({ mode: 'lcl', contenedor: '', pkgs: 10, kg: 1000, m3: 5 })
    expect(validateSplit({ original: o, refB: 'E10 B', cntrsB: [] })).toMatch(/lleva/i)
    expect(validateSplit({ original: o, refB: 'E10 B', cntrsB: [], totalesB: { pkgs: 4, kg: 400, m3: 2 } })).toBeNull()
  })
})

describe('planSplit — contenedores enteros (2/2) con detalle por contenedor', () => {
  const original = base({
    contenedor: CUATRO,
    n_cntr: 4,
    pkgs: 40, kg: 4000, m3: 20,
    operativas: [
      op({ CNTR_OP: 'MSKU1111111' }),
      op({ CNTR_OP: 'MSKU2222222' }),
      op({ CNTR_OP: 'MSKU3333333' }),
      op({ CNTR_OP: 'MSKU4444444' }),
    ],
  })
  const plan = planSplit({ original, refB: 'A9000 B', cntrsB: ['MSKU3333333', 'MSKU4444444'] })

  it('reparte contenedores, totales y operativas', () => {
    expect(plan.patchA.contenedor).toBe('MSKU1111111, MSKU2222222')
    expect(plan.patchA.n_cntr).toBe(2)
    expect(plan.patchA.pkgs).toBe(20)
    expect(plan.rowB.contenedor).toBe('MSKU3333333, MSKU4444444')
    expect(plan.rowB.n_cntr).toBe(2)
    expect(plan.rowB.kg).toBe(2000)
    expect((plan.patchA.operativas as OperativasRecord[]).map(o => o.CNTR_OP)).toEqual(['MSKU1111111', 'MSKU2222222'])
    expect((plan.rowB.operativas as OperativasRecord[]).map(o => o.CNTR_OP)).toEqual(['MSKU3333333', 'MSKU4444444'])
  })

  it('B hereda viaje/documental y la ref madre queda en origin_ref de ambas', () => {
    expect(plan.rowB.ref).toBe('A9000 B')
    expect(plan.rowB.origin_ref).toBe('A9000')
    expect(plan.patchA.origin_ref).toBe('A9000')
    expect(plan.rowB.linea).toBe('ONE')
    expect(plan.rowB.doc_number).toBe('ONEY123')
    expect(plan.rowB.telex).toBe(true)
    expect((plan.rowB.operativas as OperativasRecord[])[0].REF).toBe('A9000 B')
  })
})

describe('planSplit — las fechas viajan con el contenedor', () => {
  it('B hereda las fechas de SUS contenedores (registro entero) y el rollup colapsado', () => {
    const original = base({
      contenedor: 'MSKU1111111, MSKU2222222',
      n_cntr: 2,
      operativas: [
        op({ CNTR_OP: 'MSKU1111111', SALIDA: '2026-08-05', ETA_FISC: '2026-08-08', LIBRE: '2026-08-20', DEPOSITO: 'GODILCO', TRANSPORTE: 'OLAVERRY' }),
        op({ CNTR_OP: 'MSKU2222222', SALIDA: '2026-08-12', ETA_FISC: '2026-08-15', LIBRE: '2026-08-25', DEPOSITO: 'GODILCO', TRANSPORTE: 'TRANSCAL' }),
      ],
    })
    const plan = planSplit({ original, refB: 'A9000 B', cntrsB: ['MSKU2222222'] })
    const bOp = (plan.rowB.operativas as OperativasRecord[])[0]
    // El registro del contenedor pasa ENTERO a B: fecha de carga/salida, fiscal, libre, depósito, transporte.
    expect(bOp.SALIDA).toBe('2026-08-12')
    expect(bOp.ETA_FISC).toBe('2026-08-15')
    expect(bOp.LIBRE).toBe('2026-08-25')
    expect(bOp.TRANSPORTE).toBe('TRANSCAL')
    // Y las columnas colapsadas de la fila B quedan coherentes desde el alta.
    expect(plan.rowB.salida).toBe('2026-08-12')
    expect(plan.rowB.eta_fiscal).toBe('2026-08-15')
    expect(plan.rowB.deposito).toBe('GODILCO')
    // La parte A conserva las suyas.
    const aOp = (plan.patchA.operativas as OperativasRecord[])[0]
    expect(aOp.SALIDA).toBe('2026-08-05')
    expect(plan.patchA.contenedor).toBe('MSKU1111111')
  })
})

describe('planSplit — contenedor compartido (uno entero + parte de otro)', () => {
  const original = base({
    contenedor: 'MSKU1111111, MSKU2222222',
    n_cntr: 2,
    operativas: [
      op({ CNTR_OP: 'MSKU1111111', PKGS: 10, KG: 1000, M3: 5 }),
      op({ CNTR_OP: 'MSKU2222222', PKGS: 20, KG: 2000, M3: 10 }),
    ],
  })
  const plan = planSplit({
    original, refB: 'A9000 B',
    cntrsB: ['MSKU1111111'],
    parcial: { cntr: 'MSKU2222222', pkgsB: 5, kgB: 600, m3B: 3 },
  })

  it('el compartido queda en A con lo que resta y viaja en B con lo que se lleva', () => {
    expect(plan.patchA.contenedor).toBe('MSKU2222222')
    expect(plan.rowB.contenedor).toBe('MSKU1111111, MSKU2222222')
    expect(plan.rowB.n_cntr).toBe(2)
    const a = (plan.patchA.operativas as OperativasRecord[])[0]
    expect([a.PKGS, a.KG, a.M3]).toEqual([15, 1400, 7])
    const bShared = (plan.rowB.operativas as OperativasRecord[]).find(o => o.CNTR_OP === 'MSKU2222222')!
    expect([bShared.PKGS, bShared.KG, bShared.M3]).toEqual([5, 600, 3])
    expect(plan.resumen.b.kg).toBe(1600)   // cntr entero (1000) + parte (600)
    expect(plan.resumen.a.kg).toBe(1400)
  })

  it('clampa a 0 si la parte pedida supera el contenido', () => {
    const p2 = planSplit({
      original, refB: 'A9000 B', cntrsB: [],
      parcial: { cntr: 'MSKU2222222', pkgsB: 99, kgB: 9999, m3B: 99 },
    })
    const a = (p2.patchA.operativas as OperativasRecord[]).find(o => o.CNTR_OP === 'MSKU2222222')!
    expect([a.PKGS, a.KG, a.M3]).toEqual([0, 0, 0])
  })
})

describe('planSplit — sin detalle por contenedor (LCL / FCL sin operativas)', () => {
  it('B se lleva lo tipeado y A el resto, nunca negativo', () => {
    const original = base({ mode: 'lcl', contenedor: '', pkgs: 10, kg: 1000, m3: 6 })
    const plan = planSplit({ original, refB: 'E10 B', cntrsB: [], totalesB: { pkgs: 4, kg: 700, m3: 2.5 } })
    expect([plan.patchA.pkgs, plan.patchA.kg, plan.patchA.m3]).toEqual([6, 300, 3.5])
    expect([plan.rowB.pkgs, plan.rowB.kg, plan.rowB.m3]).toEqual([4, 700, 2.5])
    const clamped = planSplit({ original, refB: 'E10 B', cntrsB: [], totalesB: { pkgs: 99, kg: 9999, m3: 99 } })
    expect([clamped.patchA.pkgs, clamped.patchA.kg, clamped.patchA.m3]).toEqual([0, 0, 0])
  })

  it('si la original ya era un split, origin_ref se conserva (no se re-anida)', () => {
    const original = base({ ref: 'A9000 A', origin_ref: 'A9000', contenedor: '', pkgs: 10, kg: 100, m3: 1 })
    const plan = planSplit({ original, refB: 'A9000 C', cntrsB: [], totalesB: { pkgs: 1, kg: 10, m3: 0.1 } })
    expect(plan.rowB.origin_ref).toBe('A9000')
    expect(plan.patchA.origin_ref).toBe('A9000')
  })
})
