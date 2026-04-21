import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { SignOut, User, House } from '@phosphor-icons/react'

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
      <header className="sticky top-0 z-30 border-b bg-card/80 backdrop-blur-md supports-[backdrop-filter]:bg-card/70">
        <div className="max-w-[1600px] mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-primary/5 rounded-lg ring-1 ring-inset ring-border/50 shrink-0">{icon}</div>
            <div className="min-w-0">
              <h1 className="text-base font-bold tracking-tight leading-tight truncate">{title}</h1>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
              <img src="/images/twf-logo-full-new.png" alt="TWF" className="h-6 w-auto opacity-50 hover:opacity-90 transition-opacity" />
            </a>
            <Button variant="outline" size="sm" className="h-8" asChild>
              <a href="/">
                <House size={16} className="mr-1.5" />
                Inicio
              </a>
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={onLogout}>
              <SignOut size={16} className="mr-1.5" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-4">{children}</main>
    </div>
  )
}
