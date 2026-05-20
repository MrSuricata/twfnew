import { useState } from 'react'
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
  Package,
  Warning,
  Lightning,
  Envelope,
  ArrowsClockwise,
  Truck as TruckIcon,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { authFetch } from '@/lib/authClient'

import TodayDashboard from './TodayDashboard'
import AgendaCalendar from './agenda/AgendaCalendar'
import ShipmentTracking from './ShipmentTracking'
import ExcelImport from './ExcelImport'
import CaseStudiesEditor from './CaseStudiesEditor'
import TestimonialsEditor from './TestimonialsEditor'
import AnalyticsDashboard from './AnalyticsDashboard'
import ClientManager from './ClientManager'
import PartnerManager from './PartnerManager'
import QuotesManagement from './QuotesManagement'
import CommandPalette from './CommandPalette'
import TrucksManagement from './trucks/TrucksManagement'
import { ParsedShipment } from '@/lib/shipmentTypes'
import { ClientAccount, ShipmentDocument, OperativeReport, OriginPhoto, QuoteFormData } from '@/lib/quotationTypes'
import { Truck, TruckLoad, LclAirShipment } from '@/lib/truckTypes'
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
  dbSyncError?: string | null
  onUpdateShipments?: (shipments: ParsedShipment[]) => void
  onUpdateClients?: (clients: ClientAccount[]) => void
  onUpdateDocuments?: (docs: ShipmentDocument[]) => void
  onUpdateReports?: (reports: OperativeReport[]) => void
  onUpdateOriginPhotos?: (photos: OriginPhoto[]) => void
  onUpdateQuotes?: (quotes: QuoteFormData[]) => void
  onUpdateTrucks?: (trucks: Truck[]) => void
  onDeleteTruck?: (id: string) => void
  onUpdateTruckLoads?: (loads: TruckLoad[]) => void
  onDeleteTruckLoad?: (id: string) => void
  onUpdateLclAir?: (shipments: LclAirShipment[]) => void
  onDeleteLclAir?: (id: string) => void
}

const ONE_DAY_MS = 86_400_000

export default function DashboardEnhanced({ onLogout, clients = [], shipments = [], documents = [], reports = [], originPhotos = [], quotes = [], trucks = [], truckLoads = [], lclAir = [], dbSyncError = null, onUpdateShipments, onUpdateClients, onUpdateDocuments, onUpdateReports, onUpdateOriginPhotos, onUpdateQuotes, onUpdateTrucks, onDeleteTruck, onUpdateTruckLoads, onDeleteTruckLoad, onUpdateLclAir, onDeleteLclAir }: DashboardEnhancedProps) {
  const [activeTab, setActiveTab] = useState('hoy')
  const [isRefreshing, setIsRefreshing] = useState(false)

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
      const fresh = data.shipments || []
      if (onUpdateShipments) onUpdateShipments(fresh)
      toast.success(`${fresh.length} cargas sincronizadas`, {
        id: t,
        description: `Última actualización: ${new Date().toLocaleTimeString('es-UY')}`,
      })
    } catch (err: any) {
      toast.error(`Error al sincronizar: ${err?.message || 'sin detalles'}`, { id: t })
    } finally {
      setIsRefreshing(false)
    }
  }

  // Pending-quotes badge — counts quotes that need attention.
  const pendingQuotesCount = quotes.filter(q => q.status === 'pending').length
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
      tracking: 'Tracking',
      clients: 'Clientes',
      partners: 'Partners',
      quotes: 'Cotizaciones',
      trucks: 'Camiones',
    }

    return [{ label: breadcrumbMap[activeTab] || 'Dashboard' }]
  }

  return (
    <div className="min-h-screen bg-background">
      <CommandPalette
        shipments={shipments}
        clients={clients}
        onNavigate={setActiveTab}
        onLogout={onLogout}
      />

      <nav className="bg-primary text-primary-foreground border-b border-border">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src="/images/twf-logo-white.png" alt="TWF" className="h-8 w-auto" />
              <span className="text-xl font-bold">Admin</span>
            </div>
            <div className="flex items-center gap-2">
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
          onHomeClick={activeTab !== 'hoy' ? () => setActiveTab('hoy') : undefined}
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="tabs-list-underline">
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
            <TabsTrigger value="tracking" className="tab-underline">
              <Package size={16} className="mr-1.5" />
              <span className="hidden sm:inline">Cargas</span>
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
            <TabsTrigger value="excel-import" className="tab-underline">
              <Database size={16} className="mr-1.5" />
              <span className="hidden sm:inline">Importar</span>
            </TabsTrigger>
            <TabsTrigger value="case-studies" className="tab-underline">
              <Star size={16} className="mr-1.5" />
              <span className="hidden sm:inline">Casos</span>
            </TabsTrigger>
            <TabsTrigger value="testimonials" className="tab-underline">
              <ChatCircleText size={16} className="mr-1.5" />
              <span className="hidden sm:inline">Testimonios</span>
            </TabsTrigger>
            <TabsTrigger value="clients" className="tab-underline">
              <UsersThree size={16} className="mr-1.5" />
              <span className="hidden sm:inline">Clientes</span>
            </TabsTrigger>
            <TabsTrigger value="partners" className="tab-underline">
              <UsersThree size={16} className="mr-1.5" />
              <span className="hidden sm:inline">Partners</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="hoy">
            <TodayDashboard
              shipments={shipments || []}
              documents={documents}
              reports={reports}
              originPhotos={originPhotos}
              onUpdateShipments={onUpdateShipments}
              onUpdateOriginPhotos={onUpdateOriginPhotos}
            />
          </TabsContent>

          <TabsContent value="agenda">
            <AgendaCalendar shipments={shipments || []} />
          </TabsContent>

          <TabsContent value="analytics">
            <AnalyticsDashboard shipments={shipments || []} />
          </TabsContent>

          <TabsContent value="tracking">
            <ShipmentTracking
              shipmentRecords={shipments}
              reports={reports}
              originPhotos={originPhotos}
              onUpdateReports={(updated) => {
                if (onUpdateReports) onUpdateReports(updated)
              }}
              onUpdateOriginPhotos={(updated) => {
                if (onUpdateOriginPhotos) onUpdateOriginPhotos(updated)
              }}
            />
          </TabsContent>

          <TabsContent value="trucks">
            <TrucksManagement
              trucks={trucks}
              truckLoads={truckLoads}
              lclAir={lclAir}
              shipments={shipments || []}
              onUpdateTrucks={(t) => { if (onUpdateTrucks) onUpdateTrucks(t) }}
              onDeleteTruck={(id) => { if (onDeleteTruck) onDeleteTruck(id) }}
              onUpdateTruckLoads={(l) => { if (onUpdateTruckLoads) onUpdateTruckLoads(l) }}
              onDeleteTruckLoad={(id) => { if (onDeleteTruckLoad) onDeleteTruckLoad(id) }}
              onUpdateLclAir={(s) => { if (onUpdateLclAir) onUpdateLclAir(s) }}
              onDeleteLclAir={(id) => { if (onDeleteLclAir) onDeleteLclAir(id) }}
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
              shipments={shipments}
            />
          </TabsContent>

          <TabsContent value="partners">
            <PartnerManager />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
