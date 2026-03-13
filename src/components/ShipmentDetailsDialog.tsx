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
  Info,
  Truck,
  Warehouse,
  Cube,
  FileText,
  DownloadSimple
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { ParsedShipment, getShipmentStatus } from '@/lib/shipmentTypes'
import { ShipmentDocument, OperativeReport } from '@/lib/quotationTypes'
import { fetchReportFile } from '@/lib/dataClient'

interface ShipmentDetailsDialogProps {
  shipment: ParsedShipment | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (updatedShipment: ParsedShipment) => void
  clientView?: boolean
  documents?: ShipmentDocument[]
  reports?: OperativeReport[]
}

export default function ShipmentDetailsDialog({
  shipment,
  open,
  onOpenChange,
  onSave,
  clientView = false,
  documents = [],
  reports = []
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
                {!clientView && editedShipment.CLIENTE && (
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

        <Tabs defaultValue={clientView ? "tracking" : "general"} className="w-full mt-4">
          <TabsList className={`grid w-full ${clientView ? 'grid-cols-3' : 'grid-cols-4'}`}>
            {clientView ? (
              <>
                <TabsTrigger value="tracking">
                  <Package size={18} className="mr-2" />
                  <span className="hidden sm:inline">Tracking</span>
                </TabsTrigger>
                <TabsTrigger value="logistics">
                  <Truck size={18} className="mr-2" />
                  <span className="hidden sm:inline">Logística</span>
                </TabsTrigger>
                <TabsTrigger value="reports" className="relative">
                  <FileText size={18} className="mr-2" />
                  <span className="hidden sm:inline">Informes</span>
                  {(() => {
                    const count = reports.filter(r => r.shipmentRef === editedShipment.REF).length
                    if (count === 0) return null
                    return (
                      <span className="ml-1 text-[10px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center bg-accent text-accent-foreground">
                        {count}
                      </span>
                    )
                  })()}
                </TabsTrigger>
              </>
            ) : (
              <>
                <TabsTrigger value="general">
                  <Info size={18} className="mr-2" />
                  General
                </TabsTrigger>
                <TabsTrigger value="operativa">
                  <Truck size={18} className="mr-2" />
                  Operativa
                </TabsTrigger>
                <TabsTrigger value="costs">
                  <CurrencyDollar size={18} className="mr-2" />
                  Costos
                </TabsTrigger>
                <TabsTrigger value="status">
                  <CheckCircle size={18} className="mr-2" />
                  Estado
                </TabsTrigger>
              </>
            )}
          </TabsList>

          {clientView && (
            <>
            <TabsContent value="tracking" className="space-y-4 mt-4">
              {/* ── Visual Status Timeline ── */}
              {(() => {
                const status = getShipmentStatus(editedShipment)
                const ops = editedShipment.operativas || []

                // Cross-reference ALL containers for the most accurate dates
                const salidaDates = ops.filter(o => o.SALIDA).map(o => o.SALIDA)
                const fiscDates = ops.filter(o => o.ETA_FISC).map(o => o.ETA_FISC)
                const devDates = ops.filter(o => o.DEV).map(o => o.DEV)
                const fiscales = [...new Set(ops.filter(o => o.FISCAL).map(o => o.FISCAL))]

                const hasSalida = salidaDates.length > 0
                const hasFisc = fiscDates.length > 0
                const hasDev = devDates.length > 0

                // Helpers to check date relative to today (parse as local to avoid timezone shift)
                const parseLocal = (s: string) => {
                  const parts = s.split('-')
                  if (parts.length === 3) return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
                  const d = new Date(s); d.setHours(0,0,0,0); return d
                }
                const todayMidnight = (() => { const t = new Date(); t.setHours(0,0,0,0); return t })()
                const isToday = (dateStr: string) => {
                  try { return parseLocal(dateStr).getTime() === todayMidnight.getTime() } catch { return false }
                }
                const isPast = (dateStr: string) => {
                  try { return parseLocal(dateStr).getTime() < todayMidnight.getTime() } catch { return false }
                }

                // Build sublabels — distinguish past / today / future
                const salidaSublabel = (() => {
                  if (!hasSalida) return 'Pendiente'
                  const date = salidaDates.length === 1 ? salidaDates[0] : salidaDates[salidaDates.length - 1]
                  if (isToday(date)) return `Hoy — operativa en curso`
                  if (salidaDates.length > 1) return `${salidaDates.length}/${ops.length} CNTR — ${date}`
                  return date
                })()
                const fiscSublabel = (() => {
                  if (!hasFisc) return 'Pendiente'
                  const date = fiscDates[fiscDates.length - 1]
                  const fiscal = fiscales.length > 0 ? ` • ${fiscales.join(', ')}` : ''
                  if (isToday(date)) return `Hoy — llegando a fiscal${fiscal}`
                  if (isPast(date)) return `${date}${fiscal}`
                  return `Estimado: ${date}${fiscal}`
                })()
                const devSublabel = hasDev
                  ? devDates[devDates.length - 1]
                  : (status.code === 'devuelto' ? 'Completado' : 'Pendiente')

                const milestones = [
                  {
                    label: 'En Tránsito',
                    sublabel: editedShipment.ETD ? `Salió ${editedShipment.ETD}` : 'Esperando embarque',
                    reached: true,
                    icon: <Boat size={18} />
                  },
                  {
                    label: 'En Puerto',
                    sublabel: editedShipment.ETA ? `Llegó ${editedShipment.ETA}` : 'Pendiente',
                    reached: ['en_puerto', 'salio_montevideo', 'en_frontera', 'llego_fiscal', 'devuelto'].includes(status.code),
                    icon: <Package size={18} />
                  },
                  {
                    label: hasSalida && salidaDates.some(d => isToday(d)) ? 'Sale de MVD' : 'Salió de MVD',
                    sublabel: salidaSublabel,
                    reached: ['salio_montevideo', 'en_frontera', 'llego_fiscal', 'devuelto'].includes(status.code),
                    icon: <Truck size={18} />
                  },
                  {
                    label: 'En Fiscal',
                    sublabel: fiscSublabel,
                    reached: ['llego_fiscal', 'devuelto'].includes(status.code),
                    icon: <Warehouse size={18} />
                  },
                  {
                    label: 'Devuelto',
                    sublabel: devSublabel,
                    reached: status.code === 'devuelto',
                    icon: <CheckCircle size={18} />
                  }
                ]

                return (
                  <div className="bg-muted/30 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-semibold">Estado del Envío</h4>
                      <Badge className={
                        status.color === 'green' ? 'bg-green-500' :
                        status.color === 'yellow' ? 'bg-yellow-500 text-black' :
                        status.color === 'gray' ? 'bg-gray-500' :
                        'bg-blue-500'
                      }>{status.label}</Badge>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-muted rounded-full h-2 mb-6">
                      <div
                        className={`h-2 rounded-full transition-all duration-700 ${
                          status.color === 'green' ? 'bg-green-500' :
                          status.color === 'yellow' ? 'bg-yellow-500' :
                          status.color === 'gray' ? 'bg-gray-400' :
                          'bg-blue-500'
                        }`}
                        style={{ width: `${status.progress}%` }}
                      />
                    </div>

                    {/* Milestone timeline */}
                    <div className="relative">
                      {milestones.map((m, idx) => (
                        <div key={idx} className="flex items-start gap-3 mb-4 last:mb-0">
                          {/* Icon circle */}
                          <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                            m.reached
                              ? 'bg-accent text-accent-foreground'
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            {m.icon}
                          </div>
                          {/* Connector line */}
                          {idx < milestones.length - 1 && (
                            <div className={`absolute w-0.5 h-6 ml-[15px] mt-8 ${
                              milestones[idx + 1].reached ? 'bg-accent' : 'bg-muted'
                            }`} style={{ top: `${idx * 52}px` }} />
                          )}
                          {/* Text */}
                          <div className="flex-1 pt-1">
                            <div className={`text-sm font-medium ${m.reached ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {m.label}
                            </div>
                            <div className="text-xs text-muted-foreground">{m.sublabel}</div>
                          </div>
                          {/* Check */}
                          {m.reached && (
                            <CheckCircle size={18} weight="fill" className="text-green-500 shrink-0 mt-1" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Shipment details grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Referencia</Label>
                  <div className="font-mono font-semibold text-lg">{editedShipment.REF}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Contenedores</Label>
                  <div className="font-mono text-sm">{editedShipment.CNTR || '-'}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">ETD (Salida)</Label>
                  <div className="font-medium">{editedShipment.ETD || '-'}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">ETA (Llegada)</Label>
                  <div className="font-medium">{editedShipment.ETA || '-'}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Buque</Label>
                  <div className="font-medium">{editedShipment.BUQUE || '-'}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Línea Naviera</Label>
                  <div className="font-medium">{editedShipment.LINEA || '-'}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Terminal</Label>
                  <div className="font-medium">{editedShipment.TERMINAL || '-'}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Cantidad</Label>
                  <div className="font-medium">{editedShipment.N} contenedor(es)</div>
                </div>
              </div>

              {/* Libre hasta warning */}
              {editedShipment.LIBRE_HASTA && (() => {
                const days = getDaysUntilFree(editedShipment.LIBRE_HASTA)
                if (days > 5) return null
                return (
                  <div className={`rounded-lg p-4 border-l-4 ${
                    days < 0 ? 'bg-red-50 dark:bg-red-950/20 border-l-red-500' :
                    days <= 2 ? 'bg-orange-50 dark:bg-orange-950/20 border-l-orange-500' :
                    'bg-yellow-50 dark:bg-yellow-950/20 border-l-yellow-500'
                  }`}>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Info size={16} className={days < 0 ? 'text-red-500' : days <= 2 ? 'text-orange-500' : 'text-yellow-600'} />
                      {days < 0
                        ? `Días libres vencidos hace ${Math.abs(days)} día${Math.abs(days) === 1 ? '' : 's'}`
                        : days === 0
                        ? 'Los días libres vencen HOY'
                        : `Los días libres vencen en ${days} día${days === 1 ? '' : 's'}`
                      }
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Libre hasta: {editedShipment.LIBRE_HASTA}</div>
                  </div>
                )
              })()}
            </TabsContent>

            {/* ── Client Logística Tab (merged Operativa + Logística) ── */}
            <TabsContent value="logistics" className="space-y-5 mt-4">
              {editedShipment.operativas && editedShipment.operativas.length > 0 ? (
                <>
                  {/* ── Fechas de Operativa + Embarque unified card ── */}
                  <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                    {/* Dates row */}
                    {(() => {
                      const allOps = editedShipment.operativas!
                      const salidas = allOps.filter(o => o.SALIDA).map(o => o.SALIDA)
                      const etaFiscs = allOps.filter(o => o.ETA_FISC).map(o => o.ETA_FISC)
                      const fiscales = [...new Set(allOps.filter(o => o.FISCAL).map(o => o.FISCAL))]

                      const dateItems = [
                        {
                          label: 'Salida MVD',
                          value: salidas.length === 0 ? '-' : salidas.length === 1 ? salidas[0] : `${salidas[0]} (${salidas.length}/${allOps.length})`,
                          accent: true
                        },
                        {
                          label: 'Llegada Fiscal',
                          value: etaFiscs.length === 0 ? '-' : etaFiscs.length === 1 ? etaFiscs[0] : `${etaFiscs[0]} (${etaFiscs.length}/${allOps.length})`,
                          accent: false
                        },
                        {
                          label: 'Libre Hasta',
                          value: editedShipment.LIBRE_HASTA || '-',
                          accent: false
                        },
                        {
                          label: 'Depósito Fiscal',
                          value: fiscales.join(', ') || '-',
                          accent: false
                        },
                      ]

                      return (
                        <div className="p-4 pb-3">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                            <CalendarBlank size={14} />
                            Fechas de Operativa
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {dateItems.map((item, i) => (
                              <div key={i} className={`rounded-lg px-3 py-2.5 ${item.accent ? 'bg-accent/10 border border-accent/20' : 'bg-muted/50'}`}>
                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{item.label}</div>
                                <div className={`text-sm font-semibold ${item.accent ? 'text-accent' : ''} truncate`}>{item.value}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}

                    {/* Divider */}
                    <div className="border-t mx-4" />

                    {/* Shipping info row */}
                    <div className="p-4 pt-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                        <Boat size={14} />
                        Embarque
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
                        {[
                          { label: 'Línea', value: editedShipment.LINEA },
                          { label: 'Buque', value: editedShipment.BUQUE },
                          { label: 'Terminal', value: editedShipment.TERMINAL },
                          { label: 'MBL', value: editedShipment.MBL, mono: true },
                        ].map((item, i) => (
                          <div key={i} className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</span>
                            <span className={`text-sm font-medium truncate ${item.mono ? 'font-mono text-xs' : ''}`}>{item.value || '-'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* ── Summary stats bar ── */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { value: editedShipment.operativas.length, unit: '', label: 'CNTR' },
                      { value: editedShipment.operativas.reduce((s, o) => s + o.PKGS, 0).toLocaleString(), unit: '', label: 'Bultos' },
                      { value: editedShipment.operativas.reduce((s, o) => s + o.KG, 0).toLocaleString(), unit: 'kg', label: 'Peso' },
                      { value: editedShipment.operativas.reduce((s, o) => s + o.M3, 0).toFixed(1), unit: 'm³', label: 'Volumen' },
                    ].map((stat, i) => (
                      <div key={i} className="text-center py-2.5 rounded-lg bg-muted/40">
                        <div className="text-base font-bold leading-tight">
                          {stat.value}<span className="text-xs font-normal text-muted-foreground ml-0.5">{stat.unit}</span>
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{stat.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* ── Container details ── */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Cube size={14} />
                      Detalle por Contenedor
                    </h4>
                    {editedShipment.operativas.map((op, idx) => (
                      <div key={idx} className="rounded-xl border bg-card shadow-sm overflow-hidden">
                        {/* Container header */}
                        <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm">{op.CNTR_OP || `Contenedor ${idx + 1}`}</span>
                            {op.TIPO && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-medium">{op.TIPO}</Badge>
                            )}
                          </div>
                          {op.OPERATIVA && (
                            <Badge className={`text-[10px] px-2 py-0 h-5 ${
                              op.OPERATIVA === 'TRASIEGO' ? 'bg-blue-500' :
                              op.OPERATIVA === 'DEVUELTO' ? 'bg-orange-500' :
                              'bg-green-600'
                            }`}>
                              {op.OPERATIVA}
                            </Badge>
                          )}
                        </div>

                        {/* Container body */}
                        <div className="px-4 py-3 space-y-2.5">
                          {/* Mercadería */}
                          {op.DESCRIPCION && (
                            <div className="text-sm">
                              <span className="text-muted-foreground text-xs">Mercadería</span>
                              <div className="font-medium">{op.DESCRIPCION}</div>
                            </div>
                          )}

                          {/* Stats row */}
                          <div className="grid grid-cols-3 gap-2">
                            <div className="bg-muted/40 rounded-md px-2.5 py-1.5 text-center">
                              <div className="text-xs text-muted-foreground">Bultos</div>
                              <div className="text-sm font-semibold">{op.PKGS.toLocaleString()}</div>
                            </div>
                            <div className="bg-muted/40 rounded-md px-2.5 py-1.5 text-center">
                              <div className="text-xs text-muted-foreground">Peso</div>
                              <div className="text-sm font-semibold">{op.KG.toLocaleString()}<span className="text-xs font-normal ml-0.5">kg</span></div>
                            </div>
                            <div className="bg-muted/40 rounded-md px-2.5 py-1.5 text-center">
                              <div className="text-xs text-muted-foreground">Volumen</div>
                              <div className="text-sm font-semibold">{op.M3}<span className="text-xs font-normal ml-0.5">m³</span></div>
                            </div>
                          </div>

                          {/* Extra info row */}
                          {(op.TRANSPORTE || op.DEPOSITO || op.WOOD === 'SI') && (
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs pt-1 border-t">
                              {op.TRANSPORTE && (
                                <div>
                                  <span className="text-muted-foreground">Transporte:</span>
                                  <span className="ml-1 font-medium">{op.TRANSPORTE}</span>
                                </div>
                              )}
                              {op.DEPOSITO && (
                                <div>
                                  <span className="text-muted-foreground">Depósito:</span>
                                  <span className="ml-1 font-medium">{op.DEPOSITO}</span>
                                </div>
                              )}
                              {op.WOOD === 'SI' && (
                                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">🪵 WOOD</Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Warehouse size={48} className="mx-auto mb-4" />
                  <p>No hay datos operativos disponibles para esta carga</p>
                </div>
              )}
            </TabsContent>

            {/* ── Client Reports Tab ── */}
            <TabsContent value="reports" className="space-y-4 mt-4">
              {(() => {
                const shipmentReports = reports.filter(r => r.shipmentRef === editedShipment.REF)

                if (shipmentReports.length === 0) {
                  return (
                    <div className="text-center py-12 text-muted-foreground">
                      <FileText size={48} className="mx-auto mb-4" />
                      <h4 className="text-lg font-semibold mb-2">Sin informes operativos</h4>
                      <p className="text-sm">Aún no se han publicado informes para esta carga</p>
                    </div>
                  )
                }

                const handleDownload = async (report: OperativeReport) => {
                  // If fileData is in memory (current session), download directly
                  if (report.fileData) {
                    const link = document.createElement('a')
                    link.href = report.fileData
                    link.download = report.fileName
                    link.click()
                    return
                  }
                  // Fetch from Supabase on demand
                  toast.info('Descargando archivo...')
                  try {
                    const fileData = await fetchReportFile(report.id)
                    if (fileData) {
                      const link = document.createElement('a')
                      link.href = fileData
                      link.download = report.fileName
                      link.click()
                    } else {
                      toast.error('Archivo no disponible en el servidor')
                    }
                  } catch {
                    toast.error('Error al descargar el archivo')
                  }
                }

                return (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-2 mb-4">
                      <FileText size={16} className="text-accent" />
                      Informes Operativos ({shipmentReports.length})
                    </h4>
                    {shipmentReports
                      .sort((a, b) => b.createdAt - a.createdAt)
                      .map(report => (
                        <div key={report.id} className="border rounded-xl p-4 hover:bg-muted/30 transition-colors">
                          <div className="flex items-start gap-3">
                            <div className="bg-red-100 dark:bg-red-900/30 p-2.5 rounded-lg shrink-0 mt-0.5">
                              <FileText size={24} className="text-red-600 dark:text-red-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold">{report.title}</span>
                                {report.containerNumber && (
                                  <Badge variant="outline" className="text-xs font-mono">
                                    {report.containerNumber}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {report.fileName} • Publicado el {new Date(report.createdAt).toLocaleDateString('es-UY', { day: '2-digit', month: 'long', year: 'numeric' })}
                              </div>
                              {report.content && (
                                <p className="text-sm text-muted-foreground mt-2 bg-muted/50 rounded-lg p-3">
                                  {report.content}
                                </p>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDownload(report) }}
                                className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
                              >
                                <DownloadSimple size={16} />
                                Descargar Informe
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )
              })()}
            </TabsContent>
            </>
          )}

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

          {/* Admin Operativa tab — shows editable logistics + operativas data */}
          {!clientView && (
            <TabsContent value="operativa" className="space-y-4 mt-4">
              {/* Editable logistics fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

              {/* Operativas data from sheet */}
              {editedShipment.operativas && editedShipment.operativas.length > 0 ? (
                <>
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Warehouse size={16} className="text-accent" />
                      Datos Operativos ({editedShipment.operativas.length} registros)
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <div className="bg-accent/10 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-accent">
                          {editedShipment.operativas.reduce((sum, o) => sum + o.PKGS, 0).toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">Bultos</div>
                      </div>
                      <div className="bg-muted rounded-lg p-3 text-center">
                        <div className="text-lg font-bold">
                          {editedShipment.operativas.reduce((sum, o) => sum + o.KG, 0).toLocaleString()} kg
                        </div>
                        <div className="text-xs text-muted-foreground">Peso</div>
                      </div>
                      <div className="bg-muted rounded-lg p-3 text-center">
                        <div className="text-lg font-bold">
                          {editedShipment.operativas.reduce((sum, o) => sum + o.M3, 0).toFixed(1)} m³
                        </div>
                        <div className="text-xs text-muted-foreground">Volumen</div>
                      </div>
                      <div className="bg-muted rounded-lg p-3 text-center">
                        <div className="text-lg font-bold">
                          {editedShipment.operativas[0]?.OPERATIVA || '-'}
                        </div>
                        <div className="text-xs text-muted-foreground">Tipo Op.</div>
                      </div>
                    </div>

                    {editedShipment.operativas.map((op, idx) => (
                      <div key={idx} className="border rounded-lg p-3 mb-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono font-semibold text-sm">{op.CNTR_OP || `#${idx + 1}`}</span>
                          <div className="flex gap-2">
                            {op.TIPO && <Badge variant="secondary" className="text-xs">{op.TIPO}</Badge>}
                            {op.OPERATIVA && <Badge className="text-xs bg-accent">{op.OPERATIVA}</Badge>}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          <div><span className="text-muted-foreground">Salida:</span> <span className="font-medium">{op.SALIDA || '-'}</span></div>
                          <div><span className="text-muted-foreground">Fiscal:</span> <span className="font-medium">{op.FISCAL || '-'}</span></div>
                          <div><span className="text-muted-foreground">Transporte:</span> <span className="font-medium">{op.TRANSPORTE || '-'}</span></div>
                          <div><span className="text-muted-foreground">Depósito:</span> <span className="font-medium">{op.DEPOSITO || '-'}</span></div>
                          {op.DESCRIPCION && (
                            <div className="col-span-2 md:col-span-4"><span className="text-muted-foreground">Desc:</span> <span className="font-medium">{op.DESCRIPCION}</span></div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="border-t pt-4 text-center text-muted-foreground text-sm py-6">
                  Sin datos operativos para esta carga
                </div>
              )}
            </TabsContent>
          )}

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
            {clientView ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!clientView && (
            <Button onClick={handleSave} className="bg-accent text-accent-foreground hover:bg-accent/90">
              <FloppyDisk size={20} className="mr-2" />
              Guardar Cambios
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
