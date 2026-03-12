import type { CalendarEvent } from '@/lib/agendaTypes'
import { DAY_NAMES, MONTH_NAMES } from '@/lib/agendaTypes'
import { getMonthGrid, toDateKey, isToday, groupEventsByDate } from '@/lib/agendaUtils'

interface AgendaAnnualViewProps {
  date: Date
  events: CalendarEvent[]
  onMonthClick: (month: number) => void
  onDayClick: (date: Date) => void
}

export default function AgendaAnnualView({ date, events, onMonthClick, onDayClick }: AgendaAnnualViewProps) {
  const year = date.getFullYear()
  const eventsByDate = groupEventsByDate(events)

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 12 }, (_, monthIdx) => {
        const grid = getMonthGrid(year, monthIdx)

        return (
          <div key={monthIdx} className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Month header */}
            <button
              onClick={() => onMonthClick(monthIdx)}
              className="w-full px-3 py-2 text-sm font-semibold text-foreground bg-muted/50
                hover:bg-muted transition-colors cursor-pointer text-left"
            >
              {MONTH_NAMES[monthIdx]}
            </button>

            {/* Mini day names */}
            <div className="grid grid-cols-6 px-1 pt-1">
              {DAY_NAMES.map(d => (
                <div key={d} className="text-center text-[8px] text-muted-foreground font-medium py-0.5">
                  {d[0]}
                </div>
              ))}
            </div>

            {/* Mini calendar grid */}
            <div className="px-1 pb-2">
              {grid.map((week, wi) => (
                <div key={wi} className="grid grid-cols-6">
                  {week.map((d, di) => {
                    const dateKey = toDateKey(d)
                    const dayEvents = eventsByDate.get(dateKey) || []
                    const isCurrentMonth = d.getMonth() === monthIdx
                    const today = isToday(d)
                    const count = dayEvents.length
                    const hasAlerts = dayEvents.some(e => e.alerts.length > 0)

                    return (
                      <button
                        key={di}
                        onClick={() => count > 0 ? onDayClick(d) : undefined}
                        disabled={!isCurrentMonth || count === 0}
                        className={`relative text-center py-0.5 text-[10px] rounded-sm
                          transition-colors
                          ${!isCurrentMonth ? 'text-transparent' : 'text-foreground'}
                          ${today && isCurrentMonth ? 'font-bold text-primary ring-1 ring-primary/40 rounded-full' : ''}
                          ${count > 0 && isCurrentMonth ? 'cursor-pointer hover:bg-muted' : ''}
                        `}
                      >
                        <span>{d.getDate()}</span>
                        {count > 0 && isCurrentMonth && (
                          <div className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2
                            text-[7px] font-bold leading-none rounded-full min-w-[12px] px-0.5 py-px
                            ${hasAlerts
                              ? 'bg-red-500 text-white'
                              : 'bg-primary/80 text-primary-foreground'
                            }`}
                          >
                            {count}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
