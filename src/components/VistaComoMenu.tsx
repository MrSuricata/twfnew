/**
 * El botón "Ver como" del nav del admin: elegir depósito, transporte o cliente
 * y ver su pantalla. Las opciones salen de las cargas vivas (los depósitos y
 * transportes que realmente están operando) y del catálogo de clientes.
 */
import { useMemo, useState } from 'react'
import { Eye, MagnifyingGlass, Truck, User, Warehouse } from '@phosphor-icons/react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import type { ClientAccount } from '@/lib/quotationTypes'
import { contarPorOpcion, depositosEnCargas, transportesEnCargas, type RolVista, type VistaComo } from '@/lib/vistaComo'

interface Props {
  shipments: ParsedShipment[]
  clients: ClientAccount[]
  onElegir: (v: VistaComo) => void
  /** Clases del botón para que combine con el resto del nav. */
  botonClass: string
}

const TABS: { rol: RolVista; label: string; icon: React.ReactNode }[] = [
  { rol: 'depot', label: 'Depósito', icon: <Warehouse size={14} weight="fill" /> },
  { rol: 'transport', label: 'Transporte', icon: <Truck size={14} weight="fill" /> },
  { rol: 'client', label: 'Cliente', icon: <User size={14} weight="fill" /> },
]

export default function VistaComoMenu({ shipments, clients, onElegir, botonClass }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [rol, setRol] = useState<RolVista>('depot')
  const [busca, setBusca] = useState('')

  const depositos = useMemo(() => depositosEnCargas(shipments), [shipments])
  const transportes = useMemo(() => transportesEnCargas(shipments), [shipments])
  const cuentaDep = useMemo(() => contarPorOpcion(shipments, 'depot', depositos), [shipments, depositos])
  const cuentaTra = useMemo(() => contarPorOpcion(shipments, 'transport', transportes), [shipments, transportes])

  const opciones = useMemo(() => {
    const q = busca.trim().toUpperCase()
    if (rol === 'client') {
      return (clients || [])
        .filter(c => c.name && (!q || c.name.toUpperCase().includes(q)))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 60)
        .map(c => ({ valor: c.email || c.name, nombre: c.name, detalle: c.email || 'sin email' }))
    }
    const lista = rol === 'depot' ? depositos : transportes
    const cuenta = rol === 'depot' ? cuentaDep : cuentaTra
    return lista
      .filter(o => !q || o.includes(q))
      .map(o => ({ valor: o, nombre: o, detalle: `${cuenta[o] || 0} carga${cuenta[o] === 1 ? '' : 's'}` }))
  }, [rol, busca, clients, depositos, transportes, cuentaDep, cuentaTra])

  const elegir = (valor: string, nombre: string) => {
    setAbierto(false)
    setBusca('')
    onElegir({ rol, valor, nombre })
  }

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button type="button" className={botonClass} title="Ver la web como la ve un depósito, un transporte o un cliente">
          <Eye size={16} weight="fill" />
          <span className="hidden lg:inline">Ver como</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex border-b">
          {TABS.map(t => (
            <button
              key={t.rol}
              type="button"
              onClick={() => { setRol(t.rol); setBusca('') }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-semibold transition-colors ${
                rol === t.rol ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>
        <div className="p-2 border-b">
          <div className="relative">
            <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder={rol === 'client' ? 'Buscar cliente…' : 'Buscar…'}
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {opciones.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">Sin resultados</p>
          )}
          {opciones.map(o => (
            <button
              key={`${rol}|${o.valor}`}
              type="button"
              onClick={() => elegir(o.valor, o.nombre)}
              className="w-full text-left px-3 py-2 hover:bg-muted transition-colors flex items-center gap-2"
            >
              <span className="text-sm font-medium truncate flex-1 min-w-0">{o.nombre}</span>
              <span className="text-[11px] text-muted-foreground shrink-0">{o.detalle}</span>
            </button>
          ))}
        </div>
        <p className="px-3 py-2 border-t text-[11px] text-muted-foreground">
          Es una vista previa: se ve igual que la de ellos, pero no se guarda nada.
        </p>
      </PopoverContent>
    </Popover>
  )
}
