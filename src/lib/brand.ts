// ─── Multi-brand engine ───────────────────────────────────────────────
// One codebase, two brands: TWF (landing + content admin) and
// Mediterránea Carghas (landing + full operations webapp).
//
// The active brand is resolved from VITE_BRAND (set per Vercel project)
// with a hostname fallback, defaulting to TWF so the existing site is
// unaffected when no brand is configured.
// ──────────────────────────────────────────────────────────────────────

export type BrandId = 'twf' | 'med'

export interface BrandCapabilities {
  /** Public marketing landing page. */
  publicLanding: boolean
  /** Admin tabs that edit landing content (Casos, Testimonios, …). */
  contentAdmin: boolean
  /** Full operations dashboard (Cargas, Camiones, Facturación, Operaciones, …). */
  opsAdmin: boolean
  /** Client / depot / transport portals. */
  portals: boolean
}

export interface Brand {
  id: BrandId
  /** Short name for compact UI (nav, badges). */
  name: string
  /** Full display name. */
  displayName: string
  /** Legal entity name (footers, legal pages, emails). */
  legalName: string
  tagline: string
  /** Hostnames that map to this brand (for runtime fallback resolution). */
  domains: string[]
  logo: {
    /** Colored lockup for light backgrounds. */
    full: string
    /** White lockup for dark/colored backgrounds. */
    white: string
    /** Small mark, dark. */
    icon: string
    /** Small mark, white. */
    iconWhite: string
  }
  contact: { email: string; whatsapp?: string; site: string }
  capabilities: BrandCapabilities
  /** Marco legal por marca (Términos / Privacidad). NO es asesoramiento legal:
   *  redacción base a revisar por un abogado antes de operar. */
  legal: {
    /** País cuya ley rige, en genitivo: "la República Argentina". */
    country: string
    /** Cláusula de tribunales competentes (Términos §9). */
    courts: string
    /** Domicilio del responsable de datos (Privacidad §8). */
    domicile: string
    /** Normas de retención documental (Privacidad §4). */
    fiscalNorms: string
    /** Ley de protección de datos aplicable (Privacidad); vacío = no citar. */
    dataLaw: string
  }
  /** Primary font-family name (loaded via index.html / index.css). */
  font: string
}

export const BRANDS: Record<BrandId, Brand> = {
  twf: {
    id: 'twf',
    name: 'TWF',
    displayName: 'Transit World Forwarding',
    legalName: 'Transit World Forwarding SAS',
    tagline: 'Soluciones Logísticas Globales',
    domains: ['twf.uy', 'transitworldforwarding.com', 'transitworldforwarding.vercel.app'],
    logo: {
      full: '/images/twf-logo-full-new.png',
      white: '/images/twf-logo-white.png',
      icon: '/images/twf-icon-dark.png',
      iconWhite: '/images/twf-icon-white.png',
    },
    contact: { email: 'info@twf.uy', whatsapp: '+59899511196', site: 'twf.uy' },
    // TEMPORAL: TWF mantiene el admin operativo completo + portales hasta que
    // Mediterránea Carghas esté deployada en su dominio. Cuando Med esté en
    // producción y se decida bloquear TWF a solo-landing, volver opsAdmin y
    // portals a false.
    capabilities: { publicLanding: true, contentAdmin: true, opsAdmin: true, portals: true },
    legal: {
      country: 'la República Oriental del Uruguay',
      courts: 'los tribunales competentes de la ciudad de Montevideo',
      domicile: 'la República Oriental del Uruguay',
      fiscalNorms: 'las normas aduaneras y fiscales uruguayas',
      dataLaw: '',
    },
    font: 'Inter',
  },
  med: {
    id: 'med',
    name: 'Mediterranea',
    displayName: 'Mediterranea Carghas',
    legalName: 'Mediterranea Carghas',
    tagline: 'Logística internacional sin fronteras',
    domains: ['mediterraneacarghas.com.ar', 'mediterraneacarghas.com', 'mediterranea.vercel.app'],
    logo: {
      full: '/images/med-logo-dark.svg',
      white: '/images/med-logo-white.svg',
      icon: '/images/med-emblem-dark.svg',
      iconWhite: '/images/med-emblem-white.svg',
    },
    // whatsapp: usa el número de TWF (el de Brian) de forma interina hasta que
    // Mediterránea tenga su propio número — decisión de Brian (01/07/2026).
    contact: { email: 'info@mediterraneacarghas.com.ar', whatsapp: '+59899511196', site: 'mediterraneacarghas.com.ar' },
    capabilities: { publicLanding: true, contentAdmin: true, opsAdmin: true, portals: true },
    legal: {
      country: 'la República Argentina',
      courts: 'los tribunales ordinarios competentes de la República Argentina',
      domicile: 'la República Argentina',
      fiscalNorms: 'las normas aduaneras y fiscales argentinas',
      dataLaw: 'la Ley N.º 25.326 de Protección de los Datos Personales',
    },
    font: 'Jost',
  },
}

