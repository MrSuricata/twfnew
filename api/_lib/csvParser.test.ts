import { describe, it, expect } from 'vitest'
import { matchesClientePattern } from './csvParser.js'

describe('matchesClientePattern (hardened)', () => {
  it('matches exact word', () => {
    expect(matchesClientePattern('CHIAPERO', 'CHIAPERO')).toBe(true)
  })
  it('matches with surrounding spaces/punctuation', () => {
    expect(matchesClientePattern('ACME CHIAPERO SRL', 'CHIAPERO')).toBe(true)
    expect(matchesClientePattern('CHIAPERO,VENTAS', 'CHIAPERO')).toBe(true)
  })
  it('rejects patterns shorter than 5 chars (drops them silently)', () => {
    expect(matchesClientePattern('ACME SA', 'SA')).toBe(false)
  })
  it('does NOT match substring mid-word', () => {
    expect(matchesClientePattern('SANTOS MARIA', 'SANTO')).toBe(false)
    expect(matchesClientePattern('SANTOS MARIA', 'SANTOS')).toBe(true)
  })
  it('case-insensitive', () => {
    expect(matchesClientePattern('chiapero srl', 'CHIAPERO')).toBe(true)
  })
  it('supports comma-separated patterns, each ≥5 chars', () => {
    expect(matchesClientePattern('MARTINEZ S.A.', 'CHIAPERO,MARTINEZ')).toBe(true)
    expect(matchesClientePattern('PEREZ S.A.', 'CHIAPERO,MARTINEZ')).toBe(false)
  })
  it('returns false for empty inputs', () => {
    expect(matchesClientePattern('', 'CHIAPERO')).toBe(false)
    expect(matchesClientePattern('ACME', '')).toBe(false)
  })
  it('escapes regex metacharacters in the pattern', () => {
    expect(matchesClientePattern('COMPANY', 'CO.PANY')).toBe(false) // literal dot
  })
  it('drops short patterns but keeps long ones from a comma list', () => {
    expect(matchesClientePattern('CHIAPERO HNOS', 'SA,CHIAPERO')).toBe(true)
    expect(matchesClientePattern('SANTOS MARIA', 'SA,PEREZ')).toBe(false)
  })
})
