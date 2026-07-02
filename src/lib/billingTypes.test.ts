import { describe, it, expect } from 'vitest'
import { buildBillableItems, getBillingState, hasReachedFinalDb, type BillingRecord } from './billingTypes'
import type { DbShipment } from './operationsTypes'
import type { Truck, TruckLoad } from './truckTypes'
import type { ParsedShipment } from './shipmentTypes'

// Facturación universal — derive-on-read: ninguna carga entregada puede
// quedar fuera de Pendientes salvo que tenga overlay facturada/no_aplica.

const db = (over: Partial<DbShipment>): DbShipment =>
  ({ id: 'shp-1', ref: 'E10', mode: 'lcl', cliente: 'ACME', status: 'en_transito', eta: '', archived: false, ...over }) as DbShipment

const truck = (over: Partial<Truck>): Truck =>
  ({ id: 't1', code: 'C440', status: 'planning', isSider: false, transport: '', driver: '', plate: '', loadDate: '', departureDate: '', arrivalDate: '', notes: '', createdAt: 0, updatedAt: 0, draft: false, pendingEdits: null, costDespacho: 0, costFlete: 0, costCarga: 0, ...over }) as Truck

const load = (over: Partial<TruckLoad>): TruckLoad =>
  ({ id: 'l1', truckId: 't1', sourceType: 'lcl', sourceRef: 'E10', client: '', fiscal: '', kg: 0, m3: 0, pkgs: 0, description: '', mvdArrival: '', desconsolDate: '', overrides: {}, position: 0, pending: null, ...over }) as TruckLoad

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

  // PR-C flip: post-horneado la FCL es una fila DB (mode=fcl, status derivado).
  // El "pendiente" sale de las columnas salida+eta_fiscal, no de status.
  it('FCL horneada (mode=fcl en DB) → pendiente cuando salida y eta_fiscal llegaron', () => {
    const fclDb = db({ id: 'shp-fcl-a7900', ref: 'A7900', mode: 'fcl', status: '', salida: '2026-06-03', eta_fiscal: '2026-06-04' })
    const out = buildBillableItems([], [fclDb], [], [], noBilling)
    expect(out).toHaveLength(1)
    expect(out[0].state).toBe('pendiente')
    expect(out[0].item.mode).toBe('fcl')
  })

  it('FCL horneada sin salida/eta_fiscal → todavía NO facturable', () => {
    const fclDb = db({ ref: 'A7901', mode: 'fcl', status: '', salida: '', eta_fiscal: '' })
    expect(buildBillableItems([], [fclDb], [], [], noBilling)).toHaveLength(0)
  })
})

describe('ficha de compra/venta — la fila con solo gastos/ventas NO cambia el estado', () => {
  // Guardar la ficha de una carga aún pendiente upserta una fila con
  // status='pendiente' + gastos/ventas. Esa fila NO debe marcarla facturada:
  // el estado sigue siendo derive-on-read (solo facturada/no_aplica explícitas
  // ganan). Si esto se rompe, las cargas con ficha desaparecen de Pendientes.
  const fichaRow = (ref: string): BillingRecord => ({
    ref, status: 'pendiente', invoiceNumber: '', invoicedAt: null, invoicedBy: '', updatedAt: '',
    gastos: [{ concepto: 'Flete', monto: 2000 }],
    ventas: [{ concepto: 'Venta flete', monto: 2600 }],
  })

  it('carga DB arribada con ficha guardada (status pendiente) sigue PENDIENTE en la lista/contadores', () => {
    const billing = new Map([['E10', fichaRow('E10')]])
    const out = buildBillableItems([], [db({ status: 'en_fiscal' })], [], [], billing)
    expect(out).toHaveLength(1)
    expect(out[0].state).toBe('pendiente')
  })

  it('FCL de planilla arribada con ficha guardada sigue PENDIENTE (getBillingState no la marca)', () => {
    const fcl = {
      REF: 'A7777', CLIENTE: 'ACME', ETD: '', ETA: '',
      operativas: [{ SALIDA: '2026-01-10', ETA_FISC: '2026-01-12' }],
    } as unknown as ParsedShipment
    const billing = new Map([['A7777', fichaRow('A7777')]])
    expect(getBillingState(fcl, billing)).toBe('pendiente')
    const out = buildBillableItems([fcl], [], [], [], billing)
    expect(out).toHaveLength(1)
    expect(out[0].state).toBe('pendiente')
  })

  it('carga que NO llegó a fiscal con ficha guardada NO aparece todavía (la fila no adelanta el estado)', () => {
    const billing = new Map([['E10', fichaRow('E10')]])
    const out = buildBillableItems([], [db({ status: 'en_transito' })], [], [], billing)
    expect(out).toHaveLength(0)
  })
})

describe('borradores invisibles para facturación', () => {
  it('cargas en camión draft NO derivan estado de camión (carga NO es facturable)', () => {
    // camión entregado pero draft → aunque el status es delivered, no debe
    // derivar estado para las cargas que lleva (el camión no está publicado)
    const t = truck({ draft: true, status: 'delivered', arrivalDate: '2026-06-01' })
    const l = load({ truckId: 't1', sourceRef: 'E10' })
    const out = buildBillableItems([], [db({ status: 'en_transito' })], [t], [l], noBilling)
    // Sin el filtro el camión draft haría la carga facturable; con el filtro: 0
    expect(out).toHaveLength(0)
  })

  it('load pending=add en camión entregado NO hace la carga facturable; pending=remove SÍ (sigue en el camión hasta guardar)', () => {
    const t = truck({ status: 'delivered', arrivalDate: '2026-06-01' })
    // pending='add': borrador de edición — la carga no existe aún en el camión
    const lAdd = load({ id: 'la', truckId: 't1', sourceRef: 'E10', pending: 'add' })
    const outAdd = buildBillableItems([], [db({ status: 'en_transito' })], [t], [lAdd], noBilling)
    expect(outAdd).toHaveLength(0)

    // pending='remove': marcada para quitar pero todavía sigue en el camión hasta guardar
    const lRemove = load({ id: 'lr', truckId: 't1', sourceRef: 'E10', pending: 'remove' })
    const outRemove = buildBillableItems([], [db({ status: 'en_transito' })], [t], [lRemove], noBilling)
    expect(outRemove).toHaveLength(1)
    expect(outRemove[0].state).toBe('pendiente')
  })
})
