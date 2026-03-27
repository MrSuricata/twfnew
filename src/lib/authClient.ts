// ─── Auth Client ─────────────────────────────────────────────────────
// Handles all authentication from the browser.
// JWT tokens live in a module-level variable (NOT localStorage) for security.
// ─────────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'client' | 'depot' | 'transport'

let _token: string | null = null
let _role: UserRole | null = null
let _userData: Record<string, string> | null = null

// ─── Getters ────────────────────────────────────────────────────────
export function getToken(): string | null { return _token }
export function getRole(): UserRole | null { return _role }
export function getUserData(): Record<string, string> | null { return _userData }
export function isAuthenticated(): boolean { return _token !== null }

/** Internal setter for auth state */
function setAuth(token: string, role: UserRole, data?: Record<string, string>) {
  _token = token
  _role = role
  _userData = data || null
  // Persist only the token (not credentials) for session restore
  try { sessionStorage.setItem('twf-token', token) } catch {}
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
    setAuth(data.token, 'admin', { user: data.user })
    return { success: true }
  } catch (err) {
    console.error('Login error:', err)
    return { success: false, error: 'Error de conexión con el servidor' }
  }
}

// ─── Client OTP ─────────────────────────────────────────────────────
export async function requestOTP(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/auth/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'request', email }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { success: false, error: data.error || 'Error al enviar código' }
    }

    return { success: true }
  } catch (err) {
    console.error('OTP request error:', err)
    return { success: false, error: 'Error de conexión con el servidor' }
  }
}

export async function verifyOTPServer(email: string, code: string): Promise<{ success: boolean; error?: string; clientData?: Record<string, string> }> {
  try {
    const res = await fetch('/api/auth/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', email, code }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { success: false, error: data.error || 'Código inválido' }
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
    console.error('OTP verify error:', err)
    return { success: false, error: 'Error de conexión con el servidor' }
  }
}

// ─── Partner Login (depot/transport) ─────────────────────────────────
export async function loginPartner(email: string, password: string): Promise<{ success: boolean; error?: string; role?: string; data?: Record<string, string> }> {
  try {
    const res = await fetch('/api/auth/partner-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
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
/** Wrapper around fetch that adds Authorization header automatically */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers)
  if (_token) {
    headers.set('Authorization', `Bearer ${_token}`)
  }
  return fetch(url, { ...options, headers })
}
