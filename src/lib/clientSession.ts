// Identidad efímera de ESTE browser/pestaña (vive lo que vive el bundle cargado).
//
// Para qué: cada escritura al backend viaja con el header `X-Client-Id`; el
// backend lo incluye en el broadcast Realtime (`trucks-live`) y así el cliente
// que originó la escritura puede IGNORAR su propio timbre. Sin esto, el que
// guarda un camión recibe su propio broadcast ~400ms después y se refetchea a
// sí mismo en plena secuencia multi-paso de guardado (la carrera que pisaba la
// UI con un snapshot viejo).
//
// No es auth ni tracking: es un id aleatorio por sesión de página, sin persistir.

let _clientSessionId: string | null = null

/** Id aleatorio estable durante la vida de la página (formato seguro para header). */
export function getClientSessionId(): string {
  if (!_clientSessionId) {
    try {
      _clientSessionId = crypto.randomUUID()
    } catch {
      // Entornos sin crypto.randomUUID (tests / browsers viejos)
      _clientSessionId = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    }
  }
  return _clientSessionId
}
