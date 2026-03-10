import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Boat, 
  SignOut, 
  Package, 
  ChartLine, 
  MagnifyingGlass, 
  Database, 
  Star, 
  ChatCircleText,
  Receipt,
  ChartBar
} from '@phosphor-icons/react'

import ShipmentTracking from './ShipmentTracking'
import ExcelImport from './ExcelImport'
import EmailConfigStatus from './EmailConfigStatus'
import CaseStudiesEditor from './CaseStudiesEditor'
import TestimonialsEditor from './TestimonialsEditor'
import AnalyticsDashboard from './AnalyticsDashboard'
import QuotesManagement from './QuotesManagement'
import { ParsedShipment } from '@/lib/shipmentTypes'
import { QuoteFormData } from '@/lib/quotationTypes'
import Breadcrumbs from './Breadcrumbs'

interface DashboardEnhancedProps {
  onLogout: () => void
}

export default function DashboardEnhanced({ onLogout }: DashboardEnhancedProps) {
  const [shipmentRecords] = useState<ParsedShipment[]>([])
  const [quotes, setQuotes] = useState<QuoteFormData[]>([])
  const [activeTab, setActiveTab] = useState('analytics')

  const handleUpdateQuote = (updatedQuote: QuoteFormData) => {
    setQuotes(current => 
      (current || []).map(q => q.id === updatedQuote.id ? updatedQuote : q)
    )
  }

  const getBreadcrumbs = () => {
    const breadcrumbMap: Record<string, string> = {
      analytics: 'Estadísticas',
      quotes: 'Cotizaciones',
      shipments: 'Cargas',
      'excel-import': 'Importar Datos',
      'case-studies': 'Casos de Éxito',
      testimonials: 'Testimonios',
      tracking: 'Tracking'
    }
    
    return [{ label: breadcrumbMap[activeTab] || 'Dashboard' }]
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-primary text-primary-foreground border-b border-border">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Boat size={32} weight="fill" />
              <span className="text-xl font-bold">TWF Admin</span>
            </div>
            <Button variant="ghost" onClick={onLogout} className="text-primary-foreground hover:bg-primary-foreground/10">
              <SignOut size={20} className="mr-2" />
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        <Breadcrumbs items={getBreadcrumbs()} />
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-7 max-w-6xl">
            <TabsTrigger value="analytics">
              <ChartBar size={20} className="mr-2" />
              <span className="hidden sm:inline">Analíticas</span>
            </TabsTrigger>
            <TabsTrigger value="quotes">
              <Receipt size={20} className="mr-2" />
              <span className="hidden sm:inline">Cotizaciones</span>
            </TabsTrigger>
            <TabsTrigger value="shipments">
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
            <TabsTrigger value="tracking">
              <MagnifyingGlass size={20} className="mr-2" />
              <span className="hidden sm:inline">Tracking</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analytics">
            <AnalyticsDashboard 
              shipments={shipmentRecords || []} 
              quotes={quotes || []}
            />
          </TabsContent>

          <TabsContent value="quotes">
            <QuotesManagement 
              quotes={quotes || []} 
              onUpdateQuote={handleUpdateQuote}
            />
          </TabsContent>

          <TabsContent value="shipments">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <Package size={48} className="mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Gestión de Cargas</h3>
                  <p className="text-muted-foreground mb-4">
                    Usa la pestaña "Importar" para cargar datos de Excel/Google Sheets
                  </p>
                  <Button onClick={() => setActiveTab('excel-import')}>
                    <Database size={20} className="mr-2" />
                    Ir a Importar Datos
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="excel-import">
            <EmailConfigStatus />
            <ExcelImport />
          </TabsContent>

          <TabsContent value="case-studies">
            <CaseStudiesEditor />
          </TabsContent>

          <TabsContent value="testimonials">
            <TestimonialsEditor />
          </TabsContent>

          <TabsContent value="tracking">
            <ShipmentTracking />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
