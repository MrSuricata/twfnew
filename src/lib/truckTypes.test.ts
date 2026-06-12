import { describe, it, expect } from 'vitest'
import type { Truck, TruckLoad } from './truckTypes'
import {
  applyTruckPending, effectiveTruckLoads, hasDraftState, truckCostPerM3, costColor,
} from './truckTypes'
import { discardPendingArrays } from './truckUtils'

const truck = (over: Partial<Truck> = {}): Truck =>
  ({
    id: 't1', code: 'C450', status: 'planning', isSider: false, transport: '', driver: '',
    plate: '', loadDate: '', departureDate: '', arrivalDate: '', notes: '',
    createdAt: 0, updatedAt: 0, draft: false, pendingEdits: null,
    costDespacho: 0, costFlete: 0, costCarga: 0, ...over,
  }) as Truck

const load = (over: Partial<TruckLoad> = {}): TruckLoad =>
  ({
    id: 'l1', truckId: 't1', sourceType: 'lcl', sourceRef: 'E1', client: '', fiscal: '',
    kg: 100, m3: 10, pkgs: 1, description: '', mvdArrival: '', desconsolDate: '',
    overrides: {}, position: 0, pending: null, ...over,
  }) as TruckLoad

describe('applyTruckPending — overlay sobre publicado', () => {
  it('sin overlay devuelve el mismo camión; con overlay pisa solo lo editado', () => {
    const t = truck({ transport: 'OLAVERRY' })
    expect(applyTruckPending(t)).toBe(t)
    const edited = applyTruckPending(truck({ transport: 'OLAVERRY', pendingEdits: { transport: 'TRANSCAL', loadDate: '2026-06-15' } }))
    expect(edited.transport).toBe('TRANSCAL')
    expect(edited.loadDate).toBe('2026-06-15')
    expect(edited.code).toBe('C450')
  })
})

describe('effectiveTruckLoads — qué cargas cuentan', () => {
  const loads = [
    load({ id: 'a' }),
    load({ id: 'b', pending: 'add' }),
    load({ id: 'c', pending: 'remove' }),
    load({ id: 'x', truckId: 'OTRO' }),
  ]
  it('derivaciones (includePending=false): confirmadas + las marcadas para quitar', () => {
    expect(effectiveTruckLoads(loads, 't1', { includePending: false }).map(l => l.id)).toEqual(['a', 'c'])
  })
  it('armador (includePending=true): confirmadas + agregadas, sin las marcadas para quitar', () => {
    expect(effectiveTruckLoads(loads, 't1', { includePending: true }).map(l => l.id)).toEqual(['a', 'b'])
  })
})

describe('hasDraftState — badges', () => {
  it('draft gana; overlay o loads pending = pending; nada = null', () => {
    expect(hasDraftState(truck({ draft: true }), [])).toBe('draft')
    expect(hasDraftState(truck({ pendingEdits: { transport: 'X' } }), [])).toBe('pending')
    expect(hasDraftState(truck(), [load({ pending: 'add' })])).toBe('pending')
    expect(hasDraftState(truck(), [load()])).toBe(null)
    expect(hasDraftState(truck({ pendingEdits: {} }), [])).toBe(null)
  })
})

describe('truckCostPerM3 + costColor', () => {
  it('divide costos totales por m3 del armado (incluye pending add, excluye remove)', () => {
    const t = truck({ costDespacho: 300, costFlete: 400, costCarga: 100 })
    const loads = [load({ m3: 5 }), load({ id: 'b', m3: 5, pending: 'add' }), load({ id: 'c', m3: 99, pending: 'remove' })]
    const r = truckCostPerM3(t, loads)
    expect(r).toEqual({ total: 800, m3: 10, perM3: 80 })
  })
  it('usa el overlay de costos si existe', () => {
    const t = truck({ costDespacho: 100, pendingEdits: { costDespacho: 200 } })
    expect(truckCostPerM3(t, [load({ m3: 4 })]).perM3).toBe(50)
  })
  it('sin m3 o sin costos → perM3 null (no se muestra el semáforo)', () => {
    expect(truckCostPerM3(truck({ costFlete: 500 }), []).perM3).toBe(null)
    expect(truckCostPerM3(truck(), [load()]).perM3).toBe(null)
  })
  it('semáforo: <75 verde · 75-80 amarillo (bordes incluidos) · >80 rojo', () => {
    expect(costColor(74.99)).toBe('green')
    expect(costColor(75)).toBe('yellow')
    expect(costColor(80)).toBe('yellow')
    expect(costColor(80.01)).toBe('red')
  })
})

describe('discardPendingArrays — cancelar overlay de un publicado', () => {
  it('limpia pendingEdits, borra loads add, des-marca remove', () => {
    const trucks = [truck({ pendingEdits: { transport: 'X' } }), truck({ id: 't2' })]
    const loads = [load({ id: 'a' }), load({ id: 'b', pending: 'add' }), load({ id: 'c', pending: 'remove' })]
    const r = discardPendingArrays(trucks, loads, 't1')
    expect(r.trucks.find(t => t.id === 't1')!.pendingEdits).toBe(null)
    expect(r.loads.map(l => l.id)).toEqual(['a', 'c'])
    expect(r.loads.find(l => l.id === 'c')!.pending).toBe(null)
    expect(r.deleteLoadIds).toEqual(['b'])
    expect(r.trucks.find(t => t.id === 't2')).toEqual(trucks[1])
  })
})
