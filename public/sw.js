/* global self, caches, clients, fetch */
/* ─── Service worker MINIMALISTA — SOLO Web Push ─────────────────────────
   La PWA es instalable SIN service worker a propósito: este archivo existe
   únicamente porque el estándar Web Push exige un SW para recibir avisos.

   PROHIBIDO agregar acá un handler de `fetch` o cualquier caching — cero
   riesgo de servir assets viejos. Si algún día se quiere offline, es una
   decisión aparte, no un "ya que estamos".
   ──────────────────────────────────────────────────────────────────────── */

self.addEventListener('install', () => {
  // Activar la versión nueva del SW sin esperar a que se cierren las pestañas.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Aviso push del backend: payload JSON { title, body, tag, icon, badge, url }
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // Payload no-JSON (no debería pasar) → aviso genérico igual
  }
  const title = data.title || 'Mediterránea'
  const options = {
    body: data.body || '',
    icon: data.icon || '/med-icon-192.png',
    badge: data.badge || '/med-icon-192.png',
    data: { url: (data && data.url) || '/admin' },
  }
  // tag por tipo de alerta: un re-envío reemplaza el aviso anterior del mismo
  // tipo en vez de apilar duplicados.
  if (data.tag) options.tag = data.tag
  event.waitUntil(self.registration.showNotification(title, options))
})

// Click en el aviso: enfocar una pestaña de la app si ya hay una abierta,
// si no abrir una nueva en data.url (default /admin).
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/admin'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
