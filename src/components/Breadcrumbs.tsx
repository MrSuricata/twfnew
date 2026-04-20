import { CaretRight, House } from '@phosphor-icons/react'

interface BreadcrumbItem {
  label: string
  onClick?: () => void
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[]
  /** Handler for the "Inicio" home button. If omitted, the home button is not rendered
   *  (prevents the old broken `window.location.href = '#inicio'` no-op behavior). */
  onHomeClick?: () => void
}

export default function Breadcrumbs({ items, onHomeClick }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6" aria-label="Breadcrumb">
      {onHomeClick && (
        <button
          onClick={onHomeClick}
          className="hover:text-foreground transition-colors flex items-center gap-1"
        >
          <House size={16} weight="fill" />
          <span>Inicio</span>
        </button>
      )}

      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          {(onHomeClick || index > 0) && (
            <CaretRight size={16} weight="bold" className="text-muted-foreground/50" />
          )}
          {item.onClick ? (
            <button
              onClick={item.onClick}
              className="hover:text-foreground transition-colors"
            >
              {item.label}
            </button>
          ) : (
            <span className="text-foreground font-medium">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  )
}
