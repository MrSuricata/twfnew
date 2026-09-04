/**
 * Los tres fetchers de la caja de comentarios.
 *
 * Lo que fijan: que el POST mande SOLO texto + contexto (la identidad la relee
 * el server de `partner_users`; si algún día alguien la agrega acá, un partner
 * podría firmar un comentario con el nombre de otro), que un 404 no rompa nada
 * mientras la API no esté deployada, y que el mensaje del server llegue tal
 * cual — el 429 del rate limit explica por qué no se pudo mandar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const authFetch = vi.fn()
vi.mock('./authClient', () => ({ authFetch: (...args: unknown[]) => authFetch(...args) }))

import { fetchPartnerFeedback, enviarPartnerFeedback, responderPartnerFeedback } from './dataClient'

function respuesta(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

describe('fetchPartnerFeedback', () => {
  beforeEach(() => authFetch.mockReset())

  it('devuelve los comentarios del server', async () => {
    authFetch.mockResolvedValue(respuesta(200, { comentarios: [{ id: 'c1' }] }))
    await expect(fetchPartnerFeedback()).resolves.toEqual([{ id: 'c1' }])
    expect(authFetch).toHaveBeenCalledWith('/api/data/partner-feedback')
  })

  it('404 (entidad todavía no deployada) = sin comentarios, sin error', async () => {
    authFetch.mockResolvedValue(respuesta(404, { error: 'Unknown entity: partner-feedback' }))
    await expect(fetchPartnerFeedback()).resolves.toEqual([])
  })

  it('otros errores HTTP sí se propagan', async () => {
    authFetch.mockResolvedValue(respuesta(500))
    await expect(fetchPartnerFeedback()).rejects.toThrow('HTTP 500')
  })
})

describe('enviarPartnerFeedback', () => {
  beforeEach(() => authFetch.mockReset())

  it('manda SOLO texto y contexto: la identidad la pone el server', async () => {
    authFetch.mockResolvedValue(respuesta(200, { comentario: { id: 'c1', estado: 'nuevo' } }))
    await enviarPartnerFeedback({ texto: 'no me dejó marcar el retiro', contexto: { pantalla: 'HOY del depósito' } })
    const [url, init] = authFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/data/partner-feedback')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      texto: 'no me dejó marcar el retiro',
      contexto: { pantalla: 'HOY del depósito' },
    })
  })

  it('el 429 del rate limit llega con SU mensaje', async () => {
    authFetch.mockResolvedValue(respuesta(429, { error: 'Ya nos mandaste varios comentarios seguidos: los estamos leyendo.' }))
    await expect(enviarPartnerFeedback({ texto: 'x' })).rejects.toThrow('Ya nos mandaste varios comentarios seguidos')
  })
})

describe('responderPartnerFeedback', () => {
  beforeEach(() => authFetch.mockReset())

  it('responder manda la respuesta, y el id va en la query', async () => {
    authFetch.mockResolvedValue(respuesta(200, { comentario: { id: 'c1', estado: 'respondido' } }))
    await responderPartnerFeedback('c1', 'responder', 'ya está arreglado')
    const [url, init] = authFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/data/partner-feedback?id=c1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({ accion: 'responder', respuesta: 'ya está arreglado' })
  })

  it('marcar visto no manda respuesta', async () => {
    authFetch.mockResolvedValue(respuesta(200, { comentario: { id: 'c1', estado: 'leido' } }))
    await responderPartnerFeedback('c1', 'visto')
    const [, init] = authFetch.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ accion: 'visto' })
  })

  it('el error del server llega tal cual', async () => {
    authFetch.mockResolvedValue(respuesta(400, { error: 'Escribí la respuesta: el partner la va a ver.' }))
    await expect(responderPartnerFeedback('c1', 'responder', ' ')).rejects.toThrow('Escribí la respuesta')
  })
})
