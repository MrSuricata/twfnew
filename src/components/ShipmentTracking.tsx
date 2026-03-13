import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  FileText,
  UploadSimple,
  X as XIcon,
  PlusCircle,
  CaretLeft,
  CaretRight,
  CaretUp,
  CaretDown,
  Funnel,
  SortAscending,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ParsedShipment, getShipmentStatus, ShipmentStatusCode } from '@/lib/shipmentTypes'
import { OperativeReport } from '@/lib/quotationTypes'
import { saveReportWithFile, deleteReport as deleteReportFromDB } from '@/lib/dataClient'
import ShipmentDetailsDialog from './ShipmentDetailsDialog'

interface ShipmentTrackingProps {
  shipmentRecords?: ParsedShipment[]
  reports?: OperativeReport[]
  onUpdateReports?: (reports: OperativeReport[]) => void
}

const ITEMS_PER_PAGE = 25

type SortColumn = 'REF' | 'CLIENTE' | 'ETA' | 'LIBRE_HASTA' | 'SALIDA' | 'ESTADO' | 'N'
type SortDirection = 'asc' | 'desc'

const STATUS_FILTERS: { value: string; label: string; color: string }[] = [
  { value: 'all', label: 'Todos', color: '' },
  { value: 'en_transito', label: 'En Tránsito', color: 'bg-blue-500' },
  { value: 'en_puerto', label: 'En Puerto', color: 'bg-yellow-500' },
  { value: 'salio_montevideo', label: 'Salió MVD', color: 'bg-blue-500' },
  { value: 'en_frontera', label: 'En Frontera', color: 'bg-blue-500' },
  { value: 'llego_fiscal', label: 'En Fiscal', color: 'bg-green-500' },
  { value: 'devuelto', label: 'Devuelto', color: 'bg-gray-500' },
]

const LIBRE_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'vencido', label: '🔴 Vencidos' },
  { value: 'urgente', label: '🟠 Urgentes (0-2d)' },
  { value: 'proximo', label: '🟡 Próximos (3-5d)' },
  { value: 'ok', label: '🟢 A tiempo' },
]

