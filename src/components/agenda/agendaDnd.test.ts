/**
 * agendaDnd.test.ts — Unit tests for the dropPatch pure function.
 *
 * Tests are isolated from React/DOM: dropPatch takes buildPatchedOperativas
 * as a parameter so we can inject a real or stub implementation.
 */

import { describe, it, expect } from 'vitest'
import { dropPatch } from './agendaDnd'
import { buildPatchedOperativas } from '../operations/ContainerQuickEdit'
import type { CalendarEvent } from '@/lib/agendaTypes'
import type { ParsedShipment, OperativasRecord } from '@/lib/shipmentTypes'

// ─── Test fixture helpers ────────────────────────────────────────────────

function makeOp(cntr: string, overrides: Partial<OperativasRecord> = {}): OperativasRecord {
  return {
    REF: 'A7500',
    TLX: '',
    DEPOSITO: 'GODILCO',
    ETA_OP: '2026-06-20',
    SALIDA: '2026-06-22',
    ETA_FISC: '2026-06-25',
    LIBRE: '2026-06-30',
    OPERATIVA: 'TRASIEGO',
    CNTR_OP: cntr,
    PKGS: 100,
    KG: 5000,
    M3: 20,
    DESCRIPCION: 'BICICLETAS',
    FISCAL: 'CACEC',
    DESCARGA: '',
    DEV: '',
    CLIENTE_OP: 'PERETTI',
    TIPO: '40HC',
    WOOD: 'NO',
    TRANSPORTE: 'OLAVERRY',
    HORARIO: '',
    LUGAR_SALIDA: '',
    ...overrides,
  }
}

function makeShipment(
  dbId: string | undefined,
  ops: OperativasRecord[]
): ParsedShipment {
  return {
    REF: 'A7500',
    CLIENTE: 'PERETTI',
    ETD: '2026-06-10',
    ETA: '2026-06-20',
    FT: 0,
    LIBRE_HASTA: '2026-06-30',
    CNTR: 'TEMU1234567',
    N: 1,
    MBL: 'MBLA7500',
    LINEA: 'ONE',
    BUQUE: 'TIGER GAUCHO',
    TERMINAL: 'TCP',
    C_TERMINAL: 0,
    C_DEV: 0,
    LOCALES: 0,
    FLETE: 0,
    FORMA_DE_PAGO: 'programado',
    VTO: '',
    CR: false,
    BL: false,
    AD: false,
    AT: false,
    POL: 'CNSHA',
    POD: 'UYMVD',
    PAIS: 'UY',
    SEGUIMIENTO: '',
    TIPO: '40HC',
    containers: [{ number: 'TEMU1234567', valid: true }],
    calculatedN: 1,
    calculatedLibreHasta: '2026-06-30',
    operativas: ops,
    __dbId: dbId,
  }
}

