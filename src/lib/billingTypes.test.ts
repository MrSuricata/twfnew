import { describe, it, expect } from 'vitest'
import { buildBillableItems, hasReachedFinalDb, type BillingRecord } from './billingTypes'
import type { DbShipment } from './operationsTypes'
import type { Truck, TruckLoad } from './truckTypes'
import type { ParsedShipment } from './shipmentTypes'

// Facturación universal — derive-on-read: ninguna carga entregada puede
// quedar fuera de Pendientes salvo que tenga overlay facturada/no_aplica.

const db = (over: Partial<DbShipment>): DbShipment =>
  ({ id: 'shp-1', ref: 'E10', mode: 'lcl', cliente: 'ACME', status: 'en_transito', eta: '', archived: false, ...over }) as DbShipment

const truck = (over: Partial<Truck>): Truck =>
  ({ id: 't1', code: 'C440', status: 'planning', isSider: false, transport: '', driver: '', plate: '', loadDate: '', departureDate: '', arrivalDate: '', notes: '', createdAt: 0, updatedAt: 0, ...over }) as Truck

const load = (over: Partial<TruckLoad>): TruckLoad =>
  ({ id: 'l1', truckId: 't1', sourceType: 'lcl', sourceRef: 'E10', client: '', fiscal: '', kg: 0, m3: 0, pkgs: 0, description: '', mvdArrival: '', desconsolDate: '', overrides: {}, position: 0, ...over }) as TruckLoad

const noBilling = new Map<string, BillingRecord>()

describe('hasReachedFinalDb', () => {
  it('en_fiscal y devuelto → facturable; en tránsito no', () => {
    expect(hasReachedFinalDb('en_fiscal')).toBe(true)
    expect(hasReachedFinalDb('devuelto')).toBe(true)
    expect(hasReachedFinalDb('en_transito')).toBe(false)
    expect(hasReachedFinalDb('')).toBe(false)
  })
})

describe('buildBillableItems — universal', () => {
  it('LCL con status manual en_fiscal entra como pendiente', () => {
    const out = buildBillableItems([], [db({ status: 'en_fiscal' })], [], [], noBilling)
    expect(out).toHaveLength(1)
    expect(out[0].state).toBe('pendiente')
    expect(out[0].item.mode).toBe('lcl')
  })

  it('carga en camión ARRIBADO entra como pendiente aunque su status manual sea viejo (deriva del camión)', () => {
    const t = truck({ status: 'delivered', arrivalDate: '2026-06-01' })
    const out = buildBillableItems([], [db({ status: 'en_transito' })], [t], [load({})], noBilling)
    expect(out).toHaveLength(1)
    expect(out[0].state).toBe('pendiente')
    expect(out[0].item.truckCode).toBe('C440')
  })

  it('camión en viaje → la carga todavía NO es facturable', () => {
    const t = truck({ status: 'in_transit', departureDate: '2026-06-01' })
    const out = buildBillableItems([], [db({ status: 'en_transito' })], [t], [load({})], noBilling)
    expect(out).toHaveLength(0)
  })

  it('overlay facturada/no_aplica gana sobre el derivado', () => {
    const billing = new Map<string, BillingRecord>([
      ['E10', { ref: 'E10', status: 'facturada', invoiceNumber: 'A-1', invoicedAt: '2026-06-05T00:00:00Z', invoicedBy: 'admin', updatedAt: '' }],
    ])
    const out = buildBillableItems([], [db({ status: 'en_fiscal' })], [], [], billing)
    expect(out[0].state).toBe('facturada')
  })

  it('carga archivada entregada SIGUE apareciendo (archivar no es una fuga de facturación)', () => {
    const out = buildBillableItems([], [db({ status: 'devuelto', archived: true })], [], [], noBilling)
    expect(out).toHaveLength(1)
    expect(out[0].state).toBe('pendiente')
  })

  it('FCL del cache con refs duplicadas → una sola entrada de facturación por ref', () => {
    const fcl = (cliente: string): ParsedShipment =>
      ({ REF: 'A6791', CLIENTE: cliente, ETD: '', ETA: '', operativas: [
        { SALIDA: '2026-01-10', ETA_FISC: '2026-01-12' },
      ] }) as unknown as ParsedShipment
    const out = buildBillableItems([fcl('UNO'), fcl('DOS')], [], [], [], noBilling)
    expect(out).toHaveLength(1)
    expect(out[0].item.mode).toBe('fcl')
  })
})
