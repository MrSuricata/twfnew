import { describe, it, expect } from 'vitest'
import type { ParsedShipment, OperativasRecord } from './shipmentTypes'
import {
  cargasDePartner, depositosEnCargas, transportesEnCargas, contarPorOpcion,
  transportesDeOperativa, ROL_VISTA_LABEL,
} from './vistaComo'

const op = (o: Partial<OperativasRecord> = {}): OperativasRecord => ({
  REF: 'A1', TLX: '', DEPOSITO: 'GODILCO', ETA_OP: '', SALIDA: '', ETA_FISC: '', LIBRE: '',
  OPERATIVA: 'TRASIEGO', CNTR_OP: 'CNTR1', PKGS: 1, KG: 1, M3: 1, DESCRIPCION: '', FISCAL: '',
  DESCARGA: '', DEV: '', TIPO: '', WOOD: '', TRANSPORTE: 'TRANSCAL', LUGAR_SALIDA: '',
  ...o,
} as unknown as OperativasRecord)

const carga = (c: Partial<ParsedShipment> = {}, operativas: OperativasRecord[] = [op()]): ParsedShipment => ({
  REF: 'A1', CLIENTE: 'CHIAPERO', ETA: '2026-09-05', operativas, containers: [],
  ...c,
} as unknown as ParsedShipment)

describe('transportesDeOperativa — compartidos', () => {
  it('parte por / , y + como el server, en mayúsculas', () => {
    expect(transportesDeOperativa({ TRANSPORTE: 'MARITIMA / URUGUAY' })).toEqual(['MARITIMA', 'URUGUAY'])
    expect(transportesDeOperativa({ TRANSPORTE: 'transcal, carrara' })).toEqual(['TRANSCAL', 'CARRARA'])
    expect(transportesDeOperativa({ TRANSPORTE: 'A + B' })).toEqual(['A', 'B'])
    expect(transportesDeOperativa({ TRANSPORTE: '' })).toEqual([])
  })
})

describe('cargasDePartner — mismo criterio que el server', () => {
  const lista = [
    carga({ REF: 'A1' }, [op({ DEPOSITO: 'GODILCO', TRANSCAL: undefined } as never)]),
    carga({ REF: 'A2' }, [op({ DEPOSITO: 'PLANIR', TRANSPORTE: 'CARRARA' })]),
    carga({ REF: 'A3' }, [
      op({ CNTR_OP: 'X', DEPOSITO: 'GODILCO' }),
      op({ CNTR_OP: 'Y', DEPOSITO: 'PLANIR' }),
    ]),
    carga({ REF: 'ARCH', archived: true } as never, [op({ DEPOSITO: 'GODILCO' })]),
  ]

  it('depósito: solo sus cargas, y de cada una solo SUS contenedores', () => {
    const r = cargasDePartner(lista, 'depot', 'GODILCO')
    expect(r.map(s => s.REF)).toEqual(['A1', 'A3'])
    expect(r[1].operativas!.map(o => o.CNTR_OP)).toEqual(['X'])
  })

  it('no filtra por mayúsculas ni espacios', () => {
    expect(cargasDePartner(lista, 'depot', ' godilco ').map(s => s.REF)).toEqual(['A1', 'A3'])
  })

  it('transporte: exacto, sin matchear pedazos de otro nombre', () => {
    expect(cargasDePartner(lista, 'transport', 'CARRARA').map(s => s.REF)).toEqual(['A2'])
    expect(cargasDePartner(lista, 'transport', 'CARR')).toEqual([])
  })

  it('las archivadas no se ven', () => {
    expect(cargasDePartner(lista, 'depot', 'GODILCO').some(s => s.REF === 'ARCH')).toBe(false)
  })

  it('no muta la carga original', () => {
    const original = carga({ REF: 'A9' }, [op({ CNTR_OP: 'X', DEPOSITO: 'GODILCO' }), op({ CNTR_OP: 'Y', DEPOSITO: 'PLANIR' })])
    cargasDePartner([original], 'depot', 'GODILCO')
    expect(original.operativas).toHaveLength(2)
  })
})

describe('opciones del selector', () => {
  const lista = [
    carga({ REF: 'A1' }, [op({ DEPOSITO: 'PLANIR', TRANSPORTE: 'TRANSCAL' })]),
    carga({ REF: 'A2' }, [op({ DEPOSITO: 'GODILCO', TRANSPORTE: 'MARITIMA / URUGUAY' })]),
    carga({ REF: 'A3' }, [op({ DEPOSITO: 'godilco', TRANSPORTE: '' })]),
  ]
  it('depósitos y transportes únicos, ordenados', () => {
    expect(depositosEnCargas(lista)).toEqual(['GODILCO', 'PLANIR'])
    expect(transportesEnCargas(lista)).toEqual(['MARITIMA', 'TRANSCAL', 'URUGUAY'])
  })
  it('cuenta cuántas cargas vería cada uno', () => {
    expect(contarPorOpcion(lista, 'depot', ['GODILCO', 'PLANIR'])).toEqual({ GODILCO: 2, PLANIR: 1 })
  })
  it('las etiquetas están en español', () => {
    expect(ROL_VISTA_LABEL).toEqual({ depot: 'Depósito', transport: 'Transporte', client: 'Cliente' })
  })
})
