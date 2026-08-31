import { createClient } from '@supabase/supabase-js'
import { getClientSessionId } from './clientSession'

// Bus de tiempo real para co-edición de camiones (Fase 1: solo "timbre").
// El browser se conecta ÚNICAMENTE al canal Realtime para recibir avisos de
// "cambió un camión/carga" → NO lee tablas (la base sigue detrás del backend).
// Si faltan las env vars públicas, el bus es no-op y la app sigue con el
// refresco on-focus (que no rompa nada).

export const TRUCKS_LIVE_CHANNEL = 'trucks-live'

// 'shipment' (31/08): editar una carga (transporte, deposito, fechas…) no
// avisaba a nadie. El que tenia la grilla abierta seguia viendo el dato viejo
// hasta recargar la pagina, y dos personas podian tocar la misma carga sin
// enterarse. Es el mismo timbre: avisa que cambio algo, no manda datos.
export type TrucksLiveKind = 'truck' | 'truck_load' | 'ref_checks' | 'shipment'
// clientId: id de sesión del browser que ORIGINÓ la escritura (el backend lo
// copia del header X-Client-Id al payload del broadcast). Sirve para que el
// que guarda ignore su propio timbre y no se refetchee en medio de su guardado.
export interface TrucksLiveMessage { kind: TrucksLiveKind; truckId?: string; clientId?: string }

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
  return k === 'truck' || k === 'truck_load' || k === 'ref_checks' || k === 'shipment'
}

/** true si el timbre lo originó ESTE browser (broadcast propio → ignorar).
 *  Broadcasts sin clientId (deploys viejos / otros emisores) cuentan como ajenos. */
export function isOwnTrucksLiveMessage(msg: TrucksLiveMessage, ownClientId: string): boolean {
  return !!msg.clientId && !!ownClientId && msg.clientId === ownClientId
}

/**
 * Se suscribe al canal `trucks-live` y llama `onMessage` por cada aviso válido.
 * Devuelve una función de cleanup. Si faltan las env vars, NO crea cliente y
 * devuelve un cleanup no-op (la app sigue con el refresco on-focus).
 *
 * Crea un cliente Realtime DEDICADO por suscripción y lo desconecta entero en el
 * cleanup. Por qué no un singleton: `client.channel(topic)` de supabase-js reusa
 * un canal existente con ese topic (aunque esté "leaving"), y la remoción es
 * asíncrona. Reutilizar el cliente entre logout→login (o el doble-montaje de
 * React StrictMode en dev) podía apilar un segundo `.on('broadcast')` sobre el
 * canal anterior → `onMessage` disparaba doble (doble refetch) + binding colgado.
 * Con un cliente fresco por suscripción el registro de canales nunca se comparte.
 * El nombre del canal DEBE seguir siendo `trucks-live` (igual al topic del
 * broadcast del backend), si no los mensajes no llegan.
 */
export function subscribeTrucksLive(onMessage: (msg: TrucksLiveMessage) => void): () => void {
  const cfg = resolveRealtimeConfig(
    import.meta.env.VITE_SUPABASE_URL as string | undefined,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  )
  if (!cfg) return () => {}
  try {
    const client = createClient(cfg.url, cfg.key, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 5 } },
    })
    const channel = client
      .channel(TRUCKS_LIVE_CHANNEL)
      .on('broadcast', { event: 'change' }, (msg: { payload?: unknown }) => {
        if (!isTrucksLiveMessage(msg.payload)) return
        // Timbre PROPIO (escritura originada por este browser): ignorar. El estado
        // local ya es la verdad (optimista + POST confirmado); refetchear acá era
        // lo que metía GETs en plena secuencia de guardado multi-paso.
        if (isOwnTrucksLiveMessage(msg.payload, getClientSessionId())) return
        onMessage(msg.payload)
      })
      .subscribe()
    return () => {
      // Teardown completo: quitar el canal y cerrar el socket de ESTE cliente.
      try { client.removeChannel(channel) } catch { /* noop */ }
      try { client.realtime.disconnect() } catch { /* noop */ }
    }
  } catch {
    // Nunca romper la app por Realtime → degradar a on-focus.
    return () => {}
  }
}
