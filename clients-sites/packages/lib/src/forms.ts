import { z } from 'zod';

export const contactFormSchema = z.object({
  name: z.string().min(2, 'Ingresá tu nombre').max(120),
  email: z.string().email('Email inválido'),
  phone: z.string().max(40).optional().or(z.literal('')),
  subject: z.string().max(160).optional().or(z.literal('')),
  message: z.string().min(10, 'Contanos un poco más').max(2000),
  /** Honeypot anti-bot. Debe llegar vacío. */
  website: z.string().max(0).optional().or(z.literal('')),
});

export type ContactFormInput = z.infer<typeof contactFormSchema>;

export const eventInquirySchema = contactFormSchema.extend({
  eventType: z.enum(['corporate', 'wedding', 'birthday', 'other']),
  eventDate: z.string().optional().or(z.literal('')),
  guestCount: z.coerce.number().int().min(1).max(2000).optional(),
});

export type EventInquiryInput = z.infer<typeof eventInquirySchema>;

export interface FormResponse {
  ok: boolean;
  message: string;
  errors?: Record<string, string>;
}

export function flattenZodErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    if (path && !errors[path]) errors[path] = issue.message;
  }
  return errors;
}

/**
 * Rate limit en memoria. 5 envíos por hora por clave (IP + endpoint).
 * Para Cloudflare Workers/Pages: ver versión KV en cada sitio.
 */
const memoryBuckets = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  options: { limit?: number; windowMs?: number } = {},
): boolean {
  const limit = options.limit ?? 5;
  const windowMs = options.windowMs ?? 60 * 60 * 1000;
  const now = Date.now();
  const bucket = (memoryBuckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (bucket.length >= limit) {
    memoryBuckets.set(key, bucket);
    return false;
  }
  bucket.push(now);
  memoryBuckets.set(key, bucket);
  return true;
}
