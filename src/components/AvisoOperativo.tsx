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
 */
import { useEffect, useMemo, useState } from 'react'
import { useNoticias } from '@/components/NovedadesSection'
import {
  avisosRotativos, indiceSiguiente, indiceValido, tituloPlano, categoriaMeta,
  estiloSlide, linkNoticia, AVISO_ROTACION_MS, type EstiloSlide,
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

export default function AvisoOperativo({ className = '' }: { className?: string }) {
  const { noticias } = useNoticias()
  const avisos = useMemo(
    () => (getBrand().id === 'med' ? avisosRotativos(noticias, hoyISO()) : []),
    [noticias]
  )
  const [indice, setIndice] = useState(0)
  const [quieto, setQuieto] = useState(false)

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

  const link = linkNoticia(aviso)
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
      <div className="flex items-center gap-3 flex-wrap">
        <span className="inline-block rounded-full border-2 border-[#9bd1e5] px-4 py-1 text-[11px] font-semibold tracking-widest uppercase text-[#9bd1e5]">
          {kicker}
        </span>
        {aviso.kickerExtra && <span className="text-sm text-white/70">{aviso.kickerExtra}</span>}
        {avisos.length > 1 && (
          <span className="ml-auto text-xs text-white/60 tabular-nums">{i + 1} / {avisos.length}</span>
        )}
      </div>
      {/* Sin animación de entrada: con tw-animate-css el texto quedaba en
          opacity 0 (visto en /ui el 03/09). El cambio de fondo ya marca el paso. */}
      <div key={aviso.id}>
        <h3 className="titulo-med mt-2.5 text-xl lg:text-2xl text-white">{tituloPlano(aviso.titulo)}</h3>
        {aviso.bajada && (
          <p className="mt-1.5 text-sm text-white/80 max-w-2xl">{aviso.bajada.replace(/\*\*/g, '')}</p>
        )}
      </div>
      <div className="mt-4 flex items-center gap-4 flex-wrap">
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-full bg-[#ceffff] px-5 py-2 text-sm font-semibold text-[#352e6a]"
        >
          {link.externo ? 'Ir a la noticia →' : 'Ver aviso completo →'}
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
