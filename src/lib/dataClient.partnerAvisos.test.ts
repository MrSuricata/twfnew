import { describe, it, expect, vi, beforeEach } from 'vitest'

const authFetch = vi.fn()
vi.mock('./authClient', () => ({ authFetch: (...args: unknown[]) => authFetch(...args) }))

import { fetchPartnerAvisos } from './dataClient'

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
