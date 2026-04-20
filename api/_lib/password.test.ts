import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from './password.js'

describe('password', () => {
  it('hashPassword produces a bcrypt hash (starts with $2a/$2b/$2y$)', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(hash).toMatch(/^\$2[aby]\$12\$/)
    expect(hash.length).toBeGreaterThanOrEqual(60)
  })

  it('verifyPassword returns true for correct password', async () => {
    const hash = await hashPassword('mypassword123')
    await expect(verifyPassword('mypassword123', hash)).resolves.toBe(true)
  })

  it('verifyPassword returns false for wrong password', async () => {
    const hash = await hashPassword('mypassword123')
    await expect(verifyPassword('wrongpassword', hash)).resolves.toBe(false)
  })

  it('verifyPassword returns false for an empty hash', async () => {
    await expect(verifyPassword('anything', '')).resolves.toBe(false)
  })

  it('two hashes of the same password differ (unique salt)', async () => {
    const h1 = await hashPassword('same')
    const h2 = await hashPassword('same')
    expect(h1).not.toBe(h2)
  })
})
