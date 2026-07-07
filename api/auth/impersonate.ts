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
  aliases?: string
}

/** Patrón efectivo: el guardado, o derivado de name+aliases (tokens ≥4 chars).
 *  Espejo de deriveClientePattern en src/lib/clientCatalog.ts y de
 *  effectiveClientePattern en admin-login.ts — mantener en sync. */
function effectivePattern(c: ClientConfig): string {
  const stored = (c.clientePattern || '').trim()
  if (stored) return stored
  const parts = [String(c.name || '').replace(/,/g, ' '), ...String(c.aliases || '').split(',')]
    .map(p => p.replace(/\s+/g, ' ').trim().toUpperCase())
    .filter(p => p.length >= 4)
  return Array.from(new Set(parts)).join(',')
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
// token — identical shape to the client login response — without password.
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

  const { email, id } = req.body || {}
  if ((!email || typeof email !== 'string') && (!id || typeof id !== 'string')) {
    return res.status(400).json({ error: 'Email or id required' })
  }

  // Por id: lookup directo en la tabla (los clientes del catálogo pueden no
  // tener email de contacto). Por email: flujo histórico (env + Supabase).
  let client: ClientConfig | undefined
  if (id && typeof id === 'string') {
    try {
      const db = getSupabase()
      const { data } = await db.from('clients').select('*').eq('id', id).maybeSingle()
      if (data) {
        client = {
          email: data.email || '',
          name: data.name,
          company: data.company || '',
          clientePattern: data.cliente_pattern || '',
          aliases: data.aliases || '',
        }
      }
    } catch (err) {
      console.warn('Failed to fetch client by id:', err)
    }
  } else {
    const normalizedEmail = String(email).toLowerCase().trim()
    const clients = await getClients()
    client = clients.find(c => (c.email || '').toLowerCase().trim() === normalizedEmail)
  }

  if (!client) {
    return res.status(404).json({ error: 'Cliente no encontrado' })
  }
  // Puede quedar vacío si el cliente del catálogo no tiene email de contacto —
  // el portal identifica por nombre/empresa, el email del token es informativo.
  const normalizedEmail = (client.email || '').toLowerCase().trim()

  // Audit trail (best-effort) — queda registrado en audit_log quién impersonó a
  // quién (antes era solo un console.info que no dejaba rastro auditable).
  try {
    getSupabase().from('audit_log').insert({
      usuario: auditUser(payload),
      action: 'impersonar',
      entity: 'clients',
      ref: normalizedEmail || client.name,
      details: { by: payload.user },
    }).then(() => {}, (e: any) => console.warn('[impersonate audit] failed:', e?.message))
  } catch (e: any) {
    console.warn('[impersonate audit] failed:', e?.message)
  }

  // Sign client JWT (misma forma que el login por contraseña; sin uid — el
  // token de impersonate valida solo firma en verify-session).
  const token = signClientToken(
    normalizedEmail,
    client.name,
    client.company || client.name,
    effectivePattern(client)
  )

  return res.status(200).json({
    token,
    role: 'client',
    email: client.email,
    name: client.name,
    company: client.company,
  })
}
