import type { VercelRequest, VercelResponse } from '@vercel/node'

/** Set CORS headers on the response */
export function setCorsHeaders(res: VercelResponse) {
  const origin = process.env.ALLOWED_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
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
