/**
 * Una carga en la lista "Mis cargas" del cliente (spec 04/09, D4).
 *
 * Brian: "esta parte de las cargas el formato quedó anticuado y no el nuevo".
 * Era una Card de shadcn con franja de color, badges propios, barra de
 * progreso y un bloque "Libre Hasta" al desplegarla. Ahora es una fila de la
 * piel común (`partner/PanelCard`), igual que las de depósito y transporte:
 * identidad arriba, datos abajo, el próximo hito a la derecha. Tocarla abre
 * la ficha (ClientShipmentDialog), que es donde vive el detalle.
 *
 * La misma fila la usa el Historial: una carga cerrada no se mira distinto.
 * Todo lo que se muestra lo arma `filaCargaCliente` (lib pura); acá se pinta.
 */
import { CaretRight } from '@phosphor-icons/react'
import { PanelFila, FilaTitulo, FilaDatos, RefsCarga, Chip, Dato } from '@/components/partner/PanelCard'
import { RUTA_CHIP, TIPO_LABEL } from '@/lib/hoyCliente'
import type { FilaCargaCliente } from '@/lib/cargaCliente'

export default function FilaCarga({ fila, onAbrir, id, mostrarRuta, mostrarTipo, destacada, apagada }: {
  fila: FilaCargaCliente
  /** Abre la ficha de la carga. */
  onAbrir: () => void
  /** Ancla para llegar desde una card de HOY (`carga-A8121`). */
  id?: string
  /** El cliente ve cargas de más de una ruta / tipo: se marca cuál es cuál. */
  mostrarRuta?: boolean
  mostrarTipo?: boolean
  /** Viene de una card de HOY: se resalta un momento para encontrarla. */
  destacada?: boolean
  /** Historial: la fila se ve un escalón más apagada. */
  apagada?: boolean
}) {
  const { refs, hito } = fila
  return (
    <button
      type="button"
      id={id}
      onClick={onAbrir}
      aria-label={`Ver la carga ${refs.principal}`}
      className={`w-full text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        destacada ? 'ring-2 ring-inset ring-accent bg-accent/5' : ''
      } ${apagada ? 'opacity-75 hover:opacity-100' : ''}`}
    >
      <PanelFila
        accion={
          <>
            <span className="text-right whitespace-nowrap">
              <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{hito.label}</span>
              <span className="block text-base font-bold tabular-nums">{hito.fecha || '—'}</span>
            </span>
            <CaretRight size={16} weight="bold" className="text-muted-foreground" />
          </>
        }
      >
        <FilaTitulo>
          {/* Las dos referencias, con la regla única del portal (D2). */}
          <RefsCarga refs={refs} />
          <Chip clase={`${fila.claseEstado} border-transparent`}>{fila.etiqueta}</Chip>
          {mostrarTipo && <Chip>{TIPO_LABEL[fila.tipo]}</Chip>}
          {mostrarRuta && <Chip clase="bg-muted text-muted-foreground border-transparent">{RUTA_CHIP[fila.ruta]}</Chip>}
        </FilaTitulo>
        <FilaDatos>
          {fila.descripcion && <span className="font-medium text-foreground truncate max-w-[22rem]">{fila.descripcion}</span>}
          {/* Contado de la lista real: nunca más "0 contenedor(es)". */}
          <span>{fila.textoContenedores}</span>
          {fila.buque && <Dato label="Buque">{fila.buque}</Dato>}
          {fila.destino && <Dato label="Destino">{fila.destino}</Dato>}
        </FilaDatos>
      </PanelFila>
    </button>
  )
}
