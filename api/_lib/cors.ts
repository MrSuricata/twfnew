import type { VercelRequest, VercelResponse } from '@vercel/node'

/** Set CORS headers on the response.
 * SECURITY: Never fallback to '*' — require ALLOWED_ORIGIN to be set in Vercel env vars. */
export function setCorsHeaders(res: VercelResponse) {
  const origin = process.env.ALLOWED_ORIGIN
  if (!origin) {
    console.warn('[CORS] ALLOWED_ORIGIN not set — using restrictive default')
  }
  res.setHeader('Access-Control-Allow-Origin', origin || 'https://twf.uy')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  // X-Client-Id: id de sesión del browser (para que el emisor ignore su propio
  // broadcast Realtime). Hay que permitirlo o el preflight CORS lo rebota.
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Id')
}

/** Handle CORS preflight — returns true if it was an OPTIONS request (already handled) */
export function handleCors(req: VercelRequest, res: VercelResponse): boolean {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return true
  }
  return false
}
