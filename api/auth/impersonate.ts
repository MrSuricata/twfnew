import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest, signClientToken, auditUser } from '../_lib/jwt.js'
import { handleCors } from '../_lib/cors.js'
import { getSupabase } from '../_lib/supabase.js'

// ─── Types ──────────────────────────────────────────────────────────
interface ClientConfig {
  email: string
  name: string
  company: string
  clientePattern: string
}

// ─── Get clients from env var + Supabase (mirrors otp.ts) ───────────
function getClientsFromEnv(): ClientConfig[] {
  const raw = process.env.CLIENTS_JSON
  if (!raw) return []
  try {
    return JSON.parse(raw)
  } catch {
    console.error('Invalid CLIENTS_JSON env var')
    return []
  }
}

async function getClients(): Promise<ClientConfig[]> {
  const envClients = getClientsFromEnv()
  try {
    const db = getSupabase()
    const { data, error } = await db.from('clients').select('*')
    if (!error && data) {
      const dbClients: ClientConfig[] = data.map((c: any) => ({
        email: c.email,
        name: c.name,
        company: c.company || '',
        clientePattern: c.cliente_pattern || '',
      }))

      const merged = new Map<string, ClientConfig>()
      for (const c of envClients) merged.set(c.email.toLowerCase().trim(), c)
      for (const c of dbClients) merged.set(c.email.toLowerCase().trim(), c)
      return Array.from(merged.values())
    }
  } catch (err) {
    console.warn('Failed to fetch clients from Supabase:', err)
  }

  return envClients
}

// ─── Handler ────────────────────────────────────────────────────────
// Admin-only endpoint. Given a client email, returns a valid client session
// token — identical shape to /api/auth/otp verify — without requiring OTP.
// Used by admin to "view portal as client X" for debugging / QA.
// ─────────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Require admin token
  const payload = authenticateRequest(req.headers.authorization)
  if (!payload || payload.role !== 'admin') {
    return res.status(401).json({ error: 'Admin authentication required' })
  }
  // Solo el OWNER puede "ver el portal como cliente". Un admin acotado NO debe
  // poder impersonar a cualquier cliente (saltaría el scoping por cartera y
  // obtendría un token con el clientePattern completo de ese cliente, sin OTP).
  // Tokens viejos sin level = owner (back-compat, mismo criterio que isOwner).
  if (payload.level === 'admin') {
    return res.status(403).json({ error: 'Solo el owner puede ver el portal como cliente.' })
  }

  const { email } = req.body || {}
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email required' })
  }

  const normalizedEmail = email.toLowerCase().trim()

  // Validate client exists (env + Supabase)
  const clients = await getClients()
  const client = clients.find(c => c.email.toLowerCase().trim() === normalizedEmail)

  if (!client) {
    return res.status(404).json({ error: 'Cliente no encontrado' })
  }

  // Audit trail (best-effort) — queda registrado en audit_log quién impersonó a
  // quién (antes era solo un console.info que no dejaba rastro auditable).
  try {
    getSupabase().from('audit_log').insert({
      usuario: auditUser(payload),
      action: 'impersonar',
      entity: 'clients',
      ref: normalizedEmail,
      details: { by: payload.user },
    }).then(() => {}, (e: any) => console.warn('[impersonate audit] failed:', e?.message))
  } catch (e: any) {
    console.warn('[impersonate audit] failed:', e?.message)
  }

  // Sign client JWT (identical to OTP verify flow)
  const token = signClientToken(
    client.email,
    client.name,
    client.company,
    client.clientePattern
  )

  return res.status(200).json({
    token,
    role: 'client',
    email: client.email,
    name: client.name,
    company: client.company,
  })
}
