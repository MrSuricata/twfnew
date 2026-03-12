import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
  Package,
  CheckCircle,
  X as XIcon,
  FileText,
  UploadSimple,
  DownloadSimple,
  Trash,
  PlusCircle,
  CaretLeft,
  CaretRight,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ParsedShipment, getShipmentStatus } from '@/lib/shipmentTypes'
import { OperativeReport } from '@/lib/quotationTypes'
import { saveReportWithFile, deleteReport as deleteReportFromDB } from '@/lib/dataClient'
import ShipmentDetailsDialog from './ShipmentDetailsDialog'

interface ShipmentTrackingProps {
  shipmentRecords?: ParsedShipment[]
  reports?: OperativeReport[]
  onUpdateReports?: (reports: OperativeReport[]) => void
}

const ITEMS_PER_PAGE = 25

export default function ShipmentTracking({ shipmentRecords = [], reports = [], onUpdateReports }: ShipmentTrackingProps) {
  const [filterStatus, setFilterStatus] = useState<'all' | 'urgent' | 'libre'>('all')
  const [searchText, setSearchText] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  // ── Shipment detail dialog ──
  const [selectedShipment, setSelectedShipment] = useState<ParsedShipment | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // ── Report upload state ──
  const [reportDialogOpen, setReportDialogOpen] = useState(false)
  const [reportTargetRef, setReportTargetRef] = useState('')
  const [reportTargetShipment, setReportTargetShipment] = useState<ParsedShipment | null>(null)
  const [reportContainer, setReportContainer] = useState('')
  const [reportTitle, setReportTitle] = useState('')
  const [reportContent, setReportContent] = useState('')
  const [reportFile, setReportFile] = useState<File | null>(null)
  const [uploadingReport, setUploadingReport] = useState(false)

  const openReportDialog = (ref: string) => {
    const shipment = shipmentRecords.find(s => s.REF === ref) || null
    setReportTargetRef(ref)
    setReportTargetShipment(shipment)
    setReportContainer('')
    setReportTitle('')
    setReportContent('')
    setReportFile(null)
    setReportDialogOpen(true)
  }

  const handleReportFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) {
      toast.error('El archivo no debe superar los 3MB')
      return
    }
    setReportFile(file)
  }

  const handleSubmitReport = async () => {
    if (!reportTitle.trim()) {
      toast.error('Ingrese un título para el informe')
      return
    }
    if (!reportFile) {
      toast.error('Seleccione un archivo para el informe')
      return
    }

    setUploadingReport(true)

    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const base64 = e.target?.result as string

        const newReport: OperativeReport = {
          id: `rpt-${Date.now()}`,
          shipmentRef: reportTargetRef,
          containerNumber: reportContainer || undefined,
          title: reportTitle.trim(),
          content: reportContent.trim(),
          fileName: reportFile!.name,
          fileType: reportFile!.type,
          fileData: base64,
          createdAt: Date.now(),
          createdBy: 'admin'
        }

        // Update local state immediately
        const updated = [...reports, newReport]
        if (onUpdateReports) onUpdateReports(updated)

        // Save individually to Supabase (with file data)
        try {
          await saveReportWithFile(newReport)
        } catch (err) {
          console.warn('[DB] Failed to save report file:', err)
          toast.warning('Informe guardado localmente. Sincronización pendiente.')
        }

        toast.success(
          reportContainer
            ? `Informe agregado a ${reportTargetRef} (${reportContainer})`
            : `Informe operativo agregado a ${reportTargetRef}`
        )
        setReportDialogOpen(false)
        setUploadingReport(false)
      }

      reader.onerror = () => {
        toast.error('Error al leer el archivo')
        setUploadingReport(false)
      }

      reader.readAsDataURL(reportFile)
    } catch {
      toast.error('Error al subir el informe')
      setUploadingReport(false)
    }
  }

  const handleDeleteReport = async (reportId: string) => {
    const updated = reports.filter(r => r.id !== reportId)
    if (onUpdateReports) onUpdateReports(updated)
    // Also delete from Supabase
    try {
      await deleteReportFromDB(reportId)
    } catch (err) {
      console.warn('[DB] Failed to delete report:', err)
    }
    toast.success('Informe eliminado')
  }

  const handleDownloadReport = (report: OperativeReport) => {
    if (!report.fileData) {
      toast.error('Archivo no disponible')
      return
    }
    const link = document.createElement('a')
    link.href = report.fileData
    link.download = report.fileName
    link.click()
  }

  const getReportsForShipment = (ref: string) => reports.filter(r => r.shipmentRef === ref)

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

  const statusBadgeColorMap: Record<string, string> = {
    blue: 'bg-blue-500', yellow: 'bg-yellow-500 text-black', green: 'bg-green-500',
    gray: 'bg-gray-500', red: 'bg-red-500', orange: 'bg-orange-500'
  }

  const getStatusColorClass = (color: string) => {
    switch (color) {
      case 'green': return 'bg-green-500'
      case 'yellow': return 'bg-yellow-500'
      case 'red': return 'bg-red-500'
      case 'gray': return 'bg-gray-400'
      default: return 'bg-blue-500'
    }
  }

  // ── Filtering + Search ──
  const filteredRecords = useMemo(() => {
    let records = shipmentRecords || []

    // Status filter
    if (filterStatus === 'urgent') {
      records = records.filter(r => {
        const d = getDaysUntilFree(r.LIBRE_HASTA)
        return d >= 0 && d <= 2
      })
    } else if (filterStatus === 'libre') {
      records = records.filter(r => {
        const d = getDaysUntilFree(r.LIBRE_HASTA)
        return d < 0 && d !== 999
      })
    }

    // Text search
    if (searchText.trim()) {
      const q = searchText.toLowerCase()
      records = records.filter(r =>
        r.REF?.toLowerCase().includes(q) ||
        r.CLIENTE?.toLowerCase().includes(q) ||
        r.CNTR?.toLowerCase().includes(q) ||
        r.MBL?.toLowerCase().includes(q)
      )
    }

    return records
  }, [shipmentRecords, filterStatus, searchText])

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / ITEMS_PER_PAGE))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedRecords = filteredRecords.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE
  )

  // Reset page when filters change
  const handleFilterChange = (status: 'all' | 'urgent' | 'libre') => {
    setFilterStatus(status)
    setCurrentPage(1)
  }

  const handleSearchChange = (value: string) => {
    setSearchText(value)
    setCurrentPage(1)
  }

  // ── Row click → open detail modal ──
  const handleRowClick = (record: ParsedShipment) => {
    setSelectedShipment(record)
    setDetailOpen(true)
  }

  return (
    <div className="space-y-4">
      {/* Header with filters and search */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Package size={22} />
              Cargas
              <span className="text-sm font-normal text-muted-foreground ml-1">
                ({filteredRecords.length})
              </span>
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant={filterStatus === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleFilterChange('all')}
              >
                Todas
              </Button>
              <Button
                variant={filterStatus === 'urgent' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleFilterChange('urgent')}
                className={filterStatus === 'urgent' ? 'bg-orange-500 hover:bg-orange-600' : ''}
              >
                Urgentes
              </Button>
              <Button
                variant={filterStatus === 'libre' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleFilterChange('libre')}
                className={filterStatus === 'libre' ? 'bg-red-500 hover:bg-red-600' : ''}
              >
                Vencidos
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="relative">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchText}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Buscar por REF, cliente, contenedor o MBL..."
              className="pl-9 h-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filteredRecords.length === 0 ? (
            <div className="text-center py-12">
              <Package size={40} className="mx-auto mb-3 text-muted-foreground" />
              <h3 className="text-base font-semibold mb-1">Sin resultados</h3>
              <p className="text-sm text-muted-foreground">
                {searchText
                  ? `No se encontraron cargas con "${searchText}"`
                  : filterStatus === 'all'
                    ? 'No hay datos importados'
                    : `No hay cargas ${filterStatus === 'urgent' ? 'urgentes' : 'vencidas'}`}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[32px] pl-4 pr-0"></TableHead>
                      <TableHead className="text-xs">REF</TableHead>
                      <TableHead className="text-xs">Cliente</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">ETA</TableHead>
                      <TableHead className="text-xs">Libre Hasta</TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">Salida</TableHead>
                      <TableHead className="text-xs">Estado</TableHead>
                      <TableHead className="text-xs hidden sm:table-cell">CNTR</TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">Informes</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRecords.map((record, index) => {
                      const daysUntilFree = getDaysUntilFree(record.LIBRE_HASTA)
                      const recStatus = getShipmentStatus(record)
                      const recOps = record.operativas || []
                      const hasSalida = recOps.some(o => o.SALIDA && o.SALIDA.trim() !== '')
                      const salidaDate = recOps.find(o => o.SALIDA)?.SALIDA
                      return (
                        <TableRow
                          key={index}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleRowClick(record)}
                        >
                          {/* Status dot */}
                          <TableCell className="pl-4 pr-0">
                            <span className={`block w-2.5 h-2.5 rounded-full ${getStatusColorClass(recStatus.color)}`} />
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold whitespace-nowrap">{record.REF}</TableCell>
                          <TableCell className="text-xs max-w-[120px] truncate">{record.CLIENTE}</TableCell>
                          <TableCell className="text-xs hidden md:table-cell whitespace-nowrap">{record.ETA || '—'}</TableCell>
                          <TableCell>
                            {record.LIBRE_HASTA ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-xs whitespace-nowrap">{record.LIBRE_HASTA}</span>
                                <span className={`text-[10px] font-semibold ${
                                  daysUntilFree < 0 ? 'text-red-600 dark:text-red-400' :
                                  daysUntilFree <= 3 ? 'text-orange-600 dark:text-orange-400' :
                                  'text-green-600 dark:text-green-400'
                                }`}>
                                  {daysUntilFree < 0
                                    ? `Vencido ${Math.abs(daysUntilFree)}d`
                                    : daysUntilFree === 0 ? 'Vence HOY'
                                    : `${daysUntilFree}d`}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {hasSalida ? (
                              <span className="text-xs text-green-700 dark:text-green-400 font-medium whitespace-nowrap">{salidaDate}</span>
                            ) : (
                              <span className="text-[10px] text-orange-600 dark:text-orange-400 font-medium">A CONFIRMAR</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] whitespace-nowrap ${statusBadgeColorMap[recStatus.color] || 'bg-gray-500'}`}>
                              {recStatus.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant="outline" className="text-[10px]">{record.N}</Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {getReportsForShipment(record.REF).length > 0 ? (
                              <Badge className="bg-blue-500 text-[10px]">{getReportsForShipment(record.REF).length}</Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 text-xs h-7"
                              onClick={(e) => {
                                e.stopPropagation()
                                openReportDialog(record.REF)
                              }}
                            >
                              <PlusCircle size={14} />
                              Informe
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <div className="text-xs text-muted-foreground">
                    {((safePage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(safePage * ITEMS_PER_PAGE, filteredRecords.length)} de {filteredRecords.length}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={safePage <= 1}
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    >
                      <CaretLeft size={14} weight="bold" />
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => {
                        // Show first, last, current, and neighbors
                        if (p === 1 || p === totalPages) return true
                        if (Math.abs(p - safePage) <= 1) return true
                        return false
                      })
                      .reduce<(number | 'dots')[]>((acc, p, idx, arr) => {
                        if (idx > 0 && arr[idx - 1] !== undefined && p - (arr[idx - 1] as number) > 1) {
                          acc.push('dots')
                        }
                        acc.push(p)
                        return acc
                      }, [])
                      .map((item, idx) =>
                        item === 'dots' ? (
                          <span key={`dots-${idx}`} className="px-1 text-xs text-muted-foreground">...</span>
                        ) : (
                          <Button
                            key={item}
                            variant={safePage === item ? 'default' : 'outline'}
                            size="sm"
                            className="h-7 min-w-[28px] px-2 text-xs"
                            onClick={() => setCurrentPage(item as number)}
                          >
                            {item}
                          </Button>
                        )
                      )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={safePage >= totalPages}
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    >
                      <CaretRight size={14} weight="bold" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Shipment Details Modal */}
      <ShipmentDetailsDialog
        shipment={selectedShipment}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onSave={() => {}}
        clientView={false}
        reports={reports}
      />

      {/* ── Report Upload Dialog ── */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText size={24} className="text-accent" />
              Agregar Informe Operativo
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              REF: <span className="font-mono font-semibold text-foreground">{reportTargetRef}</span>
            </p>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Container selector (if shipment has multiple containers) */}
            {reportTargetShipment && reportTargetShipment.containers.length > 0 && (
              <div className="space-y-2">
                <Label>Contenedor (opcional)</Label>
                <Select value={reportContainer || '__all__'} onValueChange={(v) => setReportContainer(v === '__all__' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos — informe general" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos — informe general</SelectItem>
                    {reportTargetShipment.containers
                      .filter(c => c.valid)
                      .map(c => (
                        <SelectItem key={c.number} value={c.number}>
                          {c.number}
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Seleccioná un contenedor específico o dejá vacío para un informe general
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="report-title">Título del Informe *</Label>
              <Input
                id="report-title"
                placeholder="Ej: Informe operativo - Descarga contenedor"
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="report-notes">Notas / Observaciones (opcional)</Label>
              <Textarea
                id="report-notes"
                placeholder="Agregar notas o comentarios sobre el informe..."
                value={reportContent}
                onChange={(e) => setReportContent(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Archivo *</Label>
              <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-accent/50 transition-colors">
                {reportFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileText size={32} className="text-red-500" />
                    <div className="text-left">
                      <div className="font-medium text-sm">{reportFile.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {(reportFile.size / 1024).toFixed(0)} KB
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setReportFile(null)}
                    >
                      <XIcon size={16} />
                    </Button>
                  </div>
                ) : (
                  <label htmlFor="report-file" className="cursor-pointer">
                    <UploadSimple size={32} className="mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm font-medium">Seleccionar archivo</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, DOC, DOCX, XLS, XLSX — hasta 3MB</p>
                  </label>
                )}
                <input
                  id="report-file"
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                  onChange={handleReportFileSelect}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReportDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmitReport}
              disabled={uploadingReport || !reportTitle.trim() || !reportFile}
              className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
            >
              {uploadingReport ? (
                <>Subiendo...</>
              ) : (
                <>
                  <UploadSimple size={18} />
                  Subir Informe
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
