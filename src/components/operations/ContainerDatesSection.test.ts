import { describe, it, expect } from 'vitest'
import { resolveRecord, buildNextOperativas, reconcileOperativasToCntrs, computeFlush } from './ContainerDatesSection'
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

// ── reconcileOperativasToCntrs — sync al agregar/quitar contenedor ──────────
describe('reconcileOperativasToCntrs — operativas en sync con la lista de contenedores', () => {
  it('BUG: agregar un contenedor preserva el existente (por CNTR_OP) y sintetiza el nuevo', () => {
    // Carga con 1 operativa cargada (C1 con datos). Se agrega C2.
    const existing = [
      record({ CNTR_OP: 'AAAA1111111', SALIDA: '2026-06-10', ETA_FISC: '2026-06-20', KG: 800 }),
    ]
    const o = op('AAAA1111111, BBBB2222222', existing)
    const next = reconcileOperativasToCntrs(['AAAA1111111', 'BBBB2222222'], existing, o)
    expect(next).toHaveLength(2)
    // C1 intacto (no se pierde su data al agregar C2)
    expect(next[0].CNTR_OP).toBe('AAAA1111111')
    expect(next[0].SALIDA).toBe('2026-06-10')
    expect(next[0].ETA_FISC).toBe('2026-06-20')
    expect(next[0].KG).toBe(800)
    // C2 sintetizado, con CNTR_OP seteado (para que el rollup NO lo borre del contenedor)
    expect(next[1].CNTR_OP).toBe('BBBB2222222')
    expect(next[1].SALIDA).toBe('')
    // TODOS los CNTR_OP presentes → el rollup arma "AAAA1111111, BBBB2222222"
    expect(next.map(o => o.CNTR_OP).filter(Boolean)).toEqual(['AAAA1111111', 'BBBB2222222'])
  })

  it('quitar un contenedor deja solo los que quedan', () => {
    const existing = [
      record({ CNTR_OP: 'AAAA1111111', SALIDA: '2026-06-10' }),
      record({ CNTR_OP: 'BBBB2222222', SALIDA: '2026-06-12' }),
    ]
    const o = op('AAAA1111111', existing) // ya quitado B de la lista
    const next = reconcileOperativasToCntrs(['AAAA1111111'], existing, o)
    expect(next).toHaveLength(1)
    expect(next[0].CNTR_OP).toBe('AAAA1111111')
    expect(next[0].SALIDA).toBe('2026-06-10')
  })

  it('array vacío de operativas → sintetiza uno por contenedor (todos con CNTR_OP)', () => {
    const o = op('AAAA1111111, BBBB2222222', [])
    const next = reconcileOperativasToCntrs(['AAAA1111111', 'BBBB2222222'], [], o)
    expect(next.map(o => o.CNTR_OP)).toEqual(['AAAA1111111', 'BBBB2222222'])
  })
})

// ── Caso real A7808A: operativa con CNTR_OP VACÍO + fechas ya cargadas ──────
describe('CNTR_OP vacío — el contenedor no se pierde al agregarlo (caso A7808A)', () => {
  it('resolveRecord estampa el nº de contenedor en una operativa existente sin CNTR_OP', () => {
    // A7808A real: 1 operativa con CNTR_OP='' pero SALIDA/ETA_FISC cargadas.
    const existing = [record({ CNTR_OP: '', SALIDA: '2026-07-09', ETA_FISC: '2026-07-13', KG: 18240 })]
    const o = op('HMMU2325664', existing)
    const r = resolveRecord(['HMMU2325664'], existing, 0, o)
    // Estampa el contenedor (para que el rollup NO lo borre) y preserva la data
    expect(r.CNTR_OP).toBe('HMMU2325664')
    expect(r.SALIDA).toBe('2026-07-09')
    expect(r.ETA_FISC).toBe('2026-07-13')
    expect(r.KG).toBe(18240)
  })

  it('reconcile: agregar el contenedor a A7808A conserva las fechas Y el contenedor sobrevive al rollup', () => {
    const existing = [record({ CNTR_OP: '', SALIDA: '2026-07-09', ETA_FISC: '2026-07-13' })]
    const o = op('HMMU2325664', existing)
    const next = reconcileOperativasToCntrs(['HMMU2325664'], existing, o)
    // El CNTR_OP quedó estampado → el rollup arma "HMMU2325664" (no vacío)
    expect(next.map(o => o.CNTR_OP).filter(Boolean)).toEqual(['HMMU2325664'])
    expect(next[0].SALIDA).toBe('2026-07-09')
    expect(next[0].ETA_FISC).toBe('2026-07-13')
  })
})

