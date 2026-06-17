import { describe, it, expect } from 'vitest'
import { buildOperations, isOperationActive, dbShipmentToOperation, fclToColumns, dbFclToParsedShipment, mergeFclShipments, newDbShipment, buildTruckByRef, buildOperativaPatch, EDITABLE_FIELDS, DEPOSITOS_UY, type UnifiedOperation, type DbShipment } from './operationsTypes'
import type { ParsedShipment } from './shipmentTypes'
import type { OperativasRecord } from './shipmentTypes'
import type { Truck, TruckLoad } from './truckTypes'

describe('buildOperativaPatch — editar OPERATIVA propaga al array por contenedor', () => {
  const op = (over: Partial<UnifiedOperation> = {}): UnifiedOperation =>
    ({ uid: 'u', ref: 'A7000', mode: 'fcl', source: 'db', dbId: 'd1', operativa: 'TRASIEGO', ...over } as UnifiedOperation)
  const rec = (over: Partial<OperativasRecord> = {}): OperativasRecord =>
    ({ REF: 'A7000', CNTR_OP: 'C1', OPERATIVA: 'TRASIEGO', ...over } as OperativasRecord)

  it('setea la columna operativa', () => {
    const patch = buildOperativaPatch(op({ operativas: undefined }), 'CONTENEDOR')
    expect(patch.operativa).toBe('CONTENEDOR')
    expect(patch.operativas).toBeUndefined() // sin array → solo la columna
  })

  it('propaga OPERATIVA a TODOS los contenedores del array', () => {
    const ops: OperativasRecord[] = [
      { ...rec(), CNTR_OP: 'C1', OPERATIVA: 'TRASIEGO' },
      { ...rec(), CNTR_OP: 'C2', OPERATIVA: 'TRASIEGO' },
    ]
    const patch = buildOperativaPatch(op({ operativas: ops }), 'CONTENEDOR')
    expect(patch.operativa).toBe('CONTENEDOR')
    const next = patch.operativas as OperativasRecord[]
    expect(next.map(o => o.OPERATIVA)).toEqual(['CONTENEDOR', 'CONTENEDOR'])
    // preserva el resto de cada contenedor
    expect(next.map(o => o.CNTR_OP)).toEqual(['C1', 'C2'])
  })

  it('array vacío → solo la columna (sin operativas)', () => {
    const patch = buildOperativaPatch(op({ operativas: [] }), 'CARGA A PISO')
    expect(patch.operativa).toBe('CARGA A PISO')
    expect(patch.operativas).toBeUndefined()
  })
})

describe('buildTruckByRef — estado derivado del camión por ref de origen', () => {
  const truck = (over: Partial<Truck> = {}): Truck =>
    ({ id: 't1', code: 'C440', status: 'planning', draft: false,
       loadDate: '', departureDate: '', arrivalDate: '', ...over } as unknown as Truck)
  const load = (over: Partial<TruckLoad> = {}): TruckLoad =>
    ({ id: 'l1', truckId: 't1', sourceRef: 'A7611', pending: null, ...over } as unknown as TruckLoad)
  const hoy = new Date(2026, 5, 17)

  it('sin camiones o sin cargas → mapa vacío', () => {
    expect(buildTruckByRef([], [], hoy).size).toBe(0)
    expect(buildTruckByRef([truck()], [], hoy).size).toBe(0)
    expect(buildTruckByRef([], [load()], hoy).size).toBe(0)
  })

  it('camión cargado (loadDate pasada) → ref mapeada a su estado + código', () => {
    const m = buildTruckByRef(
      [{ ...truck(), loadDate: '2026-06-10' }],
      [load()],
      hoy,
    )
    expect(m.get('A7611')).toEqual({ truckCode: 'C440', status: 'arribado' })
  })

  it('ignora cargas borrador (pending="add")', () => {
    const m = buildTruckByRef(
      [{ ...truck(), loadDate: '2026-06-10' }],
      [{ ...load(), pending: 'add' }],
      hoy,
    )
    expect(m.size).toBe(0)
  })

  it('ignora camiones borrador (draft)', () => {
    const m = buildTruckByRef(
      [{ ...truck(), draft: true, loadDate: '2026-06-10' }],
      [load()],
      hoy,
    )
    expect(m.size).toBe(0)
  })

  it('camión en planning sin fechas → no aporta estado (deriveTruckCargoStatus null)', () => {
    expect(buildTruckByRef([truck()], [load()], hoy).size).toBe(0)
  })
})

