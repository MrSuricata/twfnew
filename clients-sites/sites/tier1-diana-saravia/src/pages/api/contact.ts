import type { APIRoute } from 'astro';
import { contactFormSchema, flattenZodErrors, checkRateLimit } from '@twf/lib/forms';
import { sendMail, renderContactEmail } from '@twf/lib/resend';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let payload: Record<string, unknown>;
  const contentType = request.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      payload = (await request.json()) as Record<string, unknown>;
    } else {
      const form = await request.formData();
      payload = Object.fromEntries(form.entries());
    }
  } catch {
    return new Response(JSON.stringify({ ok: false, message: 'Payload inválido' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Honeypot: si trae website → bot → respondemos OK silencioso
  if (typeof payload.website === 'string' && payload.website.length > 0) {
    return new Response(JSON.stringify({ ok: true, message: 'OK' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  const parsed = contactFormSchema.safeParse(payload);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        ok: false,
        message: 'Revisá los campos',
        errors: flattenZodErrors(parsed.error),
      }),
      { status: 422, headers: { 'content-type': 'application/json' } },
    );
  }

  const rateKey = `contact:${clientAddress ?? 'unknown'}`;
  if (!checkRateLimit(rateKey, { limit: 5, windowMs: 60 * 60 * 1000 })) {
    return new Response(
      JSON.stringify({ ok: false, message: 'Demasiados envíos. Probá más tarde.' }),
      { status: 429, headers: { 'content-type': 'application/json' } },
    );
  }

  const env = import.meta.env;
  if (env.RESEND_API_KEY && env.CONTACT_TO_EMAIL && env.CONTACT_FROM_EMAIL) {
    const { text, html } = renderContactEmail({
      siteName: 'Diana Saravia · Contemporary Art',
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || undefined,
      subject: parsed.data.subject || undefined,
      message: parsed.data.message,
    });
    const result = await sendMail({
      apiKey: env.RESEND_API_KEY,
      from: env.CONTACT_FROM_EMAIL,
      to: env.CONTACT_TO_EMAIL,
      subject: `Nueva consulta desde dianasaravia.uy — ${parsed.data.name}`,
      replyTo: parsed.data.email,
      text,
      html,
    });
    if (!result.ok) {
      console.error('[contact] resend error', result.error);
      return new Response(
        JSON.stringify({ ok: false, message: 'No pudimos enviar el mensaje. Probá de nuevo.' }),
        { status: 502, headers: { 'content-type': 'application/json' } },
      );
    }
  } else {
    // En dev sin Resend, log y seguimos como OK.
    console.log('[contact] (sin Resend en env) payload:', parsed.data);
  }

  return new Response(JSON.stringify({ ok: true, message: 'Recibido' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
