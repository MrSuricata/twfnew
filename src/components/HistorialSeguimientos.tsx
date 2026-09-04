// Pestaña "Historial" de Seguimientos — qué updates salieron y qué día.
//
// Pedido de Brian (18/08/2026). El dato ya se venía guardando en
// `seguimientos_log` desde el rediseño del 17/08; lo que faltaba era poder
// verlo TODO junto: hasta ahora solo se veía carga por carga, desplegando el
// botón 🕐 de cada fila de la cola.
//
// Abre filtrado en "Update enviado" (la lista corta que se pidió), pero los
// otros tres tipos están a un click: el cambio de ETA es lo que EXPLICA el
// update de ese día. Toda la lógica de agrupar/filtrar vive en
// lib/historialSeguimientos.ts, testeada aparte.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  PaperPlaneTilt, ArrowsLeftRight, ArrowsClockwise, ArrowUUpLeft,
  MagnifyingGlass, Warning, SpinnerGap, ClockCounterClockwise,
} from '@phosphor-icons/react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { fetchSeguimientosLog } from '@/lib/dataClient'
import { fmtDateDMY } from '@/lib/format'
import {
  TIPOS_TODOS, SOLO_ENVIADOS, ETIQUETA_TIPO,
  armarEventos, filtrarEventos, agruparPorDia,
  type Evento, type FilaLog, type TipoEvento,
} from '@/lib/historialSeguimientos'
import type { AreaSeguimiento } from '@/lib/seguimientos'

