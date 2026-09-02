import { useMemo } from 'react'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import { parseLocalDate } from '@/lib/shipmentTypes'
import { Package, Truck, MapPin, X, Warning, Calendar } from '@phosphor-icons/react'
import { useBrand } from '@/lib/brand'
import { etaVigente } from '@/lib/salidaCheck'

interface AgendaPendingSidebarProps {
  shipments: ParsedShipment[]
  /** Only surface shipments whose ETA is today/past or within this many days. */
  windowDays?: number
  onClose: () => void
  onSelectShipment: (shipment: ParsedShipment) => void
}

type PendingReason = 'no_depot' | 'no_transport' | 'no_salida'

interface PendingItem {
  shipment: ParsedShipment
  ref: string
  cliente: string
  deposito: string
  transporte: string
  cntr: string
  tipo: string
  operativa: string
  reason: PendingReason
  etaStr: string
  daysUntilEta: number // negative = already arrived N days ago
}

// Visual config per reason: left accent stripe + icon + label + chip color.
// Using strong colors on the stripe keeps the card body calm while making
// the category obvious at a glance even when scrolling fast.
const REASON_CONFIG: Record<PendingReason, {
  label: string
  icon: typeof MapPin
  stripe: string      // left border stripe
  chip: string        // tiny badge background
  chipText: string
  headerText: string
}> = {
  no_depot: {
    label: 'Sin depósito',
    icon: MapPin,
    stripe: 'border-l-rose-500',
    chip: 'bg-rose-50',
    chipText: 'text-rose-700',
    headerText: 'text-rose-600',
  },
  no_transport: {
    label: 'Sin transporte',
    icon: Truck,
    stripe: 'border-l-amber-500',
    chip: 'bg-amber-50',
    chipText: 'text-amber-700',
    headerText: 'text-amber-600',
  },
  no_salida: {
    label: 'Falta salida',
    icon: Calendar,
    stripe: 'border-l-blue-500',
    chip: 'bg-blue-50',
    chipText: 'text-blue-700',
    headerText: 'text-blue-600',
  },
}

const REASON_HEADERS: Record<PendingReason, string> = {
  no_depot: 'Sin depósito asignado',
  no_transport: 'Sin transporte asignado',
  no_salida: 'Falta fecha de salida',
}

function etaPill(daysUntil: number): { text: string; cls: string } {
  if (daysUntil < 0) {
    const ago = Math.abs(daysUntil)
    return {
      text: ago === 1 ? 'llegó ayer' : `llegó hace ${ago}d`,
      cls: 'bg-emerald-50 text-emerald-700',
    }
  }
  if (daysUntil === 0) return { text: 'llega HOY', cls: 'bg-rose-100 text-rose-700 font-bold' }
  if (daysUntil === 1) return { text: 'llega mañana', cls: 'bg-amber-100 text-amber-700 font-semibold' }
  return { text: `llega en ${daysUntil}d`, cls: 'bg-amber-50 text-amber-700' }
}

