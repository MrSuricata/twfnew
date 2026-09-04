/**
 * "¿Algo no funcionó?" — la caja de comentarios de los portales de partners.
 *
 * Brian está dando de alta los usuarios reales de GODILCO, PLANIR y los
 * transportes (04/09/2026). La primera semana de uso es la única en la que la
 * fricción se ve: después el usuario se acostumbra al problema y deja de
 * nombrarlo. El encuadre es ANGOSTO a propósito — "¿algo no funcionó?", no
 * "sugerencias": en fase de prueba la gente reporta problemas concretos.
 * Spec: docs/superpowers/specs/2026-09-04-caja-comentarios-partners-design.md
 *
 * Tres piezas, en este orden:
 *  1. La RESPUESTA del equipo, arriba del portal. Si nadie contesta, dejan de
 *     escribir a la segunda vez; y si la respuesta hay que ir a buscarla, es
 *     como si no estuviera. Se ve al entrar y se apaga con "Listo".
 *  2. El BOTÓN, fijo y discreto, en el armazón que ya comparten los dos
 *     portales (PartnerDashboardShell): aparece en depósito y transporte sin
 *     duplicar nada.
 *  3. El MODAL: una sola caja de texto y el "¿en qué estabas?" ya completado.
 *     Sin categorías, sin campos extra — cada campo más es una excusa para no
 *     escribir.
 *
 * El contexto (pantalla, ref de la carga que tenía a mano, navegador y tamaño
 * de pantalla) se captura SOLO: "no me dejó marcar el retiro" sin eso no se
 * puede reproducir, y los depósitos entran desde el celular, parados en el
 * predio, donde aparece la mitad de los problemas.
 *
 * Las reglas (validación, contexto) viven en `lib/partnerFeedback.ts`; este
 * archivo pinta y llama a la API.
 */
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ChatCircleDots, PaperPlaneTilt, CheckCircle, CircleNotch } from '@phosphor-icons/react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import PanelCard, { PanelFila } from './PanelCard'
import { fetchPartnerFeedback, enviarPartnerFeedback } from '@/lib/dataClient'
import {
  armarContexto, conRespuesta, validarTexto, TOPE_TEXTO, TOPE_PANTALLA,
  type PartnerComentario,
} from '@/lib/partnerFeedback'
import { refEnFoco } from '@/lib/refEnFoco'

/** Ids de las respuestas que el partner ya vio. Es una comodidad de ESTE
 *  navegador (como el resto de las preferencias locales del portal): si se
 *  pierde, la respuesta se muestra otra vez — molesta, no rompe. */
const LS_VISTAS = 'twf-feedback-vistas'

/** Cuánto queda el agradecimiento antes de cerrar solo. */
const GRACIAS_MS = 1800

function leerVistas(): string[] {
  try {
    const raw = localStorage.getItem(LS_VISTAS)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : []
  } catch {
    return []
  }
}

function guardarVistas(ids: string[]): void {
  try { localStorage.setItem(LS_VISTAS, JSON.stringify(ids.slice(-50))) } catch { /* incógnito / sin storage */ }
}

/**
 * Lo que el equipo le contestó, arriba del portal. Se pinta aparte del resto
 * para poder mirarlo en un test sin abrir el modal (el repo corre vitest en
 * `node`, sin DOM: un diálogo cerrado no renderiza nada).
 */
export function RespuestasDelEquipo({ respuestas, onVista }: {
  respuestas: PartnerComentario[]
  onVista: (id: string) => void
}) {
  if (respuestas.length === 0) return null
  return (
    <PanelCard
      tono="ok"
      icono={<ChatCircleDots size={22} weight="duotone" />}
      titulo={respuestas.length === 1 ? 'El equipo respondió tu comentario' : 'El equipo respondió tus comentarios'}
      contador={respuestas.length}
    >
      {respuestas.map(c => (
        <PanelFila
          key={c.id}
          accion={(
            <Button variant="outline" size="sm" className="h-8" onClick={() => onVista(c.id)}>
              Listo
            </Button>
          )}
        >
          <p className="text-sm text-muted-foreground italic">“{c.texto}”</p>
          <p className="text-sm font-medium text-foreground">{c.respuesta}</p>
        </PanelFila>
      ))}
    </PanelCard>
  )
}

