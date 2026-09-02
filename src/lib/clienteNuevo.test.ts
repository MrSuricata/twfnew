import { describe, it, expect } from 'vitest'
import type { ClientAccount } from './quotationTypes'
import { idDeCliente, clienteExistente } from './clienteNuevo'

const cli = (id: string, name: string, aliases = ''): ClientAccount => ({
  id, name, email: '', company: name, createdAt: 0, aliases,
} as unknown as ClientAccount)

describe('idDeCliente', () => {
  it('arma un id legible a partir del nombre', () => {
    expect(idDeCliente('BICI PERETTI S.A.')).toBe('cl-bici-peretti')
    expect(idDeCliente('Chiapero y Asoc. S.R.L.')).toBe('cl-chiapero-y-asoc')
    expect(idDeCliente('  ')).toBe('cl-cliente')
  })
  it('no repite un id que ya existe', () => {
    const existentes = [{ id: 'cl-vmg' }, { id: 'cl-vmg-2' }]
    expect(idDeCliente('VMG S.A.', existentes)).toBe('cl-vmg-3')
  })
})

describe('clienteExistente — no duplicar el mismo cliente escrito distinto', () => {
  const catalogo = [
    cli('cl-vmg', 'VMG S.A.', 'VMG SOCIEDAD ANONIMA'),
    cli('cl-peretti', 'BICI PERETTI S.A.'),
  ]
  it('encuentra por nombre aunque cambien puntos y sufijo legal', () => {
    expect(clienteExistente('VMG SA', catalogo)?.id).toBe('cl-vmg')
    expect(clienteExistente('vmg s.a.', catalogo)?.id).toBe('cl-vmg')
  })
  it('encuentra por alias', () => {
    expect(clienteExistente('VMG SOCIEDAD ANONIMA', catalogo)?.id).toBe('cl-vmg')
  })
  it('no confunde con otro cliente que lo contiene', () => {
    expect(clienteExistente('EQUIPO ORIGINAL VMG SA', catalogo)).toBeUndefined()
  })
  it('sin nombre no devuelve nada', () => {
    expect(clienteExistente('', catalogo)).toBeUndefined()
    expect(clienteExistente('NUEVO IMPORTADOR SRL', catalogo)).toBeUndefined()
  })
})
