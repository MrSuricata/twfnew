import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShipmentTableSkeleton } from '@/components/SkeletonLoaders'
import BrandLogo from './BrandLogo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  SignOut,
  Package,
  FileText,
  ClockCounterClockwise,
  Eye,
  Truck,
  Cube,
  Bell,
  BellRinging,
  Warning,
  CheckCircle,
  Info,
  X as XIcon,
  CalendarBlank,
  Timer,
  Anchor,
  ArrowRight,
  MagnifyingGlass,
  Funnel,
  Boat,
  FilePdf,
  CaretDown,
} from '@phosphor-icons/react'
import { ParsedShipment, getShipmentStatus, generateShipmentAlerts, isShipmentCompleted, parseLocalDate } from '@/lib/shipmentTypes'
import AvisoOperativo from '@/components/AvisoOperativo'
import { ClientAccount, OperativeReport, OriginPhoto } from '@/lib/quotationTypes'
import { authFetch } from '@/lib/authClient'
import { fetchClientReports, fetchClientOriginPhotos } from '@/lib/dataClient'
import { agendaCliente, EVENTO_LABELS, refParaCliente } from '@/lib/clientAgenda'
import { fmtDateDMY, hoyISO as hoyISOLocal } from '@/lib/format'
import ShipmentDetailsDialog from './ShipmentDetailsDialog'
import AgendaCalendar from './agenda/AgendaCalendar'
import { matchesPattern, findClientByEmail } from '@/lib/clientMatching'
import { useBrand } from '@/lib/brand'
import { downloadClientStatusPdf } from '@/lib/clientStatusPdf'
import HoyCliente from './HoyCliente'
import { estadoCliente, ESTADO_CLIENTE_LABEL, ESTADO_CLIENTE_CLASE, ESTADO_CLIENTE_ORDEN, progresoCliente, proximoHito, refsCliente, esActivaParaCliente, type EstadoCliente } from '@/lib/hoyCliente'

interface ClientPortalProps {
  onLogout: () => void
  clientEmail: string
  /** Nombre visible que viene del token — fallback cuando el catálogo no
   *  matchea por email (impersonate de clientes sin email de contacto). */
  clientName?: string
  shipments?: ParsedShipment[]
  clients?: ClientAccount[]
  reports?: OperativeReport[]
}

