/**
 * Email reply templates for the public quote form.
 *
 * The QuotesManagement detail panel uses these to pre-populate a mailto: link
 * in the client's language. The body is plain text (no HTML) because mailto
 * doesn't reliably render HTML across mail clients.
 *
 * Each template has:
 *  - subject: short, includes cargo type
 *  - greeting: language-appropriate
 *  - bodyTop: 1-2 lines acknowledging receipt + recap of the request
 *  - bodyMiddle: a "respuesta sugerida" placeholder block — bullet points
 *    pre-formatted for the operator to fill in (rates, transit time, etc.)
 *  - signature: TWF brand block
 */

import type { QuoteFormData } from './quotationTypes'

const SIGNATURE = `
─────────────────────────
Brian Ridvanovich
Transit World Forwarding
✉  bridvanovich@twf.uy
🌐 transitworldforwarding.vercel.app
─────────────────────────`

interface TemplateLabels {
  subject: (cargoType: string) => string
  greeting: (name: string) => string
  recapIntro: string
  recapType: string
  recapOrigin: string
  recapDest: string
  recapDetails: string
  responseHeader: string
  bullets: string[]
  closing: string
  notProvided: string
}

const T: Record<'es' | 'en' | 'pt', TemplateLabels> = {
  es: {
    subject: cargo => `Cotización TWF — ${cargo || 'Consulta de flete'}`,
    greeting: name => `Hola ${name || ''},`.trim(),
    recapIntro: 'Gracias por tu consulta. Te confirmamos los datos que recibimos:',
    recapType: 'Tipo de carga',
    recapOrigin: 'Origen',
    recapDest: 'Destino',
    recapDetails: 'Detalle',
    responseHeader: 'Cotización propuesta:',
    bullets: [
      '• Flete:               USD ___',
      '• Tiempo de tránsito:  ___ días',
      '• Validez de la oferta: ___',
      '• Forma de pago:       ___',
      '• Observaciones:       ___',
    ],
    closing: 'Quedo a tu disposición para cualquier consulta.\n\nSaludos,',
    notProvided: 'no especificado',
  },
  en: {
    subject: cargo => `TWF Quote — ${cargo || 'Freight Inquiry'}`,
    greeting: name => `Hi ${name || ''},`.trim(),
    recapIntro: 'Thanks for reaching out. Here\'s a recap of your request:',
    recapType: 'Cargo type',
    recapOrigin: 'Origin',
    recapDest: 'Destination',
    recapDetails: 'Details',
    responseHeader: 'Proposed quote:',
    bullets: [
      '• Freight:           USD ___',
      '• Transit time:      ___ days',
      '• Validity:          ___',
      '• Payment terms:     ___',
      '• Notes:             ___',
    ],
    closing: 'Let me know if you have any questions.\n\nBest,',
    notProvided: 'not provided',
  },
  pt: {
    subject: cargo => `Cotação TWF — ${cargo || 'Consulta de frete'}`,
    greeting: name => `Olá ${name || ''},`.trim(),
    recapIntro: 'Obrigado pelo contato. Confirmamos os dados que recebemos:',
    recapType: 'Tipo de carga',
    recapOrigin: 'Origem',
    recapDest: 'Destino',
    recapDetails: 'Detalhe',
    responseHeader: 'Cotação proposta:',
    bullets: [
      '• Frete:              USD ___',
      '• Tempo de trânsito:  ___ dias',
      '• Validade:           ___',
      '• Forma de pagamento: ___',
      '• Observações:        ___',
    ],
    closing: 'Fico à disposição para qualquer dúvida.\n\nAtenciosamente,',
    notProvided: 'não informado',
  },
}

function pickLang(language: string | undefined): 'es' | 'en' | 'pt' {
  const l = (language || 'es').toLowerCase()
  if (l.startsWith('en')) return 'en'
  if (l.startsWith('pt')) return 'pt'
  return 'es'
}

export function buildQuoteReplyTemplate(quote: QuoteFormData): { subject: string; body: string } {
  const lang = pickLang(quote.language)
  const t = T[lang]
  const subject = t.subject(quote.cargoType)
  const recap = [
    `${t.recapType}:    ${quote.cargoType || t.notProvided}`,
    `${t.recapOrigin}:        ${quote.origin || t.notProvided}`,
    `${t.recapDest}:       ${quote.destination || t.notProvided}`,
    quote.details ? `${t.recapDetails}:       ${quote.details}` : null,
  ].filter(Boolean).join('\n')

  const body = [
    t.greeting(quote.name || ''),
    '',
    t.recapIntro,
    '',
    recap,
    '',
    t.responseHeader,
    ...t.bullets,
    '',
    t.closing,
    SIGNATURE,
  ].join('\n')

  return { subject, body }
}

/** mailto: link with subject + body URL-encoded. */
export function buildMailtoLink(quote: QuoteFormData): string {
  const { subject, body } = buildQuoteReplyTemplate(quote)
  const params = new URLSearchParams()
  params.set('subject', subject)
  params.set('body', body)
  return `mailto:${quote.email}?${params.toString()}`
}
