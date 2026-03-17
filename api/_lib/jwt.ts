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

export type TokenPayload = AdminPayload | ClientPayload

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
