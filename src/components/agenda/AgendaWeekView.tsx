import { useDroppable } from '@dnd-kit/core'
import type { CalendarEvent } from '@/lib/agendaTypes'
import { useBrand } from '@/lib/brand'
import { DAY_NAMES } from '@/lib/agendaTypes'
import { getWeekDates, toDateKey, isToday } from '@/lib/agendaUtils'
import AgendaEventCard from './AgendaEventCard'

interface AgendaWeekViewProps {
  date: Date
  events: CalendarEvent[]
  onSelectShipment: (event: CalendarEvent) => void
  onDayClick: (date: Date) => void
  editable?: boolean
}

// ─── Shared cell content ───────────────────────────────────────────────────

interface CellContentProps {
  dayEvents: CalendarEvent[]
  editable: boolean
  onSelectShipment: (event: CalendarEvent) => void
}

function WeekDayCellContent({ dayEvents, editable, onSelectShipment }: CellContentProps) {
  return (
    <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
      {dayEvents.map(event => (
        <AgendaEventCard
          key={event.id}
          event={event}
          compact={true}
          onClick={() => onSelectShipment(event)}
          draggable={editable}
        />
      ))}
      {dayEvents.length === 0 && (
        <div className="h-16 flex items-center justify-center">
          <span className="text-xs text-muted-foreground/40">—</span>
        </div>
      )}
    </div>
  )
}

// ─── Droppable day cell (only rendered inside DndContext when editable) ────

interface DroppableWeekDayCellProps {
  dateKey: string          // YYYY-MM-DD — used as droppable id
  dayEvents: CalendarEvent[]
  today: boolean
  onSelectShipment: (event: CalendarEvent) => void
}

function DroppableWeekDayCell({ dateKey, dayEvents, today, onSelectShipment }: DroppableWeekDayCellProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dateKey })

  return (
    <div
      ref={setNodeRef}
      className={`border-r border-border last:border-r-0 p-1.5 transition-colors
        ${today ? 'bg-accent/5' : ''}
        ${isOver ? 'bg-[#1e3a8a]/5 ring-1 ring-inset ring-[#1e3a8a]/30' : ''}`}
    >
      <WeekDayCellContent dayEvents={dayEvents} editable={true} onSelectShipment={onSelectShipment} />
    </div>
  )
}

// ─── Plain (non-droppable) day cell — used when !editable ─────────────────

interface PlainWeekDayCellProps {
  dayEvents: CalendarEvent[]
  today: boolean
  onSelectShipment: (event: CalendarEvent) => void
}

function PlainWeekDayCell({ dayEvents, today, onSelectShipment }: PlainWeekDayCellProps) {
  return (
    <div
      className={`border-r border-border last:border-r-0 p-1.5 transition-colors
        ${today ? 'bg-accent/5' : ''}`}
    >
      <WeekDayCellContent dayEvents={dayEvents} editable={false} onSelectShipment={onSelectShipment} />
    </div>
  )
}

// ─── Week view ─────────────────────────────────────────────────────────────

export default function AgendaWeekView({ date, events, onSelectShipment, onDayClick, editable = false }: AgendaWeekViewProps) {
  const weekDates = getWeekDates(date)
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

  // Group events by date
  const eventsByDate = new Map<string, CalendarEvent[]>()
  for (const e of events) {
    const existing = eventsByDate.get(e.date) || []
    existing.push(e)
    eventsByDate.set(e.date, existing)
  }

  // Fino por marca (handoff 03-admin · Agenda): cabecera de días del sistema
  // (labels en mayúsculas gris suave sobre fondo claro, hoy tintado lila).
  const med = useBrand().id === 'med'
  return (
    <div className={med ? 'bg-card border-2 border-med-borde rounded-[20px] overflow-hidden' : 'bg-card border border-border rounded-xl overflow-hidden'}>
      {/* Header row */}
      <div className={med ? 'grid grid-cols-6 border-b-2 border-med-borde bg-med-fondo' : 'grid grid-cols-6 border-b border-border'}>
        {weekDates.map((d, i) => {
          const today = isToday(d)
          return (
            <button
              key={i}
              onClick={() => onDayClick(d)}
              className={`py-3 px-2 text-center border-r border-border last:border-r-0
                hover:bg-muted/50 transition-colors cursor-pointer
                ${today ? (med ? 'bg-med-lila' : 'bg-accent/10') : ''}`}
            >
              <div className={`text-xs font-medium ${med ? 'font-bold uppercase tracking-[0.06em] text-[11px]' : ''} ${today ? (med ? 'text-med-violeta' : 'text-accent-foreground') : (med ? 'text-med-gris-suave' : 'text-muted-foreground')}`}>
                {DAY_NAMES[i]}
              </div>
              <div className={`text-lg font-bold ${med ? 'titulo-med' : ''} ${today
                ? (med ? 'text-white bg-med-violeta rounded-full w-8 h-8 flex items-center justify-center mx-auto' : 'text-primary bg-primary/10 rounded-full w-8 h-8 flex items-center justify-center mx-auto')
                : (med ? 'text-med-violeta' : 'text-foreground')
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
          const dayEvents = (eventsByDate.get(dateKey) || []).sort((a, b) => {
            const depoA = (a.deposito || '').toLowerCase()
            const depoB = (b.deposito || '').toLowerCase()
            if (depoA !== depoB) return depoA.localeCompare(depoB)
            return (a.ref || '').localeCompare(b.ref || '')
          })
          const today = isToday(d)

          return editable ? (
            <DroppableWeekDayCell
              key={i}
              dateKey={dateKey}
              dayEvents={dayEvents}
              today={today}
              onSelectShipment={onSelectShipment}
            />
          ) : (
            <PlainWeekDayCell
              key={i}
              dayEvents={dayEvents}
              today={today}
              onSelectShipment={onSelectShipment}
            />
          )
        })}
      </div>
    </div>
  )
}
