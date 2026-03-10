import { useState } from 'react'
import { ParsedShipment } from '@/lib/shipmentTypes'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  MagnifyingGlass, 
  PencilSimple, 
  Trash, 
  Funnel, 
  SortAscending, 
  SortDescending,
  Plus,
  FileCsv
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

interface ShipmentManagementProps {
  shipmentRecords?: ParsedShipment[]
  onRecordsUpdate?: (records: ParsedShipment[]) => void
}

export default function ShipmentManagement({ shipmentRecords = [], onRecordsUpdate }: ShipmentManagementProps) {
  const [localShipmentRecords, setLocalShipmentRecords] = useState<ParsedShipment[]>(shipmentRecords)
  const [filterText, setFilterText] = useState('')
  const [editingShipment, setEditingShipment] = useState<ParsedShipment | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)

  const filteredShipments = localShipmentRecords?.filter(s => 
    s.REF.toLowerCase().includes(filterText.toLowerCase()) ||
    s.CLIENTE.toLowerCase().includes(filterText.toLowerCase()) ||
    s.CNTR.toLowerCase().includes(filterText.toLowerCase()) ||
    s.BUQUE.toLowerCase().includes(filterText.toLowerCase())
  ) || []

  const handleDelete = (ref: string) => {
    if (confirm('¿Está seguro de eliminar esta carga?')) {
      setLocalShipmentRecords(current => (current || []).filter(s => s.REF !== ref))
      toast.success('Carga eliminada')
    }
  }

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingShipment) return

    setLocalShipmentRecords(current => 
      (current || []).map(s => s.REF === editingShipment.REF ? editingShipment : s)
    )
    setIsEditDialogOpen(false)
    toast.success('Carga actualizada')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Gestión de Cargas</h2>
          <p className="text-muted-foreground">Administra todas las cargas activas e históricas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <FileCsv size={18} />
            Exportar CSV
          </Button>
          <Button className="gap-2">
            <Plus size={18} />
            Nueva Carga
          </Button>
        </div>
      </div>

      <Card className="bg-white/60 backdrop-blur-md border-white/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="relative">
            <MagnifyingGlass className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por referencia, cliente, contenedor..."
              className="pl-9 bg-white/50 border-slate-200/50"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-slate-200/50 overflow-hidden bg-white/40">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Buque</TableHead>
                  <TableHead>ETA</TableHead>
                  <TableHead>Contenedores</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredShipments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No se encontraron cargas
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredShipments.map((shipment) => (
                    <TableRow key={shipment.REF} className="hover:bg-white/60 transition-colors">
                      <TableCell className="font-mono font-medium text-blue-600">{shipment.REF}</TableCell>
                      <TableCell>{shipment.CLIENTE}</TableCell>
                      <TableCell>{shipment.BUQUE}</TableCell>
                      <TableCell>{shipment.ETA}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-white/50">{shipment.N} CNTRs</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {shipment.CR && <Badge variant="secondary" className="text-[10px]">CR</Badge>}
                          {shipment.BL && <Badge variant="secondary" className="text-[10px]">BL</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-slate-500 hover:text-blue-600"
                            onClick={() => {
                              setEditingShipment(shipment)
                              setIsEditDialogOpen(true)
                            }}
                          >
                            <PencilSimple size={16} />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-slate-500 hover:text-red-600"
                            onClick={() => handleDelete(shipment.REF)}
                          >
                            <Trash size={16} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Carga {editingShipment?.REF}</DialogTitle>
          </DialogHeader>
          {editingShipment && (
            <form onSubmit={handleSaveEdit} className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Input 
                  value={editingShipment.CLIENTE} 
                  onChange={e => setEditingShipment({...editingShipment, CLIENTE: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Buque</Label>
                <Input 
                  value={editingShipment.BUQUE} 
                  onChange={e => setEditingShipment({...editingShipment, BUQUE: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>ETA</Label>
                <Input 
                  value={editingShipment.ETA} 
                  onChange={e => setEditingShipment({...editingShipment, ETA: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Libre Hasta</Label>
                <Input 
                  value={editingShipment.LIBRE_HASTA} 
                  onChange={e => setEditingShipment({...editingShipment, LIBRE_HASTA: e.target.value})}
                />
              </div>
              <div className="col-span-2 flex justify-end gap-2 mt-4">
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancelar</Button>
                <Button type="submit">Guardar Cambios</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
