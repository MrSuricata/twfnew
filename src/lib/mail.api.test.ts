import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mailConfigured, sendMail } from '../../api/_lib/mail'

// El 02/09/2026 un email de bienvenida de partner salió por la plantilla de
// COTIZACIÓN de EmailJS (destinatario fijo = Brian, sin cuerpo) porque era el
// respaldo cuando faltaba EMAILJS_TEMPLATE_NOTIFICATION. Estos tests fijan la
// regla: sin plantilla propia, EmailJS NO se usa y el caller se entera.

const ENV = ['N8N_SEND_EMAIL_WEBHOOK', 'EMAILJS_SERVICE_ID', 'EMAILJS_PUBLIC_KEY', 'EMAILJS_PRIVATE_KEY', 'EMAILJS_TEMPLATE_NOTIFICATION', 'EMAILJS_TEMPLATE_QUOTE'] as const

describe('mailConfigured', () => {
  beforeEach(() => { for (const k of ENV) vi.stubEnv(k, '') })
  afterEach(() => vi.unstubAllEnvs())

  it('sin nada configurado → false', () => {
    expect(mailConfigured()).toBe(false)
  })

  it('EmailJS con service + key pero SOLO la plantilla de cotización → false', () => {
    vi.stubEnv('EMAILJS_SERVICE_ID', 'svc')
    vi.stubEnv('EMAILJS_PUBLIC_KEY', 'pub')
    vi.stubEnv('EMAILJS_TEMPLATE_QUOTE', 'tpl_quote')
    expect(mailConfigured()).toBe(false)
  })

  it('EmailJS con su plantilla de notificación → true', () => {
    vi.stubEnv('EMAILJS_SERVICE_ID', 'svc')
    vi.stubEnv('EMAILJS_PUBLIC_KEY', 'pub')
    vi.stubEnv('EMAILJS_TEMPLATE_NOTIFICATION', 'tpl_notif')
    expect(mailConfigured()).toBe(true)
  })

  it('n8n alcanza solo', () => {
    vi.stubEnv('N8N_SEND_EMAIL_WEBHOOK', 'https://n8n.example/webhook')
    expect(mailConfigured()).toBe(true)
  })
})

describe('sendMail sin plantilla de notificación', () => {
  beforeEach(() => { for (const k of ENV) vi.stubEnv(k, '') })
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

  it('NO llama a EmailJS con la plantilla de cotización y devuelve not-configured', async () => {
    vi.stubEnv('EMAILJS_SERVICE_ID', 'svc')
    vi.stubEnv('EMAILJS_PUBLIC_KEY', 'pub')
    vi.stubEnv('EMAILJS_TEMPLATE_QUOTE', 'tpl_quote')
    const fetchMock = vi.fn(async () => { throw new Error('no debería llamar a ningún proveedor') })
    vi.stubGlobal('fetch', fetchMock)
    const r = await sendMail({ to: 'partner@deposito.com', subject: 'Bienvenido', html: '<p>hola</p>' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(r).toEqual({ ok: false, error: 'not-configured' })
  })

  it('faltan campos → missing-fields sin tocar la red', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const r = await sendMail({ to: '', subject: 'x', html: 'y' })
    expect(r).toEqual({ ok: false, error: 'missing-fields' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
