import { getSupabase } from './supabase.js'

/**
 * Supabase-backed rate limiter for serverless environments.
 *
 * Table schema (run once in Supabase SQL Editor):
 * CREATE TABLE IF NOT EXISTS rate_limits (
 *   key            TEXT PRIMARY KEY,
 *   attempts       INTEGER     NOT NULL DEFAULT 0,
 *   first_attempt  TIMESTAMPTZ NOT NULL,
 *   blocked_until  TIMESTAMPTZ
 * );
 */

const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000       // 15 minutes
const BLOCK_DURATION_MS = 30 * 60 * 1000 // 30 minutes block after max attempts

/**
 * Check if a key is rate limited. Returns { limited, retryAfter }.
 * If not limited, increments the attempt counter.
 */
export async function checkRateLimit(key: string): Promise<{ limited: boolean; retryAfterMs?: number }> {
  const db = getSupabase()
  const now = new Date()

  const { data, error } = await db
    .from('rate_limits')
    .select('attempts, first_attempt, blocked_until')
    .eq('key', key)
    .single()

  // No record — first attempt
  if (error || !data) {
    await db.from('rate_limits').upsert({
      key,
      attempts: 1,
      first_attempt: now.toISOString(),
      blocked_until: null,
    }, { onConflict: 'key' })
    return { limited: false }
  }

  // Currently blocked?
  if (data.blocked_until) {
    const blockedUntil = new Date(data.blocked_until).getTime()
    if (now.getTime() < blockedUntil) {
      return { limited: true, retryAfterMs: blockedUntil - now.getTime() }
    }
    // Block expired — reset
    await db.from('rate_limits').update({
      attempts: 1,
      first_attempt: now.toISOString(),
      blocked_until: null,
    }).eq('key', key)
    return { limited: false }
  }

  // Window expired? Reset counter
  const windowStart = new Date(data.first_attempt).getTime()
  if (now.getTime() - windowStart > WINDOW_MS) {
    await db.from('rate_limits').update({
      attempts: 1,
      first_attempt: now.toISOString(),
      blocked_until: null,
    }).eq('key', key)
    return { limited: false }
  }

  // Within window — check attempts
  const newAttempts = data.attempts + 1
  if (newAttempts > MAX_ATTEMPTS) {
    // Block the key
    const blockedUntil = new Date(now.getTime() + BLOCK_DURATION_MS).toISOString()
    await db.from('rate_limits').update({
      attempts: newAttempts,
      blocked_until: blockedUntil,
    }).eq('key', key)
    return { limited: true, retryAfterMs: BLOCK_DURATION_MS }
  }

  // Increment
  await db.from('rate_limits').update({ attempts: newAttempts }).eq('key', key)
  return { limited: false }
}

/**
 * Clear rate limit for a key (call on successful login).
 */
export async function clearRateLimit(key: string): Promise<void> {
  const db = getSupabase()
  await db.from('rate_limits').delete().eq('key', key)
}
