import type { VercelRequest, VercelResponse } from '@vercel/node'

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

    // Send email via EmailJS REST API
    const serviceId = process.env.EMAILJS_SERVICE_ID
    const templateId = process.env.EMAILJS_TEMPLATE_QUOTE || process.env.EMAILJS_TEMPLATE_OTP
    const publicKey = process.env.EMAILJS_PUBLIC_KEY
    const toEmail = process.env.QUOTE_TO_EMAIL || 'bridvanovich@twf.uy'

    if (!serviceId || !templateId || !publicKey) {
      console.error('EmailJS not configured for quotes')
      // Still return success — quote is saved locally in the dashboard
      return res.status(200).json({ sent: false, saved: true, message: 'Quote saved but email not configured' })
    }

    const emailResponse = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: {
          to_email: toEmail,
          from_name: name,
          from_email: email,
          phone: phone || 'No proporcionado',
          cargo_type: cargoType,
          origin: origin || 'No especificado',
          destination: destination || 'No especificado',
          details: details || 'Sin detalles adicionales',
          language: language || 'es',
          // Common template vars
          message: `Nueva cotización de ${name} (${email})\n\nTipo: ${cargoType}\nOrigen: ${origin || '-'}\nDestino: ${destination || '-'}\nTeléfono: ${phone || '-'}\n\nDetalles:\n${details || 'Sin detalles'}`,
          subject: `Nueva cotización - ${name} - ${cargoType}`
        }
      })
    })

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text()
      console.error('EmailJS quote error:', errorText)
      return res.status(200).json({ sent: false, saved: true, message: 'Quote saved but email failed' })
    }

    return res.status(200).json({ sent: true, saved: true })
  } catch (error: any) {
    console.error('Quote submit error:', error?.message || error)
    return res.status(200).json({ sent: false, saved: true, message: 'Quote saved but email failed' })
  }
}