// La planilla reutiliza refs (caso real: A6902 con dos clientes distintos,
// A7095 split en dos filas). La grilla debe mostrar AMBAS con uid distinto
// (sin uid único, React colisiona keys y deja filas "fantasma" entre filtros).
const fcl = (over: Partial<ParsedShipment> = {}): ParsedShipment =>
  ({ REF: 'A6902', CLIENTE: 'X', ETD: '', ETA: '', operativas: [], ...over }) as ParsedShipment

describe('mergeFclShipments — dedupe por REF (anti doble-conteo post-flip)', () => {
  const dbFcl = (ref: string): DbShipment => ({ id: ref, ref, mode: 'fcl', source: 'fcl' } as unknown as DbShipment)
  it('cache contaminado con FCL que ya está en la DB → no duplica (gana la DB)', () => {
    const cache = [{ REF: 'A1' }, { REF: 'A2' }] as unknown as ParsedShipment[]
    const merged = mergeFclShipments(cache, [dbFcl('A1'), dbFcl('A2')])
    expect(merged).toHaveLength(2)
    expect(merged.map(s => s.REF).sort()).toEqual(['A1', 'A2'])
  })
  it('post-flip: cache vacío + FCL de la DB → solo la DB', () => {
    expect(mergeFclShipments([], [dbFcl('A1')])).toHaveLength(1)
  })
  it('pre-flip: cache con FCL + sin FCL en la DB → cache intacto', () => {
    const cache = [{ REF: 'A1' }, { REF: 'A2' }] as unknown as ParsedShipment[]
    expect(mergeFclShipments(cache, [])).toHaveLength(2)
  })
  it('conserva entradas del cache cuya REF no está en la DB', () => {
    const merged = mergeFclShipments([{ REF: 'X' }] as unknown as ParsedShipment[], [dbFcl('A1')])
    expect(merged.map(s => s.REF).sort()).toEqual(['A1', 'X'])
  })
})

describe('buildOperations — refs duplicadas en la planilla', () => {
  it('mantiene ambas filas (son operaciones reales) con uid único', () => {
    const out = buildOperations(
      [fcl({ CLIENTE: 'CONTROL UNO' }), fcl({ CLIENTE: 'TOOL SHOP SRL' })],
      [],
      new Map()
    )
    expect(out).toHaveLength(2)
    expect(out.map(o => o.ref)).toEqual(['A6902', 'A6902'])
    expect(out[0].uid).not.toBe(out[1].uid)
    expect(out.map(o => o.cliente)).toEqual(['CONTROL UNO', 'TOOL SHOP SRL'])
  })

  it('todas las filas FCL siguen siendo mode=fcl (no caen en otro bucket)', () => {
    const out = buildOperations([fcl(), fcl(), fcl({ REF: 'A7095' })], [], new Map())
    expect(out.every(o => o.mode === 'fcl')).toBe(true)
  })
})

// Criterio de Brian (10/06/2026): activa = NO (devuelta Y en fiscal);
// sin tramo fiscal cuenta solo la devolución; sin datos de operativa
// (Chile/BA, históricas) → inactiva si la ETA pasó hace más de 60 días.
const TODAY = new Date(2026, 5, 10) // 10/06/2026

const op = (over: Partial<UnifiedOperation>): UnifiedOperation =>
  ({ source: 'fcl', mode: 'fcl', ref: 'A1', libre: '', salida: '', etaFisc: '', eta: '', status: '', ...over }) as UnifiedOperation

