import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { ParsedShipment, OperativasRecord } from './shipmentTypes'
import {
  salientesHoy,
  enFronteraHoy,
  llegandoFiscalHoy,
  libreAlerts,
  buildTodaySnapshot,
} from './todayFilters'

// Mock today = 2026-04-20 (local)
beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 3, 20, 12, 0, 0)) // April 20, 2026, noon local
})
afterAll(() => { vi.useRealTimers() })

const TODAY = '2026-04-20'
const YESTERDAY = '2026-04-19'
const TWO_DAYS_AGO = '2026-04-18'
const THREE_DAYS_AGO = '2026-04-17'
const TOMORROW = '2026-04-21'

function mkOp(partial: Partial<OperativasRecord>): OperativasRecord {
  return {
    REF: partial.REF ?? 'A7500',
    TLX: partial.TLX ?? '',
    DEPOSITO: partial.DEPOSITO ?? '',
    ETA_OP: partial.ETA_OP ?? '',
    SALIDA: partial.SALIDA ?? '',
    ETA_FISC: partial.ETA_FISC ?? '',
    LIBRE: partial.LIBRE ?? '',
    OPERATIVA: partial.OPERATIVA ?? 'CONTENEDOR',
    CNTR_OP: partial.CNTR_OP ?? '',
    PKGS: partial.PKGS ?? 0,
    KG: partial.KG ?? 0,
    M3: partial.M3 ?? 0,
    DESCRIPCION: partial.DESCRIPCION ?? '',
    FISCAL: partial.FISCAL ?? '',
    DESCARGA: partial.DESCARGA ?? '',
    DEV: partial.DEV ?? '',
    CLIENTE_OP: partial.CLIENTE_OP ?? '',
    TIPO: partial.TIPO ?? '',
    WOOD: partial.WOOD ?? '',
    TRANSPORTE: partial.TRANSPORTE ?? '',
    HORARIO: partial.HORARIO ?? '',
  }
}

function mkShip(ref: string, operativas: OperativasRecord[], extra: Partial<ParsedShipment> = {}): ParsedShipment {
  return {
    REF: ref,
    CLIENTE: '',
    ETD: '',
    ETA: '2026-01-01',
    FT: 0,
    LIBRE_HASTA: '',
    CNTR: '',
    N: operativas.length,
    MBL: '',
    LINEA: '',
    BUQUE: '',
    TERMINAL: '',
    C_TERMINAL: 0,
    C_DEV: 0,
    LOCALES: 0,
    FLETE: 0,
    VTO: '',
    FORMA_DE_PAGO: 'al arribo',
    CR: false, BL: false, AD: false, AT: false,
    containers: [],
    operativas,
    ...extra,
  } as ParsedShipment
}

describe('salientesHoy', () => {
  it('matches ops whose SALIDA is today', () => {
    const s = mkShip('A7500', [mkOp({ SALIDA: TODAY })])
    expect(salientesHoy([s])).toHaveLength(1)
  })

  it('skips ops with SALIDA in past or future', () => {
    const s = mkShip('A7500', [
      mkOp({ SALIDA: YESTERDAY }),
      mkOp({ SALIDA: TOMORROW }),
      mkOp({ SALIDA: '' }),
    ])
    expect(salientesHoy([s])).toHaveLength(0)
  })

  it('returns per-op matches for multi-container shipments', () => {
    const s = mkShip('A7500', [
      mkOp({ SALIDA: TODAY, CNTR_OP: 'C1' }),
      mkOp({ SALIDA: TODAY, CNTR_OP: 'C2' }),
      mkOp({ SALIDA: YESTERDAY, CNTR_OP: 'C3' }),
    ])
    const matches = salientesHoy([s])
    expect(matches).toHaveLength(2)
    expect(matches[0].op.CNTR_OP).toBe('C1')
    expect(matches[1].op.CNTR_OP).toBe('C2')
  })
})

