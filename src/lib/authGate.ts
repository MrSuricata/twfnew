// ─── Auth gate ──────────────────────────────────────────────────────
// Decide si, al montar, hay que mostrar el splash de "restaurando sesión"
// en vez del formulario de login.
//
// El bug: `getInitialView()` es síncrono y devuelve 'admin-login' (o
// 'client-login' / 'partner-login') para las rutas protegidas, así que App
// renderiza el <Login/> viejo mientras `verifySession()` (fetch async) está en
// vuelo. Con un token válido en sessionStorage eso produce un "flash" del login
// viejo antes de entrar al dashboard.
//
// Solución: si hay token guardado Y la vista inicial es de login, mostramos un
// splash neutral hasta que verifySession resuelva (válido → dashboard; inválido
// → recién ahí el formulario). Sin token, el visitante directo ve el form al
// instante (verifySession corta sin red).
// ─────────────────────────────────────────────────────────────────────

/** Las tres pantallas de login dedicadas (full-page). */
const LOGIN_VIEWS: ReadonlySet<string> = new Set([
  'admin-login',
  'client-login',
  'partner-login',
])

/** ¿La vista es una de las pantallas de login? */
export function isLoginView(view: string): boolean {
  return LOGIN_VIEWS.has(view)
}

/**
 * ¿Hay que restaurar la sesión (mostrar splash) en vez del formulario?
 * True solo cuando hay token guardado y la vista inicial es de login.
 */
export function shouldRestoreSession(view: string, hasToken: boolean): boolean {
  return hasToken && isLoginView(view)
}
