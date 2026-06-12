import { describe, it, expect } from 'vitest'
import { parseCntr, serializeCntr, normalizeCntr, isStandardCntr } from './cntrUtils'

describe('parseCntr', () => {
  it('separa por coma, trimea y filtra vacíos', () => {
    expect(parseCntr('CSNU7743374, FFAU3573668')).toEqual(['CSNU7743374', 'FFAU3573668'])
    expect(parseCntr(' TGBU3023284 ')).toEqual(['TGBU3023284'])
    expect(parseCntr('A, , B,')).toEqual(['A', 'B'])
    expect(parseCntr('')).toEqual([])
    expect(parseCntr(undefined as unknown as string)).toEqual([])
  })
})

describe('serializeCntr', () => {
  it('une con coma+espacio (round-trip estable)', () => {
    expect(serializeCntr(['CSNU7743374', 'FFAU3573668'])).toBe('CSNU7743374, FFAU3573668')
    expect(serializeCntr([])).toBe('')
    expect(parseCntr(serializeCntr(['A', 'B']))).toEqual(['A', 'B'])
  })
})

describe('normalizeCntr', () => {
  it('mayúsculas y sin espacios internos; vacío → null', () => {
    expect(normalizeCntr(' csnu 7743374 ')).toBe('CSNU7743374')
    expect(normalizeCntr('   ')).toBe(null)
  })
})

describe('isStandardCntr', () => {
  it('4 letras + 7 dígitos = estándar; otros formatos se toleran pero avisan', () => {
    expect(isStandardCntr('CSNU7743374')).toBe(true)
    expect(isStandardCntr('TGBU302328')).toBe(false)
    expect(isStandardCntr('PENDIENTE')).toBe(false)
  })
})
