/**
 * Las LCL que llegaron y todavía no tienen stock, con un campo por fila para
 * tipear varios seguidos: el depósito manda la tanda y se cargan todas juntas.
 *
 * Es el único lugar pensado para cargar stock en volumen. Que sea rápido es lo
 * que decide si esto se usa o se abandona como el desplegable manual que
 * reemplaza.
 */
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Package } from '@phosphor-icons/react'
import type { DbShipment } from '@/lib/operationsTypes'
import { estadoLcl } from '@/lib/lclEstados'

interface BandejaStockProps {
  dbShipments: DbShipment[]
  /** Refs que ya viajan en un camión: no entran a la bandeja. */
  refsEnCamion: Set<string>
  onPatch: (id: string, fields: Record<string, unknown>) => void
  /** Dentro de otra card (HOY LCL): sin marco ni título propios, solo las filas.
   *  El contenedor ya muestra el conteo y el estado vacío. */
  embebida?: boolean
}

export default function BandejaStock({ dbShipments, refsEnCamion, onPatch, embebida = false }: BandejaStockProps) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [borradores, setBorradores] = useState<Record<string, string>>({})

  const esperando = useMemo(() => dbShipments
    .filter(s => (s.mode === 'lcl' || s.mode === 'air') && !s.archived)
    .filter(s => !refsEnCamion.has(String(s.ref || '').trim().toUpperCase()))
    .filter(s => estadoLcl(
      { ref: s.ref, eta: s.eta, stock: s.stock, desconsol: s.desconsol_date },
      hoy,
    ) === 'aguarda_stock')
    // La que llegó primero es la que más tiempo lleva sin stock.
    .sort((a, b) => String(a.eta || '').localeCompare(String(b.eta || ''))),
    [dbShipments, refsEnCamion, hoy])

  const guardar = (s: DbShipment) => {
    const valor = (borradores[s.id] || '').trim()
    if (!valor) { toast.error('Escribí el número de stock'); return }
    // Desconsolidar ES entregar el stock: la fecha de hoy es la que arranca el
    // reloj de almacenaje. Si ya venía cargada, se respeta.
    onPatch(s.id, { stock: valor, desconsol_date: s.desconsol_date || hoy })
    setBorradores(prev => { const copia = { ...prev }; delete copia[s.id]; return copia })
    toast.success(`${s.ref}: stock ${valor}`)
  }

  const diasEsperandoStock = (s: DbShipment): number | null => {
    if (!s.eta) return null
    const ms = new Date(hoy).getTime() - new Date(String(s.eta).slice(0, 10)).getTime()
    return Math.max(0, Math.round(ms / 86_400_000))
  }

  if (esperando.length === 0) {
    if (embebida) return null
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center">
        <Package size={32} className="mx-auto mb-3 opacity-40" />
        <p className="text-sm text-muted-foreground">
          No hay cargas esperando stock. Cuando llegue una LCL sin stock, aparece acá.
        </p>
      </div>
    )
  }

  return (
    <div className={embebida ? '' : 'rounded-xl border border-border bg-card overflow-hidden'}>
      {!embebida && (
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Aguarda stock · {esperando.length}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Llegaron y el depósito todavía no dio el stock. Al cargarlo quedan listas para camión.
          </p>
        </div>
      )}
      <div className="divide-y divide-border">
        {esperando.map(s => {
          const dias = diasEsperandoStock(s)
          return (
            <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <div className="min-w-[7rem]">
                <div className="text-sm font-semibold">{s.ref}</div>
                <div className="text-[11px] text-muted-foreground">{s.cliente || '—'}</div>
              </div>
              <div className="text-xs text-muted-foreground min-w-[8rem]">
                llegó {s.eta || '—'}
                {dias !== null && dias > 0 && (
                  <span className={dias > 7 ? 'ml-1 font-semibold text-orange-700' : 'ml-1'}>
                    · hace {dias}d
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground min-w-[6rem]">
                {s.fiscal || 'sin fiscal'}
              </div>
              <Input
                value={borradores[s.id] ?? ''}
                onChange={e => setBorradores(prev => ({ ...prev, [s.id]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') guardar(s) }}
                placeholder="nº de stock"
                className="h-9 w-40 text-sm"
              />
              <Button
                size="sm"
                onClick={() => guardar(s)}
                disabled={!(borradores[s.id] || '').trim()}
              >
                Guardar
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
