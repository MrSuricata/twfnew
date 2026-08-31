import type { VercelRequest, VercelResponse } from '@vercel/node'
import { signAdminToken, signClientToken, signDepotToken, signTransportToken } from '../_lib/jwt.js'
import { checkRateLimit, clearRateLimit } from '../_lib/rateLimiter.js'
import { getSupabase } from '../_lib/supabase.js'
import { verifyPassword } from '../_lib/password.js'
import { validate, AdminLoginSchema, PartnerLoginSchema, ClientLoginSchema } from '../_lib/schemas.js'
import { pickOrigin } from '../_lib/cors.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  // ALLOWED_ORIGIN admite varios origenes separados por coma: durante una
  // mudanza de dominio conviven el nuevo y el .vercel.app viejo.
  const allowedOrigin = pickOrigin(typeof req.headers.origin === 'string' ? req.headers.origin : undefined)
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // Route to partner login if type === 'partner'
    if (req.body?.type === 'partner') {
      const vP = validate(PartnerLoginSchema, req.body)
      if (!vP.ok) return res.status(400).json({ error: vP.error })
      return handlePartnerLogin(req, res, { email: vP.data.email, password: vP.data.password })
    }

    // Route to client-portal login if type === 'client' (email+contraseña,
    // reemplaza el flujo OTP que nadie usaba).
    if (req.body?.type === 'client') {
      const vC = validate(ClientLoginSchema, req.body)
      if (!vC.ok) return res.status(400).json({ error: vC.error })
      return handleClientLogin(req, res, { email: vC.data.email, password: vC.data.password })
    }

    const v = validate(AdminLoginSchema, req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const { username, password } = v.data

    // Rate limiting by IP
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket?.remoteAddress
      || 'unknown'
    const rateLimitKey = `admin-login:${ip}`

    const { limited, retryAfterMs } = await checkRateLimit(rateLimitKey)
    if (limited) {
      const retryMinutes = Math.ceil((retryAfterMs || 0) / 60000)
      res.setHeader('Retry-After', String(Math.ceil((retryAfterMs || 0) / 1000)))
      return res.status(429).json({
        error: `Demasiados intentos. Reintentá en ${retryMinutes} minutos.`,
      })
    }

    const adminUser = process.env.ADMIN_USER
    const adminPassHash = process.env.ADMIN_PASS_HASH

    if (!adminUser || !adminPassHash) {
      console.error('ADMIN_USER or ADMIN_PASS_HASH not configured')
      return res.status(500).json({ error: 'Server configuration error' })
    }

    // 1) Owner (Brian): credenciales por env vars, como siempre.
    if (username.toLowerCase() === adminUser.toLowerCase()) {
      const passwordOk = await verifyPassword(password, adminPassHash)
      if (!passwordOk) return res.status(401).json({ error: 'Invalid credentials' })
      await clearRateLimit(rateLimitKey)
      const token = signAdminToken(username, username, 'owner')
      return res.status(200).json({ token, role: 'admin', user: username, name: username, level: 'owner' })
    }

    // 2) Usuario individual del equipo (tabla admin_users, login por email).
    const db = getSupabase()
    const { data: teamUser } = await db
      .from('admin_users')
      .select('*')
      .eq('email', username.toLowerCase().trim())
      .eq('active', true)
      .maybeSingle()

    if (!teamUser) return res.status(401).json({ error: 'Invalid credentials' })
    const passwordOk = await verifyPassword(password, teamUser.password_hash)
    if (!passwordOk) return res.status(401).json({ error: 'Invalid credentials' })

    await clearRateLimit(rateLimitKey)
    db.from('admin_users').update({ last_login: new Date().toISOString() }).eq('id', teamUser.id)
      .then(() => {}, () => {}) // best-effort, no bloquea el login

    const level = teamUser.level === 'owner' ? 'owner' : 'admin'
    const token = signAdminToken(teamUser.email, teamUser.name || teamUser.email, level, teamUser.cliente_pattern, teamUser.home_area)
    return res.status(200).json({ token, role: 'admin', user: teamUser.email, name: teamUser.name, level, homeArea: teamUser.home_area || null })
  } catch (error: any) {
    console.error('Admin login error:', error?.message || error, error?.stack)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

// ── Partner login (depot/transport) ─────────────────────────────────
// Called when body has { email, password, type: 'partner' }
async function handlePartnerLogin(req: VercelRequest, res: VercelResponse, body: { email: string; password: string }) {
  const { email, password } = body

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown'
  const { limited } = await checkRateLimit(`partner-login:${ip}`)
  if (limited) return res.status(429).json({ error: 'Demasiados intentos' })

  const db = getSupabase()
  const { data: user, error: dbError } = await db
    .from('partner_users')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .eq('active', true)
    .single()

  if (dbError || !user) return res.status(401).json({ error: 'Credenciales inválidas' })

  const passwordOk = await verifyPassword(password, user.password_hash)
  if (!passwordOk) return res.status(401).json({ error: 'Credenciales inválidas' })

  await clearRateLimit(`partner-login:${ip}`)

  let token: string
  if (user.role === 'depot') {
    token = signDepotToken(user.email, user.name, user.filter_value)
  } else if (user.role === 'transport') {
    token = signTransportToken(user.email, user.name, user.filter_value)
  } else {
    return res.status(400).json({ error: 'Invalid role' })
  }

  return res.status(200).json({
    token, role: user.role, email: user.email, name: user.name, filterValue: user.filter_value,
  })
}

// ── Client-portal login (client_users, email + contraseña) ──────────
// Called when body has { email, password, type: 'client' }. Respuestas de
// error SIEMPRE genéricas (no revelar si el email existe).

/** Patrón efectivo del cliente: cliente_pattern guardado, o derivado de
 *  name+aliases (tokens ≥4 chars unidos por coma). Espejo de
 *  deriveClientePattern en src/lib/clientCatalog.ts — mantener en sync. */
function effectiveClientePattern(client: { name?: string; aliases?: string | null; cliente_pattern?: string | null }): string {
  const stored = (client.cliente_pattern || '').trim()
  if (stored) return stored
  const parts = [String(client.name || '').replace(/,/g, ' '), ...String(client.aliases || '').split(',')]
    .map(p => p.replace(/\s+/g, ' ').trim().toUpperCase())
    .filter(p => p.length >= 4)
  return Array.from(new Set(parts)).join(',')
}

async function handleClientLogin(req: VercelRequest, res: VercelResponse, body: { email: string; password: string }) {
  const genericError = 'Usuario o contraseña incorrectos'
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown'
  const rateLimitKey = `client-login:${ip}`
  const { limited, retryAfterMs } = await checkRateLimit(rateLimitKey)
  if (limited) {
    const retryMinutes = Math.ceil((retryAfterMs || 0) / 60000) || 1
    res.setHeader('Retry-After', String(Math.ceil((retryAfterMs || 0) / 1000)))
    return res.status(429).json({ error: `Demasiados intentos. Reintentá en ${retryMinutes} minutos.` })
  }

  const db = getSupabase()
  const { data: user } = await db
    .from('client_users')
    .select('*')
    .eq('email', body.email.toLowerCase().trim())
    .eq('active', true)
    .maybeSingle()
  if (!user) return res.status(401).json({ error: genericError })

  const passwordOk = await verifyPassword(body.password, user.password_hash)
  if (!passwordOk) return res.status(401).json({ error: genericError })

  const { data: client } = await db
    .from('clients')
    .select('id, name, company, aliases, cliente_pattern')
    .eq('id', user.client_id)
    .maybeSingle()
  // Usuario huérfano (cliente borrado): mismo error genérico, sin filtrar nada.
  if (!client) return res.status(401).json({ error: genericError })

  await clearRateLimit(rateLimitKey)
  db.from('client_users').update({ last_login: new Date().toISOString() }).eq('id', user.id)
    .then(() => {}, () => {}) // best-effort, no bloquea el login

  const name = (user.name || '').trim() || client.name
  const company = (client.company || '').trim() || client.name
  const token = signClientToken(user.email, name, company, effectiveClientePattern(client), user.id)
  return res.status(200).json({ token, role: 'client', email: user.email, name, company })
}
