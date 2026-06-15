import { describe, it, expect } from 'vitest'
import type { Truck, TruckLoad } from './truckTypes'
import { trucksToEvents } from './agendaUtils'

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

describe('trucksToEvents — fecha única cuando carga == salida', () => {
  it('trucksToEvents: carga == salida → un solo evento', () => {
    const t = truck({ loadDate: '2026-06-15', departureDate: '2026-06-15' })
    expect(trucksToEvents([t], [])).toHaveLength(1)
  })
  it('trucksToEvents: fechas distintas (camión viejo) → dos eventos', () => {
    const t = truck({ loadDate: '2026-06-15', departureDate: '2026-06-16' })
    expect(trucksToEvents([t], [])).toHaveLength(2)
  })
})

describe('trucksToEvents — borradores invisibles en agenda', () => {
  it('trucksToEvents ignora camiones draft aunque tengan fechas válidas', () => {
    const t = truck({ draft: true, loadDate: '2026-06-15', departureDate: '2026-06-16' })
    expect(trucksToEvents([t], [])).toHaveLength(0)
  })

  it('trucksToEvents incluye camiones publicados normalmente', () => {
    const t = truck({ draft: false, loadDate: '2026-06-15' })
    // Un camión publicado con loadDate válida debe generar al menos un evento
    const events = trucksToEvents([t], [])
    expect(events.length).toBeGreaterThan(0)
  })

  it('loads pending=add no se suman a los totales del evento del camión', () => {
    const t = truck({ draft: false, departureDate: '2026-06-16' })
    const confirmed = load({ id: 'a', m3: 5, kg: 100, pkgs: 2, pending: null })
    const addPending = load({ id: 'b', m3: 10, kg: 200, pkgs: 5, pending: 'add' })
    const events = trucksToEvents([t], [confirmed, addPending])
    // Solo la carga confirmada debe sumar (m3=5, kg=100, pkgs=2)
    expect(events[0].m3).toBe(5)
    expect(events[0].kg).toBe(100)
    expect(events[0].pkgs).toBe(2)
  })
})
