import { useState, useEffect } from 'react'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Package,
  UsersThree,
  CalendarBlank,
  ChartBar,
  SignOut,
  Lightning,
  Truck,
  Star,
  ChatCircleText,
  ShieldCheck,
  CurrencyDollar,
} from '@phosphor-icons/react'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import type { ClientAccount } from '@/lib/quotationTypes'

interface CommandPaletteProps {
  shipments: ParsedShipment[]
  clients: ClientAccount[]
  onNavigate: (tab: string) => void
  onLogout: () => void
}

const TABS: Array<{ id: string; label: string; icon: typeof Package; shortcut?: string }> = [
  { id: 'hoy', label: 'Hoy', icon: Lightning, shortcut: 'G H' },
  { id: 'agenda', label: 'Agenda', icon: CalendarBlank, shortcut: 'G A' },
  { id: 'analytics', label: 'Analíticas', icon: ChartBar },
  { id: 'operaciones', label: 'Operaciones', icon: Package, shortcut: 'G C' },
  { id: 'pagos', label: 'Pagos', icon: CurrencyDollar },
  { id: 'quotes', label: 'Cotizaciones', icon: ChatCircleText, shortcut: 'G Q' },
  { id: 'clients', label: 'Clientes', icon: UsersThree, shortcut: 'G L' },
  { id: 'partners', label: 'Partners', icon: Truck, shortcut: 'G P' },
  { id: 'case-studies', label: 'Casos de Éxito', icon: Star },
  { id: 'testimonials', label: 'Testimonios', icon: ChatCircleText },
]

export default function CommandPalette({ shipments, clients, onNavigate, onLogout }: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const runThenClose = (fn: () => void) => {
    setOpen(false)
    setSearch('')
    setTimeout(fn, 0)
  }

  const visibleShipments = search.length === 0
    ? shipments.slice(0, 8)
    : shipments.slice(0, 250)
  const visibleClients = search.length === 0
    ? clients.slice(0, 6)
    : clients.slice(0, 200)

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Paleta de comandos" description="Navegar, buscar operaciones y ejecutar acciones">
      <CommandInput
        placeholder="Buscar operación, cliente, acción…"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>Sin resultados para "{search}"</CommandEmpty>

        <CommandGroup heading="Navegación">
          {TABS.map(tab => (
            <CommandItem
              key={tab.id}
              value={`nav ${tab.label}`}
              onSelect={() => runThenClose(() => onNavigate(tab.id))}
            >
              <tab.icon size={18} weight="duotone" className="text-accent" />
              <span>{tab.label}</span>
              {tab.shortcut && <CommandShortcut>{tab.shortcut}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>

        {visibleShipments.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Operaciones${search ? '' : ' (recientes)'}`}>
              {visibleShipments.map(s => (
                <CommandItem
                  key={s.REF}
                  value={`op ${s.REF} ${s.CLIENTE || ''} ${s.BUQUE || ''} ${s.LINEA || ''}`}
                  onSelect={() => runThenClose(() => onNavigate('operaciones'))}
                >
                  <Package size={18} weight="duotone" className="text-accent" />
                  <span className="font-mono font-semibold">{s.REF}</span>
                  {s.CLIENTE && <span className="text-muted-foreground truncate">· {s.CLIENTE}</span>}
                  {s.LINEA && (
                    <span className="ml-auto text-xs text-muted-foreground">{s.LINEA}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {visibleClients.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Clientes${search ? '' : ' (recientes)'}`}>
              {visibleClients.map(c => (
                <CommandItem
                  key={c.id}
                  value={`cli ${c.name} ${c.email} ${c.company || ''} ${c.clientePattern || ''}`}
                  onSelect={() => runThenClose(() => onNavigate('clients'))}
                >
                  <UsersThree size={18} weight="duotone" className="text-accent" />
                  <span>{c.name}</span>
                  {c.company && (
                    <span className="text-muted-foreground text-xs truncate">{c.company}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Acciones rápidas">
          <CommandItem
            value="action agregar cliente nuevo"
            onSelect={() => runThenClose(() => onNavigate('clients'))}
          >
            <UsersThree size={18} weight="duotone" className="text-accent" />
            <span>Ir a Clientes</span>
          </CommandItem>
          <CommandItem
            value="action agregar partner nuevo deposito transporte"
            onSelect={() => runThenClose(() => onNavigate('partners'))}
          >
            <ShieldCheck size={18} weight="duotone" className="text-accent" />
            <span>Ir a Partners</span>
          </CommandItem>
          <CommandItem
            value="action cerrar sesion logout salir"
            onSelect={() => runThenClose(onLogout)}
          >
            <SignOut size={18} weight="duotone" className="text-destructive" />
            <span>Cerrar sesión</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
