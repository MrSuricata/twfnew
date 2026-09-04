/**
 * Accesos directos a las secciones del portal, pegados abajo del encabezado.
 *
 * Brian (04/09/2026), mirando el portal del depósito: "que al apretar te lleve
 * a la sección… buscá una forma estética para eso, profesional, que no moleste
 * y que funcione en mobile".
 *
 * Decisiones que ya vienen tomadas con él:
 *  · Va DENTRO del encabezado (por eso no tiene `sticky` propio: se pega junto
 *    con la barra violeta, en un solo bloque). Así el salto nunca deja la
 *    sección tapada: el desplazamiento descuenta el alto real del encabezado,
 *    medido en el momento, no un número fijo que se desactualiza.
 *  · En el celular se DESLIZA en horizontal; en escritorio es una fila de chips.
 *  · Se resalta sola la sección que se está mirando, y el chip activo se trae
 *    a la vista dentro de la barra (en un celular la mitad de los chips están
 *    fuera de pantalla).
 *  · Descartada la barra de abajo tipo app: en el celular tapa contenido justo
 *    cuando el del depósito está mirando una fila.
 *
 * Qué chips existen lo decide `lib/seccionesDeposito.ts` (lib pura): acá no se
 * filtra nada, solo se pinta lo que llega.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { anclaSeccion, seccionActiva, type ChipSeccion, type SeccionDepositoId } from '@/lib/seccionesDeposito'

/** Aire entre el encabezado y el comienzo de la sección a la que se salta. */
const RESPIRO = 8

const suave = (): ScrollBehavior =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth'

export default function BarraSecciones({ secciones }: { secciones: readonly ChipSeccion[] }) {
  const navRef = useRef<HTMLElement>(null)
  const cintaRef = useRef<HTMLDivElement>(null)
  const chipsRef = useRef<Record<string, HTMLButtonElement | null>>({})
  const [activa, setActiva] = useState<SeccionDepositoId | null>(secciones[0]?.id ?? null)

  /**
   * Dónde termina el encabezado fijo, ahora mismo. Como la barra vive adentro
   * de un encabezado `sticky top-0`, su borde de abajo ES el alto del bloque
   * fijo, esté la página arriba de todo o scrolleada.
   */
  const bordeEncabezado = useCallback(() => navRef.current?.getBoundingClientRect().bottom ?? 0, [])

  // Resaltado por scroll. Se recalcula en un rAF para no medir el layout en
  // cada evento de scroll (el portal se usa en celulares de depósito).
  useEffect(() => {
    let pedido = 0
    const recalcular = () => {
      pedido = 0
      const base = bordeEncabezado()
      const posiciones = secciones
        .map(s => ({ id: s.id, el: document.getElementById(anclaSeccion(s.id)) }))
        .filter((x): x is { id: SeccionDepositoId; el: HTMLElement } => !!x.el)
        .map(({ id, el }) => ({ id, top: el.getBoundingClientRect().top - base }))
      setActiva(seccionActiva(posiciones))
    }
    const alMoverse = () => { if (!pedido) pedido = requestAnimationFrame(recalcular) }
    recalcular()
    window.addEventListener('scroll', alMoverse, { passive: true })
    window.addEventListener('resize', alMoverse)
    return () => {
      if (pedido) cancelAnimationFrame(pedido)
      window.removeEventListener('scroll', alMoverse)
      window.removeEventListener('resize', alMoverse)
    }
  }, [secciones, bordeEncabezado])

  // El chip resaltado, a la vista. Solo mueve la cinta en horizontal: mover la
  // página mientras el usuario scrollea sería pelearle el scroll.
  useEffect(() => {
    const cinta = cintaRef.current
    const chip = activa ? chipsRef.current[activa] : null
    if (!cinta || !chip) return
    const destino = chip.offsetLeft - (cinta.clientWidth - chip.clientWidth) / 2
    cinta.scrollTo({ left: Math.max(0, destino), behavior: suave() })
  }, [activa])

  const ir = (id: SeccionDepositoId) => {
    const el = document.getElementById(anclaSeccion(id))
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY - bordeEncabezado() - RESPIRO
    window.scrollTo({ top: Math.max(0, top), behavior: suave() })
    // Se resalta ya: el scroll suave tarda y el chip tiene que contestar al toque.
    setActiva(id)
  }

  if (secciones.length === 0) return null

  return (
    <nav ref={navRef} aria-label="Secciones del portal" className="border-t border-white/15 bg-black/10">
      {/* `w-max` adentro de la cinta: los chips no se comprimen, se deslizan.
          La barra de scroll se oculta — en el celular es un estorbo visual. */}
      <div
        ref={cintaRef}
        className="relative max-w-7xl mx-auto px-3 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-max items-center gap-1.5 py-2">
          {secciones.map(s => (
            <button
              key={s.id}
              ref={el => { chipsRef.current[s.id] = el }}
              type="button"
              onClick={() => ir(s.id)}
              aria-current={activa === s.id ? 'true' : undefined}
              className={`h-8 shrink-0 rounded-full px-3.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-white/60 ${
                activa === s.id
                  ? 'bg-white text-primary shadow-sm'
                  : 'bg-white/15 text-white/85 hover:bg-white/25'
              }`}
            >
              {s.chip}
            </button>
          ))}
        </div>
      </div>
    </nav>
  )
}
