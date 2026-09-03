/**
 * Helper para enviar mails via Resend desde server endpoints de Astro.
 * Resend es un peer dependency opcional — cada sitio que use mail lo agrega a su package.json.
 */

export interface SendMailInput {
  apiKey: string;
  from: string;
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export interface SendMailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  if (!input.apiKey) return { ok: false, error: 'RESEND_API_KEY ausente' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: input.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        reply_to: input.replyTo,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    const json = (await res.json()) as { id?: string };
    return { ok: true, id: json.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}

export function renderContactEmail(payload: {
  siteName: string;
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
}): { text: string; html: string } {
  const text = [
    `Nuevo mensaje desde el sitio de ${payload.siteName}`,
    '',
    `Nombre:   ${payload.name}`,
    `Email:    ${payload.email}`,
    payload.phone ? `Teléfono: ${payload.phone}` : '',
    payload.subject ? `Asunto:   ${payload.subject}` : '',
    '',
    'Mensaje:',
    payload.message,
  ]
    .filter(Boolean)
    .join('\n');
  const safe = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `
    <h2>Nuevo mensaje desde ${safe(payload.siteName)}</h2>
    <ul>
      <li><b>Nombre:</b> ${safe(payload.name)}</li>
      <li><b>Email:</b> ${safe(payload.email)}</li>
      ${payload.phone ? `<li><b>Teléfono:</b> ${safe(payload.phone)}</li>` : ''}
      ${payload.subject ? `<li><b>Asunto:</b> ${safe(payload.subject)}</li>` : ''}
    </ul>
    <h3>Mensaje</h3>
    <p style="white-space:pre-wrap">${safe(payload.message)}</p>
  `;
  return { text, html };
}
