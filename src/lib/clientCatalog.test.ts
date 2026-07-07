import { describe, it, expect } from 'vitest'
import { normalizeClienteKey, canonicalizeCliente, deriveClientePattern, type CatalogClient } from './clientCatalog'

describe('normalizeClienteKey', () => {
  it('mayúsculas + trim + colapsa espacios', () => {
    expect(normalizeClienteKey('  Balsamo   Hnos  ')).toBe('BALSAMO HNOS')
    expect(normalizeClienteKey('TACOMA  ARGENTINA S.A.')).toBe('TACOMA ARGENTINA')
  })

  it('quita acentos', () => {
    expect(normalizeClienteKey('HIDRÁULICA SAN FRANCISCO')).toBe('HIDRAULICA SAN FRANCISCO')
    expect(normalizeClienteKey('FASS EVOLUCIÓN S.A.S.')).toBe('FASS EVOLUCION')
  })

  it('quita puntuación', () => {
    expect(normalizeClienteKey('D.O.M. DISTRIBUCIONES')).toBe('DOM DISTRIBUCIONES')
    expect(normalizeClienteKey('GROBEAR, S.A.S.')).toBe('GROBEAR')
  })

  it('quita sufijos legales al final en todas sus formas', () => {
    expect(normalizeClienteKey('BALSAMO S.A')).toBe('BALSAMO')
    expect(normalizeClienteKey('BALSAMO S.A.')).toBe('BALSAMO')
    expect(normalizeClienteKey('BALSAMO SA')).toBe('BALSAMO')
    expect(normalizeClienteKey('PELLACANI S.R.L.')).toBe('PELLACANI')
    expect(normalizeClienteKey('PELLACANI SRL')).toBe('PELLACANI')
    expect(normalizeClienteKey('ARO PLASTYC S.A.S')).toBe('ARO PLASTYC')
    expect(normalizeClienteKey('STAAL SAS')).toBe('STAAL')
    expect(normalizeClienteKey('COLSECOR COOP. LTDA.')).toBe('COLSECOR COOP')
    expect(normalizeClienteKey('VIDPIA SAICF')).toBe('VIDPIA')
    expect(normalizeClienteKey('INDUSTRIAL PLASTICAS BERNAL S.A.I.C')).toBe('INDUSTRIAL PLASTICAS BERNAL')
    // typo real de la planilla: "S.R,L." / "SR.L."
    expect(normalizeClienteKey('SOLDAR S.R,L.')).toBe('SOLDAR')
    expect(normalizeClienteKey('INDUSTRIAS JED SR.L.')).toBe('INDUSTRIAS JED')
  })

  it('quita sufijos encadenados', () => {
    expect(normalizeClienteKey('VENTURI HNOS S.A CIF')).toBe('VENTURI HNOS')
    expect(normalizeClienteKey('VENTURI HNOS. SA CIF')).toBe('VENTURI HNOS')
  })

  it('NO quita sufijos en el medio del nombre', () => {
    expect(normalizeClienteKey('TP SRL ADD RUFINO CUERVO')).toBe('TP SRL ADD RUFINO CUERVO')
  })

  it('unifica & con Y', () => {
    expect(normalizeClienteKey('DABAR & CIA S.R.L.')).toBe('DABAR Y CIA')
    expect(normalizeClienteKey('DABAR Y CIA SRL')).toBe('DABAR Y CIA')
  })

  it('si el nombre entero es un sufijo, no lo vacía', () => {
    expect(normalizeClienteKey('S.A.')).toBe('SA')
  })

  it('nombres cortos sobreviven al strip de sufijos', () => {
    expect(normalizeClienteKey('TP S.R.L.')).toBe('TP')
    expect(normalizeClienteKey('TP')).toBe('TP')
    expect(normalizeClienteKey('YEMEN SA')).toBe('YEMEN')
  })

  it('vacío y basura', () => {
    expect(normalizeClienteKey('')).toBe('')
    expect(normalizeClienteKey('   ')).toBe('')
  })
})

describe('canonicalizeCliente', () => {
  const catalog: CatalogClient[] = [
    { name: 'BALSAMO S.A', aliases: 'BALSAMO, BALSAMO SA' },
    { name: 'BICI PERETTI S.A.', aliases: null },
    { name: 'HARDCORE FITNESS S.R.L.', aliases: 'HARDORE FITNESS S.R.L, HARDOCE FITNESS S.R.L' },
  ]

  it('matchea por nombre canónico (variantes de sufijo/caso)', () => {
    expect(canonicalizeCliente('balsamo s.a.', catalog)).toBe('BALSAMO S.A')
    expect(canonicalizeCliente('BALSAMO SRL', catalog)).toBe('BALSAMO S.A') // sufijo distinto, misma clave
    expect(canonicalizeCliente('Bici Peretti SA', catalog)).toBe('BICI PERETTI S.A.')
  })

  it('matchea por alias (typos conocidos)', () => {
    expect(canonicalizeCliente('HARDORE FITNESS S.R.L', catalog)).toBe('HARDCORE FITNESS S.R.L.')
    expect(canonicalizeCliente('hardoce fitness srl', catalog)).toBe('HARDCORE FITNESS S.R.L.')
  })

  it('texto libre sin match queda igual (con trim)', () => {
    expect(canonicalizeCliente('  CLIENTE NUEVO XYZ ', catalog)).toBe('CLIENTE NUEVO XYZ')
    expect(canonicalizeCliente('PERETTI', catalog)).toBe('PERETTI') // clave distinta de BICI PERETTI
  })

  it('vacío queda vacío', () => {
    expect(canonicalizeCliente('', catalog)).toBe('')
    expect(canonicalizeCliente('   ', catalog)).toBe('')
  })
})

describe('deriveClientePattern', () => {
  it('nombre + aliases, mayúsculas, unidos por coma', () => {
    expect(deriveClientePattern('Balsamo S.A', 'BALSAMO, BALSAMO SA'))
      .toBe('BALSAMO S.A,BALSAMO,BALSAMO SA')
  })

  it('descarta tokens de menos de 4 caracteres', () => {
    expect(deriveClientePattern('TP', 'TP SRL')).toBe('TP SRL')
    expect(deriveClientePattern('AB', 'CD')).toBe('')
  })

  it('deduplica', () => {
    expect(deriveClientePattern('CHIAPERO', 'chiapero, CHIAPERO')).toBe('CHIAPERO')
  })

  it('sin aliases', () => {
    expect(deriveClientePattern('BICI PERETTI S.A.')).toBe('BICI PERETTI S.A.')
    expect(deriveClientePattern('BICI PERETTI S.A.', null)).toBe('BICI PERETTI S.A.')
  })

  it('las comas dentro del nombre no parten el token', () => {
    expect(deriveClientePattern('GROBEAR, S.A.S.')).toBe('GROBEAR S.A.S.')
  })
})
