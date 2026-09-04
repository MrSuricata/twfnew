/**
 * El Diario Logístico dentro del panel de cada partner (depósito, transporte,
 * cliente): las mismas tarjetas que la portada, pasando solas.
 *
 * Un paro en TCP o un paso cerrado le cambia el día al cliente, al depósito y
 * al transporte por igual, así que el aviso es el mismo para los tres y sale
 * de un solo lugar: lo que se publica en Noticias aparece acá sin tocar nada.
 *
 * Brian (03/09/2026): "para todos aparece lo de los 3 tifones; que vayan
 * pasando las noticias cada ciertos segundos, conectado con el diario, los
 * banners y las tarjetas". Antes mostraba la primera alerta, fija. Ahora rota
 * por `avisosRotativos` — el MISMO orden que el carrusel del Diario — cada
 * AVISO_ROTACION_MS, se frena con el mouse encima, y los puntos permiten
 * saltar a una tarjeta. Con "reducir movimiento" activo no rota solo.
 *
 * El Diario es de Mediterránea; en TWF no se muestra.
 *
 * La tarjeta NO cambia de alto al rotar (Brian 04/09). Cada nota tiene un
 * texto de otro largo y el banner crecía y encogía empujando lo de abajo: si
 * el del depósito está por tocar "Retiré" justo cuando rota, se le mueve el
 * botón y puede marcar el contenedor equivocado. Tres cosas lo sostienen:
 *  · El bloque de texto reserva el alto de la nota MÁS LARGA de la vuelta
 *    (`reservaAvisos`) y todas se recortan a ese mismo tope de renglones.
 *  · La fila del kicker no envuelve nunca: pill y fecha se recortan con
 *    puntos suspensivos antes de saltar a un segundo renglón.
 *  · El enlace "fuente" ocupa su lugar aunque la nota no tenga link externo,
 *    así la fila de abajo envuelve igual en todas las notas.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNoticias } from '@/components/NovedadesSection'
import {
  avisosRotativos, indiceSiguiente, indiceValido, tituloPlano, categoriaMeta,
  estiloSlide, linkNoticia, linkDiario, reservaAvisos,
  AVISO_ROTACION_MS, type EstiloSlide,
} from '@/lib/noticias'
import { getBrand } from '@/lib/brand'

/** Fondo por variante del slide, misma paleta que el Diario. */
const FONDO: Record<EstiloSlide, string> = {
  violeta: 'degradado-med',
  celeste: 'bg-[#261c79]',
  actualizacion: 'bg-[#352e6a]',
  papel: 'bg-[#49286b]',
}

const hoyISO = () => new Date().toISOString().slice(0, 10)

/** `max-w-2xl` de la bajada. */
const ANCHO_MAX_BAJADA = 672
const LH_TITULO = 1.3
const LH_BAJADA = 1.5

/**
 * Caja de texto con tope de renglones: corta SIEMPRE en un borde de renglón y
 * termina en puntos suspensivos (igual que el Diario). El `lineHeight` va
 * explícito porque es el mismo número con el que la lib reservó el alto: si
 * uno cambia sin el otro, vuelve el salto.
 */
const recorte = (lineas: number, lineHeight: number): CSSProperties =>
  lineas > 0
    ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lineas, overflow: 'hidden', lineHeight }
    : { lineHeight }

