import { describe, it, expect, vi } from 'vitest'
import type { ClientAccount } from './quotationTypes'
import { idDeCliente, clienteExistente, crearClienteEnCatalogo } from './clienteNuevo'

const guardado = vi.fn(async (_rows: unknown[]) => {})
vi.mock('./dataClient', () => ({
  fetchClients: vi.fn(async () => [
    { id: 'cl-vmg', name: 'VMG S.A.', email: '', company: 'VMG S.A.', createdAt: 0, clientePattern: '=VMG SA', digestActive: true, digestEmails: 'a@b.co' },
  ]),
  saveClients: (rows: unknown[]) => guardado(rows as never),
}))

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

describe('crearClienteEnCatalogo — el alta desde una carga', () => {
  it('manda el cliente nuevo con TODOS los campos que el lote ya trae (digest incluido)', async () => {
    // 02/09/2026: Cata creaba "RUEDAS DEL CERRO" y el server daba 500. La fila
    // nueva viajaba sin digest_active/digest_emails junto a filas que sí los
    // traen; PostgREST le metía NULL y las columnas son NOT NULL.
    const r = await crearClienteEnCatalogo('RUEDAS DEL CERRO')
    expect(r.creado).toBe(true)
    expect(r.cliente).toMatchObject({
      id: 'cl-ruedas-del-cerro', name: 'RUEDAS DEL CERRO', clientePattern: 'RUEDAS DEL CERRO',
      digestActive: false, digestEmails: '',
    })
    const lote = (guardado.mock.calls[0] as unknown as [Array<Record<string, unknown>>])[0]
    expect(lote).toHaveLength(2)
    for (const fila of lote) {
      expect(fila).toHaveProperty('digestActive')
      expect(fila).toHaveProperty('digestEmails')
    }
  })
  it('si ya está en el catálogo no guarda nada y devuelve el existente', async () => {
    guardado.mockClear()
    const r = await crearClienteEnCatalogo('VMG SA')
    expect(r.creado).toBe(false)
    expect(r.cliente.id).toBe('cl-vmg')
    expect(guardado).not.toHaveBeenCalled()
  })
})
