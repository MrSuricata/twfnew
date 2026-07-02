import { describe, it, expect } from 'vitest'
import { buildPlanOperativoData, listPlanClientes } from './planOperativoPdf'
import type { ParsedShipment, OperativasRecord } from './shipmentTypes'
import type { DbShipment } from './operationsTypes'

// HOY fijo para los cortes de fecha: 02/07/2026.
const HOY = new Date(2026, 6, 2)

const op = (over: Partial<OperativasRecord> = {}): OperativasRecord =>
  ({
    REF: 'A7600', CNTR_OP: 'MSKU1111111', OPERATIVA: 'TRASIEGO', SALIDA: '',
    ETA_FISC: '', LIBRE: '2026-07-20', PKGS: 10, KG: 1000, M3: 0,
    DESCRIPCION: 'BICICLETAS', TIPO: '40HC', ...over,
  } as OperativasRecord)

const fcl = (over: Partial<ParsedShipment> = {}): ParsedShipment =>
  ({
    REF: 'A7600', CLIENTE: 'BICI PERETTI S.A.', ETD: '2026-05-01', ETA: '2026-07-10',
    CNTR: '', TIPO: '', TERMINAL: 'TCP', BUQUE: 'MAERSK SAN LAZARO',
    LIBRE_HASTA: '', calculatedLibreHasta: '', operativas: [op()], ...over,
  } as ParsedShipment)

const dbFcl = (over: Partial<DbShipment> = {}): DbShipment =>
  ({
    id: 'db-1', ref: 'A7700', mode: 'fcl', source: 'fcl', cliente: 'TOMASELLI',
    eta: '2026-07-15', archived: false, pkgs: 0, kg: 0, ...over,
  } as unknown as DbShipment)

