import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

/**
 * Get a Supabase client instance (cached for the Lambda lifetime).
 *
 * SECURITY: This uses SUPABASE_SERVICE_ROLE_KEY, which BYPASSES RLS.
 * It must only be used in server-side code (api/ folder).
 * Never import this from src/ or ship the key to the browser.
 */
export function getSupabase(): SupabaseClient {
  if (_client) return _client

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured')
  }

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _client
}
