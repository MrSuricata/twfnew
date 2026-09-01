import { describe, it, expect } from 'vitest'
import { prefillFclFromShipment, makeEmptyTruckLoad, getAssignedCntrs, contenedoresLibres, isFclAvailable, conflictoFechasConsolidado } from './truckUtils'
import type { Truck, TruckLoad } from './truckTypes'
import type { ParsedShipment, OperativasRecord } from './shipmentTypes'

const op = (over: Partial<OperativasRecord> = {}): OperativasRecord =>
  ({
    REF: 'A7757', TLX: '', DEPOSITO: 'GODILCO', ETA_OP: '2026-06-19', SALIDA: '', ETA_FISC: '',
    LIBRE: '', OPERATIVA: 'TRASIEGO', CNTR_OP: 'C1', PKGS: 10, KG: 100, M3: 1,
    DESCRIPCION: 'BICIS', FISCAL: 'MARE', DESCARGA: '', DEV: '', CLIENTE_OP: 'TOOL SHOP',
    TIPO: '40HC', WOOD: '', TRANSPORTE: '', HORARIO: '',
    ...over,
  }) as OperativasRecord

const ship = (over: Partial<ParsedShipment> = {}): ParsedShipment =>
  ({ REF: 'A7757', CLIENTE: 'TOOL SHOP', ETD: '', ETA: '2026-06-19', MBL: '', operativas: [op()], ...over }) as ParsedShipment

describe('prefillFclFromShipment — BL y madera', () => {
  it('BL se autocompleta del MBL de la carga', () => {
    expect(prefillFclFromShipment(ship({ MBL: 'MAEU123456789' })).bl).toBe('MAEU123456789')
  })

  it('BL vacío si la carga no tiene MBL', () => {
    expect(prefillFclFromShipment(ship({ MBL: '' })).bl).toBe('')
  })

  it('madera = true si alguna operativa marca WOOD=SI', () => {
    const s = ship({ operativas: [op({ WOOD: '' }), op({ CNTR_OP: 'C2', WOOD: 'SI' })] })
    expect(prefillFclFromShipment(s).wood).toBe(true)
  })

  it('madera = false si ninguna operativa marca WOOD', () => {
    expect(prefillFclFromShipment(ship()).wood).toBe(false)
  })

  it('"SI MADERA" (startsWith SI) también cuenta como madera', () => {
    expect(prefillFclFromShipment(ship({ operativas: [op({ WOOD: 'SI MADERA' })] })).wood).toBe(true)
  })
})

describe('makeEmptyTruckLoad — defaults de los campos nuevos', () => {
  it('arranca con bl/stock vacíos y wood=false', () => {
    const l = makeEmptyTruckLoad('t1', 'fcl', 'A7757', 0)
    expect(l.bl).toBe('')
    expect(l.stock).toBe('')
    expect(l.wood).toBe(false)
  })
})

describe('prefillFclFromShipment — desconsolDate solo con fechas reales (bug A7827 B)', () => {
  it('DESCARGA con un LUGAR ("RAFAELA") NO va como fecha; cae a SALIDA si es ISO', () => {
    const s = ship({ operativas: [op({ DESCARGA: 'RAFAELA', SALIDA: '2026-07-24' })] })
    expect(prefillFclFromShipment(s).desconsolDate).toBe('2026-07-24')
  })
  it('DESCARGA lugar y SALIDA vacía → desconsolDate vacío (nunca texto)', () => {
    const s = ship({ operativas: [op({ DESCARGA: 'RAFAELA', SALIDA: '' })] })
    expect(prefillFclFromShipment(s).desconsolDate).toBe('')
  })
  it('DESCARGA fecha ISO se usa como siempre', () => {
    const s = ship({ operativas: [op({ DESCARGA: '2026-07-20', SALIDA: '2026-07-24' })] })
    expect(prefillFclFromShipment(s).desconsolDate).toBe('2026-07-20')
  })
})

// ── Elegir el contenedor al consolidar (Brian 06/08/2026) ──────────────
// Caso A7806 A: 2 contenedores (8 bultos/10.254 kg y 3 bultos/11.730 kg).
// Antes se cargaba la ref entera → 21.984 kg en un camión, imposible.
const A7806 = ship({
  REF: 'A7806 A',
  operativas: [
    op({ REF: 'A7806 A', CNTR_OP: 'HMMU4917976', PKGS: 8, KG: 10254, M3: 19.41 }),
    op({ REF: 'A7806 A', CNTR_OP: 'KOCU4509137', PKGS: 3, KG: 11730, M3: 21.4 }),
  ],
})

describe('prefillFclFromShipment — por contenedor', () => {
  it('sin contenedor: suma todo (comportamiento previo)', () => {
    const p = prefillFclFromShipment(A7806)
    expect(p.pkgs).toBe(11)
    expect(p.kg).toBe(21984)
  })

  it('con contenedor: sólo los datos de ESE contenedor', () => {
    const p = prefillFclFromShipment(A7806, 'HMMU4917976')
    expect(p.pkgs).toBe(8)
    expect(p.kg).toBe(10254)
    expect(p.m3).toBeCloseTo(19.41, 2)
  })

  it('el contenedor matchea sin importar mayúsculas ni espacios', () => {
    expect(prefillFclFromShipment(A7806, '  kocu4509137 ').kg).toBe(11730)
  })
})

