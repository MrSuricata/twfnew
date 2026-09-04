import { describe, it, expect } from 'vitest'
import { parseCardsCerradas, cardAbierta, conCardAbierta, alternarCard, aplicarToques } from './cardsPlegadas'

const IDS = ['retiros-terminal', 'sin-liberar', 'libre-critico'] as const

describe('parseCardsCerradas — lo guardado puede ser cualquier cosa', () => {
  it('sin prefs (undefined/null) → todo abierto', () => {
    expect(parseCardsCerradas(undefined, IDS)).toEqual([])
    expect(parseCardsCerradas(null, IDS)).toEqual([])
  })

  it('basura que no es array → []', () => {
    for (const raw of ['retiros-terminal', 42, true, { 'retiros-terminal': true }, () => 1]) {
      expect(parseCardsCerradas(raw, IDS)).toEqual([])
    }
  })

  it('descarta lo que no es string, los ids desconocidos y los repetidos; conserva el orden', () => {
    const raw = ['sin-liberar', 7, null, 'card-vieja', 'retiros-terminal', 'sin-liberar', { id: 'libre-critico' }]
    expect(parseCardsCerradas(raw, IDS)).toEqual(['sin-liberar', 'retiros-terminal'])
  })

  it('con ids válidos devuelve exactamente esos', () => {
    expect(parseCardsCerradas(['libre-critico'], IDS)).toEqual(['libre-critico'])
  })
})

describe('cardAbierta / conCardAbierta / alternarCard', () => {
  it('default: abierta si no está en la lista de cerradas', () => {
    expect(cardAbierta([], 'retiros-terminal')).toBe(true)
    expect(cardAbierta(['retiros-terminal'], 'retiros-terminal')).toBe(false)
  })

  it('cerrar agrega, abrir saca', () => {
    const cerradas = conCardAbierta([], 'retiros-terminal', false)
    expect(cerradas).toEqual(['retiros-terminal'])
    expect(conCardAbierta(cerradas, 'retiros-terminal', true)).toEqual([])
  })

  it('pedir el estado que ya tiene devuelve LA MISMA referencia (no re-render, no guardar)', () => {
    const base = ['sin-liberar']
    expect(conCardAbierta(base, 'sin-liberar', false)).toBe(base)
    expect(conCardAbierta(base, 'retiros-terminal', true)).toBe(base)
  })

  it('alternar dos veces vuelve al estado inicial y no muta la entrada', () => {
    const base = ['sin-liberar']
    const una = alternarCard(base, 'retiros-terminal')
    expect(una).toEqual(['sin-liberar', 'retiros-terminal'])
    expect(alternarCard(una, 'retiros-terminal')).toEqual(['sin-liberar'])
    expect(base).toEqual(['sin-liberar'])
  })
})

describe('aplicarToques — el server es la base, lo tocado localmente manda', () => {
  it('cierra y abre encima de lo que llegó', () => {
    const server = ['sin-liberar', 'libre-critico']
    const out = aplicarToques(server, [['retiros-terminal', false], ['libre-critico', true]])
    expect(out).toEqual(['sin-liberar', 'retiros-terminal'])
  })

  it('sin toques devuelve la misma lista', () => {
    const server = ['sin-liberar']
    expect(aplicarToques(server, [])).toBe(server)
  })

  it('el último toque sobre la misma card gana', () => {
    expect(aplicarToques([], [['sin-liberar', false], ['sin-liberar', true]])).toEqual([])
    expect(aplicarToques([], [['sin-liberar', true], ['sin-liberar', false]])).toEqual(['sin-liberar'])
  })
})
