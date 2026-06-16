import type { ParsedShipment } from '@/lib/shipmentTypes'
import type { PendingSalidaItem, DestZone } from '@/lib/agendaUtils'
import { pendingSalida, formatDateShort, daysUntil } from '@/lib/agendaUtils'
import { useMemo, useState } from 'react'
import { Package } from '@phosphor-icons/react'

interface PendingSalidaSectionProps {
  shipments: ParsedShipment[]
  editable: boolean
  onCoordinar: (shipment: ParsedShipment, cntr: string) => void
}

/** Friendly label for each destination zone. */
const DEST_LABELS: Record<DestZone, string> = {
  UY: 'Montevideo',
  AR: 'Buenos Aires',
  CL: 'San Antonio',
  OTRO: 'Otros',
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

/** Derive the ordered list of zones that actually appear in `items`.
 *  UY always comes first if present (it's the primary/default zone). */
function deriveZones(items: PendingSalidaItem[]): DestZone[] {
  const counts = new Map<DestZone, number>()
  for (const item of items) {
    counts.set(item.dest, (counts.get(item.dest) ?? 0) + 1)
  }
  const order: DestZone[] = ['UY', 'AR', 'CL', 'OTRO']
  return order.filter(z => counts.has(z))
}

export default function PendingSalidaSection({ shipments, editable, onCoordinar }: PendingSalidaSectionProps) {
  const today = useMemo(() => new Date(), [])
  const items: PendingSalidaItem[] = useMemo(
    () => pendingSalida(shipments, today),
    [shipments, today]
  )

  // Derive the zones that are present, then default to UY (or first available).
  const zones = useMemo(() => deriveZones(items), [items])
  const defaultZone: DestZone | 'ALL' = useMemo(() => zones.includes('UY') ? 'UY' : (zones[0] ?? 'ALL'), [zones])
  const [selectedZone, setSelectedZone] = useState<DestZone | 'ALL'>(defaultZone)

  // When the zone list changes (data refresh), reset to default if current zone vanished.
  const effectiveZone: DestZone | 'ALL' = zones.length === 0
    ? 'ALL'
    : (selectedZone === 'ALL' || zones.includes(selectedZone as DestZone))
      ? selectedZone
      : defaultZone

  const filteredItems = useMemo(
    () => effectiveZone === 'ALL' ? items : items.filter(i => i.dest === effectiveZone),
    [items, effectiveZone]
  )

  // Count per zone (for chip badges)
  const zoneCounts = useMemo(() => {
    const m = new Map<DestZone | 'ALL', number>()
    m.set('ALL', items.length)
    for (const z of zones) {
      m.set(z, items.filter(i => i.dest === z).length)
    }
    return m
  }, [items, zones])

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

      {/* Destination filter chips — only shown when there are 2+ zones */}
      {zones.length >= 2 && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5 pb-1">
          {zones.map(z => {
            const active = effectiveZone === z
            const count = zoneCounts.get(z) ?? 0
            return (
              <button
                key={z}
                onClick={() => setSelectedZone(z)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors
                  ${active
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-background text-muted-foreground border-border hover:border-blue-300 hover:text-blue-700'
                  }`}
              >
                {DEST_LABELS[z]}
                <span className={`rounded-full px-1 text-[10px] ${active ? 'bg-blue-400/60' : 'bg-muted'}`}>
                  {count}
                </span>
              </button>
            )
          })}
          {/* "Todos" chip — only when a specific zone is selected */}
          {effectiveZone !== 'ALL' && (
            <button
              onClick={() => setSelectedZone('ALL')}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium border border-border text-muted-foreground hover:border-blue-300 hover:text-blue-700 transition-colors"
            >
              Todos
              <span className="rounded-full px-1 text-[10px] bg-muted">{items.length}</span>
            </button>
          )}
        </div>
      )}

      {/* Grid of cards */}
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {filteredItems.map(({ shipment: s, op }, idx) => {
          const cntr = (op.CNTR_OP || s.CNTR || '').trim()
          const ref = (s.REF || '').replace(/^A/i, '')
          const cliente = s.CLIENTE || op.CLIENTE_OP || '—'
          const deposito = (op.DEPOSITO || '').toUpperCase() || '—'
          const etaLabel = formatDateShort(s.ETA || op.ETA_OP || '')
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
