import { useMemo } from 'react'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import { Package, Truck, MapPin, X, Warning, Calendar } from '@phosphor-icons/react'

interface AgendaPendingSidebarProps {
  shipments: ParsedShipment[]
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
}

const REASON_CONFIG: Record<PendingReason, { label: string; icon: typeof MapPin; color: string }> = {
  no_depot: {
    label: 'Sin depósito asignado',
    icon: MapPin,
    color: 'text-rose-600 dark:text-rose-400',
  },
  no_transport: {
    label: 'Sin transporte asignado',
    icon: Truck,
    color: 'text-amber-600 dark:text-amber-400',
  },
  no_salida: {
    label: 'Falta fecha de salida',
    icon: Calendar,
    color: 'text-blue-600 dark:text-blue-400',
  },
}

export default function AgendaPendingSidebar({ shipments, onClose, onSelectShipment }: AgendaPendingSidebarProps) {
  // Find all operativas that need coordination attention:
  // - Must have a container allocated (CNTR_OP) so it's actionable
  // - Must NOT have SALIDA yet (already dispatched = done)
  // - Categorize by what's missing: depot, transport, or just the salida date
  const pendingItems = useMemo(() => {
    const items: PendingItem[] = []

    for (const s of shipments) {
      if (!s.operativas || s.operativas.length === 0) continue

      for (const op of s.operativas) {
        const cntr = (op.CNTR_OP || s.CNTR || '').trim()
        if (!cntr) continue

        const hasSalida = (op.SALIDA || '').trim() !== ''
        if (hasSalida) continue

        const deposito = (op.DEPOSITO || '').trim()
        const transporte = (op.TRANSPORTE || '').trim()

        let reason: PendingReason
        if (!deposito) reason = 'no_depot'
        else if (!transporte) reason = 'no_transport'
        else reason = 'no_salida'

        items.push({
          shipment: s,
          ref: (s.REF || '').replace(/^A/i, ''),
          cliente: s.CLIENTE || op.CLIENTE_OP || '-',
          deposito: deposito ? deposito.toUpperCase() : '—',
          transporte: transporte || '—',
          cntr,
          tipo: op.TIPO || '',
          operativa: op.OPERATIVA || '-',
          reason,
        })
      }
    }

    return items
  }, [shipments])

  // Group by reason, ordered by urgency
  const groupedByReason = useMemo(() => {
    const order: PendingReason[] = ['no_depot', 'no_transport', 'no_salida']
    const groups: Record<PendingReason, PendingItem[]> = {
      no_depot: [],
      no_transport: [],
      no_salida: [],
    }
    for (const item of pendingItems) {
      groups[item.reason].push(item)
    }
    // Sort each group by ref for consistent display
    for (const key of order) {
      groups[key].sort((a, b) => a.ref.localeCompare(b.ref))
    }
    return order.map(key => ({ reason: key, items: groups[key] })).filter(g => g.items.length > 0)
  }, [pendingItems])

  return (
    <div className="w-80 border-l bg-background flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-muted/30">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Warning className="text-amber-500" size={18} weight="fill" />
            Pendientes de coordinar
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {pendingItems.length} operativa{pendingItems.length !== 1 ? 's' : ''} sin cerrar
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-muted rounded-md transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {pendingItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No hay cargas pendientes de coordinar</p>
            <p className="text-[11px] mt-1">Todas las operativas con contenedor tienen depósito, transporte y fecha de salida.</p>
          </div>
        ) : (
          groupedByReason.map(({ reason, items }) => {
            const config = REASON_CONFIG[reason]
            const Icon = config.icon
            return (
              <div key={reason}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={14} className={config.color} weight="fill" />
                  <span className={`text-xs font-semibold uppercase tracking-wide ${config.color}`}>
                    {config.label}
                  </span>
                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">
                    {items.length}
                  </span>
                </div>

                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <button
                      key={`${item.ref}-${item.cntr}-${idx}`}
                      onClick={() => onSelectShipment(item.shipment)}
                      className="w-full text-left p-3 rounded-lg border bg-muted/30 hover:bg-muted/60 transition-all hover:shadow-sm"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-sm">A{item.ref}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-background/80 font-medium">
                          {item.operativa}
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground mb-1.5 truncate">{item.cliente}</p>

                      <div className="flex items-center gap-3 text-[11px]">
                        <span className="flex items-center gap-1">
                          <Package size={12} />
                          {item.cntr ? item.cntr.substring(0, 11) : '-'}
                        </span>
                        {item.tipo && (
                          <span className="text-muted-foreground">{item.tipo}</span>
                        )}
                      </div>

                      <div className="flex flex-col gap-0.5 mt-1.5 text-[11px] text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <MapPin size={12} className={item.deposito === '—' ? 'text-rose-500' : ''} />
                          <span className={item.deposito === '—' ? 'text-rose-600 font-medium' : ''}>
                            {item.deposito}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Truck size={12} className={item.transporte === '—' ? 'text-amber-500' : ''} />
                          <span className={item.transporte === '—' ? 'text-amber-600 font-medium' : ''}>
                            {item.transporte}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Footer summary */}
      {pendingItems.length > 0 && (
        <div className="p-3 border-t bg-muted/20 text-xs text-muted-foreground">
          {groupedByReason.length} categoría{groupedByReason.length !== 1 ? 's' : ''} · {pendingItems.length} operativa{pendingItems.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}