export default function AgendaPendingSidebar({ shipments, windowDays = 4, onClose, onSelectShipment }: AgendaPendingSidebarProps) {
  // Find operativas that need coordination attention:
  // - Has CNTR_OP allocated (actionable)
  // - No SALIDA yet (not dispatched)
  // - ETA is today/past OR within windowDays (relevant right now)
  // Categorize by what's missing: depot, transport, or just the salida date.
  const pendingItems = useMemo(() => {
    const items: PendingItem[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const MS_DAY = 24 * 60 * 60 * 1000

    for (const s of shipments) {
      if (!s.operativas || s.operativas.length === 0) continue

      for (const op of s.operativas) {
        const cntr = (op.CNTR_OP || s.CNTR || '').trim()
        if (!cntr) continue

        const hasSalida = (op.SALIDA || '').trim() !== ''
        if (hasSalida) continue

        const etaStr = etaVigente(s.ETA, op.ETA_OP)
        const etaDate = parseLocalDate(etaStr)
        if (!etaDate) continue

        const daysUntilEta = Math.ceil((etaDate.getTime() - today.getTime()) / MS_DAY)
        if (daysUntilEta > windowDays) continue

        const deposito = (op.DEPOSITO || '').trim()
        const transporte = (op.TRANSPORTE || '').trim()

        let reason: PendingReason
        if (!deposito) reason = 'no_depot'
        else if (!transporte) reason = 'no_transport'
        else reason = 'no_salida'

        items.push({
          shipment: s,
          ref: (s.REF || '').replace(/^A/i, ''),
          cliente: s.CLIENTE || op.CLIENTE_OP || '—',
          deposito: deposito.toUpperCase(),
          transporte,
          cntr,
          tipo: op.TIPO || '',
          operativa: op.OPERATIVA || '',
          reason,
          etaStr,
          daysUntilEta,
        })
      }
    }

    return items
  }, [shipments, windowDays])

  // Group by reason, then sort each group by ETA urgency (earliest first)
  const groupedByReason = useMemo(() => {
    const order: PendingReason[] = ['no_depot', 'no_transport', 'no_salida']
    const groups: Record<PendingReason, PendingItem[]> = {
      no_depot: [],
      no_transport: [],
      no_salida: [],
    }
    for (const item of pendingItems) groups[item.reason].push(item)
    for (const key of order) groups[key].sort((a, b) => a.daysUntilEta - b.daysUntilEta)
    return order.map(key => ({ reason: key, items: groups[key] })).filter(g => g.items.length > 0)
  }, [pendingItems])

  // Fino por marca (handoff 03-admin · Agenda): el panel "Sin coordinar" con
  // el naranja de aviso del sistema bajo Mediterránea.
  const med = useBrand().id === 'med'
  return (
    <div className="w-80 border-l bg-background flex flex-col h-full overflow-hidden">
      {/* Header — compact, single row */}
      <div className={med ? 'flex items-center justify-between px-4 py-3 border-b bg-gradient-to-b from-med-aviso-tinte to-transparent' : 'flex items-center justify-between px-4 py-3 border-b bg-gradient-to-b from-amber-50/60 to-transparent'}>
        <div className="flex items-center gap-2 min-w-0">
          <Warning className={med ? 'text-med-aviso shrink-0' : 'text-amber-500 shrink-0'} size={18} weight="fill" />
          <div className="min-w-0">
            <h3 className={med ? 'titulo-med text-[15px] text-med-violeta leading-tight' : 'font-semibold text-sm leading-tight'}>Pendientes</h3>
            <p className="text-[10.5px] text-muted-foreground leading-tight">
              {pendingItems.length} · llegan ≤ {windowDays}d
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 -m-1 hover:bg-muted rounded-md transition-colors shrink-0"
          aria-label="Cerrar panel de pendientes"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {pendingItems.length === 0 ? (
          <div className="text-center px-6 py-12 text-muted-foreground">
            <Package size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">Todo en orden</p>
            <p className="text-[11px] mt-1 leading-snug">
              Las cargas que llegan en {windowDays} día{windowDays !== 1 ? 's' : ''} o menos ya están coordinadas.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {groupedByReason.map(({ reason, items }) => {
              const config = REASON_CONFIG[reason]
              const Icon = config.icon
              return (
                <div key={reason} className="py-2">
                  {/* Section header */}
                  <div className="flex items-center gap-2 px-3 py-1.5 sticky top-0 bg-background/95 backdrop-blur z-[1]">
                    <Icon size={12} className={config.headerText} weight="fill" />
                    <span className={`text-[10.5px] font-bold uppercase tracking-wider ${config.headerText}`}>
                      {REASON_HEADERS[reason]}
                    </span>
                    <span className="ml-auto text-[10px] font-semibold bg-muted text-muted-foreground px-1.5 rounded-full">
                      {items.length}
                    </span>
                  </div>

                  {/* Items */}
                  <div className="px-2 space-y-1">
                    {items.map((item, idx) => {
                      const eta = etaPill(item.daysUntilEta)
                      return (
                        <button
                          key={`${item.ref}-${item.cntr}-${idx}`}
                          onClick={() => onSelectShipment(item.shipment)}
                          className={`group w-full text-left px-3 py-2 rounded-md border-l-2 border-y border-r border-border ${config.stripe} bg-card hover:bg-muted/40 hover:shadow-sm transition-all`}
                        >
                          {/* Top: REF · cliente · ETA */}
                          <div className="flex items-baseline gap-2 mb-1.5">
                            <span className={med ? 'ref-med text-[13px] shrink-0' : 'font-bold text-[13px] font-mono text-foreground shrink-0'}>
                              A{item.ref}
                            </span>
                            <span className="text-[11.5px] text-muted-foreground truncate flex-1">
                              {item.cliente}
                            </span>
                            <span className={`text-[9.5px] px-1.5 py-0.5 rounded shrink-0 ${eta.cls}`}>
                              {eta.text}
                            </span>
                          </div>

                          {/* Middle: container + type */}
                          <div className="flex items-center gap-2 text-[10.5px] text-muted-foreground mb-1.5">
                            <Package size={11} className="shrink-0" />
                            <span className="font-mono">{item.cntr}</span>
                            {item.tipo && (
                              <span className="px-1.5 py-0.5 bg-muted rounded text-[9.5px] font-medium">
                                {item.tipo}
                              </span>
                            )}
                            {item.operativa && (
                              <span className="ml-auto text-[9.5px] uppercase tracking-wide opacity-70">
                                {item.operativa}
                              </span>
                            )}
                          </div>

                          {/* Bottom: depot + transport status in one row */}
                          <div className="flex items-center gap-1.5 text-[10.5px]">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${
                              item.deposito
                                ? 'bg-muted/60 text-foreground'
                                : 'bg-rose-50 text-rose-600 italic'
                            }`}>
                              <MapPin size={10} weight={item.deposito ? 'regular' : 'fill'} />
                              {item.deposito || 'sin depósito'}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${
                              item.transporte
                                ? 'bg-muted/60 text-foreground'
                                : 'bg-amber-50 text-amber-600 italic'
                            }`}>
                              <Truck size={10} weight={item.transporte ? 'regular' : 'fill'} />
                              {item.transporte || 'sin transporte'}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer summary */}
      {pendingItems.length > 0 && (
        <div className="px-3 py-2 border-t bg-muted/20 text-[10.5px] text-muted-foreground text-center">
          {groupedByReason.length} categoría{groupedByReason.length !== 1 ? 's' : ''} · {pendingItems.length} operativa{pendingItems.length !== 1 ? 's' : ''} · ETA ≤ {windowDays} días
        </div>
      )}
    </div>
  )
}
