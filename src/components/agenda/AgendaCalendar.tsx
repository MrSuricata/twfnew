import { useState, useMemo, useCallback } from 'react'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import type { AgendaView, CalendarEvent } from '@/lib/agendaTypes'
import { shipmentsToEvents, groupEventsByDate, countAlertsInRange, getWeekDates, toDateKey } from '@/lib/agendaUtils'

import AgendaToolbar from './AgendaToolbar'
import AgendaDayView from './AgendaDayView'
import AgendaWeekView from './AgendaWeekView'
import AgendaMonthView from './AgendaMonthView'
import AgendaAnnualView from './AgendaAnnualView'
import AgendaPendingSidebar from './AgendaPendingSidebar'
import ShipmentDetailsDialog from '../ShipmentDetailsDialog'

interface AgendaCalendarProps {
  shipments: ParsedShipment[]
  depotFilter?: string
  transportFilter?: string
  partnerView?: boolean
}

export default function AgendaCalendar({ shipments, depotFilter, transportFilter, partnerView = false }: AgendaCalendarProps) {
  const [view, setView] = useState<AgendaView>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedShipment, setSelectedShipment] = useState<ParsedShipment | null>(null)
  const [selectedCntr, setSelectedCntr] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeDepots, setActiveDepots] = useState<Set<string>>(new Set())
  const [showPendingSidebar, setShowPendingSidebar] = useState(false)

  // Transform all shipments into calendar events
  const allEvents = useMemo(
    () => shipmentsToEvents(shipments, depotFilter, transportFilter),
    [shipments, depotFilter, transportFilter]
  )

  // Extract unique depots from events
  const availableDepots = useMemo(() => {
    const depots = new Set<string>()
    for (const e of allEvents) {
      if (e.deposito) depots.add(e.deposito.toUpperCase())
    }
    return Array.from(depots).sort()
  }, [allEvents])

  // Filter events by active depots
  const filteredEvents = useMemo(() => {
    if (activeDepots.size === 0) return allEvents
    return allEvents.filter(e => e.deposito && activeDepots.has(e.deposito.toUpperCase()))
  }, [allEvents, activeDepots])

  const toggleDepot = useCallback((depot: string) => {
    setActiveDepots(prev => {
      const next = new Set(prev)
      if (next.has(depot)) next.delete(depot)
      else next.add(depot)
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

  // Count pending coordination (depot + transporte but no salida)
  const pendingCount = useMemo(() => {
    let count = 0
    for (const s of shipments) {
      if (!s.operativas) continue
      for (const op of s.operativas) {
        if (op.DEPOSITO?.trim() && op.TRANSPORTE?.trim() && !op.SALIDA?.trim()) count++
      }
    }
    return count
  }, [shipments])

  // Event selection → open shipment details
  const handleSelectShipment = useCallback((event: CalendarEvent) => {
    setSelectedShipment(event.shipment)
    setSelectedCntr(event.cntr || null)
    setDialogOpen(true)
  }, [])

  const handleSelectShipmentDirect = useCallback((shipment: ParsedShipment) => {
    setSelectedShipment(shipment)
    setSelectedCntr(null)
    setDialogOpen(true)
  }, [])

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
        pendingCount={pendingCount}
        showPendingSidebar={showPendingSidebar}
        onTogglePendingSidebar={() => setShowPendingSidebar(prev => !prev)}
      />

      <div className="flex gap-0 overflow-hidden rounded-xl border border-border bg-card">
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

        {/* Pending coordination sidebar — admin-only (meaningless to a
            single partner since they only see their own depot/transport). */}
        {showPendingSidebar && !partnerView && (
          <AgendaPendingSidebar
            shipments={shipments}
            onClose={() => setShowPendingSidebar(false)}
            onSelectShipment={handleSelectShipmentDirect}
          />
        )}
      </div>

      {/* Reuse existing shipment details dialog */}
      <ShipmentDetailsDialog
        shipment={selectedShipment}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={() => {}} // Read-only from agenda
        clientView={false}
        partnerView={partnerView}
        highlightCntr={selectedCntr}
      />
    </div>
  )
}
