import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Bus de tiempo real para co-edición de camiones (Fase 1: solo "timbre").
// El browser se conecta ÚNICAMENTE al canal Realtime para recibir avisos de
// "cambió un camión/carga" → NO lee tablas (la base sigue detrás del backend).
// Si faltan las env vars públicas, el bus es no-op y la app sigue con el
// refresco on-focus (que no rompa nada).

export const TRUCKS_LIVE_CHANNEL = 'trucks-live'

export type TrucksLiveKind = 'truck' | 'truck_load'
export interface TrucksLiveMessage { kind: TrucksLiveKind; truckId?: string }

/** Config del cliente Realtime SOLO si están las dos env vars. null = bus no-op. */
export function resolveRealtimeConfig(
  url: string | undefined,
  key: string | undefined,
): { url: string; key: string } | null {
  if (!url || !key) return null
  return { url, key }
}

/** Type-guard del payload del broadcast (defensivo contra basura / cambios de forma). */
export function isTrucksLiveMessage(x: unknown): x is TrucksLiveMessage {
  if (!x || typeof x !== 'object') return false
  const k = (x as { kind?: unknown }).kind
  return k === 'truck' || k === 'truck_load'
}

let _client: SupabaseClient | null = null

/**
 * Se suscribe al canal `trucks-live` y llama `onMessage` por cada aviso válido.
 * Devuelve una función de cleanup. Si faltan las env vars, NO crea cliente y
 * devuelve un cleanup no-op (la app sigue con el refresco on-focus).
 */
export function subscribeTrucksLive(onMessage: (msg: TrucksLiveMessage) => void): () => void {
  const cfg = resolveRealtimeConfig(
    import.meta.env.VITE_SUPABASE_URL as string | undefined,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  )
  if (!cfg) return () => {}
  try {
    if (!_client) {
      _client = createClient(cfg.url, cfg.key, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 5 } },
      })
    }
    const channel = _client
      .channel(TRUCKS_LIVE_CHANNEL)
      .on('broadcast', { event: 'change' }, (msg: { payload?: unknown }) => {
        if (isTrucksLiveMessage(msg.payload)) onMessage(msg.payload)
      })
      .subscribe()
    return () => { try { _client?.removeChannel(channel) } catch { /* noop */ } }
  } catch {
    // Nunca romper la app por Realtime → degradar a on-focus.
    return () => {}
  }
}
