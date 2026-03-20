import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
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
import { PaperPlaneTilt, SpinnerGap, Camera, FileText, CheckCircle, Paperclip, Pencil } from '@phosphor-icons/react'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { NotificationTask, OriginPhoto, OperativeReport } from '@/lib/quotationTypes'
import { sendNotificationEmail, fetchReportFile, updateNotificationTask, saveClientEmailInline, fetchOriginPhotoFile } from '@/lib/dataClient'

interface NotificationEmailDialogProps {
  task: NotificationTask
  open: boolean
  onOpenChange: (open: boolean) => void
  onEmailSent: (taskId: string, threadId?: string) => void
  originPhotos: OriginPhoto[]
  reports: OperativeReport[]
}

export const STEP_SUBJECTS: Record<string, (ref: string, cntr: string) => string> = {
  departure: (ref, cntr) => `TWF - Salida ${cntr || 'carga'} - Ref ${ref}`,
  border: (ref, cntr) => `Re: TWF - Salida ${cntr || 'carga'} - Ref ${ref}`,
  fiscal: (ref, cntr) => `Re: TWF - Salida ${cntr || 'carga'} - Ref ${ref}`,
}

export const STEP_TEMPLATES: Record<string, (task: NotificationTask) => string> = {
  departure: (t) =>
`Estimado/a ${t.clientName || 'cliente'},

Le informamos que su carga ${t.shipmentRef}${t.containerNumber ? ` - contenedor ${t.containerNumber}` : ''} ha salido de Montevideo el día de hoy.
${t.containerNumber ? `\nContenedor: ${t.containerNumber}` : ''}
Saludos cordiales,
Brian Ridvanovich
Transit World Forwarding`,

  border: (t) =>
`Estimado/a ${t.clientName || 'cliente'},

Le informamos que su carga ${t.shipmentRef}${t.containerNumber ? ` - contenedor ${t.containerNumber}` : ''} ha cruzado la frontera.

Saludos cordiales,
Brian Ridvanovich
Transit World Forwarding`,

  fiscal: (t) =>
`Estimado/a ${t.clientName || 'cliente'},

Le informamos que su carga ${t.shipmentRef}${t.containerNumber ? ` - contenedor ${t.containerNumber}` : ''} ha llegado al depósito fiscal.

Saludos cordiales,
Brian Ridvanovich
Transit World Forwarding`,
}

