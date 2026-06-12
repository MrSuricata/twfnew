import { CaretLeft, CaretRight, Funnel, Truck, X, Warning } from '@phosphor-icons/react'
import type { AgendaView } from '@/lib/agendaTypes'
import { MONTH_NAMES } from '@/lib/agendaTypes'

interface AgendaToolbarProps {
  view: AgendaView
  currentDate: Date
  eventCount: number
  alertCount: number
  onViewChange: (view: AgendaView) => void
  onNavigate: (direction: 'prev' | 'next' | 'today') => void
  availableDepots?: string[]
  activeDepots?: Set<string>
  onToggleDepot?: (depot: string) => void
  onClearDepots?: () => void
  availableTransports?: string[]
  activeTransports?: Set<string>
  onToggleTransport?: (transport: string) => void
  onClearTransports?: () => void
  pendingCount?: number
  showPendingSidebar?: boolean
  onTogglePendingSidebar?: () => void
}

const VIEW_LABELS: Record<AgendaView, string> = {
  day: 'Día',
  week: 'Sem',
  month: 'Mes',
  annual: 'Año'
}

function getPeriodLabel(view: AgendaView, date: Date): string {
  const day = date.getDate()
  const month = MONTH_NAMES[date.getMonth()]
  const year = date.getFullYear()
  const monthShort = month.substring(0, 3)

  switch (view) {
    case 'day':
      return `${day} ${monthShort} ${year}`
    case 'week': {
      // Find Monday of this week
      const d = new Date(date)
      let dow = d.getDay()
      if (dow === 0) dow = 7
      const monday = new Date(d)
      monday.setDate(d.getDate() - (dow - 1))
      const saturday = new Date(monday)
      saturday.setDate(monday.getDate() + 5)
      const monDay = monday.getDate()
      const satDay = saturday.getDate()
      const monMonth = MONTH_NAMES[monday.getMonth()].substring(0, 3)
      const satMonth = MONTH_NAMES[saturday.getMonth()].substring(0, 3)
      if (monday.getMonth() === saturday.getMonth()) {
        return `${monDay}–${satDay} ${monMonth} ${year}`
      }
      return `${monDay} ${monMonth} – ${satDay} ${satMonth} ${year}`
    }
    case 'month':
      return `${month} ${year}`
    case 'annual':
      return `${year}`
  }
}

export default function AgendaToolbar({
  view,
  currentDate,
  eventCount,
  alertCount,
  onViewChange,
  onNavigate,
  availableDepots = [],
  activeDepots = new Set(),
  onToggleDepot,
  onClearDepots,
  availableTransports = [],
  activeTransports = new Set(),
  onToggleTransport,
  onClearTransports,
  pendingCount = 0,
  showPendingSidebar = false,
  onTogglePendingSidebar
}: AgendaToolbarProps) {
  return (
    <div className="bg-card border rounded-xl px-4 py-3 space-y-3">
      {/* Top row: navigation + period + view selector */}
      <div className="flex items-center justify-between gap-4">
        {/* Navigation button group */}
        <div className="inline-flex items-center rounded-md border bg-background overflow-hidden">
          <button
            onClick={() => onNavigate('prev')}
            className="h-8 w-8 flex items-center justify-center hover:bg-muted transition-colors"
            title="Anterior"
          >
            <CaretLeft size={15} weight="bold" />
          </button>
          <div className="h-4 w-px bg-border" />
          <button
            onClick={() => onNavigate('today')}
            className="h-8 px-3 text-xs font-semibold hover:bg-muted transition-colors"
          >
            Hoy
          </button>
          <div className="h-4 w-px bg-border" />
          <button
            onClick={() => onNavigate('next')}
            className="h-8 w-8 flex items-center justify-center hover:bg-muted transition-colors"
            title="Siguiente"
          >
            <CaretRight size={15} weight="bold" />
          </button>
        </div>

        {/* Period label */}
        <div className="flex-1 text-center min-w-0">
          <h2 className="text-lg font-semibold text-foreground tracking-tight truncate capitalize">
            {getPeriodLabel(view, currentDate)}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            <span className="tabular-nums font-medium">{eventCount}</span> operacion{eventCount !== 1 ? 'es' : ''}
            {alertCount > 0 && (
              <span className="ml-1.5 inline-flex items-center gap-1 text-orange-600">
                <Warning size={10} weight="fill" />
                <span className="tabular-nums font-medium">{alertCount}</span> alerta{alertCount !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>

        {/* View selector + pending button */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex items-center bg-muted/70 rounded-md p-0.5">
            {(Object.keys(VIEW_LABELS) as AgendaView[]).map(v => (
              <button
                key={v}
                onClick={() => onViewChange(v)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-all ${
                  view === v
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>

          {onTogglePendingSidebar && (
            <button
              onClick={onTogglePendingSidebar}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-all ${
                showPendingSidebar
                  ? 'bg-amber-50 text-amber-700 border-amber-300'
                  : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Warning size={12} weight={showPendingSidebar ? 'fill' : 'regular'} />
              Pendientes
              {pendingCount > 0 && (
                <span className={`text-[10px] tabular-nums px-1.5 rounded-full ${
                  showPendingSidebar
                    ? 'bg-amber-200 text-amber-800'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {pendingCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Filter rows — only rendered if there is something to filter */}
      {(availableDepots.length > 0 || availableTransports.length > 0) && (
        <div className="border-t pt-3 space-y-2">
          {/* Depot filter row */}
          {availableDepots.length > 0 && (
            <div className="flex items-start gap-3">
              <div className="flex items-center gap-1.5 shrink-0 pt-1 w-24">
                <Funnel size={11} className="text-muted-foreground" weight="fill" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Depósito
                </span>
              </div>
              <div className="flex items-center gap-1 flex-wrap flex-1">
                {availableDepots.map(depot => {
                  const isActive = activeDepots.has(depot)
                  return (
                    <button
                      key={depot}
                      onClick={() => onToggleDepot?.(depot)}
                      className={`px-2.5 h-7 text-[11px] font-semibold rounded-full border transition-all ${
                        isActive
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-border/80 hover:border-border hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {depot}
                    </button>
                  )
                })}
                {activeDepots.size > 0 && (
                  <button
                    onClick={onClearDepots}
                    className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    <X size={10} weight="bold" />
                    Limpiar
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Transport filter row */}
          {availableTransports.length > 0 && (
            <div className="flex items-start gap-3">
              <div className="flex items-center gap-1.5 shrink-0 pt-1 w-24">
                <Truck size={11} className="text-muted-foreground" weight="fill" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Transporte
                </span>
              </div>
              <div className="flex items-center gap-1 flex-wrap flex-1">
                {availableTransports.map(transport => {
                  const isActive = activeTransports.has(transport)
                  return (
                    <button
                      key={transport}
                      onClick={() => onToggleTransport?.(transport)}
                      className={`px-2.5 h-7 text-[11px] font-semibold rounded-full border transition-all ${
                        isActive
                          ? 'bg-accent text-accent-foreground border-accent'
                          : 'bg-background text-muted-foreground border-border/80 hover:border-border hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {transport}
                    </button>
                  )
                })}
                {activeTransports.size > 0 && (
                  <button
                    onClick={onClearTransports}
                    className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    <X size={10} weight="bold" />
                    Limpiar
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
