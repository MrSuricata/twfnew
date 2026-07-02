import { describe, it, expect } from 'vitest'
import { computePushCounts, buildPushBody, montevideoTodayIso, type PushShipmentRow, type PushTruckRow } from './pushAlerts.js'

const HOY = '2026-07-02'
const AYER = '2026-07-01'
const ANTEAYER = '2026-06-30'
const HACE_3D = '2026-06-29'
const MANANA = '2026-07-03'

const fcl = (extra: Partial<PushShipmentRow>): PushShipmentRow => ({
  ref: 'A7000', cliente: 'PERETTI', mode: 'fcl', archived: false, ...extra,
})

describe('computePushCounts — LIBRE', () => {
  it('cuenta vencido (fecha pasada) y hoy por separado', () => {
    const ships = [
      fcl({ libre: ANTEAYER }),
      fcl({ libre: HOY }),
      fcl({ libre: MANANA }), // futuro: no alerta
    ]
    const c = computePushCounts(ships, [], HOY)
    expect(c.libreVencidos).toBe(1)
    expect(c.libreHoy).toBe(1)
  })

  it("ignora 'DEVUELTO' y texto no-ISO", () => {
    const ships = [fcl({ libre: 'DEVUELTO' }), fcl({ libre: '2/7' }), fcl({ libre: '' })]
    const c = computePushCounts(ships, [], HOY)
    expect(c.libreVencidos).toBe(0)
    expect(c.libreHoy).toBe(0)
  })

  it('ignora archivadas y no-FCL', () => {
    const ships = [
      fcl({ libre: ANTEAYER, archived: true }),
      fcl({ libre: ANTEAYER, mode: 'lcl' }),
    ]
    const c = computePushCounts(ships, [], HOY)
    expect(c.libreVencidos).toBe(0)
  })
})

describe('computePushCounts — salidas / frontera / fiscal (por contenedor)', () => {
  it('cuenta por contenedor via el array operativas (2 CNTR saliendo = 2)', () => {
    const ships = [fcl({ operativas: [{ SALIDA: HOY, ETA_FISC: '' }, { SALIDA: HOY, ETA_FISC: '' }] })]
    expect(computePushCounts(ships, [], HOY).salidas).toBe(2)
  })

  it('sin array usa el fallback de columnas rollup (1 operativa sintética)', () => {
    const ships = [fcl({ salida: HOY, eta_fiscal: '' })]
    expect(computePushCounts(ships, [], HOY).salidas).toBe(1)
  })

  it('frontera: SALIDA hace 1–2 días sin llegar a fiscal', () => {
    const ships = [
      fcl({ operativas: [{ SALIDA: AYER, ETA_FISC: '' }] }),        // 1 día → frontera
      fcl({ operativas: [{ SALIDA: ANTEAYER, ETA_FISC: MANANA }] }), // 2 días, fiscal futuro → frontera
      fcl({ operativas: [{ SALIDA: HACE_3D, ETA_FISC: '' }] }),      // 3 días → afuera de la ventana
      fcl({ operativas: [{ SALIDA: AYER, ETA_FISC: ANTEAYER }] }),   // ya llegó a fiscal → no
      fcl({ operativas: [{ SALIDA: AYER, ETA_FISC: HOY }] }),        // llega HOY → cuenta en fiscal, no en frontera
    ]
    const c = computePushCounts(ships, [], HOY)
    expect(c.frontera).toBe(2)
    expect(c.fiscal).toBe(1)
  })

  it('fiscal: ETA_FISC = hoy', () => {
    const ships = [fcl({ operativas: [{ SALIDA: HACE_3D, ETA_FISC: HOY }] })]
    expect(computePushCounts(ships, [], HOY).fiscal).toBe(1)
  })
})

describe('computePushCounts — camiones', () => {
  it('cuenta camiones publicados con salida hoy; ignora drafts y otras fechas', () => {
    const trucks: PushTruckRow[] = [
      { code: 'C100', draft: false, departure_date: HOY },
      { code: 'C101', draft: true, departure_date: HOY },   // borrador → no
      { code: 'C102', draft: false, departure_date: AYER }, // otra fecha → no
      { code: 'C103', draft: false, departure_date: null },
    ]
    expect(computePushCounts([], trucks, HOY).camiones).toBe(1)
  })
})

describe('buildPushBody', () => {
  it('arma el resumen omitiendo categorías en 0', () => {
    const body = buildPushBody({ libreVencidos: 2, libreHoy: 1, salidas: 4, frontera: 2, fiscal: 3, camiones: 2 })
    expect(body).toBe('🔴 2 LIBRE vencidos · 🟠 1 vence hoy · 🚚 4 salidas · 🛃 2 en frontera · 🏭 3 llegan a fiscal · 2 camiones')
  })

  it('omite las categorías vacías y pluraliza bien el singular', () => {
    const body = buildPushBody({ libreVencidos: 1, libreHoy: 0, salidas: 0, frontera: 0, fiscal: 1, camiones: 1 })
    expect(body).toBe('🔴 1 LIBRE vencido · 🏭 1 llega a fiscal · 1 camión')
  })

  it('todo en 0 → null (no se envía nada)', () => {
    expect(buildPushBody({ libreVencidos: 0, libreHoy: 0, salidas: 0, frontera: 0, fiscal: 0, camiones: 0 })).toBeNull()
  })
})

describe('montevideoTodayIso', () => {
  it('resuelve el día en America/Montevideo (UTC-3), no en UTC', () => {
    // 01:30 UTC del 3 de julio = 22:30 del 2 de julio en Montevideo
    expect(montevideoTodayIso(new Date('2026-07-03T01:30:00Z'))).toBe('2026-07-02')
    // Mediodía UTC = mismo día
    expect(montevideoTodayIso(new Date('2026-07-03T12:00:00Z'))).toBe('2026-07-03')
  })
})
