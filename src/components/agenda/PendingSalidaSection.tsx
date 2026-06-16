import type { ParsedShipment } from '@/lib/shipmentTypes'
import type { PendingSalidaItem } from '@/lib/agendaUtils'
import { pendingSalida, formatDateShort, daysUntil } from '@/lib/agendaUtils'
import { useMemo } from 'react'
import { Package } from '@phosphor-icons/react'

interface PendingSalidaSectionProps {
  shipments: ParsedShipment[]
  editable: boolean
  onCoordinar: (shipment: ParsedShipment, cntr: string) => void
}

/** Color classes for LIBRE urgency chips */
function libreUrgencyClass(libreStr: string): string {
  if (!libreStr) return 'text-muted-foreground'
  const days = daysUntil(libreStr)
  if (days === 999) return 'text-muted-foreground' // not parseable
  if (days <= 0) return 'text-red-600 font-semibold'   // overdue or today
  if (days <= 2) return 'text-amber-600 font-medium'   // ≤2 days
  return 'text-muted-foreground'
}

function libreLabel(libreStr: string): string {
  if (!libreStr) return '—'
  const days = daysUntil(libreStr)
  const dateLabel = formatDateShort(libreStr)
  if (days === 999) return dateLabel
  if (days < 0) return `${dateLabel} (venc. hace ${Math.abs(days)}d)`
  if (days === 0) return `${dateLabel} (vence HOY)`
  if (days === 1) return `${dateLabel} (mañana)`
  return `${dateLabel} (${days}d)`
}

export default function PendingSalidaSection({ shipments, editable, onCoordinar }: PendingSalidaSectionProps) {
  const today = useMemo(() => new Date(), [])
  const items: PendingSalidaItem[] = useMemo(
    () => pendingSalida(shipments, today),
    [shipments, today]
  )

  if (items.length === 0) {
    return (
      <div className="rounded-xl border bg-card px-4 py-3">
        <h3 className="text-sm font-semibold text-muted-foreground mb-1">
          Pendientes de coordinar salida (0)
        </h3>
        <p className="text-xs text-muted-foreground">No hay cargas pendientes de coordinar salida.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-blue-50/60">
        <Package size={16} className="text-blue-500 shrink-0" weight="fill" />
        <h3 className="text-sm font-semibold text-blue-800 leading-tight">
          Pendientes de coordinar salida ({items.length})
        </h3>
      </div>

      {/* Grid of cards */}
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {items.map(({ shipment: s, op }, idx) => {
          const cntr = (op.CNTR_OP || s.CNTR || '').trim()
          const ref = (s.REF || '').replace(/^A/i, '')
          const cliente = s.CLIENTE || op.CLIENTE_OP || '—'
          const deposito = (op.DEPOSITO || '').toUpperCase() || '—'
          const etaLabel = formatDateShort(op.ETA_OP || s.ETA || '')
          const libreStr = op.LIBRE || s.LIBRE_HASTA || ''
          const kg = op.KG ?? 0
          const pkgs = op.PKGS ?? 0
          const hasCargoInfo = kg > 0 || pkgs > 0

          return (
            <button
              key={`${s.REF}-${cntr}-${idx}`}
              disabled={!editable}
              onClick={() => editable && onCoordinar(s, cntr)}
              className={`w-full text-left rounded-lg border border-border/60 overflow-hidden bg-background
                transition-all group
                ${editable
                  ? 'hover:shadow-md hover:border-blue-300 hover:-translate-y-0.5 cursor-pointer'
                  : 'cursor-default opacity-80'
                }`}
            >
              {/* Blue top strip */}
              <div className="h-1 bg-blue-500" />

              <div className="px-2.5 py-2 space-y-1">
                {/* Row 1: REF bold + CNTR mono */}
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span className="text-xs font-bold text-foreground shrink-0">{ref}</span>
                  <span className="text-[10.5px] font-mono text-muted-foreground truncate">{cntr}</span>
                </div>

                {/* Row 2: Cliente */}
                <div className="text-[11px] text-foreground/80 truncate">{cliente}</div>

                {/* Row 3: Depósito */}
                <div className="text-[10.5px] text-muted-foreground truncate">
                  <span className="font-medium text-foreground/70">{deposito}</span>
                </div>

                {/* Row 4: ETA */}
                <div className="text-[10px] text-muted-foreground">
                  ETA <span className="font-medium">{etaLabel || '—'}</span>
                </div>

                {/* Row 5: LIBRE with urgency color */}
                {libreStr ? (
                  <div className={`text-[10px] ${libreUrgencyClass(libreStr)}`}>
                    Libre: {libreLabel(libreStr)}
                  </div>
                ) : null}

                {/* Row 6: kg + bultos */}
                {hasCargoInfo && (
                  <div className="text-[10px] text-muted-foreground">
                    {kg > 0 && kg.toLocaleString('es-UY') + ' kg'}
                    {kg > 0 && pkgs > 0 && ' · '}
                    {pkgs > 0 && pkgs.toLocaleString('es-UY') + ' btos'}
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