export default function ClientPortal({ onLogout, clientEmail, clientName = '', shipments = [], clients = [], reports = [] }: ClientPortalProps) {
  const [activeTab, setActiveTab] = useState('active')
  const [selectedShipment, setSelectedShipment] = useState<ParsedShipment | null>(null)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  // Cards de cargas colapsadas por defecto: una fila por carga, click expande.
  // Antes cada carga era una tarjeta gigante y había que scrollear por cada
  // una (Brian 27/08).
  const [expandedRefs, setExpandedRefs] = useState<Set<string>>(new Set())
  const toggleExpanded = (ref: string) => {
    setExpandedRefs(prev => {
      const next = new Set(prev)
      if (next.has(ref)) next.delete(ref)
      else next.add(ref)
      return next
    })
  }
  // Desde una card de HOY: abrir la carga en la lista, desplegada, y llevar la
  // vista hasta ella (el cliente viene de arriba de todo).
  const verCarga = (ref: string) => {
    clearFilters() // con un filtro/búsqueda activo la fila no estaría en el DOM
    setActiveTab('active')
    setExpandedRefs(prev => { const n = new Set(prev); n.add(ref); return n })
    requestAnimationFrame(() => {
      document.getElementById(`carga-${ref}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }
  const [showNotifications, setShowNotifications] = useState(false)
  const [serverShipments, setServerShipments] = useState<ParsedShipment[]>([])
  const [serverReports, setServerReports] = useState<OperativeReport[]>([])
  const [serverPhotos, setServerPhotos] = useState<OriginPhoto[]>([])
  const [isLoadingData, setIsLoadingData] = useState(true)

  // ── Filter states ──
  const [filterStatus, setFilterStatus] = useState('__all__')
  const [filterSearch, setFilterSearch] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('twf-dismissed-alerts') || '[]')
    } catch { return [] }
  })
  const [seenAlerts, setSeenAlerts] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('twf-seen-alerts') || '[]')
    } catch { return [] }
  })

  // Fetch client-specific data from server (shipments + reports)
  useEffect(() => {
    const fetchClientData = async () => {
      try {
        const [shipmentsRes, reportsData, photosData] = await Promise.allSettled([
          authFetch('/api/sheets/client-data').then(r => r.ok ? r.json() : null),
          fetchClientReports().catch(() => []),
          fetchClientOriginPhotos().catch(() => []),
        ])
        if (shipmentsRes.status === 'fulfilled' && shipmentsRes.value) {
          setServerShipments(shipmentsRes.value.shipments || [])
        }
        if (reportsData.status === 'fulfilled' && reportsData.value) {
          setServerReports(reportsData.value)
        }
        if (photosData.status === 'fulfilled' && photosData.value) {
          setServerPhotos(photosData.value)
        }
      } catch (err) {
        console.warn('Failed to fetch client data from server:', err)
      } finally {
        setIsLoadingData(false)
      }
    }
    fetchClientData()
  }, [clientEmail])

  // Por email SOLO si hay email (email vacío matcheaba al primer cliente sin
  // email del catálogo — "Bienvenido CENA HNOS"); sin match, manda el token.
  const currentClient = findClientByEmail(clients, clientEmail)
  const brand = useBrand()
  // Hoy en ISO LOCAL (lib/format): toISOString() es UTC y después de las
  // 21:00 de Uruguay ya es "mañana" — corría la agenda y las cards un día.
  const hoyISO = hoyISOLocal()

  // Use server data if available, fallback to props
  const clientShipments = serverShipments.length > 0
    ? serverShipments
    : (shipments?.filter(s =>
        currentClient?.clientePattern && matchesPattern(s.CLIENTE, currentClient.clientePattern)
      ) || [])

  const getDaysUntilFree = (libreHasta: string): number => {
    if (!libreHasta) return 999
    try {
      const freeDate = parseLocalDate(libreHasta)
      if (!freeDate) return 999
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const diff = Math.floor((freeDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      return diff
    } catch {
      return 999
    }
  }

  // Activa / Historial con la MISMA regla que el chip de estado del cliente
  // (hoyCliente.esActivaParaCliente). isShipmentCompleted (admin) daba por
  // completado un trasiego el día después de la salida, con el camión en la
  // frontera: la carga caía a Historial justo cuando el cliente la esperaba.
  const isActiveShipment = (shipment: ParsedShipment): boolean => esActivaParaCliente(shipment, hoyISO)

  const activeShipmentsRaw = clientShipments.filter(isActiveShipment)
  const historyShipmentsRaw = clientShipments.filter(s => !isActiveShipment(s))

  // ── Apply filters ──
  const applyFilters = (list: ParsedShipment[]) => {
    let filtered = list

    // Status filter
    if (filterStatus !== '__all__') {
      filtered = filtered.filter(s => estadoCliente(s, hoyISO) === filterStatus)
    }

    // Text search (REF, BUQUE, CNTR, DESCRIPCION)
    if (filterSearch.trim()) {
      const q = filterSearch.toLowerCase().trim()
      filtered = filtered.filter(s => {
        const ops = s.operativas || []
        const desc = ops[0]?.DESCRIPCION || ''
        const containers = s.containers.map(c => c.number).join(' ')
        const opsContainers = ops.map(o => o.CNTR_OP).join(' ')
        const clientRef = String((s as { CLIENT_REF?: string }).CLIENT_REF || '')
        return (
          s.REF.toLowerCase().includes(q) ||
          clientRef.toLowerCase().includes(q) ||
          (s.BUQUE || '').toLowerCase().includes(q) ||
          (s.LINEA || '').toLowerCase().includes(q) ||
          containers.toLowerCase().includes(q) ||
          opsContainers.toLowerCase().includes(q) ||
          desc.toLowerCase().includes(q)
        )
      })
    }

    // Date range filter (by ETA)
    if (filterDateFrom) {
      const from = parseLocalDate(filterDateFrom)
      if (from) {
        filtered = filtered.filter(s => {
          if (!s.ETA) return false
          try {
            const etaDate = parseLocalDate(s.ETA)
            return etaDate ? etaDate >= from : true
          } catch { return true }
        })
      }
    }
    if (filterDateTo) {
      const to = parseLocalDate(filterDateTo)
      if (to) {
        to.setHours(23, 59, 59)
        filtered = filtered.filter(s => {
          if (!s.ETA) return true
          try {
            const etaDate = parseLocalDate(s.ETA)
            return etaDate ? etaDate <= to : true
          } catch { return true }
        })
      }
    }

    return filtered
  }

  const activeShipments = applyFilters(activeShipmentsRaw)
  const historyShipments = applyFilters(historyShipmentsRaw)
  const hasActiveFilters = filterStatus !== '__all__' || filterSearch.trim() !== '' || filterDateFrom !== '' || filterDateTo !== ''

  const clearFilters = () => {
    setFilterStatus('__all__')
    setFilterSearch('')
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  // ── Alerts System ──
  // Use server reports if available (fetched from DB), fall back to props (localStorage)
  const effectiveReports = serverReports.length > 0 ? serverReports : reports
  const clientReports = useMemo(() => {
    const clientRefs = new Set(clientShipments.map(s => s.REF))
    return effectiveReports.filter(r => clientRefs.has(r.shipmentRef))
  }, [effectiveReports, clientShipments])

  const allAlerts = useMemo(() => generateShipmentAlerts(activeShipments, clientReports), [activeShipments, clientReports])

  // La agenda del cliente (Brian 26/08): próximos movimientos, últimas
  // llegadas y contadores de semana/mes — derivada de las cargas activas.
  const agenda = useMemo(
    () => agendaCliente(clientShipments, hoyISO),
    [clientShipments, hoyISO],
  )
  const visibleAlerts = allAlerts.filter(a => !dismissedAlerts.includes(a.id))
  const unseenAlerts = visibleAlerts.filter(a => !seenAlerts.includes(a.id))
  const criticalCount = visibleAlerts.filter(a => a.severity === 'critical' || a.severity === 'warning').length
  const badgeCount = unseenAlerts.length

  const markAllAsSeen = () => {
    const allIds = visibleAlerts.map(a => a.id)
    const updated = [...new Set([...seenAlerts, ...allIds])]
    setSeenAlerts(updated)
    sessionStorage.setItem('twf-seen-alerts', JSON.stringify(updated))
  }

  const dismissAlert = (alertId: string) => {
    const updated = [...dismissedAlerts, alertId]
    setDismissedAlerts(updated)
    localStorage.setItem('twf-dismissed-alerts', JSON.stringify(updated))
  }

  const getAlertIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <Warning size={20} weight="fill" className="text-red-500 shrink-0" />
      case 'warning': return <Warning size={20} weight="fill" className="text-orange-500 shrink-0" />
      case 'info': return <Info size={20} weight="fill" className="text-blue-500 shrink-0" />
      case 'success': return <CheckCircle size={20} weight="fill" className="text-green-500 shrink-0" />
      default: return <Info size={20} className="shrink-0" />
    }
  }

  const getAlertBorderColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'border-l-red-500 bg-red-50'
      case 'warning': return 'border-l-orange-500 bg-orange-50'
      case 'info': return 'border-l-blue-500 bg-blue-50'
      case 'success': return 'border-l-green-500 bg-green-50'
      default: return 'border-l-gray-500'
    }
  }

  const handleViewDetails = (shipment: ParsedShipment) => {
    setSelectedShipment(shipment)
    setDetailsDialogOpen(true)
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="degradado-med text-primary-foreground border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <BrandLogo variant="nav" className="h-8 w-auto" />
              <div className="border-l border-white/20 pl-3">
                <div className="titulo-med text-lg text-white">Portal de Cliente</div>
                <div className="text-xs opacity-80">{currentClient?.company || currentClient?.name || clientName}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Notification Bell */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  const willOpen = !showNotifications
                  setShowNotifications(willOpen)
                  if (willOpen) markAllAsSeen()
                }}
                className="text-primary-foreground hover:bg-primary-foreground/10 relative"
              >
                {criticalCount > 0 && badgeCount > 0 ? (
                  <BellRinging size={22} weight="fill" className="animate-pulse" />
                ) : (
                  <Bell size={22} />
                )}
                {badgeCount > 0 && (
                  <span className={`absolute -top-1 -right-1 text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center ${
                    criticalCount > 0 ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'
                  }`}>
                    {badgeCount}
                  </span>
                )}
              </Button>

              <Button variant="ghost" onClick={onLogout} className="text-primary-foreground hover:bg-primary-foreground/10">
                <SignOut size={20} className="mr-2" />
                Cerrar sesión
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Notifications Panel (dropdown overlay) ── */}
      {showNotifications && (
        <div className="fixed inset-0 z-50" onClick={() => setShowNotifications(false)}>
          <div
            className="absolute right-4 top-16 w-full max-w-md bg-background border rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-top-2 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Bell size={16} />
                Notificaciones
                {visibleAlerts.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{visibleAlerts.length}</Badge>
                )}
              </h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowNotifications(false)}>
                <XIcon size={16} />
              </Button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {visibleAlerts.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <CheckCircle size={40} className="mx-auto mb-3 text-green-500" />
                  <p className="text-sm font-medium">Todo en orden</p>
                  <p className="text-xs mt-1">No hay alertas pendientes</p>
                </div>
              ) : (
                <div className="divide-y">
                  {visibleAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`flex items-start gap-3 px-4 py-3 border-l-4 hover:bg-muted/30 transition-colors cursor-pointer ${getAlertBorderColor(alert.severity)}`}
                      onClick={() => {
                        const shipment = clientShipments.find(s => s.REF === alert.shipmentRef)
                        if (shipment) {
                          handleViewDetails(shipment)
                          setShowNotifications(false)
                        }
                      }}
                    >
                      {getAlertIcon(alert.severity)}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{alert.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{alert.message}</div>
                        {alert.date && (
                          <div className="text-[10px] text-muted-foreground mt-1 font-mono">{alert.date}</div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 opacity-50 hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation()
                          dismissAlert(alert.id)
                        }}
                      >
                        <XIcon size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        {/* Las alertas críticas viven en la card "Atención" de HOY (abajo) y en la pestaña Alertas. */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Mis Cargas</h1>
          <p className="text-muted-foreground">
            {(currentClient?.name || clientName) ? `Bienvenido/a, ${currentClient?.name || clientName}` : 'Bienvenido/a'}
          </p>
        </div>

        {isLoadingData && serverShipments.length === 0 && (
          <>
            <ShipmentTableSkeleton />
          </>
        )}

        {!(isLoadingData && serverShipments.length === 0) && (
        <>
        <AvisoOperativo className="mb-6" />

        {/* HOY del cliente (Brian 02/09): qué le llega, qué espera, qué viene,
            qué zarpó — en vez de cuatro números que no dicen qué hacer. */}
        <HoyCliente
          shipments={activeShipmentsRaw}
          alerts={visibleAlerts.filter(a => a.severity === 'critical' || a.severity === 'warning')}
          hoyISO={hoyISO}
          onVerCarga={verCarga}
          onVerAlertas={() => setActiveTab('alerts')}
        />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="tabs-list-underline max-w-3xl">
            <TabsTrigger value="active" className="tab-underline">
              <Package size={18} className="mr-1.5" />
              <span className="hidden sm:inline">Mis cargas</span>
            </TabsTrigger>
            <TabsTrigger value="agenda" className="tab-underline">
              <CalendarBlank size={18} className="mr-1.5" />
              <span className="hidden sm:inline">Agenda</span>
            </TabsTrigger>
            <TabsTrigger value="alerts" className="tab-underline relative">
              <Bell size={18} className="mr-1.5" />
              <span className="hidden sm:inline">Alertas</span>
              {visibleAlerts.length > 0 && (
                <span className={`ml-1 text-[10px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center tabular-nums ${
                  criticalCount > 0 ? 'bg-destructive text-destructive-foreground' : 'bg-blue-500 text-white'
                }`}>
                  {visibleAlerts.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="tab-underline">
              <ClockCounterClockwise size={18} className="mr-1.5" />
              <span className="hidden sm:inline">Historial</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="agenda" className="space-y-4 mt-6">
            {/* ── Resumen: qué viene y qué acaba de llegar (Brian 26/08) ── */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardContent className="pt-5 pb-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                    Próximos movimientos
                  </h3>
                  {agenda.proximos.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nada agendado por ahora — te avisamos apenas haya novedades.</p>
                  ) : (
                    <div className="space-y-2">
                      {agenda.proximos.slice(0, 8).map((e, i) => (
                        <div key={`${e.tipo}-${e.ref}-${e.cntr}-${i}`} className="flex items-center gap-2.5 text-sm min-w-0">
                          {e.tipo === 'llegada_mvd'
                            ? <Boat size={16} weight="fill" className="text-blue-600 shrink-0" />
                            : e.tipo === 'salida'
                              ? <Truck size={16} weight="fill" className="text-amber-600 shrink-0" />
                              : <Package size={16} weight="fill" className="text-green-600 shrink-0" />}
                          <span className="font-semibold tabular-nums whitespace-nowrap">{fmtDateDMY(e.fecha)}</span>
                          <span className="truncate">
                            {EVENTO_LABELS[e.tipo]} — <b>Ref. {refParaCliente({ REF: e.ref, CLIENT_REF: e.clientRef })}</b>
                            {e.cntr ? <span className="text-muted-foreground font-mono text-xs"> · {e.cntr}</span> : null}
                          </span>
                          <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                            {e.dias === 0 ? 'hoy' : `en ${e.dias}d`}
                          </span>
                        </div>
                      ))}
                      {agenda.proximos.length > 8 && (
                        <p className="text-xs text-muted-foreground">y {agenda.proximos.length - 8} más — los ves en el calendario de abajo</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5 pb-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                    Últimas llegadas a Montevideo
                  </h3>
                  {agenda.ultimasLlegadas.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin llegadas en los últimos 14 días.</p>
                  ) : (
                    <div className="space-y-2">
                      {agenda.ultimasLlegadas.slice(0, 6).map((e, i) => (
                        <div key={`ull-${e.ref}-${i}`} className="flex items-center gap-2.5 text-sm min-w-0">
                          <Anchor size={16} weight="fill" className="text-primary shrink-0" />
                          <span className="font-semibold tabular-nums whitespace-nowrap">{fmtDateDMY(e.fecha)}</span>
                          <span className="truncate"><b>Ref. {refParaCliente({ REF: e.ref, CLIENT_REF: e.clientRef })}</b>{e.buque ? ` · ${e.buque}` : ''}</span>
                          <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">hace {-e.dias}d</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
                    Esta semana: <b className="text-foreground">{agenda.estaSemana.length}</b> movimiento{agenda.estaSemana.length === 1 ? '' : 's'} ·
                    Este mes: <b className="text-foreground">{agenda.esteMes.length}</b>
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground flex items-start gap-2">
              <Info size={16} className="shrink-0 mt-0.5" />
              <span>
                Vista calendario de tus cargas. Clickeá una carga para ver detalles.
                Usá los toggles del encabezado para cambiar entre semana, mes o año.
              </span>
            </div>
            <AgendaCalendar
              shipments={clientShipments}
              clientView={true}
              defaultView="month"
            />
          </TabsContent>

          <TabsContent value="active" className="space-y-4 mt-6">
            {/* ── Filter Bar ── */}
            <div className="space-y-3">
              {/* Quick search + toggle */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por referencia, buque, contenedor..."
                    value={filterSearch}
                    onChange={(e) => setFilterSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                <Button
                  variant={showFilters ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                  className="gap-1.5 shrink-0"
                >
                  <Funnel size={16} />
                  <span className="hidden sm:inline">Filtros</span>
                  {hasActiveFilters && (
                    <span className="bg-accent text-accent-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center">!</span>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadClientStatusPdf(activeShipmentsRaw, currentClient?.name || clientName || clientEmail, brand)}
                  disabled={activeShipmentsRaw.length === 0}
                  className="gap-1.5 shrink-0"
                  title="Descargar PDF con el estado de todas tus cargas activas"
                >
                  <FilePdf size={16} />
                  <span className="hidden sm:inline">Estado (PDF)</span>
                </Button>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-muted-foreground">
                    Limpiar
                  </Button>
                )}
              </div>

              {/* Expanded filters */}
              {showFilters && (
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Status filter */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium flex items-center gap-1">
                          <Boat size={14} /> Estado
                        </Label>
                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__all__">Todos los estados</SelectItem>
                            {ESTADO_CLIENTE_ORDEN.map(e => (
                              <SelectItem key={e} value={e}>{ESTADO_CLIENTE_LABEL[e]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Date from */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium flex items-center gap-1">
                          <CalendarBlank size={14} /> ETA desde
                        </Label>
                        <Input
                          type="date"
                          value={filterDateFrom}
                          onChange={(e) => setFilterDateFrom(e.target.value)}
                          className="h-9"
                        />
                      </div>

                      {/* Date to */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium flex items-center gap-1">
                          <CalendarBlank size={14} /> ETA hasta
                        </Label>
                        <Input
                          type="date"
                          value={filterDateTo}
                          onChange={(e) => setFilterDateTo(e.target.value)}
                          className="h-9"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Active filter summary */}
              {hasActiveFilters && (
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-muted-foreground">Mostrando {activeShipments.length} de {activeShipmentsRaw.length} cargas</span>
                  {filterStatus !== '__all__' && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      {ESTADO_CLIENTE_LABEL[filterStatus as EstadoCliente] ?? filterStatus}
                      <button onClick={() => setFilterStatus('__all__')} className="ml-0.5 hover:text-foreground"><XIcon size={12} /></button>
                    </Badge>
                  )}
                  {filterSearch && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      "{filterSearch}"
                      <button onClick={() => setFilterSearch('')} className="ml-0.5 hover:text-foreground"><XIcon size={12} /></button>
                    </Badge>
                  )}
                  {filterDateFrom && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      Desde: {filterDateFrom}
                      <button onClick={() => setFilterDateFrom('')} className="ml-0.5 hover:text-foreground"><XIcon size={12} /></button>
                    </Badge>
                  )}
                  {filterDateTo && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      Hasta: {filterDateTo}
                      <button onClick={() => setFilterDateTo('')} className="ml-0.5 hover:text-foreground"><XIcon size={12} /></button>
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {activeShipments.length === 0 ? (
              <Card>
                <CardContent className="pt-12 pb-12 text-center">
                  <Package size={48} className="mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">
                    {hasActiveFilters ? 'Sin resultados' : 'Aún no tenés cargas activas'}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    {hasActiveFilters
                      ? 'No se encontraron cargas con los filtros aplicados'
                      : 'Cuando tus contenedores estén en camino, aparecerán acá con su estado y documentación.'}
                  </p>
                  {hasActiveFilters ? (
                    <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4">
                      Limpiar filtros
                    </Button>
                  ) : (
                    <div className="mt-6 text-xs text-muted-foreground space-y-1">
                      <p>¿Consultas? Contactanos:</p>
                      <p>
                        <a href={`mailto:${brand.contact.email}`} className="text-accent hover:underline">{brand.contact.email}</a>
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              activeShipments.map((shipment) => {
                  const ops = shipment.operativas || []
                  const firstOp = ops[0]
                  const totalKg = ops.reduce((sum, o) => sum + o.KG, 0)
                  const totalM3 = ops.reduce((sum, o) => sum + o.M3, 0)
                  const desc = firstOp?.DESCRIPCION || ''
                  const status = getShipmentStatus(shipment)
                  const daysLibre = getDaysUntilFree(shipment.LIBRE_HASTA)
                  // UNA referencia protagonista: la del cliente, o la nuestra
                  // sin la A; la TWF corta queda como dato secundario.
                  const refs = refsCliente(shipment)
                  const estado = estadoCliente(shipment, hoyISO)
                  const progreso = progresoCliente(estado)
                  const expanded = expandedRefs.has(shipment.REF)

                  // Build container list: from operativas or fallback to main CNTR
                  const containerList: { number: string; salida: string; etaFisc: string; tipo: string }[] = []
                  if (ops.length > 0) {
                    for (const op of ops) {
                      containerList.push({
                        number: op.CNTR_OP || '-',
                        salida: op.SALIDA || '',
                        etaFisc: op.ETA_FISC || '',
                        tipo: op.TIPO || ''
                      })
                    }
                  } else if (shipment.containers.length > 0) {
                    for (const c of shipment.containers) {
                      containerList.push({ number: c.number, salida: '', etaFisc: '', tipo: '' })
                    }
                  }

                  // Próximo hito: SIEMPRE el mismo dato para el mismo estado
                  // (antes alternaba ETA Montevideo / Llega a depósito por fila).
                  const hito = proximoHito(shipment, hoyISO)

                  const stripClass =
                    status.color === 'green' ? 'bg-green-500' :
                    status.color === 'yellow' ? 'bg-yellow-500' :
                    status.color === 'red' ? 'bg-red-500' :
                    status.color === 'gray' ? 'bg-gray-400' :
                    'bg-blue-500'

                  return (
                  <Card key={shipment.REF} id={`carga-${shipment.REF}`} className="overflow-hidden py-0 gap-0">
                    {/* ── Fila compacta: siempre visible, click expande ── */}
                    <button
                      type="button"
                      onClick={() => toggleExpanded(shipment.REF)}
                      aria-expanded={expanded}
                      className="w-full text-left hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-stretch">
                        <div className={`w-1.5 shrink-0 ${stripClass}`} />
                        <div className="flex-1 min-w-0 px-3 sm:px-4 py-2.5 flex items-center gap-2 sm:gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold">{refs.principal}</span>
                              {refs.secundaria && (
                                <span className="text-[11px] text-muted-foreground" title="Nuestra referencia">
                                  {refs.secundaria}
                                </span>
                              )}
                              <Badge className={ESTADO_CLIENTE_CLASE[estado]}>{ESTADO_CLIENTE_LABEL[estado]}</Badge>
                              {shipment.N > 0 && <Badge variant="secondary" className="text-xs">{shipment.N} CNTR</Badge>}
                              {shipment.LIBRE_HASTA && daysLibre <= 3 && (
                                <Badge className={daysLibre < 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}>
                                  {daysLibre < 0 ? 'Libre vencido' : daysLibre === 0 ? 'Libre vence HOY' : `Libre: ${daysLibre}d`}
                                </Badge>
                              )}
                            </div>
                            {(desc || shipment.BUQUE) && (
                              <div className="text-xs text-muted-foreground truncate mt-0.5">
                                {desc || shipment.BUQUE}
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{hito.label}</div>
                            <div className="text-sm font-bold tabular-nums">{hito.fecha}</div>
                          </div>
                          <CaretDown
                            size={16}
                            className={`shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
                          />
                        </div>
                      </div>
                    </button>

                    {expanded && (
                    <CardContent className="pt-4 pb-4 border-t">
                      {/* ── Row 1: acción ── */}
                      <div className="flex items-center justify-end mb-3">
                        <Button size="sm" onClick={() => handleViewDetails(shipment)} className="gap-1.5">
                          <Eye size={16} />
                          Ver detalle completo
                        </Button>
                      </div>

                      {/* ── Row 2: Progress bar ── */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>{ESTADO_CLIENTE_LABEL[estado]}</span>
                          <span>{progreso}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all duration-500 ${
                              status.color === 'green' ? 'bg-green-500' :
                              status.color === 'yellow' ? 'bg-yellow-500' :
                              status.color === 'gray' ? 'bg-gray-400' :
                              'bg-blue-500'
                            }`}
                            style={{ width: `${progreso}%` }}
                          />
                        </div>
                      </div>

                      {/* ── Row 3: Key info cards (Libre Hasta + Salida) ── */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        {/* Libre Hasta */}
                        <div className={`rounded-lg border p-3 ${
                          !shipment.LIBRE_HASTA ? 'bg-muted/30' :
                          daysLibre < 0 ? 'bg-red-50 border-red-200' :
                          daysLibre <= 3 ? 'bg-orange-50 border-orange-200' :
                          'bg-green-50 border-green-200'
                        }`}>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                            <Timer size={14} />
                            <span className="font-medium">Libre Hasta</span>
                          </div>
                          {shipment.LIBRE_HASTA ? (
                            <>
                              <div className="text-sm font-bold">{fmtDateDMY(shipment.LIBRE_HASTA)}</div>
                              <div className={`text-xs font-semibold mt-0.5 ${
                                daysLibre < 0 ? 'text-red-600' :
                                daysLibre <= 3 ? 'text-orange-600' :
                                'text-green-600'
                              }`}>
                                {daysLibre < 0 ? `Vencido hace ${Math.abs(daysLibre)} día${Math.abs(daysLibre) === 1 ? '' : 's'}` :
                                 daysLibre === 0 ? 'Vence HOY' :
                                 `${daysLibre} día${daysLibre === 1 ? '' : 's'} restante${daysLibre === 1 ? '' : 's'}`}
                              </div>
                            </>
                          ) : (
                            <div className="text-sm text-muted-foreground italic">Sin información</div>
                          )}
                        </div>

                        {/* Salida prevista */}
                        {(() => {
                          const hasSalida = ops.some(o => o.SALIDA && o.SALIDA.trim() !== '')
                          const salidaDate = ops.find(o => o.SALIDA)?.SALIDA
                          return (
                            <div className={`rounded-lg border p-3 ${
                              hasSalida ? 'bg-blue-50 border-blue-200' : 'bg-muted/30'
                            }`}>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                                <Truck size={14} />
                                <span className="font-medium">Salida Montevideo</span>
                              </div>
                              {hasSalida ? (
                                <div className="text-sm font-bold text-blue-700">{fmtDateDMY(salidaDate || '')}</div>
                              ) : (
                                <div className="text-sm font-semibold text-orange-600">A CONFIRMAR</div>
                              )}
                              {firstOp?.FISCAL && (
                                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                  <ArrowRight size={10} />
                                  {firstOp.FISCAL}
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </div>

                      {/* ── Row 4: Description ── */}
                      {desc && (
                        <div className="text-sm text-muted-foreground mb-3 flex items-center gap-2">
                          <Cube size={16} className="shrink-0 text-accent" />
                          <span className="font-medium text-foreground">{desc}</span>
                          {totalKg > 0 && <span className="text-xs">• {totalKg.toLocaleString()} kg</span>}
                          {totalM3 > 0 && <span className="text-xs">• {totalM3.toFixed(1)} m³</span>}
                        </div>
                      )}

                      {/* ── Row 5: Container list (if multiple or has ops) ── */}
                      {containerList.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Contenedores</div>
                          <div className="rounded-lg border divide-y text-sm overflow-hidden">
                            {containerList.map((c, idx) => (
                              <div key={idx} className="flex items-center justify-between px-3 py-2 bg-muted/20 hover:bg-muted/40 transition-colors">
                                <div className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${c.salida ? 'bg-green-500' : 'bg-orange-400'}`} />
                                  <span className="font-mono text-xs font-medium">{c.number}</span>
                                  {c.tipo && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{c.tipo}</span>}
                                </div>
                                <div className="text-xs">
                                  {c.salida ? (
                                    <span className="text-green-700 font-medium">Salida: {fmtDateDMY(c.salida)}</span>
                                  ) : (
                                    <span className="text-orange-600 font-medium">Salida: A CONFIRMAR</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ── Row 6: Shipping details (compact) ── */}
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground border-t pt-3">
                        {shipment.BUQUE && (
                          <span><Anchor size={12} className="inline mr-1" />{shipment.BUQUE}</span>
                        )}
                        {shipment.LINEA && (
                          <span>Línea: <span className="font-medium text-foreground">{shipment.LINEA}</span></span>
                        )}
                        {shipment.TERMINAL && (
                          <span>Terminal: <span className="font-medium text-foreground">{shipment.TERMINAL}</span></span>
                        )}
                        {shipment.ETA && (
                          <span>ETA: <span className="font-medium text-foreground">{fmtDateDMY(shipment.ETA)}</span></span>
                        )}
                      </div>
                    </CardContent>
                    )}
                  </Card>
                  )
                })
            )}
          </TabsContent>

          {/* ── Alerts Tab ── */}
          <TabsContent value="alerts" className="space-y-4 mt-6">
            {allAlerts.length === 0 ? (
              <Card>
                <CardContent className="pt-12 pb-12 text-center">
                  <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
                  <h3 className="text-lg font-semibold mb-2">Todo en orden</h3>
                  <p className="text-muted-foreground">
                    No hay alertas ni notificaciones pendientes
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Libre expiration alerts */}
                {(() => {
                  const libreAlerts = allAlerts.filter(a => a.type.startsWith('libre_'))
                  if (libreAlerts.length === 0) return null
                  return (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Warning size={20} className="text-orange-500" />
                          Vencimiento de Días Libres
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {libreAlerts.map(alert => (
                          <div
                            key={alert.id}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg border-l-4 cursor-pointer hover:bg-muted/30 transition-colors ${getAlertBorderColor(alert.severity)}`}
                            onClick={() => {
                              const s = clientShipments.find(sh => sh.REF === alert.shipmentRef)
                              if (s) handleViewDetails(s)
                            }}
                          >
                            {getAlertIcon(alert.severity)}
                            <div className="flex-1">
                              <div className="text-sm font-medium">{alert.title}</div>
                              <div className="text-xs text-muted-foreground">{alert.message}</div>
                            </div>
                            <Badge variant="outline" className="font-mono text-xs">{alert.shipmentRef}</Badge>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )
                })()}

                {/* Status milestone alerts */}
                {(() => {
                  const statusAlerts = allAlerts.filter(a => a.type.startsWith('status_'))
                  if (statusAlerts.length === 0) return null
                  return (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Truck size={20} className="text-blue-500" />
                          Actualizaciones de Estado
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {statusAlerts.map(alert => (
                          <div
                            key={alert.id}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg border-l-4 cursor-pointer hover:bg-muted/30 transition-colors ${getAlertBorderColor(alert.severity)}`}
                            onClick={() => {
                              const s = clientShipments.find(sh => sh.REF === alert.shipmentRef)
                              if (s) handleViewDetails(s)
                            }}
                          >
                            {getAlertIcon(alert.severity)}
                            <div className="flex-1">
                              <div className="text-sm font-medium">{alert.title}</div>
                              <div className="text-xs text-muted-foreground">{alert.message}</div>
                            </div>
                            <Badge variant="outline" className="font-mono text-xs">{alert.shipmentRef}</Badge>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )
                })()}

                {/* Operative report alerts */}
                {(() => {
                  const reportAlerts = allAlerts.filter(a => a.type === 'report_ready')
                  if (reportAlerts.length === 0) return null
                  return (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <FileText size={20} className="text-accent" />
                          Informes Operativos Disponibles
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {reportAlerts.map(alert => (
                          <div
                            key={alert.id}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg border-l-4 cursor-pointer hover:bg-muted/30 transition-colors ${getAlertBorderColor(alert.severity)}`}
                            onClick={() => {
                              const s = clientShipments.find(sh => sh.REF === alert.shipmentRef)
                              if (s) handleViewDetails(s)
                            }}
                          >
                            {getAlertIcon(alert.severity)}
                            <div className="flex-1">
                              <div className="text-sm font-medium">{alert.title}</div>
                              <div className="text-xs text-muted-foreground">{alert.message}</div>
                            </div>
                            <Badge variant="outline" className="font-mono text-xs">{alert.shipmentRef}</Badge>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )
                })()}
              </>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4 mt-6">
            {historyShipments.length === 0 ? (
              <Card>
                <CardContent className="pt-12 pb-12 text-center">
                  <ClockCounterClockwise size={48} className="mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Sin historial</h3>
                  <p className="text-muted-foreground">
                    No hay cargas completadas aún
                  </p>
                </CardContent>
              </Card>
            ) : (
              historyShipments.map((shipment) => {
                const ops = shipment.operativas || []
                const firstOp = ops[0]
                return (
                  <Card key={shipment.REF} className="opacity-80 hover:opacity-100 transition-opacity">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <h3 className="text-lg font-bold">Ref. {refParaCliente(shipment)}</h3>
                            <Badge variant="secondary">{shipment.N} CNTR</Badge>
                            {isShipmentCompleted(shipment) && (
                              <Badge className="bg-gray-500">
                                <CheckCircle size={14} className="mr-1" />
                                Completada
                              </Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 text-sm">
                            <div>
                              <span className="text-muted-foreground">ETD:</span>
                              <span className="ml-2">{fmtDateDMY(shipment.ETD) || '-'}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">ETA:</span>
                              <span className="ml-2">{fmtDateDMY(shipment.ETA) || '-'}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Buque:</span>
                              <span className="ml-2">{shipment.BUQUE || '-'}</span>
                            </div>
                            {firstOp?.DESCRIPCION && (
                              <div className="col-span-2 md:col-span-3">
                                <span className="text-muted-foreground">Carga:</span>
                                <span className="ml-2">{firstOp.DESCRIPCION}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <Button
                          onClick={() => handleViewDetails(shipment)}
                          variant="outline"
                          size="sm"
                        >
                          Ver Detalle
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })

            )}
          </TabsContent>
        </Tabs>
        </>
        )}
      </div>

      {selectedShipment && (
        <ShipmentDetailsDialog
          shipment={selectedShipment}
          open={detailsDialogOpen}
          onOpenChange={setDetailsDialogOpen}
          onSave={() => {}}
          clientView
          reports={clientReports}
          originPhotos={serverPhotos}
        />
      )}
    </div>
  )
}
