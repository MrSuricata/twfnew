import { describe, it, expect } from 'vitest'
import {
  CHECKS_ACTA, CHECK_KEYS,
  contenedoresDeCarga, checksMarcados, hayNovedades, resumenActa,
  actasDe, ultimaActa, actaVacia, tieneContenido, estaAnulada,
  type ActaDeposito,
} from './actasDeposito'

const acta = (a: Partial<ActaDeposito> = {}): ActaDeposito => ({
  id: 'x', ref: 'A8025', contenedor: 'EMCU1818703', fecha: '2026-08-18',
  checks: {}, comentario: '', usuario: 'brian@twf.uy',
  created_at: '2026-08-18T19:00:00Z', ...a,
})

describe('CHECKS_ACTA', () => {
  it('son los cuatro que pidió Brian, en orden', () => {
    expect(CHECKS_ACTA.map(c => c.key)).toEqual([
      'diferencia_bultos', 'embalaje_deteriorado', 'bultos_humedad', 'mercaderia_a_la_vista',
    ])
  })

  it('todos tienen etiqueta en castellano', () => {
    for (const c of CHECKS_ACTA) expect(c.label.length).toBeGreaterThan(3)
  })

  it('CHECK_KEYS coincide con el catálogo', () => {
    expect(CHECK_KEYS).toEqual(CHECKS_ACTA.map(c => c.key))
  })
})

describe('contenedoresDeCarga', () => {
  it('parte la lista de la planilla', () => {
    expect(contenedoresDeCarga('EGSU0310260, EMCU1818703'))
      .toEqual(['EGSU0310260', 'EMCU1818703'])
  })

  it('una carga con un solo contenedor devuelve uno', () => {
    expect(contenedoresDeCarga('MRKU1234567')).toEqual(['MRKU1234567'])
  })

  it('sin contenedor devuelve [\'\'] — igual hay que poder sacar fotos', () => {
    // El acta y las fotos de una carga sin contenedor cargado cuelgan de '',
    // que es "toda la carga". Devolver [] dejaría la carga sin ninguna fila
    // y sin forma de documentarla.
    expect(contenedoresDeCarga('')).toEqual([''])
    expect(contenedoresDeCarga('   ')).toEqual([''])
    expect(contenedoresDeCarga(null)).toEqual([''])
  })

  it('limpia espacios y no deja vacíos intermedios', () => {
    expect(contenedoresDeCarga('  ABC1234567 ,, DEF7654321  '))
      .toEqual(['ABC1234567', 'DEF7654321'])
  })
})

describe('checksMarcados / hayNovedades', () => {
  it('lista solo los marcados, en el orden del catálogo', () => {
    const a = acta({ checks: { mercaderia_a_la_vista: true, diferencia_bultos: true } })
    expect(checksMarcados(a).map(c => c.key)).toEqual(['diferencia_bultos', 'mercaderia_a_la_vista'])
  })

  it('ignora los que están en false', () => {
    expect(checksMarcados(acta({ checks: { diferencia_bultos: false } }))).toEqual([])
  })

  it('ignora claves desconocidas guardadas de antes', () => {
    const a = acta({ checks: { inventado: true, bultos_humedad: true } as Record<string, boolean> })
    expect(checksMarcados(a).map(c => c.key)).toEqual(['bultos_humedad'])
  })

  it('hayNovedades es true solo si hay algún check marcado', () => {
    expect(hayNovedades(acta())).toBe(false)
    expect(hayNovedades(acta({ comentario: 'todo bien' }))).toBe(false)
    expect(hayNovedades(acta({ checks: { bultos_humedad: true } }))).toBe(true)
  })
})

describe('resumenActa', () => {
  it('sin checks y sin comentario dice que salió sin novedad', () => {
    expect(resumenActa(acta())).toBe('Sin novedades')
  })

  it('sin checks pero con comentario, manda el comentario', () => {
    expect(resumenActa(acta({ comentario: 'se hizo con autoelevador' })))
      .toBe('se hizo con autoelevador')
  })

  it('con checks los lista', () => {
    const a = acta({ checks: { diferencia_bultos: true, bultos_humedad: true } })
    expect(resumenActa(a)).toBe('Diferencia de bultos · Bultos con humedad')
  })

  it('con checks y comentario, los checks primero', () => {
    const a = acta({ checks: { bultos_humedad: true }, comentario: '4 bultos rotos' })
    expect(resumenActa(a)).toBe('Bultos con humedad — 4 bultos rotos')
  })
})

