import { createHash, randomInt } from 'crypto'
import { getSupabase } from './supabase.js'

// ─── Config ──────────────────────────────────────────────────────────────
const OTP_TTL_MS = 10 * 60 * 1000   // 10 minutes
const MAX_ATTEMPTS = 5               // Max wrong tries before invalidation

// ─── Helpers ─────────────────────────────────────────────────────────────
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Generate a 6-digit numeric OTP code */
export function generateOTP(): string {
  return String(randomInt(100000, 999999))
}

/**
 * Store an OTP for a given email (hashed) in Supabase.
 * Uses upsert so re-requesting a code replaces the old one.
 *
 * Table schema (run once in Supabase SQL Editor):
 * CREATE TABLE IF NOT EXISTS otp_codes (
 *   email      TEXT PRIMARY KEY,
 *   hash       TEXT        NOT NULL,
 *   expires_at TIMESTAMPTZ NOT NULL,
 *   attempts   INTEGER     NOT NULL DEFAULT 0
 * );
 */
export async function storeOTP(email: string, code: string): Promise<void> {
  const key = email.toLowerCase().trim()
  const db = getSupabase()

  // Cleanup expired OTPs in background (don't await — not critical)
  cleanupExpired().catch(() => {})

  const { error } = await db.from('otp_codes').upsert({
    email: key,
    hash: sha256(code),
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    attempts: 0,
  }, { onConflict: 'email' })

  if (error) {
    console.error('Failed to store OTP in Supabase:', error.message)
    throw new Error('OTP storage failed')
  }
}

/**
 * Verify an OTP code for a given email. Returns true if valid, false otherwise.
 * Consumes the OTP on success (one-time use).
 * Increments attempt counter on failure for brute-force protection.
 */
export async function verifyOTP(email: string, code: string): Promise<boolean> {
  const key = email.toLowerCase().trim()
  const db = getSupabase()

  const { data, error } = await db
    .from('otp_codes')
    .select('hash, expires_at, attempts')
    .eq('email', key)
    .single()

  if (error || !data) return false

  // Expired
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await db.from('otp_codes').delete().eq('email', key)
    return false
  }

  // Too many attempts — brute-force protection
  if (data.attempts >= MAX_ATTEMPTS) {
    await db.from('otp_codes').delete().eq('email', key)
    return false
  }

  // Check hash
  if (sha256(code) === data.hash) {
    // Valid — consume (delete)
    await db.from('otp_codes').delete().eq('email', key)
    return true
  }

  // Wrong code — increment attempts
  await db.from('otp_codes')
    .update({ attempts: data.attempts + 1 })
    .eq('email', key)

  return false
}

/** Remove expired entries from the otp_codes table */
export async function cleanupExpired(): Promise<void> {
  const db = getSupabase()
  await db.from('otp_codes').delete().lt('expires_at', new Date().toISOString())
}
