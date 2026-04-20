import { describe, it, expect } from 'vitest'
import * as mod from './rateLimiter.js'

describe('rateLimiter exports', () => {
  it('exports checkRateLimit (default config)', () => {
    expect(typeof mod.checkRateLimit).toBe('function')
  })
  it('exports checkRateLimitWithConfig (configurable)', () => {
    expect(typeof mod.checkRateLimitWithConfig).toBe('function')
  })
  it('exports clearRateLimit', () => {
    expect(typeof mod.clearRateLimit).toBe('function')
  })
})
