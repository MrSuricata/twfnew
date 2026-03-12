import type { CalendarEvent } from '@/lib/agendaTypes'
import { DAY_NAMES, EVENT_TYPE_CONFIG } from '@/lib/agendaTypes'
import { getMonthGrid, toDateKey, isToday, groupEventsByDate } from '@/lib/agendaUtils'

interface AgendaMonthViewProps {
  date: Date
  events: CalendarEvent[]
  onSelectShipment: (event: CalendarEvent) => void
  onDayClick: (date: Date) => void
}

export default function AgendaMonthView({ date, events, onDayClick }: AgendaMonthViewProps) {
  const year = date.getFullYear()
  const month = date.getMonth()
  const grid = getMonthGrid(year, month)
  const eventsByDate = groupEventsByDate(events)

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header row */}
      <div className="grid grid-cols-6 border-b border-border">
        {DAY_NAMES.map(day => (
          <div key={day} className="py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      {grid.map((week, wi) => (
        <div key={wi} className="grid grid-cols-6 border-b border-border last:border-b-0">
          {week.map((d, di) => {
            const dateKey = toDateKey(d)
            const dayEvents = eventsByDate.get(dateKey) || []
            const isCurrentMonth = d.getMonth() === month
            const today = isToday(d)
            const hasAlerts = dayEvents.some(e => e.alerts.length > 0)

            return (
              <button
                key={di}
                onClick={() => onDayClick(d)}
                className={`min-h-[90px] p-1.5 border-r border-border last:border-r-0
                  text-left align-top transition-colors cursor-pointer
                  hover:bg-muted/50
                  ${!isCurrentMonth ? 'opacity-40' : ''}
                  ${today ? 'bg-accent/10 ring-1 ring-inset ring-primary/30' : ''}`}
              >
                {/* Day number */}
                <div className={`text-xs font-semibold mb-1 ${
                  today
                    ? 'text-primary bg-primary/10 rounded-full w-6 h-6 flex items-center justify-center'
                    : isCurrentMonth
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                }`}>
                  {d.getDate()}
                </div>

                {/* Event indicators (max 3 visible) */}
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map(event => {
                    const cfg = EVENT_TYPE_CONFIG[event.type]
                    return (
                      <div
                        key={event.id}
                        className={`flex items-center gap-1 px-1 py-0.5 rounded text-[9px] truncate ${cfg.bg}`}
                      >
                        <span className="text-[8px]">{cfg.dot}</span>
                        <span className="font-medium truncate">{event.ref}</span>
                        {event.alerts.length > 0 && (
                          <span className="shrink-0">{event.alerts[0].emoji}</span>
                        )}
                      </div>
                    )
                  })}
                  {dayEvents.length > 3 && (
                    <div className="text-[9px] text-muted-foreground font-medium px-1">
                      +{dayEvents.length - 3} más
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
