import { describe, it, expect } from 'vitest'
import {
  camposDesdeDatosClave, datosClaveDesdeFila, buscarRefDuplicada, normalizarRef, sufijosSugeridos,
  noApilableDesde, apilableDesde, parseNum, LCL_DATOS_CLAVE_VACIOS, LCL_DATOS_CLAVE_ORDEN,
  type LclDatosClaveState,
} from './lclAlta'
import { DATOS_CLAVE } from './datosClave'

const HOY = '2026-09-01'
const datos = (over: Partial<LclDatosClaveState> = {}): LclDatosClaveState => ({
  ...LCL_DATOS_CLAVE_VACIOS,
  ref: 'LCL247', cliente: 'CIUFFO', fiscal: 'RAFAELA', docNumber: 'HBL123',
  pkgs: '12', kg: '1250,5', m3: '3,2',
  ...over,
})

describe('camposDesdeDatosClave — el formulario se traduce igual desde los dos lados', () => {
  it('mapea los 14 datos clave a sus columnas', () => {
    const r = camposDesdeDatosClave(datos({
      stock: '13030', wood: true, apilable: 'no', imo: true, entregaPlanta: true,
      eta: '2026-09-03', deposito: 'planir',
    }), HOY)
    expect(r).toMatchObject({
      ref: 'LCL247', cliente: 'CIUFFO', fiscal: 'RAFAELA', doc_number: 'HBL123',
      pkgs: 12, kg: 1250.5, m3: 3.2, stock: '13030',
      wood: true, no_apilable: true, imo: true, entrega_planta: true,
      eta: '2026-09-03', deposito: 'PLANIR',
    })
  })

  it('escribe exactamente las columnas de DATOS_CLAVE.lcl (más desconsol_date)', () => {
    const r = camposDesdeDatosClave(datos(), HOY)
    const cols = Object.keys(r).filter(k => k !== 'desconsol_date').sort()
    expect(cols).toEqual(DATOS_CLAVE.lcl.map(d => d.key).sort())
  })

  it('de la fila al formulario y de vuelta se conserva todo', () => {
    const fila = {
      ref: 'E163 A', cliente: 'INELPA', fiscal: 'CLIR', doc_number: 'BL9', pkgs: 8, kg: 640, m3: 2.5,
      stock: '77', wood: null, no_apilable: true, imo: false, entrega_planta: true,
      eta: '2026-08-20', deposito: 'GODILCO',
    }
    const f = datosClaveDesdeFila(fila)
    expect(f).toMatchObject({ ref: 'E163 A', pkgs: '8', kg: '640', m3: '2.5', wood: null, apilable: 'no', entregaPlanta: true, eta: '2026-08-20', deposito: 'GODILCO' })
    expect(camposDesdeDatosClave(f, HOY, '2026-08-21')).toMatchObject({ ...fila, desconsol_date: '2026-08-21' })
  })

  it('números en 0 quedan vacíos en el formulario (el 0 no es dato)', () => {
    expect(datosClaveDesdeFila({ pkgs: 0, kg: null as unknown as number, m3: undefined })).toMatchObject({ pkgs: '', kg: '', m3: '' })
  })

  it('con stock y sin fecha de desconsolidación estampa HOY (desconsolidar es dar el stock)', () => {
    expect(camposDesdeDatosClave(datos({ stock: '13030' }), HOY).desconsol_date).toBe(HOY)
  })

  it('sin stock no inventa fecha de desconsolidación', () => {
    expect(camposDesdeDatosClave(datos({ stock: '' }), HOY).desconsol_date).toBe('')
    expect(camposDesdeDatosClave(datos({ stock: '   ' }), HOY).desconsol_date).toBe('')
  })

  it('si ya había fecha de desconsolidación se respeta', () => {
    expect(camposDesdeDatosClave(datos({ stock: '13030' }), HOY, '2026-08-28').desconsol_date).toBe('2026-08-28')
  })

  it('recorta espacios y tolera números vacíos', () => {
    const r = camposDesdeDatosClave(datos({ ref: '  LCL247 ', pkgs: '', kg: 'abc', m3: '' }), HOY)
    expect(r.ref).toBe('LCL247')
    expect(r.pkgs).toBe(0)
    expect(r.kg).toBe(0)
    expect(r.m3).toBe(0)
  })

  it('madera a confirmar queda null (no se marca No sin que nadie lo chequee)', () => {
    expect(camposDesdeDatosClave(datos({ wood: null }), HOY).wood).toBeNull()
  })
})

