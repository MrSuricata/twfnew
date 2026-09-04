/**
 * LIBRE + botón "Devuelto" — la pieza que estaba escrita DOS veces: en el
 * cuadro grande de "Datos clave de la carga" (`ViabilityBlock`) y en la fila
 * del modal de cambios rápidos (`ContainerQuickEdit`). Mismo botón, mismo
 * toast con "Deshacer", mismo tinte verde; ahora se escribe una sola vez
 * (rediseño 04/09, D6).
 *
 * REGLA DEL REPO — acá NO se toca: "DEVUELTO" vive en el campo LIBRE
 * (src/lib/libreDevuelto.ts) y LIBRE es dato NIVEL-CARGA. Cada llamador
 * propaga el valor a todos los contenedores por su propio camino
 * (`onCommit('libre', …)` en el panel · `buildPerContainerPatch` en el modal):
 * este archivo recibe el valor actual y devuelve el que hay que guardar, nada
 * más. Los dos lugares tienen que seguir comportándose igual.
 */
import { toast } from 'sonner'
import { CheckCircle, ArrowCounterClockwise } from '@phosphor-icons/react'
import { fmtDateDMY } from '@/lib/format'
import { isLibreDevuelto, libreDevueltoToggle, LIBRE_DEVUELTO } from '@/lib/libreDevuelto'
import { Dato } from '@/components/partner/PanelCard'

/** Tinte del valor cuando la carga ya está devuelta (los dos lugares, igual). */
export const CLASE_LIBRE_DEVUELTO = 'text-emerald-600'

/** Guarda el nuevo LIBRE. Puede ser sync (panel) o async (modal). */
export type CommitLibre = (valor: string) => void | Promise<void>

/**
 * El toggle del botón "Devuelto", con su toast.
 *  · LIBRE fecha/vacío → 'DEVUELTO' + toast con "Deshacer" que restaura el
 *    valor EXACTO anterior (fecha ISO o vacío, capturado ANTES de pisarlo).
 *  · LIBRE ya DEVUELTO → '' (sin toast: el cambio se ve al instante).
 * El toast sale DESPUÉS del commit — si el guardado falla (el modal hace
 * await de un patch que puede tirar), no se ofrece deshacer algo que no pasó.
 */
export async function toggleLibreDevuelto(libre: unknown, commit: CommitLibre): Promise<void> {
  const { next, prev } = libreDevueltoToggle(libre)
  await commit(next)
  if (next !== LIBRE_DEVUELTO) return
  toast.success('Contenedor devuelto', {
    action: { label: 'Deshacer', onClick: () => { void commit(prev) } },
  })
}

const BOTON_BASE = 'inline-flex items-center gap-1 h-7 px-2 rounded-md border border-input bg-background text-[11px] font-medium text-muted-foreground transition-colors enabled:hover:bg-muted enabled:hover:text-foreground disabled:opacity-50'

/**
 * El botón. En el panel va como footer del cuadro LIBRE (con `clase="mt-1.5"`);
 * en el modal, al lado del valor.
 */
export function BotonDevuelto({
  devuelto, habilitado, onToggle, clase, tituloSoloLectura = 'Solo lectura',
}: {
  devuelto: boolean
  /** false → botón deshabilitado (solo lectura, sin id, guardando…). */
  habilitado: boolean
  onToggle: () => void
  clase?: string
  tituloSoloLectura?: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!habilitado}
      title={!habilitado
        ? tituloSoloLectura
        : devuelto
          ? 'Quitar la marca DEVUELTO (LIBRE queda vacío)'
          : 'Marcar contenedor devuelto (LIBRE = DEVUELTO)'}
      className={`${BOTON_BASE} ${clase || ''}`}
    >
      {devuelto ? <ArrowCounterClockwise size={12} /> : <CheckCircle size={12} />}
      {devuelto ? 'Deshacer devuelto' : 'Devuelto'}
    </button>
  )
}

/**
 * La fila completa del modal rápido: el valor de LIBRE (display, la FECHA se
 * edita en "Datos clave" del panel) + el botón.
 *
 * `respaldo` es `calculatedLibreHasta`: solo DISPLAY (lo mismo que miran las
 * alertas de LIBRE). El valor guardado es `libre` — "Deshacer" restaura ese, no
 * el calculado.
 */
export default function LibreDevueltoBlock({
  libre, respaldo, habilitado, onToggle, tituloSoloLectura,
}: {
  libre: string
  respaldo?: string
  habilitado: boolean
  onToggle: () => void
  tituloSoloLectura?: string
}) {
  const devuelto = isLibreDevuelto(libre)
  const mostrado = fmtDateDMY(libre || respaldo || '')
  return (
    <div className="px-4 py-3.5 flex items-center justify-between gap-3">
      <Dato label="Libre (máx. devolución)" fuerte>
        <span className={devuelto ? CLASE_LIBRE_DEVUELTO : mostrado ? '' : 'text-muted-foreground'}>
          {mostrado || '—'}
        </span>
      </Dato>
      <BotonDevuelto
        devuelto={devuelto}
        habilitado={habilitado}
        onToggle={onToggle}
        tituloSoloLectura={tituloSoloLectura}
      />
    </div>
  )
}
