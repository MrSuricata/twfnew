import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from '../_lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { name, email, phone, cargoType, origin, destination, details, language } = req.body || {}

    if (!name || !email || !cargoType) {
      return res.status(400).json({ error: 'Name, email, and cargo type are required' })
    }

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