describe('isOperationActive — criterio devuelta + en fiscal', () => {
  it('FCL devuelta Y en fiscal → inactiva', () => {
    expect(isOperationActive(op({ libre: 'DEVUELTO', etaFisc: '2025-12-17' }), undefined, TODAY)).toBe(false)
  })
  it('FCL devuelta pero camión aún en viaje a fiscal → ACTIVA', () => {
    expect(isOperationActive(op({ libre: 'DEVUELTO', etaFisc: '2026-06-20' }), undefined, TODAY)).toBe(true)
  })
  it('FCL sin tramo fiscal: devuelta alcanza para inactivar', () => {
    expect(isOperationActive(op({ libre: 'DEVUELTO', salida: '2026-05-01' }), undefined, TODAY)).toBe(false)
  })
  it('FCL con contenedor sin devolver → activa aunque esté en fiscal', () => {
    expect(isOperationActive(op({ libre: '2026-06-12', etaFisc: '2026-06-01' }), undefined, TODAY)).toBe(true)
  })
  it('FCL sin datos de operativa (Chile/BA): ETA vieja >60d → inactiva, reciente → activa, sin ETA → activa', () => {
    expect(isOperationActive(op({ eta: '2025-10-09' }), undefined, TODAY)).toBe(false)
    expect(isOperationActive(op({ eta: '2026-05-26' }), undefined, TODAY)).toBe(true)
    expect(isOperationActive(op({}), undefined, TODAY)).toBe(true)
  })
  it('DB: estado terminal (en fiscal / entregado) → inactiva; en tránsito → activa', () => {
    expect(isOperationActive(op({ source: 'db', mode: 'lcl', status: 'en_fiscal' }), undefined, TODAY)).toBe(false)
    expect(isOperationActive(op({ source: 'db', mode: 'lcl', status: 'devuelto' }), undefined, TODAY)).toBe(false)
    expect(isOperationActive(op({ source: 'db', mode: 'lcl', status: 'en_transito' }), undefined, TODAY)).toBe(true)
  })
  it('DB en camión: el estado derivado del camión manda', () => {
    expect(isOperationActive(op({ source: 'db', mode: 'lcl', status: 'en_transito' }), 'en_fiscal', TODAY)).toBe(false)
    expect(isOperationActive(op({ source: 'db', mode: 'lcl', status: 'en_fiscal' }), 'en_frontera', TODAY)).toBe(true)
  })
})

// Etapa 3 migracion FCL: overlay de ediciones web sobre el dato de la planilla
import { applyWebEdits } from './shipmentTypes'

describe('applyWebEdits — ediciones web sobre FCL espejo', () => {
  const raw = { REF: 'A7800', CLIENTE: 'BASSO', ETA: '2026-06-01', BUQUE: 'EVER', operativas: [] } as never

  it('sin ediciones: agrega __dbId y lista vacia, datos intactos', () => {
    const out = applyWebEdits(raw, null, 'shp-fcl-a7800')
    expect(out.__dbId).toBe('shp-fcl-a7800')
    expect(out.__webEdited).toEqual([])
    expect(out.ETA).toBe('2026-06-01')
  })

  it('las ediciones PISAN a la planilla y quedan marcadas', () => {
    const out = applyWebEdits(raw, { ETA: '2026-06-05', BUQUE: 'MSC LUNA' }, 'x')
    expect(out.ETA).toBe('2026-06-05')
    expect(out.BUQUE).toBe('MSC LUNA')
    expect(out.CLIENTE).toBe('BASSO')
    expect(out.__webEdited).toEqual(['ETA', 'BUQUE'])
  })
})

