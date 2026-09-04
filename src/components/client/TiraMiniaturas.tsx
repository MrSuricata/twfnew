/**
 * La tira de miniaturas del aviso de HOY (spec 04/09, D3).
 *
 * Brian (04/09): "es rarísimo el proceso de cómo se muestran las fotos:
 * apretás y te lleva a toda la lista de cargas. Que aparezca miniatura de las
 * fotos al mostrar el aviso de la carga de hoy".
 *
 * Las miniaturas YA viajaban al cliente (el server manda `thumbnailUrl`
 * firmada en /api/client/origin-photos) y la card las tiraba: solo contaba
 * cuántas eran. Acá se dibujan, y tocar una abre el visor en ESA foto.
 *
 * Dos cosas que no se pueden aflojar:
 *  · Una miniatura que no carga NO puede quedar como ícono roto. La firma
 *    dura 8 h y un portal abierto toda la jornada las pasa: la foto que falla
 *    se reemplaza por una caja con la cámara y se avisa al portal para que
 *    vuelva a pedir las URLs (`onRota` → firmasFotos.tocaRefrescarFirmas).
 *  · Y ese "rota" DURA LO QUE DURA LA FUENTE. La lista de rotas se ata a las
 *    fuentes que se estaban dibujando (`claveDeFuentes`): cuando el refresco
 *    trae URLs nuevas, la clave cambia y nadie sigue roto. Sin eso el arreglo
 *    de arriba no se veía —la `key` de la fila es estable, el componente no
 *    remonta— y las miniaturas quedaban en ícono de cámara hasta recargar.
 *  · Los colores salen del tono de la card (piel común, `clasesTono`), no de
 *    hex sueltos: bajo Mediterránea se resuelven solos.
 *
 * Qué fotos entran y cuántas quedan en el "+N" NO se decide acá: viene hecho
 * de `tiraDeMiniaturas` (lib/cargaCliente), que ya descartó las que no se
 * pueden dibujar. Si acá se volviera a filtrar, el "+N" contaría fotos que
 * después no aparecen.
 */
import { useState } from 'react'
import { Camera, Images } from '@phosphor-icons/react'
import { useBrand } from '@/lib/brand'
import { clasesTono, type TonoPanel } from '@/components/partner/PanelCard'
import {
  claveDeFuentes, rotasVigentes, conRota, SIN_ROTAS, type RotasMiniaturas,
} from '@/lib/firmasFotos'
import { fuenteMiniatura } from '@/lib/cargaCliente'
import type { OriginPhoto } from '@/lib/quotationTypes'

export default function TiraMiniaturas({
  visibles, mas, siguiente, etiqueta, tono = 'info', onAbrir, onRota,
}: {
  /** Las que entran en la tira (lib: `tiraDeMiniaturas`). */
  visibles: OriginPhoto[]
  /** Cuántas quedaron afuera: el "+N". */
  mas: number
  /** La primera que no entró: donde abre el visor desde el "+N". */
  siguiente?: OriginPhoto | null
  /** Para el lector de pantalla: "3 fotos en depósito GODILCO". */
  etiqueta: string
  tono?: TonoPanel
  onAbrir: (foto: OriginPhoto) => void
  /** Una miniatura no cargó: casi siempre, la firma venció. */
  onRota?: () => void
}) {
  const med = useBrand().id === 'med'
  const t = clasesTono(tono, med)
  const [rotas, setRotas] = useState<RotasMiniaturas>(SIN_ROTAS)
  // La huella de lo que se está dibujando AHORA: id + fuente de cada foto.
  const clave = claveDeFuentes(visibles.map(f => `${f.id}|${fuenteMiniatura(f)}`))
  // Rotas de ESTAS fuentes. Si el portal ya trajo firmas nuevas, ninguna.
  const rotasAhora = rotasVigentes(rotas, clave)
  // Sin miniaturas (fotos viejas sin migrar) la tira no se dibuja: la fila
  // queda como estaba, nunca con un hueco. Quién entra y quién va al "+N" lo
  // decidió `tiraDeMiniaturas`, que ya descartó las que no se pueden dibujar:
  // acá no se filtra nada, o el "+N" volvería a contar lo que no se dibuja.
  if (visibles.length === 0) return null

  const marcarRota = (id: string) => {
    setRotas(prev => conRota(prev, clave, id))
    onRota?.()
  }

  // OJO: el fondo y el borde van UNA sola vez por caja. Poner `bg-muted` en la
  // base y `bg-med-violeta` en el "+N" no funciona: dos utilidades del mismo
  // grupo se resuelven por el ORDEN DEL CSS, no por el orden en el atributo, y
  // el "+N" salía gris con el texto blanco encima (invisible).
  const cajaBase = 'relative shrink-0 w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-lg overflow-hidden border-2 transition-transform hover:scale-[1.04] focus-visible:outline-2 focus-visible:outline-offset-2'
  const cajaFoto = `${cajaBase} ${t.borde} bg-muted`
  const cajaMas = `${cajaBase} border-transparent ${t.pill} flex flex-col items-center justify-center gap-0.5`

  return (
    <div className="flex items-center gap-2 flex-wrap" role="group" aria-label={`Fotos: ${etiqueta}`}>
      {visibles.map((f, i) => {
        const rota = rotasAhora.includes(f.id)
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onAbrir(f)}
            title={f.caption || `Ver las fotos — ${etiqueta}`}
            aria-label={`Ver la foto ${i + 1} de ${etiqueta}`}
            className={cajaFoto}
          >
            {rota
              ? (
                <span className={`w-full h-full flex items-center justify-center ${t.icono}`}>
                  <Camera size={22} weight="fill" />
                </span>
              )
              : (
                <img
                  src={fuenteMiniatura(f)}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                  onError={() => marcarRota(f.id)}
                />
              )}
          </button>
        )
      })}

      {mas > 0 && (
        <button
          type="button"
          onClick={() => onAbrir(siguiente || visibles[visibles.length - 1])}
          aria-label={`Ver las otras ${mas} fotos de ${etiqueta}`}
          className={cajaMas}
        >
          <Images size={18} weight="fill" />
          <span className="text-sm font-bold tabular-nums">+{mas}</span>
        </button>
      )}
    </div>
  )
}
