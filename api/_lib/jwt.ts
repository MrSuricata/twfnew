import jwt from 'jsonwebtoken'

// ─── Types ──────────────────────────────────────────────────────────────
export interface AdminPayload {
  role: 'admin'
  user: string
  /** Nombre visible para auditoría (tokens viejos no lo traen). */
  name?: string
  /** 'owner' = Brian (login por env vars) — gestiona usuarios. 'admin' =
   *  usuario individual de admin_users. Tokens viejos sin level = owner. */
  level?: 'owner' | 'admin'
  /** Scoping por cliente para level=admin: solo ve cargas cuyo CLIENTE matchea
   *  este patrón (misma semántica que clients.cliente_pattern). Vacío/undefined
   *  = ve TODAS las cargas (owner y tokens viejos). */
  clientePattern?: string
  /** Pestaña con la que arranca este usuario al loguearse (admin_users.home_area).
   *  Vacío/undefined = la default de la marca ('hoy'). */
  homeArea?: string
}

export interface ClientPayload {
  role: 'client'
  email: string
  name: string
  company: string
  clientePattern: string
  /** id de client_users cuando el login fue por email+contraseña — permite a
   *  verify-session revalidar `active`. Tokens legacy (impersonate) no lo
   *  traen y validan solo firma. */
  uid?: string
}

export interface DepotPayload {
  role: 'depot'
  email: string
  name: string
  /** Unified partner filter value (depot name). */
  filterValue: string
  /** @deprecated use filterValue. Kept for back-compat with existing tokens. */
  depotName: string
}

export interface TransportPayload {
  role: 'transport'
  email: string
  name: string
  /** Unified partner filter value (transport name). */
  filterValue: string
  /** @deprecated use filterValue. Kept for back-compat with existing tokens. */
  transportName: string
}

export type TokenPayload = AdminPayload | ClientPayload | DepotPayload | TransportPayload

// ─── Helpers ────────────────────────────────────────────────────────────
function getSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET env var missing or too short (min 32 chars)')
  }
  return secret
}

/** Sign an admin JWT (8h expiry) */
export function signAdminToken(user: string, name?: string, level: 'owner' | 'admin' = 'owner', clientePattern?: string, homeArea?: string): string {
  const payload: AdminPayload = { role: 'admin', user, name: name || user, level }
  // Solo los admin acotados llevan patrón; el owner ve todo (sin patrón).
  if (level === 'admin' && clientePattern && clientePattern.trim()) payload.clientePattern = clientePattern.trim()
  if (homeArea && homeArea.trim()) payload.homeArea = homeArea.trim()
  return jwt.sign(payload, getSecret(), { expiresIn: '8h' })
}

/** Nombre para el log de auditoría (tokens viejos: user a secas). */
export function auditUser(payload: { user?: string; name?: string; email?: string } | null): string {
  if (!payload) return 'desconocido'
  return payload.name || payload.user || payload.email || 'desconocido'
}

/** Sign a client JWT (24h expiry). `uid` = id de client_users (login con
 *  contraseña); omitido en impersonate/tokens legacy. */
export function signClientToken(
  email: string,
  name: string,
  company: string,
  clientePattern: string,
  uid?: string
): string {
  const payload: ClientPayload = { role: 'client', email, name, company, clientePattern }
  if (uid) payload.uid = uid
  return jwt.sign(payload, getSecret(), { expiresIn: '24h' })
}

/** Sign a depot user JWT (12h expiry) */
export function signDepotToken(email: string, name: string, depotName: string): string {
  // Include both `filterValue` (canonical) and `depotName` (legacy) for back-compat.
  const payload: DepotPayload = { role: 'depot', email, name, filterValue: depotName, depotName }
  return jwt.sign(payload, getSecret(), { expiresIn: '12h' })
}

/** Sign a transport user JWT (12h expiry) */
export function signTransportToken(email: string, name: string, transportName: string): string {
  // Include both `filterValue` (canonical) and `transportName` (legacy) for back-compat.
  const payload: TransportPayload = { role: 'transport', email, name, filterValue: transportName, transportName }
  return jwt.sign(payload, getSecret(), { expiresIn: '12h' })
}

/** Verify any JWT and return its payload */
export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, getSecret(), { algorithms: ['HS256'] }) as TokenPayload
}

/** Extract Bearer token from Authorization header */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null
  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null
  return parts[1]
}

/** Convenience: extract + verify in one step, returns null if invalid */
export function authenticateRequest(authHeader: string | undefined): TokenPayload | null {
  const token = extractBearerToken(authHeader)
  if (!token) return null
  try {
    return verifyToken(token)
  } catch {
    return null
  }
}
