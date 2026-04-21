import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import {
  Truck,
  Warehouse,
  MapPin,
  Warning,
  Coffee,
  Package,
  Siren,
  CaretRight,
  CalendarBlank,
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
      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight capitalize">
            <span className="text-muted-foreground/70 font-semibold">Hoy</span>
            <span className="text-muted-foreground/50 font-normal mx-2">·</span>
            {todayLabel}
          </h1>
          {snapshot.hasMovement ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <StatChip icon={<CalendarBlank size={14} weight="fill" />} label={`${snapshot.totalCount} movimientos`} tone="muted" />
              {snapshot.libreAlerts.length > 0 && (
                <StatChip icon={<Warning size={14} weight="fill" />} label={`${snapshot.libreAlerts.length} alertas LIBRE`} tone="destructive" />
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">Día tranquilo — sin movimientos programados</p>
          )}
        </div>
      </div>

      {/* ── Empty state ──────────────────────────────────── */}
      {!snapshot.hasMovement && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <div className="p-4 bg-muted rounded-full mb-4">
              <Coffee size={36} weight="duotone" className="opacity-70" />
            </div>
            <p className="text-lg font-semibold text-foreground">Nada programado hoy</p>
            <p className="text-sm mt-1">Tomá un café ☕</p>
          </CardContent>
        </Card>
      )}

      {/* ── LIBRE alerts strip ───────────────────────────── */}
      {snapshot.libreAlerts.length > 0 && (
        <Card className="accent-top overflow-hidden bg-destructive/[0.03] border-destructive/20" style={{ ['--bar-color' as any]: 'var(--destructive)' }}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-1.5 bg-destructive/10 rounded-md">
                <Siren size={18} weight="fill" className="text-destructive pulse-soft" />
              </div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-destructive">
                LIBRE vencido / crítico
              </h2>
              <span className="ml-auto inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-destructive text-destructive-foreground text-xs font-bold">
                {snapshot.libreAlerts.length}
              </span>
            </div>
            <div className="space-y-1">
              {snapshot.libreAlerts.map((a) => (
                <LibreAlertRow key={a.shipment.REF} alert={a} onClick={() => openShipment(a.shipment)} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 3-card grid ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TodayCard
          title="Saliendo hoy"
          subtitle="Camiones saliendo de Uruguay"
          icon={<Truck size={18} weight="fill" className="text-blue-600 dark:text-blue-400" />}
          iconBg="bg-blue-100 dark:bg-blue-500/10"
          barColor="var(--chart-2)"
          matches={snapshot.salientes}
          emptyLabel="Sin salidas hoy"
          onRowClick={openShipment}
        />
        <TodayCard
          title="En frontera hoy"
          subtitle="Estimado (salió hace 1-2 días)"
          icon={<MapPin size={18} weight="fill" className="text-amber-600 dark:text-amber-400" />}
          iconBg="bg-amber-100 dark:bg-amber-500/10"
          barColor="oklch(0.75 0.15 70)"
          matches={snapshot.frontera}
          emptyLabel="Sin cargas en frontera"
          onRowClick={openShipment}
        />
        <TodayCard
          title="Llegando a fiscal hoy"
          subtitle="Arribos a depósito fiscal"
          icon={<Warehouse size={18} weight="fill" className="text-emerald-600 dark:text-emerald-400" />}
          iconBg="bg-emerald-100 dark:bg-emerald-500/10"
          barColor="var(--chart-3)"
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

interface StatChipProps {
  icon: React.ReactNode
  label: string
  tone: 'muted' | 'destructive'
}

function StatChip({ icon, label, tone }: StatChipProps) {
  const toneClasses = tone === 'destructive'
    ? 'bg-destructive/10 text-destructive border-destructive/20'
    : 'bg-muted text-muted-foreground border-border'
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${toneClasses}`}>
      {icon}
      {label}
    </span>
  )
}

interface TodayCardProps {
  title: string
  subtitle: string
  icon: React.ReactNode
  iconBg: string
  barColor: string
  matches: OpMatch[]
  emptyLabel: string
  onRowClick: (s: ParsedShipment) => void
}

function TodayCard({ title, subtitle, icon, iconBg, barColor, matches, emptyLabel, onRowClick }: TodayCardProps) {
  return (
    <Card
      className="accent-top overflow-hidden shadow-sm hover:shadow-md transition-shadow card-lift"
      style={{ ['--bar-color' as any]: barColor }}
    >
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2.5 mb-4">
          <div className={`p-1.5 rounded-md ${iconBg}`}>{icon}</div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold uppercase tracking-wide truncate">{title}</h3>
            <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
          </div>
          <span className="inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-muted text-foreground text-xs font-bold tabular-nums">
            {matches.length}
          </span>
        </div>
        {matches.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground italic">{emptyLabel}</div>
        ) : (
          <div className="divide-y divide-border/60">
            {matches.map(({ shipment, op }, idx) => (
              <button
                key={`${shipment.REF}-${op.CNTR_OP || idx}`}
                onClick={() => onRowClick(shipment)}
                className="row-hover w-full text-left py-2.5 px-2 -mx-2 rounded-md hover:bg-muted/60 cursor-pointer flex items-start gap-2 group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="font-mono text-sm font-bold tracking-tight">{shipment.REF}</span>
                    <span className="text-[11px] font-medium text-foreground/80 truncate max-w-[55%]">
                      {op.CLIENTE_OP || shipment.CLIENTE || '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Package size={11} />
                    <span className="truncate">
                      <span className="font-medium">{op.DEPOSITO || '—'}</span>
                      <span className="mx-1 opacity-60">→</span>
                      <span className="font-medium">{op.FISCAL || '—'}</span>
                      {op.TRANSPORTE && <span className="ml-1.5 opacity-70">· {op.TRANSPORTE}</span>}
                    </span>
                  </div>
                </div>
                <CaretRight size={14} className="row-caret text-muted-foreground mt-1 shrink-0" />
              </button>
            ))}
          </div>
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
  const badgeClasses =
    severity === 'vencido'
      ? 'bg-destructive text-destructive-foreground'
      : severity === 'hoy'
      ? 'bg-orange-500 text-white'
      : 'bg-amber-400 text-amber-950'
  const badgeLabel =
    severity === 'vencido'
      ? `vencido hace ${daysOverdue}d`
      : severity === 'hoy'
      ? 'vence HOY'
      : `vence en ${Math.abs(daysOverdue)}d`

  return (
    <button
      onClick={onClick}
      className="row-hover w-full text-left py-2 px-2 -mx-2 rounded-md hover:bg-background/70 cursor-pointer flex items-center gap-3 group"
    >
      <div className="p-1 bg-destructive/10 rounded shrink-0">
        <Warning size={14} weight="fill" className="text-destructive" />
      </div>
      <span className="font-mono font-bold text-sm">{shipment.REF}</span>
      <span className="text-sm text-muted-foreground truncate flex-1">
        <span className="font-medium text-foreground/80">{shipment.CLIENTE || '—'}</span>
        {shipment.TERMINAL && <span className="opacity-70"> · {shipment.TERMINAL}</span>}
      </span>
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${badgeClasses}`}>
        {badgeLabel}
      </span>
      <CaretRight size={14} className="row-caret text-muted-foreground shrink-0" />
    </button>
  )
}
