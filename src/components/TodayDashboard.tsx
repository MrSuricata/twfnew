import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Truck,
  Warehouse,
  MapPin,
  Warning,
  Coffee,
  Package,
  Clock,
  Siren,
} from '@phosphor-icons/react'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import {
  buildTodaySnapshot,
  type OpMatch,
  type LibreAlert,
} from '@/lib/todayFilters'
import ShipmentDetailsDialog from './ShipmentDetailsDialog'
import type { ShipmentDocument, OperativeReport, OriginPhoto } from '@/lib/quotationTypes'

interface TodayDashboardProps {
  shipments: ParsedShipment[]
  documents?: ShipmentDocument[]
  reports?: OperativeReport[]
  originPhotos?: OriginPhoto[]
  onUpdateShipments?: (shipments: ParsedShipment[]) => void
  onUpdateOriginPhotos?: (photos: OriginPhoto[]) => void
}

/**
 * "HOY" — quick-glance dashboard for TWF staff.
 *
 * Shows three cards (cargas saliendo / en frontera / llegando a fiscal) + a LIBRE alert
 * strip. Intended as the default admin landing — what's moving today, at a glance.
 */
export default function TodayDashboard({
  shipments,
  documents = [],
  reports = [],
  originPhotos = [],
  onUpdateShipments,
  onUpdateOriginPhotos,
}: TodayDashboardProps) {
  const [selected, setSelected] = useState<ParsedShipment | null>(null)
  const [open, setOpen] = useState(false)

  const snapshot = useMemo(() => buildTodaySnapshot(shipments), [shipments])

  const openShipment = (s: ParsedShipment) => {
    setSelected(s)
    setOpen(true)
  }

  const todayLabel = new Date().toLocaleDateString('es-UY', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold capitalize">Hoy — {todayLabel}</h1>
        <p className="text-sm text-muted-foreground">
          {snapshot.hasMovement
            ? `${snapshot.totalCount} movimientos programados hoy${snapshot.libreAlerts.length > 0 ? ` · ${snapshot.libreAlerts.length} alertas LIBRE` : ''}`
            : 'Día tranquilo — sin movimientos programados'}
        </p>
      </div>

      {/* Empty state */}
      {!snapshot.hasMovement && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Coffee size={48} weight="duotone" className="mb-3 opacity-40" />
            <p className="text-lg font-medium">Nada programado hoy</p>
            <p className="text-sm">Tomá un café ☕</p>
          </CardContent>
        </Card>
      )}

      {/* LIBRE alerts strip */}
      {snapshot.libreAlerts.length > 0 && (
        <Card className="border-red-500/30 bg-red-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Siren size={20} weight="fill" className="text-red-600" />
              LIBRE vencido / crítico
              <Badge variant="destructive" className="ml-auto">{snapshot.libreAlerts.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {snapshot.libreAlerts.map((a) => (
              <LibreAlertRow key={a.shipment.REF} alert={a} onClick={() => openShipment(a.shipment)} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* 3-card grid — responsive: stacked on mobile, 3-col on lg */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TodayCard
          title="SALIENDO HOY"
          subtitle="Camiones saliendo de Uruguay"
          icon={<Truck size={22} weight="duotone" className="text-blue-600" />}
          accentClass="border-blue-500/30"
          matches={snapshot.salientes}
          emptyLabel="Sin salidas hoy"
          onRowClick={openShipment}
        />
        <TodayCard
          title="EN FRONTERA HOY"
          subtitle="Estimado (salió hace 1-2 días)"
          icon={<MapPin size={22} weight="duotone" className="text-amber-600" />}
          accentClass="border-amber-500/30"
          matches={snapshot.frontera}
          emptyLabel="Sin cargas en frontera"
          onRowClick={openShipment}
        />
        <TodayCard
          title="LLEGANDO A FISCAL HOY"
          subtitle="Arribos a depósito fiscal"
          icon={<Warehouse size={22} weight="duotone" className="text-green-600" />}
          accentClass="border-green-500/30"
          matches={snapshot.llegandoFiscal}
          emptyLabel="Sin arribos fiscales hoy"
          onRowClick={openShipment}
        />
      </div>

      {/* Details dialog — same one used in rest of the app */}
      {selected && (
        <ShipmentDetailsDialog
          shipment={selected}
          open={open}
          onOpenChange={setOpen}
          onSave={(updated) => {
            if (onUpdateShipments) {
              onUpdateShipments(shipments.map((s) => (s.REF === updated.REF ? updated : s)))
            }
          }}
          documents={documents}
          reports={reports}
          originPhotos={originPhotos}
          onUpdateOriginPhotos={onUpdateOriginPhotos}
        />
      )}
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

interface TodayCardProps {
  title: string
  subtitle: string
  icon: React.ReactNode
  accentClass: string
  matches: OpMatch[]
  emptyLabel: string
  onRowClick: (s: ParsedShipment) => void
}

function TodayCard({ title, subtitle, icon, accentClass, matches, emptyLabel, onRowClick }: TodayCardProps) {
  return (
    <Card className={`${accentClass} border-2`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {icon}
          <span className="flex-1 truncate">{title}</span>
          <Badge variant="secondary">{matches.length}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {matches.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-4 text-center">{emptyLabel}</p>
        ) : (
          matches.map(({ shipment, op }, idx) => (
            <button
              key={`${shipment.REF}-${op.CNTR_OP || idx}`}
              onClick={() => onRowClick(shipment)}
              className="w-full text-left p-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-mono text-sm font-bold">{shipment.REF}</span>
                <span className="text-xs text-muted-foreground truncate max-w-[50%]">
                  {op.CLIENTE_OP || shipment.CLIENTE || '—'}
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Package size={12} />
                <span className="truncate">
                  {op.DEPOSITO || '—'} → {op.FISCAL || '—'}
                  {op.TRANSPORTE && ` · ${op.TRANSPORTE}`}
                </span>
              </div>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  )
}

interface LibreAlertRowProps {
  alert: LibreAlert
  onClick: () => void
}

function LibreAlertRow({ alert, onClick }: LibreAlertRowProps) {
  const { shipment, daysOverdue, severity } = alert
  const badge =
    severity === 'vencido' ? (
      <Badge variant="destructive">vencido hace {daysOverdue}d</Badge>
    ) : severity === 'hoy' ? (
      <Badge className="bg-orange-500 text-white">vence HOY</Badge>
    ) : (
      <Badge className="bg-yellow-500 text-black">vence en {Math.abs(daysOverdue)}d</Badge>
    )

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-2 rounded-md hover:bg-white/60 transition-colors cursor-pointer flex items-center gap-2"
    >
      <Warning size={16} weight="fill" className="text-red-600 shrink-0" />
      <span className="font-mono font-bold text-sm">{shipment.REF}</span>
      <span className="text-sm text-muted-foreground truncate flex-1">
        {shipment.CLIENTE || '—'} · {shipment.TERMINAL || '—'}
      </span>
      {badge}
      <Clock size={14} className="text-muted-foreground" />
    </button>
  )
}
