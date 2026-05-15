export interface WhatsAppLinkInput {
  number: string;
  message?: string;
}

/**
 * Construye un link wa.me con mensaje pre-cargado.
 * `number` en formato internacional sin signos (ej. 59898911302).
 */
export function buildWhatsAppLink({ number, message }: WhatsAppLinkInput): string {
  const cleanNumber = number.replace(/\D/g, '');
  if (!cleanNumber) return '#';
  if (!message) return `https://wa.me/${cleanNumber}`;
  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
}
