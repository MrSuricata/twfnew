import type { ReactNode } from 'react'
import { saludoPersonal } from '@/lib/saludo'
import { Button } from '@/components/ui/button'
import { SignOut, User, House } from '@phosphor-icons/react'
import BrandLogo from './BrandLogo'
import CajaComentarios from './partner/CajaComentarios'

interface PartnerDashboardShellProps {
  /** Decorative icon shown on the left (e.g. <Warehouse ... /> or <Truck ... />). */
  icon: ReactNode
  /** Primary label — e.g. the depot or transport company name. */
  title: string
  /** Logged-in user's display name, shown beneath the title. */
  userName: string
  /** Logout handler. */
  onLogout: () => void
  /**
   * Pantalla actual ("HOY del depósito"): precarga el "¿en qué estabas?" de la
   * caja de comentarios. Va acá y no en cada dashboard porque el armazón lo
   * comparten los dos portales: puesta una vez, la caja aparece en depósito y
   * transporte sin duplicar nada (spec 04/09, D3). Sin esta prop no se muestra.
   */
  pantalla?: string
  /** Vista previa (/ui o "Ver como"): la caja se ve pero no manda nada. */
  preview?: boolean
  /**
   * Barra de accesos directos a las secciones. Va DENTRO del `<header>` para
   * que se pegue junto con la barra violeta, como un solo bloque: así el salto
   * a una sección puede descontar el alto real del encabezado y la sección no
   * queda tapada.
   */
  barra?: ReactNode
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
  pantalla,
  preview = false,
  barra,
  children,
}: PartnerDashboardShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="degradado-med sticky top-0 z-30 border-b border-white/10 text-white">
        <div className="max-w-[1600px] mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-white/10 rounded-lg ring-1 ring-inset ring-white/20 shrink-0 [&_svg]:text-white">{icon}</div>
            <div className="min-w-0">
              {/* El saludo es lo primero que se lee al entrar y estaba en letra
                  chica (Brian 04/09): ahora es el renglón grande del encabezado
                  y el nombre del depósito queda de contexto, abajo. */}
              <p className="text-lg sm:text-xl font-semibold text-white leading-tight">{saludoPersonal(userName)}</p>
              <h1 className="titulo-med text-base text-white/90 leading-tight truncate">{title}</h1>
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
        {barra}
      </header>

      {/* 7xl y no 1600px: con filas de dos renglones, más ancho solo estira
          el texto y cuesta leerlo (Brian 02/09). */}
      <main className="max-w-7xl mx-auto p-4 space-y-5">
        {/* La caja de comentarios va PRIMERO: lo que trae para mostrar es la
            respuesta del equipo, y una respuesta abajo de todo es una
            respuesta que no se lee. El botón es `fixed`, así que no importa
            dónde esté en el DOM. */}
        {pantalla && <CajaComentarios pantalla={pantalla} preview={preview} />}
        {children}
      </main>
    </div>
  )
}
