// Emite un broadcast en el canal `trucks-live` vía la REST de Realtime de
// Supabase (no abre websocket → ideal para serverless). El browser suscrito al
// canal lo recibe y refetcha. NUNCA tira: un broadcast fallido no debe romper
// la escritura que ya se hizo (es solo el "timbre").
//
// Shape confirmado (docs Supabase): POST {url}/realtime/v1/api/broadcast
//   headers: apikey + Content-Type: application/json
//   body: { messages: [{ topic, event, payload }] }  (topic = nombre del canal)

const CHANNEL = 'trucks-live'

export async function broadcastTrucksLive(kind: 'truck' | 'truck_load', truckId?: string): Promise<void> {
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
        messages: [{ topic: CHANNEL, event: 'change', payload: { kind, truckId } }],
      }),
    })
  } catch {
    /* no romper la escritura por un broadcast fallido */
  }
}
