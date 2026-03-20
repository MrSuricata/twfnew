import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { PaperPlaneTilt, SpinnerGap, Camera, FileText } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { NotificationTask, OriginPhoto, OperativeReport } from '@/lib/quotationTypes'
import { sendNotificationEmail } from '@/lib/dataClient'

interface NotificationEmailDialogProps {
  task: NotificationTask
  open: boolean
  onOpenChange: (open: boolean) => void
  onEmailSent: (taskId: string) => void
  originPhotos: OriginPhoto[]
  reports: OperativeReport[]
}

const STEP_SUBJECTS: Record<string, (ref: string, cntr: string) => string> = {
  departure: (ref, cntr) => `TWF - Salida ${cntr || 'carga'} - Ref ${ref}`,
  border: (ref, cntr) => `TWF - Cruce frontera ${cntr || 'carga'} - Ref ${ref}`,
  fiscal: (ref, cntr) => `TWF - Llegada fiscal ${cntr || 'carga'} - Ref ${ref}`,
}

const STEP_TEMPLATES: Record<string, (task: NotificationTask) => string> = {
  departure: (t) =>
`Estimado/a ${t.clientName || 'cliente'},

Le informamos que su carga ${t.shipmentRef}${t.containerNumber ? ` - contenedor ${t.containerNumber}` : ''} ha salido de Montevideo el día de hoy.

${t.containerNumber ? `Contenedor: ${t.containerNumber}` : ''}

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
  const [to, setTo] = useState(task.clientEmail || '')
  const [subject, setSubject] = useState(
    STEP_SUBJECTS[task.step]?.(task.shipmentRef, task.containerNumber) || ''
  )
  const [body, setBody] = useState(
    STEP_TEMPLATES[task.step]?.(task) || ''
  )
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!to.trim()) {
      toast.error('Ingresá el email del destinatario')
      return
    }
    if (!subject.trim()) {
      toast.error('Ingresá un asunto')
      return
    }

    setSending(true)
    try {
      // Convert plain text to simple HTML
      const htmlBody = body.replace(/\n/g, '<br/>')

      await sendNotificationEmail(task.id, {
        to: to.trim(),
        subject: subject.trim(),
        htmlBody,
      })

      toast.success('Email enviado correctamente')
      onEmailSent(task.id)
    } catch (err: any) {
      toast.error(`Error al enviar: ${err.message}`)
    } finally {
      setSending(false)
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
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Para</Label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="cliente@email.com"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Asunto</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Mensaje</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="text-sm"
            />
          </div>

          {/* Attachments summary (departure only) */}
          {task.step === 'departure' && (originPhotos.length > 0 || reports.length > 0) && (
            <div className="rounded-lg border p-3 bg-muted/50">
              <p className="text-xs font-medium mb-2 text-muted-foreground">Adjuntos disponibles</p>
              <div className="flex gap-3 text-xs">
                {originPhotos.length > 0 && (
                  <span className="flex items-center gap-1 text-green-500">
                    <Camera size={14} />
                    {originPhotos.length} foto{originPhotos.length > 1 ? 's' : ''}
                  </span>
                )}
                {reports.length > 0 && (
                  <span className="flex items-center gap-1 text-blue-500">
                    <FileText size={14} />
                    {reports.length} informe{reports.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Los adjuntos se envían a través del workflow de n8n
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || !to.trim()}
            className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
          >
            {sending ? (
              <><SpinnerGap size={18} className="animate-spin" /> Enviando...</>
            ) : (
              <><PaperPlaneTilt size={18} /> Enviar Email</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
