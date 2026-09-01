import { describe, it, expect } from 'vitest'
import { hasTelex, isSinTelex, needsTelexAlert, mensajeConfirmarSinTelex } from './telexCheck'

describe('hasTelex / isSinTelex', () => {
  it('SI (con espacios o minúsculas) cuenta como liberado', () => {
    expect(hasTelex('SI')).toBe(true)
    expect(hasTelex(' si ')).toBe(true)
    expect(hasTelex('Si')).toBe(true)
  })

  it("legacy 'TRUE' (checkbox de la planilla vieja) también cuenta como liberado", () => {
    expect(hasTelex('TRUE')).toBe(true)
    expect(hasTelex('true')).toBe(true)
    expect(hasTelex('FALSE')).toBe(false)
  })

  it('vacío, null, undefined o cualquier otro valor = falta telex', () => {
    expect(hasTelex('')).toBe(false)
    expect(hasTelex(null)).toBe(false)
    expect(hasTelex(undefined)).toBe(false)
    expect(hasTelex('NO')).toBe(false)
    expect(hasTelex('pendiente')).toBe(false)
    expect(isSinTelex('')).toBe(true)
    expect(isSinTelex('SI')).toBe(false)
  })
})

describe('needsTelexAlert', () => {
  it('alerta cuando falta telex Y hay fecha comprometida', () => {
    expect(needsTelexAlert({ tlx: '', fecha: '2026-07-10' })).toBe(true)
    expect(needsTelexAlert({ tlx: null, fecha: 'COORDINADO' })).toBe(true)
  })

  it('NO alerta si el telex está liberado', () => {
    expect(needsTelexAlert({ tlx: 'SI', fecha: '2026-07-10' })).toBe(false)
  })

  it('NO alerta sin fecha (esperar telex en puerto es lo normal)', () => {
    expect(needsTelexAlert({ tlx: '', fecha: '' })).toBe(false)
    expect(needsTelexAlert({ tlx: '', fecha: '   ' })).toBe(false)
    expect(needsTelexAlert({ tlx: '', fecha: null })).toBe(false)
  })
})

describe('mensajeConfirmarSinTelex — el popup al agendar', () => {
  it('dice la ref y pregunta si se agenda igual', () => {
    const m = mensajeConfirmarSinTelex({ ref: 'A7996', fecha: '2026-09-03' })
    expect(m).toContain('A7996')
    expect(m).toContain('03/09/2026')
    expect(m).toContain('¿Agendar igual?')
  })

  it('incluye el contenedor cuando se sabe cuál es', () => {
    expect(mensajeConfirmarSinTelex({ ref: 'A7996', cntr: 'MSKU1234567', fecha: '2026-09-03' }))
      .toContain('MSKU1234567')
  })

  it('sin contenedor no deja la línea vacía', () => {
    expect(mensajeConfirmarSinTelex({ ref: 'A7996', fecha: '2026-09-03' }))
      .not.toContain('Contenedor:')
  })

  it('explica la consecuencia, no solo que falta el dato', () => {
    expect(mensajeConfirmarSinTelex({ ref: 'A7996', fecha: '2026-09-03' }))
      .toContain('no se puede retirar')
  })

  it('una fecha que no es ISO se muestra tal cual, sin romper', () => {
    expect(mensajeConfirmarSinTelex({ ref: 'A7996', fecha: 'a confirmar' }))
      .toContain('a confirmar')
  })
})