// Analíticas multi-modalidad: el dashboard necesita TERMINAL y N (cantidad de
// contenedores FCL) que antes solo vivían en ParsedShipment.
describe('UnifiedOperation — terminal y n para analíticas', () => {
  it('FCL mapea TERMINAL y N; DB queda con terminal vacío y n=0', () => {
    const out = buildOperations(
      [fcl({ TERMINAL: 'TCP', N: 3 })],
      [{ id: 'shp-lcl-1', ref: 'LCL-1', mode: 'lcl', archived: false } as unknown as DbShipment],
      new Map()
    )
    expect(out[0].terminal).toBe('TCP')
    expect(out[0].n).toBe(3)
    expect(out[1].terminal).toBe('')
    expect(out[1].n).toBe(0)
  })
})

describe('viabilidad — desconsol y entregaPlanta', () => {
  it('dbShipmentToOperation mapea desconsol_date y entrega_planta', () => {
    const op = dbShipmentToOperation({
      id: 'shp-lcl-1', ref: 'LCL-1', mode: 'lcl', desconsol_date: '2026-06-18',
      entrega_planta: true,
    } as never)
    expect(op.desconsol).toBe('2026-06-18')
    expect(op.entregaPlanta).toBe(true)
  })
  it('dbShipmentToOperation: defaults vacíos sin esos campos', () => {
    const op = dbShipmentToOperation({ id: 'x', ref: 'LCL-2', mode: 'lcl' } as never)
    expect(op.desconsol).toBe('')
    expect(op.entregaPlanta).toBe(false)
  })
  it('EDITABLE_FIELDS incluye desconsol y entregaPlanta', () => {
    expect(EDITABLE_FIELDS.desconsol).toEqual({ col: 'desconsol_date', type: 'text' })
    expect(EDITABLE_FIELDS.entregaPlanta).toEqual({ col: 'entrega_planta', type: 'bool' })
  })
  it('EDITABLE_FIELDS incluye los campos de Operativas (editables tras el flip)', () => {
    expect(EDITABLE_FIELDS.libre).toEqual({ col: 'libre', type: 'text' })
    expect(EDITABLE_FIELDS.salida).toEqual({ col: 'salida', type: 'text' })
    expect(EDITABLE_FIELDS.etaFisc).toEqual({ col: 'eta_fiscal', type: 'text' })
    expect(EDITABLE_FIELDS.operativa).toEqual({ col: 'operativa', type: 'text' })
    expect(EDITABLE_FIELDS.terminal).toEqual({ col: 'terminal', type: 'text' })
  })
  it('DEPOSITOS_UY trae los conocidos', () => {
    expect(DEPOSITOS_UY).toContain('GODILCO')
    expect(DEPOSITOS_UY).toContain('TCP')
    expect(DEPOSITOS_UY).toContain('MONTECON')
  })
})

// PR-A flip Etapa 4: columnas reales de Operativas en la tabla shipments
// (hoy vacías en LCL/aéreo; se pueblan al hornear las FCL en PR-C).
describe('dbShipmentToOperation — columnas de Operativas (flip Etapa 4)', () => {
  it('mapea libre/salida/eta_fiscal/operativa/descarga/dev/terminal/n_cntr desde columnas', () => {
    const op = dbShipmentToOperation({
      id: 'shp-fcl-a7900', ref: 'A7900', mode: 'fcl',
      libre: '2026-07-01', salida: '2026-06-20', eta_fiscal: '2026-06-25',
      operativa: 'TRASIEGO', descarga: '2026-06-22', dev: 'STL',
      terminal: 'MONTECON', n_cntr: 2,
    } as never)
    expect(op.libre).toBe('2026-07-01')
    expect(op.salida).toBe('2026-06-20')
    expect(op.etaFisc).toBe('2026-06-25')
    expect(op.operativa).toBe('TRASIEGO')
    expect(op.descarga).toBe('2026-06-22')
    expect(op.dev).toBe('STL')
    expect(op.terminal).toBe('MONTECON')
    expect(op.n).toBe(2)
  })
  it('defaults vacíos sin esas columnas', () => {
    const op = dbShipmentToOperation({ id: 'x', ref: 'LCL-9', mode: 'lcl' } as never)
    expect(op.libre).toBe('')
    expect(op.salida).toBe('')
    expect(op.terminal).toBe('')
    expect(op.n).toBe(0)
  })
  it('newDbShipment inicializa las columnas nuevas', () => {
    const s = newDbShipment({ mode: 'fcl' })
    expect(s.libre).toBe('')
    expect(s.n_cntr).toBe(0)
    expect(s.origin_ref).toBe('')
  })
})

