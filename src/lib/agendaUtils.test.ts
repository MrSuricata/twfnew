import { describe, it, expect } from 'vitest'
import type { Truck, TruckLoad } from './truckTypes'
import { trucksToEvents, shipmentsToEvents } from './agendaUtils'
import type { ParsedShipment } from './shipmentTypes'

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

// ── shipmentsToEvents — eta_fisc events ────────────────────────────────────

const makeShipment = (over: Partial<ParsedShipment> = {}): ParsedShipment => ({
  REF: 'A7999',
  CLIENTE: 'PERETTI',
  ETD: '2026-06-01',
  ETA: '2026-06-10',
  FT: 0,
  LIBRE_HASTA: '',
  CNTR: 'TEST1234567',
  N: 1,
  MBL: '',
  LINEA: '',
  BUQUE: '',
  TERMINAL: '',
  C_TERMINAL: 0,
  C_DEV: 0,
  LOCALES: 0,
  FLETE: 0,
  FORMA_DE_PAGO: 'al arribo',
  VTO: '',
  CR: false,
  BL: false,
  AD: false,
  AT: false,
  POL: '',
  POD: '',
  PAIS: 'AR',
  SEGUIMIENTO: '',
  TIPO: '',
  containers: [],
  calculatedN: 1,
  calculatedLibreHasta: '',
  ...over,
})

describe('shipmentsToEvents — eta_fisc events', () => {
  it('op with both SALIDA and ETA_FISC produces 2 events: one salida and one eta_fisc', () => {
    const shipment = makeShipment({
      operativas: [
        {
          REF: 'A7999',
          TLX: '', DEPOSITO: 'GODILCO', ETA_OP: '2026-06-10',
          SALIDA: '2026-06-16',
          ETA_FISC: '2026-06-18',
          LIBRE: '', OPERATIVA: 'TRASIEGO',
          CNTR_OP: 'TEST1234567',
          PKGS: 100, KG: 1000, M3: 10, DESCRIPCION: 'BICIS',
          FISCAL: 'ZP RAFAELA', DESCARGA: '', DEV: '',
          CLIENTE_OP: 'PERETTI', TIPO: '40HC', WOOD: '',
          TRANSPORTE: 'OLAVERRY', HORARIO: '', LUGAR_SALIDA: '',
        }
      ],
    })

    const events = shipmentsToEvents([shipment])
    expect(events).toHaveLength(2)

    const salida = events.find(e => e.type === 'salida')
    const etaFisc = events.find(e => e.type === 'eta_fisc')

    expect(salida).toBeDefined()
    expect(salida?.date).toBe('2026-06-16')
    expect(salida?.cntr).toBe('TEST1234567')

    expect(etaFisc).toBeDefined()
    expect(etaFisc?.date).toBe('2026-06-18')
    expect(etaFisc?.cntr).toBe('TEST1234567')
  })

  it('op with only SALIDA (no ETA_FISC) produces 1 event', () => {
    const shipment = makeShipment({
      operativas: [
        {
          REF: 'A7999',
          TLX: '', DEPOSITO: 'GODILCO', ETA_OP: '2026-06-10',
          SALIDA: '2026-06-16', ETA_FISC: '',
          LIBRE: '', OPERATIVA: 'TRASIEGO', CNTR_OP: 'TEST1234567',
          PKGS: 100, KG: 1000, M3: 10, DESCRIPCION: '',
          FISCAL: '', DESCARGA: '', DEV: '', CLIENTE_OP: 'PERETTI',
          TIPO: '40HC', WOOD: '', TRANSPORTE: '', HORARIO: '', LUGAR_SALIDA: '',
        }
      ],
    })
    const events = shipmentsToEvents([shipment])
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('salida')
  })

  it('op with only ETA_FISC (no SALIDA) produces 1 eta_fisc event', () => {
    const shipment = makeShipment({
      operativas: [
        {
          REF: 'A7999',
          TLX: '', DEPOSITO: 'GODILCO', ETA_OP: '2026-06-10',
          SALIDA: '', ETA_FISC: '2026-06-18',
          LIBRE: '', OPERATIVA: 'TRASIEGO', CNTR_OP: 'TEST1234567',
          PKGS: 100, KG: 1000, M3: 10, DESCRIPCION: '',
          FISCAL: '', DESCARGA: '', DEV: '', CLIENTE_OP: 'PERETTI',
          TIPO: '40HC', WOOD: '', TRANSPORTE: '', HORARIO: '', LUGAR_SALIDA: '',
        }
      ],
    })
    const events = shipmentsToEvents([shipment])
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('eta_fisc')
    expect(events[0].date).toBe('2026-06-18')
  })
})
