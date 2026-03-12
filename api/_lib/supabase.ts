import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

/** Get a Supabase client instance (cached for the Lambda lifetime) */
export function getSupabase(): SupabaseClient {
  if (_client) return _client

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY not configured')
  }

  _client = createClient(url, key)
  return _client
}
