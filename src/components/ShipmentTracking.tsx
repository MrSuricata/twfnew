import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  MagnifyingGlass,
  Boat,
  MapPin,
  CalendarBlank,
  Package,
  Clock,
  CheckCircle,
  X as XIcon,
  Info
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { ParsedShipment } from '@/lib/shipmentTypes'

interface ShipmentTrackingProps {
  shipmentRecords?: ParsedShipment[]
}

export default function ShipmentTracking({ shipmentRecords = [] }: ShipmentTrackingProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResult, setSearchResult] = useState<ParsedShipment | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'urgent' | 'libre'>('all')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()

    if (!searchQuery.trim()) {
      toast.error('Ingrese un número de contenedor o referencia')
      return
    }

    const found = shipmentRecords?.find(
      s => s.CNTR?.toLowerCase().includes(searchQuery.toLowerCase()) ||
           s.REF?.toLowerCase().includes(searchQuery.toLowerCase()) ||
           s.CLIENTE?.toLowerCase().includes(searchQuery.toLowerCase()) ||
           s.MBL?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    if (found) {
      setSearchResult(found)
      toast.success('Envío encontrado')
    } else {
      setSearchResult(null)
      toast.error('No se encontró el envío. Verifique el número ingresado.')
    }
  }

  const getDaysUntilFree = (libreHasta: string): number => {
    if (!libreHasta) return 0
    const freeDate = new Date(libreHasta)
    const today = new Date()
    const diff = Math.floor((freeDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return diff
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

  const filteredRecords = shipmentRecords?.filter(record => {
    const days = getDaysUntilFree(record.LIBRE_HASTA)
    
    if (filterStatus === 'urgent') {
      return days >= 0 && days <= 2
    } else if (filterStatus === 'libre') {
      return days < 0
    }
    return true
  }) || []

  return (
    <div className="space-y-6">
      <Tabs defaultValue="search" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="search">
            <MagnifyingGlass size={20} className="mr-2" />
            Buscar
          </TabsTrigger>
          <TabsTrigger value="list">
            <Package size={20} className="mr-2" />
            Lista ({filteredRecords.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="search">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MagnifyingGlass size={24} />
                Tracking de Envíos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSearch} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="search">Número de Contenedor, REF, MBL o Cliente</Label>
                  <div className="flex gap-2">
                    <Input
                      id="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Ej: MSCU1234567 o REF-001"
                      className="flex-1"
                    />
                    <Button type="submit" className="bg-accent text-accent-foreground hover:bg-accent/90">
                      <MagnifyingGlass size={20} className="mr-2" />
                      Buscar
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>

          {searchResult && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Información del Envío</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Package size={18} />
                        <span>Referencia</span>
                      </div>
                      <p className="font-semibold text-lg font-mono">{searchResult.REF}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <span>Cliente</span>
                      </div>
                      <p className="font-semibold text-lg">{searchResult.CLIENTE}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Boat size={18} />
                        <span>Línea Naviera</span>
                      </div>
                      <p className="font-semibold text-lg">{searchResult.LINEA || 'N/A'}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <CalendarBlank size={18} />
                        <span>ETD (Salida)</span>
                      </div>
                      <p className="font-semibold text-lg">{searchResult.ETD || 'N/A'}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <CalendarBlank size={18} />
                        <span>ETA (Llegada)</span>
                      </div>
                      <p className="font-semibold text-lg">{searchResult.ETA || 'N/A'}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Clock size={18} />
                        <span>Libre Hasta</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-lg">{searchResult.LIBRE_HASTA || 'N/A'}</p>
                        {searchResult.LIBRE_HASTA && getUrgencyBadge(getDaysUntilFree(searchResult.LIBRE_HASTA))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <MapPin size={18} />
                        <span>Terminal</span>
                      </div>
                      <p className="font-semibold text-lg">{searchResult.TERMINAL || 'N/A'}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Boat size={18} />
                        <span>Buque</span>
                      </div>
                      <p className="font-semibold text-lg">{searchResult.BUQUE || 'N/A'}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <span>MBL</span>
                      </div>
                      <p className="font-semibold text-lg font-mono">{searchResult.MBL || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-border">
                    <h4 className="font-semibold mb-4">Contenedores ({searchResult.N})</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {searchResult.containers.map((container, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 rounded border border-border">
                          {container.valid ? (
                            <CheckCircle size={18} className="text-green-500" weight="fill" />
                          ) : (
                            <XIcon size={18} className="text-red-500" weight="bold" />
                          )}
                          <span className="font-mono text-sm">{container.number}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-border">
                    <h4 className="font-semibold mb-4">Estado de Documentación</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="flex items-center gap-2">
                        {searchResult.CR ? (
                          <CheckCircle size={20} className="text-green-500" weight="fill" />
                        ) : (
                          <XIcon size={20} className="text-gray-400" />
                        )}
                        <span className="text-sm">Carta Responsabilidad</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {searchResult.BL ? (
                          <CheckCircle size={20} className="text-green-500" weight="fill" />
                        ) : (
                          <XIcon size={20} className="text-gray-400" />
                        )}
                        <span className="text-sm">BL Entregado</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {searchResult.AD ? (
                          <CheckCircle size={20} className="text-green-500" weight="fill" />
                        ) : (
                          <XIcon size={20} className="text-gray-400" />
                        )}
                        <span className="text-sm">Depósito Avisado</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {searchResult.AT ? (
                          <CheckCircle size={20} className="text-green-500" weight="fill" />
                        ) : (
                          <XIcon size={20} className="text-gray-400" />
                        )}
                        <span className="text-sm">Transporte Avisado</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-border">
                    <h4 className="font-semibold mb-4">Información de Costos</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-sm text-muted-foreground">Flete</div>
                        <div className="font-semibold">${searchResult.FLETE?.toLocaleString() || '0'}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">C. Terminal</div>
                        <div className="font-semibold">${searchResult.C_TERMINAL?.toLocaleString() || '0'}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">C. Devolución</div>
                        <div className="font-semibold">${searchResult.C_DEV?.toLocaleString() || '0'}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Locales</div>
                        <div className="font-semibold">${searchResult.LOCALES?.toLocaleString() || '0'}</div>
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="text-sm text-muted-foreground">Forma de Pago</div>
                      <Badge variant="outline" className="mt-1">{searchResult.FORMA_DE_PAGO}</Badge>
                      {searchResult.VTO && (
                        <span className="ml-2 text-sm text-muted-foreground">
                          Vencimiento: {searchResult.VTO}
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-accent/10 border-accent/20">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="bg-accent/20 p-3 rounded-full">
                      <Info size={24} className="text-accent" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold mb-2">Información adicional</h4>
                      <p className="text-sm text-muted-foreground">
                        Los datos se sincronizan automáticamente con la base de seguimiento. 
                        Para más información, contacte a nuestro equipo.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="list">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Lista de Envíos</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant={filterStatus === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterStatus('all')}
                  >
                    Todos
                  </Button>
                  <Button
                    variant={filterStatus === 'urgent' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterStatus('urgent')}
                    className={filterStatus === 'urgent' ? 'bg-orange-500' : ''}
                  >
                    Urgentes
                  </Button>
                  <Button
                    variant={filterStatus === 'libre' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterStatus('libre')}
                    className={filterStatus === 'libre' ? 'bg-red-500' : ''}
                  >
                    Vencidos
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredRecords.length === 0 ? (
                <div className="text-center py-12">
                  <Package size={48} className="mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No hay envíos</h3>
                  <p className="text-muted-foreground">
                    {filterStatus === 'all' 
                      ? 'No hay datos importados' 
                      : `No hay envíos ${filterStatus === 'urgent' ? 'urgentes' : 'vencidos'}`}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>REF</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>ETA</TableHead>
                        <TableHead>Libre Hasta</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Contenedores</TableHead>
                        <TableHead>Línea</TableHead>
                        <TableHead>Terminal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRecords.map((record, index) => {
                        const daysUntilFree = getDaysUntilFree(record.LIBRE_HASTA)
                        return (
                          <TableRow 
                            key={index}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => {
                              setSearchResult(record)
                              setSearchQuery(record.REF)
                            }}
                          >
                            <TableCell className="font-mono text-xs font-semibold">{record.REF}</TableCell>
                            <TableCell>{record.CLIENTE}</TableCell>
                            <TableCell>{record.ETA}</TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <span>{record.LIBRE_HASTA}</span>
                                <span className="text-xs text-muted-foreground">
                                  {daysUntilFree < 0 
                                    ? `Vencido hace ${Math.abs(daysUntilFree)} días` 
                                    : `${daysUntilFree} días restantes`}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>{getUrgencyBadge(daysUntilFree)}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{record.N} CNTR</Badge>
                            </TableCell>
                            <TableCell>{record.LINEA}</TableCell>
                            <TableCell>{record.TERMINAL}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
