import { describe, it, expect } from 'vitest'
import type { Truck, TruckLoad } from './truckTypes'
import { trucksToEvents, shipmentsToEvents, pendingSalida, arrivalInfo, compareByArrival } from './agendaUtils'
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

// ── shipmentsToEvents — alerta salida antes de la llegada ───────────────────

describe('shipmentsToEvents — alerta salida antes de llegada', () => {
  const opWith = (salida: string, etaOp: string): OperativasRecord => ({
    REF: 'A7999', TLX: '', DEPOSITO: 'GODILCO', ETA_OP: etaOp,
    SALIDA: salida, ETA_FISC: '', LIBRE: '', OPERATIVA: 'TRASIEGO', CNTR_OP: 'C1',
    PKGS: 1, KG: 1, M3: 1, DESCRIPCION: '', FISCAL: '', DESCARGA: '', DEV: '',
    CLIENTE_OP: 'PERETTI', TIPO: '40HC', WOOD: '', TRANSPORTE: '', HORARIO: '', LUGAR_SALIDA: '',
  })

  it('SALIDA anterior a la ETA → el evento de salida lleva alerta salida_antes_llegada', () => {
    const shipment = makeShipment({ ETA: '2026-06-21', operativas: [opWith('2026-06-20', '2026-06-21')] })
    const salida = shipmentsToEvents([shipment]).find(e => e.type === 'salida')
    expect(salida?.alerts.some(a => a.type === 'salida_antes_llegada')).toBe(true)
  })

  it('SALIDA posterior a la ETA → sin alerta', () => {
    const shipment = makeShipment({ ETA: '2026-06-20', operativas: [opWith('2026-06-22', '2026-06-20')] })
    const salida = shipmentsToEvents([shipment]).find(e => e.type === 'salida')
    expect(salida?.alerts.some(a => a.type === 'salida_antes_llegada')).toBe(false)
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

  // ── A6820-like: DEVUELTO / CARGA A PISO siguen pendientes de coordinar salida ──
  // El contenedor vacío devuelto (LIBRE='DEVUELTO') y la mercadería en piso
  // (OPERATIVA='CARGA A PISO') NO significan que la carga ya salió: igual hay
  // que coordinar su salida al cliente. Solo una SALIDA real la saca de la lista.

  it('LIBRE = "DEVUELTO" + CARGA A PISO (caso A6820) → INCLUDED (carga aún pendiente)', () => {
    const s = mkShipPS({
      operativas: [mkOp({ SALIDA: 'CONFIRMAR', LIBRE: 'DEVUELTO', OPERATIVA: 'CARGA A PISO' })],
    })
    expect(pendingSalida([s], TODAY_PS)).toHaveLength(1)
  })

  it('LIBRE contains "DEVUELTO" (case-insensitive) → INCLUDED', () => {
    const s = mkShipPS({
      operativas: [mkOp({ SALIDA: 'CONFIRMAR', LIBRE: 'devuelto' })],
    })
    expect(pendingSalida([s], TODAY_PS)).toHaveLength(1)
  })

  it('LIBRE_HASTA on shipment containing "DEVUELTO" → INCLUDED', () => {
    const s = mkShipPS({
      LIBRE_HASTA: 'DEVUELTO',
      operativas: [mkOp({ SALIDA: 'CONFIRMAR', LIBRE: '' })],
    })
    expect(pendingSalida([s], TODAY_PS)).toHaveLength(1)
  })

  it('OPERATIVA = "CARGA A PISO" → INCLUDED (mercadería en piso, falta coordinar salida)', () => {
    const s = mkShipPS({
      operativas: [mkOp({ SALIDA: 'CONFIRMAR', OPERATIVA: 'CARGA A PISO' })],
    })
    expect(pendingSalida([s], TODAY_PS)).toHaveLength(1)
  })

  it('OPERATIVA = "DESCONSOLIDACION" → INCLUDED', () => {
    const s = mkShipPS({
      operativas: [mkOp({ SALIDA: 'CONFIRMAR', OPERATIVA: 'DESCONSOLIDACION' })],
    })
    expect(pendingSalida([s], TODAY_PS)).toHaveLength(1)
  })

  it('OPERATIVA = "TRASIEGO" (active) + arrived + no salida → INCLUDED', () => {
    const s = mkShipPS({
      operativas: [mkOp({ OPERATIVA: 'TRASIEGO', SALIDA: '' })],
    })
    expect(pendingSalida([s], TODAY_PS)).toHaveLength(1)
  })

  // ── Dedup: operativa duplicada con el mismo contenedor (caso A6820) → 1 tarjeta ──

  it('operativas duplicadas con el mismo CNTR → una sola tarjeta', () => {
    const dupOp = mkOp({ SALIDA: 'CONFIRMAR', LIBRE: 'DEVUELTO', OPERATIVA: 'CARGA A PISO', CNTR_OP: 'TRHU6345230' })
    const s = mkShipPS({ CNTR: 'TRHU6345230', operativas: [dupOp, { ...dupOp }] })
    expect(pendingSalida([s], TODAY_PS)).toHaveLength(1)
  })

  it('operativas con contenedores DISTINTOS → una tarjeta por contenedor', () => {
    const s = mkShipPS({
      operativas: [
        mkOp({ SALIDA: 'CONFIRMAR', CNTR_OP: 'AAAA1111111' }),
        mkOp({ SALIDA: 'CONFIRMAR', CNTR_OP: 'BBBB2222222' }),
      ],
    })
    expect(pendingSalida([s], TODAY_PS)).toHaveLength(2)
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

  it('ordenado por llegada (ETA) ascendente: el que arribó primero va arriba', () => {
    const s1 = mkShipPS({ REF: 'A1', ETA: '2026-06-14', operativas: [mkOp({ REF: 'A1', CNTR_OP: 'C1', ETA_OP: '2026-06-14' })] })
    const s2 = mkShipPS({ REF: 'A2', ETA: '2026-06-10', operativas: [mkOp({ REF: 'A2', CNTR_OP: 'C2', ETA_OP: '2026-06-10' })] })
    const s3 = mkShipPS({ REF: 'A3', ETA: '2026-06-16', operativas: [mkOp({ REF: 'A3', CNTR_OP: 'C3', ETA_OP: '2026-06-16' })] })

    const result = pendingSalida([s1, s2, s3], TODAY_PS)
    expect(result.map(r => r.shipment.REF)).toEqual(['A2', 'A1', 'A3']) // 10 Jun → 14 Jun → 16 Jun
  })

  it('mismo ETA → desempata estable por REF', () => {
    const sB = mkShipPS({ REF: 'A7900', ETA: YESTERDAY_PS, operativas: [mkOp({ REF: 'A7900', CNTR_OP: 'CB' })] })
    const sA = mkShipPS({ REF: 'A7800', ETA: YESTERDAY_PS, operativas: [mkOp({ REF: 'A7800', CNTR_OP: 'CA' })] })

    const result = pendingSalida([sB, sA], TODAY_PS)
    expect(result.map(r => r.shipment.REF)).toEqual(['A7800', 'A7900'])
  })

  it('expone arrival en el item (para el indicador de la card)', () => {
    const s = mkShipPS({ ETA: '2026-06-11', operativas: [mkOp()] }) // 5 días antes de TODAY_PS
    const result = pendingSalida([s], TODAY_PS)
    expect(result[0].arrival.tier).toBe(0)
    expect(result[0].arrival.label).toBe('Arribó hace 5d')
  })
})

// ── arrivalInfo / compareByArrival ──────────────────────────────────────────
// Proximidad de llegada: orden + etiqueta temporal de "Pendientes de coordinar
// salida". TODAY_PS = 16 Jun 2026.

describe('arrivalInfo', () => {
  it('ETA pasada → tier 0, "Arribó hace Xd" (caso del reclamo: ETA de un año anterior)', () => {
    const info = arrivalInfo('2025-09-03', TODAY_PS)
    expect(info.tier).toBe(0)
    expect(info.label).toBe('Arribó hace 286d') // 3 Sep 2025 → 16 Jun 2026
  })

  it('ETA hoy → "Arribó hoy" y ayer → "Arribó ayer"', () => {
    expect(arrivalInfo('2026-06-16', TODAY_PS).label).toBe('Arribó hoy')
    expect(arrivalInfo('2026-06-15', TODAY_PS).label).toBe('Arribó ayer')
    expect(arrivalInfo('2026-06-16', TODAY_PS).tier).toBe(0)
  })

  it('ETA futura cercana → tier 1, "Llega mañana" / "Llega en Xd"', () => {
    expect(arrivalInfo('2026-06-17', TODAY_PS).label).toBe('Llega mañana')
    expect(arrivalInfo('2026-06-21', TODAY_PS).label).toBe('Llega en 5d')
    expect(arrivalInfo('2026-06-21', TODAY_PS).tier).toBe(1)
  })

  it('ETA futura lejana → "Llega el dd/mm" (con año solo si no es el año en curso)', () => {
    expect(arrivalInfo('2026-09-03', TODAY_PS).label).toBe('Llega el 03/09')
    expect(arrivalInfo('2027-01-10', TODAY_PS).label).toBe('Llega el 10/01/2027')
  })

  it('sin ETA o texto no-fecha → tier 2, "Sin ETA" (parseo ISO estricto)', () => {
    expect(arrivalInfo('', TODAY_PS)).toMatchObject({ tier: 2, days: null, label: 'Sin ETA' })
    expect(arrivalInfo('CONFIRMAR', TODAY_PS).tier).toBe(2)
    expect(arrivalInfo('2/7', TODAY_PS).tier).toBe(2) // new Date('2/7') sería válida — acá no
  })
})

describe('compareByArrival', () => {
  it('ordena: arribadas (más vieja primero) → próximas (más cercana primero) → sin ETA', () => {
    const etas = ['2026-06-20', '2025-09-03', '2026-06-10', '', '2026-09-03']
    const sorted = etas
      .map(e => ({ e, info: arrivalInfo(e, TODAY_PS) }))
      .sort((a, b) => compareByArrival(a.info, b.info))
      .map(x => x.e)
    expect(sorted).toEqual(['2025-09-03', '2026-06-10', '2026-06-20', '2026-09-03', ''])
  })

  it('dos sin ETA → 0 (sin NaN por Infinity - Infinity)', () => {
    const a = arrivalInfo('', TODAY_PS)
    const b = arrivalInfo('DEVUELTO', TODAY_PS)
    expect(compareByArrival(a, b)).toBe(0)
  })
})
