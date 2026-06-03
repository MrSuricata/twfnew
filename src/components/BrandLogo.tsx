import { useBrand } from '@/lib/brand'

type LogoVariant = 'full' | 'white' | 'icon' | 'iconWhite'

interface BrandLogoProps {
  /** Which logo asset to use. Default 'full'. */
  variant?: LogoVariant
  className?: string
  /** Optional explicit alt; defaults to the brand display name. */
  alt?: string
}

/**
 * Renders the active brand's logo. Swaps automatically between TWF and
 * Mediterránea Carghas based on the resolved brand — no hardcoded paths
 * in the rest of the app.
 */
export default function BrandLogo({ variant = 'full', className, alt }: BrandLogoProps) {
  const brand = useBrand()
  const src = brand.logo[variant]
  return <img src={src} alt={alt ?? brand.displayName} className={className} />
}
