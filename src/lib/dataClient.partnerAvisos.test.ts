import { describe, it, expect, vi, beforeEach } from 'vitest'

const authFetch = vi.fn()
vi.mock('./authClient', () => ({ authFetch: (...args: unknown[]) => authFetch(...args) }))

import { fetchPartnerAvisos, cancelarPartnerAviso } from './dataClient'

function respuesta(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

describe('fetchPartnerAvisos', () => {
  beforeEach(() => authFetch.mockReset())

  it('devuelve los avisos del server', async () => {
    authFetch.mockResolvedValue(respuesta(200, { avisos: [{ id: 'a1' }] }))
    await expect(fetchPartnerAvisos()).resolves.toEqual([{ id: 'a1' }])
    expect(authFetch).toHaveBeenCalledWith('/api/data/partner-avisos')
  })

  it('404 (entidad partner-avisos todavía no deployada) = sin avisos, sin error', async () => {
    authFetch.mockResolvedValue(respuesta(404, { error: 'Unknown entity: partner-avisos' }))
    await expect(fetchPartnerAvisos()).resolves.toEqual([])
  })

  it('otros errores HTTP sí se propagan', async () => {
    authFetch.mockResolvedValue(respuesta(500))
    await expect(fetchPartnerAvisos()).rejects.toThrow('HTTP 500')
  })
})

describe('cancelarPartnerAviso (deshacer del partner, Brian 03/09)', () => {
  beforeEach(() => authFetch.mockReset())

  it('manda DELETE con el id y devuelve el aviso ya cancelado', async () => {
    authFetch.mockResolvedValue(respuesta(200, { aviso: { id: 'a1', estado: 'cancelado' } }))
    await expect(cancelarPartnerAviso('a1')).resolves.toEqual({ id: 'a1', estado: 'cancelado' })
    expect(authFetch).toHaveBeenCalledWith('/api/data/partner-avisos?id=a1', { method: 'DELETE' })
  })

  it('el 409 del server ("el equipo ya lo confirmó") llega con SU mensaje, no uno genérico', async () => {
    authFetch.mockResolvedValue(respuesta(409, { error: 'El equipo ya confirmó este aviso y la carga quedó actualizada.' }))
    await expect(cancelarPartnerAviso('a1')).rejects.toThrow('El equipo ya confirmó este aviso y la carga quedó actualizada.')
  })

  it('sin mensaje del server, queda el HTTP', async () => {
    authFetch.mockResolvedValue(respuesta(500))
    await expect(cancelarPartnerAviso('a1')).rejects.toThrow('HTTP 500')
  })
})
