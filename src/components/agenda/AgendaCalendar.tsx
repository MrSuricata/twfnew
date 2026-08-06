import { useState, useMemo, useCallback, useRef } from 'react'
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
import TruckAgendaDialog from './TruckAgendaDialog'
import ContainerQuickEdit, { buildPatchedOperativas } from '../operations/ContainerQuickEdit'
import { deriveKnownTransportes } from '@/lib/operationsTypes'
import { dropPatch, dropPatchTruck } from './agendaDnd'
import { fmtDateDMY } from '@/lib/format'
import { isSalidaBeforeArrival } from '@/lib/salidaCheck'
import { isSinTelex, SIN_TELEX_MSG } from '@/lib/telexCheck'
import { toast } from 'sonner'

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
  /** Persistir cambios de camiones (drag de sus hitos en la vista semanal) —
   *  el handleUpdateTrucks de App (optimista + POST). Sin esto, soltar un
   *  chip de camión es no-op. */
  onUpdateTrucks?: (trucks: Truck[], changedIds?: string[]) => void
  /** Opens the OperationDetailPanel for the given FCL ref (navigates to operaciones tab). */
  onOpenDetail?: (ref: string) => void
  /** Refs (UPPER/trim) de cargas SIN telex — alerta 🚨 en los hitos de camiones. */
  sinTelexRefs?: Set<string>
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
  onUpdateTrucks,
  onOpenDetail,
  sinTelexRefs,
}: AgendaCalendarProps) {
  const [view, setView] = useState<AgendaView>(defaultView)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedShipment, setSelectedShipment] = useState<ParsedShipment | null>(null)
  const [selectedCntr, setSelectedCntr] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  // Camión consolidado seleccionado (hito 🚛 clickeado) → TruckAgendaDialog.
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null)

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
    if (trucks?.length) list.push(...trucksToEvents(trucks, truckLoads || [], sinTelexRefs))
    list.sort((a, b) => a.date.localeCompare(b.date))
    return list
  }, [shipments, trucks, truckLoads, depotFilter, transportFilter, sinTelexRefs])

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

  // Event selection → admin: open ContainerQuickEdit for editable DB rows (have
  // __dbId) AUNQUE la carga no tenga contenedor asignado todavía (cntr '') — si
  // no, una carga recién creada caía a la vista VIEJA de solo lectura.
  const handleSelectShipment = useCallback((event: CalendarEvent) => {
    // Hitos de camión 🚛 → modal propio con sus cargas relacionadas (antes
    // caían al dialog viejo de solo lectura con un shipment sintético).
    // id = `truck-${t.id}-${type}` y t.id puede contener guiones → slice, no split.
    if (event.id.startsWith('truck-')) {
      const truckId = event.id.slice('truck-'.length, event.id.length - (event.type.length + 1))
      const t = (trucks || []).find(x => x.id === truckId)
      if (t) {
        setSelectedTruck(t)
        return
      }
    }
    if (editable && event.shipment?.__dbId) {
      setQuickEditEvent(event)
      setQuickEditOpen(true)
    } else {
      setSelectedShipment(event.shipment)
      setSelectedCntr(event.cntr || null)
      setDialogOpen(true)
    }
  }, [editable, trucks])

  const handleSelectShipmentDirect = useCallback((shipment: ParsedShipment) => {
    setSelectedShipment(shipment)
    setSelectedCntr(null)
    setDialogOpen(true)
  }, [])

  // Opens ContainerQuickEdit for a pending-salida card.
  // Builds a minimal synthetic CalendarEvent with all required CalendarEvent fields.
  // cntr puede ser '' (carga sin contenedor asignado): matchea la operativa con
  // CNTR_OP vacío o cae a la primera — el quick-edit funciona igual.
  const openQuickEditFor = useCallback((shipment: ParsedShipment, cntr: string) => {
    if (!editable || !shipment.__dbId) return
    const ops = shipment.operativas ?? []
    const op = ops.find(o => (o.CNTR_OP || shipment.CNTR || '') === cntr) ?? (cntr === '' ? ops[0] : undefined)
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

  // Ref siempre-fresca de los camiones para el Deshacer del drag (el toast
  // captura el closure del render del drop; con la ref restauramos sobre el
  // estado ACTUAL sin pisar otros cambios).
  const trucksRef = useRef<Truck[]>(trucks || [])
  trucksRef.current = trucks || []
  const applyTruckFields = useCallback((truckId: string, fields: Partial<Truck>) => {
    const next = trucksRef.current.map(t => (t.id === truckId ? { ...t, ...fields, updatedAt: Date.now() } : t))
    onUpdateTrucks?.(next, [truckId])
  }, [onUpdateTrucks])

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    setDragActiveEvent(null)
    const event = e.active.data.current?.event as CalendarEvent | undefined
    const newDate = e.over?.id as string | undefined
    // ── Camiones: mover carga (🟡) / salida (🔵) a otro día ──
    if (event?.id.startsWith('truck-') && onUpdateTrucks) {
      const truckRes = dropPatchTruck(event, newDate, trucksRef.current)
      if (truckRes) {
        const prev = trucksRef.current.find(t => t.id === truckRes.truckId)
        const prevFields: Partial<Truck> = {}
        for (const k of Object.keys(truckRes.fields) as ('loadDate' | 'departureDate')[]) prevFields[k] = prev?.[k]
        applyTruckFields(truckRes.truckId, truckRes.fields)
        toast.success(`${event.ref} movido al ${fmtDateDMY(newDate!)}`, {
          action: { label: 'Deshacer', onClick: () => applyTruckFields(truckRes.truckId, prevFields) },
        })
      } else if (newDate && newDate !== event.date && (event.type === 'salida' || event.type === 'carga')) {
        toast.warning('No se pudo mover: la salida del camión no puede quedar después de su llegada a fiscal.')
      }
      return
    }
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
    // Aviso (no bloquea): se movió la salida de una carga cuyo telex sigue sin liberar.
    if (event?.type === 'salida' && newDate && isSinTelex(event.op?.TLX)) {
      toast.warning(`🚨 ${event.ref} — ${SIN_TELEX_MSG}`)
    }
    onPatchShipment?.(result.dbId, result.fields)
  }, [onPatchShipment, onUpdateTrucks, applyTruckFields])

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
          trucks={trucks}
          truckLoads={truckLoads}
        />
      )}

      {/* Admin quick-edit modal — ContainerQuickEdit (editable=true only). cntr
          puede ser '' (carga sin contenedor asignado): edita su única operativa. */}
      {editable && quickEditEvent?.shipment && (
        <ContainerQuickEdit
          key={`${quickEditEvent.cntr || 'sin-cntr'}-${quickEditEvent.shipment.REF}`}
          shipment={quickEditEvent.shipment}
          cntr={quickEditEvent.cntr || ''}
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

      {/* Modal moderno de camión consolidado — cabecera + cargas clickeables. */}
      <TruckAgendaDialog
        truck={selectedTruck}
        loads={truckLoads || []}
        onClose={() => setSelectedTruck(null)}
        onOpenDetail={onOpenDetail}
        sinTelexRefs={sinTelexRefs}
      />
    </div>
  )
}
