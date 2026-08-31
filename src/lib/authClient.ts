// ─── Auth Client ─────────────────────────────────────────────────────
// Handles all authentication from the browser.
// JWT tokens live in a module-level variable (NOT localStorage) for security.
// ─────────────────────────────────────────────────────────────────────

import { getClientSessionId } from './clientSession'

export type UserRole = 'admin' | 'client' | 'depot' | 'transport'

let _token: string | null = null
let _role: UserRole | null = null
let _userData: Record<string, string> | null = null

// ─── Getters ────────────────────────────────────────────────────────
export function getToken(): string | null { return _token }
export function getRole(): UserRole | null { return _role }
export function getUserData(): Record<string, string> | null { return _userData }
export function isAuthenticated(): boolean { return _token !== null }

/** ¿Hay un token persistido en sessionStorage? Lectura SÍNCRONA para decidir en
 *  el primer render si restaurar la sesión (splash) en vez del formulario de
 *  login — evita el flash del login viejo mientras verifySession() está en vuelo. */
export function hasStoredToken(): boolean {
  try { return !!sessionStorage.getItem('twf-token') } catch { return false }
}

/** Internal setter for auth state */
function setAuth(token: string, role: UserRole, data?: Record<string, string>) {
  _token = token
  _role = role
  _userData = data || null
  // Token nuevo = sesión nueva: si más adelante vence, hay que avisar otra vez.
  sesionYaAvisada = false
  // Persist only the token (not credentials) for session restore
  try { sessionStorage.setItem('twf-token', token) } catch {}
}

/** Adopta el token de "Ver como cliente" que llega por el fragment de la URL
 *  (#imp=…). El fragment sobrevive CUALQUIER salto de contexto (PWA instalada
 *  → navegador, ventana nueva) donde el sessionStorage se pierde — la causa
 *  del impersonate que caía en la landing (bug 27/08). El fragment nunca
 *  viaja al server ni queda en access logs. */
export function adoptImpersonationToken(token: string) {
  setAuth(token, 'client')
}

/** Decodifica el payload del JWT guardado (sin verificar — solo para UI;
 *  el servidor SIEMPRE re-valida los permisos). */
function decodeTokenPayload(): Record<string, unknown> | null {
  try {
    const t = _token || sessionStorage.getItem('twf-token')
    if (!t) return null
    return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  } catch { return null }
}

/** Nivel del admin logueado: 'owner' (Brian — gestiona usuarios) o 'admin'
 *  (usuario del equipo). Tokens viejos sin level = owner. */
export function getAdminLevel(): 'owner' | 'admin' {
  const p = decodeTokenPayload()
  if (!p || p.role !== 'admin') return 'admin'
  return p.level === 'admin' ? 'admin' : 'owner'
}

/** Nombre visible del usuario logueado. */
export function getAdminName(): string {
  const p = decodeTokenPayload()
  return String(p?.name || p?.user || '')
}

/** Identidad de LOGIN (el campo `user` del token, en general el email). Es la
 *  que el server estampa en `by` de ref_checks y en el audit log — o sea, la
 *  que hay que comparar para saber si un paso lo marcó uno mismo. Ojo: NO es
 *  getAdminName(), que devuelve el nombre visible y no matchea. */
export function getAdminUser(): string {
  const p = decodeTokenPayload()
  return String(p?.user || '')
}

/** Pestaña de inicio del usuario logueado (admin_users.home_area, viaja en el
 *  JWT). '' = usar la default de la marca. Sobrevive el F5 igual que el nivel:
 *  se lee del token guardado, sin fetch extra. */
export function getAdminHomeArea(): string {
  const p = decodeTokenPayload()
  if (!p || p.role !== 'admin') return ''
  return String(p.homeArea || '')
}

/** Clear auth state and all cached data (logout).
 * SECURITY: removes all business data from localStorage to prevent leakage after logout. */
export function clearAuth() {
  _token = null
  _role = null
  _userData = null
  try { sessionStorage.removeItem('twf-token') } catch {}
  // Clear cached business data from localStorage
  try {
    localStorage.removeItem('twf-shipments')
    localStorage.removeItem('twf-quotes')
    localStorage.removeItem('twf-clients')
    localStorage.removeItem('twf-documents')
    localStorage.removeItem('twf-reports')
  } catch {}
}

// ─── Admin Login ────────────────────────────────────────────────────
export async function loginAdmin(username: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/auth/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { success: false, error: data.error || 'Error de autenticación' }
    }

    const data = await res.json()
    setAuth(data.token, 'admin', { user: data.user, name: data.name || data.user, level: data.level || 'owner' })
    return { success: true }
  } catch (err) {
    console.error('Login error:', err)
    return { success: false, error: 'Error de conexión con el servidor' }
  }
}

