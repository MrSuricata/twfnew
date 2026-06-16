import { describe, it, expect } from 'vitest'
import { resolveRecord, buildNextOperativas } from './ContainerDatesSection'
import type { OperativasRecord } from '@/lib/shipmentTypes'
import type { UnifiedOperation } from '@/lib/operationsTypes'

// ── helpers ────────────────────────────────────────────────────────────────

const op = (cntr: string, operativas?: OperativasRecord[]): UnifiedOperation =>
  ({
    uid: 'test', ref: 'A7777', mode: 'fcl', source: 'db', readOnly: false,
    operatorId: null, cliente: 'PERETTI', shipper: '', agente: '', incoterm: '',
    tlx: '', deposito: 'GODILCO', origin: '', etd: '', eta: '2026-06-01',
    salida: '', etaFisc: '', libre: '', operativa: 'TRASIEGO', cntr,
    docNumber: '', buque: '', linea: '', camion: '', pkgs: 0, kg: 0, m3: 0,
    descripcion: '', fiscal: 'ZP RAFAELA', dischargePort: '', pais: 'AR',
    destPort: '', descarga: '', desconsol: '', entregaPlanta: false, dev: '',
    despacho: '', tipo: '40HC', terminal: 'MONTECON', n: 0, wood: false,
    noApilable: false, oog: false, imo: false, transporte: '', seguimiento: '',
    seguro: false, certi: false, impresa: false, archived: false, status: '',
    operativas,
  } as UnifiedOperation)

const record = (over: Partial<OperativasRecord>): OperativasRecord => ({
  REF: 'A7777', TLX: '', DEPOSITO: 'GODILCO', ETA_OP: '', SALIDA: '',
  ETA_FISC: '', LIBRE: '', OPERATIVA: '', CNTR_OP: '', PKGS: 10, KG: 500,
  M3: 5, DESCRIPCION: 'BICIS', FISCAL: 'ZP RAFAELA', DESCARGA: '2026-06-20',
  DEV: 'STL', CLIENTE_OP: 'PERETTI', TIPO: '40HC', WOOD: '', TRANSPORTE: '',
  HORARIO: '', LUGAR_SALIDA: '',
  ...over,
})

// ── resolveRecord ──────────────────────────────────────────────────────────

describe('resolveRecord — CNTR_OP-based matching', () => {
  it('matches by container number, not by array index', () => {
    // The cntr string has 3 containers; operativas only has 1 (the first one).
    // Editing container index 1 (BBBB2222222) must NOT return the first operativa.
    const cntrs = ['AAAA1111111', 'BBBB2222222', 'CCCC3333333']
    const existing = [
      record({ CNTR_OP: 'AAAA1111111', SALIDA: '2026-06-10', DESCARGA: '2026-06-12', DEV: 'TCP' }),
    ]
    const o = op('AAAA1111111, BBBB2222222, CCCC3333333', existing)

    // Index 0 → matched by CNTR_OP (not a blank)
    const r0 = resolveRecord(cntrs, existing, 0, o)
    expect(r0.SALIDA).toBe('2026-06-10')
    expect(r0.DESCARGA).toBe('2026-06-12')
    expect(r0.DEV).toBe('TCP')

    // Index 1 → no match by CNTR_OP → synthetic blank (NOT the AAAA op)
    const r1 = resolveRecord(cntrs, existing, 1, o)
    expect(r1.CNTR_OP).toBe('BBBB2222222')
    expect(r1.SALIDA).toBe('')
    expect(r1.DESCARGA).toBe('')
    expect(r1.DEV).toBe('')

    // Index 2 → no match → synthetic blank
    const r2 = resolveRecord(cntrs, existing, 2, o)
    expect(r2.CNTR_OP).toBe('CCCC3333333')
    expect(r2.SALIDA).toBe('')
  })

  it('finds by CNTR_OP regardless of order in existing[]', () => {
    const cntrs = ['AAAA1111111', 'BBBB2222222']
    const existing = [
      record({ CNTR_OP: 'BBBB2222222', SALIDA: '2026-06-15', KG: 800 }),
      record({ CNTR_OP: 'AAAA1111111', SALIDA: '2026-06-10', KG: 200 }),
    ]
    const o = op('AAAA1111111, BBBB2222222', existing)

    // Index 0 → should get AAAA (index 1 in existing), not BBBB (index 0)
    expect(resolveRecord(cntrs, existing, 0, o).CNTR_OP).toBe('AAAA1111111')
    expect(resolveRecord(cntrs, existing, 0, o).KG).toBe(200)
    expect(resolveRecord(cntrs, existing, 1, o).CNTR_OP).toBe('BBBB2222222')
    expect(resolveRecord(cntrs, existing, 1, o).KG).toBe(800)
  })
})

