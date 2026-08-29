import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash, PencilSimple, Newspaper, Megaphone } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { fetchNoticiasAdmin, saveNoticia, deleteNoticia } from '@/lib/dataClient'
import { type Noticia, rowToNoticia, esVigente, CATEGORIAS, categoriaMeta, tituloPlano } from '@/lib/noticias'

// ── Editor del Diario logístico (Brian 28/08) ───────────────────────────
// Vive en Admin → Contenido web. Lo cargado acá sale en la landing (sección
// Novedades + alerta 1×/día si se marca) y en /novedades. Reglas: vigencia
// (lo vencido se archiva solo de la portada) y SIN números de tarifas.

interface Form {
  id: string
  titulo: string
  bajada: string
  cuerpo: string
  categoria: string
  imagenUrl: string
  vigenteHasta: string
  alerta: boolean
  activo: boolean
  estilo: string
  kicker: string
  kickerExtra: string
  subtitulo: string
  mensaje: string
  linkUrl: string
}

const FORM_VACIO: Form = {
  id: '', titulo: '', bajada: '', cuerpo: '', categoria: 'general',
  imagenUrl: '', vigenteHasta: '', alerta: false, activo: true,
  estilo: '', kicker: '', kickerExtra: '', subtitulo: '', mensaje: '', linkUrl: '',
}

/** Variantes visuales del slide en el carrusel de la portada. */
const ESTILOS: { value: string; label: string }[] = [
  { value: 'auto', label: 'Según la categoría' },
  { value: 'violeta', label: 'Violeta (fondo oscuro)' },
  { value: 'celeste', label: 'Celeste (fondo claro)' },
  { value: 'actualizacion', label: 'Actualización (sin título grande)' },
  { value: 'papel', label: 'Banda violeta sobre papel' },
]

const hoyISO = () => new Date().toISOString().slice(0, 10)

