/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL: string;
  readonly PUBLIC_WHATSAPP_NUMBER: string;
  readonly PUBLIC_WHATSAPP_DEFAULT_MSG: string;
  readonly PUBLIC_ANALYTICS_PROVIDER: 'ga4' | 'plausible' | 'none';
  readonly PUBLIC_GA4_ID?: string;
  readonly PUBLIC_PLAUSIBLE_DOMAIN?: string;
  readonly RESEND_API_KEY?: string;
  readonly CONTACT_TO_EMAIL?: string;
  readonly CONTACT_FROM_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
