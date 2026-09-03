export type Locale = 'es' | 'en' | 'pt';

export const LOCALES: readonly Locale[] = ['es', 'en', 'pt'] as const;
export const DEFAULT_LOCALE: Locale = 'es';

export const LOCALE_NAMES: Record<Locale, string> = {
  es: 'Español',
  en: 'English',
  pt: 'Português',
};

export function isLocale(value: string | undefined): value is Locale {
  return value === 'es' || value === 'en' || value === 'pt';
}

/**
 * Devuelve la ruta para otro idioma, basado en la ruta actual.
 * `/` <-> `/en/` <-> `/pt/`.
 */
export function localizePath(currentPath: string, fromLocale: Locale, toLocale: Locale): string {
  const stripped =
    fromLocale === DEFAULT_LOCALE
      ? currentPath
      : currentPath.replace(new RegExp(`^/${fromLocale}(/|$)`), '/');
  const normalized = stripped.startsWith('/') ? stripped : `/${stripped}`;
  if (toLocale === DEFAULT_LOCALE) return normalized;
  return normalized === '/' ? `/${toLocale}/` : `/${toLocale}${normalized}`;
}

export function buildHreflang(canonicalPath: string, siteUrl: string): Array<{ lang: string; href: string }> {
  const base = siteUrl.replace(/\/$/, '');
  const result = LOCALES.map((lang) => ({
    lang,
    href: `${base}${localizePath(canonicalPath, DEFAULT_LOCALE, lang)}`,
  }));
  result.push({ lang: 'x-default', href: `${base}${canonicalPath}` });
  return result;
}

export const T = {
  es: {
    cta_book: 'Reservar',
    cta_contact: 'Contacto',
    cta_whatsapp: 'WhatsApp',
    nav_menu: 'Menú',
    nav_about: 'Nosotros',
    nav_contact: 'Contacto',
    form_name: 'Nombre',
    form_email: 'Email',
    form_phone: 'Teléfono',
    form_message: 'Mensaje',
    form_send: 'Enviar',
    form_sending: 'Enviando…',
    form_ok: '¡Gracias! Te respondemos a la brevedad.',
    form_err: 'No pudimos enviar el mensaje. Probá de nuevo.',
    skip_link: 'Saltar al contenido principal',
  },
  en: {
    cta_book: 'Book',
    cta_contact: 'Contact',
    cta_whatsapp: 'WhatsApp',
    nav_menu: 'Menu',
    nav_about: 'About',
    nav_contact: 'Contact',
    form_name: 'Name',
    form_email: 'Email',
    form_phone: 'Phone',
    form_message: 'Message',
    form_send: 'Send',
    form_sending: 'Sending…',
    form_ok: 'Thank you! We will reply shortly.',
    form_err: 'We could not send your message. Please try again.',
    skip_link: 'Skip to main content',
  },
  pt: {
    cta_book: 'Reservar',
    cta_contact: 'Contato',
    cta_whatsapp: 'WhatsApp',
    nav_menu: 'Menu',
    nav_about: 'Sobre',
    nav_contact: 'Contato',
    form_name: 'Nome',
    form_email: 'Email',
    form_phone: 'Telefone',
    form_message: 'Mensagem',
    form_send: 'Enviar',
    form_sending: 'Enviando…',
    form_ok: 'Obrigado! Responderemos em breve.',
    form_err: 'Não foi possível enviar a mensagem. Tente novamente.',
    skip_link: 'Pular para o conteúdo principal',
  },
} as const;

export function t(locale: Locale, key: keyof typeof T['es']): string {
  return T[locale][key];
}
