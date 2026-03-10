import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { MagnifyingGlass, Boat, MapPin, CalendarBlank, Package } from '@phosphor-icons/react'
import { toast } from 'sonner'

interface Shipment {
  id: string
  cliente: string
  tipo: string
  estado: string
  fechaLlegada: string
  puerto: string
  observaciones: string
  containerNumber?: string
}

interface TrackingModuleProps {
  shipments: Shipment[]
}

interface TrackingEvent {
  date: string
  location: string
  status: string
  description: string
}

export default function TrackingModule({ shipments }: TrackingModuleProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResult, setSearchResult] = useState<Shipment | null>(null)
  const [trackingEvents, setTrackingEvents] = useState<TrackingEvent[]>([])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()

    if (!searchQuery.trim()) {
      toast.error('Ingrese un número de contenedor o referencia')
      return
    }

    const found = shipments.find(
      s => s.containerNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
           s.id === searchQuery ||
           s.cliente.toLowerCase().includes(searchQuery.toLowerCase())
    )

    if (found) {
      setSearchResult(found)
      generateTrackingEvents(found)
      toast.success('Contenedor encontrado')
    } else {
      setSearchResult(null)
      setTrackingEvents([])
      toast.error('No se encontró el contenedor. Verifique el número ingresado.')
    }
  }

  const generateTrackingEvents = (shipment: Shipment) => {
    const events: TrackingEvent[] = []
    const today = new Date()
    const eta = new Date(shipment.fechaLlegada)
    const daysInTransit = Math.floor((eta.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    if (shipment.estado.toLowerCase() === 'en tránsito') {
      events.push({
        date: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000).toLocaleDateString('es-UY'),
        location: 'Puerto de origen',
        status: 'Cargado',
        description: 'Contenedor cargado en buque'
      })
      events.push({
        date: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toLocaleDateString('es-UY'),
        location: 'En alta mar',
        status: 'En tránsito',
        description: 'Navegando hacia destino'
      })
      events.push({
        date: today.toLocaleDateString('es-UY'),
        location: 'Océano Atlántico',
        status: 'En tránsito',
        description: `En camino a ${shipment.puerto}`
      })
    } else if (shipment.estado.toLowerCase() === 'en puerto') {
      events.push({
        date: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toLocaleDateString('es-UY'),
        location: 'Puerto de origen',
        status: 'Cargado',
        description: 'Contenedor cargado en buque'
      })
      events.push({
        date: new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000).toLocaleDateString('es-UY'),
        location: shipment.puerto,
        status: 'Arribado',
        description: 'Buque arribó a puerto'
      })
      events.push({
        date: today.toLocaleDateString('es-UY'),
        location: shipment.puerto,
        status: 'En puerto',
        description: 'Contenedor en terminal. Pendiente de despacho.'
      })
    } else if (shipment.estado.toLowerCase() === 'entregado') {
      events.push({
        date: new Date(today.getTime() - 15 * 24 * 60 * 60 * 1000).toLocaleDateString('es-UY'),
        location: 'Puerto de origen',
        status: 'Cargado',
        description: 'Contenedor cargado en buque'
      })
      events.push({
        date: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000).toLocaleDateString('es-UY'),
        location: shipment.puerto,
        status: 'Arribado',
        description: 'Buque arribó a puerto'
      })
      events.push({
        date: new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000).toLocaleDateString('es-UY'),
        location: shipment.puerto,
        status: 'Despachado',
        description: 'Despacho aduanero completado'
      })
      events.push({
        date: today.toLocaleDateString('es-UY'),
        location: 'Destino final',
        status: 'Entregado',
        description: 'Mercadería entregada al cliente'
      })
    }

    setTrackingEvents(events)
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'en tránsito':
      case 'navegando':
        return 'bg-blue-500'
      case 'en puerto':
      case 'arribado':
        return 'bg-yellow-500'
      case 'entregado':
        return 'bg-green-500'
      case 'cargado':
        return 'bg-purple-500'
      case 'despachado':
        return 'bg-teal-500'
      default:
        return 'bg-gray-500'
    }
  }

  return (
    <div className="space-y-6">
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
              <Label htmlFor="search">Número de Contenedor o Referencia</Label>
              <div className="flex gap-2">
                <Input
                  id="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ej: MSCU1234567 o nombre de cliente"
                  className="flex-1"
                />
                <Button type="submit" className="bg-accent text-accent-foreground hover:bg-accent/90">
                  <MagnifyingGlass size={20} className="mr-2" />
                  Buscar
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Ingrese el número de contenedor, guía de transporte o nombre del cliente para rastrear su envío
            </p>
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
                    <span>Cliente</span>
                  </div>
                  <p className="font-semibold text-lg">{searchResult.cliente}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Boat size={18} />
                    <span>Tipo de Operativa</span>
                  </div>
                  <p className="font-semibold text-lg">{searchResult.tipo}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <span className="text-sm">Estado Actual</span>
                  </div>
                  <Badge className={`${getStatusColor(searchResult.estado)} text-lg px-3 py-1`}>
                    {searchResult.estado}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <CalendarBlank size={18} />
                    <span>Fecha Estimada de Llegada</span>
                  </div>
                  <p className="font-semibold text-lg">
                    {new Date(searchResult.fechaLlegada).toLocaleDateString('es-UY', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <MapPin size={18} />
                    <span>Puerto / Terminal</span>
                  </div>
                  <p className="font-semibold text-lg">{searchResult.puerto}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <span>Nº Contenedor</span>
                  </div>
                  <p className="font-semibold text-lg font-mono">{searchResult.containerNumber || 'N/A'}</p>
                </div>
              </div>
              {searchResult.observaciones && (
                <div className="mt-6 pt-6 border-t border-border">
                  <h4 className="font-semibold mb-2">Observaciones</h4>
                  <p className="text-muted-foreground">{searchResult.observaciones}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Historial de Movimientos</CardTitle>
            </CardHeader>
            <CardContent>
              {trackingEvents.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No hay eventos de seguimiento disponibles</p>
              ) : (
                <div className="space-y-4">
                  {trackingEvents.map((event, index) => (
                    <div key={index} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`w-4 h-4 rounded-full ${getStatusColor(event.status)}`} />
                        {index < trackingEvents.length - 1 && (
                          <div className="w-0.5 h-full bg-border flex-1 mt-2" />
                        )}
                      </div>
                      <div className="flex-1 pb-6">
                        <div className="flex items-start justify-between mb-1">
                          <div>
                            <Badge variant="outline" className="mb-2">{event.status}</Badge>
                            <h4 className="font-semibold">{event.location}</h4>
                          </div>
                          <span className="text-sm text-muted-foreground">{event.date}</span>
                        </div>
                        <p className="text-muted-foreground text-sm">{event.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-accent/10 border-accent/20">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="bg-accent/20 p-3 rounded-full">
                  <Boat size={24} className="text-accent" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold mb-2">Información adicional</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    Los datos de tracking se actualizan automáticamente cuando la naviera reporta nuevos eventos.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Para más información sobre su envío, contacte a nuestro equipo vía WhatsApp o email.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
