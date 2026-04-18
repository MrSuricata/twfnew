import { describe, it, expect } from 'vitest'
import {
  validate,
  QuoteSubmitSchema,
  ClientRowSchema,
  SettingsUpsertSchema,
  PartnerUserCreateSchema,
  AdminLoginSchema,
  OtpRequestSchema,
  OtpVerifySchema,
  SETTINGS_ALLOWLIST,
} from './schemas.js'

describe('validate helper', () => {
  it('returns ok:true for valid input', () => {
    const r = validate(QuoteSubmitSchema, {
      name: 'Juan',
      email: 'juan@example.com',
      cargoType: 'FCL',
      language: 'es',
    })
    expect(r.ok).toBe(true)
  })

  it('returns ok:false with error for invalid input', () => {
    const r = validate(QuoteSubmitSchema, { name: '', email: 'not-an-email' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/name|email/i)
  })
})

describe('QuoteSubmitSchema', () => {
  it('rejects empty name', () => {
    const r = QuoteSubmitSchema.safeParse({ name: '', email: 'a@b.c', cargoType: 'FCL' })
    expect(r.success).toBe(false)
  })
  it('rejects invalid email', () => {
    const r = QuoteSubmitSchema.safeParse({ name: 'J', email: 'nope', cargoType: 'FCL' })
    expect(r.success).toBe(false)
  })
  it('caps details at 2000 chars', () => {
    const r = QuoteSubmitSchema.safeParse({
      name: 'J', email: 'a@b.co', cargoType: 'FCL', details: 'x'.repeat(2001)
    })
    expect(r.success).toBe(false)
  })
  it('strips HTML tags from details', () => {
    const r = QuoteSubmitSchema.safeParse({
      name: 'J', email: 'a@b.co', cargoType: 'FCL', details: 'hi <script>alert(1)</script>'
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.details).toBe('hi alert(1)')
  })
})

describe('ClientRowSchema', () => {
  it('rejects clientePattern < 5 chars', () => {
    const r = ClientRowSchema.safeParse({
      id: 'c1', email: 'a@b.co', name: 'Acme', clientePattern: 'AC'
    })
    expect(r.success).toBe(false)
  })
  it('accepts valid clientePattern', () => {
    const r = ClientRowSchema.safeParse({
      id: 'c1', email: 'a@b.co', name: 'Acme', clientePattern: 'CHIAPERO'
    })
    expect(r.success).toBe(true)
  })
  it('accepts comma-separated patterns', () => {
    const r = ClientRowSchema.safeParse({
      id: 'c1', email: 'a@b.co', name: 'Acme', clientePattern: 'CHIAPERO,MARTINEZ'
    })
    expect(r.success).toBe(true)
  })
})

describe('SettingsUpsertSchema', () => {
  it('rejects keys not in SETTINGS_ALLOWLIST (empty by default)', () => {
    const r = SettingsUpsertSchema.safeParse({ key: '__evil', value: {} })
    expect(r.success).toBe(false)
  })
  it('SETTINGS_ALLOWLIST is empty initially', () => {
    expect(SETTINGS_ALLOWLIST).toEqual([])
  })
})

describe('PartnerUserCreateSchema', () => {
  it('rejects password < 10 chars', () => {
    const r = PartnerUserCreateSchema.safeParse({
      email: 'a@b.co', name: 'N', password: 'short', role: 'depot', filterValue: 'X'
    })
    expect(r.success).toBe(false)
  })
  it('rejects invalid role', () => {
    const r = PartnerUserCreateSchema.safeParse({
      email: 'a@b.co', name: 'N', password: 'longpassword1', role: 'hacker', filterValue: 'X'
    })
    expect(r.success).toBe(false)
  })
})

describe('AdminLoginSchema', () => {
  it('accepts a short password (admin-login checks hash)', () => {
    const r = AdminLoginSchema.safeParse({ username: 'admin', password: 'x' })
    expect(r.success).toBe(true)
  })
  it('rejects missing username', () => {
    const r = AdminLoginSchema.safeParse({ password: 'x' })
    expect(r.success).toBe(false)
  })
})

describe('OtpRequestSchema / OtpVerifySchema', () => {
  it('OtpRequestSchema requires email', () => {
    const r = OtpRequestSchema.safeParse({ action: 'request' })
    expect(r.success).toBe(false)
  })
  it('OtpVerifySchema requires 6-digit code', () => {
    const r1 = OtpVerifySchema.safeParse({ action: 'verify', email: 'a@b.co', code: '123' })
    expect(r1.success).toBe(false)
    const r2 = OtpVerifySchema.safeParse({ action: 'verify', email: 'a@b.co', code: '123456' })
    expect(r2.success).toBe(true)
  })
})
