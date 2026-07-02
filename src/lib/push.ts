// ─── Web Push del admin (cliente) ────────────────────────────────────
// Suscripción del navegador a los avisos diarios (LIBRE + salidas del día).
// El SW (`public/sw.js`) es minimalista solo-push: acá vive todo el flujo de
// permiso → registro → suscripción → alta/baja en el backend.
// ─────────────────────────────────────────────────────────────────────

import { authFetch } from './authClient'

/** Clave pública VAPID — NO es secreta (identifica a nuestro servidor de push;
 *  el par privado vive en Vercel como VAPID_PRIVATE_KEY). */
export const VAPID_PUBLIC_KEY =
  'BGeJ3K_9CI-VQrzpEwtraxp3w2UZlDxqNeZKgeQUrtAStcBdSIq8ZFh315fmgZgA7RhHwuKrk12p-rWo6WKQBx4'

/** ¿El navegador soporta Web Push? (si no, la campana ni se muestra) */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** iPhone/iPad SIN la PWA instalada: iOS (16.4+) solo entrega push a la app
 *  agregada a inicio — hay que avisarle al usuario que la instale primero. */
export function isIosWithoutStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS moderno se reporta como Macintosh pero con pantalla táctil.
  const isIos = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  return isIos && !standalone
}

/** Decodifica la clave VAPID base64-url al formato que pide pushManager.subscribe. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

/** ¿Este navegador ya está suscripto a los avisos? */
export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    return !!sub
  } catch {
    return false
  }
}

/** Flujo completo de alta: permiso → SW → suscripción → POST al backend.
 *  Tira Error con mensaje amigable si algo falla (el caller muestra el toast). */
export async function subscribePush(): Promise<void> {
  if (!isPushSupported()) throw new Error('Este navegador no soporta avisos push')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Permiso de notificaciones denegado — habilitalo en la configuración del navegador')
  }
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })
  const res = await authFetch('/api/data/push-subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  })
  if (!res.ok) {
    // Si el backend no la guardó, deshacer la suscripción local para no dejar
    // un endpoint fantasma que nunca va a recibir nada.
    await sub.unsubscribe().catch(() => {})
    const err = await res.json().catch(() => ({} as { error?: string }))
    throw new Error(err.error || `No se pudo guardar la suscripción (HTTP ${res.status})`)
  }
}

/** Baja: DELETE en el backend + unsubscribe local. Idempotente. */
export async function unsubscribePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe().catch(() => {})
  const res = await authFetch('/api/data/push-subscriptions', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as { error?: string }))
    throw new Error(err.error || `No se pudo dar de baja en el servidor (HTTP ${res.status})`)
  }
}
