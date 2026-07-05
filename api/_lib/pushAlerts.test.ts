import { describe, it, expect } from 'vitest'
import {
  computeLibreLines,
  computeSalidaLines,
  computeFiscalLines,
  computeFronteraLines,
  buildAlertBody,
  computeSlotAlerts,
  montevideoTodayIso,
  MAX_PUSH_LINES,
  PUSH_SLOT_KINDS,
  PUSH_ALERT_META,
  type PushShipmentRow,
} from './pushAlerts.js'

const HOY = '2026-07-02'
const AYER = '2026-07-01'
const ANTEAYER = '2026-06-30'
const HACE_3D = '2026-06-29'
const HACE_9D = '2026-06-23'
const MANANA = '2026-07-03'
const HOY_MAS_3 = '2026-07-05'
const HOY_MAS_4 = '2026-07-06'

const fcl = (extra: Partial<PushShipmentRow>): PushShipmentRow => ({
  ref: 'A7000', cliente: 'PERETTI', mode: 'fcl', archived: false, ...extra,
})

describe('computeLibreLines — "Días libres" (hoy ≤ LIBRE ≤ hoy+3)', () => {
  it('incluye hoy y hoy+3; excluye vencidos y hoy+4', () => {
    const ships = [
      fcl({ ref: 'A7001', contenedor: 'MSKU1111111', libre: HOY }),
      fcl({ ref: 'A7002', contenedor: 'MSKU2222222', libre: HOY_MAS_3 }),
      fcl({ ref: 'A7003', contenedor: 'MSKU3333333', libre: AYER }),      // vencido → NO
      fcl({ ref: 'A7004', contenedor: 'MSKU4444444', libre: HOY_MAS_4 }), // hoy+4 → NO
    ]
    const lines = computeLibreLines(ships, HOY)
    expect(lines).toEqual([
      'MSKU1111111 · A7001 · vence 02/07',
      'MSKU2222222 · A7002 · vence 05/07',
    ])
  })

  it("ignora 'DEVUELTO' y texto no-ISO", () => {
    const ships = [fcl({ libre: 'DEVUELTO' }), fcl({ libre: '2/7' }), fcl({ libre: '' }), fcl({ libre: null })]
    expect(computeLibreLines(ships, HOY)).toEqual([])
  })

  it('ignora archivadas y no-FCL', () => {
    const ships = [
      fcl({ libre: HOY, archived: true }),
      fcl({ libre: HOY, mode: 'lcl' }),
    ]
    expect(computeLibreLines(ships, HOY)).toEqual([])
  })

  it('ordena por vencimiento más próximo y pone — si falta el CNTR', () => {
    const ships = [
      fcl({ ref: 'A7010', contenedor: '', libre: MANANA }),
      fcl({ ref: 'A7011', contenedor: 'TCLU5555555', libre: HOY }),
    ]
    expect(computeLibreLines(ships, HOY)).toEqual([
      'TCLU5555555 · A7011 · vence 02/07',
      '— · A7010 · vence 03/07',
    ])
  })
})

