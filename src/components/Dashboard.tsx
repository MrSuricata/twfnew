import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Boat, SignOut, Package, ChartLine, MagnifyingGlass, Database, ArrowsClockwise, FunnelSimple, X, Info, Star, ChatCircleText } from '@phosphor-icons/react'
import { toast } from 'sonner'
import ShipmentTracking from './ShipmentTracking'
import ExcelImport from './ExcelImport'
import ShipmentDetailsDialog from './ShipmentDetailsDialog'
// EmailConfigStatus removed — email config is now server-side
import CaseStudiesEditor from './CaseStudiesEditor'
import TestimonialsEditor from './TestimonialsEditor'
import { ParsedShipment } from '@/lib/shipmentTypes'

interface DashboardProps {
  onLogout: () => void
}

export default function Dashboard({ onLogout }: DashboardProps) {
  const [shipmentRecords, setShipmentRecords] = useState<ParsedShipment[]>([])
  const [activeTab, setActiveTab] = useState('shipments')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterLinea, setFilterLinea] = useState<string>('all')
  const [filterTerminal, setFilterTerminal] = useState<string>('all')
  const [filterCliente, setFilterCliente] = useState<string>('all')
  const [filterEstado, setFilterEstado] = useState<string>('all')
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date())
  const [selectedShipment, setSelectedShipment] = useState<ParsedShipment | null>(null)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)

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

  const isActiveShipment = (shipment: ParsedShipment): boolean => {
    const daysUntilFree = getDaysUntilFree(shipment.LIBRE_HASTA)
    return daysUntilFree >= -30
  }

  const activeShipments = shipmentRecords?.filter(isActiveShipment) || []
  
  const filteredShipments = activeShipments.filter(shipment => {
    const matchesSearch = !searchTerm || 
      shipment.REF?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      shipment.CLIENTE?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      shipment.CNTR?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      shipment.MBL?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      shipment.BUQUE?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesLinea = filterLinea === 'all' || shipment.LINEA === filterLinea
    const matchesTerminal = filterTerminal === 'all' || shipment.TERMINAL === filterTerminal
    const matchesCliente = filterCliente === 'all' || shipment.CLIENTE === filterCliente
    
    const days = getDaysUntilFree(shipment.LIBRE_HASTA)
    let matchesEstado = true
    if (filterEstado === 'vencido') matchesEstado = days < 0
    else if (filterEstado === 'urgente') matchesEstado = days >= 0 && days <= 2
    else if (filterEstado === 'proximo') matchesEstado = days > 2 && days <= 5
    else if (filterEstado === 'tiempo') matchesEstado = days > 5
    
    return matchesSearch && matchesLinea && matchesTerminal && matchesCliente && matchesEstado
  })
  
  const urgentShipments = activeShipments.filter(s => {
    const days = getDaysUntilFree(s.LIBRE_HASTA)
    return days >= 0 && days <= 2
  })
  const overdueShipments = activeShipments.filter(s => getDaysUntilFree(s.LIBRE_HASTA) < 0)
  
  const uniqueLineas = Array.from(new Set(activeShipments.map(s => s.LINEA).filter(Boolean))).sort()
  const uniqueTerminals = Array.from(new Set(activeShipments.map(s => s.TERMINAL).filter(Boolean))).sort()
  const uniqueClientes = Array.from(new Set(activeShipments.map(s => s.CLIENTE).filter(Boolean))).sort()
  
  const hasActiveFilters = searchTerm !== '' || filterLinea !== 'all' || filterTerminal !== 'all' || filterCliente !== 'all' || filterEstado !== 'all'
  
  const clearFilters = () => {
    setSearchTerm('')
    setFilterLinea('all')
    setFilterTerminal('all')
    setFilterCliente('all')
    setFilterEstado('all')
  }

  const handleShipmentClick = (shipment: ParsedShipment) => {
    setSelectedShipment(shipment)
    setDetailsDialogOpen(true)
  }

  const handleSaveShipment = (updatedShipment: ParsedShipment) => {
    setShipmentRecords((current) => 
      (current || []).map(s => s.REF === updatedShipment.REF ? updatedShipment : s)
    )
    setLastUpdateTime(new Date())
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 max-w-5xl">
            <TabsTrigger value="shipments">
              <Package size={20} className="mr-2" />
              Cargas Activas
            </TabsTrigger>
            <TabsTrigger value="excel-import">
              <Database size={20} className="mr-2" />
              Importar Excel
            </TabsTrigger>
            <TabsTrigger value="case-studies">
              <Star size={20} className="mr-2" />
              Casos de Éxito
            </TabsTrigger>
            <TabsTrigger value="testimonials">
              <ChatCircleText size={20} className="mr-2" />
              Testimonios
            </TabsTrigger>
            <TabsTrigger value="tracking">
              <MagnifyingGlass size={20} className="mr-2" />
              Tracking
            </TabsTrigger>
            <TabsTrigger value="stats">
              <ChartLine size={20} className="mr-2" />
              Estadísticas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="shipments" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-foreground">Cargas Activas</h1>
                <p className="text-muted-foreground">
                  {filteredShipments.length} de {activeShipments.length} cargas {hasActiveFilters && '(filtradas)'}
                  {lastUpdateTime && (
                    <span className="ml-2 text-xs">
                      • Actualizado: {lastUpdateTime.toLocaleTimeString('es-UY')}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={() => {
                    setLastUpdateTime(new Date())
                    toast.success('Vista actualizada')
                  }}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <ArrowsClockwise size={18} />
                  Refrescar
                </Button>
                <Button 
                  onClick={() => setActiveTab('excel-import')}
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  <ArrowsClockwise size={20} className="mr-2" />
                  Actualizar Datos
                </Button>
              </div>
            </div>

            {activeShipments.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-12">
                    <Package size={48} className="mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">No hay cargas activas</h3>
                    <p className="text-muted-foreground mb-4">
                      Importe datos desde Google Sheets o Excel para comenzar
                    </p>
                    <Button 
                      onClick={() => setActiveTab('excel-import')}
                      className="bg-accent text-accent-foreground hover:bg-accent/90"
                    >
                      <Database size={20} className="mr-2" />
                      Ir a Importar Datos
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-3xl font-bold text-accent">{activeShipments.length}</div>
                      <div className="text-sm text-muted-foreground">Total Activas</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-3xl font-bold text-orange-500">{urgentShipments.length}</div>
                      <div className="text-sm text-muted-foreground">Urgentes (≤2 días)</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-3xl font-bold text-red-500">{overdueShipments.length}</div>
                      <div className="text-sm text-muted-foreground">Vencidas</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-3xl font-bold text-accent">
                        {activeShipments.reduce((sum, s) => sum + s.N, 0)}
                      </div>
                      <div className="text-sm text-muted-foreground">Total Contenedores</div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <FunnelSimple size={24} />
                        Filtros y Búsqueda
                      </CardTitle>
                      {hasActiveFilters && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={clearFilters}
                          className="text-red-500 hover:text-red-600"
                        >
                          <X size={16} className="mr-2" />
                          Limpiar Filtros
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Buscar</label>
                        <div className="relative">
                          <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder="REF, Cliente, CNTR, MBL..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Estado</label>
                        <Select value={filterEstado} onValueChange={setFilterEstado}>
                          <SelectTrigger>
                            <SelectValue placeholder="Todos" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos los estados</SelectItem>
                            <SelectItem value="vencido">🔴 Vencido</SelectItem>
                            <SelectItem value="urgente">🟠 Urgente (≤2 días)</SelectItem>
                            <SelectItem value="proximo">🟡 Próximo (3-5 días)</SelectItem>
                            <SelectItem value="tiempo">🟢 A tiempo (&gt;5 días)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Línea Naviera</label>
                        <Select value={filterLinea} onValueChange={setFilterLinea}>
                          <SelectTrigger>
                            <SelectValue placeholder="Todas" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todas las líneas</SelectItem>
                            {uniqueLineas.map(linea => (
                              <SelectItem key={linea} value={linea}>{linea}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Terminal</label>
                        <Select value={filterTerminal} onValueChange={setFilterTerminal}>
                          <SelectTrigger>
                            <SelectValue placeholder="Todas" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todas las terminales</SelectItem>
                            {uniqueTerminals.map(terminal => (
                              <SelectItem key={terminal} value={terminal}>{terminal}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Cliente</label>
                        <Select value={filterCliente} onValueChange={setFilterCliente}>
                          <SelectTrigger>
                            <SelectValue placeholder="Todos" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos los clientes</SelectItem>
                            {uniqueClientes.map(cliente => (
                              <SelectItem key={cliente} value={cliente}>{cliente}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Tabla de Cargas ({filteredShipments.length})</span>
                      <Badge variant="outline" className="text-xs font-normal">
                        💡 Clic en fila para ver detalles
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {filteredShipments.length === 0 ? (
                      <div className="text-center py-12">
                        <MagnifyingGlass size={48} className="mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-semibold mb-2">No se encontraron resultados</h3>
                        <p className="text-muted-foreground mb-4">
                          Intenta ajustar los filtros de búsqueda
                        </p>
                        <Button 
                          variant="outline"
                          onClick={clearFilters}
                        >
                          Limpiar Filtros
                        </Button>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="font-bold">REF</TableHead>
                              <TableHead className="font-bold">CLIENTE</TableHead>
                              <TableHead className="font-bold">ETD</TableHead>
                              <TableHead className="font-bold">ETA</TableHead>
                              <TableHead className="font-bold">LIBRE HASTA</TableHead>
                              <TableHead className="font-bold">MBL</TableHead>
                              <TableHead className="font-bold">DÍAS</TableHead>
                              <TableHead className="font-bold">ESTADO</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredShipments
                              .sort((a, b) => getDaysUntilFree(a.LIBRE_HASTA) - getDaysUntilFree(b.LIBRE_HASTA))
                              .map((shipment, index) => {
                                const daysUntilFree = getDaysUntilFree(shipment.LIBRE_HASTA)
                                return (
                                  <TableRow 
                                    key={index} 
                                    className="hover:bg-accent/10 cursor-pointer transition-colors"
                                    onClick={() => handleShipmentClick(shipment)}
                                  >
                                    <TableCell className="font-mono text-xs font-semibold text-accent">
                                      {shipment.REF}
                                    </TableCell>
                                    <TableCell className="font-medium">{shipment.CLIENTE}</TableCell>
                                    <TableCell className="text-sm">{shipment.ETD}</TableCell>
                                    <TableCell className="text-sm">{shipment.ETA}</TableCell>
                                    <TableCell className="text-sm font-medium">{shipment.LIBRE_HASTA}</TableCell>
                                    <TableCell className="font-mono text-xs">{shipment.MBL}</TableCell>
                                    <TableCell className="text-center">
                                      <span className={
                                        daysUntilFree < 0 ? 'text-red-500 font-bold' :
                                        daysUntilFree <= 2 ? 'text-orange-500 font-bold' :
                                        daysUntilFree <= 5 ? 'text-yellow-600 font-semibold' :
                                        'text-green-600 font-medium'
                                      }>
                                        {daysUntilFree < 0 ? `-${Math.abs(daysUntilFree)}` : daysUntilFree}
                                      </span>
                                    </TableCell>
                                    <TableCell>
                                      {getUrgencyBadge(daysUntilFree)}
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="excel-import">
            <ExcelImport onImportComplete={(records) => {
              setShipmentRecords(() => records)
              setLastUpdateTime(new Date())
              setActiveTab('shipments')
              toast.success(`${records.length} registros cargados - mostrando en Cargas Activas`)
            }} />
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

          <TabsContent value="stats">
            <div className="space-y-6">
              {/* Email config is now managed server-side */}
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Total de Referencias</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-bold text-accent">{shipmentRecords?.length || 0}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Total Contenedores</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-bold text-blue-500">
                      {shipmentRecords?.reduce((sum, s) => sum + s.N, 0) || 0}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Clientes Únicos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-bold text-green-500">
                      {shipmentRecords ? new Set(shipmentRecords.map(s => s.CLIENTE)).size : 0}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Distribución por Línea Naviera</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {shipmentRecords && Array.from(new Set(shipmentRecords.map(s => s.LINEA)))
                      .filter(linea => linea)
                      .map(linea => {
                        const count = shipmentRecords.filter(s => s.LINEA === linea).length
                        const total = shipmentRecords.length
                        const percentage = ((count / total) * 100).toFixed(1)
                        return (
                          <div key={linea} className="flex items-center justify-between">
                            <span className="font-medium">{linea}</span>
                            <div className="flex items-center gap-4">
                              <div className="w-32 bg-muted rounded-full h-2">
                                <div 
                                  className="bg-accent h-2 rounded-full" 
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                              <span className="text-sm text-muted-foreground w-16 text-right">
                                {count} ({percentage}%)
                              </span>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <ShipmentDetailsDialog
        shipment={selectedShipment}
        open={detailsDialogOpen}
        onOpenChange={setDetailsDialogOpen}
        onSave={handleSaveShipment}
      />
    </div>
  )
}
