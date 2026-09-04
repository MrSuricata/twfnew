/**
 * Card "Comentarios de partners" en HOY FCL, al lado de "Avisos de partners".
 *
 * El depósito y el transporte escriben "algo no funcionó" desde su portal
 * (spec docs/superpowers/specs/2026-09-04-caja-comentarios-partners-design.md)
 * y acá el equipo lo lee: quién, cuándo, qué escribió y DESDE DÓNDE — pantalla,
 * carga que tenía a mano, navegador y tamaño de pantalla. Ese contexto es la
 * mitad del valor: "no me dejó marcar el retiro" sin él no se puede reproducir,
 * y buena parte de los problemas aparecen en el celular, en el predio.
 *
 * Dos acciones y ninguna más: responder en una línea (si nadie contesta, dejan
 * de escribir a la segunda vez) o marcar visto. Los SIN LEER cuentan en el
 * header con su chip, así que plegada la card sigue avisando (D7 del rediseño).
 *
 * Si no hay nada para atender la card no se renderiza: cero ruido. Y si la API
 * todavía no expone `partner-feedback` (404), fetchPartnerFeedback devuelve []
 * y queda oculta sin error — mergear esto antes que la API no rompe HOY.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ChatCircleDots, Check, CircleNotch, Warehouse, Truck as TruckIcon, CaretDown, CaretRight } from '@phosphor-icons/react'
import CardHoy, { ChipUrgente, chipsHeader } from './hoy/CardHoy'
import { PanelFila, FilaTitulo, FilaDatos, Chip } from './partner/PanelCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { CardsPlegadas } from '@/lib/cardsPlegadas'
import { fetchPartnerFeedback, responderPartnerFeedback } from '@/lib/dataClient'
import {
  pendientesDeRespuesta, sinLeer, quienComento, textoContexto, TOPE_RESPUESTA,
  type PartnerComentario,
} from '@/lib/partnerFeedback'
import { haceCuanto } from '@/lib/avisosPartners'

/** Cada cuánto se refresca sin que nadie toque nada (igual que los avisos). */
export const COMENTARIOS_REFRESH_MS = 60_000

/** Quién escribió, con el ícono de su rol. */
export function QuienEscribio({ comentario: c }: { comentario: PartnerComentario }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-bold" title={c.partnerName || c.partnerEmail}>
      {c.partnerRole === 'transport'
        ? <TruckIcon size={15} weight="fill" />
        : <Warehouse size={15} weight="fill" />}
      {quienComento(c)}
    </span>
  )
}

export interface FilaComentarioProps {
  comentario: PartnerComentario
  ahora: Date
  /** Este comentario está en curso: se deshabilitan SUS botones, no todos. */
  ocupado: boolean
  /** Está escribiendo la respuesta de este comentario. */
  respondiendo: boolean
  borrador: string
  onBorrador: (v: string) => void
  onAbrirRespuesta: () => void
  onCancelarRespuesta: () => void
  onResponder: () => void
  onVisto: () => void
}

/** Una fila de la card. Sin hooks, para poder renderizarla en un test. */
export function FilaComentario({
  comentario: c, ahora, ocupado, respondiendo, borrador,
  onBorrador, onAbrirRespuesta, onCancelarRespuesta, onResponder, onVisto,
}: FilaComentarioProps) {
  const contexto = textoContexto(c.contexto)
  return (
    <PanelFila
      accion={respondiendo ? undefined : (
        <>
          <Button size="sm" className="h-8 text-xs" disabled={ocupado} onClick={onAbrirRespuesta}>
            {ocupado ? <CircleNotch size={14} className="animate-spin" /> : 'Responder'}
          </Button>
          {c.estado === 'nuevo' && (
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={ocupado} onClick={onVisto}>
              <Check size={14} weight="bold" className="mr-1" />
              Visto
            </Button>
          )}
        </>
      )}
    >
      <FilaTitulo>
        <QuienEscribio comentario={c} />
        {c.estado === 'nuevo' && <Chip clase="bg-amber-100 text-amber-900 border-amber-300">sin leer</Chip>}
        <span className="text-xs text-muted-foreground" title={new Date(c.createdAt).toLocaleString('es-UY')}>
          {haceCuanto(c.createdAt, ahora)}
        </span>
      </FilaTitulo>

      <p className="text-sm text-foreground">“{c.texto}”</p>

      <FilaDatos>
        {contexto
          ? <span title="Desde dónde escribió">{contexto}</span>
          : <span className="italic">sin contexto</span>}
      </FilaDatos>

      {respondiendo && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Input
            autoFocus
            value={borrador}
            maxLength={TOPE_RESPUESTA}
            onChange={e => onBorrador(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onResponder() }}
            placeholder="Una línea alcanza: qué pasó y qué hacemos."
            className="h-9 flex-1 min-w-[16rem]"
          />
          <Button size="sm" className="h-9" disabled={ocupado || !borrador.trim()} onClick={onResponder}>
            {ocupado ? <CircleNotch size={14} className="mr-1 animate-spin" /> : null}
            Responder
          </Button>
          <Button size="sm" variant="outline" className="h-9" disabled={ocupado} onClick={onCancelarRespuesta}>
            Cancelar
          </Button>
        </div>
      )}
    </PanelFila>
  )
}

