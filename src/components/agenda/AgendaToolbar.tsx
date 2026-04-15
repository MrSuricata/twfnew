import { Button } from '@/components/ui/button'
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
    <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-3">
      {/* Top row: navigation + period + view selector */}
      <div className="flex items-center justify-between gap-4">
        {/* Navigation buttons */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate('prev')}
            className="h-8 w-8 p-0"
          >
            <CaretLeft size={16} weight="bold" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate('today')}
            className="h-8 px-3 text-xs font-medium"
          >
            Hoy
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate('next')}
            className="h-8 w-8 p-0"
          >
            <CaretRight size={16} weight="bold" />
          </Button>
        </div>

        {/* Period label */}
        <div className="flex-1 text-center">
          <h2 className="text-lg font-semibold text-foreground">
            {getPeriodLabel(view, currentDate)}
          </h2>
          <p className="text-xs text-muted-foreground">
            {eventCount} operacion{eventCount !== 1 ? 'es' : ''}
            {alertCount > 0 && (
              <span className="ml-2 text-orange-600 dark:text-orange-400">
                · {alertCount} alerta{alertCount !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>

        {/* View selector + pending button */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            {(Object.keys(VIEW_LABELS) as AgendaView[]).map(v => (
              <button
                key={v}
                onClick={() => onViewChange(v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
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
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                showPendingSidebar
                  ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800'
                  : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
              }`}
            >
              <Warning size={14} weight={showPendingSidebar ? 'fill' : 'regular'} />
              Pendientes
              {pendingCount > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  showPendingSidebar
                    ? 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {pendingCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Depot filter row */}
      {availableDepots.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Funnel size={14} className="text-muted-foreground shrink-0" aria-label="Depósitos" />
          {availableDepots.map(depot => {
            const isActive = activeDepots.has(depot)
            return (
              <button
                key={depot}
                onClick={() => onToggleDepot?.(depot)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-full border transition-all ${
                  isActive
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                }`}
              >
                {depot}
              </button>
            )
          })}
          {activeDepots.size > 0 && (
            <button
              onClick={onClearDepots}
              className="px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <X size={10} weight="bold" />
              Limpiar
            </button>
          )}
        </div>
      )}

      {/* Transport filter row */}
      {availableTransports.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Truck size={14} className="text-muted-foreground shrink-0" aria-label="Transportes" />
          {availableTransports.map(transport => {
            const isActive = activeTransports.has(transport)
            return (
              <button
                key={transport}
                onClick={() => onToggleTransport?.(transport)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-full border transition-all ${
                  isActive
                    ? 'bg-accent text-accent-foreground border-accent shadow-sm'
                    : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                }`}
              >
                {transport}
              </button>
            )
          })}
          {activeTransports.size > 0 && (
            <button
              onClick={onClearTransports}
              className="px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <X size={10} weight="bold" />
              Limpiar
            </button>
          )}
        </div>
      )}
    </div>
  )
}
