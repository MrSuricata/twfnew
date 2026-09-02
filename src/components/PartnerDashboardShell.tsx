import type { ReactNode } from 'react'
import { saludoPersonal } from '@/lib/saludo'
import { Button } from '@/components/ui/button'
import { SignOut, User, House } from '@phosphor-icons/react'
import BrandLogo from './BrandLogo'

interface PartnerDashboardShellProps {
  /** Decorative icon shown on the left (e.g. <Warehouse ... /> or <Truck ... />). */
  icon: ReactNode
  /** Primary label — e.g. the depot or transport company name. */
  title: string
  /** Logged-in user's display name, shown beneath the title. */
  userName: string
  /** Logout handler. */
  onLogout: () => void
  /** Main content area (below the header). */
  children: ReactNode
}

/**
 * Shared layout chrome for the Depot + Transport partner dashboards.
 * Provides: container, header with icon + title + userName on the left,
 * logo + logout on the right, and a main area for children.
 */
export default function PartnerDashboardShell({
  icon,
  title,
  userName,
  onLogout,
  children,
}: PartnerDashboardShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="degradado-med sticky top-0 z-30 border-b border-white/10 text-white">
        <div className="max-w-[1600px] mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-white/10 rounded-lg ring-1 ring-inset ring-white/20 shrink-0 [&_svg]:text-white">{icon}</div>
            <div className="min-w-0">
              <p className="text-xs text-white/80 leading-tight">{saludoPersonal(userName)}</p>
              <h1 className="titulo-med text-base text-white leading-tight truncate">{title}</h1>
              <div className="flex items-center gap-1.5 text-xs text-white/70">
                <User size={12} />
                <span className="truncate">{userName}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/"
              title="Volver al inicio"
              className="hidden md:block shrink-0 rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <BrandLogo variant="nav" className="h-6 w-auto opacity-80 hover:opacity-100 transition-opacity" />
            </a>
            <Button variant="outline" size="sm" className="h-8 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white" asChild>
              <a href="/">
                <House size={16} className="mr-1.5" />
                Inicio
              </a>
            </Button>
            <Button variant="outline" size="sm" className="h-8 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white" onClick={onLogout}>
              <SignOut size={16} className="mr-1.5" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      {/* 7xl y no 1600px: con filas de dos renglones, más ancho solo estira
          el texto y cuesta leerlo (Brian 02/09). */}
      <main className="max-w-7xl mx-auto p-4 space-y-5">{children}</main>
    </div>
  )
}