const DEFAULT_BRAND: BrandId = 'twf'

function isBrandId(v: unknown): v is BrandId {
  return v === 'twf' || v === 'med'
}

/** Resolve the active brand id: build-time env first, hostname fallback. */
export function resolveBrandId(): BrandId {
  const meta = (import.meta as { env?: Record<string, string | boolean> }).env

  // 1) Build-time env, set per Vercel project (VITE_BRAND=med | twf).
  const env = meta?.VITE_BRAND
  if (isBrandId(env)) return env

  if (typeof window !== 'undefined') {
    // 2) Manual override for switching brand on a shared deployment:
    //    ?brand=med (sticky via localStorage) / ?brand=twf to reset.
    //    Interim mechanism so Brian can operate Mediterránea on the existing
    //    Vercel project before its own domain is configured. Once
    //    mediterraneacarghas.com.ar points at this project, hostname match
    //    (step 3) resolves the brand automatically and this is unnecessary.
    try {
      const q = new URLSearchParams(window.location.search).get('brand')
      if (isBrandId(q)) { localStorage.setItem('twf-brand-override', q); return q }
      const stored = localStorage.getItem('twf-brand-override')
      if (isBrandId(stored)) return stored
    } catch { /* ignore */ }

    // 3) Runtime hostname match.
    const host = window.location.hostname.toLowerCase()
    for (const b of Object.values(BRANDS)) {
      if (b.domains.some(d => host === d || host.endsWith('.' + d))) return b.id
    }
    if (host.includes('mediterranea')) return 'med'
  }

  return DEFAULT_BRAND
}

let _brand: Brand | null = null

/** The active brand for this session (resolved once, stable). */
export function getBrand(): Brand {
  if (!_brand) _brand = BRANDS[resolveBrandId()]
  return _brand
}

/** Hook-style accessor (stable for the session; safe to call in render). */
export function useBrand(): Brand {
  return getBrand()
}

// Per-brand PWA assets (installable "Add to Home Screen"). Icons are generated
// from the brand emblems by scripts/gen-pwa-icons.cjs.
const PWA: Record<BrandId, { manifest: string; appleIcon: string; theme: string }> = {
  twf: { manifest: '/site.webmanifest', appleIcon: '/apple-touch-icon.png', theme: '#0f172a' },
  med: { manifest: '/med.webmanifest', appleIcon: '/med-apple-touch.png', theme: '#261c79' },
}

function setLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) { el = document.createElement('link'); el.rel = rel; document.head.appendChild(el) }
  el.href = href
}
function setMeta(name: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!el) { el = document.createElement('meta'); el.name = name; document.head.appendChild(el) }
  el.content = content
}

/** Apply brand to the document: data-brand attr (drives CSS theme) + title +
 *  installable PWA manifest/icons/theme (per brand, so each domain installs as
 *  its own app). Called once at boot from main.tsx, before any install prompt. */
export function applyBrand(brand: Brand = getBrand()): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-brand', brand.id)
  document.title = `${brand.displayName} — ${brand.tagline}`

  const pwa = PWA[brand.id]
  setLink('manifest', pwa.manifest)
  setLink('apple-touch-icon', pwa.appleIcon)
  setMeta('theme-color', pwa.theme)
  setMeta('application-name', brand.displayName)
  setMeta('apple-mobile-web-app-title', brand.name)
  setMeta('apple-mobile-web-app-capable', 'yes')
  setMeta('mobile-web-app-capable', 'yes')
  setMeta('apple-mobile-web-app-status-bar-style', 'black-translucent')
}

/** Convenience: is the full operations webapp enabled for this brand? */
export function opsEnabled(): boolean {
  return getBrand().capabilities.opsAdmin
}
