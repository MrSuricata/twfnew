// Emite un broadcast en el canal `trucks-live` vía la REST de Realtime de
// Supabase (no abre websocket → ideal para serverless). El browser suscrito al
// canal lo recibe y refetcha. NUNCA tira: un broadcast fallido no debe romper
// la escritura que ya se hizo (es solo el "timbre").
//
// Shape confirmado (docs Supabase): POST {url}/realtime/v1/api/broadcast
//   headers: apikey + Content-Type: application/json
//   body: { messages: [{ topic, event, payload }] }  (topic = nombre del canal)
//
// clientId: id de sesión del browser que ORIGINÓ la escritura (header
// X-Client-Id). Viaja en el payload para que ese mismo browser ignore su
// propio timbre — sin esto, el que guardaba un camión se refetcheaba a sí
// mismo en plena secuencia multi-paso y podía pisar su UI con un snapshot
// viejo. Broadcasts sin clientId siguen valiendo como ajenos (compat).

const CHANNEL = 'trucks-live'

/** Saca el X-Client-Id del request y lo sanea (string corto, charset de header). */
export function clientIdFromRequest(req: { headers: Record<string, string | string[] | undefined> }): string | undefined {
  const raw = req.headers['x-client-id']
  const v = Array.isArray(raw) ? raw[0] : raw
  if (!v || typeof v !== 'string') return undefined
  const clean = v.trim().slice(0, 64)
  return /^[\w.:-]+$/.test(clean) ? clean : undefined
}

export async function broadcastTrucksLive(
  kind: 'truck' | 'truck_load',
  truckId?: string,
  clientId?: string,
): Promise<void> {
  try {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [{ topic: CHANNEL, event: 'change', payload: { kind, truckId, clientId } }],
      }),
    })
  } catch {
    /* no romper la escritura por un broadcast fallido */
  }
}
