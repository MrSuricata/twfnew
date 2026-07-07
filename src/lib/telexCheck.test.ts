import { describe, it, expect } from 'vitest'
import { hasTelex, isSinTelex, needsTelexAlert } from './telexCheck'

describe('hasTelex / isSinTelex', () => {
  it('SI (con espacios o minúsculas) cuenta como liberado', () => {
    expect(hasTelex('SI')).toBe(true)
    expect(hasTelex(' si ')).toBe(true)
    expect(hasTelex('Si')).toBe(true)
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