describe('apilable ↔ no_apilable', () => {
  it('"no" apilable es la única que marca no_apilable', () => {
    expect(noApilableDesde('no')).toBe(true)
    expect(noApilableDesde('si')).toBe(false)
    expect(noApilableDesde('sin_dato')).toBe(false)
  })
  it('de la fila al formulario: no_apilable=true → "no"; el resto no se asume', () => {
    expect(apilableDesde(true)).toBe('no')
    expect(apilableDesde(false)).toBe('sin_dato')
    expect(apilableDesde(null)).toBe('sin_dato')
  })
})

describe('el orden de los datos clave es el que pidió Brian (derivado de DATOS_CLAVE.lcl)', () => {
  it('14 campos: los 12 del alta y al final llegada a MVD y depósito', () => {
    expect(LCL_DATOS_CLAVE_ORDEN.map(c => c.label)).toEqual([
      'Ref', 'Cliente', 'Fiscal', 'BL', 'Bultos', 'Kilos', 'M³', 'Nº stock',
      'Madera', 'Apilable', 'IMO', 'Entrega en planta', 'Llegada a Montevideo', 'Depósito de desconsolidación',
    ])
    expect(LCL_DATOS_CLAVE_ORDEN.map(c => c.col)).toEqual(DATOS_CLAVE.lcl.map(d => d.key))
    // Cada columna tiene su clave en el estado del formulario.
    for (const c of LCL_DATOS_CLAVE_ORDEN) expect(c.key in LCL_DATOS_CLAVE_VACIOS).toBe(true)
  })
})

describe('parseNum — números como los tipea el equipo', () => {
  it('coma decimal, punto de miles con coma, punto decimal solo', () => {
    expect(parseNum('1250,5')).toBe(1250.5)
    expect(parseNum('1.250,5')).toBe(1250.5)
    expect(parseNum('12.500,75')).toBe(12500.75)
    expect(parseNum('3.2')).toBe(3.2)
    expect(parseNum('  12 ')).toBe(12)
  })
  it('vacío o basura → 0', () => {
    expect(parseNum('')).toBe(0)
    expect(parseNum('abc')).toBe(0)
  })
})

describe('buscarRefDuplicada — otra carga activa con la misma ref', () => {
  const cargas = [
    { id: '1', ref: 'LCL247', archived: false },
    { id: '2', ref: 'E163 A', archived: false },
    { id: '3', ref: 'LCL200', archived: true },
  ]

  it('encuentra la repetida sin importar mayúsculas ni espacios', () => {
    expect(buscarRefDuplicada('lcl247', cargas)?.id).toBe('1')
    expect(buscarRefDuplicada('  e163   a ', cargas)?.id).toBe('2')
  })

  it('las archivadas no cuentan: la ref se puede reusar', () => {
    expect(buscarRefDuplicada('LCL200', cargas)).toBeNull()
  })

  it('ref vacía no choca con nada', () => {
    expect(buscarRefDuplicada('', cargas)).toBeNull()
    expect(buscarRefDuplicada('   ', cargas)).toBeNull()
  })

  it('al editar, la propia fila no cuenta como duplicada', () => {
    expect(buscarRefDuplicada('LCL247', cargas, { ignorarId: '1' })).toBeNull()
  })

  it('ref nueva → null', () => {
    expect(buscarRefDuplicada('LCL999', cargas)).toBeNull()
  })
})

describe('sufijosSugeridos — carga partida', () => {
  it('sugiere A y B para una ref sin sufijo', () => {
    expect(sufijosSugeridos('LCL247')).toEqual(['LCL247 A', 'LCL247 B'])
  })
  it('si ya termina en una letra sugiere la siguiente', () => {
    expect(sufijosSugeridos('E163 A')).toEqual(['E163 B'])
    expect(sufijosSugeridos('e163 b')).toEqual(['E163 C'])
  })
  it('normaliza la ref antes de sugerir', () => {
    expect(sufijosSugeridos('  lcl  247 ')).toEqual(['LCL 247 A', 'LCL 247 B'])
    expect(normalizarRef('  lcl  247 ')).toBe('LCL 247')
  })
})
