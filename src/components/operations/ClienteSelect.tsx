/**
 * El cliente de una carga se ELIGE del catálogo, no se tipea.
 *
 * Brian (02/09/2026): "que no se tipee libre, que se pueda seleccionar del
 * catálogo o lista y si no crear nuevo cliente". El nombre tipeado libre es lo
 * que dejó "VMG SA", "VMG S.A." y "VMG SOCIEDAD ANONIMA" como tres clientes
 * distintos, y por eso VMG no veía sus LCL en el portal.
 *
 * Se abre con la lista completa, filtra a medida que se escribe (ignorando
 * puntos, acentos y el S.A. final) y, si lo escrito no existe, ofrece crearlo
 * en el catálogo ahí mismo.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { CaretDown, Check, MagnifyingGlass, Plus, CircleNotch } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { ClientAccount } from '@/lib/quotationTypes'
import { normalizeClienteKey, type CatalogClient } from '@/lib/clientCatalog'
import { crearClienteEnCatalogo } from '@/lib/clienteNuevo'

interface Props {
  value: string
  onChange: (nombre: string) => void
  clientes: CatalogClient[]
  /** El catálogo cambió (cliente nuevo): para que el contenedor lo refresque. */
  onClienteCreado?: (cliente: ClientAccount) => void
  id?: string
  placeholder?: string
  invalid?: boolean
  className?: string
  disabled?: boolean
}

export default function ClienteSelect({
  value, onChange, clientes, onClienteCreado,
  id, placeholder = 'Elegí el cliente', invalid, className, disabled,
}: Props) {
  const [abierto, setAbierto] = useState(false)
  const [busca, setBusca] = useState('')
  const [creando, setCreando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (abierto) setTimeout(() => inputRef.current?.focus(), 30) }, [abierto])

  const ordenados = useMemo(
    () => [...(clientes || [])].filter(c => c?.name).sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [clientes],
  )

  const opciones = useMemo(() => {
    const q = normalizeClienteKey(busca)
    if (!q) return ordenados.slice(0, 200)
    return ordenados
      .filter(c => {
        const enNombre = normalizeClienteKey(c.name).includes(q)
        const enAlias = String(c.aliases || '').split(',').some(a => a.trim() && normalizeClienteKey(a).includes(q))
        return enNombre || enAlias
      })
      .slice(0, 200)
  }, [ordenados, busca])

  const escrito = busca.trim()
  const yaExiste = useMemo(
    () => !!escrito && ordenados.some(c => normalizeClienteKey(c.name) === normalizeClienteKey(escrito)),
    [ordenados, escrito],
  )

  const elegir = (nombre: string) => {
    onChange(nombre)
    setBusca('')
    setAbierto(false)
  }

  const crear = async () => {
    if (!escrito || creando) return
    setCreando(true)
    try {
      const { cliente, creado } = await crearClienteEnCatalogo(escrito)
      onClienteCreado?.(cliente)
      toast.success(creado ? `Cliente creado: ${cliente.name}` : `Ya existía: ${cliente.name}`, {
        description: creado ? 'Queda en el catálogo para las próximas cargas.' : 'Se usó el que ya estaba en el catálogo.',
      })
      elegir(cliente.name)
    } catch (err) {
      toast.error('No se pudo crear el cliente', { description: (err as Error)?.message || 'Probá de nuevo.' })
    } finally {
      setCreando(false)
    }
  }

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-invalid={invalid}
          className={`flex w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm text-left transition-colors hover:bg-muted/40 disabled:opacity-60 ${
            invalid ? 'border-red-400' : 'border-input'
          } ${className || ''}`}
        >
          <span className={`truncate ${value ? '' : 'text-muted-foreground'}`}>{value || placeholder}</span>
          <CaretDown size={14} className="shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] min-w-72 p-0">
        <div className="p-2 border-b">
          <div className="relative">
            <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={busca}
              onChange={e => setBusca(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (opciones.length === 1) elegir(opciones[0].name)
                  else if (escrito && !yaExiste) void crear()
                }
              }}
              placeholder="Buscar o escribir uno nuevo…"
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto py-1">
          {opciones.map(c => (
            <button
              key={c.name}
              type="button"
              onClick={() => elegir(c.name)}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors flex items-center gap-2"
            >
              {value === c.name
                ? <Check size={14} weight="bold" className="shrink-0 text-emerald-600" />
                : <span className="w-[14px] shrink-0" />}
              <span className="truncate">{c.name}</span>
            </button>
          ))}
          {opciones.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              {escrito ? 'Ningún cliente con ese nombre' : 'El catálogo está vacío'}
            </p>
          )}
        </div>

        {escrito && !yaExiste && (
          <button
            type="button"
            onClick={() => void crear()}
            disabled={creando}
            className="w-full border-t px-3 py-2.5 text-left text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors flex items-center gap-2 disabled:opacity-60"
          >
            {creando ? <CircleNotch size={14} className="animate-spin shrink-0" /> : <Plus size={14} weight="bold" className="shrink-0" />}
            <span className="truncate">Crear cliente “{escrito}”</span>
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}