export default function ShipmentTracking({ shipmentRecords = [], reports = [], onUpdateReports }: ShipmentTrackingProps) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [libreFilter, setLibreFilter] = useState('all')
  const [searchText, setSearchText] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [sortColumn, setSortColumn] = useState<SortColumn>('LIBRE_HASTA')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

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
    if (file.size > 5 * 1024 * 1024) {
      toast.error('El archivo no debe superar los 5MB', { duration: 5000 })
      e.target.value = ''
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

        const updated = [...reports, newReport]
        if (onUpdateReports) onUpdateReports(updated)

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
    try {
      await deleteReportFromDB(reportId)
    } catch (err) {
      console.warn('[DB] Failed to delete report:', err)
    }
    toast.success('Informe eliminado')
  }

  const getReportsForShipment = (ref: string) => reports.filter(r => r.shipmentRef === ref)

  // Parse date as local to avoid timezone issues
  const parseLocal = (s: string) => {
    if (!s) return null
    const parts = s.split('-')
    if (parts.length === 3) return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
    const d = new Date(s); d.setHours(0, 0, 0, 0); return d
  }

  const getDaysUntilFree = (libreHasta: string): number => {
    if (!libreHasta) return 999
    const freeDate = parseLocal(libreHasta)
    if (!freeDate) return 999
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return Math.floor((freeDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  const statusBadgeColorMap: Record<string, string> = {
    blue: 'bg-blue-500', yellow: 'bg-yellow-500 text-black', green: 'bg-green-500',
    gray: 'bg-gray-500', red: 'bg-red-500', orange: 'bg-orange-500'
  }

  const getStatusDotClass = (color: string) => {
    switch (color) {
      case 'green': return 'bg-green-500'
      case 'yellow': return 'bg-yellow-500'
      case 'red': return 'bg-red-500'
      case 'gray': return 'bg-gray-400'
      default: return 'bg-blue-500'
    }
  }

  // ── Sorting handler ──
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
    setCurrentPage(1)
  }

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return <CaretDown size={12} className="text-muted-foreground/40 ml-1" />
    return sortDirection === 'asc'
      ? <CaretUp size={12} className="text-accent ml-1" />
      : <CaretDown size={12} className="text-accent ml-1" />
  }

  // ── Filtering + Search + Sort ──
  const filteredRecords = useMemo(() => {
    let records = shipmentRecords || []

    // Status filter
    if (statusFilter !== 'all') {
      records = records.filter(r => {
        const s = getShipmentStatus(r)
        return s.code === statusFilter
      })
    }

    // Libre filter
    if (libreFilter !== 'all') {
      records = records.filter(r => {
        const d = getDaysUntilFree(r.LIBRE_HASTA)
        if (d === 999) return false
        switch (libreFilter) {
          case 'vencido': return d < 0
          case 'urgente': return d >= 0 && d <= 2
          case 'proximo': return d >= 3 && d <= 5
          case 'ok': return d > 5
          default: return true
        }
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

    // Sort
    records = [...records].sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1
      switch (sortColumn) {
        case 'REF': return dir * a.REF.localeCompare(b.REF)
        case 'CLIENTE': return dir * (a.CLIENTE || '').localeCompare(b.CLIENTE || '')
        case 'ETA': return dir * (a.ETA || '').localeCompare(b.ETA || '')
        case 'LIBRE_HASTA': {
          const da = getDaysUntilFree(a.LIBRE_HASTA)
          const db = getDaysUntilFree(b.LIBRE_HASTA)
          return dir * (da - db)
        }
        case 'SALIDA': {
          const sa = a.operativas?.find(o => o.SALIDA)?.SALIDA || ''
          const sb = b.operativas?.find(o => o.SALIDA)?.SALIDA || ''
          return dir * sa.localeCompare(sb)
        }
        case 'ESTADO': {
          const sa = getShipmentStatus(a).progress
          const sb = getShipmentStatus(b).progress
          return dir * (sa - sb)
        }
        case 'N': return dir * ((a.N || 0) - (b.N || 0))
        default: return 0
      }
    })

    return records
  }, [shipmentRecords, statusFilter, libreFilter, searchText, sortColumn, sortDirection])

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / ITEMS_PER_PAGE))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedRecords = filteredRecords.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE
  )

  const resetFilters = () => {
    setStatusFilter('all')
    setLibreFilter('all')
    setSearchText('')
    setCurrentPage(1)
  }

  const handleSearchChange = (value: string) => {
    setSearchText(value)
    setCurrentPage(1)
  }

  const handleRowClick = (record: ParsedShipment) => {
    setSelectedShipment(record)
    setDetailOpen(true)
  }

  // Quick stats
  const stats = useMemo(() => {
    const all = shipmentRecords || []
    const vencidos = all.filter(r => { const d = getDaysUntilFree(r.LIBRE_HASTA); return d < 0 && d !== 999 }).length
    const urgentes = all.filter(r => { const d = getDaysUntilFree(r.LIBRE_HASTA); return d >= 0 && d <= 2 }).length
    const enTransito = all.filter(r => getShipmentStatus(r).code === 'en_transito').length
    const enFiscal = all.filter(r => getShipmentStatus(r).code === 'llego_fiscal').length
    return { total: all.length, vencidos, urgentes, enTransito, enFiscal }
  }, [shipmentRecords])

  const hasActiveFilters = statusFilter !== 'all' || libreFilter !== 'all' || searchText.trim() !== ''

  return (
    <div className="space-y-4">
      {/* ── Quick Stats Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { label: 'Total', value: stats.total, color: 'text-foreground', bg: 'bg-muted/50' },
          { label: 'Vencidos', value: stats.vencidos, color: 'text-red-600', bg: stats.vencidos > 0 ? 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900' : 'bg-muted/50' },
          { label: 'Urgentes', value: stats.urgentes, color: 'text-orange-600', bg: stats.urgentes > 0 ? 'bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900' : 'bg-muted/50' },
          { label: 'En Tránsito', value: stats.enTransito, color: 'text-blue-600', bg: 'bg-muted/50' },
          { label: 'En Fiscal', value: stats.enFiscal, color: 'text-green-600', bg: 'bg-muted/50' },
        ].map((s, i) => (
          <div key={i} className={`rounded-lg px-3 py-2 ${s.bg}`}>
            <div className={`text-lg font-bold leading-tight ${s.color}`}>{s.value}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Filters + Search Bar ── */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Search */}
            <div className="relative flex-1">
              <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchText}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Buscar REF, cliente, contenedor, MBL..."
                className="pl-9 h-9"
              />
            </div>

            {/* Status filter */}
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1) }}>
              <SelectTrigger className="h-9 w-full sm:w-[160px]">
                <Funnel size={14} className="mr-1.5 shrink-0" />
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map(f => (
                  <SelectItem key={f.value} value={f.value}>
                    <span className="flex items-center gap-2">
                      {f.color && <span className={`w-2 h-2 rounded-full ${f.color} shrink-0`} />}
                      {f.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Libre filter */}
            <Select value={libreFilter} onValueChange={(v) => { setLibreFilter(v); setCurrentPage(1) }}>
              <SelectTrigger className="h-9 w-full sm:w-[170px]">
                <SortAscending size={14} className="mr-1.5 shrink-0" />
                <SelectValue placeholder="Días Libres" />
              </SelectTrigger>
              <SelectContent>
                {LIBRE_FILTERS.map(f => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Reset */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-9 px-3 text-xs" onClick={resetFilters}>
                <XIcon size={14} className="mr-1" />
                Limpiar
              </Button>
            )}
          </div>

          {/* Active filter tags */}
          {hasActiveFilters && (
            <div className="flex items-center gap-1.5 mt-2 pt-2 border-t">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Filtros:</span>
              {statusFilter !== 'all' && (
                <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                  {STATUS_FILTERS.find(f => f.value === statusFilter)?.label}
                  <XIcon size={10} className="cursor-pointer" onClick={() => { setStatusFilter('all'); setCurrentPage(1) }} />
                </Badge>
              )}
              {libreFilter !== 'all' && (
                <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                  {LIBRE_FILTERS.find(f => f.value === libreFilter)?.label}
                  <XIcon size={10} className="cursor-pointer" onClick={() => { setLibreFilter('all'); setCurrentPage(1) }} />
                </Badge>
              )}
              {searchText && (
                <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                  "{searchText}"
                  <XIcon size={10} className="cursor-pointer" onClick={() => { setSearchText(''); setCurrentPage(1) }} />
                </Badge>
              )}
              <span className="text-[10px] text-muted-foreground ml-auto">{filteredRecords.length} resultado{filteredRecords.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Table ── */}
      <Card>
        <CardContent className="p-0">
          {filteredRecords.length === 0 ? (
            <div className="text-center py-12">
              <Package size={40} className="mx-auto mb-3 text-muted-foreground" />
              <h3 className="text-base font-semibold mb-1">Sin resultados</h3>
              <p className="text-sm text-muted-foreground">
                {hasActiveFilters
                  ? 'No se encontraron cargas con los filtros actuales'
                  : 'No hay datos importados'}
              </p>
              {hasActiveFilters && (
                <Button variant="link" className="mt-2 text-sm" onClick={resetFilters}>
                  Limpiar filtros
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[28px] pl-3 pr-0"></TableHead>
                      <TableHead className="text-xs cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort('REF')}>
                        <span className="flex items-center">REF<SortIcon column="REF" /></span>
                      </TableHead>
                      <TableHead className="text-xs cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort('CLIENTE')}>
                        <span className="flex items-center">Cliente<SortIcon column="CLIENTE" /></span>
                      </TableHead>
                      <TableHead className="text-xs cursor-pointer select-none hover:text-foreground transition-colors hidden md:table-cell" onClick={() => handleSort('ETA')}>
                        <span className="flex items-center">ETA<SortIcon column="ETA" /></span>
                      </TableHead>
                      <TableHead className="text-xs cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort('LIBRE_HASTA')}>
                        <span className="flex items-center">Libre Hasta<SortIcon column="LIBRE_HASTA" /></span>
                      </TableHead>
                      <TableHead className="text-xs cursor-pointer select-none hover:text-foreground transition-colors hidden lg:table-cell" onClick={() => handleSort('SALIDA')}>
                        <span className="flex items-center">Salida<SortIcon column="SALIDA" /></span>
                      </TableHead>
                      <TableHead className="text-xs cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort('ESTADO')}>
                        <span className="flex items-center">Estado<SortIcon column="ESTADO" /></span>
                      </TableHead>
                      <TableHead className="text-xs cursor-pointer select-none hover:text-foreground transition-colors hidden sm:table-cell" onClick={() => handleSort('N')}>
                        <span className="flex items-center">CNTR<SortIcon column="N" /></span>
                      </TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">Informes</TableHead>
                      <TableHead className="text-xs hidden md:table-cell text-right pr-4">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRecords.map((record, index) => {
                      const daysUntilFree = getDaysUntilFree(record.LIBRE_HASTA)
                      const recStatus = getShipmentStatus(record)
                      const recOps = record.operativas || []
                      const hasSalida = recOps.some(o => o.SALIDA && o.SALIDA.trim() !== '')
                      const salidaDate = recOps.find(o => o.SALIDA)?.SALIDA
                      const reportCount = getReportsForShipment(record.REF).length
                      return (
                        <TableRow
                          key={index}
                          className="cursor-pointer hover:bg-muted/50 transition-colors group"
                          onClick={() => handleRowClick(record)}
                        >
                          {/* Status dot */}
                          <TableCell className="pl-3 pr-0">
                            <span className={`block w-2 h-2 rounded-full ${getStatusDotClass(recStatus.color)}`} />
                          </TableCell>
                          <TableCell className="font-mono text-xs font-bold whitespace-nowrap">{record.REF}</TableCell>
                          <TableCell className="text-xs max-w-[140px] truncate">{record.CLIENTE}</TableCell>
                          <TableCell className="text-xs hidden md:table-cell whitespace-nowrap text-muted-foreground">{record.ETA || '—'}</TableCell>
                          <TableCell>
                            {record.LIBRE_HASTA ? (
                              <div className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  daysUntilFree < 0 ? 'bg-red-500' :
                                  daysUntilFree <= 2 ? 'bg-orange-500' :
                                  daysUntilFree <= 5 ? 'bg-yellow-500' :
                                  'bg-green-500'
                                }`} />
                                <div className="flex flex-col">
                                  <span className="text-xs whitespace-nowrap">{record.LIBRE_HASTA}</span>
                                  <span className={`text-[10px] font-semibold ${
                                    daysUntilFree < 0 ? 'text-red-600 dark:text-red-400' :
                                    daysUntilFree <= 2 ? 'text-orange-600 dark:text-orange-400' :
                                    daysUntilFree <= 5 ? 'text-yellow-600 dark:text-yellow-400' :
                                    'text-green-600 dark:text-green-400'
                                  }`}>
                                    {daysUntilFree < 0
                                      ? `Vencido ${Math.abs(daysUntilFree)}d`
                                      : daysUntilFree === 0 ? 'Vence HOY'
                                      : `${daysUntilFree}d restantes`}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {hasSalida ? (
                              <span className="text-xs font-medium whitespace-nowrap">{salidaDate}</span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">Pendiente</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] whitespace-nowrap ${statusBadgeColorMap[recStatus.color] || 'bg-gray-500'}`}>
                              {recStatus.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <span className="text-xs font-medium">{record.N}</span>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {reportCount > 0 ? (
                              <Badge variant="secondary" className="text-[10px]">
                                <FileText size={10} className="mr-1" />{reportCount}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-right pr-4">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 text-xs h-7 opacity-0 group-hover:opacity-100 transition-opacity"
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
                    <p className="text-xs text-muted-foreground mt-1">PDF, DOC, DOCX, XLS, XLSX — hasta 5MB</p>
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
