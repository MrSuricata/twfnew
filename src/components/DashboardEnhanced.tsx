import { useState, useMemo, useCallback } from 'react'
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
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { authFetch, getAdminLevel } from '@/lib/authClient'
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
import { ParsedShipment } from '@/lib/shipmentTypes'
import { ClientAccount, ShipmentDocument, OperativeReport, OriginPhoto, QuoteFormData } from '@/lib/quotationTypes'
import { Truck, TruckLoad, LclAirShipment } from '@/lib/truckTypes'
import { BillingRecord, getBillingState, indexBilling } from '@/lib/billingTypes'
import { Operator, OperatorAssignment, DbShipment, UnifiedOperation } from '@/lib/operationsTypes'
import Breadcrumbs from './Breadcrumbs'

interface DashboardEnhancedProps {
  onLogout: () => void
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
  onCreateShipment?: (row: DbShipment) => void
  onDeleteShipment?: (op: UnifiedOperation) => void
  onPatchFclField?: (dbId: string, edits: Record<string, unknown>) => void
  onRenameRef?: (op: UnifiedOperation, newRef: string, pin: string) => Promise<void>
}

const ONE_DAY_MS = 86_400_000

export default function DashboardEnhanced({ onLogout, clients = [], shipments = [], documents = [], reports = [], originPhotos = [], quotes = [], trucks = [], truckLoads = [], lclAir = [], billing = [], operators = [], assignments = [], dbShipments = [], dbSyncError = null, onUpdateShipments, onUpdateClients, onUpdateDocuments, onUpdateReports, onUpdateOriginPhotos, onUpdateQuotes, onUpdateTrucks, onDeleteTruck, onUpdateTruckLoads, onDeleteTruckLoad, onUpdateLclAir, onDeleteLclAir, onUpdateBilling, onClearBilling, onUpdateOperators, onDeleteOperator, onAssignOperator, onPatchShipment, onCreateShipment, onDeleteShipment, onPatchFclField, onRenameRef, onRefreshTrucks }: DashboardEnhancedProps) {
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
  const [activeTab, setActiveTab] = useState(ops ? 'hoy' : 'case-studies')
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
  const handleRefresh = async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    const t = toast.loading('Sincronizando con Google Sheets…')
    try {
      const res = await authFetch('/api/sheets/sync')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
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

  // Pending-billing badge — refs that reached fiscal and aren't facturada/no_aplica.
  const billingMap = indexBilling(billing)
  const pendingBillingCount = (shipments || []).filter(
    s => getBillingState(s, billingMap) === 'pendiente'
  ).length
  const overdueQuotesCount = quotes.filter(
    q => q.status === 'pending' && Date.now() - q.timestamp > ONE_DAY_MS
  ).length

  const getBreadcrumbs = () => {
    const breadcrumbMap: Record<string, string> = {
      hoy: 'Hoy',
      agenda: 'Agenda',
      analytics: 'Estadísticas',
      shipments: 'Cargas',
      'excel-import': 'Importar Datos',
      'case-studies': 'Casos de Éxito',
      testimonials: 'Testimonios',
      clients: 'Clientes',
      partners: 'Partners',
      quotes: 'Cotizaciones',
      trucks: 'Camiones',
      billing: 'Facturación',
      operaciones: 'Operaciones',
    }

    return [{ label: breadcrumbMap[activeTab] || 'Dashboard' }]
  }

  return (
    <div className="min-h-screen bg-background">
      <CommandPalette
        shipments={fclShipments}
        clients={clients}
        onNavigate={setActiveTab}
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
                <span className="hidden sm:inline">Cerrar Sesión</span>
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
          onHomeClick={activeTab !== (ops ? 'hoy' : 'case-studies') ? () => setActiveTab(ops ? 'hoy' : 'case-studies') : undefined}
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
            <TabsTrigger value="hoy" className="tab-underline">
              <Lightning size={16} className="mr-1.5" weight="fill" />
              <span className="hidden sm:inline">Hoy</span>
            </TabsTrigger>
            <TabsTrigger value="agenda" className="tab-underline">
              <CalendarBlank size={16} className="mr-1.5" />
              <span className="hidden sm:inline">Agenda</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="tab-underline">
              <ChartBar size={16} className="mr-1.5" />
              <span className="hidden sm:inline">Analíticas</span>
            </TabsTrigger>
            <TabsTrigger value="operaciones" className="tab-underline">
              <TableIcon size={16} className="mr-1.5" weight="fill" />
              <span className="hidden sm:inline">Operaciones</span>
            </TabsTrigger>
            <TabsTrigger value="trucks" className="tab-underline">
              <TruckIcon size={16} className="mr-1.5" weight="fill" />
              <span className="hidden sm:inline">Camiones</span>
              {trucks.filter(t => t.status === 'planning' || t.status === 'loaded').length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full text-white shrink-0 bg-primary">
                  {trucks.filter(t => t.status === 'planning' || t.status === 'loaded').length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="quotes" className="tab-underline">
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
            <TabsTrigger value="billing" className="tab-underline">
              <Receipt size={16} className="mr-1.5" weight="fill" />
              <span className="hidden sm:inline">Facturación</span>
              {pendingBillingCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full text-white shrink-0 bg-amber-500">
                  {pendingBillingCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="excel-import" className="tab-underline">
              <Database size={16} className="mr-1.5" />
              <span className="hidden sm:inline">Importar</span>
            </TabsTrigger>
            </>)}
            <TabsTrigger value="case-studies" className="tab-underline">
              <Star size={16} className="mr-1.5" />
              <span className="hidden sm:inline">Casos</span>
            </TabsTrigger>
            <TabsTrigger value="testimonials" className="tab-underline">
              <ChatCircleText size={16} className="mr-1.5" />
              <span className="hidden sm:inline">Testimonios</span>
            </TabsTrigger>
            {ops && (<>
            <TabsTrigger value="clients" className="tab-underline">
              <UsersThree size={16} className="mr-1.5" />
              <span className="hidden sm:inline">Clientes</span>
            </TabsTrigger>
            <TabsTrigger value="partners" className="tab-underline">
              <UsersThree size={16} className="mr-1.5" />
              <span className="hidden sm:inline">Partners</span>
            </TabsTrigger>
            {isOwner && (
              <TabsTrigger value="equipo" className="tab-underline">
                <ShieldCheck size={16} className="mr-1.5" weight="fill" />
                <span className="hidden sm:inline">Equipo</span>
              </TabsTrigger>
            )}
            </>)}
          </TabsList>

          <TabsContent value="hoy">
            <TodayDashboard
              shipments={fclShipments}
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
              onUpdateTrucks={(t, ids) => { if (onUpdateTrucks) onUpdateTrucks(t, ids) }}
              onDeleteTruck={(id) => { if (onDeleteTruck) onDeleteTruck(id) }}
              onUpdateTruckLoads={(l, ids) => { if (onUpdateTruckLoads) onUpdateTruckLoads(l, ids) }}
              onDeleteTruckLoad={(id) => { if (onDeleteTruckLoad) onDeleteTruckLoad(id) }}
              onUpdateLclAir={(s) => { if (onUpdateLclAir) onUpdateLclAir(s) }}
              onDeleteLclAir={(id) => { if (onDeleteLclAir) onDeleteLclAir(id) }}
              onRefreshTrucks={onRefreshTrucks}
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
              onAssignOperator={(ref, opId) => { if (onAssignOperator) onAssignOperator(ref, opId) }}
              onPatchShipment={(id, fields) => { if (onPatchShipment) onPatchShipment(id, fields) }}
              onCreateShipment={(row) => { if (onCreateShipment) onCreateShipment(row) }}
              onDeleteShipment={(op) => { if (onDeleteShipment) onDeleteShipment(op) }}
              onPatchFclField={(dbId, edits) => { if (onPatchFclField) onPatchFclField(dbId, edits) }}
              onRenameRef={onRenameRef}
              onUpdateOperators={(o) => { if (onUpdateOperators) onUpdateOperators(o) }}
              onDeleteOperator={(id) => { if (onDeleteOperator) onDeleteOperator(id) }}
              selectedUid={detailUid}
              onSelectedUidChange={setDetailUid}
            />
          </TabsContent>

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

          <TabsContent value="case-studies">
            <CaseStudiesEditor />
          </TabsContent>

          <TabsContent value="testimonials">
            <TestimonialsEditor />
          </TabsContent>

          <TabsContent value="clients">
            <ClientManager
              clients={clients}
              onUpdateClients={(updated) => {
                if (onUpdateClients) onUpdateClients(updated)
              }}
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
