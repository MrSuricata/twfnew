import { useState, useMemo, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  SignOut,
  Database,
  Star,
  ChatCircleText,
  ChartBar,
  UsersThree,
  CalendarBlank,
  Warning,
  Lightning,
  ShieldCheck,
  Envelope,
  ArrowsClockwise,
  Truck as TruckIcon,
  Receipt,
  Table as TableIcon,
  ListChecks,
  Globe,
  Bell,
  BellRinging,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { authFetch, getAdminLevel } from '@/lib/authClient'
import { isPushSupported, isSubscribed, subscribePush, unsubscribePush, isIosWithoutStandalone, getPushPrefs, patchPushPrefs, DEFAULT_PUSH_PREFS, type PushPrefs } from '@/lib/push'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { fetchShipmentsFromDB } from '@/lib/dataClient'
import TeamManager from './TeamManager'

import TodayDashboard from './TodayDashboard'
import AgendaCalendar from './agenda/AgendaCalendar'
import { mergeFclShipments } from '@/lib/operationsTypes'
import ExcelImport from './ExcelImport'
import CaseStudiesEditor from './CaseStudiesEditor'
import TestimonialsEditor from './TestimonialsEditor'
import AnalyticsDashboard from './AnalyticsDashboard'
import ClientManager from './ClientManager'
import PartnerManager from './PartnerManager'
import QuotesManagement from './QuotesManagement'
import CommandPalette from './CommandPalette'
import TrucksManagement from './trucks/TrucksManagement'
import BrandLogo from './BrandLogo'
import { useBrand } from '@/lib/brand'
import BillingManagement from './BillingManagement'
import OperationsGrid from './operations/OperationsGrid'
import OperationDetailOverlay from './operations/OperationDetailOverlay'
import ChecksBoard from './checks/ChecksBoard'
import { ParsedShipment } from '@/lib/shipmentTypes'
import { ClientAccount, ShipmentDocument, OperativeReport, OriginPhoto, QuoteFormData } from '@/lib/quotationTypes'
import { Truck, TruckLoad, LclAirShipment } from '@/lib/truckTypes'
import { BillingRecord, buildBillableItems, indexBilling } from '@/lib/billingTypes'
import { Operator, OperatorAssignment, DbShipment, UnifiedOperation } from '@/lib/operationsTypes'
import Breadcrumbs from './Breadcrumbs'

interface DashboardEnhancedProps {
  onLogout: () => void
  /** Carga inicial de datos en curso (el banner "Sincronizando datos..." de App). */
  isDataLoading?: boolean
  clients?: ClientAccount[]
  shipments?: ParsedShipment[]
  documents?: ShipmentDocument[]
  reports?: OperativeReport[]
  originPhotos?: OriginPhoto[]
  quotes?: QuoteFormData[]
  trucks?: Truck[]
  truckLoads?: TruckLoad[]
  lclAir?: LclAirShipment[]
  billing?: BillingRecord[]
  operators?: Operator[]
  assignments?: OperatorAssignment[]
  dbShipments?: DbShipment[]
  dbSyncError?: string | null
  onUpdateShipments?: (shipments: ParsedShipment[]) => void
  onUpdateClients?: (clients: ClientAccount[]) => void
  onUpdateDocuments?: (docs: ShipmentDocument[]) => void
  onUpdateReports?: (reports: OperativeReport[]) => void
  onUpdateOriginPhotos?: (photos: OriginPhoto[]) => void
  onUpdateQuotes?: (quotes: QuoteFormData[]) => void
  onUpdateTrucks?: (trucks: Truck[], changedIds?: string[]) => void
  onDeleteTruck?: (id: string) => void
  onUpdateTruckLoads?: (loads: TruckLoad[], changedIds?: string[]) => void
  onRefreshTrucks?: () => Promise<boolean>
  onDeleteTruckLoad?: (id: string) => void
  onUpdateLclAir?: (shipments: LclAirShipment[]) => void
  onDeleteLclAir?: (id: string) => void
  onUpdateBilling?: (row: BillingRecord) => void
  onClearBilling?: (ref: string) => void
  onUpdateOperators?: (operators: Operator[]) => void
  onDeleteOperator?: (id: string) => void
  onAssignOperator?: (ref: string, operatorId: string | null) => void
  onPatchShipment?: (id: string, fields: Record<string, unknown>) => void
  /** Devuelve false si el alta se abortó (REF duplicada y el usuario canceló). */
  onCreateShipment?: (row: DbShipment) => boolean | void
  onDeleteShipment?: (op: UnifiedOperation) => void
  onPatchFclField?: (dbId: string, edits: Record<string, unknown>) => void
  onRenameRef?: (op: UnifiedOperation, newRef: string, pin: string) => Promise<void>
  /** Refetch completo desde la DB (post-flip las cargas viven ahí, no en Sheets). */
  onReloadFromDB?: () => Promise<void>
}

const ONE_DAY_MS = 86_400_000

// Pestaña "Importar" oculta por pedido de Brian (02/07/2026): post-flip la web
// es master de FCL y el import puntual desde Sheets quedó sin uso diario.
// Para reactivarla: poner en true (el componente ExcelImport sigue intacto).
const SHOW_IMPORT_TAB = false

export default function DashboardEnhanced({ onLogout, isDataLoading = false, clients = [], shipments = [], documents = [], reports = [], originPhotos = [], quotes = [], trucks = [], truckLoads = [], lclAir = [], billing = [], operators = [], assignments = [], dbShipments = [], dbSyncError = null, onUpdateShipments, onUpdateClients, onUpdateDocuments, onUpdateReports, onUpdateOriginPhotos, onUpdateQuotes, onUpdateTrucks, onDeleteTruck, onUpdateTruckLoads, onDeleteTruckLoad, onUpdateLclAir, onDeleteLclAir, onUpdateBilling, onClearBilling, onUpdateOperators, onDeleteOperator, onAssignOperator, onPatchShipment, onCreateShipment, onDeleteShipment, onPatchFclField, onRenameRef, onRefreshTrucks, onReloadFromDB }: DashboardEnhancedProps) {
  const brand = useBrand()
  const ops = brand.capabilities.opsAdmin
  // Flip Etapa 4: post-flip las FCL viven en dbShipments. Reconstruirlas a
  // ParsedShipment para los consumidores que aún esperan ese modelo (HOY, Agenda,
  // búsqueda, clientes). Pre-flip dbShipments no tiene FCL → queda igual a shipments.
  const fclShipments = useMemo(
    () => mergeFclShipments(shipments || [], dbShipments),
    [shipments, dbShipments],
  )
  // TWF brand has no ops tabs → land on the first content tab.
  const [activeTab, setActiveTab] = useState(ops ? 'hoy' : 'contenido')
  // Sub-pestaña de "Contenido web" (Casos de éxito / Testimonios). Vive acá para
  // que la CommandPalette pueda abrir directo la sub-pestaña correcta.
  const [contenidoTab, setContenidoTab] = useState<'casos' | 'testimonios'>('casos')
  // Navegación por value (CommandPalette): los values viejos 'case-studies' y
  // 'testimonials' ahora son sub-pestañas de "Contenido web" → mapearlos.
  const navigateTab = useCallback((v: string) => {
    if (v === 'case-studies' || v === 'testimonials') {
      setContenidoTab(v === 'testimonials' ? 'testimonios' : 'casos')
      setActiveTab('contenido')
      return
    }
    // Values que ya no tienen pestaña propia: 'tracking' (vieja "Cargas") va a
    // Operaciones; 'excel-import' quedó oculta (SHOW_IMPORT_TAB) → HOY.
    if (v === 'tracking') { setActiveTab('operaciones'); return }
    if (v === 'excel-import' && !SHOW_IMPORT_TAB) { setActiveTab('hoy'); return }
    setActiveTab(v)
  }, [])
  // Pestaña Equipo: solo el owner (Brian) — el backend re-valida igual.
  const isOwner = getAdminLevel() === 'owner'
  const [isRefreshing, setIsRefreshing] = useState(false)
  // Tick que sube con cada Refrescar global → recarga la Actividad del Equipo.
  const [refreshTick, setRefreshTick] = useState(0)

  // Selección del panel de detalle DENTRO de la grilla de Operaciones (controlada).
  const [detailUid, setDetailUid] = useState<string | null>(null)
  // "Más datos →" desde Agenda/HOY: abre el panel completo como OVERLAY sobre la
  // pestaña actual (sin navegar a Operaciones). La clave es el dbId del shipment
  // (shipment.__dbId) que resuelve la op exacta post-flip; el overlay también
  // acepta uid o ref FCL como fallback.
  const [overlayDetailKey, setOverlayDetailKey] = useState<string | null>(null)
  const onOpenDetail = useCallback((key: string) => {
    // Deseleccionar la grilla al abrir el overlay → los dos paneles (grilla y
    // overlay) son mutuamente excluyentes, nunca se apilan dos Sheets.
    setDetailUid(null)
    setOverlayDetailKey(key)
  }, [])

  // Manual refresh from the navbar — pulls fresh data from Google Sheets via
  // /api/sheets/sync (drops it into shipments_cache and updates local state).
  // Post-flip el sync devuelve { shipments: [], flipped: true } (la web es master
  // de FCL): en ese caso refetcheamos TODO desde la DB — es la única forma de
  // traer las ediciones de los colegas sin F5.
  const handleRefresh = async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    const t = toast.loading('Actualizando datos…')
    try {
      const res = await authFetch('/api/sheets/sync')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      if (data.flipped && onReloadFromDB) {
        await onReloadFromDB()
        // loadDataFromDB ya muestra su propio toast de éxito (o banner de error):
        // solo cerramos el loading para no duplicar mensajes.
        toast.dismiss(t)
        return
      }
      let fresh = data.shipments || []
      // Etapa 3: el sync devuelve la planilla CRUDA (sin __dbId ni ediciones
      // web). Re-leemos del espejo recién actualizado para no perder las
      // ediciones ✏️ ni la editabilidad; si falla, usamos la cruda como antes.
      try {
        const mirror = await fetchShipmentsFromDB()
        if (mirror.shipments.length > 0) fresh = mirror.shipments
      } catch { /* fallback a la cruda */ }
      if (onUpdateShipments) onUpdateShipments(fresh)
      toast.success(`${fresh.length} cargas sincronizadas`, {
        id: t,
        description: `Última actualización: ${new Date().toLocaleTimeString('es-UY')}`,
      })
    } catch (err: any) {
      toast.error(`Error al sincronizar: ${err?.message || 'sin detalles'}`, { id: t })
    } finally {
      setIsRefreshing(false)
      setRefreshTick(t => t + 1)
    }
  }

  // Pending-quotes badge — counts quotes that need attention.
  const pendingQuotesCount = quotes.filter(q => q.status === 'pending').length

  // Pending-billing badge — MISMO derivador universal que la pestaña
  // (buildBillableItems: FCL planilla + FCL horneada + LCL/aéreo/terrestre,
  // camión incluido). Antes contaba solo la FCL del cache de la planilla →
  // post-flip (cache vacío) el badge quedaba en 0 con pendientes reales.
  const pendingBillingCount = useMemo(() => {
    const billingMap = indexBilling(billing)
    return buildBillableItems(shipments || [], dbShipments, trucks, truckLoads, billingMap)
      .filter(x => x.state === 'pendiente').length
  }, [shipments, dbShipments, trucks, truckLoads, billing])
  const overdueQuotesCount = quotes.filter(
    q => q.status === 'pending' && Date.now() - q.timestamp > ONE_DAY_MS
  ).length

  const getBreadcrumbs = () => {
    const breadcrumbMap: Record<string, string> = {
      hoy: 'Hoy',
      agenda: 'Agenda',
      analytics: 'Analíticas',
      shipments: 'Cargas',
      'excel-import': 'Importar datos',
      contenido: 'Contenido web',
      clients: 'Clientes',
      partners: 'Partners',
      quotes: 'Cotizaciones',
      trucks: 'Camiones',
      billing: 'Facturación',
      operaciones: 'Operaciones',
      checks: 'Checks',
      equipo: 'Equipo',
    }

    return [{ label: breadcrumbMap[activeTab] || 'Dashboard' }]
  }

  return (
    <div className="min-h-screen bg-background">
      <CommandPalette
        shipments={fclShipments}
        clients={clients}
        onNavigate={navigateTab}
        onLogout={onLogout}
      />

      <nav className="bg-primary text-primary-foreground border-b border-border">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3 min-w-0">
              <BrandLogo variant="nav" className="h-8 w-auto" />
              <span className="text-sm font-medium opacity-60 border-l border-primary-foreground/20 pl-3">Admin</span>
            </div>
            <div className="flex items-center gap-2">
              {ops && <PushBell />}
              {ops && (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground/85 hover:text-primary-foreground transition-colors border border-primary-foreground/10 disabled:opacity-60 disabled:cursor-wait"
                title="Sincronizar con Google Sheets ahora"
              >
                <ArrowsClockwise
                  size={16}
                  weight="bold"
                  className={isRefreshing ? 'animate-spin' : ''}
                />
                <span className="hidden sm:inline">{isRefreshing ? 'Sincronizando…' : 'Refrescar'}</span>
              </button>
              )}
              <button
                type="button"
                onClick={() => {
                  // Dispatch a synthetic Ctrl+K so CommandPalette opens
                  const ev = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })
                  document.dispatchEvent(ev)
                }}
                className="hidden md:inline-flex items-center gap-2 px-3 h-9 rounded-md text-sm bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground/80 hover:text-primary-foreground transition-colors border border-primary-foreground/10"
                title="Abrir paleta de comandos (Ctrl+K)"
              >
                <span className="opacity-70">Buscar…</span>
                <kbd className="ml-1 px-1.5 py-0.5 text-[10px] font-mono rounded bg-primary-foreground/20 border border-primary-foreground/10">Ctrl K</kbd>
              </button>
              <Button variant="ghost" onClick={onLogout} className="text-primary-foreground hover:bg-primary-foreground/10">
                <SignOut size={20} className="mr-2" />
                <span className="hidden sm:inline">Cerrar sesión</span>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {dbSyncError && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-sm text-yellow-900 flex items-center gap-2">
          <Warning size={16} weight="fill" />
          <span>Trabajando con datos locales — {dbSyncError}. Los cambios se sincronizarán cuando vuelva la conexión.</span>
          <button onClick={() => window.location.reload()} className="ml-auto underline hover:no-underline">
            Reintentar
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        <Breadcrumbs
          items={getBreadcrumbs()}
          onHomeClick={activeTab !== (ops ? 'hoy' : 'contenido') ? () => setActiveTab(ops ? 'hoy' : 'contenido') : undefined}
        />

        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            // Cambiar de pestaña cierra el overlay de "Más datos" (es una acción
            // contextual de Agenda/HOY) → nunca convive con el panel de la grilla.
            setOverlayDetailKey(null)
            setActiveTab(v)
          }}
          className="space-y-6"
        >
          <TabsList className="tabs-list-underline">
            {ops && (<>
            <TabsTrigger value="hoy" className="tab-underline" aria-label="Hoy">
              <Lightning size={16} className="mr-1.5" weight="fill" />
              <span className="hidden sm:inline">Hoy</span>
            </TabsTrigger>
            <TabsTrigger value="agenda" className="tab-underline" aria-label="Agenda">
              <CalendarBlank size={16} className="mr-1.5" />
              <span className="hidden sm:inline">Agenda</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="tab-underline" aria-label="Analíticas">
              <ChartBar size={16} className="mr-1.5" />
              <span className="hidden sm:inline">Analíticas</span>
            </TabsTrigger>
            <TabsTrigger value="operaciones" className="tab-underline" aria-label="Operaciones">
              <TableIcon size={16} className="mr-1.5" weight="fill" />
              <span className="hidden sm:inline">Operaciones</span>
            </TabsTrigger>
            <TabsTrigger value="checks" className="tab-underline" aria-label="Checks">
              <ListChecks size={16} className="mr-1.5" weight="fill" />
              <span className="hidden sm:inline">Checks</span>
            </TabsTrigger>
            <TabsTrigger value="trucks" className="tab-underline" aria-label="Camiones">
              <TruckIcon size={16} className="mr-1.5" weight="fill" />
              <span className="hidden sm:inline">Camiones</span>
              {trucks.filter(t => t.status === 'planning' || t.status === 'loaded').length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full text-white shrink-0 bg-primary">
                  {trucks.filter(t => t.status === 'planning' || t.status === 'loaded').length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="quotes" className="tab-underline" aria-label="Cotizaciones">
              <Envelope size={16} className="mr-1.5" />
              <span className="hidden sm:inline">Cotizaciones</span>
              {pendingQuotesCount > 0 && (
                <span className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full text-white shrink-0 ${
                  overdueQuotesCount > 0 ? 'bg-destructive' : 'bg-orange-500'
                }`}>
                  {pendingQuotesCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="billing" className="tab-underline" aria-label="Facturación">
              <Receipt size={16} className="mr-1.5" weight="fill" />
              <span className="hidden sm:inline">Facturación</span>
              {pendingBillingCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full text-white shrink-0 bg-amber-500">
                  {pendingBillingCount}
                </span>
              )}
            </TabsTrigger>
            {SHOW_IMPORT_TAB && (
            <TabsTrigger value="excel-import" className="tab-underline" aria-label="Importar datos">
              <Database size={16} className="mr-1.5" />
              <span className="hidden sm:inline">Importar</span>
            </TabsTrigger>
            )}
            </>)}
            {/* Contenido de la landing pública (casos + testimonios) en una sola
                pestaña con sub-selector. Partners queda al final, junto a Equipo:
                son usuarios, no contenido. */}
            <TabsTrigger value="contenido" className="tab-underline" aria-label="Contenido web">
              <Globe size={16} className="mr-1.5" />
              <span className="hidden sm:inline">Contenido web</span>
            </TabsTrigger>
            {ops && (<>
            <TabsTrigger value="clients" className="tab-underline" aria-label="Clientes">
              <UsersThree size={16} className="mr-1.5" />
              <span className="hidden sm:inline">Clientes</span>
            </TabsTrigger>
            <TabsTrigger value="partners" className="tab-underline" aria-label="Partners">
              <UsersThree size={16} className="mr-1.5" />
              <span className="hidden sm:inline">Partners</span>
            </TabsTrigger>
            {isOwner && (
              <TabsTrigger value="equipo" className="tab-underline" aria-label="Equipo">
                <ShieldCheck size={16} className="mr-1.5" weight="fill" />
                <span className="hidden sm:inline">Equipo</span>
              </TabsTrigger>
            )}
            </>)}
          </TabsList>

          <TabsContent value="hoy">
            <TodayDashboard
              shipments={fclShipments}
              isDataLoading={isDataLoading}
              trucks={trucks}
              truckLoads={truckLoads}
              documents={documents}
              reports={reports}
              originPhotos={originPhotos}
              onUpdateShipments={onUpdateShipments}
              onUpdateOriginPhotos={onUpdateOriginPhotos}
              onPatchShipment={onPatchShipment}
              onOpenDetail={onOpenDetail}
            />
          </TabsContent>

          <TabsContent value="agenda">
            <AgendaCalendar
              shipments={fclShipments}
              trucks={trucks}
              truckLoads={truckLoads}
              editable
              onPatchShipment={onPatchShipment}
              onOpenDetail={onOpenDetail}
            />
          </TabsContent>

          <TabsContent value="analytics">
            <AnalyticsDashboard
              shipments={shipments || []}
              dbShipments={dbShipments}
              trucks={trucks}
              truckLoads={truckLoads}
            />
          </TabsContent>

          <TabsContent value="trucks">
            <TrucksManagement
              trucks={trucks}
              truckLoads={truckLoads}
              lclAir={lclAir}
              dbShipments={dbShipments}
              shipments={fclShipments}
              operators={operators}
              onUpdateTrucks={(t, ids) => { if (onUpdateTrucks) onUpdateTrucks(t, ids) }}
              onDeleteTruck={(id) => { if (onDeleteTruck) onDeleteTruck(id) }}
              onUpdateTruckLoads={(l, ids) => { if (onUpdateTruckLoads) onUpdateTruckLoads(l, ids) }}
              onDeleteTruckLoad={(id) => { if (onDeleteTruckLoad) onDeleteTruckLoad(id) }}
              onUpdateLclAir={(s) => { if (onUpdateLclAir) onUpdateLclAir(s) }}
              onDeleteLclAir={(id) => { if (onDeleteLclAir) onDeleteLclAir(id) }}
              onRefreshTrucks={onRefreshTrucks}
              onCreateShipment={onCreateShipment}
            />
          </TabsContent>

          <TabsContent value="quotes">
            <QuotesManagement
              quotes={quotes}
              onUpdateQuotes={(updated) => {
                if (onUpdateQuotes) onUpdateQuotes(updated)
              }}
            />
          </TabsContent>

          <TabsContent value="billing">
            <BillingManagement
              shipments={shipments || []}
              dbShipments={dbShipments}
              trucks={trucks}
              truckLoads={truckLoads}
              billing={billing}
              onUpdateBilling={onUpdateBilling}
              onClearBilling={onClearBilling}
            />
          </TabsContent>

          <TabsContent value="operaciones">
            <OperationsGrid
              shipments={shipments || []}
              dbShipments={dbShipments}
              trucks={trucks}
              truckLoads={truckLoads}
              operators={operators}
              assignments={assignments}
              originPhotos={originPhotos}
              reports={reports}
              onUpdateOriginPhotos={onUpdateOriginPhotos}
              onUpdateReports={onUpdateReports}
              onAssignOperator={(ref, opId) => { if (onAssignOperator) onAssignOperator(ref, opId) }}
              onPatchShipment={(id, fields) => { if (onPatchShipment) onPatchShipment(id, fields) }}
              onCreateShipment={(row) => onCreateShipment?.(row)}
              onDeleteShipment={(op) => { if (onDeleteShipment) onDeleteShipment(op) }}
              onPatchFclField={(dbId, edits) => { if (onPatchFclField) onPatchFclField(dbId, edits) }}
              onRenameRef={onRenameRef}
              onUpdateOperators={(o) => { if (onUpdateOperators) onUpdateOperators(o) }}
              onDeleteOperator={(id) => { if (onDeleteOperator) onDeleteOperator(id) }}
              selectedUid={detailUid}
              onSelectedUidChange={setDetailUid}
            />
          </TabsContent>

          <TabsContent value="checks">
            {/* Universo derivado de las MISMAS fuentes que Operaciones
                (cache legacy + dbShipments); el estado de los pasos lo
                fetchea la propia pestaña (ref_checks). onPatchShipment
                habilita el toggle de telex por fila (mismo camino que el
                panel de detalle). */}
            <ChecksBoard
              shipments={shipments || []}
              dbShipments={dbShipments}
              onPatchShipment={onPatchShipment}
            />
          </TabsContent>

          {SHOW_IMPORT_TAB && (
          <TabsContent value="excel-import">
            <ExcelImport
              shipmentRecords={shipments}
              onImportComplete={(records) => {
                if (onUpdateShipments) onUpdateShipments(records)
              }}
              onRecordsUpdate={(records) => {
                if (onUpdateShipments) onUpdateShipments(records)
              }}
            />
          </TabsContent>
          )}

          <TabsContent value="contenido">
            {/* Sub-selector Casos/Testimonios: Tabs anidadas con el estilo pill por
                defecto (mismo patrón que Camiones · LCL/Aéreos en TrucksManagement). */}
            <Tabs value={contenidoTab} onValueChange={v => setContenidoTab(v as 'casos' | 'testimonios')} className="space-y-4">
              <TabsList>
                <TabsTrigger value="casos" className="gap-1.5">
                  <Star size={16} />
                  Casos de éxito
                </TabsTrigger>
                <TabsTrigger value="testimonios" className="gap-1.5">
                  <ChatCircleText size={16} />
                  Testimonios
                </TabsTrigger>
              </TabsList>
              <TabsContent value="casos">
                <CaseStudiesEditor />
              </TabsContent>
              <TabsContent value="testimonios">
                <TestimonialsEditor />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="clients">
            <ClientManager
              clients={clients}
              onUpdateClients={(updated) => onUpdateClients?.(updated)}
              shipments={fclShipments}
            />
          </TabsContent>

          <TabsContent value="partners">
            <PartnerManager />
          </TabsContent>

          {isOwner && (
            <TabsContent value="equipo">
              <TeamManager refreshKey={refreshTick} />
            </TabsContent>
          )}
        </Tabs>

        {/* Panel de detalle COMPLETO como overlay (drawer lateral) — lo abre
            "Más datos →" del quick-edit de Agenda/HOY, sin navegar a Operaciones. */}
        <OperationDetailOverlay
          detailKey={overlayDetailKey}
          shipments={shipments || []}
          dbShipments={dbShipments || []}
          trucks={trucks || []}
          truckLoads={truckLoads || []}
          operators={operators || []}
          assignments={assignments || []}
          originPhotos={originPhotos}
          reports={reports}
          onUpdateOriginPhotos={onUpdateOriginPhotos}
          onUpdateReports={onUpdateReports}
          onPatch={(id, fields) => { if (onPatchShipment) onPatchShipment(id, fields) }}
          onPatchFcl={(id, edits) => { if (onPatchFclField) onPatchFclField(id, edits) }}
          onAssignOperator={(ref, opId) => { if (onAssignOperator) onAssignOperator(ref, opId) }}
          onRenameRef={onRenameRef}
          onClose={() => setOverlayDetailKey(null)}
        />
      </div>
    </div>
  )
}

// ─── Campana de avisos push (popover con preferencias por dispositivo) ──────
// Cada dispositivo elige QUÉ alertas recibe (switches → PATCH a la entity
// push-subscriptions). Los horarios son los de los 2 crons de vercel.json:
// mañana 07:00 UY (libres + fiscal) · tarde 16:00 UY (frontera + salidas,
// la de 17:00 sale junta por el límite de 2 crons del plan Hobby).

const PUSH_ALERT_OPTIONS: Array<{ key: keyof PushPrefs; label: string; hora: string; desc: string }> = [
  { key: 'alert_libre', label: 'Días libres', hora: '07:00', desc: 'LIBRE vence hoy o en los próximos 3 días' },
  { key: 'alert_fiscal', label: 'Llegan a fiscal', hora: '07:00', desc: 'Contenedores con arribo fiscal hoy' },
  { key: 'alert_frontera', label: 'En frontera', hora: '16:00', desc: 'Salieron hace 1–2 días, sin llegar a fiscal' },
  { key: 'alert_salidas', label: 'Salen hoy', hora: '17:00', desc: 'Operativas con salida hoy' },
]

function PushBell() {
  const [open, setOpen] = useState(false)
  // null = todavía no sabemos / no soportado (campana oculta) · true/false = estado real.
  const [pushOn, setPushOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  // Preferencias de ESTE dispositivo — null hasta que carguen (switches deshabilitados).
  const [prefs, setPrefs] = useState<PushPrefs | null>(null)

  useEffect(() => {
    if (!isPushSupported()) return // campana oculta
    isSubscribed().then(setPushOn).catch(() => setPushOn(false))
  }, [])

  // Cargar las preferencias al abrir el popover. Si el navegador está suscripto
  // pero el server no tiene la fila (se limpió como suscripción muerta), re-alta
  // silenciosa con los defaults — se autorepara sin molestar.
  useEffect(() => {
    if (!open || !pushOn || prefs) return
    let alive = true
    getPushPrefs()
      .then(async p => {
        if (!alive) return
        if (p) { setPrefs(p); return }
        await subscribePush()
        if (alive) setPrefs({ ...DEFAULT_PUSH_PREFS })
      })
      .catch(() => { /* los switches quedan deshabilitados */ })
    return () => { alive = false }
  }, [open, pushOn, prefs])

  if (pushOn === null) return null

  const handleToggleAll = async () => {
    if (busy) return
    // iPhone/iPad sin la PWA instalada: iOS solo entrega push a la app de inicio.
    if (!pushOn && isIosWithoutStandalone()) {
      toast.info('Instalá la app primero', {
        description: 'En iPhone los avisos solo funcionan con la app instalada: Compartir → Agregar a inicio, y activalos desde ahí.',
        duration: 8000,
      })
      return
    }
    setBusy(true)
    try {
      if (pushOn) {
        await unsubscribePush()
        setPushOn(false)
        setPrefs(null)
        toast.success('Avisos desactivados en este dispositivo')
      } else {
        await subscribePush()
        setPushOn(true)
        // El alta conserva las alert_* si la fila ya existía (upsert no las toca)
        // → leer las preferencias reales en vez de asumir los defaults.
        const p = await getPushPrefs().catch(() => null)
        setPrefs(p ?? { ...DEFAULT_PUSH_PREFS })
        toast.success('Avisos activados', {
          description: 'Elegí con los switches qué alertas querés recibir en este dispositivo.',
        })
      }
    } catch (err) {
      toast.error((err as Error)?.message || 'No se pudo cambiar el estado de los avisos')
    } finally {
      setBusy(false)
    }
  }

  const handleTogglePref = async (key: keyof PushPrefs) => {
    if (!prefs || busy) return
    const prev = prefs
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next) // optimista
    try {
      const saved = await patchPushPrefs({ [key]: next[key] })
      setPrefs(saved)
    } catch (err) {
      setPrefs(prev) // revert
      toast.error((err as Error)?.message || 'No se pudo guardar la preferencia')
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm transition-colors border ${
            pushOn
              ? 'bg-primary-foreground/20 border-primary-foreground/25 text-primary-foreground'
              : 'bg-primary-foreground/10 hover:bg-primary-foreground/20 border-primary-foreground/10 text-primary-foreground/85 hover:text-primary-foreground'
          }`}
          title={pushOn ? 'Avisos activos en este dispositivo — click para configurar' : 'Activar avisos del día en este dispositivo'}
        >
          {pushOn
            ? <BellRinging size={16} weight="fill" />
            : <Bell size={16} weight="bold" />}
          <span className="hidden lg:inline">{pushOn ? 'Avisos activos' : 'Activar avisos'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold">Avisos en este dispositivo</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {pushOn
              ? 'Elegí qué alertas recibir — el horario es cuando llega cada una.'
              : 'Activalos para elegir qué alertas recibir.'}
          </p>
        </div>
        <div className="px-4 py-1.5">
          {PUSH_ALERT_OPTIONS.map(opt => (
            <div key={opt.key} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm leading-tight">
                  {opt.label} <span className="text-muted-foreground">· {opt.hora}</span>
                </p>
                <p className="text-xs text-muted-foreground leading-tight mt-0.5">{opt.desc}</p>
              </div>
              <Switch
                checked={!!pushOn && (prefs ? prefs[opt.key] : true)}
                disabled={!pushOn || !prefs || busy}
                onCheckedChange={() => handleTogglePref(opt.key)}
                aria-label={`${opt.label} a las ${opt.hora}`}
              />
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-border">
          <Button
            variant={pushOn ? 'outline' : 'default'}
            size="sm"
            className="w-full"
            disabled={busy}
            onClick={handleToggleAll}
          >
            {busy ? 'Un momento…' : pushOn ? 'Desactivar todos los avisos' : 'Activar avisos en este dispositivo'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