// ── computeFlush — commit pendiente al cerrar el modal (bug del arribo fiscal) ─
// Clave de draft: `${cntr}-${i}-${FIELD}` (mismo formato que draftKey()).

describe('computeFlush — flush de borradores al cerrar el Sheet', () => {
  it('BUG REPRODUCIDO: arribo fiscal elegido y no blureado se comitea al cerrar', () => {
    // El dueño elige ETA_FISC en el calendario nativo y cierra con la X: el
    // draft quedó en estado local sin blurear. flush() debe comitearlo.
    const cntrs = ['AAAA1111111']
    const existing = [record({ CNTR_OP: 'AAAA1111111', ETA_FISC: '' })]
    const o = op('AAAA1111111', existing)
    const drafts = { 'AAAA1111111-0-ETA_FISC': '2026-07-15' }

    const { next, salidaWarnings } = computeFlush(cntrs, existing, o, drafts)
    expect(salidaWarnings).toHaveLength(0)
    expect(next).not.toBeNull()
    expect(next![0].ETA_FISC).toBe('2026-07-15')
  })

  it('sin borradores → next=null (nada que comitear, no dispara PATCH)', () => {
    const cntrs = ['AAAA1111111']
    const existing = [record({ CNTR_OP: 'AAAA1111111' })]
    const o = op('AAAA1111111', existing)
    const { next } = computeFlush(cntrs, existing, o, {})
    expect(next).toBeNull()
  })

  it('pliega salida + arribo fiscal del MISMO contenedor en un solo array', () => {
    const cntrs = ['AAAA1111111']
    const existing = [record({ CNTR_OP: 'AAAA1111111', SALIDA: '', ETA_FISC: '' })]
    const o = op('AAAA1111111', existing)
    const drafts = {
      'AAAA1111111-0-SALIDA': '2026-07-10',
      'AAAA1111111-0-ETA_FISC': '2026-07-20',
    }
    const { next } = computeFlush(cntrs, existing, o, drafts)
    expect(next![0].SALIDA).toBe('2026-07-10')
    expect(next![0].ETA_FISC).toBe('2026-07-20')
  })

  it('pliega borradores de DISTINTOS contenedores en UN array (no dos PATCH)', () => {
    const cntrs = ['AAAA1111111', 'BBBB2222222']
    const existing = [
      record({ CNTR_OP: 'AAAA1111111', SALIDA: '', DESCARGA: '2026-06-01', DEV: 'TCP' }),
      record({ CNTR_OP: 'BBBB2222222', ETA_FISC: '', KG: 400 }),
    ]
    const o = op('AAAA1111111, BBBB2222222', existing)
    const drafts = {
      'AAAA1111111-0-SALIDA': '2026-07-05',
      'BBBB2222222-1-ETA_FISC': '2026-07-22',
    }
    const { next } = computeFlush(cntrs, existing, o, drafts)
    expect(next).toHaveLength(2)
    // Contenedor 0: SALIDA seteada, hermanos preservados
    expect(next![0].SALIDA).toBe('2026-07-05')
    expect(next![0].DESCARGA).toBe('2026-06-01')
    expect(next![0].DEV).toBe('TCP')
    // Contenedor 1: ETA_FISC seteada, KG preservado
    expect(next![1].ETA_FISC).toBe('2026-07-22')
    expect(next![1].KG).toBe(400)
  })

  it('parsea correctamente CNTR con guiones (índice = penúltimo token)', () => {
    const cntrs = ['AAA-111-1', 'BBB-222-2']
    const existing = [
      record({ CNTR_OP: 'AAA-111-1' }),
      record({ CNTR_OP: 'BBB-222-2' }),
    ]
    const o = op('AAA-111-1, BBB-222-2', existing)
    const drafts = { 'BBB-222-2-1-ETA_FISC': '2026-08-01' }
    const { next } = computeFlush(cntrs, existing, o, drafts)
    // Debe patchear el índice 1 (BBB), no el 0
    expect(next![1].ETA_FISC).toBe('2026-08-01')
    expect(next![0].ETA_FISC).toBe('')
  })

  it('normaliza numéricos como commitNumberDraft (coma→punto) y descarta basura', () => {
    const cntrs = ['AAAA1111111']
    // Valores existentes propios para verificar que la basura NO los pisa.
    const existing = [record({ CNTR_OP: 'AAAA1111111', PKGS: 7, KG: 300, M3: 0 })]
    const o = op('AAAA1111111', existing)
    const drafts = {
      'AAAA1111111-0-KG': '1.234,5',        // basura (dos separadores) → Number NaN → descartado
      'AAAA1111111-0-M3': '12,5',           // 12.5 válido
      'AAAA1111111-0-PKGS': '-3',           // negativo → descartado
    }
    const { next } = computeFlush(cntrs, existing, o, drafts)
    // M3 sí entra; KG y PKGS basura se descartan → conservan el valor existente.
    expect(next).not.toBeNull()
    expect(next![0].M3).toBe(12.5)
    expect(next![0].KG).toBe(300)  // basura descartada → valor previo intacto
    expect(next![0].PKGS).toBe(7)  // negativo descartado → valor previo intacto
  })

  it('un draft numérico VÁLIDO con coma se guarda como número', () => {
    const cntrs = ['AAAA1111111']
    const existing = [record({ CNTR_OP: 'AAAA1111111', KG: 0 })]
    const o = op('AAAA1111111', existing)
    const { next } = computeFlush(cntrs, existing, o, { 'AAAA1111111-0-KG': '1500,75' })
    expect(next![0].KG).toBe(1500.75)
  })

  it('reporta salida-antes-de-llegada en salidaWarnings sin frenar el resto', () => {
    const cntrs = ['AAAA1111111']
    // ETA de llegada 2026-07-10; salida 2026-07-05 es ANTERIOR
    const existing = [record({ CNTR_OP: 'AAAA1111111', ETA_OP: '2026-07-10' })]
    const o = op('AAAA1111111', existing)
    const drafts = { 'AAAA1111111-0-SALIDA': '2026-07-05' }
    const { next, salidaWarnings } = computeFlush(cntrs, existing, o, drafts)
    expect(salidaWarnings).toHaveLength(1)
    expect(salidaWarnings[0].idx).toBe(0)
    // next incluye la salida (el caller decide con confirm si la conserva)
    expect(next![0].SALIDA).toBe('2026-07-05')
  })

  it('skipSalidaIdx excluye la salida rechazada pero conserva otros campos', () => {
    const cntrs = ['AAAA1111111']
    const existing = [record({ CNTR_OP: 'AAAA1111111', ETA_OP: '2026-07-10', ETA_FISC: '' })]
    const o = op('AAAA1111111', existing)
    const drafts = {
      'AAAA1111111-0-SALIDA': '2026-07-05',   // anterior a llegada → rechazada
      'AAAA1111111-0-ETA_FISC': '2026-07-25', // debe guardarse igual
    }
    const { next } = computeFlush(cntrs, existing, o, drafts, new Set([0]))
    expect(next![0].SALIDA).toBe('')          // salida NO se aplicó (rechazada)
    expect(next![0].ETA_FISC).toBe('2026-07-25') // arribo fiscal sí
  })

  it('ignora borradores huérfanos de contenedores removidos (idx fuera de rango)', () => {
    const cntrs = ['AAAA1111111']
    const existing = [record({ CNTR_OP: 'AAAA1111111' })]
    const o = op('AAAA1111111', existing)
    const drafts = { 'ZZZZ9999999-3-ETA_FISC': '2026-07-15' } // idx 3 no existe
    const { next } = computeFlush(cntrs, existing, o, drafts)
    expect(next).toBeNull()
  })
})
