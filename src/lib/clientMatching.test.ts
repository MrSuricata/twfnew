import { describe, it, expect } from 'vitest'
import { matchesPattern, findClientByEmail } from './clientMatching'
import type { ClientAccount } from './quotationTypes'

const cliente = (over: Partial<ClientAccount>): ClientAccount => ({
  id: 'id-' + (over.name || 'x'),
  email: '',
  name: 'X',
  company: '',
  createdAt: 0,
  clientePattern: '',
  ...over,
})

describe('findClientByEmail — bug "Bienvenido CENA HNOS" (28/08)', () => {
  const catalogo = [
    cliente({ name: 'CENA HNOS SRL', email: '' }),          // primero sin email
    cliente({ name: 'INELPA', email: '' }),
    cliente({ name: 'CHIAPERO Y ASOC. S.R.L.', email: 'chiapero@x.com' }),
  ]

  it('email vacío (impersonate de cliente sin email) NO matchea a nadie', () => {
    // Antes: find(c => c.email === '') devolvía el primer cliente sin email
    // del catálogo (CENA HNOS) para CUALQUIER impersonación.
    expect(findClientByEmail(catalogo, '')).toBeUndefined()
    expect(findClientByEmail(catalogo, undefined)).toBeUndefined()
    expect(findClientByEmail(catalogo, '   ')).toBeUndefined()
  })

  it('email real matchea al cliente correcto, sin importar mayúsculas/espacios', () => {
    expect(findClientByEmail(catalogo, 'chiapero@x.com')?.name).toBe('CHIAPERO Y ASOC. S.R.L.')
    expect(findClientByEmail(catalogo, ' CHIAPERO@X.COM ')?.name).toBe('CHIAPERO Y ASOC. S.R.L.')
  })

  it('email sin match → undefined (el saludo cae al nombre del token)', () => {
    expect(findClientByEmail(catalogo, 'otro@x.com')).toBeUndefined()
  })
})

describe('matchesPattern (sin cambios — sanidad)', () => {
  it('word boundary y case-insensitive', () => {
    expect(matchesPattern('CHIAPERO Y ASOC. S.R.L.', 'chiapero')).toBe(true)
    expect(matchesPattern('PERETTIANI', 'PERETTI')).toBe(false)
  })
})

describe('patrón EXACTO con "=" (Brian 02/09: VMG vs EQUIPO ORIGINAL VMG)', () => {
  const VMG = '=VMG SA, =VMG SOCIEDAD ANONIMA'
  it('matchea el nombre completo, ignorando puntos y espacios de más', () => {
    expect(matchesPattern('VMG SA', VMG)).toBe(true)
    expect(matchesPattern('VMG S.A.', VMG)).toBe(true)
    expect(matchesPattern('vmg sa', VMG)).toBe(true)
    expect(matchesPattern('VMG SOCIEDAD ANONIMA', VMG)).toBe(true)
  })
  it('NO matchea cuando el nombre es parte de otro cliente', () => {
    expect(matchesPattern('EQUIPO ORIGINAL VMG SA', VMG)).toBe(false)
    expect(matchesPattern('VMG SA Y ASOCIADOS', VMG)).toBe(false)
  })
  it('sin "=" sigue siendo "contiene" (el resto del catálogo no cambia)', () => {
    expect(matchesPattern('EQUIPO ORIGINAL VMG SA', 'VMG SA')).toBe(true)
    expect(matchesPattern('BICI PERETTI S.A.', 'PERETTI')).toBe(true)
  })
  it('se pueden mezclar exactos y contiene en el mismo patrón', () => {
    expect(matchesPattern('CHIAPERO Y ASOCIADOS SRL', '=CHIAPERO Y ASOC SRL, =CHIAPERO Y ASOCIADOS SRL')).toBe(true)
    expect(matchesPattern('CHIAPERO Y ASOC. S.R.L.', '=CHIAPERO Y ASOC SRL, =CHIAPERO Y ASOCIADOS SRL')).toBe(true)
    expect(matchesPattern('CHIAPERO HERMANOS', '=CHIAPERO Y ASOC SRL, =CHIAPERO Y ASOCIADOS SRL')).toBe(false)
  })
})
