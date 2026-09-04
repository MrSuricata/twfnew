/**
 * Una sección del portal de un partner: la piel común (`PanelCard`) con el
 * color de la card y el contador, y —si se le pasa `plegado`— la versión que
 * se cierra y se acuerda (`PanelPlegable`, modo controlado).
 *
 * Vive acá y no adentro de `DepotDashboard` por dos razones:
 *  · Es la misma pieza que usan las seis cards del depósito; el portal del
 *    transporte puede tomarla igual sin copiar el ternario del tono.
 *  · Se puede renderizar en un test sin arrastrar el portal entero.
 *
 * La regla que sostiene: con el contador en 0 la card se pinta `neutro`
 * —nada urgente que gritar— pero el contador SIGUE, plegada incluida. Plegar
 * no puede esconder lo que la card tiene para avisar (misma regla que las
 * cards de HOY del admin).
 */
import type { ReactNode } from 'react'
import PanelCard, { PanelPlegable, type TonoPanel } from './PanelCard'

export interface PlegadoSeccion {
  abierta: boolean
  /** Se llama con el estado pedido (true = abrir) en cada toque del header. */
  onToggle: (abierta: boolean) => void
}

export default function SeccionPortal({
  icono, titulo, subtitulo, cantidad, tono = 'neutro', plegado, children,
}: {
  icono: ReactNode
  titulo: string
  subtitulo?: string
  cantidad: number
  tono?: TonoPanel
  /** Si viene, la card se puede plegar y el estado lo maneja el padre (que es
   *  quien lo recuerda por usuario). Sin esto, la card va siempre abierta. */
  plegado?: PlegadoSeccion
  children: ReactNode
}) {
  const comun = {
    tono: cantidad === 0 ? ('neutro' as TonoPanel) : tono,
    icono,
    titulo,
    subtitulo,
    contador: cantidad,
  }
  if (plegado) {
    return (
      <PanelPlegable {...comun} abierta={plegado.abierta} onToggle={plegado.onToggle}>
        {children}
      </PanelPlegable>
    )
  }
  return <PanelCard {...comun}>{children}</PanelCard>
}
