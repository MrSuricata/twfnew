import { CaretRight, House } from '@phosphor-icons/react'

interface BreadcrumbItem {
  label: string
  onClick?: () => void
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[]
}

export default function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6" aria-label="Breadcrumb">
      <button 
        onClick={() => window.location.href = '#inicio'}
        className="hover:text-foreground transition-colors flex items-center gap-1"
      >
        <House size={16} weight="fill" />
        <span>Inicio</span>
      </button>
      
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <CaretRight size={16} weight="bold" className="text-muted-foreground/50" />
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
