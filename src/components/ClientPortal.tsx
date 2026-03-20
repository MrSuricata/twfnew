import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  MapPin,
  Warehouse,
  CalendarBlank,
  Timer,
  Anchor,
  ArrowRight,
  MagnifyingGlass,
  Funnel,
  Boat,
} from '@phosphor-icons/react'
import { ParsedShipment, getShipmentStatus, generateShipmentAlerts, isShipmentCompleted, ShipmentAlert } from '@/lib/shipmentTypes'
import { ClientAccount, OperativeReport, OriginPhoto } from '@/lib/quotationTypes'
import { toast } from 'sonner'
import { authFetch } from '@/lib/authClient'
import { fetchClientReports, fetchClientOriginPhotos } from '@/lib/dataClient'
import ShipmentDetailsDialog from './ShipmentDetailsDialog'

interface ClientPortalProps {
  onLogout: () => void
  clientEmail: string
  shipments?: ParsedShipment[]
  clients?: ClientAccount[]
  reports?: OperativeReport[]
}

export default function ClientPortal({ onLogout, clientEmail, shipments = [], clients = [], reports = [] }: ClientPortalProps) {
  const [activeTab, setActiveTab] = useState('active')
  const [selectedShipment, setSelectedShipment] = useState<ParsedShipment | null>(null)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
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

  const currentClient = clients?.find(c => c.email === clientEmail)

  // Multi-pattern matching helper (supports "PATTERN1,PATTERN2")
  const matchesPattern = (cliente: string, pattern: string) => {
    if (!cliente || !pattern) return false
    const clienteUpper = cliente.toUpperCase()
    return pattern.toUpperCase().split(',').map(p => p.trim()).filter(Boolean).some(p => clienteUpper.includes(p))
  }

  // Use server data if available, fallback to props
  const clientShipments = serverShipments.length > 0
    ? serverShipments
    : (shipments?.filter(s =>
        currentClient?.clientePattern && matchesPattern(s.CLIENTE, currentClient.clientePattern)
      ) || [])

  const getDaysUntilFree = (libreHasta: string): number => {
    if (!libreHasta) return 999
    try {
      const freeDate = new Date(libreHasta)
      const today = new Date()
      const diff = Math.floor((freeDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      return diff
    } catch {
      return 999
    }
  }

  // Improved: A shipment is active unless it's completed (all containers devueltos/SALIDA)
  // OR if libre expired more than 30 days ago AND no operativas data
  const isActiveShipment = (shipment: ParsedShipment): boolean => {
    // If all containers have SALIDA → completed (user's logic)
    if (isShipmentCompleted(shipment)) return false
    // Fallback for shipments without operativas: use libre date
    const daysUntilFree = getDaysUntilFree(shipment.LIBRE_HASTA)
    return daysUntilFree >= -30
  }

  const activeShipmentsRaw = clientShipments.filter(isActiveShipment)
  const historyShipmentsRaw = clientShipments.filter(s => !isActiveShipment(s))

  // ── Apply filters ──
  const applyFilters = (list: ParsedShipment[]) => {
    let filtered = list

    // Status filter
    if (filterStatus !== '__all__') {
      filtered = filtered.filter(s => {
        const st = getShipmentStatus(s)
        return st.code === filterStatus
      })
    }

    // Text search (REF, BUQUE, CNTR, DESCRIPCION)
    if (filterSearch.trim()) {
      const q = filterSearch.toLowerCase().trim()
      filtered = filtered.filter(s => {
        const ops = s.operativas || []
        const desc = ops[0]?.DESCRIPCION || ''
        const containers = s.containers.map(c => c.number).join(' ')
        const opsContainers = ops.map(o => o.CNTR_OP).join(' ')
        return (
          s.REF.toLowerCase().includes(q) ||
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
      const from = new Date(filterDateFrom)
      filtered = filtered.filter(s => {
        if (!s.ETA) return false
        try { return new Date(s.ETA) >= from } catch { return true }
      })
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo)
      to.setHours(23, 59, 59)
      filtered = filtered.filter(s => {
        if (!s.ETA) return true
        try { return new Date(s.ETA) <= to } catch { return true }
      })
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
      case 'critical': return 'border-l-red-500 bg-red-50 dark:bg-red-950/20'
      case 'warning': return 'border-l-orange-500 bg-orange-50 dark:bg-orange-950/20'
      case 'info': return 'border-l-blue-500 bg-blue-50 dark:bg-blue-950/20'
      case 'success': return 'border-l-green-500 bg-green-50 dark:bg-green-950/20'
      default: return 'border-l-gray-500'
    }
  }

  const getStatusBadge = (shipment: ParsedShipment) => {
    const status = getShipmentStatus(shipment)
    const colorMap: Record<string, string> = {
      blue: 'bg-blue-500',
      yellow: 'bg-yellow-500 text-black',
      green: 'bg-green-500',
      gray: 'bg-gray-500',
      red: 'bg-red-500',
      orange: 'bg-orange-500'
    }
    return <Badge className={colorMap[status.color] || 'bg-gray-500'}>{status.label}</Badge>
  }

  const getUrgencyBadge = (days: number) => {
    if (days < 0) {
      return <Badge className="bg-red-500">Vencido</Badge>
    } else if (days <= 2) {
      return <Badge className="bg-orange-500">Urgente</Badge>
    } else if (days <= 5) {
      return <Badge className="bg-yellow-500">Próximo</Badge>
    }
    return <Badge className="bg-green-500">A tiempo</Badge>
  }

  const handleViewDetails = (shipment: ParsedShipment) => {
    setSelectedShipment(shipment)
    setDetailsDialogOpen(true)
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-primary text-primary-foreground border-b border-border">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <img src="/images/twf-logo-white.png" alt="TWF" className="h-8 w-auto" />
              <div>
                <div className="text-xl font-bold">Portal de Cliente</div>
                <div className="text-xs opacity-80">{currentClient?.company || currentClient?.name}</div>
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
                Cerrar Sesión
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
        {/* ── Critical Alerts Banner (always visible if critical alerts exist) ── */}
        {visibleAlerts.filter(a => a.severity === 'critical').length > 0 && (
          <div className="mb-6 space-y-2">
            {visibleAlerts.filter(a => a.severity === 'critical').map(alert => (
              <div key={alert.id} className="flex items-center gap-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg px-4 py-3">
                <Warning size={20} weight="fill" className="text-red-500 shrink-0" />
                <div className="flex-1 text-sm">
                  <span className="font-semibold text-red-700 dark:text-red-400">{alert.title}:</span>
                  <span className="ml-1 text-red-600 dark:text-red-300">{alert.message}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50"
                  onClick={() => dismissAlert(alert.id)}
                >
                  <XIcon size={16} />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Mis Cargas</h1>
          <p className="text-muted-foreground">
            Bienvenido/a, {currentClient?.name}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-accent">{activeShipments.length}</div>
              <div className="text-sm text-muted-foreground">Cargas Activas</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-accent">
                {activeShipments.reduce((sum, s) => sum + s.N, 0)}
              </div>
              <div className="text-sm text-muted-foreground">Contenedores</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className={`text-3xl font-bold ${criticalCount > 0 ? 'text-red-500' : 'text-green-500'}`}>
                {criticalCount > 0 ? criticalCount : '✓'}
              </div>
              <div className="text-sm text-muted-foreground">
                {criticalCount > 0 ? 'Alertas Activas' : 'Sin Alertas'}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-accent">{historyShipments.length}</div>
              <div className="text-sm text-muted-foreground">Completadas</div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 max-w-2xl">
            <TabsTrigger value="active">
              <Package size={20} className="mr-2" />
              Activas
            </TabsTrigger>
            <TabsTrigger value="alerts" className="relative">
              <Bell size={20} className="mr-2" />
              Alertas
              {visibleAlerts.length > 0 && (
                <span className={`ml-1 text-[10px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center ${
                  criticalCount > 0 ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'
                }`}>
                  {visibleAlerts.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">
              <ClockCounterClockwise size={20} className="mr-2" />
              Historial
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4 mt-6">
            {/* ── Filter Bar ── */}
            <div className="space-y-3">
              {/* Quick search + toggle */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por REF, buque, contenedor..."
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
                            <SelectItem value="en_transito">🚢 En Tránsito Marítimo</SelectItem>
                            <SelectItem value="en_puerto">⚓ En Terminal / Puerto</SelectItem>
                            <SelectItem value="salio_montevideo">🚛 Salida MVD / Carga Hoy</SelectItem>
                            <SelectItem value="en_frontera">🛃 En Frontera</SelectItem>
                            <SelectItem value="llego_fiscal">📦 En Depósito Fiscal</SelectItem>
                            <SelectItem value="devuelto">✅ Contenedor Devuelto</SelectItem>
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
                      {filterStatus === 'en_transito' ? '🚢 En Tránsito' :
                       filterStatus === 'en_puerto' ? '⚓ Terminal/Puerto' :
                       filterStatus === 'salio_montevideo' ? '🚛 Salida MVD' :
                       filterStatus === 'en_frontera' ? '🛃 Frontera' :
                       filterStatus === 'llego_fiscal' ? '📦 Fiscal' :
                       filterStatus === 'devuelto' ? '✅ Devuelto' : filterStatus}
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
                    {hasActiveFilters ? 'Sin resultados' : 'No hay cargas activas'}
                  </h3>
                  <p className="text-muted-foreground">
                    {hasActiveFilters
                      ? 'No se encontraron cargas con los filtros aplicados'
                      : 'Actualmente no tienes cargas en tránsito'}
                  </p>
                  {hasActiveFilters && (
                    <Button variant="outline" size="sm" onClick={clearFilters} className="mt-3">
                      Limpiar filtros
                    </Button>
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

                  return (
                  <Card key={shipment.REF} className="hover:shadow-lg transition-shadow overflow-hidden">
                    {/* ── Header with status color strip ── */}
                    <div className={`h-1.5 ${
                      status.color === 'green' ? 'bg-green-500' :
                      status.color === 'yellow' ? 'bg-yellow-500' :
                      status.color === 'red' ? 'bg-red-500' :
                      status.color === 'gray' ? 'bg-gray-400' :
                      'bg-blue-500'
                    }`} />

                    <CardContent className="pt-5 pb-4">
                      {/* ── Row 1: REF + Badges + Actions ── */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-xl font-bold tracking-tight">{shipment.REF}</h3>
                          <Badge className="bg-accent text-accent-foreground text-xs">{shipment.N} CNTR</Badge>
                          {getStatusBadge(shipment)}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" onClick={() => handleViewDetails(shipment)} className="gap-1.5">
                            <Eye size={16} />
                            <span className="hidden sm:inline">Detalle</span>
                          </Button>
                        </div>
                      </div>

                      {/* ── Row 2: Progress bar ── */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>{status.label}</span>
                          <span>{status.progress}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all duration-500 ${
                              status.color === 'green' ? 'bg-green-500' :
                              status.color === 'yellow' ? 'bg-yellow-500' :
                              status.color === 'gray' ? 'bg-gray-400' :
                              'bg-blue-500'
                            }`}
                            style={{ width: `${status.progress}%` }}
                          />
                        </div>
                      </div>

                      {/* ── Row 3: Key info cards (Libre Hasta + Salida) ── */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        {/* Libre Hasta */}
                        <div className={`rounded-lg border p-3 ${
                          !shipment.LIBRE_HASTA ? 'bg-muted/30' :
                          daysLibre < 0 ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900' :
                          daysLibre <= 3 ? 'bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-900' :
                          'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900'
                        }`}>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                            <Timer size={14} />
                            <span className="font-medium">Libre Hasta</span>
                          </div>
                          {shipment.LIBRE_HASTA ? (
                            <>
                              <div className="text-sm font-bold">{shipment.LIBRE_HASTA}</div>
                              <div className={`text-xs font-semibold mt-0.5 ${
                                daysLibre < 0 ? 'text-red-600 dark:text-red-400' :
                                daysLibre <= 3 ? 'text-orange-600 dark:text-orange-400' :
                                'text-green-600 dark:text-green-400'
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
                              hasSalida ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900' : 'bg-muted/30'
                            }`}>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                                <Truck size={14} />
                                <span className="font-medium">Salida Montevideo</span>
                              </div>
                              {hasSalida ? (
                                <div className="text-sm font-bold text-blue-700 dark:text-blue-300">{salidaDate}</div>
                              ) : (
                                <div className="text-sm font-semibold text-orange-600 dark:text-orange-400">A CONFIRMAR</div>
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
                                    <span className="text-green-700 dark:text-green-400 font-medium">Salida: {c.salida}</span>
                                  ) : (
                                    <span className="text-orange-600 dark:text-orange-400 font-medium">Salida: A CONFIRMAR</span>
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
                          <span>ETA: <span className="font-medium text-foreground">{shipment.ETA}</span></span>
                        )}
                      </div>
                    </CardContent>
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
                            <h3 className="text-lg font-bold">{shipment.REF}</h3>
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
                              <span className="ml-2">{shipment.ETD || '-'}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">ETA:</span>
                              <span className="ml-2">{shipment.ETA || '-'}</span>
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
