import type { CalendarEvent } from '@/lib/agendaTypes'
import { DAY_NAMES } from '@/lib/agendaTypes'
import { getWeekDates, toDateKey, isToday } from '@/lib/agendaUtils'
import AgendaEventCard from './AgendaEventCard'

interface AgendaWeekViewProps {
  date: Date
  events: CalendarEvent[]
  onSelectShipment: (event: CalendarEvent) => void
  onDayClick: (date: Date) => void
}

export default function AgendaWeekView({ date, events, onSelectShipment, onDayClick }: AgendaWeekViewProps) {
  const weekDates = getWeekDates(date)
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

  // Group events by date
  const eventsByDate = new Map<string, CalendarEvent[]>()
  for (const e of events) {
    const existing = eventsByDate.get(e.date) || []
    existing.push(e)
    eventsByDate.set(e.date, existing)
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header row */}
      <div className="grid grid-cols-6 border-b border-border">
        {weekDates.map((d, i) => {
          const today = isToday(d)
          return (
            <button
              key={i}
              onClick={() => onDayClick(d)}
              className={`py-3 px-2 text-center border-r border-border last:border-r-0
                hover:bg-muted/50 transition-colors cursor-pointer
                ${today ? 'bg-accent/10' : ''}`}
            >
              <div className={`text-xs font-medium ${today ? 'text-accent-foreground' : 'text-muted-foreground'}`}>
                {DAY_NAMES[i]}
              </div>
              <div className={`text-lg font-bold ${today
                ? 'text-primary bg-primary/10 rounded-full w-8 h-8 flex items-center justify-center mx-auto'
                : 'text-foreground'
              }`}>
                {d.getDate()}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {months[d.getMonth()]}
              </div>
            </button>
          )
        })}
      </div>

      {/* Events grid */}
      <div className="grid grid-cols-6 min-h-[400px]">
        {weekDates.map((d, i) => {
          const dateKey = toDateKey(d)
          const dayEvents = eventsByDate.get(dateKey) || []
          const today = isToday(d)

          return (
            <div
              key={i}
              className={`border-r border-border last:border-r-0 p-1.5
                ${today ? 'bg-accent/5' : ''}`}
            >
              <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
                {dayEvents.map(event => (
                  <AgendaEventCard
                    key={event.id}
                    event={event}
                    compact={true}
                    onClick={() => onSelectShipment(event)}
                  />
                ))}
                {dayEvents.length === 0 && (
                  <div className="h-16 flex items-center justify-center">
                    <span className="text-xs text-muted-foreground/40">—</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
