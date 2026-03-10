import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DownloadSimple, FilePdf, FileXls } from '@phosphor-icons/react'
import { ParsedShipment } from '@/lib/shipmentTypes'
import { QuoteFormData } from '@/lib/quotationTypes'
import { exportToCSV, exportToPDF } from '@/lib/exportUtils'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface AnalyticsDashboardProps {
  shipments: ParsedShipment[]
  quotes: QuoteFormData[]
}

const COLORS = ['#E8965A', '#2B4162', '#12664F', '#D4A373', '#8B5A3C']

export default function AnalyticsDashboard({ shipments, quotes }: AnalyticsDashboardProps) {
  const getShipmentsPerMonth = () => {
    const monthCounts: Record<string, number> = {}
    
    shipments.forEach(s => {
      if (s.ETA) {
        const date = new Date(s.ETA)
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        monthCounts[monthKey] = (monthCounts[monthKey] || 0) + 1
      }
    })
    
    return Object.entries(monthCounts)
      .sort()
      .slice(-12)
      .map(([month, count]) => ({
        month: new Date(month + '-01').toLocaleDateString('es-UY', { month: 'short', year: 'numeric' }),
        cargas: count
      }))
  }

  const getTopClients = () => {
    const clientCounts: Record<string, number> = {}
    
    shipments.forEach(s => {
      if (s.CLIENTE) {
        clientCounts[s.CLIENTE] = (clientCounts[s.CLIENTE] || 0) + s.N
      }
    })
    
    return Object.entries(clientCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cliente, contenedores]) => ({
        cliente: cliente.length > 20 ? cliente.substring(0, 20) + '...' : cliente,
        contenedores
      }))
  }

  const getByTransportMode = () => {
    const maritimo = shipments.filter(s => s.LINEA).length
    const terrestre = shipments.filter(s => !s.LINEA && !s.BUQUE).length
    const aereo = 0
    
    return [
      { name: 'Marítimo', value: maritimo },
      { name: 'Terrestre', value: terrestre },
      { name: 'Aéreo', value: aereo }
    ].filter(item => item.value > 0)
  }

  const getByOriginCountry = () => {
    const origins: Record<string, number> = {}
    
    shipments.forEach(s => {
      if (s.BUQUE) {
        const country = 'China'
        origins[country] = (origins[country] || 0) + 1
      }
    })
    
    return Object.entries(origins)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([pais, cantidad]) => ({ pais, cantidad }))
  }

  const getAverageTransitTime = () => {
    const transits: number[] = []
    
    shipments.forEach(s => {
      if (s.ETD && s.ETA) {
        const etd = new Date(s.ETD)
        const eta = new Date(s.ETA)
        const days = Math.floor((eta.getTime() - etd.getTime()) / (1000 * 60 * 60 * 24))
        if (days > 0 && days < 365) {
          transits.push(days)
        }
      }
    })
    
    if (transits.length === 0) return 0
    return Math.round(transits.reduce((sum, t) => sum + t, 0) / transits.length)
  }

  const getQuoteConversionStats = () => {
    const total = quotes.length
    const pending = quotes.filter(q => q.status === 'pending').length
    const responded = quotes.filter(q => q.status === 'responded').length
    const won = quotes.filter(q => q.status === 'won').length
    const lost = quotes.filter(q => q.status === 'lost').length
    
    const conversionRate = total > 0 ? Math.round((won / total) * 100) : 0
    
    return {
      total,
      pending,
      responded,
      won,
      lost,
      conversionRate
    }
  }

  const handleExportShipmentsPDF = () => {
    const data = shipments.map(s => ({
      REF: s.REF,
      CLIENTE: s.CLIENTE,
      ETA: s.ETA,
      TERMINAL: s.TERMINAL,
      N: s.N,
      LIBRE_HASTA: s.LIBRE_HASTA
    }))
    
    exportToPDF(
      'Reporte de Cargas - TWF',
      data,
      ['REF', 'CLIENTE', 'ETA', 'TERMINAL', 'N', 'LIBRE_HASTA'],
      'cargas-twf.pdf'
    )
  }

  const handleExportShipmentsExcel = () => {
    const data = shipments.map(s => ({
      REF: s.REF,
      CLIENTE: s.CLIENTE,
      ETD: s.ETD,
      ETA: s.ETA,
      FT: s.FT,
      LIBRE_HASTA: s.LIBRE_HASTA,
      CNTR: s.CNTR,
      N: s.N,
      MBL: s.MBL,
      LINEA: s.LINEA,
      BUQUE: s.BUQUE,
      TERMINAL: s.TERMINAL,
      FLETE: s.FLETE
    }))
    
    exportToCSV(data, `cargas-twf-${new Date().toISOString().split('T')[0]}.csv`)
  }

  const shipmentsPerMonth = getShipmentsPerMonth()
  const topClients = getTopClients()
  const byTransportMode = getByTransportMode()
  const byOrigin = getByOriginCountry()
  const avgTransit = getAverageTransitTime()
  const quoteStats = getQuoteConversionStats()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Estadísticas y Reportes</h2>
        <div className="flex gap-2">
          <Button onClick={handleExportShipmentsPDF} variant="outline" size="sm">
            <FilePdf size={18} className="mr-2" />
            Exportar PDF
          </Button>
          <Button onClick={handleExportShipmentsExcel} variant="outline" size="sm">
            <FileXls size={18} className="mr-2" />
            Exportar Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-accent">{shipments.length}</div>
            <div className="text-sm text-muted-foreground">Total Cargas</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-accent">
              {shipments.reduce((sum, s) => sum + s.N, 0)}
            </div>
            <div className="text-sm text-muted-foreground">Total Contenedores</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-accent">{avgTransit}</div>
            <div className="text-sm text-muted-foreground">Días Promedio Tránsito</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-accent">{quoteStats.conversionRate}%</div>
            <div className="text-sm text-muted-foreground">Tasa de Conversión</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Cargas por Mes</CardTitle>
          </CardHeader>
          <CardContent>
            {shipmentsPerMonth.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={shipmentsPerMonth}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="cargas" stroke="#E8965A" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No hay datos suficientes
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 5 Clientes por Volumen</CardTitle>
          </CardHeader>
          <CardContent>
            {topClients.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topClients}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="cliente" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="contenedores" fill="#E8965A" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No hay datos suficientes
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribución por Modo de Transporte</CardTitle>
          </CardHeader>
          <CardContent>
            {byTransportMode.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={byTransportMode}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {byTransportMode.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No hay datos suficientes
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estado de Cotizaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="text-sm font-medium">Total Cotizaciones</span>
                <span className="text-2xl font-bold">{quoteStats.total}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="text-xs text-yellow-700">Pendientes</div>
                  <div className="text-xl font-bold text-yellow-900">{quoteStats.pending}</div>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="text-xs text-blue-700">Respondidas</div>
                  <div className="text-xl font-bold text-blue-900">{quoteStats.responded}</div>
                </div>
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="text-xs text-green-700">Ganadas</div>
                  <div className="text-xl font-bold text-green-900">{quoteStats.won}</div>
                </div>
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="text-xs text-red-700">Perdidas</div>
                  <div className="text-xl font-bold text-red-900">{quoteStats.lost}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
