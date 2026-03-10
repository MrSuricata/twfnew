import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  SignOut, 
  Package, 
  FileText, 
  ClockCounterClockwise, 
  UploadSimple,
  DownloadSimple,
  Eye
} from '@phosphor-icons/react'
import { ParsedShipment } from '@/lib/shipmentTypes'
import { ClientAccount, ShipmentDocument } from '@/lib/quotationTypes'
import { toast } from 'sonner'
import ShipmentDetailsDialog from './ShipmentDetailsDialog'

interface ClientPortalProps {
  onLogout: () => void
  clientEmail: string
  shipmentRecords?: ParsedShipment[]
  clients?: ClientAccount[]
  documents?: ShipmentDocument[]
  onDocumentsUpdate?: (docs: ShipmentDocument[]) => void
}

export default function ClientPortal({ onLogout, clientEmail, shipmentRecords = [], clients = [], documents = [] as ShipmentDocument[], onDocumentsUpdate }: ClientPortalProps) {
  const [localDocuments, setLocalDocuments] = useState<ShipmentDocument[]>(documents)
  
  const [activeTab, setActiveTab] = useState('active')
  const [selectedShipment, setSelectedShipment] = useState<ParsedShipment | null>(null)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(false)

  const currentClient = clients?.find(c => c.email === clientEmail)
  
  const clientShipments = shipmentRecords?.filter(s => 
    currentClient?.assignedShipments.includes(s.REF)
  ) || []

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

  const isActiveShipment = (shipment: ParsedShipment): boolean => {
    const daysUntilFree = getDaysUntilFree(shipment.LIBRE_HASTA)
    return daysUntilFree >= -30
  }

  const activeShipments = clientShipments.filter(isActiveShipment)
  const historyShipments = clientShipments.filter(s => !isActiveShipment(s))

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

  const handleFileUpload = async (shipmentRef: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > 10 * 1024 * 1024) {
      toast.error('El archivo no debe superar los 10MB')
      return
    }

    setUploadingDoc(true)

    try {
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64 = e.target?.result as string
        
        const newDoc: ShipmentDocument = {
          id: `${Date.now()}`,
          shipmentRef,
          name: file.name,
          type: file.type,
          uploadedAt: Date.now(),
          uploadedBy: clientEmail,
          data: base64
        }

        setDocuments(current => [...(current || []), newDoc])
        toast.success('Documento subido exitosamente')
        setUploadingDoc(false)
      }

      reader.onerror = () => {
        toast.error('Error al leer el archivo')
        setUploadingDoc(false)
      }

      reader.readAsDataURL(file)
    } catch (error) {
      toast.error('Error al subir el documento')
      setUploadingDoc(false)
    }
  }

  const handleDownloadDocument = (doc: ShipmentDocument) => {
    if (!doc.data) {
      toast.error('Documento no disponible')
      return
    }

    const link = document.createElement('a')
    link.href = doc.data
    link.download = doc.name
    link.click()
    toast.success('Descargando documento...')
  }

  const getDocumentsForShipment = (ref: string) => {
    return documents?.filter(d => d.shipmentRef === ref) || []
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-primary text-primary-foreground border-b border-border">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Package size={32} weight="fill" />
              <div>
                <div className="text-xl font-bold">Portal de Cliente</div>
                <div className="text-xs opacity-80">{currentClient?.company || currentClient?.name}</div>
              </div>
            </div>
            <Button variant="ghost" onClick={onLogout} className="text-primary-foreground hover:bg-primary-foreground/10">
              <SignOut size={20} className="mr-2" />
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Mis Cargas</h1>
          <p className="text-muted-foreground">
            Bienvenido/a, {currentClient?.name}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
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
              <div className="text-sm text-muted-foreground">Contenedores en Tránsito</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-accent">{historyShipments.length}</div>
              <div className="text-sm text-muted-foreground">Historial</div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 max-w-2xl">
            <TabsTrigger value="active">
              <Package size={20} className="mr-2" />
              Cargas Activas
            </TabsTrigger>
            <TabsTrigger value="documents">
              <FileText size={20} className="mr-2" />
              Documentos
            </TabsTrigger>
            <TabsTrigger value="history">
              <ClockCounterClockwise size={20} className="mr-2" />
              Historial
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4 mt-6">
            {activeShipments.length === 0 ? (
              <Card>
                <CardContent className="pt-12 pb-12 text-center">
                  <Package size={48} className="mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No hay cargas activas</h3>
                  <p className="text-muted-foreground">
                    Actualmente no tienes cargas en tránsito
                  </p>
                </CardContent>
              </Card>
            ) : (
              activeShipments.map((shipment) => {
                const days = getDaysUntilFree(shipment.LIBRE_HASTA)
                const shipmentDocs = getDocumentsForShipment(shipment.REF)
                
                return (
                  <Card key={shipment.REF} className="hover:shadow-lg transition-shadow">
                    <CardContent className="pt-6">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-xl font-bold">{shipment.REF}</h3>
                            {getUrgencyBadge(days)}
                          </div>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">ETA:</span>
                              <span className="ml-2 font-medium">{shipment.ETA || '-'}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Libre hasta:</span>
                              <span className="ml-2 font-medium">{shipment.LIBRE_HASTA || '-'}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Terminal:</span>
                              <span className="ml-2 font-medium">{shipment.TERMINAL || '-'}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Contenedores:</span>
                              <span className="ml-2 font-medium">{shipment.N}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Buque:</span>
                              <span className="ml-2 font-medium">{shipment.BUQUE || '-'}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Documentos:</span>
                              <span className="ml-2 font-medium">{shipmentDocs.length}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button 
                            onClick={() => handleViewDetails(shipment)}
                            className="gap-2"
                          >
                            <Eye size={18} />
                            Ver Detalle
                          </Button>
                          <label htmlFor={`upload-${shipment.REF}`}>
                            <Button 
                              variant="outline" 
                              className="gap-2 w-full"
                              disabled={uploadingDoc}
                              asChild
                            >
                              <span>
                                <UploadSimple size={18} />
                                Subir Documento
                              </span>
                            </Button>
                            <input
                              id={`upload-${shipment.REF}`}
                              type="file"
                              className="hidden"
                              onChange={(e) => handleFileUpload(shipment.REF, e)}
                              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                            />
                          </label>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </TabsContent>

          <TabsContent value="documents" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Documentos</CardTitle>
              </CardHeader>
              <CardContent>
                {!documents || documents.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText size={48} className="mx-auto mb-4" />
                    <p>No hay documentos subidos aún</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {documents.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50">
                        <div className="flex-1">
                          <div className="font-medium">{doc.name}</div>
                          <div className="text-sm text-muted-foreground">
                            REF: {doc.shipmentRef} • {new Date(doc.uploadedAt).toLocaleDateString('es-UY')}
                          </div>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDownloadDocument(doc)}
                          className="gap-2"
                        >
                          <DownloadSimple size={18} />
                          Descargar
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
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
              historyShipments.map((shipment) => (
                <Card key={shipment.REF}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold mb-2">{shipment.REF}</h3>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                          <div>
                            <span className="text-muted-foreground">ETA:</span>
                            <span className="ml-2">{shipment.ETA || '-'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Terminal:</span>
                            <span className="ml-2">{shipment.TERMINAL || '-'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Contenedores:</span>
                            <span className="ml-2">{shipment.N}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Completado</span>
                          </div>
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
              ))
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
        />
      )}
    </div>
  )
}
