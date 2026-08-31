import { describe, it, expect } from 'vitest'
import { resolveRealtimeConfig, isTrucksLiveMessage, isOwnTrucksLiveMessage, TRUCKS_LIVE_CHANNEL } from './realtimeBus'
import { getClientSessionId } from './clientSession'

describe('resolveRealtimeConfig', () => {
  it('sin url o sin key → null (bus no-op, fallback on-focus)', () => {
    expect(resolveRealtimeConfig('', '')).toBeNull()
    expect(resolveRealtimeConfig('https://x.supabase.co', '')).toBeNull()
    expect(resolveRealtimeConfig('', 'k')).toBeNull()
    expect(resolveRealtimeConfig(undefined, undefined)).toBeNull()
  })
  it('con url y key → config', () => {
    expect(resolveRealtimeConfig('https://x.supabase.co', 'k')).toEqual({ url: 'https://x.supabase.co', key: 'k' })
  })
})

describe('isTrucksLiveMessage', () => {
  it('acepta kinds conocidos', () => {
    expect(isTrucksLiveMessage({ kind: 'truck' })).toBe(true)
    expect(isTrucksLiveMessage({ kind: 'truck_load', truckId: 'C440' })).toBe(true)
  })
  it('rechaza basura', () => {
    expect(isTrucksLiveMessage(null)).toBe(false)
    expect(isTrucksLiveMessage({})).toBe(false)
    expect(isTrucksLiveMessage({ kind: 'otra' })).toBe(false)
    expect(isTrucksLiveMessage('x')).toBe(false)
    expect(isTrucksLiveMessage(42)).toBe(false)
  })
  it('el canal es trucks-live', () => {
    expect(TRUCKS_LIVE_CHANNEL).toBe('trucks-live')
  })
  it('tolera el clientId en el payload (broadcast nuevo)', () => {
    expect(isTrucksLiveMessage({ kind: 'truck_load', clientId: 'abc-123' })).toBe(true)
  })
})

// Filtro de timbres PROPIOS: el browser que originó la escritura no debe
// refetchearse a sí mismo (era el refetch que se metía en pleno guardado).
describe('isOwnTrucksLiveMessage', () => {
  it('propio: clientId del payload == id de esta sesión', () => {
    expect(isOwnTrucksLiveMessage({ kind: 'truck', clientId: 'yo' }, 'yo')).toBe(true)
  })
  it('ajeno: clientId distinto → hay que refetchear', () => {
    expect(isOwnTrucksLiveMessage({ kind: 'truck', clientId: 'otro' }, 'yo')).toBe(false)
  })
  it('sin clientId (deploy viejo / emisor desconocido) → cuenta como ajeno', () => {
    expect(isOwnTrucksLiveMessage({ kind: 'truck' }, 'yo')).toBe(false)
    expect(isOwnTrucksLiveMessage({ kind: 'truck', clientId: '' }, 'yo')).toBe(false)
  })
  it('ownClientId vacío nunca matchea (defensivo)', () => {
    expect(isOwnTrucksLiveMessage({ kind: 'truck', clientId: '' }, '')).toBe(false)
  })
})

describe('getClientSessionId', () => {
  it('es estable durante la sesión y con formato apto para header', () => {
    const a = getClientSessionId()
    const b = getClientSessionId()
    expect(a).toBe(b)
    expect(a.length).toBeGreaterThan(7)
    expect(/^[\w.:-]+$/.test(a)).toBe(true) // mismo charset que valida el backend
  })
})

describe('timbre de cargas (shipment)', () => {
  it('reconoce el aviso de carga cambiada', () => {
    expect(isTrucksLiveMessage({ kind: 'shipment' })).toBe(true)
  })

  it('sigue rechazando basura', () => {
    expect(isTrucksLiveMessage({ kind: 'shipments' })).toBe(false)
    expect(isTrucksLiveMessage({ kind: '' })).toBe(false)
  })

  it('el que originó el cambio ignora su propio timbre', () => {
    const msg = { kind: 'shipment' as const, clientId: 'br-1' }
    expect(isOwnTrucksLiveMessage(msg, 'br-1')).toBe(true)
    expect(isOwnTrucksLiveMessage(msg, 'joaco-2')).toBe(false)
  })
})
