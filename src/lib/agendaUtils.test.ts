import { describe, it, expect } from 'vitest'
import type { Truck, TruckLoad } from './truckTypes'
import { trucksToEvents, shipmentsToEvents, pendingSalida } from './agendaUtils'
import type { ParsedShipment, OperativasRecord } from './shipmentTypes'

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
  it('op with both SALIDA and ETA_FISC produces 1 event: only salida (eta_fisc no longer shown)', () => {
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
    expect(events).toHaveLength(1)

    const salida = events.find(e => e.type === 'salida')
    expect(salida).toBeDefined()
    expect(salida?.date).toBe('2026-06-16')
    expect(salida?.cntr).toBe('TEST1234567')
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

  it('op with only ETA_FISC (no SALIDA) produces 0 events (eta_fisc no longer shown on calendar)', () => {
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
    expect(events).toHaveLength(0)
  })
})

// ── pendingSalida ───────────────────────────────────────────────────────────

const TODAY_PS = new Date(2026, 5, 16) // June 16, 2026 (month index 5 = June)
const YESTERDAY_PS = '2026-06-15'
const TOMORROW_PS = '2026-06-17'

function mkOp(partial: Partial<OperativasRecord> = {}): OperativasRecord {
  return {
    REF: 'A7999', TLX: '', DEPOSITO: 'GODILCO',
    ETA_OP: YESTERDAY_PS, SALIDA: '', ETA_FISC: '',
    LIBRE: '', OPERATIVA: 'TRASIEGO', CNTR_OP: 'TEST1234567',
    PKGS: 100, KG: 1000, M3: 10, DESCRIPCION: '',
    FISCAL: '', DESCARGA: '', DEV: '',
    CLIENTE_OP: 'PERETTI', TIPO: '40HC', WOOD: '',
    TRANSPORTE: '', HORARIO: '',
    ...partial,
  }
}

function mkShipPS(over: Partial<ParsedShipment> = {}): ParsedShipment {
  return {
    REF: 'A7999', CLIENTE: 'PERETTI',
    ETD: '2026-06-01', ETA: YESTERDAY_PS,
    FT: 0, LIBRE_HASTA: '', CNTR: 'TEST1234567', N: 1,
    MBL: '', LINEA: '', BUQUE: '', TERMINAL: '',
    C_TERMINAL: 0, C_DEV: 0, LOCALES: 0, FLETE: 0,
    FORMA_DE_PAGO: 'al arribo', VTO: '',
    CR: false, BL: false, AD: false, AT: false,
    POL: '', POD: '', PAIS: 'AR', SEGUIMIENTO: '', TIPO: '',
    containers: [], calculatedN: 1, calculatedLibreHasta: '',
    ...over,
  }
}