// ── buildNextOperativas — field preservation ───────────────────────────────

describe('buildNextOperativas — editing one container preserves sibling fields', () => {
  it('editing SALIDA on container 1 does NOT blank DESCARGA/DEV on container 0', () => {
    const cntrs = ['AAAA1111111', 'BBBB2222222']
    const existing = [
      record({ CNTR_OP: 'AAAA1111111', SALIDA: '2026-06-10', DESCARGA: '2026-06-12', DEV: 'TCP', KG: 500 }),
      record({ CNTR_OP: 'BBBB2222222', SALIDA: '',            DESCARGA: '2026-06-14', DEV: 'STL', KG: 400 }),
    ]
    const o = op('AAAA1111111, BBBB2222222', existing)

    const next = buildNextOperativas(cntrs, existing, o, 1, { SALIDA: '2026-06-18' })

    // Container 0: untouched — DESCARGA/DEV/KG must be preserved
    expect(next[0].CNTR_OP).toBe('AAAA1111111')
    expect(next[0].SALIDA).toBe('2026-06-10')
    expect(next[0].DESCARGA).toBe('2026-06-12')
    expect(next[0].DEV).toBe('TCP')
    expect(next[0].KG).toBe(500)

    // Container 1: SALIDA patched; DESCARGA/DEV/KG preserved
    expect(next[1].CNTR_OP).toBe('BBBB2222222')
    expect(next[1].SALIDA).toBe('2026-06-18')
    expect(next[1].DESCARGA).toBe('2026-06-14')
    expect(next[1].DEV).toBe('STL')
    expect(next[1].KG).toBe(400)
  })

  it('editing container 0 when operativas has fewer entries than cntrs does NOT clobber existing[0]', () => {
    // Simulates the backfill scenario: 3 containers in cntr string, only 1 operativa.
    const cntrs = ['AAAA1111111', 'BBBB2222222', 'CCCC3333333']
    const existing = [
      record({ CNTR_OP: 'AAAA1111111', SALIDA: '2026-06-10', DESCARGA: '2026-06-12', DEV: 'TCP', KG: 500 }),
    ]
    const o = op('AAAA1111111, BBBB2222222, CCCC3333333', existing)

    // Edit SALIDA of container at index 1 (BBBB)
    const next = buildNextOperativas(cntrs, existing, o, 1, { SALIDA: '2026-06-20' })

    // Container 0 (AAAA) must still have its original data
    expect(next[0].CNTR_OP).toBe('AAAA1111111')
    expect(next[0].SALIDA).toBe('2026-06-10')
    expect(next[0].DESCARGA).toBe('2026-06-12')
    expect(next[0].DEV).toBe('TCP')
    expect(next[0].KG).toBe(500)

    // Container 1 (BBBB) new entry with only SALIDA set
    expect(next[1].CNTR_OP).toBe('BBBB2222222')
    expect(next[1].SALIDA).toBe('2026-06-20')
    expect(next[1].DESCARGA).toBe('')

    // Container 2 (CCCC) synthetic blank, unchanged
    expect(next[2].CNTR_OP).toBe('CCCC3333333')
    expect(next[2].SALIDA).toBe('')
  })

  it('patching only LUGAR_SALIDA preserves all date fields', () => {
    const cntrs = ['AAAA1111111']
    const existing = [
      record({ CNTR_OP: 'AAAA1111111', SALIDA: '2026-06-10', ETA_FISC: '2026-06-15', LUGAR_SALIDA: '' }),
    ]
    const o = op('AAAA1111111', existing)
    const next = buildNextOperativas(cntrs, existing, o, 0, { LUGAR_SALIDA: 'GODILCO' })
    expect(next[0].LUGAR_SALIDA).toBe('GODILCO')
    expect(next[0].SALIDA).toBe('2026-06-10')
    expect(next[0].ETA_FISC).toBe('2026-06-15')
  })
})