// ─── Client Login (portal de clientes, email + contraseña) ──────────
// Reemplaza el flujo OTP (2026-07): mismo endpoint que el login de partners,
// discriminado por type:'client'.
export async function loginClient(email: string, password: string): Promise<{ success: boolean; error?: string; clientData?: Record<string, string> }> {
  try {
    const res = await fetch('/api/auth/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.toLowerCase().trim(), password, type: 'client' }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { success: false, error: data.error || 'Usuario o contraseña incorrectos' }
    }

    const data = await res.json()
    setAuth(data.token, 'client', {
      email: data.email,
      name: data.name,
      company: data.company,
    })
    return {
      success: true,
      clientData: { email: data.email, name: data.name, company: data.company }
    }
  } catch (err) {
    console.error('Client login error:', err)
    return { success: false, error: 'Error de conexión con el servidor' }
  }
}

// ─── Partner Login (depot/transport) ─────────────────────────────────
export async function loginPartner(email: string, password: string): Promise<{ success: boolean; error?: string; role?: string; data?: Record<string, string> }> {
  try {
    const res = await fetch('/api/auth/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, type: 'partner' }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { success: false, error: data.error || 'Credenciales inválidas' }
    }

    const data = await res.json()
    const role = data.role as UserRole
    setAuth(data.token, role, {
      email: data.email,
      name: data.name,
      filterValue: data.filterValue,
    })
    return { success: true, role: data.role, data: { email: data.email, name: data.name, filterValue: data.filterValue } }
  } catch (err) {
    console.error('Partner login error:', err)
    return { success: false, error: 'Error de conexión con el servidor' }
  }
}

// ─── Session Restore ────────────────────────────────────────────────
export async function verifySession(): Promise<{ valid: boolean; role?: UserRole; data?: Record<string, string> }> {
  try {
    const storedToken = sessionStorage.getItem('twf-token')
    if (!storedToken) return { valid: false }

    const res = await fetch('/api/auth/verify-session', {
      headers: { 'Authorization': `Bearer ${storedToken}` },
    })

    if (!res.ok) {
      clearAuth()
      return { valid: false }
    }

    const data = await res.json()
    setAuth(storedToken, data.role, data)
    return { valid: true, role: data.role, data }
  } catch {
    clearAuth()
    return { valid: false }
  }
}

// ─── Authenticated Fetch ────────────────────────────────────────────
/** Wrapper around fetch that adds Authorization header automatically.
 *  También manda X-Client-Id (id de sesión del browser): el backend lo copia
 *  al broadcast Realtime para que este cliente ignore sus PROPIOS timbres
 *  (si no, cada guardado dispara un refetch contra sí mismo en pleno save). */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers)
  if (_token) {
    headers.set('Authorization', `Bearer ${_token}`)
  }
  headers.set('X-Client-Id', getClientSessionId())
  const res = await fetch(url, { ...options, headers })
  // Sesión vencida (Brian 31/08): antes un 401 llegaba a cada llamador como un
  // error cualquiera — "no se pudo guardar", y a veces ni eso. Lo peor es en
  // una escritura: la edición se revierte sola y parece un bug de la app,
  // cuando en realidad hay que volver a entrar. Se avisa UNA vez.
  if (res.status === 401 && _token) avisarSesionVencida()
  return res
}

// ── Sesión vencida ─────────────────────────────────────────────────
// El aviso lo muestra la UI (este módulo no dibuja). Se arma como un aviso
// único: varias llamadas en paralelo devuelven 401 juntas y no tiene sentido
// apilar cinco carteles iguales.

type OyenteSesion = () => void
const oyentesSesion = new Set<OyenteSesion>()
let sesionYaAvisada = false

/** Se llama al recibir el primer 401 con token puesto. */
function avisarSesionVencida(): void {
  if (sesionYaAvisada) return
  sesionYaAvisada = true
  for (const o of oyentesSesion) {
    try { o() } catch { /* un oyente roto no puede tumbar el fetch */ }
  }
}

/** La UI se suscribe para mostrar el cartel. Devuelve el cleanup. */
export function onSesionVencida(oyente: OyenteSesion): () => void {
  oyentesSesion.add(oyente)
  return () => { oyentesSesion.delete(oyente) }
}

/** Rearma el aviso: al volver a entrar, un 401 futuro tiene que avisar de nuevo. */
export function resetAvisoSesion(): void {
  sesionYaAvisada = false
}
