// ─── Server-side email helper ───────────────────────────────────────
// Unified mail sender. Tries n8n webhook first (supports raw HTML body),
// falls back to EmailJS notification template (which expects `message` param
// holding an HTML string). Both paths are fire-and-forget friendly: this
// helper never throws — it returns { ok, error } instead.
//
// Env vars:
//   N8N_SEND_EMAIL_WEBHOOK          (preferred — supports arbitrary HTML)
//   EMAILJS_SERVICE_ID
//   EMAILJS_TEMPLATE_NOTIFICATION   (required for EmailJS fallback — a template
//                                    with {{to_email}}, {{subject}}, {{{message}}})
//   EMAILJS_PUBLIC_KEY
//   EMAILJS_PRIVATE_KEY             (optional, required for server-side sends)
//
// If NO provider is configured, the helper logs a warning and returns
// { ok: false, error: 'not-configured' } — it does NOT crash the caller.
//
// NUNCA se usa la plantilla de cotización (EMAILJS_TEMPLATE_QUOTE) como
// respaldo: esa plantilla tiene el destinatario FIJO (Brian) y no muestra
// `message`. El 02/09/2026 el email de bienvenida de un acceso de partner
// salió por ahí y Brian recibió una "Nueva Cotización TWF - Mediterranea
// Carghas" vacía; el partner no recibió nada. Sin plantilla propia, el mail
// no se manda y el caller lo sabe (mailConfigured / result.error).

export interface SendMailOptions {
  to: string
  subject: string
  html: string
  from?: string
  replyTo?: string
}

export interface SendMailResult {
  ok: boolean
  method?: 'n8n' | 'emailjs'
  error?: string
}

async function sendViaN8n(opts: SendMailOptions): Promise<boolean> {
  const webhook = process.env.N8N_SEND_EMAIL_WEBHOOK
  if (!webhook) return false
  try {
    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: opts.to,
        subject: opts.subject,
        htmlBody: opts.html,
        replyTo: opts.replyTo || opts.from,
      }),
    })
    if (!r.ok) console.warn(`[mail/n8n] HTTP ${r.status}`)
    return r.ok
  } catch (err) {
    console.warn('[mail/n8n] error:', err)
    return false
  }
}

/** Hay un proveedor de mail transaccional utilizable: n8n, o EmailJS con SU
 *  plantilla de notificación (la de cotización no cuenta). Sirve para que el
 *  caller le avise al admin que el mail NO va a salir. */
export function mailConfigured(): boolean {
  if (process.env.N8N_SEND_EMAIL_WEBHOOK) return true
  return !!process.env.EMAILJS_SERVICE_ID && !!process.env.EMAILJS_PUBLIC_KEY && !!process.env.EMAILJS_TEMPLATE_NOTIFICATION
}

async function sendViaEmailJS(opts: SendMailOptions): Promise<boolean> {
  const serviceId = process.env.EMAILJS_SERVICE_ID
  const templateId = process.env.EMAILJS_TEMPLATE_NOTIFICATION
  const publicKey = process.env.EMAILJS_PUBLIC_KEY
  const privateKey = process.env.EMAILJS_PRIVATE_KEY
  if (!serviceId || !publicKey) return false
  if (!templateId) {
    console.warn('[mail/emailjs] EMAILJS_TEMPLATE_NOTIFICATION no configurada: el mail NO se manda (no se usa la plantilla de cotización — destinatario fijo y sin cuerpo)')
    return false
  }
  try {
    const body: Record<string, unknown> = {
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: {
        to_email: opts.to,
        email: opts.to,
        subject: opts.subject,
        message: opts.html,
        from_name: opts.from || 'TWF - Transit World Forwarding',
      },
    }
    if (privateKey) body.accessToken = privateKey
    const r = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) console.warn(`[mail/emailjs] HTTP ${r.status}:`, await r.text())
    return r.ok
  } catch (err) {
    console.warn('[mail/emailjs] error:', err)
    return false
  }
}

export async function sendMail(opts: SendMailOptions): Promise<SendMailResult> {
  if (!opts.to || !opts.subject || !opts.html) {
    return { ok: false, error: 'missing-fields' }
  }

  // Try n8n first (supports raw HTML). Falls back to EmailJS.
  const n8nOk = await sendViaN8n(opts)
  if (n8nOk) return { ok: true, method: 'n8n' }

  const ejsOk = await sendViaEmailJS(opts)
  if (ejsOk) return { ok: true, method: 'emailjs' }

  // No provider worked. Silent no-op with warning — do NOT throw.
  if (!mailConfigured()) {
    console.warn('[mail] No email provider configured (N8N_SEND_EMAIL_WEBHOOK, or EMAILJS_SERVICE_ID + EMAILJS_PUBLIC_KEY + EMAILJS_TEMPLATE_NOTIFICATION)')
    return { ok: false, error: 'not-configured' }
  }
  return { ok: false, error: 'send-failed' }
}