describe('buildPlanOperativoData — filtro por cliente y una fila por contenedor', () => {
  it('matchea CLIENTE con word-boundary (PERETTI ∈ "BICI PERETTI S.A.", ∉ "PERETTIANI") y saca la A de la ref', () => {
    const cache = [
      fcl({ operativas: [op({ CNTR_OP: 'C1' }), op({ CNTR_OP: 'C2' })] }),
      fcl({ REF: 'A7601', CLIENTE: 'PERETTIANI SRL' }),
    ]
    const data = buildPlanOperativoData(cache, [], ['PERETTI'], HOY)
    expect(data.blocks).toHaveLength(1)
    const rows = [...data.blocks[0].programadas, ...data.blocks[0].pendientes]
    expect(rows).toHaveLength(2) // una fila POR CONTENEDOR, solo la carga de PERETTI
    expect(rows.map(r => r.cntr).sort()).toEqual(['C1', 'C2'])
    expect(rows[0].ref).toBe('7600') // sin la "A" — regla de cara al cliente
  })

  it('ETA_FISC pasada → afuera; futura o vacía → adentro', () => {
    const cache = [fcl({
      operativas: [
        op({ CNTR_OP: 'LLEGO', ETA_FISC: '2026-07-01' }),   // ayer → ya llegó a fiscal
        op({ CNTR_OP: 'VIENE', ETA_FISC: '2026-07-10' }),   // futura → activa
        op({ CNTR_OP: 'SIN', ETA_FISC: '' }),               // vacía → activa
      ],
    })]
    const data = buildPlanOperativoData(cache, [], ['PERETTI'], HOY)
    const rows = [...data.blocks[0].programadas, ...data.blocks[0].pendientes]
    expect(rows.map(r => r.cntr).sort()).toEqual(['SIN', 'VIENE'])
  })

  it('"DEVUELTO" vive en LIBRE y no decide: devuelto + fiscal pasada afuera, devuelto + fiscal vacía sigue pendiente', () => {
    const cache = [fcl({
      operativas: [
        op({ CNTR_OP: 'TERMINADO', LIBRE: 'DEVUELTO', ETA_FISC: '2026-06-20' }), // llegó → afuera
        op({ CNTR_OP: 'DEVUELTO_PEND', LIBRE: 'DEVUELTO', ETA_FISC: '' }),       // sin fiscal → activo
      ],
    })]
    const data = buildPlanOperativoData(cache, [], ['PERETTI'], HOY)
    const rows = [...data.blocks[0].programadas, ...data.blocks[0].pendientes]
    expect(rows.map(r => r.cntr)).toEqual(['DEVUELTO_PEND'])
    expect(rows[0].libre).toBe('DEVUELTO') // el texto se muestra tal cual
  })

  it('secciones: SALIDA fechada → programadas por salida asc; sin salida (o texto) → pendientes por ETA asc', () => {
    const cache = [fcl({
      operativas: [
        op({ CNTR_OP: 'P2', SALIDA: '2026-07-08' }),
        op({ CNTR_OP: 'P1', SALIDA: '2026-07-05' }),
        op({ CNTR_OP: 'TXT', SALIDA: 'COORDINADO' }),  // texto ≠ fechada → pendiente
      ],
    }), fcl({ REF: 'A7610', ETA: '2026-07-04', operativas: [op({ CNTR_OP: 'E1' })] }),
        fcl({ REF: 'A7611', ETA: '', operativas: [op({ CNTR_OP: 'SIN_ETA' })] })]
    const data = buildPlanOperativoData(cache, [], ['PERETTI'], HOY)
    expect(data.blocks[0].programadas.map(r => r.cntr)).toEqual(['P1', 'P2'])
    // pendientes: ETA 04/07 primero, luego 10/07 (TXT), ETA vacía al final
    expect(data.blocks[0].pendientes.map(r => r.cntr)).toEqual(['E1', 'TXT', 'SIN_ETA'])
  })

  it('excluye archivadas y arma un bloque por cliente con totales correctos', () => {
    const cache = [fcl({ operativas: [op({ SALIDA: '2026-07-05', PKGS: 10, KG: 1000 })] })]
    const db = [
      dbFcl({ operativas: [op({ REF: 'A7700', CNTR_OP: 'T1', PKGS: 5, KG: 500 })] }),
      dbFcl({ id: 'db-2', ref: 'A7701', archived: true }),  // archivada → afuera
    ]
    const data = buildPlanOperativoData(cache, db, ['PERETTI', 'TOMASELLI'], HOY)
    expect(data.blocks.map(b => b.cliente)).toEqual(['PERETTI', 'TOMASELLI'])
    expect(data.blocks[1].pendientes.map(r => r.cntr)).toEqual(['T1'])
    expect(data.totals).toEqual({ contenedores: 2, bultos: 15, kg: 1500, programadas: 1, pendientes: 1 })
  })

  it('carga sin operativas: nueva → fila sintética pendiente (bultos/kg de la DB); histórica (ETA > 60 días atrás) → afuera', () => {
    const db = [dbFcl({ pkgs: 5, kg: 800, contenedor: 'TCLU2222222', tipo: '20DRY' })]
    const cache = [fcl({ REF: 'A7300', CLIENTE: 'ELDA', ETA: '2026-03-01', operativas: [] })]
    const data = buildPlanOperativoData(cache, db, ['TOMASELLI', 'ELDA'], HOY)
    const tom = data.blocks[0]
    expect(tom.programadas).toHaveLength(0)
    expect(tom.pendientes).toHaveLength(1)
    expect(tom.pendientes[0]).toMatchObject({ ref: '7700', cntr: 'TCLU2222222', tipo: '20DRY', pkgs: 5, kg: 800 })
    expect(data.blocks[1].pendientes).toHaveLength(0) // histórica no se resucita

    // listPlanClientes: distintos con conteo, orden alfabético, sin la histórica
    const clientes = listPlanClientes([...cache, fcl()], db, HOY)
    expect(clientes).toEqual([
      { name: 'BICI PERETTI S.A.', cargas: 1 },
      { name: 'TOMASELLI', cargas: 1 },
    ])
  })
})
