import { describe, it, expect } from 'vitest'
import { prefillFclFromShipment, makeEmptyTruckLoad } from './truckUtils'
import type { ParsedShipment, OperativasRecord } from './shipmentTypes'

const op = (over: Partial<OperativasRecord> = {}): OperativasRecord =>
  ({
    REF: 'A7757', TLX: '', DEPOSITO: 'GODILCO', ETA_OP: '2026-06-19', SALIDA: '', ETA_FISC: '',
    LIBRE: '', OPERATIVA: 'TRASIEGO', CNTR_OP: 'C1', PKGS: 10, KG: 100, M3: 1,
    DESCRIPCION: 'BICIS', FISCAL: 'MARE', DESCARGA: '', DEV: '', CLIENTE_OP: 'TOOL SHOP',
    TIPO: '40HC', WOOD: '', TRANSPORTE: '', HORARIO: '',
    ...over,
  }) as OperativasRecord

const ship = (over: Partial<ParsedShipment> = {}): ParsedShipment =>
  ({ REF: 'A7757', CLIENTE: 'TOOL SHOP', ETD: '', ETA: '2026-06-19', MBL: '', operativas: [op()], ...over }) as ParsedShipment

describe('prefillFclFromShipment — BL y madera', () => {
  it('BL se autocompleta del MBL de la carga', () => {
    expect(prefillFclFromShipment(ship({ MBL: 'MAEU123456789' })).bl).toBe('MAEU123456789')
  })

  it('BL vacío si la carga no tiene MBL', () => {
    expect(prefillFclFromShipment(ship({ MBL: '' })).bl).toBe('')
  })

  it('madera = true si alguna operativa marca WOOD=SI', () => {
    const s = ship({ operativas: [op({ WOOD: '' }), op({ CNTR_OP: 'C2', WOOD: 'SI' })] })
    expect(prefillFclFromShipment(s).wood).toBe(true)
  })

  it('madera = false si ninguna operativa marca WOOD', () => {
    expect(prefillFclFromShipment(ship()).wood).toBe(false)
  })

  it('"SI MADERA" (startsWith SI) también cuenta como madera', () => {
    expect(prefillFclFromShipment(ship({ operativas: [op({ WOOD: 'SI MADERA' })] })).wood).toBe(true)
  })
})

describe('makeEmptyTruckLoad — defaults de los campos nuevos', () => {
  it('arranca con bl/stock vacíos y wood=false', () => {
    const l = makeEmptyTruckLoad('t1', 'fcl', 'A7757', 0)
    expect(l.bl).toBe('')
    expect(l.stock).toBe('')
    expect(l.wood).toBe(false)
  })
})

describe('prefillFclFromShipment — desconsolDate solo con fechas reales (bug A7827 B)', () => {
  it('DESCARGA con un LUGAR ("RAFAELA") NO va como fecha; cae a SALIDA si es ISO', () => {
    const s = ship({ operativas: [op({ DESCARGA: 'RAFAELA', SALIDA: '2026-07-24' })] })
    expect(prefillFclFromShipment(s).desconsolDate).toBe('2026-07-24')
  })
  it('DESCARGA lugar y SALIDA vacía → desconsolDate vacío (nunca texto)', () => {
    const s = ship({ operativas: [op({ DESCARGA: 'RAFAELA', SALIDA: '' })] })
    expect(prefillFclFromShipment(s).desconsolDate).toBe('')
  })
  it('DESCARGA fecha ISO se usa como siempre', () => {
    const s = ship({ operativas: [op({ DESCARGA: '2026-07-20', SALIDA: '2026-07-24' })] })
    expect(prefillFclFromShipment(s).desconsolDate).toBe('2026-07-20')
  })
})
