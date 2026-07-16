// ─── Modal de camión consolidado en la Agenda (pedido Brian 15/07/2026) ──
// Antes, tocar un hito 🚛 abría el ShipmentDetailsDialog viejo con un
// shipment sintético (formato desactualizado, todo de solo lectura). Ahora
// abre este modal propio: cabecera del camión (estado DERIVADO de las
// fechas, mismo criterio que estados/tracking), sus fechas, los totales
// contra la capacidad y la lista de cargas relacionadas — cada referencia
// es clickeable y abre su ficha completa (onOpenDetail, solo admin).
import { useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Truck as TruckIcon, ArrowSquareOut } from '@phosphor-icons/react'
import type { Truck, TruckLoad } from '@/lib/truckTypes'
import {
  effectiveTruckLoads,
  computeTruckTotals,
  deriveTruckDisplayInfo,
  getTruckLimits,
  TRUCK_STATUS_COLORS,
} from '@/lib/truckTypes'
import { fmtDateDMY, fmtNum } from '@/lib/format'

interface TruckAgendaDialogProps {
  /** Camión a mostrar (null = modal cerrado). */
  truck: Truck | null
  /** TODAS las cargas de camiones — acá se filtran las de este camión. */
  loads: TruckLoad[]
  onClose: () => void
  /** Abre la ficha completa de una carga por ref (overlay) — solo admin. */
  onOpenDetail?: (ref: string) => void
  /** Refs (UPPER/trim) de cargas SIN telex — alerta 🚨 en la fila. */
  sinTelexRefs?: Set<string>
}

function FechaBox({ label, value, hoy }: { label: string; value: string; hoy?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${hoy ? 'border-amber-300 bg-amber-50' : 'bg-muted/30'}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm font-medium ${value ? '' : 'text-muted-foreground'}`}>
        {value ? fmtDateDMY(value) : '—'}{hoy ? ' · HOY' : ''}
      </p>
    </div>
  )
}

export default function TruckAgendaDialog({ truck, loads, onClose, onOpenDetail, sinTelexRefs }: TruckAgendaDialogProps) {
  // Cargas confirmadas del camión (mismo criterio que agenda/estados: las
  // 'add' de un borrador de edición NO existen todavía).
  const mine = useMemo(
    () =>
      truck
        ? effectiveTruckLoads(loads, truck.id, { includePending: false }).sort((a, b) => a.position - b.position)
        : [],
    [truck, loads],
  )
  const totals = useMemo(() => (truck ? computeTruckTotals(truck, mine) : null), [truck, mine])

  if (!truck) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const info = deriveTruckDisplayInfo(truck, today)
  const limits = getTruckLimits(truck.isSider)
  const esHoy = (s: string) => !!s && s === today.toISOString().slice(0, 10)

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <TruckIcon size={20} /> {truck.code}
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${TRUCK_STATUS_COLORS[info.status]}`}>
              {info.label}
            </span>
            {truck.isSider && (
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs text-violet-700">SIDER</span>
            )}
          </DialogTitle>
          <DialogDescription>
            {[truck.transport, truck.driver, truck.plate].filter(Boolean).join(' · ') || 'Camión consolidado'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Fechas del viaje */}
          <div className="grid grid-cols-3 gap-2">
            <FechaBox label="Carga" value={truck.loadDate} hoy={esHoy(truck.loadDate)} />
            <FechaBox label="Salida" value={truck.departureDate} hoy={esHoy(truck.departureDate)} />
            <FechaBox label="Llega a fiscal" value={truck.arrivalDate} hoy={esHoy(truck.arrivalDate)} />
          </div>

          {/* Totales vs capacidad */}
          {totals && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span><strong>{totals.loadCount}</strong> carga{totals.loadCount === 1 ? '' : 's'}</span>
              <span>{fmtNum(totals.pkgs)} bultos</span>
              <span className={totals.overKg ? 'text-red-600 font-medium' : ''}>
                {fmtNum(Math.round(totals.kg))} kg{totals.overKg ? ` ⚠️ (máx ${fmtNum(limits.kgMax)})` : ''}
              </span>
              <span className={totals.overM3 ? 'text-red-600 font-medium' : ''}>
                {fmtNum(Math.round(totals.m3 * 100) / 100)} m³{totals.overM3 ? ` ⚠️ (máx ${limits.m3Max})` : ''}
              </span>
              {totals.multifiscal && (
                <span className="text-amber-700">⚠️ {totals.fiscals.length} fiscales: {totals.fiscals.join(', ')}</span>
              )}
            </div>
          )}

          {/* Cargas relacionadas */}
          {mine.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin cargas asignadas todavía.</p>
          ) : (
            <div className="rounded-md border divide-y">
              {mine.map(l => {
                const sinTelex = sinTelexRefs?.has((l.sourceRef || '').trim().toUpperCase())
                return (
                  <div key={l.id} className="px-3 py-2 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      {onOpenDetail ? (
                        <button
                          type="button"
                          onClick={() => { onClose(); onOpenDetail(l.sourceRef) }}
                          title="Abrir la ficha de esta carga"
                          className="font-mono text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
                        >
                          {l.sourceRef} <ArrowSquareOut size={13} />
                        </button>
                      ) : (
                        <span className="font-mono text-sm font-medium">{l.sourceRef}</span>
                      )}
                      <span className="text-sm truncate">{l.client}</span>
                      {sinTelex && <span title="SIN TELEX — sin la liberación de la naviera esta carga no se puede retirar">🚨</span>}
                      {l.wood && <span title="Lleva madera">🪵</span>}
                      {l.fiscal && (
                        <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{l.fiscal}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span>{fmtNum(l.pkgs)} bultos · {fmtNum(Math.round(l.kg))} kg · {l.m3} m³</span>
                      {l.bl && <span className="font-mono select-text">BL {l.bl}</span>}
                      {l.stock && <span>Stock {l.stock}</span>}
                      {l.description && <span className="truncate max-w-[16rem]">{l.description}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {truck.notes && (
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs whitespace-pre-wrap">{truck.notes}</p>
          )}
          {onOpenDetail && mine.length > 0 && (
            <p className="text-[11px] text-muted-foreground">Tocá una referencia para abrir su ficha completa.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
