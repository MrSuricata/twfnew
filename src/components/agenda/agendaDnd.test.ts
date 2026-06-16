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

  it('missing cntr → returns null', () => {
    const op = makeOp('')
    const shipment = makeShipment('db-row-abc', [op])
    const event: CalendarEvent = {
      ...makeEvent('salida', '2026-06-22', '', shipment),
      cntr: '',
    }

    const result = dropPatch(event, '2026-06-25', buildPatchedOperativas)

    expect(result).toBeNull()
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
