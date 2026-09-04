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
 *
 * Rediseño 04/09 (spec D1/D7): esta base pasa a ser LA piel de todo el portal
 * del cliente, del modal rápido y de las cards de HOY. Por eso acá se agregan
 * capacidades (plegado controlado, chips en el header, pill exportado, tonos
 * de Mediterránea) sin decisiones visuales nuevas: los pasos 1 a 4 las usan.
 */
import { useState, type ReactNode } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import { useBrand } from '@/lib/brand'

export type TonoPanel = 'info' | 'aviso' | 'alerta' | 'ok' | 'neutro'

export interface ClasesTono {
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

/** Tonos de TWF: la escala de Tailwind de siempre. */
const TONOS: Record<TonoPanel, ClasesTono> = {
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

/**
 * Los mismos cinco tonos dichos con los tokens del manual de Mediterránea
 * (`@theme` de src/main.css, docs/DISENO-MED.md). Nada de hex sueltos:
 *  · info   → tarjeta informativa (`med-info-tinte` / `med-info-borde`), acento celeste.
 *  · aviso  → tarjeta de riesgo (`med-aviso-*`): el naranja SOLO señala riesgo.
 *  · alerta → `med-error` (el rojo del manual es "check fallido"). El manual no
 *             trae tintes para el error, así que fondo y borde se DERIVAN con
 *             opacidad del mismo token (como `border-med-ok/25` en HoyCliente),
 *             no se inventa un hex. Si el manual suma `med-error-tinte`, va acá.
 *  · ok     → `med-ok` con su fondo suave (`med-ok-suave`).
 *  · neutro → cabecera `med-fondo`, borde `med-borde`, pill neutro del manual
 *             (fondo `med-pastel`, texto `med-texto`).
 * Los pills del contador van sólidos (violeta / naranja / rojo / verde) para
 * que se lean sobre la cabecera tintada; el pill neutro sigue al manual.
 */
const TONOS_MED: Record<TonoPanel, ClasesTono> = {
  info: {
    barra: 'bg-med-celeste', header: 'bg-med-info-tinte', borde: 'border-med-info-borde',
    icono: 'bg-med-celeste/40 text-med-violeta', pill: 'bg-med-violeta text-white', titulo: 'text-med-violeta',
  },
  aviso: {
    barra: 'bg-med-aviso', header: 'bg-med-aviso-tinte', borde: 'border-med-aviso-borde',
    icono: 'bg-med-aviso/15 text-med-aviso-texto', pill: 'bg-med-aviso text-white', titulo: 'text-med-aviso-texto',
  },
  alerta: {
    barra: 'bg-med-error', header: 'bg-med-error/5', borde: 'border-med-error/30',
    icono: 'bg-med-error/15 text-med-error', pill: 'bg-med-error text-white', titulo: 'text-med-error',
  },
  ok: {
    barra: 'bg-med-ok', header: 'bg-med-ok-suave', borde: 'border-med-ok/25',
    icono: 'bg-med-ok/15 text-med-ok', pill: 'bg-med-ok text-white', titulo: 'text-med-ok',
  },
  neutro: {
    barra: 'bg-med-gris-suave', header: 'bg-med-fondo', borde: 'border-med-borde',
    icono: 'bg-med-lila text-med-violeta', pill: 'bg-med-pastel text-med-texto', titulo: 'text-med-violeta',
  },
}

/** Las clases de un tono según la marca. Pura, para testear el mapeo sin render. */
export function clasesTono(tono: TonoPanel, med: boolean): ClasesTono {
  return (med ? TONOS_MED : TONOS)[tono]
}

/** El tono resuelto para la marca activa (`useBrand`): TWF conserva su
 *  estética; bajo Mediterránea salen los tokens del manual. */
function useTono(tono: TonoPanel): ClasesTono {
  return clasesTono(tono, useBrand().id === 'med')
}

/** El pill del contador. Exportado para que los pasos siguientes no lo copien
 *  (spec 04/09: "nadie más define una card"). `clase` pisa el color del tono. */
export function PillConteo({ children, tono = 'neutro', clase }: {
  children: ReactNode
  tono?: TonoPanel
  clase?: string
}) {
  const t = useTono(tono)
  return (
    <span className={`shrink-0 inline-flex items-center justify-center min-w-9 h-9 px-3 rounded-full text-base font-bold tabular-nums ${clase || t.pill}`}>
      {children}
    </span>
  )
}

/** Los chips del header ("3 para reagendar", "2 avisar cliente"). Van entre
 *  el título y el contador. En el panel plegable viven DENTRO del botón de
 *  plegado, así que tienen que ser contenido no interactivo (Chip, spans):
 *  un botón adentro de otro botón no es HTML válido. */
function ExtrasHeader({ children }: { children: ReactNode }) {
  return <span className="flex flex-wrap items-center justify-end gap-1.5">{children}</span>
}

export default function PanelCard({
  tono = 'neutro', icono, titulo, subtitulo, contador, extras, vacio, children,
}: {
  tono?: TonoPanel
  icono: ReactNode
  titulo: string
  subtitulo?: string
  /** Número del pill. Si es 0 se muestra igual (dice "no hay nada pendiente"). */
  contador?: number
  /** Chips del header, entre el título y el contador. */
  extras?: ReactNode
  /** Texto cuando no hay filas. */
  vacio?: string
  children?: ReactNode
}) {
  const t = useTono(tono)
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
        {extras && <ExtrasHeader>{extras}</ExtrasHeader>}
        {contador !== undefined && <PillConteo tono={tono}>{contador}</PillConteo>}
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

/**
 * Igual que PanelCard pero plegable: lo usan el Plan de carga, las cards del
 * transporte y (desde el rediseño 04/09, D7) las cards de HOY. Misma piel,
 * mismo color por card.
 *
 * Dos modos:
 *  · Libre (default): abre y cierra sola, arrancando en `abiertaPorDefecto`.
 *  · Controlado: si viene `abierta`, manda el padre; `onToggle` recibe el
 *    estado que el usuario pidió. Así HOY guarda la preferencia por operador
 *    en `user_prefs` y la card no se reabre sola.
 *
 * Plegada SIGUE avisando (regla de Brian: plegar no esconde lo urgente): el
 * header con contador y `extras` se pinta siempre; solo se ocultan los hijos.
 */
export function PanelPlegable({
  tono = 'neutro', icono, titulo, subtitulo, contador, extras, abiertaPorDefecto = true, abierta, onToggle, children,
}: {
  tono?: TonoPanel
  icono: ReactNode
  titulo: string
  subtitulo?: ReactNode
  contador?: number
  /** Chips del header, entre el título y el contador. Visibles aun plegada. */
  extras?: ReactNode
  abiertaPorDefecto?: boolean
  /** Modo controlado: si viene, el estado lo decide el padre. */
  abierta?: boolean
  /** Se llama con el estado pedido (true = abrir) en cada toque del header. */
  onToggle?: (abierta: boolean) => void
  children: ReactNode
}) {
  const [interna, setInterna] = useState(abiertaPorDefecto)
  const controlada = abierta !== undefined
  const estaAbierta = controlada ? abierta : interna
  const t = useTono(tono)
  const alternar = () => {
    const proxima = !estaAbierta
    if (!controlada) setInterna(proxima)
    onToggle?.(proxima)
  }
  return (
    <section className={`rounded-xl border-2 ${t.borde} bg-card overflow-hidden shadow-sm`}>
      <div className={`h-1.5 ${t.barra}`} />
      <button
        type="button"
        onClick={alternar}
        aria-expanded={estaAbierta}
        // `flex-wrap` como en PanelCard: con chips en el header y la card en una
        // columna angosta (HOY en 3 columnas), sin esto los chips —que son
        // `whitespace-nowrap`— aplastan el título hasta partirlo en tres renglones.
        className={`${t.header} w-full px-4 py-3.5 flex flex-wrap items-center gap-3 text-left transition-opacity hover:opacity-90`}
      >
        <div className={`p-2 rounded-lg shrink-0 ${t.icono}`}>{icono}</div>
        <div className="min-w-0 flex-1">
          <h2 className={`titulo-med text-lg font-bold leading-tight ${t.titulo}`}>{titulo}</h2>
          {subtitulo && <p className="text-sm text-muted-foreground mt-0.5">{subtitulo}</p>}
        </div>
        {extras && <ExtrasHeader>{extras}</ExtrasHeader>}
        {contador !== undefined && <PillConteo tono={tono}>{contador}</PillConteo>}
        <CaretDown size={18} weight="bold" className={`shrink-0 text-muted-foreground transition-transform ${estaAbierta ? 'rotate-180' : ''}`} />
      </button>
      {estaAbierta && children}
    </section>
  )
}
