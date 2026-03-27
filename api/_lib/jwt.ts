import jwt from 'jsonwebtoken'

// ─── Types ──────────────────────────────────────────────────────────────
export interface AdminPayload {
  role: 'admin'
  user: string
}

export interface ClientPayload {
  role: 'client'
  email: string
  name: string
  company: string
  clientePattern: string
}

export interface DepotPayload {
  role: 'depot'
  email: string
  name: string
  depotName: string
}

export interface TransportPayload {
  role: 'transport'
  email: string
  name: string
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
export function signAdminToken(user: string): string {
  const payload: AdminPayload = { role: 'admin', user }
  return jwt.sign(payload, getSecret(), { expiresIn: '8h' })
}

/** Sign a client JWT (24h expiry) */
export function signClientToken(
  email: string,
  name: string,
  company: string,
  clientePattern: string
): string {
  const payload: ClientPayload = { role: 'client', email, name, company, clientePattern }
  return jwt.sign(payload, getSecret(), { expiresIn: '24h' })
}

/** Sign a depot user JWT (12h expiry) */
export function signDepotToken(email: string, name: string, depotName: string): string {
  const payload: DepotPayload = { role: 'depot', email, name, depotName }
  return jwt.sign(payload, getSecret(), { expiresIn: '12h' })
}

/** Sign a transport user JWT (12h expiry) */
export function signTransportToken(email: string, name: string, transportName: string): string {
  const payload: TransportPayload = { role: 'transport', email, name, transportName }
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
