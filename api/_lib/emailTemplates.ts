// ─── Email templates ─────────────────────────────────────────────────
// HTML bodies for transactional TWF emails. Inline-CSS, table-based
// layout (max 600px) for broad email-client compatibility.

const BASE_URL = process.env.BASE_URL || 'https://twf.uy'
const BRAND_PRIMARY = '#1a3a5c' // TWF navy
const BRAND_ACCENT = '#d97706'  // TWF amber
const TEXT = '#1f2937'
const MUTED = '#6b7280'
const BG = '#f4f6f9'

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function wrap(inner: string, previewText: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TWF</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${TEXT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(previewText)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <tr>
        <td style="background:${BRAND_PRIMARY};padding:20px 32px;">
          <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">TWF</div>
          <div style="color:#cbd5e1;font-size:12px;margin-top:2px;">Transit World Forwarding</div>
        </td>
      </tr>
      <tr><td style="padding:32px;">${inner}</td></tr>
      <tr>
        <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;font-size:12px;color:${MUTED};line-height:1.6;">
          <strong style="color:${TEXT};">TWF — Transit World Forwarding</strong><br>
          Contacto: <a href="mailto:info@twf.uy" style="color:${BRAND_PRIMARY};text-decoration:none;">info@twf.uy</a> · <a href="${BASE_URL}" style="color:${BRAND_PRIMARY};text-decoration:none;">twf.uy</a>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr><td style="background:${BRAND_ACCENT};border-radius:6px;">
    <a href="${href}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none;">${escapeHtml(label)}</a>
  </td></tr>
</table>`
}

// ─── Welcome: Client ────────────────────────────────────────────────
export function welcomeClientEmail(opts: { name: string; email: string }): { subject: string; html: string } {
  const firstName = (opts.name || '').split(' ')[0] || opts.name || 'Cliente'
  const portalUrl = `${BASE_URL}/portal`
  const inner = `
    <h1 style="margin:0 0 16px;font-size:22px;color:${TEXT};">Hola ${escapeHtml(firstName)},</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${TEXT};">
      Te damos la bienvenida al <strong>portal de clientes de TWF</strong>.
    </p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${TEXT};">
      Desde el portal vas a poder seguir el estado de tus cargas en tiempo real, acceder a documentación
      (BL, reportes de destino, fotos de origen) y recibir notificaciones de cada hito operativo.
    </p>
    ${button(portalUrl, 'Ingresar al portal')}
    <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:${TEXT};">
      El acceso es con tu email (<strong>${escapeHtml(opts.email)}</strong>). Cada vez que ingresés te enviamos un
      <strong>código de un solo uso</strong> por email — no necesitás contraseña.
    </p>
    <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${MUTED};">
      Si tenés cualquier consulta, escribinos a <a href="mailto:info@twf.uy" style="color:${BRAND_PRIMARY};">info@twf.uy</a>.
    </p>
  `
  return {
    subject: 'Bienvenido/a al portal de TWF',
    html: wrap(inner, 'Tu acceso al portal de clientes de TWF ya está disponible.'),
  }
}

// ─── Welcome: Partner (depot / transport) ──────────────────────────
export function welcomePartnerEmail(opts: {
  name: string
  email: string
  role: 'depot' | 'transport'
  filterValue: string
}): { subject: string; html: string } {
  const roleLabel = opts.role === 'depot' ? 'Depósito' : 'Transporte'
  const portalPath = opts.role === 'depot' ? '/depot' : '/transport'
  const portalUrl = `${BASE_URL}${portalPath}`
  const firstName = (opts.name || '').split(' ')[0] || opts.name || ''
  const inner = `
    <h1 style="margin:0 0 16px;font-size:22px;color:${TEXT};">Hola ${escapeHtml(firstName)},</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${TEXT};">
      Se creó tu acceso al <strong>panel de TWF</strong> como <strong>${escapeHtml(roleLabel)}</strong>
      (${escapeHtml(opts.filterValue)}).
    </p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${TEXT};">
      Desde el panel vas a ver la agenda de cargas asignadas, fechas estimadas y novedades operativas
      relevantes para coordinar tu operativa con nosotros.
    </p>
    ${button(portalUrl, `Ingresar al panel de ${roleLabel}`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;background:#fff7ed;border-left:4px solid ${BRAND_ACCENT};border-radius:4px;">
      <tr><td style="padding:14px 18px;">
        <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:${TEXT};">Contraseña</p>
        <p style="margin:0;font-size:14px;line-height:1.55;color:${TEXT};">
          Tu contraseña te la comunica TWF por otro canal (WhatsApp o teléfono).
          Si no la recibiste, contactá a <a href="mailto:info@twf.uy" style="color:${BRAND_PRIMARY};">info@twf.uy</a>.
        </p>
      </td></tr>
    </table>
    <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:${TEXT};">
      Usuario: <strong>${escapeHtml(opts.email)}</strong>
    </p>
  `
  return {
    subject: `Acceso al panel de TWF como ${roleLabel}`,
    html: wrap(inner, `Tu acceso como ${roleLabel} al panel de TWF ya está disponible.`),
  }
}
