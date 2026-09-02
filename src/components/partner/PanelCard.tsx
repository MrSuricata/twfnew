/**
 * La piel común de las cards de los portales (depósito, transporte, cliente).
 *
 * Brian (02/09/2026): "está como mucho cúmulo de datos y líneas de texto en
 * los portales; los peores son depósito y transporte. Que se vea de una forma
 * más distinguida, que los encabezados tengan alguna forma de diferenciación
 * —como los chips de colores de los días de la semana—, un poco más separado,
 * y letras un poco más grandes para que se lean bien".
 *
 * De ahí las tres decisiones de este archivo:
 *  · Cada card tiene su COLOR. El encabezado va tintado y con una barra
 *    arriba, así se distinguen de un vistazo y no son seis bloques grises.
 *  · La escala arranca en `text-sm`: nada de text-[10px] para un dato que hay
 *    que leer en un depósito, con el celular en una mano.
 *  · Las filas respiran (py-3) y se apilan en dos renglones: identidad arriba,
 *    números abajo. Antes eran diez datos en una sola línea.
 */
import { useState, type ReactNode } from 'react'
import { CaretDown } from '@phosphor-icons/react'

export type TonoPanel = 'info' | 'aviso' | 'alerta' | 'ok' | 'neutro'

interface Tono {
  /** Barra superior. */
  barra: string
  /** Fondo del encabezado. */
  header: string
  /** Borde de la card. */
  borde: string
  /** Caja del ícono. */
  icono: string
  /** Pill del contador. */
  pill: string
  /** Color del título. */
  titulo: string
}

const TONOS: Record<TonoPanel, Tono> = {
  info: {
    barra: 'bg-sky-500', header: 'bg-sky-50', borde: 'border-sky-200',
    icono: 'bg-sky-500/15 text-sky-700', pill: 'bg-sky-600 text-white', titulo: 'text-sky-900',
  },
  aviso: {
    barra: 'bg-amber-500', header: 'bg-amber-50', borde: 'border-amber-200',
    icono: 'bg-amber-500/15 text-amber-700', pill: 'bg-amber-500 text-white', titulo: 'text-amber-900',
  },
  alerta: {
    barra: 'bg-red-500', header: 'bg-red-50', borde: 'border-red-200',
    icono: 'bg-red-500/15 text-red-700', pill: 'bg-red-600 text-white', titulo: 'text-red-900',
  },
  ok: {
    barra: 'bg-emerald-500', header: 'bg-emerald-50', borde: 'border-emerald-200',
    icono: 'bg-emerald-500/15 text-emerald-700', pill: 'bg-emerald-600 text-white', titulo: 'text-emerald-900',
  },
  neutro: {
    barra: 'bg-slate-400', header: 'bg-slate-50', borde: 'border-slate-200',
    icono: 'bg-slate-500/15 text-slate-700', pill: 'bg-slate-600 text-white', titulo: 'text-slate-900',
  },
}

export default function PanelCard({
  tono = 'neutro', icono, titulo, subtitulo, contador, vacio, children,
}: {
  tono?: TonoPanel
  icono: ReactNode
  titulo: string
  subtitulo?: string
  /** Número del pill. Si es 0 se muestra igual (dice "no hay nada pendiente"). */
  contador?: number
  /** Texto cuando no hay filas. */
  vacio?: string
  children?: ReactNode
}) {
  const t = TONOS[tono]
  const sinFilas = contador === 0
  return (
    <section className={`rounded-xl border-2 ${t.borde} bg-card overflow-hidden shadow-sm`}>
      <div className={`h-1.5 ${t.barra}`} />
      <header className={`${t.header} px-4 py-3.5 flex items-center gap-3 flex-wrap`}>
        <div className={`p-2 rounded-lg shrink-0 ${t.icono}`}>{icono}</div>
        <div className="min-w-0 flex-1">
          <h2 className={`titulo-med text-lg font-bold leading-tight ${t.titulo}`}>{titulo}</h2>
          {subtitulo && <p className="text-sm text-muted-foreground mt-0.5">{subtitulo}</p>}
        </div>
        {contador !== undefined && (
          <span className={`shrink-0 inline-flex items-center justify-center min-w-9 h-9 px-3 rounded-full text-base font-bold tabular-nums ${t.pill}`}>
            {contador}
          </span>
        )}
      </header>
      {sinFilas && vacio
        ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">{vacio}</p>
        : <div className="divide-y divide-border">{children}</div>}
    </section>
  )
}

