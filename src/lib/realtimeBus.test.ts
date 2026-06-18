import { describe, it, expect } from 'vitest'
import { resolveRealtimeConfig, isTrucksLiveMessage, TRUCKS_LIVE_CHANNEL } from './realtimeBus'

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
})
