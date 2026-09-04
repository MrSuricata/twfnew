import { describe, it, expect } from 'vitest'
import {
  DATOS_CLAVE, reclamables, faltaDato, datosQueFaltan, etiquetaDe, LOAD_DESDE_SHIPMENT,
} from './datosClave'
import { SHIPMENT_COLS } from '../../api/_lib/shipmentCols'

describe('DATOS_CLAVE — cada dato clave es una columna que el API acepta', () => {
  for (const modalidad of ['lcl', 'fcl', 'air'] as const) {
    it(`${modalidad}: todas las keys están en SHIPMENT_COLS (el PATCH no las descarta)`, () => {
      const fuera = DATOS_CLAVE[modalidad].map(d => d.key).filter(k => !SHIPMENT_COLS.has(k))
      expect(fuera).toEqual([])
    })
    it(`${modalidad}: sin keys repetidas`, () => {
      const keys = DATOS_CLAVE[modalidad].map(d => d.key)
      expect(new Set(keys).size).toBe(keys.length)
    })
  }

  it('lo que el load copia de la carga también son columnas reales', () => {
    const cols = Object.values(LOAD_DESDE_SHIPMENT).flat()
    expect(cols.filter(c => !SHIPMENT_COLS.has(c))).toEqual([])
  })
})

describe('DATOS_CLAVE.fcl — lo que HOY reclama al alta (spec 04/09)', () => {
  it('la ref del cliente y la madera se reclaman', () => {
    const rec = reclamables('fcl').map(d => d.key)
    expect(rec).toContain('client_ref')
    expect(rec).toContain('wood')
  })

  it('la ref del cliente se llama como la nombró Brian y no es obligatoria al alta', () => {
    const d = DATOS_CLAVE.fcl.find(x => x.key === 'client_ref')
    expect(d?.label).toBe('Ref. del cliente')
    expect(d?.obligatorioAlta).toBe(false)
  })

  it('la madera es tri-estado: sin definir falta, false no', () => {
    const d = DATOS_CLAVE.fcl.find(x => x.key === 'wood')!
    expect(d.control).toBe('madera')
    expect(faltaDato(d, { wood: null })).toBe(true)
    expect(faltaDato(d, {})).toBe(true)
    expect(faltaDato(d, { wood: false })).toBe(false)
  })
})

describe('DATOS_CLAVE.lcl — la lista de Brian, en su orden', () => {
  it('14 datos: ref primero, después los 12 del alta, y al final llegada a MVD y depósito', () => {
    expect(DATOS_CLAVE.lcl.map(d => d.key)).toEqual([
      'ref', 'cliente', 'fiscal', 'doc_number', 'pkgs', 'kg', 'm3', 'stock',
      'wood', 'no_apilable', 'imo', 'entrega_planta', 'eta', 'deposito',
    ])
  })

  it('solo ref y cliente son obligatorios en el alta', () => {
    expect(DATOS_CLAVE.lcl.filter(d => d.obligatorioAlta).map(d => d.key)).toEqual(['ref', 'cliente'])
  })

  it('HOY reclama exactamente bultos, kilos, m³, fiscal, madera, llegada y depósito', () => {
    expect(reclamables('lcl').map(d => d.key)).toEqual(['fiscal', 'pkgs', 'kg', 'm3', 'wood', 'eta', 'deposito'])
  })

  it('las tildes (IMO, planta) y apilable no se reclaman: false es un valor', () => {
    for (const k of ['imo', 'entrega_planta', 'no_apilable']) {
      expect(DATOS_CLAVE.lcl.find(d => d.key === k)?.reclamable).toBe(false)
    }
  })

  it('las etiquetas son las que se muestran en las tres pantallas', () => {
    expect(etiquetaDe('lcl', 'kg')).toBe('Kilos')
    expect(etiquetaDe('lcl', 'eta')).toBe('Llegada a Montevideo')
    expect(etiquetaDe('lcl', 'deposito')).toBe('Depósito de desconsolidación')
    expect(etiquetaDe('lcl', 'inexistente')).toBe('inexistente')
  })
})

describe('faltaDato / datosQueFaltan — qué se reclama', () => {
  const completa = {
    ref: 'E163 A', cliente: 'INELPA', fiscal: 'CLIR', doc_number: 'BL1', pkgs: 10, kg: 800, m3: 4,
    stock: '', wood: false, no_apilable: false, imo: false, entrega_planta: false,
    eta: '2026-08-20', deposito: 'GODILCO',
  }

  it('una LCL completa no reclama nada', () => {
    expect(datosQueFaltan('lcl', completa)).toEqual([])
  })

  it('números en 0 o vacíos faltan; madera null falta pero false no', () => {
    const faltan = datosQueFaltan('lcl', { ...completa, kg: 0, m3: '', pkgs: null, wood: null })
    expect(faltan.map(d => d.key)).toEqual(['pkgs', 'kg', 'm3', 'wood'])
    expect(datosQueFaltan('lcl', { ...completa, wood: false })).toEqual([])
  })

  it('fiscal, llegada y depósito vacíos faltan; IMO/planta en false nunca', () => {
    const faltan = datosQueFaltan('lcl', { ...completa, fiscal: '  ', eta: '', deposito: null, imo: false, entrega_planta: false })
    expect(faltan.map(d => d.key)).toEqual(['fiscal', 'eta', 'deposito'])
  })

  it('el orden de los faltantes es el de la lista', () => {
    const faltan = datosQueFaltan('lcl', { ...completa, deposito: '', fiscal: '' })
    expect(faltan.map(d => d.key)).toEqual(['fiscal', 'deposito'])
  })

  it('faltaDato para una tilde siempre es false', () => {
    const imo = DATOS_CLAVE.lcl.find(d => d.key === 'imo')!
    expect(faltaDato(imo, { imo: false })).toBe(false)
    expect(faltaDato(imo, {})).toBe(false)
  })
})
