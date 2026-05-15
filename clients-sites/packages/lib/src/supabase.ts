/**
 * Factory de clientes Supabase para los Tier 3.
 * `@supabase/supabase-js` es un peer dependency opcional — cada sitio Tier 3 lo agrega.
 */

export interface SupabaseEnv {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

export function readSupabaseEnv(env: Record<string, string | undefined>): SupabaseEnv {
  const url = env.SUPABASE_URL ?? env.PUBLIC_SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY ?? env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Supabase env vars ausentes: SUPABASE_URL y SUPABASE_ANON_KEY son requeridas.',
    );
  }
  return {
    url,
    anonKey,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

/**
 * El cliente real se crea en cada sitio. Aquí sólo exponemos un tipo y la firma.
 * Uso:
 *   import { createClient } from '@supabase/supabase-js';
 *   import { readSupabaseEnv } from '@twf/lib/supabase';
 *   const env = readSupabaseEnv(import.meta.env);
 *   const supabase = createClient(env.url, env.anonKey);
 */
export interface SupabaseClientLike {
  from: (table: string) => unknown;
  auth: unknown;
  storage: unknown;
}
