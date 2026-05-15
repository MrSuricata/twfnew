export type AnalyticsProvider = 'ga4' | 'plausible' | 'none';

export interface AnalyticsConfig {
  provider: AnalyticsProvider;
  ga4Id?: string;
  plausibleDomain?: string;
}

export function resolveAnalyticsConfig(env: Record<string, string | undefined>): AnalyticsConfig {
  const provider = (env.PUBLIC_ANALYTICS_PROVIDER as AnalyticsProvider) ?? 'none';
  return {
    provider,
    ga4Id: env.PUBLIC_GA4_ID,
    plausibleDomain: env.PUBLIC_PLAUSIBLE_DOMAIN,
  };
}

export function needsCookieConsent(config: AnalyticsConfig): boolean {
  return config.provider === 'ga4';
}