export interface CuerpoCajaProps {
  texto: string
  donde: string
  enviando: boolean
  /** Ya se mandó: agradecimiento en vez del formulario. */
  enviado: boolean
  /** Lo que ya escribió y le contestaron, para no repetir el mismo comentario. */
  respuestas: PartnerComentario[]
  onTexto: (v: string) => void
  onDonde: (v: string) => void
  onEnviar: () => void
  onCancelar: () => void
}

/**
 * El cuerpo del modal: UNA caja de texto y el "¿en qué estabas?" ya completado.
 * Sin categorías ni campos extra — cada campo más es una excusa para no
 * escribir. Va aparte del diálogo para poder renderizarlo en los tests.
 */
export function CuerpoCaja({
  texto, donde, enviando, enviado, respuestas, onTexto, onDonde, onEnviar, onCancelar,
}: CuerpoCajaProps) {
  const largo = texto.trim().length
  const pasado = largo > TOPE_TEXTO
  return (
    <PanelCard
      tono="info"
      icono={<ChatCircleDots size={22} weight="duotone" />}
      titulo="¿Algo no funcionó?"
      subtitulo="Contanos qué te pasó o qué tuviste que rehacer. Lo lee el equipo."
    >
      {enviado ? (
        <div className="px-4 py-8 text-center" data-testid="comentario-enviado">
          <CheckCircle size={36} weight="fill" className="mx-auto mb-2 text-emerald-600" />
          <p className="text-base font-semibold">¡Gracias!</p>
          <p className="text-sm text-muted-foreground">Lo lee el equipo. Si hace falta, te responden por acá.</p>
        </div>
      ) : (
        <div className="space-y-4 px-4 py-4">
          <div className="space-y-1.5">
            <label htmlFor="comentario-texto" className="text-sm font-medium">¿Qué pasó?</label>
            <Textarea
              id="comentario-texto"
              autoFocus
              rows={5}
              value={texto}
              onChange={e => onTexto(e.target.value)}
              maxLength={TOPE_TEXTO}
              placeholder="Ej.: apreté “Retiré” y no pasó nada; tuve que cargar el stock dos veces…"
              className="text-base"
            />
            <p className={`text-right text-xs tabular-nums ${pasado ? 'text-destructive' : 'text-muted-foreground'}`}>
              {largo}/{TOPE_TEXTO}
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="comentario-donde" className="text-sm font-medium">¿En qué estabas?</label>
            <Input
              id="comentario-donde"
              value={donde}
              onChange={e => onDonde(e.target.value)}
              maxLength={TOPE_PANTALLA}
              placeholder="La pantalla donde te pasó"
            />
            <p className="text-xs text-muted-foreground">
              Ya lo completamos con la pantalla en la que estás. Corregilo si te pasó en otra.
            </p>
          </div>

          {respuestas.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lo que te respondieron</p>
              {respuestas.slice(0, 3).map(c => (
                <div key={c.id} className="text-sm">
                  <p className="text-muted-foreground italic">“{c.texto}”</p>
                  <p className="font-medium">{c.respuesta}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" disabled={enviando} onClick={onCancelar}>Cancelar</Button>
            <Button disabled={enviando || largo === 0 || pasado} onClick={onEnviar}>
              {enviando
                ? <CircleNotch size={16} className="mr-1.5 animate-spin" />
                : <PaperPlaneTilt size={16} weight="fill" className="mr-1.5" />}
              Enviar
            </Button>
          </div>
        </div>
      )}
    </PanelCard>
  )
}

export interface CajaComentariosProps {
  /** Pantalla actual: precarga el "¿en qué estabas?" (editable). */
  pantalla: string
  /** Vista previa (/ui o "Ver como"): se ve todo, no se manda ni se pide nada. */
  preview?: boolean
}

export default function CajaComentarios({ pantalla, preview = false }: CajaComentariosProps) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [donde, setDonde] = useState(pantalla)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [mios, setMios] = useState<PartnerComentario[]>([])
  const [vistas, setVistas] = useState<string[]>(() => leerVistas())

  const cargar = useCallback(async () => {
    try {
      setMios(await fetchPartnerFeedback())
    } catch (err) {
      // Silencio a propósito: es una caja secundaria. Un hipo de red acá no
      // puede tirarle un cartel de error encima al que está trabajando.
      console.warn('[comentarios] no se pudieron leer los propios:', (err as Error)?.message)
    }
  }, [])

  useEffect(() => { if (!preview) void cargar() }, [cargar, preview])

  // Si cambia la pantalla mientras no está escribiendo, el "¿en qué estabas?"
  // sigue diciendo la verdad.
  useEffect(() => { if (!abierto) setDonde(pantalla) }, [pantalla, abierto])

  const respuestas = conRespuesta(mios)
  const sinVer = respuestas.filter(c => !vistas.includes(c.id))

  const marcarVistas = (ids: string[]) => {
    const next = Array.from(new Set([...vistas, ...ids]))
    setVistas(next)
    guardarVistas(next)
  }

  const abrir = () => {
    setEnviado(false)
    setDonde(pantalla)
    setAbierto(true)
    // Al abrir se dan por vistas: las está leyendo acá adentro.
    if (sinVer.length) marcarVistas(sinVer.map(c => c.id))
  }

  const enviar = async () => {
    const v = validarTexto(texto)
    if (!v.ok) { toast.error(v.error); return }
    if (preview) {
      toast.info('Vista previa', { description: 'Acá el comentario le llega al equipo, que lo lee y responde desde su HOY.' })
      setTexto('')
      setEnviado(true)
      setTimeout(() => { setAbierto(false); setEnviado(false) }, GRACIAS_MS)
      return
    }
    setEnviando(true)
    try {
      // El contexto se arma recién ahora: el tamaño de pantalla y la carga que
      // tenía a mano son los del momento en que escribió, no los del montaje.
      const contexto = armarContexto({
        pantalla: donde,
        ruta: typeof window !== 'undefined' ? window.location.pathname : '',
        ref: refEnFoco(),
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        ancho: typeof window !== 'undefined' ? window.innerWidth : 0,
        alto: typeof window !== 'undefined' ? window.innerHeight : 0,
      })
      const creado = await enviarPartnerFeedback({ texto: v.texto, contexto })
      setMios(prev => [creado, ...prev.filter(c => c.id !== creado.id)])
      setTexto('')
      setEnviado(true)
      // Agradecimiento y cierre: nadie quiere quedarse mirando un formulario.
      setTimeout(() => { setAbierto(false); setEnviado(false) }, GRACIAS_MS)
    } catch (err) {
      toast.error('No se pudo mandar el comentario', {
        description: (err as Error)?.message || 'Probá de nuevo en un momento.',
      })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      {/* 1 · La respuesta del equipo, sin ir a buscarla. */}
      <RespuestasDelEquipo respuestas={sinVer} onVista={id => marcarVistas([id])} />

      {/* 2 · El botón: fijo, chico y siempre a mano. */}
      <button
        type="button"
        onClick={abrir}
        data-testid="boton-comentarios"
        title="Contanos si algo no funcionó"
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2.5 text-sm font-semibold text-foreground shadow-lg backdrop-blur transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChatCircleDots size={18} weight="duotone" />
        ¿Algo no funcionó?
        {sinVer.length > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[11px] font-bold text-white">
            {sinVer.length}
          </span>
        )}
      </button>

      {/* 3 · El modal: una caja de texto y nada más. */}
      <Dialog open={abierto} onOpenChange={o => { if (!enviando) { setAbierto(o); if (!o) setEnviado(false) } }}>
        <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden border-0">
          {/* El título visible lo pone PanelCard; estos dos son para el lector
              de pantalla (Radix exige un título para anunciar el diálogo). */}
          <DialogTitle className="sr-only">¿Algo no funcionó?</DialogTitle>
          <DialogDescription className="sr-only">
            Contanos qué no funcionó o qué tuviste que rehacer. Lo lee el equipo.
          </DialogDescription>
          <CuerpoCaja
            texto={texto}
            donde={donde}
            enviando={enviando}
            enviado={enviado}
            respuestas={respuestas}
            onTexto={setTexto}
            onDonde={setDonde}
            onEnviar={() => { void enviar() }}
            onCancelar={() => setAbierto(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
