import { describe, it, expect } from 'vitest'
import { normalizeCat, levenshtein, matchCanonico, upperCat, canonicalizarLista, DEV_ALIASES } from './fuzzyCatalog'

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

describe('alias APM = MPS (DEV_ALIASES)', () => {
  const DEVS = ['STL', 'MPS', 'TCP', 'MURCHISON']
  it('«apm» se corrige a MPS (aviso, exacto=false)', () => {
    expect(matchCanonico('apm', DEVS, DEV_ALIASES)).toEqual({ canon: 'MPS', exacto: false })
  })
  it('«mps» sigue siendo exacto', () => {
    expect(matchCanonico('mps', DEVS, DEV_ALIASES)).toEqual({ canon: 'MPS', exacto: true })
  })
  it('alias sin canónico en el catálogo → igual corrige', () => {
    expect(matchCanonico('APM', ['STL'], DEV_ALIASES)).toEqual({ canon: 'MPS', exacto: false })
  })
})

describe('canonicalizarLista + acentos conservados', () => {
  it('unifica alias, dedup y ordena', () => {
    expect(canonicalizarLista(['APM', 'mps', 'STL', '', null, 'stl'], DEV_ALIASES)).toEqual(['MPS', 'STL'])
  })
  it('el canónico conserva sus acentos', () => {
    expect(matchCanonico('cordoba', ['CÓRDOBA', 'RAFAELA'])).toEqual({ canon: 'CÓRDOBA', exacto: true })
    expect(upperCat('  córdoba  nueva ')).toBe('CÓRDOBA NUEVA')
  })
})
