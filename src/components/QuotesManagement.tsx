import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileXls, ChatCircleText, Clock, CheckCircle, XCircle, Trophy } from '@phosphor-icons/react'
import { QuoteFormData, QuoteStatus, QuoteNote } from '@/lib/quotationTypes'
import { exportQuotesToExcel } from '@/lib/exportUtils'
import { toast } from 'sonner'

interface QuotesManagementProps {
  quotes: QuoteFormData[]
  onUpdateQuote: (quote: QuoteFormData) => void
}

export default function QuotesManagement({ quotes, onUpdateQuote }: QuotesManagementProps) {
  const [selectedQuote, setSelectedQuote] = useState<QuoteFormData | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [filterStatus, setFilterStatus] = useState<QuoteStatus | 'all'>('all')

  const getStatusBadge = (status: QuoteStatus) => {
    const variants = {
      pending: { label: 'Pendiente', className: 'bg-yellow-500' },
      responded: { label: 'Respondida', className: 'bg-blue-500' },
      won: { label: 'Ganada', className: 'bg-green-500' },
      lost: { label: 'Perdida', className: 'bg-red-500' }
    }
    const variant = variants[status]
    return <Badge className={variant.className}>{variant.label}</Badge>
  }

  const getStatusIcon = (status: QuoteStatus) => {
    const icons = {
      pending: <Clock size={20} />,
      responded: <ChatCircleText size={20} />,
      won: <Trophy size={20} />,
      lost: <XCircle size={20} />
    }
    return icons[status]
  }

  const filteredQuotes = filterStatus === 'all' 
    ? quotes 
    : quotes.filter(q => q.status === filterStatus)

  const sortedQuotes = [...filteredQuotes].sort((a, b) => b.timestamp - a.timestamp)

  const handleOpenDialog = (quote: QuoteFormData) => {
    setSelectedQuote(quote)
    setNewNote('')
    setDialogOpen(true)
  }

  const handleUpdateStatus = (status: QuoteStatus) => {
    if (!selectedQuote) return
    
    const updated = { ...selectedQuote, status }
    onUpdateQuote(updated)
    setSelectedQuote(updated)
    toast.success('Estado actualizado')
  }

  const handleAddNote = () => {
    if (!selectedQuote || !newNote.trim()) return
    
    const note: QuoteNote = {
      id: `${Date.now()}`,
      text: newNote.trim(),
      createdAt: Date.now(),
      createdBy: 'Admin'
    }
    
    const updated = {
      ...selectedQuote,
      notes: [...selectedQuote.notes, note]
    }
    
    onUpdateQuote(updated)
    setSelectedQuote(updated)
    setNewNote('')
    toast.success('Nota agregada')
  }

  const handleExportExcel = () => {
    exportQuotesToExcel(filteredQuotes, `cotizaciones-${new Date().toISOString().split('T')[0]}.csv`)
    toast.success('Exportado exitosamente')
  }

  const statsByStatus = {
    total: quotes.length,
    pending: quotes.filter(q => q.status === 'pending').length,
    responded: quotes.filter(q => q.status === 'responded').length,
    won: quotes.filter(q => q.status === 'won').length,
    lost: quotes.filter(q => q.status === 'lost').length
  }

  const conversionRate = statsByStatus.total > 0 
    ? Math.round((statsByStatus.won / statsByStatus.total) * 100) 
    : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Gestión de Cotizaciones</h2>
        <Button onClick={handleExportExcel} variant="outline" size="sm">
          <FileXls size={18} className="mr-2" />
          Exportar Excel
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-accent">{statsByStatus.total}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card className="bg-yellow-50">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-yellow-700">{statsByStatus.pending}</div>
            <div className="text-sm text-yellow-600">Pendientes</div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-blue-700">{statsByStatus.responded}</div>
            <div className="text-sm text-blue-600">Respondidas</div>
          </CardContent>
        </Card>
        <Card className="bg-green-50">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-green-700">{statsByStatus.won}</div>
            <div className="text-sm text-green-600">Ganadas</div>
          </CardContent>
        </Card>
        <Card className="bg-red-50">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-red-700">{statsByStatus.lost}</div>
            <div className="text-sm text-red-600">Perdidas</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6 text-center">
          <div className="text-4xl font-bold text-accent mb-2">{conversionRate}%</div>
          <div className="text-sm text-muted-foreground">Tasa de Conversión (Ganadas / Total)</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Cotizaciones</CardTitle>
            <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as QuoteStatus | 'all')}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
                <SelectItem value="responded">Respondidas</SelectItem>
                <SelectItem value="won">Ganadas</SelectItem>
                <SelectItem value="lost">Perdidas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {sortedQuotes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No hay cotizaciones para mostrar
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Nombre/Empresa</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Tipo Carga</TableHead>
                    <TableHead>Ruta</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Notas</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedQuotes.map((quote) => (
                    <TableRow key={quote.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => handleOpenDialog(quote)}>
                      <TableCell>{new Date(quote.timestamp).toLocaleDateString('es-UY')}</TableCell>
                      <TableCell className="font-medium">{quote.name}</TableCell>
                      <TableCell>{quote.email}</TableCell>
                      <TableCell>{quote.cargoType}</TableCell>
                      <TableCell className="text-sm">
                        {quote.origin && quote.destination 
                          ? `${quote.origin} → ${quote.destination}`
                          : '-'
                        }
                      </TableCell>
                      <TableCell>{getStatusBadge(quote.status)}</TableCell>
                      <TableCell>
                        {quote.notes.length > 0 ? (
                          <Badge variant="outline">{quote.notes.length}</Badge>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenDialog(quote)
                          }}
                        >
                          Ver Detalle
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de Cotización</DialogTitle>
          </DialogHeader>
          
          {selectedQuote && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Fecha</div>
                  <div>{new Date(selectedQuote.timestamp).toLocaleString('es-UY')}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Estado Actual</div>
                  <div>{getStatusBadge(selectedQuote.status)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Nombre/Empresa</div>
                  <div className="font-medium">{selectedQuote.name}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Email</div>
                  <div>{selectedQuote.email}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Teléfono</div>
                  <div>{selectedQuote.phone || '-'}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Tipo de Carga</div>
                  <div>{selectedQuote.cargoType}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Origen</div>
                  <div>{selectedQuote.origin || '-'}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Destino</div>
                  <div>{selectedQuote.destination || '-'}</div>
                </div>
              </div>

              {selectedQuote.details && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-2">Detalles de la Carga</div>
                  <div className="p-3 bg-muted rounded-lg">{selectedQuote.details}</div>
                </div>
              )}

              <div>
                <div className="text-sm font-medium text-muted-foreground mb-3">Cambiar Estado</div>
                <div className="grid grid-cols-4 gap-2">
                  <Button 
                    size="sm" 
                    variant={selectedQuote.status === 'pending' ? 'default' : 'outline'}
                    onClick={() => handleUpdateStatus('pending')}
                    className="gap-2"
                  >
                    <Clock size={16} />
                    Pendiente
                  </Button>
                  <Button 
                    size="sm" 
                    variant={selectedQuote.status === 'responded' ? 'default' : 'outline'}
                    onClick={() => handleUpdateStatus('responded')}
                    className="gap-2"
                  >
                    <ChatCircleText size={16} />
                    Respondida
                  </Button>
                  <Button 
                    size="sm" 
                    variant={selectedQuote.status === 'won' ? 'default' : 'outline'}
                    onClick={() => handleUpdateStatus('won')}
                    className="gap-2"
                  >
                    <Trophy size={16} />
                    Ganada
                  </Button>
                  <Button 
                    size="sm" 
                    variant={selectedQuote.status === 'lost' ? 'default' : 'outline'}
                    onClick={() => handleUpdateStatus('lost')}
                    className="gap-2"
                  >
                    <XCircle size={16} />
                    Perdida
                  </Button>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-muted-foreground mb-3">Notas Internas</div>
                <div className="space-y-3 mb-4">
                  {selectedQuote.notes.length === 0 ? (
                    <div className="text-sm text-muted-foreground italic">No hay notas aún</div>
                  ) : (
                    selectedQuote.notes.map((note) => (
                      <div key={note.id} className="p-3 bg-muted rounded-lg">
                        <div className="text-sm font-medium mb-1">{note.createdBy}</div>
                        <div className="text-sm text-muted-foreground mb-2">
                          {new Date(note.createdAt).toLocaleString('es-UY')}
                        </div>
                        <div>{note.text}</div>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex gap-2">
                  <Textarea
                    placeholder="Agregar nota interna..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    rows={3}
                  />
                  <Button onClick={handleAddNote} disabled={!newNote.trim()}>
                    Agregar
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
