/**
 * Avisos del calendario: feriados, paros y cualquier cosa que frene un día.
 *
 * Van aparte de los eventos de carga porque no cuelgan de ninguna REF. Acá
 * viven el fetch, la banda que se pinta en el día y el formulario para
 * cargarlos.
 */
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { fetchEventosCalendario, saveEventoCalendario, deleteEventoCalendario } from '@/lib/dataClient'
import {
  TIPO_EVENTO_CAL,
  TIPOS_EVENTO_CAL,
  eventosDelDia,
  type EventoCalendario,
  type TipoEventoCal,
} from '@/lib/calendarioEventos'

// ── Traer y refrescar ──────────────────────────────────────────────────

export function useEventosCalendario(activo = true) {
  const [eventos, setEventos] = useState<EventoCalendario[]>([])

  const recargar = useCallback(async () => {
    if (!activo) return
    try {
      setEventos(await fetchEventosCalendario())
    } catch {
      // Un calendario sin avisos es peor que uno con avisos viejos, pero
      // romper la agenda entera por esto sería peor todavía.
      setEventos([])
    }
  }, [activo])

  useEffect(() => { void recargar() }, [recargar])

  return { eventos, recargar }
}

// ── La banda que se pinta en el día ────────────────────────────────────

interface BandaProps {
  avisos: EventoCalendario[]
  /** Compacta para la grilla de mes/semana; entera para la vista de día. */
  compacta?: boolean
  onAbrir?: (aviso: EventoCalendario) => void
}

export function BandaAvisos({ avisos, compacta = false, onAbrir }: BandaProps) {
  if (avisos.length === 0) return null

  if (compacta) {
    return (
      <div className="space-y-0.5 mb-1">
        {avisos.map(a => {
          const cfg = TIPO_EVENTO_CAL[a.tipo]
          return (
            <div
              key={a.id}
              onClick={onAbrir ? e => { e.stopPropagation(); onAbrir(a) } : undefined}
              title={a.detalle || a.titulo}
              className={`flex items-center gap-1 rounded border px-1 py-0.5 text-[9px] font-semibold leading-tight ${cfg.bg} ${cfg.texto} ${onAbrir ? 'cursor-pointer' : ''}`}
            >
              <span className="shrink-0">{cfg.emoji}</span>
              <span className="truncate">{a.titulo}</span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {avisos.map(a => {
        const cfg = TIPO_EVENTO_CAL[a.tipo]
        return (
          <div
            key={a.id}
            onClick={onAbrir ? () => onAbrir(a) : undefined}
            className={`rounded-xl border-2 px-4 py-3 ${cfg.bg} ${cfg.texto} ${onAbrir ? 'cursor-pointer' : ''}`}
          >
            <div className="flex items-center gap-2">
              <span>{cfg.emoji}</span>
              <span className="text-[11px] font-bold uppercase tracking-widest">{cfg.label}</span>
            </div>
            <div className="mt-1 font-semibold">{a.titulo}</div>
            {a.detalle && <div className="mt-0.5 text-sm opacity-80">{a.detalle}</div>}
          </div>
        )
      })}
    </div>
  )
}

// ── Alta y edición ─────────────────────────────────────────────────────

interface DialogProps {
  abierto: boolean
  onCerrar: () => void
  /** Día preseleccionado (YYYY-MM-DD) al crear uno nuevo. */
  fecha?: string
  /** Aviso existente a editar; sin esto el formulario da de alta. */
  aviso?: EventoCalendario | null
  onGuardado: () => void
}

export function AvisoCalendarioDialog({ abierto, onCerrar, fecha, aviso, onGuardado }: DialogProps) {
  const [f, setF] = useState('')
  const [tipo, setTipo] = useState<TipoEventoCal>('aviso')
  const [titulo, setTitulo] = useState('')
  const [detalle, setDetalle] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Cada vez que se abre, el formulario arranca de lo que corresponda: el
  // aviso que se está editando, o el día en el que se hizo clic.
  useEffect(() => {
    if (!abierto) return
    setF(aviso?.fecha || fecha || new Date().toISOString().slice(0, 10))
    setTipo(aviso?.tipo || 'aviso')
    setTitulo(aviso?.titulo || '')
    setDetalle(aviso?.detalle || '')
  }, [abierto, aviso, fecha])

  const guardar = async () => {
    if (!titulo.trim()) { toast.error('Poné un título'); return }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) { toast.error('Elegí un día'); return }
    setGuardando(true)
    try {
      await saveEventoCalendario({ id: aviso?.id, fecha: f, tipo, titulo: titulo.trim(), detalle: detalle.trim() })
      toast.success(aviso ? 'Aviso actualizado' : 'Aviso agregado al calendario')
      onGuardado()
      onCerrar()
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo guardar el aviso')
    } finally {
      setGuardando(false)
    }
  }

  const borrar = async () => {
    if (!aviso) return
    setGuardando(true)
    try {
      await deleteEventoCalendario(aviso.id)
      toast.success('Aviso borrado')
      onGuardado()
      onCerrar()
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo borrar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={o => { if (!o) onCerrar() }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{aviso ? 'Editar aviso' : 'Aviso en el calendario'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="aviso-fecha">Día</Label>
            <Input id="aviso-fecha" type="date" value={f} onChange={e => setF(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <div className="flex gap-2">
              {TIPOS_EVENTO_CAL.map(t => {
                const cfg = TIPO_EVENTO_CAL[t]
                const elegido = tipo === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm font-semibold transition-colors
                      ${elegido ? `${cfg.bg} ${cfg.texto}` : 'border-border text-muted-foreground hover:bg-muted/50'}`}
                  >
                    {cfg.emoji} {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="aviso-titulo">Título</Label>
            <Input
              id="aviso-titulo"
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              placeholder="Paro en TCP"
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="aviso-detalle">Detalle (opcional)</Label>
            <Textarea
              id="aviso-detalle"
              value={detalle}
              onChange={e => setDetalle(e.target.value)}
              placeholder="Qué esperar ese día: demoras en retiros, terminal cerrada…"
              rows={3}
              maxLength={1000}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {aviso ? (
            <Button variant="ghost" onClick={borrar} disabled={guardando} className="text-destructive">
              Borrar
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { eventosDelDia }
