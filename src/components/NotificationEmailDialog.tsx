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

// Signature image hosted on the TWF Vercel deployment
const FIRMA_URL = 'https://twfnew-c7v2.vercel.app/images/FIRMA.png'

const EMAIL_SIGNATURE = `
<div style="margin-top:24px;border-top:2px solid #e8762b;padding-top:16px;">
  <img src="${FIRMA_URL}" alt="Brian Ridvanovich - TWF General Manager" width="500" style="width:500px;max-width:100%;height:auto;" />
</div>`

function buildEmailHtml(greeting: string, bodyLines: string[]): string {
  return `
<div style="font-family:Arial,sans-serif;color:#333;max-width:600px;">
  <p style="font-size:14px;line-height:1.6;margin:0 0 12px;">
    ${greeting}
  </p>
  ${bodyLines.map(l => `<p style="font-size:14px;line-height:1.6;margin:0 0 8px;">${l}</p>`).join('')}
  <p style="font-size:14px;line-height:1.6;margin:16px 0 0;">
    Saludos cordiales,
  </p>
  ${EMAIL_SIGNATURE}
</div>`
}

// Determine cargo description based on operativa type
function cargoLabel(t: NotificationTask): string {
  const op = (t.operativa || 'CONTENEDOR').toUpperCase()
  const cntr = t.containerNumber ? ` <strong>${t.containerNumber}</strong>` : ''
  if (op === 'CONTENEDOR') {
    return `el contenedor${cntr}`
  }
  // Trasiego, carga a piso, desconsolidación = mercadería
  return `la mercadería del contenedor${cntr}`
}

export const STEP_TEMPLATES: Record<string, (task: NotificationTask) => string> = {
  departure: (t) => {
    const cargo = cargoLabel(t)
    return buildEmailHtml(
      `Estimado/a <strong>${t.clientName || 'cliente'}</strong>,`,
      [
        `Le informamos que ${cargo} de su carga <strong>${t.shipmentRef}</strong> ha salido de Montevideo el día de hoy.`,
      ]
    )
  },

  border: (t) => {
    const cargo = cargoLabel(t)
    return buildEmailHtml(
      `Estimado/a <strong>${t.clientName || 'cliente'}</strong>,`,
      [
        `Le informamos que ${cargo} de su carga <strong>${t.shipmentRef}</strong> ha cruzado la frontera.`,
      ]
    )
  },

  fiscal: (t) => {
    const cargo = cargoLabel(t)
    return buildEmailHtml(
      `Estimado/a <strong>${t.clientName || 'cliente'}</strong>,`,
      [
        `Le informamos que ${cargo} de su carga <strong>${t.shipmentRef}</strong> ha llegado al depósito fiscal.`,
      ]
    )
  },
}

export default function NotificationEmailDialog({
  task,
  open,
  onOpenChange,
  onEmailSent,
  originPhotos,
  reports,
}: NotificationEmailDialogProps) {
  // Plain text for editing, HTML template for actual send
  const getPlainText = (t: NotificationTask) => {
    const op = (t.operativa || 'CONTENEDOR').toUpperCase()
    const cntr = t.containerNumber ? ` ${t.containerNumber}` : ''
    const cargo = op === 'CONTENEDOR' ? `el contenedor${cntr}` : `la mercadería del contenedor${cntr}`
    const messages: Record<string, string> = {
      departure: `Estimado/a ${t.clientName || 'cliente'},\n\nLe informamos que ${cargo} de su carga ${t.shipmentRef} ha salido de Montevideo el día de hoy.`,
      border: `Estimado/a ${t.clientName || 'cliente'},\n\nLe informamos que ${cargo} de su carga ${t.shipmentRef} ha cruzado la frontera.`,
      fiscal: `Estimado/a ${t.clientName || 'cliente'},\n\nLe informamos que ${cargo} de su carga ${t.shipmentRef} ha llegado al depósito fiscal.`,
    }
    return messages[t.step] || ''
  }
  const [body, setBody] = useState(getPlainText(task))
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
    setBody(getPlainText(task))
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
      // Build HTML body with signature
      const bodyHtml = body.replace(/\n/g, '<br/>')
      let htmlBody = `
<div style="font-family:Arial,sans-serif;color:#333;max-width:600px;">
  <p style="font-size:14px;line-height:1.6;">${bodyHtml}</p>
  <p style="font-size:14px;line-height:1.6;margin:16px 0 0;">Saludos cordiales,</p>
  ${EMAIL_SIGNATURE}
</div>`

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
                console.log(`[email] Photo ${photo.fileName}: ${base64.length} chars`)
                attachments.push({
                  name: photo.fileName || `foto-${photo.id}.jpg`,
                  type: photo.fileType || 'image/jpeg',
                  data: base64,
                })
              }
            } catch (err) {
              console.error(`[email] Failed to download photo ${photo.id}:`, err)
            }
          }
        }

        // Attach report PDFs FIRST (priority over photos)
        if (includeReports && reports.length > 0) {
          for (const report of reports) {
            try {
              console.log(`[email] Downloading report: ${report.id} (${report.fileName})`)
              const fileData = await fetchReportFile(report.id)
              if (fileData) {
                const base64 = fileData.includes(',') ? fileData.split(',')[1] : fileData
                console.log(`[email] Report downloaded: ${base64.length} chars base64`)
                attachments.unshift({ // unshift = put at beginning (priority)
                  name: report.fileName || `informe-${task.shipmentRef}.pdf`,
                  type: report.fileType || 'application/pdf',
                  data: base64,
                })
              } else {
                console.warn(`[email] Report ${report.id} returned null fileData`)
              }
            } catch (err) {
              console.error(`[email] Failed to download report ${report.id}:`, err)
            }
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
                  <Badge variant="outline" className="text-[9px]">fotos adjuntas</Badge>
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
