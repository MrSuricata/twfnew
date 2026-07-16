import { describe, it, expect } from 'vitest'
import { normalizeCat, levenshtein, matchCanonico } from './fuzzyCatalog'

const PUERTOS = ['SAN ANTONIO', 'MONTEVIDEO', 'VALPARAISO', 'BUENOS AIRES', 'SHANGHAI', 'NINGBO']

describe('normalizeCat', () => {
  it('mayúsculas, sin acentos, espacios colapsados', () => {
    expect(normalizeCat('  valparaíso ')).toBe('VALPARAISO')
    expect(normalizeCat('san  antonio')).toBe('SAN ANTONIO')
  })
})

describe('levenshtein', () => {
  it('distancias básicas', () => {
    expect(levenshtein('SAN', 'SAN')).toBe(0)
    expect(levenshtein('SNA', 'SAN')).toBe(2)
    expect(levenshtein('MONTEVIDO', 'MONTEVIDEO')).toBe(1)
  })
})

describe('matchCanonico', () => {
  it('«sna antonio» → SAN ANTONIO (typo detectado)', () => {
    expect(matchCanonico('sna antonio', PUERTOS)).toEqual({ canon: 'SAN ANTONIO', exacto: false })
  })
  it('«montevido» → MONTEVIDEO · «ningbo » exacto normalizado', () => {
    expect(matchCanonico('montevido', PUERTOS)).toEqual({ canon: 'MONTEVIDEO', exacto: false })
    expect(matchCanonico('ningbo ', PUERTOS)).toEqual({ canon: 'NINGBO', exacto: true })
  })
  it('acentos no ensucian el match', () => {
    expect(matchCanonico('Valparaíso', PUERTOS)).toEqual({ canon: 'VALPARAISO', exacto: true })
  })
  it('un puerto genuinamente nuevo → null (se agrega al catálogo)', () => {
    expect(matchCanonico('QINGDAO', PUERTOS)).toBeNull()
    expect(matchCanonico('', PUERTOS)).toBeNull()
  })
  it('valores cortos toleran solo 1 error (no confundir códigos)', () => {
    expect(matchCanonico('FOB', ['FCA', 'FOB', 'CIF'])).toEqual({ canon: 'FOB', exacto: true })
    expect(matchCanonico('FOX', ['FCA', 'FOB', 'CIF'])).toEqual({ canon: 'FOB', exacto: false })
    expect(matchCanonico('DAP', ['FOB', 'CIF'])).toBeNull()
  })
})
