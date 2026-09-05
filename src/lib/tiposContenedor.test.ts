/**
 * Lo que estos tests no dejan pasar: que vuelvan a entrar "20 GP" y "20GP" como
 * cosas distintas, que "FCL" (modalidad) se guarde como si fuera un tipo, que un
 * "20GP + 40HQ" viejo desaparezca en silencio, o que el tipo a nivel carga mienta
 * con uno solo cuando los contenedores son distintos.
 */
import { describe, it, expect } from 'vitest'
import {
  TIPOS_CONTENEDOR,
  SIN_TIPO_LABEL,
  normalizarTipo,
  esTipoCanonico,
  etiquetaTipo,
  opcionesTipoContenedor,
  tipoDeCarga,
} from './tiposContenedor'

describe('normalizarTipo', () => {
  it('los espacios y las minúsculas no hacen tipos nuevos', () => {
    expect(normalizarTipo('20 gp')).toBe('20GP')
    expect(normalizarTipo('  20GP  ')).toBe('20GP')
    expect(normalizarTipo('40hq')).toBe('40HQ')
    expect(normalizarTipo('20 O T')).toBe('20OT')
  })

  it('40HC es 40HQ (el mismo contenedor con dos nombres)', () => {
    expect(normalizarTipo('40HC')).toBe('40HQ')
    expect(normalizarTipo('40 hc')).toBe('40HQ')
    expect(normalizarTipo("40'HC")).toBe('40HQ')
  })

  it('FCL y LCL son modalidad, no tipo: quedan vacíos', () => {
    expect(normalizarTipo('FCL')).toBe('')
    expect(normalizarTipo('fcl')).toBe('')
    expect(normalizarTipo('LCL')).toBe('')
  })

  it('sin dato, vacío (no rompe con null/undefined/número)', () => {
    expect(normalizarTipo('')).toBe('')
    expect(normalizarTipo(null)).toBe('')
    expect(normalizarTipo(undefined)).toBe('')
    expect(normalizarTipo('   ')).toBe('')
  })

  it('un valor viejo fuera de la lista NO se pierde: vuelve prolijo', () => {
    expect(normalizarTipo('20GP + 40HQ')).toBe('20GP + 40HQ')
    expect(normalizarTipo('20gp   +   40hq')).toBe('20GP + 40HQ')
    expect(normalizarTipo('20DV')).toBe('20DV')
    expect(normalizarTipo('20DRY')).toBe('20DRY')
  })

  it('todos los canónicos se normalizan a sí mismos (idempotente)', () => {
    for (const t of TIPOS_CONTENEDOR) {
      expect(normalizarTipo(t)).toBe(t)
      expect(normalizarTipo(normalizarTipo(t))).toBe(t)
    }
  })
})

describe('esTipoCanonico', () => {
  it('reconoce la lista y sus sinónimos, y rechaza el resto', () => {
    expect(esTipoCanonico('40HC')).toBe(true)      // sinónimo de 40HQ
    expect(esTipoCanonico('20 gp')).toBe(true)
    expect(esTipoCanonico('FCL')).toBe(false)      // modalidad
    expect(esTipoCanonico('')).toBe(false)
    expect(esTipoCanonico('20GP + 40HQ')).toBe(false)
  })
})

describe('etiquetaTipo', () => {
  it('el desplegable explica qué es cada código', () => {
    expect(etiquetaTipo('40HQ')).toBe('40HQ — 40 pies high cube')
    expect(etiquetaTipo('40NOR')).toBe('40NOR — reefer apagado')
    expect(etiquetaTipo('20OT')).toBe('20OT — open top')
    expect(etiquetaTipo('20FR')).toBe('20FR — flat rack')
    expect(etiquetaTipo('20GP')).toBe('20GP — 20 pies estándar')
  })

  it('vacío es "todavía no se sabe", no un hueco', () => {
    expect(etiquetaTipo('')).toBe(SIN_TIPO_LABEL)
  })

  it('un valor viejo se muestra tal cual (sin inventarle descripción)', () => {
    expect(etiquetaTipo('20DV')).toBe('20DV')
  })
})

describe('opcionesTipoContenedor', () => {
  it('la opción vacía primero y después la lista completa', () => {
    const o = opcionesTipoContenedor('')
    expect(o).toHaveLength(TIPOS_CONTENEDOR.length + 1)
    expect(o[0]).toEqual({ value: '', label: SIN_TIPO_LABEL })
    expect(o.map(x => x.value).slice(1)).toEqual([...TIPOS_CONTENEDOR])
    expect(o.some(x => x.legacy)).toBe(false)
  })

  it('un tipo conocido (aunque venga como 40HC) no agrega opciones', () => {
    const o = opcionesTipoContenedor('40HC')
    expect(o).toHaveLength(TIPOS_CONTENEDOR.length + 1)
    expect(o.some(x => x.value === '40HQ')).toBe(true)
  })

  it('un valor viejo fuera de la lista se ofrece MARCADO, no se pierde', () => {
    const o = opcionesTipoContenedor('20GP + 40HQ')
    const extra = o[o.length - 1]
    expect(extra.value).toBe('20GP + 40HQ')
    expect(extra.legacy).toBe(true)
    expect(extra.label).toContain('dato anterior')
  })

  it('"FCL" no ensucia el desplegable: era modalidad, no tipo', () => {
    const o = opcionesTipoContenedor('FCL')
    expect(o.some(x => x.legacy)).toBe(false)
    expect(o.some(x => x.value === 'FCL')).toBe(false)
  })
})

describe('tipoDeCarga — el nivel carga no puede mentir', () => {
  const c = (TIPO: string) => ({ TIPO })

  it('todos iguales → ese tipo', () => {
    expect(tipoDeCarga([c('40HQ'), c('40HC')], 'FCL')).toBe('40HQ')
  })

  it('distintos → los muestra a los dos', () => {
    expect(tipoDeCarga([c('20GP'), c('40HQ')], '40HQ')).toBe('20GP + 40HQ')
  })

  it('no repite el mismo tipo aunque haya tres contenedores', () => {
    expect(tipoDeCarga([c('20GP'), c('20 gp'), c('40HQ')], '')).toBe('20GP + 40HQ')
  })

  it('contenedores sin tipo → cae a la columna de la carga, normalizada', () => {
    expect(tipoDeCarga([c(''), c('')], '40HC')).toBe('40HQ')
    expect(tipoDeCarga([], '20 gp')).toBe('20GP')
    expect(tipoDeCarga(undefined, '40HQ')).toBe('40HQ')
  })

  it('la columna con "FCL" (51 casos en la base) no es un tipo: vacío', () => {
    expect(tipoDeCarga([], 'FCL')).toBe('')
    expect(tipoDeCarga([c('')], 'FCL')).toBe('')
  })

  it('un contenedor con tipo le gana a la columna vieja', () => {
    expect(tipoDeCarga([c('20GP'), c('')], 'FCL')).toBe('20GP')
  })
})