describe('actasDe / ultimaActa', () => {
  const todas = [
    acta({ id: '1', contenedor: 'EMCU1818703', created_at: '2026-08-18T10:00:00Z' }),
    acta({ id: '2', contenedor: 'EGSU0310260', created_at: '2026-08-18T11:00:00Z' }),
    acta({ id: '3', contenedor: 'EMCU1818703', created_at: '2026-08-19T09:00:00Z' }),
    acta({ id: '4', ref: 'A7938', contenedor: 'EMCU1818703', created_at: '2026-08-20T09:00:00Z' }),
  ]

  it('filtra por ref y contenedor', () => {
    expect(actasDe(todas, 'A8025', 'EMCU1818703').map(a => a.id)).toEqual(['3', '1'])
  })

  it('devuelve de la más nueva a la más vieja', () => {
    const l = actasDe(todas, 'A8025', 'EMCU1818703')
    expect(l[0].id).toBe('3')
  })

  it('la ref se compara sin importar mayúsculas ni espacios', () => {
    expect(actasDe(todas, ' a8025 ', 'EMCU1818703')).toHaveLength(2)
  })

  it('el contenedor también', () => {
    expect(actasDe(todas, 'A8025', ' emcu1818703 ')).toHaveLength(2)
  })

  it('sin coincidencias devuelve vacío', () => {
    expect(actasDe(todas, 'A8025', 'NOEXISTE')).toEqual([])
  })

  it('ultimaActa devuelve la más reciente, o null', () => {
    expect(ultimaActa(todas, 'A8025', 'EMCU1818703')?.id).toBe('3')
    expect(ultimaActa(todas, 'A8025', 'NOEXISTE')).toBeNull()
  })
})

describe('actaVacia / tieneContenido', () => {
  it('el borrador arranca con todo en false y sin comentario', () => {
    const v = actaVacia()
    expect(v.comentario).toBe('')
    for (const k of CHECK_KEYS) expect(v.checks[k]).toBe(false)
  })

  it('un acta sin nada NO se guarda', () => {
    // Guardar actas vacías llenaría el historial de ruido sin información.
    expect(tieneContenido(actaVacia())).toBe(false)
  })

  it('alcanza con un check o con un comentario', () => {
    expect(tieneContenido({ ...actaVacia(), comentario: 'ok' })).toBe(true)
    expect(tieneContenido({ ...actaVacia(), checks: { ...actaVacia().checks, bultos_humedad: true } })).toBe(true)
  })

  it('un comentario de solo espacios no cuenta', () => {
    expect(tieneContenido({ ...actaVacia(), comentario: '   ' })).toBe(false)
  })
})

describe('anulación', () => {
  const anulada = (a: Partial<ActaDeposito> = {}): ActaDeposito =>
    acta({ anulada_at: '2026-08-19T10:00:00Z', anulada_por: 'brian@twf.uy', ...a })

  it('un acta anulada no aparece en el historial del contenedor', () => {
    const todas = [
      acta({ id: 'viva' }),
      anulada({ id: 'muerta' }),
    ]
    expect(actasDe(todas, 'A8025', 'EMCU1818703').map(a => a.id)).toEqual(['viva'])
  })

  it('ultimaActa ignora las anuladas', () => {
    // La anulada es MÁS NUEVA: si no se filtrara, sería la que se muestra.
    const todas = [
      acta({ id: 'viva', created_at: '2026-08-18T10:00:00Z' }),
      anulada({ id: 'muerta', created_at: '2026-08-19T10:00:00Z' }),
    ]
    expect(ultimaActa(todas, 'A8025', 'EMCU1818703')?.id).toBe('viva')
  })

  it('si están todas anuladas no hay última', () => {
    expect(ultimaActa([anulada()], 'A8025', 'EMCU1818703')).toBeNull()
  })

  it('estaAnulada distingue por la fecha, no por el autor', () => {
    expect(estaAnulada(acta())).toBe(false)
    expect(estaAnulada(anulada())).toBe(true)
    // Sin fecha no está anulada aunque tenga autor (fila a medio escribir).
    expect(estaAnulada(acta({ anulada_por: 'alguien' }))).toBe(false)
  })
})
