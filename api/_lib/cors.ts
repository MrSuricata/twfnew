import type { VercelRequest, VercelResponse } from '@vercel/node'


/** Los origenes permitidos: ALLOWED_ORIGIN acepta varios separados por coma.
 *  Durante una mudanza de dominio conviven el nuevo y el .vercel.app viejo. */
export function allowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGIN || 'https://twf.uy')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)
}

/** Devuelve el origen del pedido si esta permitido; si no, el primero de la
 *  lista. Nunca '*': estas rutas mandan Authorization. */
export function pickOrigin(reqOrigin?: string): string {
  const lista = allowedOrigins()
  if (!process.env.ALLOWED_ORIGIN) {
    console.warn('[CORS] ALLOWED_ORIGIN not set — using restrictive default')
  }
  if (reqOrigin && lista.includes(reqOrigin)) return reqOrigin
  return lista[0]
}

/** Set CORS headers on the response.
 * SECURITY: Never fallback to '*' — require ALLOWED_ORIGIN to be set in Vercel env vars. */
export function setCorsHeaders(res: VercelResponse, reqOrigin?: string) {
  const origin = pickOrigin(reqOrigin)
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  // X-Client-Id: id de sesión del browser (para que el emisor ignore su propio
  // broadcast Realtime). Hay que permitirlo o el preflight CORS lo rebota.
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Id')
}

/** Handle CORS preflight — returns true if it was an OPTIONS request (already handled) */
export function handleCors(req: VercelRequest, res: VercelResponse): boolean {
  setCorsHeaders(res, typeof req.headers.origin === 'string' ? req.headers.origin : undefined)
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return true
  }
  return false
}