export default function NotificationEmailDialog({
  task,
  open,
  onOpenChange,
  onEmailSent,
  originPhotos,
  reports,
}: NotificationEmailDialogProps) {
  const [body, setBody] = useState(STEP_TEMPLATES[task.step]?.(task) || '')
  const [sending, setSending] = useState(false)
  const [includePhotos, setIncludePhotos] = useState(true)
  const [includeReports, setIncludeReports] = useState(true)
  const [loadingAttachments, setLoadingAttachments] = useState(false)

  const [toOverride, setToOverride] = useState(task.clientEmail || '')
  const [editingTo, setEditingTo] = useState(!task.clientEmail)
  const to = toOverride || task.clientEmail || ''
  const subject = STEP_SUBJECTS[task.step]?.(task.shipmentRef, task.containerNumber) || ''
  const isDeparture = task.step === 'departure'

  // Reset body when task changes
  useEffect(() => {
    setBody(STEP_TEMPLATES[task.step]?.(task) || '')
    setToOverride(task.clientEmail || '')
    setEditingTo(!task.clientEmail)
    setIncludePhotos(true)
    setIncludeReports(true)
  }, [task.id])

  const handleSend = async () => {
    const sendTo = toOverride.trim() || to
    if (!sendTo) {
      toast.error('Ingresá al menos un email del cliente.')
      return
    }

    setSending(true)
    setLoadingAttachments(isDeparture && (includePhotos || includeReports))

    try {
      // Build HTML body
      let htmlBody = body.replace(/\n/g, '<br/>')

      const attachments: { name: string; type: string; data: string }[] = []

      if (isDeparture) {
        setLoadingAttachments(true)

        // Attach photos as real files (full resolution, not just thumbnails)
        if (includePhotos && originPhotos.length > 0) {
          htmlBody += '<br/><br/><strong>📷 Fotos de la carga adjuntas.</strong>'
          for (const photo of originPhotos) {
            try {
              const fullData = await fetchOriginPhotoFile(photo.id)
              if (fullData) {
                const base64 = fullData.includes(',') ? fullData.split(',')[1] : fullData
                attachments.push({
                  name: photo.fileName || `foto-${photo.id}.jpg`,
                  type: photo.fileType || 'image/jpeg',
                  data: base64,
                })
              }
            } catch { /* skip failed photo downloads */ }
          }
        }

        // Attach report PDFs
        if (includeReports && reports.length > 0) {
          for (const report of reports) {
            try {
              const fileData = await fetchReportFile(report.id)
              if (fileData) {
                const base64 = fileData.includes(',') ? fileData.split(',')[1] : fileData
                attachments.push({
                  name: report.fileName || `informe-${task.shipmentRef}.pdf`,
                  type: report.fileType || 'application/pdf',
                  data: base64,
                })
              }
            } catch { /* skip failed report downloads */ }
          }
        }
      }

      const sendTo = toOverride.trim() || to
      await sendNotificationEmail(task.id, {
        to: sendTo,
        subject,
        htmlBody,
        attachments: attachments.length > 0 ? attachments : undefined,
      })

      // If email was overridden, save it to the task + client record for future
      if (sendTo && sendTo !== task.clientEmail) {
        updateNotificationTask(task.id, { clientEmail: sendTo } as any).catch(() => {})
        if (task.cliente) saveClientEmailInline(task.cliente, sendTo).catch(() => {})
      }

      toast.success('Email enviado correctamente')
      onEmailSent(task.id)
    } catch (err: any) {
      toast.error(`Error al enviar: ${err.message}`)
    } finally {
      setSending(false)
      setLoadingAttachments(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PaperPlaneTilt size={20} className="text-accent" />
            Enviar Notificación — {task.shipmentRef}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Read-only email info */}
          <div className="rounded-lg border p-3 bg-muted/30 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground flex-shrink-0">Para</Label>
              {editingTo ? (
                <Input
                  value={toOverride}
                  onChange={(e) => setToOverride(e.target.value)}
                  placeholder="email@cliente.com, otro@empresa.com"
                  className="h-7 text-xs"
                  autoFocus
                />
              ) : (
                <button
                  className="flex items-center gap-1 text-sm font-medium hover:text-blue-400 transition-colors cursor-pointer"
                  onClick={() => setEditingTo(true)}
                >
                  {to}
                  <Pencil size={10} className="opacity-40" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Asunto</Label>
              <span className="text-xs text-muted-foreground truncate max-w-[300px]">{subject}</span>
            </div>
          </div>

          {/* Editable message */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Mensaje (editable)</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={7}
              className="text-sm"
            />
          </div>

          {/* Attachment toggles (departure only) */}
          {isDeparture && (originPhotos.length > 0 || reports.length > 0) && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Paperclip size={14} className="text-muted-foreground" />
                <span className="text-xs font-medium">Adjuntos</span>
              </div>

              {originPhotos.length > 0 && (
                <label className="flex items-center justify-between cursor-pointer hover:bg-muted/50 rounded p-1.5 -mx-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includePhotos}
                      onChange={(e) => setIncludePhotos(e.target.checked)}
                      className="rounded"
                    />
                    <Camera size={14} className="text-green-500" />
                    <span className="text-xs">
                      {originPhotos.length} foto{originPhotos.length > 1 ? 's' : ''} en origen
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[9px]">embebidas en HTML</Badge>
                </label>
              )}

              {reports.length > 0 && (
                <label className="flex items-center justify-between cursor-pointer hover:bg-muted/50 rounded p-1.5 -mx-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeReports}
                      onChange={(e) => setIncludeReports(e.target.checked)}
                      className="rounded"
                    />
                    <FileText size={14} className="text-blue-500" />
                    <span className="text-xs">
                      {reports.length} informe{reports.length > 1 ? 's' : ''} operativo{reports.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[9px]">PDF adjunto</Badge>
                </label>
              )}

              {/* Photo previews */}
              {includePhotos && originPhotos.length > 0 && (
                <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
                  {originPhotos.slice(0, 6).map((p) => (
                    <img
                      key={p.id}
                      src={p.thumbnailData}
                      alt={p.caption || ''}
                      className="w-12 h-12 rounded object-cover border flex-shrink-0"
                    />
                  ))}
                  {originPhotos.length > 6 && (
                    <div className="w-12 h-12 rounded border flex items-center justify-center text-[10px] text-muted-foreground flex-shrink-0">
                      +{originPhotos.length - 6}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Loading indicator */}
          {loadingAttachments && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <SpinnerGap size={14} className="animate-spin" />
              Descargando adjuntos...
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || !(toOverride.trim() || to)}
            className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
          >
            {sending ? (
              <><SpinnerGap size={18} className="animate-spin" /> {loadingAttachments ? 'Preparando...' : 'Enviando...'}</>
            ) : (
              <><PaperPlaneTilt size={18} /> Enviar</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