describe('computeSalidaLines — "Salen hoy" (SALIDA = hoy, por contenedor)', () => {
  it('una línea por contenedor con su depósito', () => {
    const ships = [fcl({
      ref: 'A7020',
      operativas: [
        { SALIDA: HOY, ETA_FISC: '', CNTR_OP: 'MSKU1111111', DEPOSITO: 'GODILCO' },
        { SALIDA: HOY, ETA_FISC: '', CNTR_OP: 'MSKU2222222', DEPOSITO: 'GODILCO' },
        { SALIDA: MANANA, ETA_FISC: '', CNTR_OP: 'MSKU3333333', DEPOSITO: 'GODILCO' }, // otra fecha → no
      ],
    })]
    expect(computeSalidaLines(ships, HOY)).toEqual([
      'MSKU1111111 · A7020 · GODILCO',
      'MSKU2222222 · A7020 · GODILCO',
    ])
  })

  it('usa LUGAR_SALIDA cuando existe y difiere del depósito', () => {
    const ships = [
      fcl({ ref: 'A7021', operativas: [{ SALIDA: HOY, CNTR_OP: 'AAAA1111111', DEPOSITO: 'GODILCO', LUGAR_SALIDA: 'PLANIR' }] }),
      fcl({ ref: 'A7022', operativas: [{ SALIDA: HOY, CNTR_OP: 'BBBB2222222', DEPOSITO: 'GODILCO', LUGAR_SALIDA: 'GODILCO' }] }),
      fcl({ ref: 'A7023', operativas: [{ SALIDA: HOY, CNTR_OP: 'CCCC3333333', DEPOSITO: '', LUGAR_SALIDA: '' }] }),
    ]
    expect(computeSalidaLines(ships, HOY)).toEqual([
      'AAAA1111111 · A7021 · PLANIR',
      'BBBB2222222 · A7022 · GODILCO',
      'CCCC3333333 · A7023 · —',
    ])
  })

  it('sin array usa el fallback de columnas rollup (CNTR y depósito de la carga)', () => {
    const ships = [fcl({ ref: 'A7024', salida: HOY, contenedor: 'DDDD4444444', deposito: 'PLANIR' })]
    expect(computeSalidaLines(ships, HOY)).toEqual(['DDDD4444444 · A7024 · PLANIR'])
  })
})

describe('computeFiscalLines — "Llegan hoy a fiscal" (ETA_FISC = hoy)', () => {
  it('línea con transporte, — si vacío, hereda el rollup de la carga', () => {
    const ships = [
      fcl({ ref: 'A7030', operativas: [{ ETA_FISC: HOY, CNTR_OP: 'AAAA1111111', TRANSPORTE: 'OLAVERRY' }] }),
      fcl({ ref: 'A7031', operativas: [{ ETA_FISC: HOY, CNTR_OP: 'BBBB2222222' }] }),
      fcl({ ref: 'A7032', transporte: 'TRANSCAL', operativas: [{ ETA_FISC: HOY, CNTR_OP: 'CCCC3333333' }] }),
      fcl({ ref: 'A7033', operativas: [{ ETA_FISC: MANANA, CNTR_OP: 'DDDD4444444' }] }), // otra fecha → no
    ]
    expect(computeFiscalLines(ships, HOY)).toEqual([
      'AAAA1111111 · A7030 · OLAVERRY',
      'BBBB2222222 · A7031 · —',
      'CCCC3333333 · A7032 · TRANSCAL',
    ])
  })
})

describe('computeFronteraLines — "Hoy en frontera" (acotado por la ETA fiscal)', () => {
  it('misma derivación que la pestaña HOY: en frontera hasta el día anterior a fiscal', () => {
    const ships = [
      fcl({ ref: 'A7040', operativas: [{ SALIDA: AYER, ETA_FISC: '', CNTR_OP: 'AAAA1111111', TRANSPORTE: 'PCS' }] }),          // 1 día, sin fiscal → frontera
      fcl({ ref: 'A7041', operativas: [{ SALIDA: ANTEAYER, ETA_FISC: MANANA, CNTR_OP: 'BBBB2222222' }] }),                      // 2 días, fiscal futuro → frontera
      fcl({ ref: 'A7042', operativas: [{ SALIDA: HACE_3D, ETA_FISC: '', CNTR_OP: 'CCCC3333333' }] }),                           // 3 días, sin fiscal (dentro del tope) → frontera
      fcl({ ref: 'A7043', operativas: [{ SALIDA: AYER, ETA_FISC: ANTEAYER, CNTR_OP: 'DDDD4444444' }] }),                        // ya llegó → no
      fcl({ ref: 'A7044', operativas: [{ SALIDA: AYER, ETA_FISC: HOY, CNTR_OP: 'EEEE5555555' }] }),                             // llega HOY → va en fiscal
      fcl({ ref: 'A7045', operativas: [{ SALIDA: HOY, ETA_FISC: '', CNTR_OP: 'FFFF6666666' }] }),                               // sale hoy → va en salidas
      fcl({ ref: 'A7046', operativas: [{ SALIDA: HACE_9D, ETA_FISC: '', CNTR_OP: 'GGGG7777777' }] }),                           // 9 días sin fiscal → pasó el tope
    ]
    expect(computeFronteraLines(ships, HOY)).toEqual([
      'AAAA1111111 · A7040 · PCS',
      'BBBB2222222 · A7041 · —',
      'CCCC3333333 · A7042 · —',
    ])
  })
})

