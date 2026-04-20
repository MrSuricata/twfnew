import type { VercelRequest, VercelResponse } from '@vercel/node'
import { generateOTP, storeOTP, verifyOTP } from '../_lib/otpStore.js'
import { signClientToken } from '../_lib/jwt.js'
import { getSupabase } from '../_lib/supabase.js'
import { validate, OtpRequestSchema, OtpVerifySchema } from '../_lib/schemas.js'

// ─── Types ──────────────────────────────────────────────────────────
interface ClientConfig {
  email: string
  name: string
  company: string
  clientePattern: string
}

// ─── Rate limiting (Supabase-backed, survives across Lambda instances) ──
import { checkRateLimit } from '../_lib/rateLimiter.js'

// ─── In-memory per-email OTP cooldown (1 request per minute) ────────
// Prevents OTP spam/cost abuse. Best-effort: resets per Lambda instance,
// Supabase-backed limiter below covers abuse across instances.
const otpRateLimit = new Map<string, number>() // email → lastRequestTs
const OTP_COOLDOWN_MS = 60_000 // 1 minuto entre requests

// ─── EmailJS server-side send ───────────────────────────────────────
async function sendOTPEmail(email: string, code: string): Promise<boolean> {
  const serviceId = process.env.EMAILJS_SERVICE_ID
  const templateId = process.env.EMAILJS_TEMPLATE_OTP
  const publicKey = process.env.EMAILJS_PUBLIC_KEY
  const privateKey = process.env.EMAILJS_PRIVATE_KEY // Required for server-side sends

  if (!serviceId || !templateId || !publicKey) {
    console.error('EmailJS env vars not configured')
    return false
  }

  try {
    // Build request body — accessToken (private key) is needed for server-side
    const body: Record<string, unknown> = {
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: {
        email,
        to_email: email,
        otp_code: code,
        passcode: code,
        time: '10 minutos',
      },
    }

    // Private key authenticates server-side requests
    if (privateKey) {
      body.accessToken = privateKey
    }

    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error(`EmailJS OTP error (${res.status}):`, errText)
    }

    return res.ok
  } catch (err) {
    console.error('EmailJS send error:', err)
    return false
  }
}

// ─── Get clients from env var + Supabase ────────────────────────────
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
  // Start with env var clients
  const envClients = getClientsFromEnv()

  // Also fetch from Supabase (admin-added clients)
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

      // Merge: DB clients override env clients for same email
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
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startedAt = Date.now()
  const MIN_RESPONSE_MS = 400 // equalize timing to prevent email enumeration

  /**
   * Send a JSON response, ensuring total handler time is ≥ MIN_RESPONSE_MS.
   * This prevents side-channel email enumeration via response timing.
   */
  const sendResponse = async (status: number, body: any) => {
    const elapsed = Date.now() - startedAt
    const wait = Math.max(0, MIN_RESPONSE_MS - elapsed)
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    return res.status(status).json(body)
  }

  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://twf.uy'
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  // OPTIONS can short-circuit without timing equalization (no sensitive data)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return sendResponse(405, { error: 'Method not allowed' })

  const action = req.body?.action
  if (action !== 'request' && action !== 'verify') {
    return sendResponse(400, { error: 'Invalid action. Use "request" or "verify".' })
  }

  // ── ACTION: REQUEST OTP ─────────────────────────────────────────
  if (action === 'request') {
    const v = validate(OtpRequestSchema, req.body)
    if (!v.ok) return sendResponse(400, { error: v.error })
    const normalizedEmail = v.data.email.toLowerCase().trim()

    // Per-IP rate limit (in addition to per-email) — blocks email bombing
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown'
    const ipLimit = await checkRateLimit(`otp-ip:${ip}`)
    if (ipLimit.limited) {
      return sendResponse(429, { error: 'Demasiadas solicitudes. Reintentá más tarde.' })
    }

    // In-memory cooldown (1 req/min per email). Silent response to preserve
    // anti-enumeration — do not send email, do not persist OTP.
    const now = Date.now()
    const lastRequest = otpRateLimit.get(normalizedEmail) || 0
    if (now - lastRequest < OTP_COOLDOWN_MS) {
      return sendResponse(200, { sent: true })
    }
    otpRateLimit.set(normalizedEmail, now)

    // Opportunistic cleanup of stale entries (>1h old)
    if (otpRateLimit.size > 100) {
      const cutoff = now - 3600_000
      for (const [k, v] of otpRateLimit) {
        if (v < cutoff) otpRateLimit.delete(k)
      }
    }

    // Rate limit (Supabase-backed)
    const { limited, retryAfterMs } = await checkRateLimit(`otp:${normalizedEmail}`)
    if (limited) {
      const retryMin = Math.ceil((retryAfterMs || 0) / 60000)
      return sendResponse(429, { error: `Demasiadas solicitudes. Reintentá en ${retryMin} minutos.` })
    }

    // Validate client exists (checks env var + Supabase)
    const clients = await getClients()
    const client = clients.find(c => c.email.toLowerCase().trim() === normalizedEmail)

    if (!client) {
      // Don't reveal if email exists or not (timing-safe via sendResponse)
      return sendResponse(200, { sent: true })
    }

    // Generate and store OTP (async — Supabase backed)
    const otpCode = generateOTP()
    await storeOTP(normalizedEmail, otpCode)

    // Send email
    const sent = await sendOTPEmail(normalizedEmail, otpCode)

    if (!sent) {
      return sendResponse(500, { error: 'Error al enviar el código' })
    }

    return sendResponse(200, { sent: true })
  }

  // ── ACTION: VERIFY OTP ──────────────────────────────────────────
  if (action === 'verify') {
    const v = validate(OtpVerifySchema, req.body)
    if (!v.ok) return sendResponse(400, { error: v.error })
    const normalizedEmail = v.data.email.toLowerCase().trim()
    const code = v.data.code

    const valid = await verifyOTP(normalizedEmail, code)

    if (!valid) {
      return sendResponse(401, { error: 'Código inválido o expirado' })
    }

    // Find client to include in JWT (checks env var + Supabase)
    const clients = await getClients()
    const client = clients.find(c => c.email.toLowerCase().trim() === normalizedEmail)

    if (!client) {
      return sendResponse(401, { error: 'Cliente no encontrado' })
    }

    // Sign JWT
    const token = signClientToken(
      client.email,
      client.name,
      client.company,
      client.clientePattern
    )

    return sendResponse(200, {
      token,
      role: 'client',
      email: client.email,
      name: client.name,
      company: client.company,
    })
  }

  return sendResponse(400, { error: 'Invalid action. Use "request" or "verify".' })
}