// PR-C flip Etapa 4: hornear una FCL a columnas reales. El test clave es la
// FIDELIDAD round-trip: leer las columnas (dbShipmentToOperation) debe reproducir
// lo que hoy muestra la grilla (fclToOperation), así el cutover no cambia nada.
describe('fclToColumns — horneado FCL a columnas (PR-C flip)', () => {
  const parsed = {
    REF: 'A7900', CLIENTE: 'PERETTI', MBL: 'BOOK123', ETD: '2026-05-01', ETA: '2026-06-01',
    BUQUE: 'MSC LUNA', LINEA: 'MSC', POL: 'SHANGHAI', POD: 'MONTEVIDEO', PAIS: 'UY',
    SEGUIMIENTO: '2026-06-05', CNTR: 'MSCU1', N: 2, TERMINAL: 'MONTECON', TIPO: '40HC',
    LIBRE_HASTA: '2026-06-20',
    operativas: [
      { SALIDA: '2026-06-03', ETA_FISC: '2026-06-04', OPERATIVA: 'TRASIEGO', DEPOSITO: 'GODILCO',
        DESCARGA: '2026-06-05', DEV: 'STL', FISCAL: 'DEP FISCAL AR', DESCRIPCION: 'BICIS',
        KG: '1000', M3: '20', PKGS: '50', TRANSPORTE: 'OLAVERRY', WOOD: 'SI' },
    ],
  } as unknown as ParsedShipment

  it('mapea los campos clave a columnas (incl. Operativas)', () => {
    const c = fclToColumns(parsed)
    expect(c.mode).toBe('fcl')
    expect(c.source).toBe('fcl')
    expect(c.ref).toBe('A7900')
    expect(c.cliente).toBe('PERETTI')
    expect(c.doc_number).toBe('BOOK123')
    expect(c.salida).toBe('2026-06-03')
    expect(c.eta_fiscal).toBe('2026-06-04')
    expect(c.libre).toBe('2026-06-20')
    expect(c.operativa).toBe('TRASIEGO')
    expect(c.deposito).toBe('GODILCO')
    expect(c.terminal).toBe('MONTECON')
    expect(c.n_cntr).toBe(2)
    expect(c.kg).toBe(1000)
    expect(c.wood).toBe(true)
    expect(c.dest_country).toBe('UY')
  })

  it('round-trip: leer las columnas reproduce fclToOperation en los campos visibles', () => {
    const cols = { id: 'shp-fcl-a7900', ...fclToColumns(parsed) } as unknown as DbShipment
    const viaCols = dbShipmentToOperation(cols)
    const viaFcl = buildOperations([parsed], [], new Map())[0]
    const campos = ['cliente','eta','salida','etaFisc','libre','operativa','deposito','terminal',
      'n','kg','m3','dischargePort','pais','dev','descarga','fiscal','descripcion','docNumber',
      'seguimiento','buque','linea','origin','tipo','wood'] as const
    for (const k of campos) expect(viaCols[k], `campo ${k}`).toEqual(viaFcl[k])
  })

  it('split A/B: origin_ref = ref sin sufijo; sin split queda vacío', () => {
    expect(fclToColumns({ REF: 'A6902 A', operativas: [] } as unknown as ParsedShipment).origin_ref).toBe('A6902')
    expect(fclToColumns({ REF: 'A7900', operativas: [] } as unknown as ParsedShipment).origin_ref).toBe('')
  })

  // Post-flip la Agenda/HOY reconstruyen la FCL desde columnas: la operativa
  // sintética debe traer las fechas para que se generen los eventos.
  it('dbFclToParsedShipment reconstruye operativas con fechas (Agenda/HOY post-flip)', () => {
    const cols = { id: 'shp-fcl-x', ...fclToColumns(parsed) } as unknown as DbShipment
    const reb = dbFclToParsedShipment(cols)
    expect(reb.REF).toBe('A7900')
    expect(reb.CLIENTE).toBe('PERETTI')
    expect(reb.operativas?.[0]?.SALIDA).toBe('2026-06-03')
    expect(reb.operativas?.[0]?.ETA_FISC).toBe('2026-06-04')
    expect(reb.__dbId).toBe('shp-fcl-x')
  })
  it('dbFclToParsedShipment: FCL sin datos de operativa → operativas vacías', () => {
    const reb = dbFclToParsedShipment({ id: 'y', ref: 'A1', mode: 'fcl', eta: '2026-01-01' } as never)
    expect(reb.operativas).toEqual([])
  })
})

