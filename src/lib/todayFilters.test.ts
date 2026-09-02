import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { ParsedShipment, OperativasRecord } from './shipmentTypes'
import {
  salientesHoy,
  salidasPisadasAlerts,
  enFronteraHoy,
  llegandoFiscalHoy,
  libreAlerts,
  sinLiberarAlerts,
  buildTodaySnapshot,
  refsEnConsolidado,
  trucksSalientesHoy,
  trucksEnFronteraHoy,
  trucksLlegandoFiscalHoy,
  AVISO_STEP_BY_COLUMN,
  AVISO_LABEL_BY_COLUMN,
  type TodayColumn,
} from './todayFilters'
import { CHECK_STEPS, type CheckStepKey } from './checksTypes'
import type { Truck, TruckLoad } from './truckTypes'

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
const EIGHT_DAYS_AGO = '2026-04-12'
const TOMORROW = '2026-04-21'
const IN_TWO_DAYS = '2026-04-22'

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

  // Regresión: DEVUELTO es estado del CONTENEDOR, no de la CARGA. En un trasiego
  // el contenedor se devuelve antes de que la carga cruce/ llegue a fiscal.
  it('incluye ops con LIBRE=DEVUELTO (no filtrar por estado del contenedor)', () => {
    const s = mkShip('A7500', [mkOp({ SALIDA: TODAY, LIBRE: 'DEVUELTO' })])
    expect(salientesHoy([s])).toHaveLength(1)
  })
})

