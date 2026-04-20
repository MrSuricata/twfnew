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
      <header className="border-b bg-card shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">{icon}</div>
            <div>
              <h1 className="text-lg font-bold leading-tight">{title}</h1>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <User size={14} />
                <span>{userName}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/"
              title="Volver al inicio"
              className="shrink-0 rounded-md hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <img src="/images/twf-logo-full-new.png" alt="TWF" className="h-7 w-auto opacity-60 hover:opacity-100 transition-opacity" />
            </a>
            <Button variant="outline" size="sm" asChild>
              <a href="/">
                <House size={18} className="mr-1.5" />
                Inicio
              </a>
            </Button>
            <Button variant="outline" size="sm" onClick={onLogout}>
              <SignOut size={18} className="mr-1.5" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-4">{children}</main>
    </div>
  )
}
