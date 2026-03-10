import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Package,
  CalendarBlank,
  Boat,
  MapPin,
  CurrencyDollar,
  CheckCircle,
  X as XIcon,
  FloppyDisk,
  Info
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { ParsedShipment } from '@/lib/shipmentTypes'

interface ShipmentDetailsDialogProps {
  shipment: ParsedShipment | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (updatedShipment: ParsedShipment) => void
}

export default function ShipmentDetailsDialog({ 
  shipment, 
  open, 
  onOpenChange,
  onSave 
}: ShipmentDetailsDialogProps) {
  const [editedShipment, setEditedShipment] = useState<ParsedShipment | null>(null)

  useEffect(() => {
    if (open && shipment) {
      setEditedShipment({ ...shipment })
    }
  }, [open, shipment])

  const handleOpen = (isOpen: boolean) => {
    if (!isOpen) {
      setEditedShipment(null)
    }
    onOpenChange(isOpen)
  }

  const handleSave = () => {
    if (editedShipment) {
      onSave(editedShipment)
      toast.success('Cambios guardados exitosamente')
      onOpenChange(false)
    }
  }

  if (!editedShipment || !shipment) return null

  const updateField = <K extends keyof ParsedShipment>(field: K, value: ParsedShipment[K]) => {
    setEditedShipment(prev => prev ? { ...prev, [field]: value } : null)
  }

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
      return <Badge className="bg-red-500">Vencido ({Math.abs(days)} días)</Badge>
    } else if (days <= 2) {
      return <Badge className="bg-orange-500">Urgente ({days} días)</Badge>
    } else if (days <= 5) {
      return <Badge className="bg-yellow-500">Próximo ({days} días)</Badge>
    }
    return <Badge className="bg-green-500">A tiempo ({days} días)</Badge>
  }

  const daysUntilFree = getDaysUntilFree(editedShipment.LIBRE_HASTA)

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex-1">
              <DialogTitle className="text-2xl flex items-center gap-2">
                <Package size={28} className="text-accent" weight="duotone" />
                Detalles de Carga
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-2">
                REF: <span className="font-mono font-semibold text-foreground text-base">{editedShipment.REF}</span>
                {editedShipment.CLIENTE && (
                  <span className="ml-4">
                    Cliente: <span className="font-semibold text-foreground">{editedShipment.CLIENTE}</span>
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {getUrgencyBadge(daysUntilFree)}
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general">
              <Info size={18} className="mr-2" />
              General
            </TabsTrigger>
            <TabsTrigger value="logistics">
              <Boat size={18} className="mr-2" />
              Logística
            </TabsTrigger>
            <TabsTrigger value="costs">
              <CurrencyDollar size={18} className="mr-2" />
              Costos
            </TabsTrigger>
            <TabsTrigger value="status">
              <CheckCircle size={18} className="mr-2" />
              Estado
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ref">Referencia *</Label>
                <Input
                  id="ref"
                  value={editedShipment.REF}
                  onChange={(e) => updateField('REF', e.target.value)}
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cliente">Cliente *</Label>
                <Input
                  id="cliente"
                  value={editedShipment.CLIENTE}
                  onChange={(e) => updateField('CLIENTE', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="etd">
                  <CalendarBlank size={16} className="inline mr-1" />
                  ETD (Fecha de Salida)
                </Label>
                <Input
                  id="etd"
                  type="date"
                  value={editedShipment.ETD}
                  onChange={(e) => updateField('ETD', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="eta">
                  <CalendarBlank size={16} className="inline mr-1" />
                  ETA (Fecha de Llegada)
                </Label>
                <Input
                  id="eta"
                  type="date"
                  value={editedShipment.ETA}
                  onChange={(e) => updateField('ETA', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ft">Free Time (días)</Label>
                <Input
                  id="ft"
                  type="number"
                  value={editedShipment.FT}
                  onChange={(e) => updateField('FT', parseInt(e.target.value) || 0)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="libre-hasta">
                  <CalendarBlank size={16} className="inline mr-1" />
                  Libre Hasta
                </Label>
                <Input
                  id="libre-hasta"
                  type="date"
                  value={editedShipment.LIBRE_HASTA}
                  onChange={(e) => updateField('LIBRE_HASTA', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mbl">MBL / BL Master</Label>
                <Input
                  id="mbl"
                  value={editedShipment.MBL}
                  onChange={(e) => updateField('MBL', e.target.value)}
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="n">Número de Contenedores</Label>
                <Input
                  id="n"
                  type="number"
                  value={editedShipment.N}
                  onChange={(e) => updateField('N', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cntr">
                <Package size={16} className="inline mr-1" />
                Contenedores (separados por coma o espacio)
              </Label>
              <Textarea
                id="cntr"
                value={editedShipment.CNTR}
                onChange={(e) => updateField('CNTR', e.target.value)}
                className="font-mono text-sm"
                rows={3}
                placeholder="MSCU1234567, MSCU2345678, ..."
              />
              {editedShipment.containers.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {editedShipment.containers.map((container, index) => (
                    <Badge 
                      key={index}
                      variant={container.valid ? "default" : "destructive"}
                      className="font-mono text-xs"
                    >
                      {container.valid ? (
                        <CheckCircle size={14} className="mr-1" weight="fill" />
                      ) : (
                        <XIcon size={14} className="mr-1" weight="bold" />
                      )}
                      {container.number}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="logistics" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="linea">
                  <Boat size={16} className="inline mr-1" />
                  Línea Naviera
                </Label>
                <Input
                  id="linea"
                  value={editedShipment.LINEA}
                  onChange={(e) => updateField('LINEA', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="buque">
                  <Boat size={16} className="inline mr-1" />
                  Buque
                </Label>
                <Input
                  id="buque"
                  value={editedShipment.BUQUE}
                  onChange={(e) => updateField('BUQUE', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="terminal">
                  <MapPin size={16} className="inline mr-1" />
                  Terminal
                </Label>
                <Input
                  id="terminal"
                  value={editedShipment.TERMINAL}
                  onChange={(e) => updateField('TERMINAL', e.target.value)}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="costs" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="flete">
                  <CurrencyDollar size={16} className="inline mr-1" />
                  Flete
                </Label>
                <Input
                  id="flete"
                  type="number"
                  step="0.01"
                  value={editedShipment.FLETE}
                  onChange={(e) => updateField('FLETE', parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="c-terminal">
                  <CurrencyDollar size={16} className="inline mr-1" />
                  Costo Terminal
                </Label>
                <Input
                  id="c-terminal"
                  type="number"
                  step="0.01"
                  value={editedShipment.C_TERMINAL}
                  onChange={(e) => updateField('C_TERMINAL', parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="c-dev">
                  <CurrencyDollar size={16} className="inline mr-1" />
                  Costo Devolución
                </Label>
                <Input
                  id="c-dev"
                  type="number"
                  step="0.01"
                  value={editedShipment.C_DEV}
                  onChange={(e) => updateField('C_DEV', parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="locales">
                  <CurrencyDollar size={16} className="inline mr-1" />
                  Costos Locales
                </Label>
                <Input
                  id="locales"
                  type="number"
                  step="0.01"
                  value={editedShipment.LOCALES}
                  onChange={(e) => updateField('LOCALES', parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="forma-pago">Forma de Pago</Label>
                <Select 
                  value={editedShipment.FORMA_DE_PAGO} 
                  onValueChange={(value) => updateField('FORMA_DE_PAGO', value as any)}
                >
                  <SelectTrigger id="forma-pago">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="programado">Programado</SelectItem>
                    <SelectItem value="cuenta corriente">Cuenta Corriente</SelectItem>
                    <SelectItem value="al arribo">Al Arribo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="vto">Vencimiento Pago</Label>
                <Input
                  id="vto"
                  value={editedShipment.VTO}
                  onChange={(e) => updateField('VTO', e.target.value)}
                />
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="text-sm text-muted-foreground mb-2">Resumen de Costos</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-muted p-3 rounded-lg">
                  <div className="text-xs text-muted-foreground">Flete</div>
                  <div className="text-lg font-bold">${editedShipment.FLETE.toLocaleString()}</div>
                </div>
                <div className="bg-muted p-3 rounded-lg">
                  <div className="text-xs text-muted-foreground">Terminal</div>
                  <div className="text-lg font-bold">${editedShipment.C_TERMINAL.toLocaleString()}</div>
                </div>
                <div className="bg-muted p-3 rounded-lg">
                  <div className="text-xs text-muted-foreground">Devolución</div>
                  <div className="text-lg font-bold">${editedShipment.C_DEV.toLocaleString()}</div>
                </div>
                <div className="bg-muted p-3 rounded-lg">
                  <div className="text-xs text-muted-foreground">Locales</div>
                  <div className="text-lg font-bold">${editedShipment.LOCALES.toLocaleString()}</div>
                </div>
              </div>
              <div className="mt-4 bg-accent/10 p-4 rounded-lg border border-accent/20">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Total Estimado</div>
                  <div className="text-2xl font-bold text-accent">
                    ${(editedShipment.FLETE + editedShipment.C_TERMINAL + editedShipment.C_DEV + editedShipment.LOCALES).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="status" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label htmlFor="cr" className="text-base">Carta de Responsabilidad</Label>
                  <p className="text-sm text-muted-foreground">Documento recibido</p>
                </div>
                <Switch
                  id="cr"
                  checked={editedShipment.CR}
                  onCheckedChange={(checked) => updateField('CR', checked)}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label htmlFor="bl" className="text-base">BL Entregado</Label>
                  <p className="text-sm text-muted-foreground">Bill of Lading entregado al cliente</p>
                </div>
                <Switch
                  id="bl"
                  checked={editedShipment.BL}
                  onCheckedChange={(checked) => updateField('BL', checked)}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label htmlFor="ad" className="text-base">Depósito Avisado</Label>
                  <p className="text-sm text-muted-foreground">Notificación enviada al depósito</p>
                </div>
                <Switch
                  id="ad"
                  checked={editedShipment.AD}
                  onCheckedChange={(checked) => updateField('AD', checked)}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label htmlFor="at" className="text-base">Transporte Avisado</Label>
                  <p className="text-sm text-muted-foreground">Coordinación de transporte confirmada</p>
                </div>
                <Switch
                  id="at"
                  checked={editedShipment.AT}
                  onCheckedChange={(checked) => updateField('AT', checked)}
                />
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="text-sm font-medium mb-3">Estado General</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className={`p-3 rounded-lg border-2 ${editedShipment.CR ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-gray-50'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">CR</span>
                    {editedShipment.CR ? (
                      <CheckCircle size={20} className="text-green-500" weight="fill" />
                    ) : (
                      <XIcon size={20} className="text-gray-400" />
                    )}
                  </div>
                </div>
                <div className={`p-3 rounded-lg border-2 ${editedShipment.BL ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-gray-50'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">BL</span>
                    {editedShipment.BL ? (
                      <CheckCircle size={20} className="text-green-500" weight="fill" />
                    ) : (
                      <XIcon size={20} className="text-gray-400" />
                    )}
                  </div>
                </div>
                <div className={`p-3 rounded-lg border-2 ${editedShipment.AD ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-gray-50'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">AD</span>
                    {editedShipment.AD ? (
                      <CheckCircle size={20} className="text-green-500" weight="fill" />
                    ) : (
                      <XIcon size={20} className="text-gray-400" />
                    )}
                  </div>
                </div>
                <div className={`p-3 rounded-lg border-2 ${editedShipment.AT ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-gray-50'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">AT</span>
                    {editedShipment.AT ? (
                      <CheckCircle size={20} className="text-green-500" weight="fill" />
                    ) : (
                      <XIcon size={20} className="text-gray-400" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <FloppyDisk size={20} className="mr-2" />
            Guardar Cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