function makeEvent(
  type: CalendarEvent['type'],
  date: string,
  cntr: string,
  shipment: ParsedShipment
): CalendarEvent {
  const op = shipment.operativas?.find(o => o.CNTR_OP === cntr) ?? makeOp(cntr)
  return {
    id: `A7500-${cntr}-${type}`,
    date,
    type,
    ref: 'A7500',
    operativa: 'TRASIEGO',
    cntr,
    tipo: '40HC',
    cliente: 'PERETTI',
    fiscal: 'CACEC',
    deposito: 'GODILCO',
    libre: '2026-06-30',
    descripcion: 'BICICLETAS',
    kg: 5000,
    pkgs: 100,
    m3: 20,
    transporte: 'OLAVERRY',
    alerts: [],
    shipment,
    op,
    statusColor: '',
    statusLabel: '',
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('dropPatch', () => {
  const CNTR = 'TEMU1234567'
  const OTHER_CNTR = 'TCKU9876543'

  it('salida event → patches SALIDA for the matching cntr, other ops untouched', () => {
    const op1 = makeOp(CNTR, { SALIDA: '2026-06-22' })
    const op2 = makeOp(OTHER_CNTR, { SALIDA: '2026-06-24' })
    const shipment = makeShipment('db-row-123', [op1, op2])
    const event = makeEvent('salida', '2026-06-22', CNTR, shipment)

    const result = dropPatch(event, '2026-06-25', buildPatchedOperativas)

    expect(result).not.toBeNull()
    expect(result!.dbId).toBe('db-row-123')

    const ops = result!.fields.operativas
    const patched = ops.find(o => o.CNTR_OP === CNTR)!
    const untouched = ops.find(o => o.CNTR_OP === OTHER_CNTR)!

    expect(patched.SALIDA).toBe('2026-06-25')
    // ETA_FISC must be unchanged on the patched record
    expect(patched.ETA_FISC).toBe(op1.ETA_FISC)
    // The other container's SALIDA must not change
    expect(untouched.SALIDA).toBe('2026-06-24')
  })

  it('eta_fisc event → patches ETA_FISC for the matching cntr', () => {
    const op = makeOp(CNTR, { ETA_FISC: '2026-06-25' })
    const shipment = makeShipment('db-row-456', [op])
    const event = makeEvent('eta_fisc', '2026-06-25', CNTR, shipment)

    const result = dropPatch(event, '2026-06-28', buildPatchedOperativas)

    expect(result).not.toBeNull()
    const patched = result!.fields.operativas.find(o => o.CNTR_OP === CNTR)!
    expect(patched.ETA_FISC).toBe('2026-06-28')
    // SALIDA must be unchanged
    expect(patched.SALIDA).toBe(op.SALIDA)
  })

  it('same-day drop → returns null (no-op)', () => {
    const op = makeOp(CNTR, { SALIDA: '2026-06-22' })
    const shipment = makeShipment('db-row-789', [op])
    const event = makeEvent('salida', '2026-06-22', CNTR, shipment)

    const result = dropPatch(event, '2026-06-22', buildPatchedOperativas)

    expect(result).toBeNull()
  })

  it('missing __dbId → returns null', () => {
    const op = makeOp(CNTR)
    const shipment = makeShipment(undefined, [op])
    const event = makeEvent('salida', '2026-06-22', CNTR, shipment)

    const result = dropPatch(event, '2026-06-25', buildPatchedOperativas)

    expect(result).toBeNull()
  })

  it('non-movable event type (libre) → returns null', () => {
    const op = makeOp(CNTR)
    const shipment = makeShipment('db-row-abc', [op])
    const event = makeEvent('libre', '2026-06-30', CNTR, shipment)

    const result = dropPatch(event, '2026-07-01', buildPatchedOperativas)

    expect(result).toBeNull()
  })

  it('non-movable event type (eta_fisc renamed as descarga) → returns null', () => {
    const op = makeOp(CNTR)
    const shipment = makeShipment('db-row-abc', [op])
    const event = makeEvent('descarga', '2026-06-20', CNTR, shipment)

    const result = dropPatch(event, '2026-06-21', buildPatchedOperativas)

    expect(result).toBeNull()
  })

  it('non-movable event type (dev) → returns null', () => {
    const op = makeOp(CNTR)
    const shipment = makeShipment('db-row-abc', [op])
    const event = makeEvent('dev', '2026-06-20', CNTR, shipment)

    const result = dropPatch(event, '2026-06-21', buildPatchedOperativas)

    expect(result).toBeNull()
  })

  it('non-movable event type (carga) → returns null', () => {
    const op = makeOp(CNTR)
    const shipment = makeShipment('db-row-abc', [op])
    const event = makeEvent('carga', '2026-06-20', CNTR, shipment)

    const result = dropPatch(event, '2026-06-21', buildPatchedOperativas)

    expect(result).toBeNull()
  })

  it('cntr vacío YA NO bloquea el drop (cambio 23/07 — antes documentaba el no-op)', () => {
    const op = makeOp('')
    const shipment = makeShipment('db-row-abc', [op])
    const event: CalendarEvent = {
      ...makeEvent('salida', '2026-06-22', '', shipment),
      cntr: '',
    }

    const result = dropPatch(event, '2026-06-25', buildPatchedOperativas)

    expect(result).not.toBeNull()
    expect(result!.fields.operativas.find(o => (o.CNTR_OP || '') === '')!.SALIDA).toBe('2026-06-25')
  })

  it('undefined event → returns null', () => {
    const result = dropPatch(undefined, '2026-06-25', buildPatchedOperativas)
    expect(result).toBeNull()
  })

  it('undefined newDate → returns null', () => {
    const op = makeOp(CNTR)
    const shipment = makeShipment('db-row-abc', [op])
    const event = makeEvent('salida', '2026-06-22', CNTR, shipment)

    const result = dropPatch(event, undefined, buildPatchedOperativas)
    expect(result).toBeNull()
  })
})

// ── dropPatchTruck: mover hitos de camión (carga/salida) ─────────────────
import { dropPatchTruck } from './agendaDnd'
import type { Truck } from '@/lib/truckTypes'

const mkTruck = (over: Partial<Truck> = {}): Truck => ({
  id: 'truck-abc-123', code: 'C446', status: 'planning', isSider: false,
  transport: 'CARRARA', driver: '', plate: '', loadDate: '2026-07-10',
  departureDate: '2026-07-12', arrivalDate: '2026-07-20', notes: '',
  draft: false, pendingEdits: null, updatedAt: 0, createdAt: 0,
  costDespacho: 0, costFlete: 0, costCarga: 0,
  ...over,
} as unknown as Truck)

const truckEvent = (type: 'carga' | 'salida' | 'eta_fisc', date: string, truckId = 'truck-abc-123') =>
  ({ id: `truck-${truckId}-${type}`, type, date, ref: '🚛 C446' } as unknown as Parameters<typeof dropPatchTruck>[0])

describe('dropPatchTruck', () => {
  it('salida → departureDate; el id con guiones (uuid) se parsea bien', () => {
    const r = dropPatchTruck(truckEvent('salida', '2026-07-12'), '2026-07-14', [mkTruck()])
    expect(r).toEqual({ truckId: 'truck-abc-123', fields: { departureDate: '2026-07-14' } })
  })

  it('carga → loadDate; si queda después de la salida, arrastra la salida', () => {
    const r = dropPatchTruck(truckEvent('carga', '2026-07-10'), '2026-07-13', [mkTruck()])
    expect(r?.fields).toEqual({ loadDate: '2026-07-13', departureDate: '2026-07-13' })
    const r2 = dropPatchTruck(truckEvent('carga', '2026-07-10'), '2026-07-11', [mkTruck()])
    expect(r2?.fields).toEqual({ loadDate: '2026-07-11' })
  })

  it('salida antes de la carga arrastra la carga; mismo día (chip único) mueve las dos', () => {
    const r = dropPatchTruck(truckEvent('salida', '2026-07-12'), '2026-07-09', [mkTruck()])
    expect(r?.fields).toEqual({ departureDate: '2026-07-09', loadDate: '2026-07-09' })
    const combinado = mkTruck({ loadDate: '2026-07-12', departureDate: '2026-07-12' })
    const r2 = dropPatchTruck(truckEvent('salida', '2026-07-12'), '2026-07-15', [combinado])
    expect(r2?.fields).toEqual({ departureDate: '2026-07-15', loadDate: '2026-07-15' })
  })

  it('la salida no puede quedar después de la llegada → null', () => {
    expect(dropPatchTruck(truckEvent('salida', '2026-07-12'), '2026-07-25', [mkTruck()])).toBeNull()
  })

  it('no-ops: mismo día, no-camión, eta_fisc, draft, camión inexistente', () => {
    expect(dropPatchTruck(truckEvent('salida', '2026-07-12'), '2026-07-12', [mkTruck()])).toBeNull()
    expect(dropPatchTruck({ id: 'A7600-C1-salida', type: 'salida', date: '2026-07-12' } as unknown as Parameters<typeof dropPatchTruck>[0], '2026-07-14', [mkTruck()])).toBeNull()
    expect(dropPatchTruck(truckEvent('eta_fisc', '2026-07-20'), '2026-07-22', [mkTruck()])).toBeNull()
    expect(dropPatchTruck(truckEvent('salida', '2026-07-12'), '2026-07-14', [mkTruck({ draft: true })])).toBeNull()
    expect(dropPatchTruck(truckEvent('salida', '2026-07-12', 'otro-id'), '2026-07-14', [mkTruck()])).toBeNull()
  })
})

describe('dropPatch — carga SIN contenedor asignado (bug FCL-LATINART 23/07)', () => {
  it('cntr vacío → patchea la operativa con CNTR_OP vacío (antes: no-op silencioso)', () => {
    const op = makeOp('', { SALIDA: '2026-07-28', ETA_FISC: '2026-07-30' })
    const shipment = makeShipment('db-row-latinart', [op])
    const event = makeEvent('salida', '2026-07-28', '', shipment)

    const result = dropPatch(event, '2026-07-29', buildPatchedOperativas)

    expect(result).not.toBeNull()
    expect(result!.dbId).toBe('db-row-latinart')
    const patched = result!.fields.operativas.find(o => (o.CNTR_OP || '') === '')!
    expect(patched.SALIDA).toBe('2026-07-29')
    expect(patched.ETA_FISC).toBe('2026-07-30')
    expect(result!.fields.operativas).toHaveLength(1)
  })

  it('cntr vacío + eta_fisc también funciona', () => {
    const op = makeOp('', { SALIDA: '2026-07-28', ETA_FISC: '2026-07-30' })
    const shipment = makeShipment('db-row-latinart2', [op])
    const event = makeEvent('eta_fisc', '2026-07-30', '', shipment)

    const result = dropPatch(event, '2026-08-01', buildPatchedOperativas)

    expect(result).not.toBeNull()
    const patched = result!.fields.operativas.find(o => (o.CNTR_OP || '') === '')!
    expect(patched.ETA_FISC).toBe('2026-08-01')
    expect(patched.SALIDA).toBe('2026-07-28')
  })
})
