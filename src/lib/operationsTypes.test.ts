import { describe, it, expect } from 'vitest'
import { buildOperations, isOperationActive, type UnifiedOperation } from './operationsTypes'
import type { ParsedShipment } from './shipmentTypes'

// La planilla reutiliza refs (caso real: A6902 con dos clientes distintos,
// A7095 split en dos filas). La grilla debe mostrar AMBAS con uid distinto
// (sin uid único, React colisiona keys y deja filas "fantasma" entre filtros).
const fcl = (over: Partial<ParsedShipment> = {}): ParsedShipment =>
  ({ REF: 'A6902', CLIENTE: 'X', ETD: '', ETA: '', operativas: [], ...over }) as ParsedShipment

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
  ({ source: 'fcl', ref: 'A1', libre: '', salida: '', etaFisc: '', eta: '', status: '', ...over }) as UnifiedOperation

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
    expect(isOperationActive(op({ source: 'db', status: 'en_fiscal' }), undefined, TODAY)).toBe(false)
    expect(isOperationActive(op({ source: 'db', status: 'devuelto' }), undefined, TODAY)).toBe(false)
    expect(isOperationActive(op({ source: 'db', status: 'en_transito' }), undefined, TODAY)).toBe(true)
  })
  it('DB en camión: el estado derivado del camión manda', () => {
    expect(isOperationActive(op({ source: 'db', status: 'en_transito' }), 'en_fiscal', TODAY)).toBe(false)
    expect(isOperationActive(op({ source: 'db', status: 'en_fiscal' }), 'en_frontera', TODAY)).toBe(true)
  })
})
