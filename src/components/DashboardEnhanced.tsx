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
} from '@phosphor-icons/react'

import TodayDashboard from './TodayDashboard'
import AgendaCalendar from './agenda/AgendaCalendar'
import ShipmentTracking from './ShipmentTracking'
import ExcelImport from './ExcelImport'
import CaseStudiesEditor from './CaseStudiesEditor'
import TestimonialsEditor from './TestimonialsEditor'
import AnalyticsDashboard from './AnalyticsDashboard'
import ClientManager from './ClientManager'
import PartnerManager from './PartnerManager'
import CommandPalette from './CommandPalette'
import { ParsedShipment } from '@/lib/shipmentTypes'
import { ClientAccount, ShipmentDocument, OperativeReport, OriginPhoto } from '@/lib/quotationTypes'
import Breadcrumbs from './Breadcrumbs'

interface DashboardEnhancedProps {
  onLogout: () => void
  clients?: ClientAccount[]
  shipments?: ParsedShipment[]
  documents?: ShipmentDocument[]
  reports?: OperativeReport[]
  originPhotos?: OriginPhoto[]
  dbSyncError?: string | null
  onUpdateShipments?: (shipments: ParsedShipment[]) => void
  onUpdateClients?: (clients: ClientAccount[]) => void
  onUpdateDocuments?: (docs: ShipmentDocument[]) => void
  onUpdateReports?: (reports: OperativeReport[]) => void
  onUpdateOriginPhotos?: (photos: OriginPhoto[]) => void
}

export default function DashboardEnhanced({ onLogout, clients = [], shipments = [], documents = [], reports = [], originPhotos = [], dbSyncError = null, onUpdateShipments, onUpdateClients, onUpdateDocuments, onUpdateReports, onUpdateOriginPhotos }: DashboardEnhancedProps) {
  const [activeTab, setActiveTab] = useState('hoy')

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
      partners: 'Partners'
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
                Cerrar Sesión
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
          <TabsList className="grid w-full grid-cols-3 lg:grid-cols-9 max-w-5xl">
            <TabsTrigger value="hoy">
              <Lightning size={20} className="mr-2" weight="fill" />
              <span className="hidden sm:inline">Hoy</span>
            </TabsTrigger>
            <TabsTrigger value="agenda">
              <CalendarBlank size={20} className="mr-2" />
              <span className="hidden sm:inline">Agenda</span>
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <ChartBar size={20} className="mr-2" />
              <span className="hidden sm:inline">Analíticas</span>
            </TabsTrigger>
            <TabsTrigger value="tracking">
              <Package size={20} className="mr-2" />
              <span className="hidden sm:inline">Cargas</span>
            </TabsTrigger>
            <TabsTrigger value="excel-import">
              <Database size={20} className="mr-2" />
              <span className="hidden sm:inline">Importar</span>
            </TabsTrigger>
            <TabsTrigger value="case-studies">
              <Star size={20} className="mr-2" />
              <span className="hidden sm:inline">Casos</span>
            </TabsTrigger>
            <TabsTrigger value="testimonials">
              <ChatCircleText size={20} className="mr-2" />
              <span className="hidden sm:inline">Testimonios</span>
            </TabsTrigger>
            <TabsTrigger value="clients">
              <UsersThree size={20} className="mr-2" />
              <span className="hidden sm:inline">Clientes</span>
            </TabsTrigger>
            <TabsTrigger value="partners">
              <UsersThree size={20} className="mr-2" />
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
