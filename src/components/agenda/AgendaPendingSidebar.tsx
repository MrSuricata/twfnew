import { useMemo } from 'react'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import { Package, Truck, MapPin, X, Warning } from '@phosphor-icons/react'

interface AgendaPendingSidebarProps {
  shipments: ParsedShipment[]
  onClose: () => void
  onSelectShipment: (shipment: ParsedShipment) => void
}

export default function AgendaPendingSidebar({ shipments, onClose, onSelectShipment }: AgendaPendingSidebarProps) {
  // Find shipments with DEPOSITO + TRANSPORTE assigned but no SALIDA date
  const pendingCoordination = useMemo(() => {
    const pending: Array<{
      shipment: ParsedShipment
      ref: string
      cliente: string
      deposito: string
      transporte: string
      cntr: string
      tipo: string
      operativa: string
    }> = []

    for (const s of shipments) {
      if (!s.operativas || s.operativas.length === 0) continue

      for (const op of s.operativas) {
        const hasDeposito = op.DEPOSITO && op.DEPOSITO.trim() !== ''
        const hasTransporte = op.TRANSPORTE && op.TRANSPORTE.trim() !== ''
        const noSalida = !op.SALIDA || op.SALIDA.trim() === ''

        if (hasDeposito && hasTransporte && noSalida) {
          pending.push({
            shipment: s,
            ref: (s.REF || '').replace(/^A/i, ''),
            cliente: s.CLIENTE || op.CLIENTE_OP || '-',
            deposito: op.DEPOSITO.trim().toUpperCase(),
            transporte: op.TRANSPORTE.trim(),
            cntr: op.CNTR_OP || s.CNTR || '-',
            tipo: op.TIPO || '',
            operativa: op.OPERATIVA || '-'
          })
        }
      }
    }

    // Group by depot
    pending.sort((a, b) => a.deposito.localeCompare(b.deposito))
    return pending
  }, [shipments])

  // Group by depot for visual grouping
  const groupedByDepot = useMemo(() => {
    const groups: Record<string, typeof pendingCoordination> = {}
    for (const item of pendingCoordination) {
      if (!groups[item.deposito]) groups[item.deposito] = []
      groups[item.deposito].push(item)
    }
    return groups
  }, [pendingCoordination])

  const depotColors: Record<string, string> = {
    'GODILCO': 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800',
    'PLANIR': 'bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800',
    'TCP': 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800',
    'OLAVERRY': 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800',
    'TRANSCAL': 'bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800',
  }

  const getDepotColor = (depot: string) => depotColors[depot] || 'bg-muted/30 border-muted'

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
            {pendingCoordination.length} carga{pendingCoordination.length !== 1 ? 's' : ''} sin fecha de salida
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
        {pendingCoordination.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Todas las cargas tienen fecha de salida asignada</p>
          </div>
        ) : (
          Object.entries(groupedByDepot).map(([depot, items]) => (
            <div key={depot}>
              <div className="flex items-center gap-2 mb-2">
                <MapPin size={14} className="text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {depot}
                </span>
                <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">
                  {items.length}
                </span>
              </div>

              <div className="space-y-2">
                {items.map((item, idx) => (
                  <button
                    key={`${item.ref}-${idx}`}
                    onClick={() => onSelectShipment(item.shipment)}
                    className={`w-full text-left p-3 rounded-lg border transition-all hover:shadow-sm hover:scale-[1.01] ${getDepotColor(depot)}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">A{item.ref}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-background/80 font-medium">
                        {item.operativa}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground mb-1.5">{item.cliente}</p>

                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="flex items-center gap-1">
                        <Package size={12} />
                        {item.cntr ? item.cntr.substring(0, 11) : '-'}
                      </span>
                      {item.tipo && (
                        <span className="text-muted-foreground">{item.tipo}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 mt-1.5 text-[11px] text-muted-foreground">
                      <Truck size={12} />
                      <span>{item.transporte}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer summary */}
      {pendingCoordination.length > 0 && (
        <div className="p-3 border-t bg-muted/20 text-xs text-muted-foreground">
          {Object.keys(groupedByDepot).length} depósito{Object.keys(groupedByDepot).length !== 1 ? 's' : ''} · {pendingCoordination.length} operativa{pendingCoordination.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}
