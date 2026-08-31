import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from '../_lib/supabase.js'
import { validate, QuoteSubmitSchema } from '../_lib/schemas.js'
import { checkRateLimitWithConfig } from '../_lib/rateLimiter.js'
import { pickOrigin } from '../_lib/cors.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ALLOWED_ORIGIN admite varios origenes separados por coma: durante una
  // mudanza de dominio conviven el nuevo y el .vercel.app viejo.
  const allowedOrigin = pickOrigin(typeof req.headers.origin === 'string' ? req.headers.origin : undefined)
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // ── Turnstile captcha verification (server-side) ──
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY
    if (!turnstileSecret) {
      console.error('[quotes/submit] TURNSTILE_SECRET_KEY not set')
      return res.status(500).json({ error: 'Server misconfigured' })
    }
    const turnstileToken = req.body?.turnstileToken
    if (!turnstileToken || typeof turnstileToken !== 'string') {
      return res.status(400).json({ error: 'Captcha requerido' })
    }
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket?.remoteAddress
      || 'unknown'
    const tsParams = new URLSearchParams()
    tsParams.set('secret', turnstileSecret)
    tsParams.set('response', turnstileToken)
    tsParams.set('remoteip', ip)
    let tsOk = false
    let tsErrorCodes: string[] = []
    let tsHostname: string | undefined
    try {
      const tsRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: tsParams,
      })
      const tsData: any = await tsRes.json().catch(() => ({}))
      tsOk = tsData?.success === true
      tsErrorCodes = Array.isArray(tsData?.['error-codes']) ? tsData['error-codes'] : []
      tsHostname = tsData?.hostname
      // Always log verify outcome for diagnostics. success case: ok + hostname.
      // failure: error codes — usual suspects are 'timeout-or-duplicate',
      // 'hostname-not-allowed', 'invalid-input-response', 'invalid-input-secret'.
      console.warn('[quotes/submit] Turnstile verify result:', JSON.stringify({
        ok: tsOk,
        errorCodes: tsErrorCodes,
        hostname: tsHostname,
        ip,
      }))
    } catch (e) {
      console.error('[quotes/submit] Turnstile verify fetch failed:', e)
    }
    if (!tsOk) {
      return res.status(400).json({
        error: 'Captcha inválido',
        errorCodes: tsErrorCodes,
      })
    }

    // ── Rate limit: 3 submits / hour / IP, block 24h on breach ──
    const { limited } = await checkRateLimitWithConfig(`quote:${ip}`, 3, 60 * 60_000, 24 * 60 * 60_000)
    if (limited) return res.status(429).json({ error: 'Demasiadas solicitudes de cotización. Probá mañana.' })

    const v = validate(QuoteSubmitSchema, req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const { name, email, phone, cargoType, origin, destination, details, language } = v.data

    // Generate a unique ID for this quote
    const quoteId = `q-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

    // Save quote to Supabase
    let dbSaved = false
    try {
      const db = getSupabase()
      const { error } = await db.from('quotes').insert({
        id: quoteId,
        name,
        email,
        phone: phone || '',
        cargo_type: cargoType,
        origin: origin || '',
        destination: destination || '',
        details: details || '',
        timestamp: Date.now(),
        status: 'pending',
        notes: [],
        language: language || 'es',
      })
      if (!error) dbSaved = true
      else console.warn('Supabase quote save warning:', error.message)
    } catch (dbError) {
      console.warn('Failed to save quote to Supabase:', dbError)
    }

    // Send email via EmailJS REST API
    const serviceId = process.env.EMAILJS_SERVICE_ID
    const templateId = process.env.EMAILJS_TEMPLATE_QUOTE || process.env.EMAILJS_TEMPLATE_OTP
    const publicKey = process.env.EMAILJS_PUBLIC_KEY
    const privateKey = process.env.EMAILJS_PRIVATE_KEY
    const toEmail = process.env.QUOTE_TO_EMAIL || 'bridvanovich@twf.uy'

    let emailSent = false

    if (serviceId && templateId && publicKey) {
      try {
        const body: Record<string, unknown> = {
          service_id: serviceId,
          template_id: templateId,
          user_id: publicKey,
          template_params: {
            to_email: toEmail,
            name: name,
            from_name: name,
            email: email,
            from_email: email,
            phone: phone || 'No proporcionado',
            cargo_type: cargoType,
            origin: origin || 'No especificado',
            destination: destination || 'No especificado',
            details: details || 'Sin detalles adicionales',
            date: new Date().toLocaleDateString('es-UY', { year: 'numeric', month: 'long', day: 'numeric' }),
            language: language || 'es',
            message: `Nueva cotización de ${name} (${email})\n\nTipo: ${cargoType}\nOrigen: ${origin || '-'}\nDestino: ${destination || '-'}\nTeléfono: ${phone || '-'}\n\nDetalles:\n${details || 'Sin detalles'}`,
            subject: `Nueva cotización - ${name} - ${cargoType}`
          }
        }
        // Private key needed for server-side sends
        if (privateKey) {
          body.accessToken = privateKey
        }

        const emailResponse = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        emailSent = emailResponse.ok
        if (!emailResponse.ok) {
          console.error('EmailJS quote error:', await emailResponse.text())
        }
      } catch (emailError) {
        console.error('EmailJS send error:', emailError)
      }
    } else {
      console.warn('EmailJS not configured for quotes')
    }

    // ── Telegram instant alert (best-effort) ──
    // Optional. Set TELEGRAM_BOT_TOKEN + TELEGRAM_QUOTE_CHAT_ID in Vercel env
    // to enable. Failures here never block the response — the quote is already
    // saved + emailed by this point.
    const tgToken = process.env.TELEGRAM_BOT_TOKEN
    const tgChatId = process.env.TELEGRAM_QUOTE_CHAT_ID
    if (tgToken && tgChatId) {
      const tgText = [
        '🆕 *Nueva cotización TWF*',
        '',
        `*${name}* (${email})`,
        phone ? `📲 ${phone}` : null,
        '',
        `🚢 ${cargoType}`,
        origin ? `📍 ${origin} → ${destination || '?'}` : (destination ? `📍 → ${destination}` : null),
        details ? '' : null,
        details ? `_${details.slice(0, 400)}${details.length > 400 ? '…' : ''}_` : null,
        '',
        `↗️ Ver: https://transitworldforwarding.vercel.app/admin (tab Cotizaciones)`,
      ].filter(Boolean).join('\n')

      fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: tgChatId,
          text: tgText,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
      })
        .then(r => {
          if (!r.ok) console.warn('[quotes/submit] Telegram alert failed:', r.status)
        })
        .catch(err => console.warn('[quotes/submit] Telegram alert error:', err))
    }

    return res.status(200).json({
      sent: emailSent,
      saved: dbSaved,
      quoteId,
      message: !emailSent && !dbSaved
        ? 'Quote could not be saved or emailed'
        : !emailSent
          ? 'Quote saved but email not sent'
          : 'Quote saved and email sent',
    })
  } catch (error: any) {
    console.error('Quote submit error:', error?.message || error)
    return res.status(200).json({ sent: false, saved: false, message: 'Quote processing failed' })
  }
}