describe('enFronteraHoy', () => {
  it('matches ops whose SALIDA was 1-2 days ago', () => {
    const s = mkShip('A7500', [
      mkOp({ SALIDA: YESTERDAY }),     // 1 day ago — match
      mkOp({ SALIDA: TWO_DAYS_AGO }),  // 2 days ago — match
    ])
    expect(enFronteraHoy([s])).toHaveLength(2)
  })

  it('skips ops with SALIDA today or 3+ days ago', () => {
    const s = mkShip('A7500', [
      mkOp({ SALIDA: TODAY }),         // 0 days — not in border window
      mkOp({ SALIDA: THREE_DAYS_AGO }), // 3 days — passed the border
    ])
    expect(enFronteraHoy([s])).toHaveLength(0)
  })

  it('skips ops that already reached fiscal', () => {
    const s = mkShip('A7500', [
      mkOp({ SALIDA: YESTERDAY, ETA_FISC: YESTERDAY }), // arrived yesterday
      mkOp({ SALIDA: YESTERDAY, ETA_FISC: TODAY }),     // arriving today
      mkOp({ SALIDA: YESTERDAY, ETA_FISC: TOMORROW }),  // arriving tomorrow — still at border
    ])
    const matches = enFronteraHoy([s])
    expect(matches).toHaveLength(1)
    expect(matches[0].op.ETA_FISC).toBe(TOMORROW)
  })

  it('handles missing or invalid SALIDA gracefully', () => {
    const s = mkShip('A7500', [
      mkOp({ SALIDA: '' }),
      mkOp({ SALIDA: 'not-a-date' }),
    ])
    expect(enFronteraHoy([s])).toHaveLength(0)
  })
})

describe('llegandoFiscalHoy', () => {
  it('matches ops whose ETA_FISC is today', () => {
    const s = mkShip('A7500', [
      mkOp({ ETA_FISC: TODAY }),
      mkOp({ ETA_FISC: YESTERDAY }),
      mkOp({ ETA_FISC: '' }),
    ])
    expect(llegandoFiscalHoy([s])).toHaveLength(1)
  })
})

describe('libreAlerts', () => {
  it('classifies vencido / hoy / urgente', () => {
    const ships = [
      mkShip('A7001', [], { LIBRE_HASTA: TWO_DAYS_AGO }),   // vencido +2
      mkShip('A7002', [], { LIBRE_HASTA: YESTERDAY }),       // vencido +1
      mkShip('A7003', [], { LIBRE_HASTA: TODAY }),           // hoy
      mkShip('A7004', [], { LIBRE_HASTA: TOMORROW }),        // urgente -1
      mkShip('A7005', [], { LIBRE_HASTA: '2026-04-30' }),    // 10 days out — skip
      mkShip('A7006', [], { LIBRE_HASTA: 'DEVUELTO' }),      // text marker — skip
    ]
    const alerts = libreAlerts(ships)
    expect(alerts).toHaveLength(4)
    expect(alerts[0].severity).toBe('vencido')
    expect(alerts[0].daysOverdue).toBe(2)
    expect(alerts[1].severity).toBe('vencido')
    expect(alerts[1].daysOverdue).toBe(1)
    expect(alerts[2].severity).toBe('hoy')
    expect(alerts[3].severity).toBe('urgente')
  })

  it('ignora LIBRE en texto libre no-ISO (ej. "2/7") — no genera "vencido hace 9262d"', () => {
    const ships = [
      mkShip('A7813', [], { LIBRE_HASTA: '2/7' }),       // texto libre → ignorar
      mkShip('A7881', [], { LIBRE_HASTA: '2-7' }),       // tampoco ISO completo → ignorar
      mkShip('A7900', [], { LIBRE_HASTA: '14/6/2026' }), // D/M/YYYY → ignorar
      mkShip('A7901', [], { LIBRE_HASTA: YESTERDAY }),   // ISO real → sí alerta
    ]
    const alerts = libreAlerts(ships)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].shipment.REF).toBe('A7901')
    // ninguna alerta con días absurdos
    expect(alerts.every(a => Math.abs(a.daysOverdue) < 400)).toBe(true)
  })
})

describe('buildTodaySnapshot', () => {
  it('aggregates all three categories + alerts + counts', () => {
    const ships = [
      mkShip('A7001', [mkOp({ SALIDA: TODAY })]),
      mkShip('A7002', [mkOp({ SALIDA: YESTERDAY })], { LIBRE_HASTA: TODAY }),
      mkShip('A7003', [mkOp({ ETA_FISC: TODAY })]),
    ]
    const snap = buildTodaySnapshot(ships)
    expect(snap.salientes).toHaveLength(1)
    expect(snap.frontera).toHaveLength(1)
    expect(snap.llegandoFiscal).toHaveLength(1)
    expect(snap.libreAlerts).toHaveLength(1)
    expect(snap.totalCount).toBe(3)
    expect(snap.hasMovement).toBe(true)
  })

  it('hasMovement false when empty', () => {
    const snap = buildTodaySnapshot([])
    expect(snap.hasMovement).toBe(false)
  })
})