describe('operativas array model', () => {
  it('dbFclToParsedShipment expone operativas[] con LUGAR_SALIDA', () => {
    const row: any = {
      id: 'x', ref: 'A1', mode: 'fcl', source: 'fcl',
      operativas: [{ CNTR_OP: 'AAAU1111111', SALIDA: '2026-06-16', ETA_FISC: '2026-06-18', LUGAR_SALIDA: 'GODILCO' }],
    }
    const p = dbFclToParsedShipment(row)
    expect(p.operativas?.[0].CNTR_OP).toBe('AAAU1111111')
    expect(p.operativas?.[0].LUGAR_SALIDA).toBe('GODILCO')
  })

  it('dbFclToParsedShipment usa operativas[] si existe; fallback al op colapsado', () => {
    const multi: any = { id: 'x', ref: 'A1', mode: 'fcl', source: 'fcl',
      operativas: [
        { CNTR_OP: 'A111', SALIDA: '2026-06-16', LUGAR_SALIDA: 'GODILCO' },
        { CNTR_OP: 'B222', SALIDA: '', LUGAR_SALIDA: 'GODILCO' },
      ] }
    expect(dbFclToParsedShipment(multi).operativas).toHaveLength(2)

    const legacy: any = { id: 'y', ref: 'A2', mode: 'fcl', source: 'fcl',
      salida: '2026-06-16', eta_fiscal: '2026-06-18', deposito: 'GODILCO', operativa: 'TRASIEGO' }
    const p = dbFclToParsedShipment(legacy)
    expect(p.operativas).toHaveLength(1)
    expect(p.operativas?.[0].SALIDA).toBe('2026-06-16')
  })
})

// PR-C: post-flip la FCL es una fila DB (source='db', mode='fcl') pero conserva
// su comportamiento — estado DERIVADO de columnas y activa por devuelta+fiscal.
describe('FCL horneada (source=db, mode=fcl) — comportamiento preservado', () => {
  it('dbShipmentToOperation deriva el estado FCL desde las columnas de operativa', () => {
    const arribFiscal = dbShipmentToOperation({
      id: 'shp-fcl-1', ref: 'A7900', mode: 'fcl', eta: '2026-06-01',
      salida: '2026-06-03', eta_fiscal: '2026-06-04',
    } as never)
    expect(arribFiscal.status).toBe('En Depósito Fiscal')
    const sinOperativa = dbShipmentToOperation({
      id: 'shp-fcl-2', ref: 'A7901', mode: 'fcl', eta: '2026-06-01',
    } as never)
    expect(sinOperativa.status).toBe('En Puerto')
  })
  it('isOperationActive usa la lógica FCL aunque source=db (devuelta + en fiscal → inactiva)', () => {
    const o = op({ source: 'db', mode: 'fcl', libre: 'DEVUELTO', etaFisc: '2025-12-17' })
    expect(isOperationActive(o, undefined, TODAY)).toBe(false)
  })
})
