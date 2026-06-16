import { describe, it, expect } from 'vitest'
import { buildPatchedOperativas } from './ContainerQuickEdit'
import type { ParsedShipment, OperativasRecord } from '@/lib/shipmentTypes'

// ── helpers ────────────────────────────────────────────────────────────────

const shipment = (operativas?: OperativasRecord[]): ParsedShipment =>
  ({
    REF: 'A7777',
    CNTR: 'AAAA1111111',
    ETA: '2026-06-01',
    CLIENTE: 'PERETTI',
    TIPO: '40HC',
    calculatedLibreHasta: '',
    operativas: operativas ?? [],
  } as unknown as ParsedShipment)

const record = (over: Partial<OperativasRecord>): OperativasRecord => ({
  REF: 'A7777', TLX: '', DEPOSITO: 'GODILCO', ETA_OP: '', SALIDA: '',
  ETA_FISC: '', LIBRE: '', OPERATIVA: '', CNTR_OP: 'AAAA1111111',
  PKGS: 10, KG: 500, M3: 5, DESCRIPCION: 'BICIS', FISCAL: 'ZP RAFAELA',
  DESCARGA: '', DEV: '', CLIENTE_OP: 'PERETTI', TIPO: '40HC', WOOD: '',
  TRANSPORTE: '', HORARIO: '', LUGAR_SALIDA: '',
  ...over,
})

// ── buildPatchedOperativas ────────────────────────────────────────────────

describe('buildPatchedOperativas', () => {
  it('patches only the matching container, preserving sibling records', () => {
    const s = shipment([
      record({ CNTR_OP: 'AAAA1111111', SALIDA: '2026-06-10', ETA_FISC: '2026-06-15', KG: 500 }),
      record({ CNTR_OP: 'BBBB2222222', SALIDA: '2026-06-12', ETA_FISC: '2026-06-17', KG: 400 }),
    ])
    const next = buildPatchedOperativas(s, 'AAAA1111111', { SALIDA: '2026-06-20', LUGAR_SALIDA: 'GODILCO' })
    // Patched container
    expect(next[0].SALIDA).toBe('2026-06-20')
    expect(next[0].LUGAR_SALIDA).toBe('GODILCO')
    expect(next[0].ETA_FISC).toBe('2026-06-15') // preserved
    expect(next[0].KG).toBe(500)                  // preserved
    // Sibling untouched
    expect(next[1].CNTR_OP).toBe('BBBB2222222')
    expect(next[1].SALIDA).toBe('2026-06-12')
    expect(next[1].KG).toBe(400)
  })

  it('editing salida then lugar produces an array with BOTH values (Fix 3 smoke test)', () => {
    // Simulates: user types salida → React setState (async) → user picks lugar.
    // The lugar onChange passes { lugar: newLugar } as an override; the
    // current salida is already in state and passed as the default.
    const s = shipment([
      record({ CNTR_OP: 'AAAA1111111', SALIDA: '', ETA_FISC: '', LUGAR_SALIDA: '' }),
    ])
    // After the user has set salida in draft state, commitSave is called with
    // the lugar override — simulated here by passing explicit patch values.
    const next = buildPatchedOperativas(s, 'AAAA1111111', {
      SALIDA: '2026-06-25',
      ETA_FISC: '2026-06-28',
      LUGAR_SALIDA: 'PLANIR',
    })
    expect(next[0].SALIDA).toBe('2026-06-25')
    expect(next[0].ETA_FISC).toBe('2026-06-28')
    expect(next[0].LUGAR_SALIDA).toBe('PLANIR')
  })

  it('appends a new record when no existing record matches the container', () => {
    const s = shipment([])
    const next = buildPatchedOperativas(s, 'AAAA1111111', { SALIDA: '2026-06-10' })
    expect(next).toHaveLength(1)
    expect(next[0].CNTR_OP).toBe('AAAA1111111')
    expect(next[0].SALIDA).toBe('2026-06-10')
    expect(next[0].REF).toBe('A7777')
  })

  it('is case-insensitive on CNTR_OP matching', () => {
    const s = shipment([
      record({ CNTR_OP: 'aaaa1111111', SALIDA: '2026-06-01' }),
    ])
    const next = buildPatchedOperativas(s, 'AAAA1111111', { SALIDA: '2026-06-20' })
    expect(next).toHaveLength(1)
    expect(next[0].SALIDA).toBe('2026-06-20')
  })
})
