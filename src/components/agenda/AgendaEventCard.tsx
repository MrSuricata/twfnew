import type { CalendarEvent } from '@/lib/agendaTypes'
import { getOperativaColor } from '@/lib/agendaTypes'
import { formatDateShort, daysUntil } from '@/lib/agendaUtils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface AgendaEventCardProps {
  event: CalendarEvent
  compact?: boolean       // true for week/month views
  onClick?: () => void
}

export default function AgendaEventCard({ event, compact = true, onClick }: AgendaEventCardProps) {
  const opColor = getOperativaColor(event.operativa)
  const libreRemaining = event.libre ? daysUntil(event.libre) : null

  if (compact) {
    const hasCargoInfo = event.kg > 0 || event.pkgs > 0
    const cardButton = (
      <button
        onClick={onClick}
        className={`w-full text-left rounded-lg border border-border/60 overflow-hidden
          hover:shadow-md hover:border-border transition-all cursor-pointer group ${opColor.bg}`}
      >
        {/* Color strip */}
        <div className={`h-1 ${opColor.color}`} />

        <div className="px-2.5 py-2 space-y-0.5">
          {/* Row 1: REF + tipo operativa */}
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px]">{opColor.dot}</span>
            <span className="text-xs font-bold text-foreground truncate">{event.ref}</span>
            <span className={`text-[10px] font-medium truncate ${opColor.textColor}`}>
              · {event.operativa}
            </span>
          </div>

          {/* Row 2: Container + type */}
          {event.cntr && (
            <div className="text-[11px] text-muted-foreground font-mono truncate">
              {event.cntr}{event.tipo ? ` · ${event.tipo}` : ''}
            </div>
          )}

          {/* Row 2b: Cargo info (kg / btos) — keeps the clicked container's info visible */}
          {hasCargoInfo && (
            <div className="text-[10px] text-muted-foreground truncate">
              {event.kg > 0 && `${event.kg.toLocaleString()} kg`}
              {event.kg > 0 && event.pkgs > 0 && ' · '}
              {event.pkgs > 0 && `${event.pkgs.toLocaleString()} btos`}
            </div>
          )}

          {/* Row 3: Depot + Deposito + Libre */}
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            {(event.fiscal || event.deposito) && (
              <span className="truncate">
                → {event.fiscal}{event.fiscal && event.deposito ? ' · ' : ''}{event.deposito && (
                  <span className="font-semibold text-foreground/70">{event.deposito}</span>
                )}
              </span>
            )}
            {event.libre && (
              <span className={`ml-auto shrink-0 font-medium ${
                libreRemaining !== null && libreRemaining <= 2
                  ? 'text-red-600 dark:text-red-400'
                  : libreRemaining !== null && libreRemaining <= 5
                    ? 'text-orange-600 dark:text-orange-400'
                    : ''
              }`}>
                Libre: {formatDateShort(event.libre)}
              </span>
            )}
          </div>

          {/* Row 4: Alert emojis */}
          {event.alerts.length > 0 && (
            <div className="flex items-center gap-1 pt-0.5">
              <TooltipProvider delayDuration={200}>
                {event.alerts.map((alert, i) => (
                  <Tooltip key={i}>
                    <TooltipTrigger asChild>
                      <span className="text-sm cursor-help">{alert.emoji}</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {alert.label}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </TooltipProvider>
            </div>
          )}
        </div>
      </button>
    )

    // Wrap in tooltip showing description when available
    if (event.descripcion) {
      return (
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              {cardButton}
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-xs">
              <div className="font-semibold mb-0.5">{event.cntr || event.ref}</div>
              <div className="text-muted-foreground">{event.descripcion}</div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }

    return cardButton
  }

  // ─── Detailed card (Day view) ───────────────────────────────────────
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border border-border overflow-hidden
        hover:shadow-lg hover:border-border/80 transition-all cursor-pointer group bg-card"
    >
      {/* Color strip */}
      <div className={`h-1.5 ${opColor.color}`} />

      <div className="p-4 space-y-3">
        {/* Header: REF + Operativa badge + Alerts */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-foreground">{event.ref}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${opColor.bg} ${opColor.textColor}`}>
              {event.operativa}
            </span>
          </div>
          {event.alerts.length > 0 && (
            <div className="flex items-center gap-1">
              <TooltipProvider delayDuration={200}>
                {event.alerts.map((alert, i) => (
                  <Tooltip key={i}>
                    <TooltipTrigger asChild>
                      <span className="text-base cursor-help">{alert.emoji}</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs max-w-xs">
                      {alert.label}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </TooltipProvider>
            </div>
          )}
        </div>

        {/* Client */}
        <div className="text-sm text-muted-foreground">
          Cliente: <span className="font-medium text-foreground">{event.cliente || '—'}</span>
        </div>

        {/* Info cards row */}
        <div className="grid grid-cols-3 gap-3">
          {/* Libre Hasta */}
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
              Libre Hasta
            </div>
            <div className={`text-sm font-bold ${
              libreRemaining !== null && libreRemaining < 0
                ? 'text-red-600'
                : libreRemaining !== null && libreRemaining <= 2
                  ? 'text-orange-600'
                  : 'text-foreground'
            }`}>
              {event.libre ? formatDateShort(event.libre) : '—'}
            </div>
            {libreRemaining !== null && libreRemaining !== 999 && (
              <div className={`text-xs mt-0.5 ${
                libreRemaining < 0 ? 'text-red-500' : libreRemaining <= 2 ? 'text-orange-500' : 'text-muted-foreground'
              }`}>
                {libreRemaining < 0
                  ? `Vencido hace ${Math.abs(libreRemaining)}d`
                  : libreRemaining === 0
                    ? 'Vence HOY'
                    : `${libreRemaining}d restantes`
                }
              </div>
            )}
          </div>

          {/* Salida MVD */}
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
              Salida MVD
            </div>
            <div className="text-sm font-bold text-foreground">
              {event.op.SALIDA ? formatDateShort(event.op.SALIDA) : 'A confirmar'}
            </div>
            {event.fiscal && (
              <div className="text-xs text-muted-foreground mt-0.5">
                → {event.fiscal}
              </div>
            )}
          </div>

          {/* Depósito */}
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
              Depósito
            </div>
            <div className="text-sm font-bold text-foreground">
              {event.deposito || '—'}
            </div>
            {event.transporte && (
              <div className="text-xs text-muted-foreground mt-0.5 truncate">
                🚛 {event.transporte}
              </div>
            )}
          </div>
        </div>

        {/* Container details */}
        <div className="flex items-center gap-3 text-xs bg-muted/30 rounded-lg px-3 py-2">
          <span className="font-mono font-bold text-foreground">{event.cntr || '—'}</span>
          {event.tipo && (
            <span className="text-muted-foreground">· {event.tipo}</span>
          )}
          {event.kg > 0 && (
            <span className="text-muted-foreground">· {event.kg.toLocaleString()} kg</span>
          )}
          {event.m3 > 0 && (
            <span className="text-muted-foreground">· {event.m3} m³</span>
          )}
          {event.pkgs > 0 && (
            <span className="text-muted-foreground">· {event.pkgs.toLocaleString()} btos</span>
          )}
        </div>

        {/* Description */}
        {event.descripcion && (
          <div className="text-xs text-muted-foreground truncate">
            {event.descripcion}
          </div>
        )}
      </div>
    </button>
  )
}
