import { createHash, randomInt } from 'crypto'

// ─── Types ──────────────────────────────────────────────────────────────
interface OTPEntry {
  hash: string          // SHA-256 of the OTP code
  expiresAt: number     // Unix timestamp (ms)
  attempts: number      // Failed verification attempts
}

// ─── In-Memory Store ────────────────────────────────────────────────────
// Works because request + verify use the same Lambda endpoint (api/auth/otp.ts)
const store = new Map<string, OTPEntry>()

const OTP_TTL_MS = 5 * 60 * 1000    // 5 minutes
const MAX_ATTEMPTS = 5               // Max wrong tries before invalidation

// ─── Helpers ────────────────────────────────────────────────────────────
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Generate a 6-digit numeric OTP code */
export function generateOTP(): string {
  return String(randomInt(100000, 999999))
}

/** Store an OTP for a given email (hashed) */
export function storeOTP(email: string, code: string): void {
  cleanup() // Purge expired entries first
  const key = email.toLowerCase().trim()
  store.set(key, {
    hash: sha256(code),
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  })
}

/** Verify an OTP code for a given email. Returns true if valid, false otherwise.
 *  Consumes the OTP on success (one-time use). */
export function verifyOTP(email: string, code: string): boolean {
  const key = email.toLowerCase().trim()
  const entry = store.get(key)

  if (!entry) return false

  // Expired
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return false
  }

  // Too many attempts — brute-force protection
  if (entry.attempts >= MAX_ATTEMPTS) {
    store.delete(key)
    return false
  }

  // Check hash
  if (sha256(code) === entry.hash) {
    store.delete(key) // One-time use
    return true
  }

  // Wrong code — increment attempts
  entry.attempts++
  return false
}

/** Remove expired entries from the store */
function cleanup(): void {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) {
      store.delete(key)
    }
  }
}