export default function AvisoOperativo({ className = '' }: { className?: string }) {
  const { noticias } = useNoticias()
  const avisos = useMemo(
    () => (getBrand().id === 'med' ? avisosRotativos(noticias, hoyISO()) : []),
    [noticias]
  )
  const [indice, setIndice] = useState(0)
  const [quieto, setQuieto] = useState(false)

  // Cuánto mide el bloque de texto. Se mide en vez de suponerse porque el
  // banner es fluido (el mismo componente en el portal del depósito, el del
  // transporte y el del cliente) y cuántos renglones entran depende del ancho.
  const bloqueRef = useRef<HTMLDivElement>(null)
  const [medida, setMedida] = useState({ ancho: 0, fontTitulo: 24 })
  useEffect(() => {
    const el = bloqueRef.current
    if (!el) return
    const medir = () => setMedida(prev => {
      // `text-xl` en chico, `lg:text-2xl` de 1024 para arriba: el tamaño del
      // título cambia cuántas palabras entran por renglón.
      const next = { ancho: el.clientWidth, fontTitulo: window.innerWidth >= 1024 ? 24 : 20 }
      return prev.ancho === next.ancho && prev.fontTitulo === next.fontTitulo ? prev : next
    })
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [avisos.length])

  // El alto de la nota más larga de la rotación: lo reserva el bloque entero,
  // así la tarjeta mide lo mismo con la nota más corta y con la más larga.
  const reserva = useMemo(() => reservaAvisos(avisos, {
    ancho: medida.ancho,
    anchoBajada: Math.min(medida.ancho, ANCHO_MAX_BAJADA),
    fontTitulo: medida.fontTitulo,
    lhTitulo: LH_TITULO,
    lhBajada: LH_BAJADA,
  }), [avisos, medida])

  // Rotación: un solo timer, se reinicia al cambiar de tarjeta o al soltar el
  // mouse. Con una sola tarjeta no hay nada que rotar.
  useEffect(() => {
    if (quieto || avisos.length <= 1) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setTimeout(() => setIndice(i => indiceSiguiente(i, avisos.length)), AVISO_ROTACION_MS)
    return () => window.clearTimeout(t)
  }, [indice, quieto, avisos.length])

  const i = indiceValido(indice, avisos.length)
  const aviso = avisos[i]
  if (!aviso) return null

  // El botón grande manda al DIARIO, no a la fuente: en el diario la nota se
  // lee entera y además se ven las otras (Brian 03/09: "si lo mandamos a la
  // noticia directamente no la puede leer"). La fuente queda de refuerzo.
  const fuente = linkNoticia(aviso)
  const kicker = aviso.kicker || categoriaMeta(aviso.categoria).label

  return (
    <section
      className={`${FONDO[estiloSlide(aviso)]} relative overflow-hidden rounded-[20px] p-6 text-white transition-colors duration-500 ${className}`}
      onMouseEnter={() => setQuieto(true)}
      onMouseLeave={() => setQuieto(false)}
      onFocus={() => setQuieto(true)}
      onBlur={() => setQuieto(false)}
      aria-roledescription="carrusel"
      aria-label="Diario logístico"
    >
      <div
        className="absolute -bottom-24 -right-24 w-56 h-56 rounded-full border-[14px] border-white/15 pointer-events-none"
        aria-hidden
      />
      {/* Sin `flex-wrap`: si esta fila salta a dos renglones en una nota y en
          otra no, la tarjeta cambia de alto. Antes que eso, se recorta. */}
      <div className="flex items-center gap-3 flex-nowrap min-w-0">
        <span title={kicker} className="min-w-0 truncate rounded-full border-2 border-[#9bd1e5] px-4 py-1 text-[11px] font-semibold tracking-widest uppercase text-[#9bd1e5]">
          {kicker}
        </span>
        {aviso.kickerExtra && <span className="truncate text-sm text-white/70">{aviso.kickerExtra}</span>}
        {avisos.length > 1 && (
          <span className="ml-auto shrink-0 text-xs text-white/60 tabular-nums">{i + 1} / {avisos.length}</span>
        )}
      </div>
      {/* Sin animación de entrada: con tw-animate-css el texto quedaba en
          opacity 0 (visto en /ui el 03/09). El cambio de fondo ya marca el paso.
          El `mt-2.5` va acá y no en el h3: adentro del bloque medido, para que
          el alto reservado sea el alto real. */}
      <div ref={bloqueRef} className="mt-2.5" style={{ minHeight: reserva.alto || undefined }}>
        <div key={aviso.id}>
          <h3 className="titulo-med text-xl lg:text-2xl text-white" style={recorte(reserva.lineasTitulo, LH_TITULO)}>
            {tituloPlano(aviso.titulo)}
          </h3>
          {aviso.bajada && (
            <p className="mt-1.5 text-sm text-white/80 max-w-2xl" style={recorte(reserva.lineasBajada, LH_BAJADA)}>
              {aviso.bajada.replace(/\*\*/g, '')}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-4 flex-wrap">
        <a
          href={linkDiario(aviso)}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir el Diario Logístico en esta nota"
          className="inline-flex items-center rounded-full bg-[#ceffff] px-5 py-2 text-sm font-semibold text-[#352e6a]"
        >
          Leer en el Diario Logístico →
        </a>
        {/* Ocupa su lugar aunque la nota no tenga fuente externa: si apareciera
            y desapareciera, esta fila envolvería distinto en cada nota y la
            tarjeta volvería a cambiar de alto. Oculto no se lee ni se tabula. */}
        <a
          href={fuente.href}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir la nota original en el sitio de origen"
          aria-hidden={!fuente.externo}
          tabIndex={fuente.externo ? undefined : -1}
          className={`text-xs text-white/70 underline underline-offset-2 hover:text-white ${fuente.externo ? '' : 'invisible'}`}
        >
          fuente
        </a>
        {avisos.length > 1 && (
          <div className="flex items-center gap-2" role="tablist" aria-label="Avisos">
            {avisos.map((a, k) => (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={k === i}
                aria-label={`Aviso ${k + 1}: ${tituloPlano(a.titulo)}`}
                onClick={() => setIndice(k)}
                className={`h-2.5 rounded-full transition-all ${k === i ? 'w-7 bg-[#ceffff]' : 'w-2.5 bg-white/40 hover:bg-white/70'}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