describe('buildAlertBody — cap de líneas', () => {
  it('null si no hay líneas (no se envía nada)', () => {
    expect(buildAlertBody([])).toBeNull()
  })

  it('hasta el máximo va todo, separado por salto de línea', () => {
    const lines = ['a', 'b', 'c']
    expect(buildAlertBody(lines)).toBe('a\nb\nc')
    const seis = ['1', '2', '3', '4', '5', '6']
    expect(buildAlertBody(seis)).toBe(seis.join('\n'))
  })

  it('pasado el máximo capea y agrega "…y N más"', () => {
    const ocho = ['1', '2', '3', '4', '5', '6', '7', '8']
    expect(buildAlertBody(ocho)).toBe('1\n2\n3\n4\n5\n6\n…y 2 más')
    expect(MAX_PUSH_LINES).toBe(6)
  })
})

describe('computeSlotAlerts — notificaciones separadas por slot', () => {
  const ships = [
    fcl({ ref: 'A7050', contenedor: 'AAAA1111111', libre: HOY }),
    fcl({ ref: 'A7051', contenedor: 'BBBB2222222', libre: MANANA }),
    fcl({ ref: 'A7052', operativas: [{ ETA_FISC: HOY, CNTR_OP: 'CCCC3333333', TRANSPORTE: 'OLAVERRY' }] }),
    fcl({ ref: 'A7053', operativas: [{ SALIDA: HOY, CNTR_OP: 'DDDD4444444', DEPOSITO: 'GODILCO' }] }),
    fcl({ ref: 'A7054', operativas: [{ SALIDA: AYER, ETA_FISC: '', CNTR_OP: 'EEEE5555555', TRANSPORTE: 'PCS' }] }),
  ]

  it('manana = libre + fiscal, con título propio y count', () => {
    const alerts = computeSlotAlerts('manana', ships, HOY)
    expect(alerts.map(a => a.kind)).toEqual(['libre', 'fiscal'])
    expect(alerts[0].title).toBe('🔴 Libres por vencer (2)')
    expect(alerts[0].count).toBe(2)
    expect(alerts[0].body).toBe('AAAA1111111 · A7050 · vence 02/07\nBBBB2222222 · A7051 · vence 03/07')
    expect(alerts[1].title).toBe('🏭 Llegan hoy a fiscal (1)')
    expect(alerts[1].body).toBe('CCCC3333333 · A7052 · OLAVERRY')
  })

  it('tarde = frontera + salidas', () => {
    const alerts = computeSlotAlerts('tarde', ships, HOY)
    expect(alerts.map(a => a.kind)).toEqual(['frontera', 'salidas'])
    expect(alerts[0].title).toBe('🛃 Hoy en frontera (1)')
    expect(alerts[0].body).toBe('EEEE5555555 · A7054 · PCS')
    expect(alerts[1].title).toBe('🚚 Salen hoy (1)')
    expect(alerts[1].body).toBe('DDDD4444444 · A7053 · GODILCO')
  })

  it('omite los tipos sin matches (sin nada → [])', () => {
    expect(computeSlotAlerts('manana', [], HOY)).toEqual([])
    const soloSalida = [fcl({ ref: 'A7055', operativas: [{ SALIDA: HOY, CNTR_OP: 'FFFF6666666' }] })]
    const alerts = computeSlotAlerts('tarde', soloSalida, HOY)
    expect(alerts.map(a => a.kind)).toEqual(['salidas'])
  })

  it('cada tipo tiene columna de preferencia y horario definidos', () => {
    for (const slot of ['manana', 'tarde'] as const) {
      for (const kind of PUSH_SLOT_KINDS[slot]) {
        expect(PUSH_ALERT_META[kind].prefColumn).toMatch(/^alert_/)
        expect(PUSH_ALERT_META[kind].hora).toMatch(/^\d{2}:\d{2}$/)
      }
    }
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
