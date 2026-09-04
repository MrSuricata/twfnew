import type { CalendarEvent, EventType } from '@/lib/agendaTypes'
import { EVENT_TYPE_CONFIG, DAY_NAMES_FULL } from '@/lib/agendaTypes'
import { toDateKey } from '@/lib/agendaUtils'
import AgendaEventCard from './AgendaEventCard'
import { eventosDelDia, type EventoCalendario } from '@/lib/calendarioEventos'
import { BandaAvisos } from './AvisosCalendario'

interface AgendaDayViewProps {
  date: Date
  events: CalendarEvent[]
  onSelectShipment: (event: CalendarEvent) => void
  /** Feriados, paros y demas: no cuelgan de una carga, son del dia. */
  avisos?: EventoCalendario[]
  onAbrirAviso?: (aviso: EventoCalendario) => void
  /** Agenda del CLIENTE: apaga los datos nuestros (LIBRE, transporte). */
  vistaCliente?: boolean
}

const EVENT_ORDER: EventType[] = ['salida', 'eta_fisc', 'libre', 'descarga', 'dev']

export default function AgendaDayView({ date, events, onSelectShipment, avisos = [], onAbrirAviso, vistaCliente = false }: AgendaDayViewProps) {
  const dateKey = toDateKey(date)
  const dayEvents = events.filter(e => e.date === dateKey)
  const avisosDelDia = eventosDelDia(avisos, dateKey)

  // Group by type
  const grouped = EVENT_ORDER.map(type => ({
    type,
    config: EVENT_TYPE_CONFIG[type],
    events: dayEvents.filter(e => e.type === type).sort((a, b) => {
      const depoA = (a.deposito || '').toLowerCase()
      const depoB = (b.deposito || '').toLowerCase()
      if (depoA !== depoB) return depoA.localeCompare(depoB)
      return (a.ref || '').localeCompare(b.ref || '')
    })
  })).filter(g => g.events.length > 0)

  const dayIndex = date.getDay() // 0=Sun..6=Sat
  const dayName = dayIndex === 0 ? 'Domingo' : DAY_NAMES_FULL[dayIndex - 1] || ''
  const day = date.getDate()
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  const month = months[date.getMonth()]
  const year = date.getFullYear()

  return (
    <div className="space-y-4">
      {/* Day header */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-lg font-bold text-foreground">
          {dayName} {day} de {month}, {year}
        </h3>
        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
          {grouped.map(g => (
            <span key={g.type} className="flex items-center gap-1">
              <span>{g.config.dot}</span>
              <span>{g.events.length} {g.config.label.toLowerCase()}{g.events.length !== 1 ? 's' : ''}</span>
            </span>
          ))}
          {dayEvents.length === 0 && (
            <span>Sin operaciones</span>
          )}
        </div>
      </div>

      {/* Feriados y paros primero: condicionan todo lo de abajo. */}
      <BandaAvisos avisos={avisosDelDia} onAbrir={onAbrirAviso} />

      {/* Empty state */}
      {dayEvents.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <div className="text-4xl mb-3 opacity-40">📅</div>
          <p className="text-sm text-muted-foreground">
            No hay operaciones programadas para este día
          </p>
        </div>
      )}

      {/* Grouped event cards */}
      {grouped.map(g => (
        <div key={g.type} className="space-y-2">
          {/* Group header */}
          <div className="flex items-center gap-2 px-1">
            <span className="text-sm">{g.config.dot}</span>
            <h4 className="text-sm font-semibold text-foreground">
              {g.config.label}
            </h4>
            <span className="text-xs text-muted-foreground">
              ({g.events.length})
            </span>
            <div className={`flex-1 h-px ${g.config.color} opacity-20`} />
          </div>

          {/* Cards */}
          <div className="grid gap-3 md:grid-cols-2">
            {g.events.map(event => (
              <AgendaEventCard
                key={event.id}
                event={event}
                compact={false}
                onClick={() => onSelectShipment(event)}
                vistaCliente={vistaCliente}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
