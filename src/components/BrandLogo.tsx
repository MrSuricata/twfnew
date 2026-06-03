import { useBrand } from '@/lib/brand'

type LogoVariant = 'full' | 'white' | 'icon' | 'iconWhite' | 'nav'

interface BrandLogoProps {
  /** Which logo asset/treatment to use. Default 'full'. */
  variant?: LogoVariant
  className?: string
  /** Optional explicit alt; defaults to the brand display name. */
  alt?: string
}

/**
 * Renders the active brand's logo. Swaps automatically between TWF and
 * Mediterránea Carghas based on the resolved brand.
 *
 * The 'nav' variant gives a horizontal lockup that reads well in a navbar:
 *  - TWF ships a horizontal wordmark image, so we use it directly.
 *  - Mediterránea's logo is a square stacked lockup (tiny in a navbar), so we
 *    compose its emblem + the brand name as text in the brand font.
 */
export default function BrandLogo({ variant = 'full', className, alt }: BrandLogoProps) {
  const brand = useBrand()

  if (variant === 'nav') {
    if (brand.id === 'twf') {
      return <img src={brand.logo.white} alt={alt ?? brand.displayName} className={className} />
    }
    // Composed horizontal lockup (emblem + wordmark text), white for dark navs.
    return (
      <span className="inline-flex items-center gap-2.5 min-w-0">
        <img src={brand.logo.iconWhite} alt="" className="h-8 w-auto shrink-0" />
        <span className="font-semibold text-lg leading-none tracking-tight truncate">
          {brand.name}
        </span>
      </span>
    )
  }

  const src = brand.logo[variant]
  return <img src={src} alt={alt ?? brand.displayName} className={className} />
}
