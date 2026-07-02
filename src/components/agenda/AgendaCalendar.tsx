import { useState, useMemo, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import { parseLocalDate } from '@/lib/shipmentTypes'
import type { AgendaView, CalendarEvent } from '@/lib/agendaTypes'
import type { Truck, TruckLoad } from '@/lib/truckTypes'
import { shipmentsToEvents, trucksToEvents, countAlertsInRange, getWeekDates, toDateKey } from '@/lib/agendaUtils'

// Shipment is "pending to coordinate" only if it's already at MVD port or
// arrives within this many days. Farther-out ETAs aren't actionable yet.
const PENDING_WINDOW_DAYS = 4

import AgendaToolbar from './AgendaToolbar'
import AgendaDayView from './AgendaDayView'
import AgendaWeekView from './AgendaWeekView'
import AgendaMonthView from './AgendaMonthView'
import AgendaAnnualView from './AgendaAnnualView'
import AgendaPendingSidebar from './AgendaPendingSidebar'
import AgendaEventCard from './AgendaEventCard'
import PendingSalidaSection from './PendingSalidaSection'
import ShipmentDetailsDialog from '../ShipmentDetailsDialog'
import ContainerQuickEdit, { buildPatchedOperativas } from '../operations/ContainerQuickEdit'
import { deriveKnownTransportes } from '@/lib/operationsTypes'
import { dropPatch } from './agendaDnd'
import { isSalidaBeforeArrival } from '@/lib/salidaCheck'

interface AgendaCalendarProps {
  shipments: ParsedShipment[]
  /** Camiones consolidados: sus hitos (salida → frontera, arribo fiscal) entran a la agenda. */
  trucks?: Truck[]
  truckLoads?: TruckLoad[]
  depotFilter?: string
  transportFilter?: string
  partnerView?: boolean
  /** Client view — restricts what the details dialog exposes (same trimming as client portal). */
  clientView?: boolean
  /** Initial calendar view. Defaults to 'week'. Clients prefer 'month' for monthly overview. */
  defaultView?: AgendaView
  /** Admin-only: enables ContainerQuickEdit on event click instead of read-only dialog. */
  editable?: boolean
  /** PATCH callback threaded from DashboardEnhanced — writes to /api/data/shipments. */
  onPatchShipment?: (id: string, fields: Record<string, unknown>) => void
  /** Opens the OperationDetailPanel for the given FCL ref (navigates to operaciones tab). */
  onOpenDetail?: (ref: string) => void
}

export default function AgendaCalendar({
  shipments,
  trucks,
  truckLoads,
  depotFilter,
  transportFilter,
  partnerView = false,
  clientView = false,
  defaultView = 'week',
  editable = false,
  onPatchShipment,
  onOpenDetail,
}: AgendaCalendarProps) {
  const [view, setView] = useState<AgendaView>(defaultView)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedShipment, setSelectedShipment] = useState<ParsedShipment | null>(null)
  const [selectedCntr, setSelectedCntr] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Quick-edit popover state (admin only, editable=true)
  const [quickEditEvent, setQuickEditEvent] = useState<CalendarEvent | null>(null)
  const [quickEditOpen, setQuickEditOpen] = useState(false)
  const [activeDepots, setActiveDepots] = useState<Set<string>>(new Set())
  const [activeTransports, setActiveTransports] = useState<Set<string>>(new Set())
  const [showPendingSidebar, setShowPendingSidebar] = useState(false)
  // Filtro "Consolidados": ver SOLO los hitos de camiones 🚛 en el calendario.
  const [onlyTrucks, setOnlyTrucks] = useState(false)

  // DnD state — tracks the event being dragged for DragOverlay preview
  const [dragActiveEvent, setDragActiveEvent] = useState<CalendarEvent | null>(null)

  // PointerSensor with distance:8 so a short tap fires onClick (quick-edit),
  // and only a deliberate drag (≥8px movement) activates DnD.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // Transform all shipments into calendar events (+ hitos de camiones)
  const allEvents = useMemo(() => {
    const list = shipmentsToEvents(shipments, depotFilter, transportFilter)
    if (trucks?.length) list.push(...trucksToEvents(trucks, truckLoads || []))
    list.sort((a, b) => a.date.localeCompare(b.date))
    return list
  }, [shipments, trucks, truckLoads, depotFilter, transportFilter])

  // Extract unique depots from events
  const availableDepots = useMemo(() => {
    const depots = new Set<string>()
    for (const e of allEvents) {
      if (e.deposito) depots.add(e.deposito.toUpperCase())
    }
    return Array.from(depots).sort()
  }, [allEvents])

  // Extract unique transports from events. A TRANSPORTE cell can contain
  // multiple transports separated by "/", ",", or "+". We split and collect
  // each canonical name so filters match the same way partner-shipments do.
  const availableTransports = useMemo(() => {
    const transports = new Set<string>()
    for (const e of allEvents) {
      if (!e.transporte) continue
      const parts = e.transporte.split(/[/,+]/).map(s => s.trim().toUpperCase()).filter(Boolean)
      for (const p of parts) transports.add(p)
    }
    return Array.from(transports).sort()
  }, [allEvents])

  // Transportes ya usados en TODAS las cargas (no solo las con evento visible)
  // → sugerencias del combo Transporte del quick-edit.
  const knownTransportes = useMemo(
    () => deriveKnownTransportes(shipments.flatMap(s => (s.operativas ?? []).map(o => o.TRANSPORTE))),
    [shipments]
  )

  // Filter events by active depots + transports
  const filteredEvents = useMemo(() => {
    let list = allEvents
    if (onlyTrucks) {
      list = list.filter(e => e.id.startsWith('truck-'))
    }
    if (activeDepots.size > 0) {
      list = list.filter(e => e.deposito && activeDepots.has(e.deposito.toUpperCase()))
    }
    if (activeTransports.size > 0) {
      list = list.filter(e => {
        if (!e.transporte) return false
        const parts = e.transporte.split(/[/,+]/).map(s => s.trim().toUpperCase()).filter(Boolean)
        return parts.some(p => activeTransports.has(p))
      })
    }
    return list
  }, [allEvents, onlyTrucks, activeDepots, activeTransports])

  const toggleDepot = useCallback((depot: string) => {
    setActiveDepots(prev => {
      const next = new Set(prev)
      if (next.has(depot)) next.delete(depot)
      else next.add(depot)
      return next
    })
  }, [])

  const toggleTransport = useCallback((transport: string) => {
    setActiveTransports(prev => {
      const next = new Set(prev)
      if (next.has(transport)) next.delete(transport)
      else next.add(transport)
      return next
    })
  }, [])

  // Filter events visible in current range
  const visibleEvents = useMemo(() => {
    switch (view) {
      case 'day': {
        const key = toDateKey(currentDate)
        return filteredEvents.filter(e => e.date === key)
      }
      case 'week': {
        const weekDates = getWeekDates(currentDate)
        const start = toDateKey(weekDates[0])
        const end = toDateKey(weekDates[5])
        return filteredEvents.filter(e => e.date >= start && e.date <= end)
      }
      case 'month': {
        const y = currentDate.getFullYear()
        const m = String(currentDate.getMonth() + 1).padStart(2, '0')
        const prefix = `${y}-${m}`
        return filteredEvents.filter(e => e.date.startsWith(prefix))
      }
      case 'annual': {
        const yPrefix = `${currentDate.getFullYear()}-`
        return filteredEvents.filter(e => e.date.startsWith(yPrefix))
      }
    }
  }, [filteredEvents, view, currentDate])

  const alertCount = useMemo(() => countAlertsInRange(visibleEvents), [visibleEvents])

  // Navigation
  const handleNavigate = useCallback((direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setCurrentDate(new Date())
      return
    }

    setCurrentDate(prev => {
      const d = new Date(prev)
      const delta = direction === 'prev' ? -1 : 1

      switch (view) {
        case 'day':
          d.setDate(d.getDate() + delta)
          // Skip Sunday
          if (d.getDay() === 0) d.setDate(d.getDate() + delta)
          break
        case 'week':
          d.setDate(d.getDate() + 7 * delta)
          break
        case 'month':
          d.setMonth(d.getMonth() + delta)
          break
        case 'annual':
          d.setFullYear(d.getFullYear() + delta)
          break
      }
      return d
    })
  }, [view])

  // Count pending coordination — operativas with a container allocated
  // (CNTR_OP), not yet dispatched (no SALIDA), AND the ship is already in
  // Montevideo or arrives within PENDING_WINDOW_DAYS. Farther ETAs aren't
  // urgent. Within the window, anything missing (depot, transport, or just
  // salida date) counts as pending.
  const pendingCount = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const MS_DAY = 24 * 60 * 60 * 1000
    let count = 0
    for (const s of shipments) {
      if (!s.operativas) continue
      for (const op of s.operativas) {
        const hasCntr = (op.CNTR_OP || s.CNTR || '').trim() !== ''
        if (!hasCntr) continue
        const hasSalida = (op.SALIDA || '').trim() !== ''
        if (hasSalida) continue
        // ETA: use operativa-specific ETA_OP if present, fall back to shipment ETA
        const etaStr = (op.ETA_OP || s.ETA || '').trim()
        const etaDate = parseLocalDate(etaStr)
        if (!etaDate) continue // No ETA → not actionable yet
        const daysUntilEta = Math.ceil((etaDate.getTime() - today.getTime()) / MS_DAY)
        if (daysUntilEta > PENDING_WINDOW_DAYS) continue
        count++
      }
    }
    return count
  }, [shipments])

  // Event selection → admin: open ContainerQuickEdit for FCL containers (have __dbId);
  // read-only views or truck/non-FCL events: open ShipmentDetailsDialog.
  const handleSelectShipment = useCallback((event: CalendarEvent) => {
    if (editable && event.shipment?.__dbId && event.cntr) {
      setQuickEditEvent(event)
      setQuickEditOpen(true)
    } else {
      setSelectedShipment(event.shipment)
      setSelectedCntr(event.cntr || null)
      setDialogOpen(true)
    }
  }, [editable])

  const handleSelectShipmentDirect = useCallback((shipment: ParsedShipment) => {
    setSelectedShipment(shipment)
    setSelectedCntr(null)
    setDialogOpen(true)
  }, [])

  // Opens ContainerQuickEdit for a pending-salida card.
  // Builds a minimal synthetic CalendarEvent with all required CalendarEvent fields.
  const openQuickEditFor = useCallback((shipment: ParsedShipment, cntr: string) => {
    if (!editable || !shipment.__dbId || !cntr) return
    const op = (shipment.operativas ?? []).find(o => (o.CNTR_OP || shipment.CNTR) === cntr)
    if (!op) return
    const synthEvent: CalendarEvent = {
      id: `${shipment.REF}-${cntr}-salida`,
      date: '',
      type: 'salida',
      ref: shipment.REF,
      operativa: op.OPERATIVA || 'CONTENEDOR',
      cntr,
      tipo: op.TIPO || '',
      cliente: op.CLIENTE_OP || shipment.CLIENTE || '',
      fiscal: op.FISCAL || '',
      deposito: op.DEPOSITO || '',
      libre: op.LIBRE || shipment.LIBRE_HASTA || '',
      descripcion: op.DESCRIPCION || '',
      kg: op.KG || 0,
      pkgs: op.PKGS || 0,
      m3: op.M3 || 0,
      transporte: op.TRANSPORTE || '',
      alerts: [],
      shipment,
      op,
      statusColor: 'blue',
      statusLabel: 'Pendiente',
    }
    setQuickEditEvent(synthEvent)
    setQuickEditOpen(true)
  }, [editable])

  // Day click from week/month → switch to day view
  const handleDayClick = useCallback((date: Date) => {
    setCurrentDate(date)
    setView('day')
  }, [])

  // Month click from annual → switch to month view
  const handleMonthClick = useCallback((monthIdx: number) => {
    setCurrentDate(prev => {
      const d = new Date(prev)
      d.setMonth(monthIdx)
      d.setDate(1)
      return d
    })
    setView('month')
  }, [])

  // DnD handlers (week view, editable only)
  const handleDragStart = useCallback((e: DragStartEvent) => {
    const ev = e.active.data.current?.event as CalendarEvent | undefined
    setDragActiveEvent(ev ?? null)
  }, [])

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    setDragActiveEvent(null)
    const event = e.active.data.current?.event as CalendarEvent | undefined
    const newDate = e.over?.id as string | undefined
    const result = dropPatch(event, newDate, buildPatchedOperativas)
    if (!result) return
    // La salida no puede quedar ANTES de la llegada a MVD: confirmar antes de guardar
    // (misma protección que ContainerDatesSection/QuickEdit; era la única ruta sin el check).
    if (event?.type === 'salida' && newDate && isSalidaBeforeArrival(newDate, event.shipment?.ETA || '')) {
      const ok = window.confirm(
        `⏰ La salida quedaría el ${newDate}, ANTES de la llegada a MVD (${event.shipment?.ETA || '—'})` +
        ` del contenedor ${event.cntr || ''}.\n\n¿Guardar igual?`
      )
      if (!ok) return
    }
    onPatchShipment?.(result.dbId, result.fields)
  }, [onPatchShipment])

  return (
    <div className="space-y-4">
      <AgendaToolbar
        view={view}
        currentDate={currentDate}
        eventCount={visibleEvents.length}
        alertCount={alertCount}
        onViewChange={setView}
        onNavigate={handleNavigate}
        availableDepots={availableDepots}
        activeDepots={activeDepots}
        onToggleDepot={toggleDepot}
        onClearDepots={() => setActiveDepots(new Set())}
        availableTransports={availableTransports}
        activeTransports={activeTransports}
        onToggleTransport={toggleTransport}
        onClearTransports={() => setActiveTransports(new Set())}
        pendingCount={pendingCount}
        showPendingSidebar={false}
        // Pending-sidebar toggle is admin-only (makes no sense for a single partner/client).
        onTogglePendingSidebar={undefined}
      />

      {/* Filtro Consolidados: solo los hitos de camiones 🚛 (visible si hay camiones en la agenda) */}
      {trucks && trucks.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOnlyTrucks(v => !v)}
            title="Ver solo los camiones consolidados (carga programada)"
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 border text-xs transition-all hover:shadow-sm ${
              onlyTrucks ? 'bg-amber-50 border-amber-300 text-amber-800 font-medium' : 'bg-card border-border text-muted-foreground'
            }`}
          >
            🚛 Consolidados{onlyTrucks ? ' · solo' : ''}
          </button>
        </div>
      )}

      {/* DndContext wraps the grid only when editable (week view DnD).
          Non-editable views render the grid directly — no DnD overhead. */}
      {editable ? (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDragActiveEvent(null)}
        >
          <div className="flex overflow-hidden rounded-xl border bg-card shadow-sm">
            {/* Main calendar area */}
            <div className={`flex-1 min-w-0 transition-all ${showPendingSidebar ? '' : ''}`}>
              {view === 'day' && (
                <AgendaDayView
                  date={currentDate}
                  events={filteredEvents}
                  onSelectShipment={handleSelectShipment}
                />
              )}

              {view === 'week' && (
                <AgendaWeekView
                  date={currentDate}
                  events={filteredEvents}
                  onSelectShipment={handleSelectShipment}
                  onDayClick={handleDayClick}
                  editable={editable}
                />
              )}

              {view === 'month' && (
                <AgendaMonthView
                  date={currentDate}
                  events={filteredEvents}
                  onSelectShipment={handleSelectShipment}
                  onDayClick={handleDayClick}
                />
              )}

              {view === 'annual' && (
                <AgendaAnnualView
                  date={currentDate}
                  events={filteredEvents}
                  onMonthClick={handleMonthClick}
                  onDayClick={handleDayClick}
                />
              )}
            </div>

            {/* Pending coordination sidebar */}
            {showPendingSidebar && !partnerView && !clientView && (
              <AgendaPendingSidebar
                shipments={shipments}
                windowDays={PENDING_WINDOW_DAYS}
                onClose={() => setShowPendingSidebar(false)}
                onSelectShipment={handleSelectShipmentDirect}
              />
            )}
          </div>

          {/* DragOverlay: clean floating preview of the card being dragged */}
          <DragOverlay dropAnimation={null}>
            {dragActiveEvent && (
              <div className="w-44 rotate-1 shadow-xl opacity-90 pointer-events-none">
                <AgendaEventCard
                  event={dragActiveEvent}
                  compact={true}
                  draggable={false}
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="flex overflow-hidden rounded-xl border bg-card shadow-sm">
          {/* Main calendar area */}
          <div className={`flex-1 min-w-0 transition-all ${showPendingSidebar ? '' : ''}`}>
            {view === 'day' && (
              <AgendaDayView
                date={currentDate}
                events={filteredEvents}
                onSelectShipment={handleSelectShipment}
              />
            )}

            {view === 'week' && (
              <AgendaWeekView
                date={currentDate}
                events={filteredEvents}
                onSelectShipment={handleSelectShipment}
                onDayClick={handleDayClick}
              />
            )}

            {view === 'month' && (
              <AgendaMonthView
                date={currentDate}
                events={filteredEvents}
                onSelectShipment={handleSelectShipment}
                onDayClick={handleDayClick}
              />
            )}

            {view === 'annual' && (
              <AgendaAnnualView
                date={currentDate}
                events={filteredEvents}
                onMonthClick={handleMonthClick}
                onDayClick={handleDayClick}
              />
            )}
          </div>

          {/* Pending coordination sidebar */}
          {showPendingSidebar && !partnerView && !clientView && (
            <AgendaPendingSidebar
              shipments={shipments}
              windowDays={PENDING_WINDOW_DAYS}
              onClose={() => setShowPendingSidebar(false)}
              onSelectShipment={handleSelectShipmentDirect}
            />
          )}
        </div>
      )}

      {/* Pending salida section — arrived shipments with no departure scheduled yet (admin only) */}
      {editable && (
        <PendingSalidaSection
          shipments={shipments}
          editable={editable}
          onCoordinar={openQuickEditFor}
        />
      )}

      {/* Admin quick-edit modal — ContainerQuickEdit (editable=true only) */}
      {editable && quickEditEvent?.shipment && quickEditEvent.cntr && (
        <ContainerQuickEdit
          key={`${quickEditEvent.cntr}-${quickEditEvent.shipment.REF}`}
          shipment={quickEditEvent.shipment}
          cntr={quickEditEvent.cntr}
          editable={!!onPatchShipment}
          knownTransportes={knownTransportes}
          open={quickEditOpen}
          onOpenChange={(o) => {
            setQuickEditOpen(o)
            if (!o) setQuickEditEvent(null)
          }}
          onPatch={(dbId, fields) => onPatchShipment?.(dbId, fields)}
          onMasDatos={() => {
            // dbId resuelve la op exacta post-flip; ref como fallback.
            const key = quickEditEvent.shipment?.__dbId || quickEditEvent.ref
            setQuickEditOpen(false)
            setQuickEditEvent(null)
            onOpenDetail?.(key)
          }}
          onSaved={() => {
            setQuickEditOpen(false)
            setQuickEditEvent(null)
          }}
        />
      )}

      {/* Read-only shipment details dialog — client/partner views + truck/non-FCL events.
          Always rendered as clientView so the no-op onSave doesn't show a misleading
          enabled "Guardar Cambios" button (Fix 5). FCL edits use ContainerQuickEdit above. */}
      <ShipmentDetailsDialog
        shipment={selectedShipment}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={() => {}}
        clientView
        partnerView={partnerView}
        highlightCntr={selectedCntr}
      />
    </div>
  )
}