const hoyIso = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Fecha de corte para el período elegido. null = sin corte (todo). */
const desdeDe = (dias: number | null): string | undefined => {
  if (dias === null) return undefined
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const PERIODOS: { dias: number | null; label: string }[] = [
  { dias: 30, label: '30 días' },
  { dias: 90, label: '90 días' },
  { dias: null, label: 'Todo' },
]

const ICONO: Record<string, typeof PaperPlaneTilt> = {
  enviado: PaperPlaneTilt,
  eta: ArrowsLeftRight,
  trasbordo: ArrowsClockwise,
  deshecho: ArrowUUpLeft,
}

const COLOR: Record<string, string> = {
  enviado: 'text-emerald-600',
  eta: 'text-blue-600',
  trasbordo: 'text-amber-600',
  deshecho: 'text-muted-foreground',
}

interface Props {
  /** REF (mayúsculas) → cliente. El log no guarda el cliente: se pega desde
   *  las cargas que la pestaña ya tiene en memoria. */
  clientePorRef: Map<string, string>
  /** REF (mayúsculas) → área. Ídem: el log tampoco guarda la modalidad. */
  areaPorRef?: Map<string, AreaSeguimiento>
  /** Área elegida arriba: el historial muestra lo de esa cola. */
  area?: AreaSeguimiento
  /** Abre la ficha completa de la carga. */
  onOpenDetail?: (ref: string) => void
  /** Cambia cuando la cola registra algo nuevo, para refrescar sin recargar. */
  recargarToken?: number
}

export default function HistorialSeguimientos({ clientePorRef, areaPorRef, area, onOpenDetail, recargarToken }: Props) {
  const [filas, setFilas] = useState<FilaLog[] | null>(null)
  const [error, setError] = useState('')
  const [truncado, setTruncado] = useState(false)
  const [dias, setDias] = useState<number | null>(30)
  const [tipos, setTipos] = useState<string[]>(SOLO_ENVIADOS)
  const [texto, setTexto] = useState('')

  const cargar = useCallback(() => {
    setFilas(null)
    setError('')
    fetchSeguimientosLog(undefined, { desde: desdeDe(dias), limit: 5000 })
      .then(({ rows, truncado }) => {
        setFilas(rows as unknown as FilaLog[])
        setTruncado(truncado)
      })
      .catch(() => {
        setFilas([])
        setError('No se pudo cargar el historial. Probá de nuevo en un momento.')
      })
  }, [dias])

  useEffect(() => { cargar() }, [cargar, recargarToken])

  const eventos = useMemo(
    () => armarEventos(filas || [], clientePorRef, areaPorRef),
    [filas, clientePorRef, areaPorRef],
  )
  const visibles = useMemo(
    () => filtrarEventos(eventos, { tipos, texto, area }),
    [eventos, tipos, texto, area],
  )
  const grupos = useMemo(() => agruparPorDia(visibles, hoyIso()), [visibles])

  const toggleTipo = (t: TipoEvento) => {
    setTipos(prev => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]))
  }

  const cargando = filas === null

  const linea = (e: Evento, i: number) => {
    const Icono = ICONO[e.tipo] || ClockCounterClockwise
    const cntrClick = onOpenDetail ? 'hover:bg-muted/60 cursor-pointer' : ''
    return (
      <div
        key={e.id || `${e.ref}-${e.orden}-${i}`}
        className={`flex items-start gap-2.5 px-2 py-2 rounded-md transition-colors ${cntrClick}`}
        onClick={onOpenDetail ? () => onOpenDetail(e.ref) : undefined}
      >
        <Icono size={15} weight="fill" className={`mt-0.5 shrink-0 ${COLOR[e.tipo] || 'text-muted-foreground'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold text-sm">{e.ref}</span>
            {e.cliente && <span className="text-xs text-muted-foreground truncate">{e.cliente}</span>}
            <span className="text-[11px] text-muted-foreground/80">{ETIQUETA_TIPO[e.tipo] || e.tipo}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {e.tipo === 'enviado' && (
              <>ETA comunicada: <b className="text-foreground/80">{fmtDateDMY(e.eta_nueva || '') || '—'}</b></>
            )}
            {e.tipo === 'eta' && (
              <>ETA {fmtDateDMY(e.eta_anterior || '') || '—'} → <b className="text-foreground/80">{fmtDateDMY(e.eta_nueva || '') || '—'}</b></>
            )}
            {e.tipo === 'trasbordo' && <>Cambió de buque — el update lo avisa</>}
            {e.tipo === 'deshecho' && <>Se deshizo el update: no salió</>}
            {e.buque && <span className="text-muted-foreground/70"> · {e.buque}</span>}
            {e.usuario && <span className="text-muted-foreground/70"> · {e.usuario}</span>}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Filtros ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <MagnifyingGlass size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="Ref, cliente o buque…"
            className="pl-8 h-9"
            aria-label="Buscar en el historial"
          />
        </div>
        <div className="flex gap-1">
          {PERIODOS.map(p => (
            <button
              key={p.label}
              type="button"
              onClick={() => setDias(p.dias)}
              className={`h-9 px-2.5 rounded-md text-xs font-medium transition-colors ${
                dias === p.dias ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TIPOS_TODOS.map(t => {
          const activo = tipos.includes(t)
          const Icono = ICONO[t]
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggleTipo(t)}
              aria-pressed={activo}
              className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-medium border transition-colors ${
                activo
                  ? 'border-primary/40 bg-primary/10 text-foreground'
                  : 'border-border bg-transparent text-muted-foreground hover:bg-muted/60'
              }`}
            >
              <Icono size={12} weight="fill" className={activo ? COLOR[t] : ''} />
              {ETIQUETA_TIPO[t]}
            </button>
          )
        })}
        {tipos.length === 0 && (
          <span className="text-[11px] text-muted-foreground self-center ml-1">
            sin filtro: se muestran todos
          </span>
        )}
      </div>

      {/* ── Avisos ── */}
      {truncado && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2">
          <Warning size={16} weight="fill" className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            El período elegido tiene más movimientos de los que se pueden traer de una.
            Achicá el período para ver el resto.
          </p>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/[0.06] px-3 py-2">
          <Warning size={16} weight="fill" className="text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* ── Lista ── */}
      {cargando && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
          <SpinnerGap size={16} className="animate-spin" /> Cargando historial…
        </p>
      )}

      {!cargando && visibles.length === 0 && !error && (
        <p className="text-sm text-muted-foreground py-6 text-center">
          {eventos.length === 0
            ? 'Todavía no hay movimientos registrados en este período.'
            : 'Ningún movimiento coincide con la búsqueda.'}
        </p>
      )}

      {grupos.map(g => (
        <div key={g.dia || 'sin-fecha'} className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {g.etiqueta} <span className="font-normal normal-case">({g.eventos.length})</span>
          </h3>
          <Card className="overflow-hidden">
            <CardContent className="py-1.5 px-1.5 divide-y divide-border/50">
              {g.eventos.map(linea)}
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  )
}
