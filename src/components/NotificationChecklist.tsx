import { useState, useEffect, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  BellRinging,
  CheckCircle,
  EnvelopeSimple,
  Warning,
  SkipForward,
  Camera,
  FileText,
  ArrowRight,
  SpinnerGap,
  MagnifyingGlass,
  PaperPlaneTilt,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { ParsedShipment, getShipmentStatus } from '@/lib/shipmentTypes'
import { NotificationTask, NotificationStep, OriginPhoto, OperativeReport } from '@/lib/quotationTypes'
import {
  fetchNotificationTasks,
  confirmShipmentEvent,
  updateNotificationTask,
  skipNotificationTask,
  sendNotificationEmail,
} from '@/lib/dataClient'
import NotificationEmailDialog, { STEP_SUBJECTS, STEP_TEMPLATES } from './NotificationEmailDialog'

interface NotificationChecklistProps {
  shipments: ParsedShipment[]
  originPhotos: OriginPhoto[]
  reports: OperativeReport[]
}

const STEP_LABELS: Record<NotificationStep, string> = {
  departure: 'Salida',
  border: 'Cruce Frontera',
  fiscal: 'Llegada Fiscal',
}

const STEP_ICONS: Record<NotificationStep, string> = {
  departure: '🚚',
  border: '🛂',
  fiscal: '📦',
}

export default function NotificationChecklist({ shipments, originPhotos, reports }: NotificationChecklistProps) {
  const [tasks, setTasks] = useState<NotificationTask[]>([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [emailDialogTask, setEmailDialogTask] = useState<NotificationTask | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [filterSearch, setFilterSearch] = useState('')

  const today = new Date().toISOString().split('T')[0]

  // Load tasks on mount
  const loadTasks = useCallback(async () => {
    try {
      const data = await fetchNotificationTasks('all')
      setTasks(data)
    } catch (err) {
      console.error('Failed to load notification tasks:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadTasks() }, [loadTasks])

  // ── Zona A: Sugerencias de confirmación ──
  // Detecta operativas con SALIDA reciente que no tienen task creada
  const suggestions = useMemo(() => {
    const items: { shipmentRef: string; containerNumber: string; step: NotificationStep; salidaDate: string; cliente: string; label: string }[] = []
    const existingIds = new Set(tasks.map(t => t.id))

    for (const s of shipments) {
      if (!s.operativas || s.operativas.length === 0) continue

      for (const op of s.operativas) {
        if (!op.SALIDA) continue
        const cntr = op.CNTR_OP || ''

        // Departure: SALIDA is today or recent (last 3 days)
        const salidaId = `ntask-${s.REF}-${cntr || 'all'}-departure`
        if (!existingIds.has(salidaId)) {
          const salida = op.SALIDA
          // Check if SALIDA is within last 3 days
          const salidaDate = new Date(salida)
          const todayDate = new Date(today)
          const daysDiff = Math.floor((todayDate.getTime() - salidaDate.getTime()) / (1000 * 60 * 60 * 24))
          if (daysDiff >= 0 && daysDiff <= 3) {
            items.push({
              shipmentRef: s.REF,
              containerNumber: cntr,
              step: 'departure',
              salidaDate: salida,
              cliente: s.CLIENTE || '',
              label: daysDiff === 0 ? 'Salida HOY' : `Salió hace ${daysDiff}d`,
            })
          }
        }

        // Border: SALIDA was yesterday or before, no border task
        const borderId = `ntask-${s.REF}-${cntr || 'all'}-border`
        if (!existingIds.has(borderId) && existingIds.has(salidaId)) {
          const salidaDate = new Date(op.SALIDA)
          const todayDate = new Date(today)
          const daysDiff = Math.floor((todayDate.getTime() - salidaDate.getTime()) / (1000 * 60 * 60 * 24))
          if (daysDiff >= 1 && daysDiff <= 4) {
            items.push({
              shipmentRef: s.REF,
              containerNumber: cntr,
              step: 'border',
              salidaDate: op.SALIDA,
              cliente: s.CLIENTE || '',
              label: 'Cruce de frontera esperado',
            })
          }
        }

        // Fiscal: ETA_FISC reached or SALIDA+2 days
        const fiscalId = `ntask-${s.REF}-${cntr || 'all'}-fiscal`
        if (!existingIds.has(fiscalId) && existingIds.has(borderId)) {
          const etaFisc = op.ETA_FISC
          if (etaFisc) {
            const etaDate = new Date(etaFisc)
            const todayDate = new Date(today)
            if (todayDate >= etaDate) {
              items.push({
                shipmentRef: s.REF,
                containerNumber: cntr,
                step: 'fiscal',
                salidaDate: op.SALIDA,
                cliente: s.CLIENTE || '',
                label: 'Llegada a fiscal esperada',
              })
            }
          }
        }
      }
    }

    return items
  }, [shipments, tasks, today])

  // ── Zona B: Tasks agrupadas ──
  const overdueTasks = useMemo(() =>
    tasks.filter(t => t.status === 'pending' && t.dueDate < today), [tasks, today])
  const todayTasks = useMemo(() =>
    tasks.filter(t => t.status === 'pending' && t.dueDate === today), [tasks, today])
  const completedTodayTasks = useMemo(() =>
    tasks.filter(t => t.status === 'completed' && t.dueDate === today), [tasks, today])

  const filteredSuggestions = filterSearch
    ? suggestions.filter(s => s.shipmentRef.toLowerCase().includes(filterSearch.toLowerCase()) || s.cliente.toLowerCase().includes(filterSearch.toLowerCase()))
    : suggestions

  // ── Actions ──
  const handleConfirm = async (shipmentRef: string, containerNumber: string, step: NotificationStep, salidaDate: string) => {
    const key = `${shipmentRef}-${containerNumber}-${step}`
    setConfirming(key)
    try {
      const task = await confirmShipmentEvent(shipmentRef, containerNumber, step, salidaDate)
      setTasks(prev => [...prev, task])
      toast.success(`${STEP_LABELS[step]} confirmada — ${shipmentRef}`)
    } catch (err: any) {
      toast.error(`Error: ${err.message}`)
    } finally {
      setConfirming(null)
    }
  }

  const handleCheckbox = async (taskId: string, field: 'photosOk' | 'reportOk', value: boolean) => {
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, [field]: value } : t))
    try {
      await updateNotificationTask(taskId, { [field]: value } as any)
    } catch {
      // Revert
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, [field]: !value } : t))
      toast.error('Error al actualizar')
    }
  }

  const handleSkip = async (taskId: string) => {
    try {
      await skipNotificationTask(taskId)
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'skipped' as any } : t))
      toast.info('Tarea omitida')
    } catch {
      toast.error('Error al omitir')
    }
  }

  const handleEmailSent = (taskId: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, emailSent: true, status: 'completed' as any } : t))
    setEmailDialogTask(null)
  }

  // Quick send for border/fiscal — no dialog needed
  const [quickSending, setQuickSending] = useState<string | null>(null)
  const handleQuickSend = async (task: NotificationTask) => {
    if (!task.clientEmail) {
      toast.error('No se encontró email del cliente')
      return
    }
    setQuickSending(task.id)
    try {
      const subject = STEP_SUBJECTS[task.step]?.(task.shipmentRef, task.containerNumber) || ''
      const body = STEP_TEMPLATES[task.step]?.(task) || ''
      const htmlBody = body.replace(/\n/g, '<br/>')
      await sendNotificationEmail(task.id, { to: task.clientEmail, subject, htmlBody })
      handleEmailSent(task.id)
      toast.success(`Email enviado a ${task.clientEmail}`)
    } catch (err: any) {
      toast.error(`Error: ${err.message}`)
    } finally {
      setQuickSending(null)
    }
  }

  // ── Render helpers ──
  const renderTaskCard = (task: NotificationTask, isOverdue: boolean = false) => {
    const photoCount = originPhotos.filter(p => p.shipmentRef === task.shipmentRef).length
    const reportCount = reports.filter(r => r.shipmentRef === task.shipmentRef).length

    return (
      <div
        key={task.id}
        className={`rounded-lg border p-4 ${
          isOverdue ? 'border-red-500/30 bg-red-500/5' :
          task.status === 'completed' ? 'border-green-500/20 bg-green-500/5 opacity-70' :
          'border-border bg-card'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">{STEP_ICONS[task.step]}</span>
              <span className="font-semibold text-sm">{task.shipmentRef}</span>
              <span className="text-muted-foreground text-xs">·</span>
              <span className="text-xs text-muted-foreground truncate">{task.cliente}</span>
              {task.containerNumber && (
                <Badge variant="outline" className="text-[10px] px-1.5 h-4">{task.containerNumber}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
              <span className="font-medium text-foreground">{STEP_LABELS[task.step]}</span>
              <span>·</span>
              <span>{isOverdue ? `Vencida (${task.dueDate})` : task.dueDate === today ? 'Hoy' : task.dueDate}</span>
              {task.clientEmail && <span>· {task.clientEmail}</span>}
            </div>

            {/* Checkboxes for departure */}
            {task.step === 'departure' && (
              <div className="flex items-center gap-4 mb-3">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={task.photosOk}
                    onChange={(e) => handleCheckbox(task.id, 'photosOk', e.target.checked)}
                    className="rounded"
                  />
                  <Camera size={14} />
                  Fotos {photoCount > 0 && <span className="text-muted-foreground">({photoCount})</span>}
                </label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={task.reportOk}
                    onChange={(e) => handleCheckbox(task.id, 'reportOk', e.target.checked)}
                    className="rounded"
                  />
                  <FileText size={14} />
                  Informe {reportCount > 0 && <span className="text-muted-foreground">({reportCount})</span>}
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  {task.emailSent ? <CheckCircle size={14} className="text-green-500" /> : <EnvelopeSimple size={14} />}
                  <span className={task.emailSent ? 'text-green-500' : ''}>
                    {task.emailSent ? 'Enviado' : 'Email'}
                  </span>
                </label>
              </div>
            )}

            {/* Checkboxes for border/fiscal — just email */}
            {task.step !== 'departure' && (
              <div className="flex items-center gap-2 mb-3">
                <label className="flex items-center gap-1.5 text-xs">
                  {task.emailSent ? <CheckCircle size={14} className="text-green-500" /> : <EnvelopeSimple size={14} />}
                  <span className={task.emailSent ? 'text-green-500' : ''}>
                    {task.emailSent ? 'Email enviado' : 'Email pendiente'}
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-1.5">
            {!task.emailSent && task.status === 'pending' && (
              task.step === 'departure' ? (
                // Departure: open dialog (has attachments to review)
                <Button
                  size="sm"
                  className="gap-1.5 text-xs bg-accent text-accent-foreground hover:bg-accent/90"
                  onClick={() => setEmailDialogTask(task)}
                >
                  <EnvelopeSimple size={14} weight="bold" />
                  Enviar
                </Button>
              ) : (
                // Border/Fiscal: quick send (1 click, no dialog)
                <Button
                  size="sm"
                  className="gap-1.5 text-xs bg-accent text-accent-foreground hover:bg-accent/90"
                  onClick={() => handleQuickSend(task)}
                  disabled={quickSending === task.id}
                >
                  {quickSending === task.id ? (
                    <><SpinnerGap size={14} className="animate-spin" /> Enviando...</>
                  ) : (
                    <><PaperPlaneTilt size={14} weight="bold" /> Enviar Rápido</>
                  )}
                </Button>
              )
            )}
            {task.status === 'pending' && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs text-muted-foreground"
                onClick={() => handleSkip(task.id)}
              >
                <SkipForward size={12} />
                Omitir
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <SpinnerGap size={32} className="animate-spin mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Cargando notificaciones...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── ZONA A: Confirmar Eventos ── */}
      {filteredSuggestions.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <BellRinging size={18} className="text-amber-500" />
                Confirmar Eventos
              </h3>
              <div className="relative w-48">
                <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  placeholder="Buscar REF..."
                  className="h-7 text-xs pl-8"
                />
              </div>
            </div>
            <div className="space-y-2">
              {filteredSuggestions.map((s) => {
                const key = `${s.shipmentRef}-${s.containerNumber}-${s.step}`
                const isConfirming = confirming === key
                return (
                  <div key={key} className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                    <div className="flex items-center gap-3">
                      <span>{STEP_ICONS[s.step]}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{s.shipmentRef}</span>
                          {s.containerNumber && <Badge variant="outline" className="text-[10px] h-4">{s.containerNumber}</Badge>}
                          <span className="text-xs text-muted-foreground">{s.cliente}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.label} · {STEP_LABELS[s.step]}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => handleConfirm(s.shipmentRef, s.containerNumber, s.step, s.salidaDate)}
                        disabled={isConfirming}
                      >
                        {isConfirming ? <SpinnerGap size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                        Confirmar
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── ZONA B: Pendientes de Notificar ── */}
      <Card>
        <CardContent className="pt-5">
          {/* Overdue */}
          {overdueTasks.length > 0 && (
            <div className="mb-5">
              <h4 className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Warning size={14} />
                Vencidas ({overdueTasks.length})
              </h4>
              <div className="space-y-2">
                {overdueTasks.map(t => renderTaskCard(t, true))}
              </div>
            </div>
          )}

          {/* Today */}
          {todayTasks.length > 0 && (
            <div className="mb-5">
              <h4 className="text-xs font-semibold text-amber-500 uppercase tracking-wider mb-2">
                Hoy ({todayTasks.length})
              </h4>
              <div className="space-y-2">
                {todayTasks.map(t => renderTaskCard(t))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {overdueTasks.length === 0 && todayTasks.length === 0 && filteredSuggestions.length === 0 && (
            <div className="text-center py-12">
              <CheckCircle size={48} className="mx-auto mb-3 text-green-500/50" />
              <p className="text-sm font-medium">Todo al día</p>
              <p className="text-xs text-muted-foreground mt-1">No hay notificaciones pendientes</p>
            </div>
          )}

          {/* Completed today */}
          {completedTodayTasks.length > 0 && (
            <div className="mt-4 border-t pt-4">
              <button
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                onClick={() => setShowCompleted(!showCompleted)}
              >
                <CheckCircle size={14} className="text-green-500" />
                Completadas hoy ({completedTodayTasks.length})
                <ArrowRight size={12} className={`transition-transform ${showCompleted ? 'rotate-90' : ''}`} />
              </button>
              {showCompleted && (
                <div className="space-y-2 mt-2">
                  {completedTodayTasks.map(t => renderTaskCard(t))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Email Dialog ── */}
      {emailDialogTask && (
        <NotificationEmailDialog
          task={emailDialogTask}
          open={!!emailDialogTask}
          onOpenChange={(open) => { if (!open) setEmailDialogTask(null) }}
          onEmailSent={handleEmailSent}
          originPhotos={originPhotos.filter(p => p.shipmentRef === emailDialogTask.shipmentRef)}
          reports={reports.filter(r => r.shipmentRef === emailDialogTask.shipmentRef)}
        />
      )}
    </div>
  )
}