export default function NoticiasEditor() {
  const [noticias, setNoticias] = useState<Noticia[]>([])
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState<Form>(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)

  const recargar = () => {
    fetchNoticiasAdmin()
      .then(rows => setNoticias(rows.map(rowToNoticia)))
      .catch(() => toast.error('No se pudieron cargar las novedades'))
  }
  useEffect(() => { recargar() }, [])

  const nueva = () => { setForm(FORM_VACIO); setAbierto(true) }
  const editar = (n: Noticia) => {
    setForm({
      id: n.id, titulo: n.titulo, bajada: n.bajada, cuerpo: n.cuerpo,
      categoria: n.categoria, imagenUrl: n.imagenUrl,
      vigenteHasta: (n.vigenteHasta || '').slice(0, 10), alerta: n.alerta, activo: n.activo,
      estilo: n.estilo, kicker: n.kicker, kickerExtra: n.kickerExtra,
      subtitulo: n.subtitulo, mensaje: n.mensaje, linkUrl: n.linkUrl,
    })
    setAbierto(true)
  }

  const guardar = async () => {
    if (!form.titulo.trim()) { toast.error('El título es obligatorio'); return }
    // Regla de la casa: sin números de tarifas en contenido publicado.
    const textoPublico = [form.titulo, form.bajada, form.cuerpo, form.kicker, form.subtitulo, form.mensaje].join(' ')
    if (/(u\$s|usd|us\$)\s*\d/i.test(textoPublico)) {
      toast.error('Sin montos de fletes en las noticias — hablalo en cualitativo (el número va en la cotización)')
      return
    }
    if (form.linkUrl.trim() && !/^https?:\/\//i.test(form.linkUrl.trim())) {
      toast.error('El link de la nota tiene que empezar con https://')
      return
    }
    setGuardando(true)
    try {
      await saveNoticia({
        ...(form.id ? { id: form.id } : {}),
        titulo: form.titulo.trim(),
        bajada: form.bajada.trim(),
        cuerpo: form.cuerpo.trim(),
        categoria: form.categoria,
        imagenUrl: form.imagenUrl.trim(),
        vigenteHasta: form.vigenteHasta,
        alerta: form.alerta,
        activo: form.activo,
        estilo: form.estilo === 'auto' ? '' : form.estilo,
        kicker: form.kicker.trim(),
        kickerExtra: form.kickerExtra.trim(),
        subtitulo: form.subtitulo.trim(),
        mensaje: form.mensaje.trim(),
        linkUrl: form.linkUrl.trim(),
      })
      toast.success(form.id ? 'Novedad actualizada' : 'Novedad publicada')
      setAbierto(false)
      recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  const borrar = async (n: Noticia) => {
    if (!window.confirm(`¿Borrar "${n.titulo}"?`)) return
    try {
      await deleteNoticia(n.id)
      toast.success('Novedad borrada')
      recargar()
    } catch {
      toast.error('No se pudo borrar')
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Newspaper size={19} weight="duotone" /> Diario logístico
        </CardTitle>
        <Button size="sm" onClick={nueva}><Plus size={15} className="mr-1" /> Nueva novedad</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground -mt-2 mb-3">
          Salen en la landing y en /novedades. Con vigencia vencida se archivan solas.
          Marcá "alerta" para que aparezca al abrir la web (1 vez por día por visitante).
        </p>
        {noticias.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">Sin novedades cargadas todavía.</p>
        )}
        {noticias.map(n => {
          const vigente = esVigente(n, hoyISO())
          return (
            <div key={n.id} className={`flex items-start gap-3 rounded-lg border p-3 ${vigente ? '' : 'opacity-55'}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${categoriaMeta(n.categoria).chip}`}>
                    {categoriaMeta(n.categoria).label}
                  </span>
                  {n.alerta && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-med-aviso-texto"><Megaphone size={11} weight="fill" /> alerta diaria</span>}
                  {/* Estado como pill del sistema (handoff 03-admin · Contenido web) */}
                  {n.activo && vigente && <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-med-ok-suave text-med-ok">Publicada</span>}
                  {!n.activo && <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-med-lila text-med-gris">Borrador</span>}
                  {n.activo && !vigente && <span className="text-[10px] font-semibold text-muted-foreground">vencida (archivada)</span>}
                </div>
                <p className="mt-1 font-semibold text-sm leading-snug text-med-texto">{tituloPlano(n.titulo)}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {(n.publicadaAt || '').slice(0, 10)}{n.vigenteHasta ? ` · vigente hasta ${n.vigenteHasta.slice(0, 10)}` : ' · sin vencimiento'}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editar(n)} aria-label="Editar"><PencilSimple size={15} /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => borrar(n)} aria-label="Borrar"><Trash size={15} /></Button>
              </div>
            </div>
          )
        })}
      </CardContent>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar novedad' : 'Nueva novedad'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="not-titulo">Título</Label>
              <Input id="not-titulo" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Tifón en China: cierres portuarios en Shanghai y Ningbo" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORIAS).map(([k, m]) => (
                      <SelectItem key={k} value={k}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="not-vig">Vigente hasta</Label>
                <Input id="not-vig" type="date" value={form.vigenteHasta} onChange={e => setForm(f => ({ ...f, vigenteHasta: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="not-bajada">Bajada (el resumen que se ve en la portada)</Label>
              <Textarea id="not-bajada" rows={2} value={form.bajada} onChange={e => setForm(f => ({ ...f, bajada: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="not-cuerpo">Cuerpo (opcional — se lee en /novedades)</Label>
              <Textarea id="not-cuerpo" rows={5} value={form.cuerpo} onChange={e => setForm(f => ({ ...f, cuerpo: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="not-img">Imagen (URL — de Canva, por ejemplo)</Label>
              <Input id="not-img" value={form.imagenUrl} onChange={e => setForm(f => ({ ...f, imagenUrl: e.target.value }))} placeholder="Si queda vacío usa la ilustración de la categoría" />
            </div>

            <div className="rounded-lg border p-3 space-y-3">
              <p className="text-sm font-medium">Slide de portada</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Estilo</Label>
                  <Select value={form.estilo || 'auto'} onValueChange={v => setForm(f => ({ ...f, estilo: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ESTILOS.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="not-link">Link de la nota fuente</Label>
                  <Input id="not-link" value={form.linkUrl} onChange={e => setForm(f => ({ ...f, linkUrl: e.target.value }))} placeholder="https://… (vacío = /novedades)" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="not-kicker">Etiqueta naranja</Label>
                  <Input id="not-kicker" value={form.kicker} onChange={e => setForm(f => ({ ...f, kicker: e.target.value }))} placeholder="Aviso operativo" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="not-kicker2">Texto al lado (fecha, país…)</Label>
                  <Input id="not-kicker2" value={form.kickerExtra} onChange={e => setForm(f => ({ ...f, kickerExtra: e.target.value }))} placeholder="Vacío = fecha de publicación" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="not-sub">Destacado secundario</Label>
                <Input id="not-sub" value={form.subtitulo} onChange={e => setForm(f => ({ ...f, subtitulo: e.target.value }))} placeholder="Pill celeste bajo el título / 2º párrafo en Actualización" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="not-msj">Mensaje de la derecha</Label>
                <Textarea id="not-msj" rows={2} value={form.mensaje} onChange={e => setForm(f => ({ ...f, mensaje: e.target.value }))} placeholder="Corto. Se puede **resaltar** entre asteriscos." />
              </div>
              <p className="text-xs text-muted-foreground">En el título, una barra | corta en dos líneas (la 2ª va en celeste).</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="pr-3">
                <Label>📣 Mostrar como alerta al abrir la web</Label>
                <p className="text-xs text-muted-foreground">Aparece 1 vez por día por visitante mientras esté vigente</p>
              </div>
              <Switch checked={form.alerta} onCheckedChange={v => setForm(f => ({ ...f, alerta: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>Activa (visible en la web)</Label>
              <Switch checked={form.activo} onCheckedChange={v => setForm(f => ({ ...f, activo: v }))} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
              <Button onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : (form.id ? 'Guardar cambios' : 'Publicar')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