describe('contenedores libres para consolidar', () => {
  const truck = (id: string): Truck => ({ id, status: 'planning' } as Truck)
  const load = (truckId: string, sourceRef: string, cntr: string): TruckLoad =>
    ({ id: `l-${cntr}`, truckId, sourceRef, cntr, sourceType: 'fcl' } as TruckLoad)

  it('con un contenedor cargado, el otro sigue disponible', () => {
    const asignados = getAssignedCntrs([load('t1', 'A7806 A', 'HMMU4917976')], [truck('t1')])
    expect(contenedoresLibres(A7806, asignados)).toEqual(['KOCU4509137'])
    expect(isFclAvailable(A7806, asignados, { showArchived: true })).toBe(true)
  })

  it('con los dos cargados ya no queda nada', () => {
    const asignados = getAssignedCntrs(
      [load('t1', 'A7806 A', 'HMMU4917976'), load('t2', 'A7806 A', 'KOCU4509137')],
      [truck('t1'), truck('t2')],
    )
    expect(contenedoresLibres(A7806, asignados)).toEqual([])
    expect(isFclAvailable(A7806, asignados, { showArchived: true })).toBe(false)
  })

  it('una línea vieja sin contenedor vale por la carga entera', () => {
    const asignados = getAssignedCntrs([load('t1', 'A7806 A', '')], [truck('t1')])
    expect(contenedoresLibres(A7806, asignados)).toEqual([])
  })

  it('carga sin contenedores cargados: una sola opción, la ref entera', () => {
    const s = ship({ REF: 'A9000', operativas: [op({ CNTR_OP: '' })] })
    expect(contenedoresLibres(s, new Set())).toEqual([''])
  })
})

// ── Choque de fechas carga vs consolidado (Brian 06/08/2026) ───────────
describe('conflictoFechasConsolidado', () => {
  const camion = (over: Partial<Truck> = {}): Truck =>
    ({ id: 't1', code: 'A7806A + A7806B', departureDate: '2026-08-07',
       arrivalDate: '2026-08-10', loadDate: '2026-08-07', ...over }) as Truck

  it('detecta el caso real: carga sale el 6 y el camión el 7', () => {
    const s = ship({ REF: 'A7806 A', operativas: [op({ CNTR_OP: 'KOCU4509137', SALIDA: '2026-08-06' })] })
    const c = conflictoFechasConsolidado(s, 'KOCU4509137', camion())
    expect(c).not.toBeNull()
    expect(c!.salidaCarga).toBe('2026-08-06')
    expect(c!.salidaCamion).toBe('2026-08-07')
  })

  it('sin salida propia no hay conflicto (toma la del camión)', () => {
    const s = ship({ operativas: [op({ SALIDA: '' })] })
    expect(conflictoFechasConsolidado(s, 'C1', camion())).toBeNull()
  })

  it('"CONFIRMAR" no es una fecha coordinada → sin conflicto', () => {
    const s = ship({ operativas: [op({ SALIDA: 'CONFIRMAR' })] })
    expect(conflictoFechasConsolidado(s, 'C1', camion())).toBeNull()
  })

  it('mismas fechas → sin conflicto', () => {
    const s = ship({ operativas: [op({ SALIDA: '2026-08-07', ETA_FISC: '2026-08-10' })] })
    expect(conflictoFechasConsolidado(s, 'C1', camion())).toBeNull()
  })

  it('misma salida pero distinta llegada a fiscal → sí avisa', () => {
    const s = ship({ operativas: [op({ SALIDA: '2026-08-07', ETA_FISC: '2026-08-12' })] })
    expect(conflictoFechasConsolidado(s, 'C1', camion())).not.toBeNull()
  })

  it('sólo mira el contenedor que se está subiendo', () => {
    const s = ship({
      REF: 'A7806 A',
      operativas: [
        op({ CNTR_OP: 'HMMU4917976', SALIDA: '2026-08-07' }),   // coincide
        op({ CNTR_OP: 'KOCU4509137', SALIDA: '2026-08-06' }),   // choca
      ],
    })
    expect(conflictoFechasConsolidado(s, 'HMMU4917976', camion())).toBeNull()
    expect(conflictoFechasConsolidado(s, 'KOCU4509137', camion())).not.toBeNull()
  })

  it('camión sin fecha de salida → no se compara nada', () => {
    const s = ship({ operativas: [op({ SALIDA: '2026-08-06' })] })
    expect(conflictoFechasConsolidado(s, 'C1', camion({ departureDate: '', loadDate: '' }))).toBeNull()
  })
})

// ── La línea del camión y la carga: una sola fuente ─────────────────────
import { truckLoadDesdeDb, valoresDesdeShipment, sincronizarLoad, camposQueDifieren, etiquetaCampoLoad } from './truckUtils'
import type { DbShipment } from './operationsTypes'