export default function ComentariosPartnersCard({ plegadas }: { plegadas: CardsPlegadas }) {
  const [comentarios, setComentarios] = useState<PartnerComentario[]>([])
  const [cargado, setCargado] = useState(false)
  const [enCurso, setEnCurso] = useState<string | null>(null)
  const [respondiendo, setRespondiendo] = useState<string | null>(null)
  const [borrador, setBorrador] = useState('')
  const [verRespondidos, setVerRespondidos] = useState(false)
  const [ahora, setAhora] = useState(() => new Date())
  // Para no repetir el toast de error en cada tick del polling.
  const ultimoFallo = useRef(false)

  const refrescar = useCallback(async (silencioso = false) => {
    try {
      setComentarios(await fetchPartnerFeedback())
      setAhora(new Date())
      ultimoFallo.current = false
    } catch (err) {
      if (!silencioso || !ultimoFallo.current) {
        toast.error('No se pudieron cargar los comentarios de partners', { description: (err as Error)?.message || 'sin detalles' })
      }
      ultimoFallo.current = true
    } finally {
      setCargado(true)
    }
  }, [])

  useEffect(() => {
    void refrescar()
    const timer = setInterval(() => { void refrescar(true) }, COMENTARIOS_REFRESH_MS)
    return () => clearInterval(timer)
  }, [refrescar])

  const pendientes = useMemo(() => pendientesDeRespuesta(comentarios), [comentarios])
  const nuevos = useMemo(() => sinLeer(comentarios).length, [comentarios])
  const respondidos = useMemo(
    () => comentarios.filter(c => c.estado === 'respondido')
      .sort((a, b) => String(b.respondidoAt || '').localeCompare(String(a.respondidoAt || ''))),
    [comentarios],
  )

  const actuar = useCallback(async (c: PartnerComentario, accion: 'visto' | 'responder', texto?: string) => {
    if (enCurso) return
    setEnCurso(c.id)
    try {
      const actualizado = await responderPartnerFeedback(c.id, accion, texto)
      setComentarios(prev => prev.map(x => (x.id === actualizado.id ? actualizado : x)))
      if (accion === 'responder') {
        toast.success(`Le respondiste a ${quienComento(c)}`, { description: 'Lo ve al entrar a su portal.' })
        setRespondiendo(null)
        setBorrador('')
      }
      await refrescar(true)
    } catch (err) {
      toast.error(accion === 'responder' ? 'No se pudo responder' : 'No se pudo marcar visto', {
        description: (err as Error)?.message || 'sin detalles',
      })
    } finally {
      setEnCurso(null)
    }
  }, [enCurso, refrescar])

  // Sin nada para atender, la card no existe (aunque haya respondidos: el
  // rastro se mira mientras hay algo que hacer).
  if (!cargado || pendientes.length === 0) return null

  return (
    <CardHoy
      id="comentarios-partners"
      plegadas={plegadas}
      icono={<ChatCircleDots size={22} weight="duotone" />}
      contador={pendientes.length}
      extras={chipsHeader(
        nuevos > 0 && <ChipUrgente tono="aviso">{nuevos} sin leer</ChipUrgente>,
      )}
    >
      <div className="divide-y divide-border">
        {pendientes.map(c => (
          <FilaComentario
            key={c.id}
            comentario={c}
            ahora={ahora}
            ocupado={enCurso === c.id}
            respondiendo={respondiendo === c.id}
            borrador={borrador}
            onBorrador={setBorrador}
            onAbrirRespuesta={() => { setRespondiendo(c.id); setBorrador('') }}
            onCancelarRespuesta={() => { setRespondiendo(null); setBorrador('') }}
            onResponder={() => {
              const t = borrador.trim()
              if (!t) { toast.error('Escribí la respuesta: el partner la va a ver'); return }
              void actuar(c, 'responder', t)
            }}
            onVisto={() => { void actuar(c, 'visto') }}
          />
        ))}
      </div>

      {respondidos.length > 0 && (
        <div className="border-t border-border px-4 py-2.5">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setVerRespondidos(v => !v)}
            aria-expanded={verRespondidos}
          >
            {verRespondidos ? <CaretDown size={12} /> : <CaretRight size={12} />}
            {respondidos.length} respondido{respondidos.length === 1 ? '' : 's'}
          </button>
          {verRespondidos && (
            <ul className="mt-2 space-y-1.5">
              {respondidos.map(c => (
                <li key={c.id} className="text-xs text-muted-foreground">
                  <b>{quienComento(c)}</b>: “{c.texto}” → {c.respuesta}
                  {c.respondidoPor ? <span className="ml-1">({c.respondidoPor})</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </CardHoy>
  )
}