describe('enFronteraHoy', () => {
  // El caso del dueño: un domingo, las que salieron el jueves Y el viernes siguen
  // en frontera mientras su arribo fiscal sea futuro — NO solo las de 1–2 días.
  it('en frontera mientras la ETA fiscal sea futura, sin importar los días desde la salida', () => {
    const s = mkShip('A7500', [
      mkOp({ SALIDA: THREE_DAYS_AGO, ETA_FISC: IN_TWO_DAYS, CNTR_OP: 'JUE' }), // "jueves"
      mkOp({ SALIDA: TWO_DAYS_AGO, ETA_FISC: TOMORROW, CNTR_OP: 'VIE' }),      // "viernes"
      mkOp({ SALIDA: YESTERDAY, ETA_FISC: IN_TWO_DAYS, CNTR_OP: 'SAB' }),      // sábado
    ])
    expect(enFronteraHoy([s])).toHaveLength(3)
  })

  it('excluye las que salen HOY (van en "Saliendo hoy")', () => {
    const s = mkShip('A7500', [mkOp({ SALIDA: TODAY, ETA_FISC: TOMORROW })])
    expect(enFronteraHoy([s])).toHaveLength(0)
  })

  it('acotado por la ETA fiscal: llegó (pasada) o llega hoy → fuera; futura → dentro', () => {
    const s = mkShip('A7500', [
      mkOp({ SALIDA: THREE_DAYS_AGO, ETA_FISC: YESTERDAY }), // ya llegó → fuera
      mkOp({ SALIDA: THREE_DAYS_AGO, ETA_FISC: TODAY }),     // llega hoy → card fiscal
      mkOp({ SALIDA: THREE_DAYS_AGO, ETA_FISC: TOMORROW }),  // futura → en frontera
    ])
    const matches = enFronteraHoy([s])
    expect(matches).toHaveLength(1)
    expect(matches[0].op.ETA_FISC).toBe(TOMORROW)
  })

  it('sin ETA fiscal: sigue en frontera con tope de seguridad (≤7 días)', () => {
    const s = mkShip('A7500', [
      mkOp({ SALIDA: TWO_DAYS_AGO, ETA_FISC: '', CNTR_OP: 'RECIENTE' }), // dentro del tope
      mkOp({ SALIDA: EIGHT_DAYS_AGO, ETA_FISC: '', CNTR_OP: 'VIEJA' }),  // pasó el tope → fuera
    ])
    const matches = enFronteraHoy([s])
    expect(matches).toHaveLength(1)
    expect(matches[0].op.CNTR_OP).toBe('RECIENTE')
  })

  it('handles missing or invalid SALIDA gracefully', () => {
    const s = mkShip('A7500', [
      mkOp({ SALIDA: '' }),
      mkOp({ SALIDA: 'not-a-date' }),
    ])
    expect(enFronteraHoy([s])).toHaveLength(0)
  })

  // Regresión: la carga sigue en frontera aunque el contenedor vacío ya se
  // haya devuelto (LIBRE=DEVUELTO). ETA_FISC futuro = todavía no llegó.
  it('incluye cargas con contenedor DEVUELTO si aún no llegaron a fiscal', () => {
    const s = mkShip('A7500', [mkOp({ SALIDA: YESTERDAY, ETA_FISC: TOMORROW, LIBRE: 'DEVUELTO' })])
    expect(enFronteraHoy([s])).toHaveLength(1)
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

  // Regresión: la carga llega a fiscal hoy aunque el contenedor ya esté DEVUELTO.
  it('incluye cargas con contenedor DEVUELTO que llegan a fiscal hoy', () => {
    const s = mkShip('A7500', [mkOp({ ETA_FISC: TODAY, LIBRE: 'DEVUELTO' })])
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

// El check "Aviso" de cada tarjeta de HOY debe marcar EXACTAMENTE el paso del
// procedimiento operativo que ya vive en ref_checks (pestaña Checks) — no un
// estado nuevo. Este test blinda ese mapeo card→step contra regresiones.
describe('AVISO_STEP_BY_COLUMN', () => {
  it('cada columna de HOY apunta al paso de aviso correcto de ref_checks', () => {
    expect(AVISO_STEP_BY_COLUMN.salientes).toBe('aviso_salida')
    expect(AVISO_STEP_BY_COLUMN.frontera).toBe('cruce_frontera')
    expect(AVISO_STEP_BY_COLUMN.llegandoFiscal).toBe('arribo_fiscal')
  })

  it('los 3 pasos existen en el procedimiento operativo (CHECK_STEPS)', () => {
    const validKeys = new Set<CheckStepKey>(CHECK_STEPS.map(s => s.key))
    for (const step of Object.values(AVISO_STEP_BY_COLUMN)) {
      expect(validKeys.has(step)).toBe(true)
    }
  })

  it('los 3 avisos están marcados con flag `aviso` (viven en HOY, no en la pestaña Checks)', () => {
    for (const step of Object.values(AVISO_STEP_BY_COLUMN)) {
      const def = CHECK_STEPS.find(s => s.key === step)
      expect(def?.aviso).toBe(true)
    }
  })

  it('cubre exactamente las 3 columnas, sin duplicar pasos', () => {
    const cols: TodayColumn[] = ['salientes', 'frontera', 'llegandoFiscal']
    expect(Object.keys(AVISO_STEP_BY_COLUMN).sort()).toEqual([...cols].sort())
    const steps = Object.values(AVISO_STEP_BY_COLUMN)
    expect(new Set(steps).size).toBe(steps.length)
  })

  it('hay una etiqueta por cada columna', () => {
    for (const col of Object.keys(AVISO_STEP_BY_COLUMN) as TodayColumn[]) {
      expect(AVISO_LABEL_BY_COLUMN[col]).toBeTruthy()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Consolidados en HOY (05/08/2026)
// Un camión se mueve como una unidad: entra a las columnas como UNA tarjeta
// y sus cargas no se listan sueltas.
// ─────────────────────────────────────────────────────────────────────────

function mkTruck(partial: Partial<Truck>): Truck {
  return {
    id: partial.id ?? 't1',
    code: partial.code ?? 'C500',
    status: partial.status ?? 'planning',
    isSider: false,
    transport: partial.transport ?? 'TRANSCAL',
    driver: '', plate: '',
    loadDate: partial.loadDate ?? '',
    departureDate: partial.departureDate ?? '',
    arrivalDate: partial.arrivalDate ?? '',
    notes: '',
    draft: partial.draft ?? false,
    pendingEdits: null,
    costDespacho: 0, costFlete: 0, costCarga: 0,
    createdAt: 0, updatedAt: 0,
  } as Truck
}

function mkLoad(truckId: string, sourceRef: string, extra: Partial<TruckLoad> = {}): TruckLoad {
  return {
    id: `l-${sourceRef}`, truckId, sourceType: 'fcl', sourceRef,
    client: '', fiscal: '', kg: 1000, m3: 10, pkgs: 5, description: '',
    mvdArrival: '', desconsolDate: '', bl: '', stock: '', wood: '',
    overrides: null, position: 0, pending: null,
    ...extra,
  } as TruckLoad
}

describe('consolidados en las columnas de HOY', () => {
  it('un camión que sale hoy va a salientes, no a frontera ni a fiscal', () => {
    const trucks = [mkTruck({ id: 't1', code: 'C500', departureDate: TODAY, arrivalDate: TOMORROW })]
    const loads = [mkLoad('t1', 'A7758 B')]
    expect(trucksSalientesHoy(trucks, loads).map(x => x.truck.code)).toEqual(['C500'])
    expect(trucksEnFronteraHoy(trucks, loads)).toHaveLength(0)
    expect(trucksLlegandoFiscalHoy(trucks, loads)).toHaveLength(0)
  })

  it('un camión que salió y todavía no llegó está en frontera', () => {
    const trucks = [mkTruck({ id: 't1', departureDate: TWO_DAYS_AGO, arrivalDate: TOMORROW })]
    expect(trucksEnFronteraHoy(trucks, [])).toHaveLength(1)
    // y sigue en frontera aunque haya salido hace más de 2 días: la fecha del
    // camión es dato real, no la estimación que se usa para cargas sueltas
    const viejo = [mkTruck({ id: 't2', departureDate: THREE_DAYS_AGO, arrivalDate: '' })]
    expect(trucksEnFronteraHoy(viejo, [])).toHaveLength(1)
  })

  it('un camión marcado ENTREGADO sin fecha de arribo no está en frontera (importados 01/09)', () => {
    const entregado = [mkTruck({ id: 't3', departureDate: THREE_DAYS_AGO, arrivalDate: '', status: 'delivered' })]
    expect(trucksEnFronteraHoy(entregado, [])).toHaveLength(0)
  })

  it('un camión que salió hace más de 10 días sin arribo cargado ya no es "de hoy"', () => {
    const d = new Date(); d.setDate(d.getDate() - 11)
    const hace11 = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const olvidado = [mkTruck({ id: 't4', departureDate: hace11, arrivalDate: '' })]
    expect(trucksEnFronteraHoy(olvidado, [])).toHaveLength(0)
  })

  it('un camión que llega hoy va a fiscal y sale de frontera', () => {
    const trucks = [mkTruck({ id: 't1', departureDate: TWO_DAYS_AGO, arrivalDate: TODAY })]
    expect(trucksLlegandoFiscalHoy(trucks, [])).toHaveLength(1)
    expect(trucksEnFronteraHoy(trucks, [])).toHaveLength(0)
  })

  it('los camiones borrador no aparecen', () => {
    const trucks = [mkTruck({ id: 't1', departureDate: TODAY, draft: true })]
    expect(trucksSalientesHoy(trucks, [])).toHaveLength(0)
    expect(refsEnConsolidado(trucks, [mkLoad('t1', 'A7758 B')]).size).toBe(0)
  })

  it('la tarjeta del camión resume refs, kg y m3 de sus cargas', () => {
    const trucks = [mkTruck({ id: 't1', departureDate: TODAY })]
    const loads = [
      mkLoad('t1', 'A7758 B', { kg: 7270, m3: 13.5 }),
      mkLoad('t1', 'A7827 B', { kg: 7270, m3: 13.08 }),
      mkLoad('t1', 'A9999', { pending: 'add' }),      // sin confirmar: no cuenta
      mkLoad('otro', 'A8888'),                         // de otro camión
    ]
    const [m] = trucksSalientesHoy(trucks, loads)
    expect(m.refs).toEqual(['A7758 B', 'A7827 B'])
    expect(m.kg).toBe(14540)
    expect(m.m3).toBeCloseTo(26.58, 2)
  })

  it('las cargas que viajan en un consolidado no se listan sueltas', () => {
    const enCamion = mkShip('A7758 B', [mkOp({ SALIDA: TODAY, ETA_FISC: TOMORROW })])
    const suelta = mkShip('A7500', [mkOp({ SALIDA: TODAY })])
    const trucks = [mkTruck({ id: 't1', departureDate: TODAY })]
    const loads = [mkLoad('t1', 'A7758 B')]

    const snap = buildTodaySnapshot([enCamion, suelta], trucks, loads)
    expect(snap.salientes.map(m => m.shipment.REF)).toEqual(['A7500'])
    expect(snap.trucksSalientes).toHaveLength(1)
    // el consolidado cuenta como movimiento del día
    expect(snap.totalCount).toBe(2)
    expect(snap.hasMovement).toBe(true)
  })

  it('sin camiones, el snapshot se comporta igual que antes', () => {
    const s = mkShip('A7500', [mkOp({ SALIDA: TODAY })])
    const snap = buildTodaySnapshot([s])
    expect(snap.salientes).toHaveLength(1)
    expect(snap.trucksSalientes).toHaveLength(0)
    expect(snap.totalCount).toBe(1)
  })
})

describe('sinLiberarAlerts — llegan y no están liberadas', () => {
  const uy = (ref: string, eta: string, extra: Partial<ParsedShipment> = {}) =>
    mkShip(ref, [mkOp({ REF: ref, CNTR_OP: 'ABCD1234567' })], { ETA: eta, PAIS: 'UY', ...extra })
  const liberada = { liberado: { done: true } }

  it('avisa por una carga que llega dentro de los 7 días sin liberar', () => {
    const a = sinLiberarAlerts([uy('A1', '2026-04-24')], new Map())
    expect(a).toHaveLength(1)
    expect(a[0].diasParaLlegar).toBe(4)
  })

  it('no avisa si ya está liberada', () => {
    const checks = new Map([['A1', liberada]])
    expect(sinLiberarAlerts([uy('A1', '2026-04-24')], checks)).toHaveLength(0)
  })

  it('no avisa por una carga que llega más allá de la ventana', () => {
    expect(sinLiberarAlerts([uy('A1', '2026-05-10')], new Map())).toHaveLength(0)
  })

  it('la ventana es configurable', () => {
    expect(sinLiberarAlerts([uy('A1', '2026-04-30')], new Map(), 14)).toHaveLength(1)
  })

  it('una carga que YA llegó y sigue sin liberar es lo más urgente', () => {
    const a = sinLiberarAlerts([uy('A1', '2026-04-18')], new Map())
    expect(a[0].severity).toBe('vencido')
    expect(a[0].diasParaLlegar).toBe(-2)
  })

  it('llega hoy o mañana → urgente', () => {
    expect(sinLiberarAlerts([uy('A1', '2026-04-20')], new Map())[0].severity).toBe('urgente')
    expect(sinLiberarAlerts([uy('A1', '2026-04-22')], new Map())[0].severity).toBe('urgente')
  })

  it('llega en 5 días → aviso normal', () => {
    expect(sinLiberarAlerts([uy('A1', '2026-04-25')], new Map())[0].severity).toBe('proxima')
  })

  it('solo mira las cargas que operan por Uruguay', () => {
    const ar = mkShip('A2', [mkOp({ REF: 'A2' })], { ETA: '2026-04-24', PAIS: 'AR' })
    expect(sinLiberarAlerts([ar], new Map())).toHaveLength(0)
  })

  it('una carga que ya salió del puerto no se avisa', () => {
    const s = mkShip('A1', [mkOp({ REF: 'A1', SALIDA: '2026-04-19' })], { ETA: '2026-04-18', PAIS: 'UY' })
    expect(sinLiberarAlerts([s], new Map())).toHaveLength(0)
  })

  it('sin ETA no se puede avisar nada', () => {
    expect(sinLiberarAlerts([uy('A1', '')], new Map())).toHaveLength(0)
  })

  it('ordena por la que llega antes', () => {
    const a = sinLiberarAlerts([uy('A1', '2026-04-25'), uy('A2', '2026-04-21'), uy('A3', '2026-04-23')], new Map())
    expect(a.map(x => x.shipment.REF)).toEqual(['A2', 'A3', 'A1'])
  })

  it('el resto de los checks no importa: solo cuenta LIBERADO', () => {
    const checks = new Map([['A1', { bl_entregado: { done: true }, pagos_ok: { done: true } }]])
    expect(sinLiberarAlerts([uy('A1', '2026-04-24')], checks)).toHaveLength(1)
  })

  it('entra al snapshot de HOY', () => {
    const snap = buildTodaySnapshot([uy('A1', '2026-04-24')], [], [], new Map())
    expect(snap.sinLiberar).toHaveLength(1)
  })
})

describe('sinLiberarAlerts — solo lo que se puede resolver en Checks', () => {
  const uy = (ref: string, eta: string, ops: Partial<OperativasRecord>[] = [{}]) =>
    mkShip(ref, ops.map(o => mkOp({ REF: ref, CNTR_OP: 'ABCD1234567', ...o })), { ETA: eta, PAIS: 'UY' })

  it('no avisa por una carga vieja sin datos de operativa: no está en Checks', () => {
    // ETA hace 320 días y nunca se cargó LIBRE/SALIDA/ETA_FISC → Checks no la
    // muestra, así que no hay dónde apretar LIBERADO.
    expect(sinLiberarAlerts([uy('A6994', '2025-06-04')], new Map())).toHaveLength(0)
  })

  it('el corte es el mismo que el de Checks: 60 días sin datos de operativa', () => {
    expect(sinLiberarAlerts([uy('A1', '2026-01-20')], new Map())).toHaveLength(0)   // 90d
    expect(sinLiberarAlerts([uy('A2', '2026-03-05')], new Map())).toHaveLength(1)   // 46d
  })

  it('una carga vieja CON datos de operativa sigue avisando: está en Checks', () => {
    const s = uy('A1', '2025-12-01', [{ ETA_FISC: '2026-06-01' }])
    expect(sinLiberarAlerts([s], new Map())).toHaveLength(1)
  })

  it('no avisa por una carga ya devuelta y arribada a fiscal', () => {
    const s = uy('A1', '2026-04-10', [{ LIBRE: 'DEVUELTO', ETA_FISC: '2026-04-15' }])
    expect(sinLiberarAlerts([s], new Map())).toHaveLength(0)
  })

  it('devuelta pero todavía sin llegar a fiscal: sigue viva', () => {
    const s = uy('A1', '2026-04-18', [{ LIBRE: 'DEVUELTO', ETA_FISC: '2026-04-30' }])
    expect(sinLiberarAlerts([s], new Map())).toHaveLength(1)
  })
})

describe('salidasPisadasAlerts — el buque se movió y pisa la salida', () => {
  // ETA de carga vacía por default: estos tests fijan la llegada con ETA_OP.
  // La ETA de la CARGA manda cuando existe (etaVigente) — test propio abajo.
  const uy = (ref: string, ops: Partial<OperativasRecord>[], extra: Partial<ParsedShipment> = {}) =>
    mkShip(ref, ops.map(o => mkOp({ REF: ref, CNTR_OP: 'ABCD1234567', ...o })), { PAIS: 'UY', ETA: '', ...extra })

  it('salida ANTES de la llegada del buque → IMPOSIBLE (caso A7914 de Brian)', () => {
    // Salida coordinada mañana, el buque atrasado llega pasado mañana.
    const s = uy('A7914', [{ SALIDA: TOMORROW, ETA_OP: '2026-04-22' }])
    const out = salidasPisadasAlerts([s])
    expect(out).toHaveLength(1)
    expect(out[0].grave).toBe(true)
    expect(out[0].margen).toBeLessThan(0)
  })

  it('sale el MISMO día que opera el buque → también imposible', () => {
    const s = uy('A1', [{ SALIDA: TOMORROW, ETA_OP: TOMORROW }])
    const out = salidasPisadasAlerts([s])
    expect(out).toHaveLength(1)
    expect(out[0].grave).toBe(true)
    expect(out[0].margen).toBe(0)
  })

  it('TRASIEGO al día siguiente de la llegada → aviso "muy justa", no grave', () => {
    // Desde el 28/08 la "muy justa" es regla de TRASIEGO: el directo tiene su
    // ventana normal en ETA+1/+2 (test propio abajo).
    const s = uy('A1', [{ OPERATIVA: 'TRASIEGO', SALIDA: '2026-04-22', ETA_OP: TOMORROW }])
    const out = salidasPisadasAlerts([s])
    expect(out).toHaveLength(1)
    expect(out[0].grave).toBe(false)
    expect(out[0].margen).toBe(1)
  })

  it('con el margen normal (2+ días después de la llegada) no molesta', () => {
    const s = uy('A1', [{ SALIDA: '2026-04-23', ETA_OP: TOMORROW }])
    expect(salidasPisadasAlerts([s])).toHaveLength(0)
  })

  it('salida "pasada" pero el buque aún no llegó: ese camión no salió → sigue alertando', () => {
    const s = uy('A1', [{ SALIDA: YESTERDAY, ETA_OP: '2026-04-25' }])
    const out = salidasPisadasAlerts([s])
    expect(out).toHaveLength(1)
    expect(out[0].grave).toBe(true)
  })

  it('pares con ambas fechas en el pasado son historia, no acción', () => {
    const s = uy('A1', [{ SALIDA: '2026-04-10', ETA_OP: '2026-04-12' }])
    expect(salidasPisadasAlerts([s])).toHaveLength(0)
  })

  it('el buque atrasado manda: la ETA de la CARGA pisa la copia vieja de ETA_OP (caso A7995)', () => {
    // El buque venía para el 10/04 (ETA_OP horneado) y se corrió al 21/04 —
    // el sync/la ficha actualizan la ETA de la carga, NADIE toca ETA_OP.
    // La salida coordinada el 21/04 quedó el MISMO día que la llegada real:
    // comparar contra la copia vieja (margen +11) la dejaba pasar muda.
    const s = uy('A7995', [{ SALIDA: TOMORROW, ETA_OP: '2026-04-10' }], { ETA: TOMORROW })
    const out = salidasPisadasAlerts([s])
    expect(out).toHaveLength(1)
    expect(out[0].grave).toBe(true)
    expect(out[0].margen).toBe(0)
    expect(out[0].eta).toBe(TOMORROW)
  })

  it('sin ETA del contenedor usa la ETA de la carga', () => {
    const s = uy('A1', [{ SALIDA: TOMORROW, ETA_OP: '' }], { ETA: '2026-04-23' })
    const out = salidasPisadasAlerts([s])
    expect(out).toHaveLength(1)
    expect(out[0].eta).toBe('2026-04-23')
  })

  it('cargas que no van por Uruguay quedan afuera', () => {
    const s = uy('A1', [{ SALIDA: TOMORROW, ETA_OP: '2026-04-23' }], { PAIS: 'AR' })
    expect(salidasPisadasAlerts([s])).toHaveLength(0)
  })

  it('sin salida coordinada o sin ETA no hay comparación posible → silencio', () => {
    const s1 = uy('A1', [{ SALIDA: '', ETA_OP: TOMORROW }])
    const s2 = uy('A2', [{ SALIDA: 'CONFIRMAR', ETA_OP: TOMORROW }], { ETA: '' })
    const s3 = uy('A3', [{ SALIDA: TOMORROW, ETA_OP: '' }], { ETA: '' })
    expect(salidasPisadasAlerts([s1, s2, s3])).toHaveLength(0)
  })

  it('imposibles primero, después las justas; el snapshot las incluye', () => {
    const grave = uy('A2', [{ SALIDA: '2026-04-24', ETA_OP: '2026-04-26' }])
    const justa = uy('A1', [{ OPERATIVA: 'TRASIEGO', SALIDA: '2026-04-22', ETA_OP: TOMORROW }])
    const out = salidasPisadasAlerts([justa, grave])
    expect(out.map(a => a.shipment.REF)).toEqual(['A2', 'A1'])
    const snap = buildTodaySnapshot([grave])
    expect(snap.salidasPisadas).toHaveLength(1)
    expect(snap.hasMovement).toBe(true)
  })
})

describe('salidasPisadasAlerts — el directo tiene su propia ventana (Brian 28/08)', () => {
  const uy = (ref: string, ops: Partial<OperativasRecord>[], extra: Partial<ParsedShipment> = {}) =>
    mkShip(ref, ops.map(o => mkOp({ REF: ref, CNTR_OP: 'ABCD1234567', ...o })), { PAIS: 'UY', ETA: '', ...extra })

  it('CONTENEDOR directo saliendo a ETA+1: ventana normal, NO alerta (caso A7967)', () => {
    const s = uy('A7967', [{ OPERATIVA: 'CONTENEDOR', SALIDA: TOMORROW, ETA_OP: TODAY }])
    expect(salidasPisadasAlerts([s])).toHaveLength(0)
  })

  it('CONTENEDOR directo saliendo el MISMO día que llega: sigue siendo grave', () => {
    const s = uy('A1', [{ OPERATIVA: 'CONTENEDOR', SALIDA: TOMORROW, ETA_OP: TOMORROW }])
    const out = salidasPisadasAlerts([s])
    expect(out).toHaveLength(1)
    expect(out[0].grave).toBe(true)
  })

  it('TRASIEGO a 1 día sigue avisando (margen de 2 días)', () => {
    const s = uy('A2', [{ OPERATIVA: 'TRASIEGO', SALIDA: TOMORROW, ETA_OP: TODAY }])
    expect(salidasPisadasAlerts([s])).toHaveLength(1)
  })
})