const db = (over: Partial<DbShipment> = {}): DbShipment => ({
  id: 'db-1', ref: 'E163 A', mode: 'lcl', cliente: 'INELPA', fiscal: 'CLIR', kg: 1200, m3: 6.5, pkgs: 12,
  doc_number: 'BL-77', hbl: 'HBL-OLD', stock: '13030', desconsol_date: '2026-08-25', fecha_consol: '2026-08-20',
  eta: '2026-08-20', observacion: 'REPUESTOS', wood: true, imo: false, no_apilable: false, entrega_planta: false,
  archived: false, agente: 'CRAFT', deposito: 'PLANIR', ...over,
} as unknown as DbShipment)

describe('truckLoadDesdeDb — la línea nace igual a la carga, sin overrides', () => {
  it('copia lo que dice LOAD_DESDE_SHIPMENT (stock, fiscal, kg, m3, pkgs, madera, BL=doc_number)', () => {
    const l = truckLoadDesdeDb('t1', db(), 0, null)
    expect(l).toMatchObject({
      sourceType: 'lcl', sourceRef: 'E163 A', client: 'INELPA', fiscal: 'CLIR', kg: 1200, m3: 6.5, pkgs: 12,
      bl: 'BL-77', stock: '13030', wood: true, desconsolDate: '2026-08-25', mvdArrival: '2026-08-20', description: 'REPUESTOS',
      overrides: {}, pending: null,
    })
  })

  it('BL cae a hbl si doc_number está vacío; desconsol a fecha_consol; madera null entra como No', () => {
    const l = truckLoadDesdeDb('t1', db({ doc_number: '', desconsol_date: '', wood: null as unknown as boolean }), 0, 'add')
    expect(l.bl).toBe('HBL-OLD')
    expect(l.desconsolDate).toBe('2026-08-20')
    expect(l.wood).toBe(false)
    expect(l.pending).toBe('add')
  })

  it('valoresDesdeShipment es lo mismo que copia la línea (misma función)', () => {
    const v = valoresDesdeShipment(db())
    const l = truckLoadDesdeDb('t1', db(), 0, null)
    for (const k of Object.keys(v) as (keyof typeof v)[]) expect(l[k]).toEqual(v[k])
  })
})

describe('sincronizarLoad — la carga manda salvo donde el usuario pisó a mano', () => {
  // Línea creada ANTES de que alguien completara la carga en HOY LCL: nació con ceros.
  const vieja = (over: Partial<TruckLoad> = {}): TruckLoad => ({
    ...truckLoadDesdeDb('t1', db({ kg: 0, m3: 0, pkgs: 0, stock: '', deposito: '' }), 0, null),
    id: 'l-1', ...over,
  })

  it('completa kg/m3/pkgs/stock desde la carga y dice qué cambió', () => {
    const { load, campos } = sincronizarLoad(vieja(), db())
    expect(load).toMatchObject({ kg: 1200, m3: 6.5, pkgs: 12, stock: '13030' })
    expect(campos).toEqual(['kg', 'm3', 'pkgs', 'stock'])
    expect(load.overrides).toEqual({})
  })

  it('respeta lo que tiene override: el valor manual queda y no se cuenta como cambio', () => {
    const l = vieja({ kg: 999, overrides: { kg: true } })
    const { load, campos } = sincronizarLoad(l, db())
    expect(load.kg).toBe(999)
    expect(load.overrides).toEqual({ kg: true })
    expect(campos).toEqual(['m3', 'pkgs', 'stock'])
  })

  it('si ya coincide no cambia nada y devuelve la misma línea', () => {
    const l = truckLoadDesdeDb('t1', db(), 0, null)
    const r = sincronizarLoad(l, db())
    expect(r.campos).toEqual([])
    expect(r.load).toBe(l)
  })
})

describe('camposQueDifieren — aviso "difiere de la carga" sin override', () => {
  it('lista los campos donde la línea dice otra cosa que la carga y nadie los editó', () => {
    const l = { ...truckLoadDesdeDb('t1', db(), 0, null), kg: 0, fiscal: 'RAFAELA' }
    expect(camposQueDifieren(l, db())).toEqual(['fiscal', 'kg'])
  })

  it('un campo con override no difiere (es una decisión), 0 vs vacío tampoco', () => {
    const l = { ...truckLoadDesdeDb('t1', db(), 0, null), kg: 0, overrides: { kg: true } }
    expect(camposQueDifieren(l, db())).toEqual([])
    const sinDatos = truckLoadDesdeDb('t1', db({ kg: null as unknown as number, wood: null as unknown as boolean }), 0, null)
    expect(camposQueDifieren(sinDatos, db({ kg: 0, wood: false }))).toEqual([])
  })

  it('las etiquetas son las de la lista única de datos clave', () => {
    expect(etiquetaCampoLoad('kg')).toBe('Kilos')
    expect(etiquetaCampoLoad('stock')).toBe('Nº stock')
    expect(etiquetaCampoLoad('bl')).toBe('BL')
    expect(etiquetaCampoLoad('desconsolDate')).toBe('Desconsolidación')
  })
})