describe('pendingSalida', () => {
  it('arrived + no salida → included', () => {
    const s = mkShipPS({ operativas: [mkOp()] })
    const result = pendingSalida([s], TODAY_PS)
    expect(result).toHaveLength(1)
    expect(result[0].op.CNTR_OP).toBe('TEST1234567')
  })

  it('has SALIDA → excluded', () => {
    const s = mkShipPS({ operativas: [mkOp({ SALIDA: '2026-06-15' })] })
    expect(pendingSalida([s], TODAY_PS)).toHaveLength(0)
  })

  it('future ETA → excluded', () => {
    // shipment.ETA is preferred over op.ETA_OP; both future here
    const s = mkShipPS({ ETA: TOMORROW_PS, operativas: [mkOp({ ETA_OP: TOMORROW_PS })] })
    expect(pendingSalida([s], TODAY_PS)).toHaveLength(0)
  })

  it('shipment.ETA today-or-past wins over junk op.ETA_OP', () => {
    // Real case: op.ETA_OP = '2001-09-01' (junk), shipment.ETA = yesterday (arrived)
    const s = mkShipPS({ ETA: YESTERDAY_PS, operativas: [mkOp({ ETA_OP: '2001-09-01' })] })
    expect(pendingSalida([s], TODAY_PS)).toHaveLength(1)
  })

  it('ETA exactly today → included (arrived today counts)', () => {
    const s = mkShipPS({ ETA: '2026-06-16', operativas: [mkOp({ ETA_OP: '2026-06-16' })] })
    expect(pendingSalida([s], TODAY_PS)).toHaveLength(1)
  })

  it('no container number → excluded', () => {
    const s = mkShipPS({
      CNTR: '',
      operativas: [mkOp({ CNTR_OP: '' })],
    })
    expect(pendingSalida([s], TODAY_PS)).toHaveLength(0)
  })

  it('SALIDA = "CONFIRMAR" → included (placeholder = not coordinated)', () => {
    const s = mkShipPS({ operativas: [mkOp({ SALIDA: 'CONFIRMAR' })] })
    expect(pendingSalida([s], TODAY_PS)).toHaveLength(1)
  })

  it('SALIDA = "#N/A" → included (placeholder = not coordinated)', () => {
    const s = mkShipPS({ operativas: [mkOp({ SALIDA: '#N/A' })] })
    expect(pendingSalida([s], TODAY_PS)).toHaveLength(1)
  })

  it('SALIDA = real date → still excluded', () => {
    const s = mkShipPS({ operativas: [mkOp({ SALIDA: '2026-06-18' })] })
    expect(pendingSalida([s], TODAY_PS)).toHaveLength(0)
  })

  // ── New exclusion: A6820-like — LIBRE contains 'DEVUELTO' ──────────────

  it('LIBRE = "DEVUELTO" (container returned) → excluded', () => {
    // Real case: A6820, libre='DEVUELTO', operativa='CARGA A PISO', salida='CONFIRMAR'
    const s = mkShipPS({
      operativas: [mkOp({ SALIDA: 'CONFIRMAR', LIBRE: 'DEVUELTO', OPERATIVA: 'CARGA A PISO' })],
    })
    expect(pendingSalida([s], TODAY_PS)).toHaveLength(0)
  })

  it('LIBRE contains "DEVUELTO" text (case-insensitive) → excluded', () => {
    const s = mkShipPS({
      operativas: [mkOp({ SALIDA: 'CONFIRMAR', LIBRE: 'devuelto' })],
    })
    expect(pendingSalida([s], TODAY_PS)).toHaveLength(0)
  })

  it('LIBRE_HASTA on shipment containing "DEVUELTO" → excluded', () => {
    const s = mkShipPS({
      LIBRE_HASTA: 'DEVUELTO',
      operativas: [mkOp({ SALIDA: 'CONFIRMAR', LIBRE: '' })],
    })
    expect(pendingSalida([s], TODAY_PS)).toHaveLength(0)
  })

  // ── New exclusion: CARGA A PISO / DESCONSOLIDACION ────────────────────

  it('OPERATIVA = "CARGA A PISO" → excluded (deconsolidated, no trasiego needed)', () => {
    const s = mkShipPS({
      operativas: [mkOp({ SALIDA: 'CONFIRMAR', OPERATIVA: 'CARGA A PISO' })],
    })
    expect(pendingSalida([s], TODAY_PS)).toHaveLength(0)
  })

  it('OPERATIVA = "DESCONSOLIDACION" → excluded', () => {
    const s = mkShipPS({
      operativas: [mkOp({ SALIDA: 'CONFIRMAR', OPERATIVA: 'DESCONSOLIDACION' })],
    })
    expect(pendingSalida([s], TODAY_PS)).toHaveLength(0)
  })

  it('OPERATIVA = "DESCONSOLIDACIÓN" (accented) → excluded', () => {
    const s = mkShipPS({
      operativas: [mkOp({ SALIDA: 'CONFIRMAR', OPERATIVA: 'DESCONSOLIDACIÓN' })],
    })
    expect(pendingSalida([s], TODAY_PS)).toHaveLength(0)
  })

  it('OPERATIVA = "DESCONSOLIDADO" → excluded', () => {
    const s = mkShipPS({
      operativas: [mkOp({ SALIDA: 'CONFIRMAR', OPERATIVA: 'DESCONSOLIDADO' })],
    })
    expect(pendingSalida([s], TODAY_PS)).toHaveLength(0)
  })

  it('OPERATIVA = "TRASIEGO" (active) + arrived + no salida → still included', () => {
    const s = mkShipPS({
      operativas: [mkOp({ OPERATIVA: 'TRASIEGO', SALIDA: '' })],
    })
    expect(pendingSalida([s], TODAY_PS)).toHaveLength(1)
  })

  // ── dest zone field ───────────────────────────────────────────────────

  it('dest = UY when PAIS = UY', () => {
    const s = mkShipPS({ PAIS: 'UY', operativas: [mkOp()] })
    const result = pendingSalida([s], TODAY_PS)
    expect(result[0].dest).toBe('UY')
  })

  it('dest = AR when PAIS = AR', () => {
    const s = mkShipPS({ PAIS: 'AR', operativas: [mkOp()] })
    expect(pendingSalida([s], TODAY_PS)[0].dest).toBe('AR')
  })

  it('dest = CL when PAIS = CL', () => {
    const s = mkShipPS({ PAIS: 'CL', operativas: [mkOp()] })
    expect(pendingSalida([s], TODAY_PS)[0].dest).toBe('CL')
  })

  it('dest = OTRO when PAIS is unrecognized', () => {
    const s = mkShipPS({ PAIS: 'OTRO', operativas: [mkOp()] })
    expect(pendingSalida([s], TODAY_PS)[0].dest).toBe('OTRO')
  })

  // ── Sorting ───────────────────────────────────────────────────────────

  it('sorted by LIBRE urgency: overdue first, then soonest, no-LIBRE last', () => {
    const opOverdue = mkOp({ CNTR_OP: 'C1', ETA_OP: YESTERDAY_PS, LIBRE: '2026-06-14' }) // 2d overdue
    const opSoon    = mkOp({ CNTR_OP: 'C2', ETA_OP: YESTERDAY_PS, LIBRE: '2026-06-20' }) // 4d away
    const opNoLibre = mkOp({ CNTR_OP: 'C3', ETA_OP: YESTERDAY_PS, LIBRE: '' })           // no LIBRE

    const s = mkShipPS({ operativas: [opNoLibre, opSoon, opOverdue] })
    const result = pendingSalida([s], TODAY_PS)
    expect(result).toHaveLength(3)
    expect(result[0].op.CNTR_OP).toBe('C1') // overdue → first
    expect(result[1].op.CNTR_OP).toBe('C2') // soonest LIBRE
    expect(result[2].op.CNTR_OP).toBe('C3') // no LIBRE → last
  })
})