/** Una fila del panel: identidad arriba, números abajo, acción a la derecha. */
export function PanelFila({ children, accion, tinte }: {
  children: ReactNode
  accion?: ReactNode
  /** Fondo especial (p. ej. LIBRE vencido). */
  tinte?: string
}) {
  return (
    <div className={`px-4 py-3.5 flex flex-wrap items-start gap-x-4 gap-y-2 ${tinte || ''}`}>
      <div className="min-w-0 flex-1 space-y-1.5">{children}</div>
      {accion && <div className="shrink-0 flex items-center gap-2 pt-0.5">{accion}</div>}
    </div>
  )
}

/** Renglón de identidad: ref, cliente, contenedor, chips. Letra grande. */
export function FilaTitulo({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">{children}</div>
}

/** Renglón de datos: fechas, medidas, destino. Un escalón más chico, pero legible. */
export function FilaDatos({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">{children}</div>
}

/** La referencia de la carga: lo primero que se busca con la vista. */
export function Ref({ children }: { children: ReactNode }) {
  return <span className="ref-med text-base font-bold">{children}</span>
}

/** Chip de color (depósito, terminal, operativa). */
export function Chip({ children, clase, title }: { children: ReactNode; clase?: string; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-block rounded-md border px-2 py-0.5 text-xs font-bold whitespace-nowrap ${clase || 'bg-slate-100 text-slate-700 border-slate-300'}`}
    >
      {children}
    </span>
  )
}

/** Dato con su etiqueta arriba: "LLEGA · 03/09". Se lee sin adivinar. */
export function Dato({ label, children, fuerte }: { label: string; children: ReactNode; fuerte?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground/80">{label}</span>
      <span className={fuerte ? 'text-sm font-bold text-foreground tabular-nums' : 'text-sm tabular-nums'}>{children}</span>
    </span>
  )
}

/** Igual que PanelCard pero plegable: lo usan el Plan de carga y las cards del
 *  transporte, que se abren y cierran. Misma piel, mismo color por card. */
export function PanelPlegable({
  tono = 'neutro', icono, titulo, subtitulo, contador, abiertaPorDefecto = true, children,
}: {
  tono?: TonoPanel
  icono: ReactNode
  titulo: string
  subtitulo?: ReactNode
  contador?: number
  abiertaPorDefecto?: boolean
  children: ReactNode
}) {
  const [abierta, setAbierta] = useState(abiertaPorDefecto)
  const t = TONOS[tono]
  return (
    <section className={`rounded-xl border-2 ${t.borde} bg-card overflow-hidden shadow-sm`}>
      <div className={`h-1.5 ${t.barra}`} />
      <button
        type="button"
        onClick={() => setAbierta(v => !v)}
        aria-expanded={abierta}
        className={`${t.header} w-full px-4 py-3.5 flex items-center gap-3 text-left transition-opacity hover:opacity-90`}
      >
        <div className={`p-2 rounded-lg shrink-0 ${t.icono}`}>{icono}</div>
        <div className="min-w-0 flex-1">
          <h2 className={`titulo-med text-lg font-bold leading-tight ${t.titulo}`}>{titulo}</h2>
          {subtitulo && <p className="text-sm text-muted-foreground mt-0.5">{subtitulo}</p>}
        </div>
        {contador !== undefined && (
          <span className={`shrink-0 inline-flex items-center justify-center min-w-9 h-9 px-3 rounded-full text-base font-bold tabular-nums ${t.pill}`}>
            {contador}
          </span>
        )}
        <CaretDown size={18} weight="bold" className={`shrink-0 text-muted-foreground transition-transform ${abierta ? 'rotate-180' : ''}`} />
      </button>
      {abierta && children}
    </section>
  )
}
