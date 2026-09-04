/**
 * Una card de HOY: la piel común (`PanelPlegable`) + la definición única
 * (`hoyCards`) + la memoria por usuario (`useCardsPlegadas`), atadas en un
 * solo lugar (spec 04/09, D7).
 *
 * Lo que hace este envoltorio, y por qué existe:
 *  · El título y el tono NO se escriben en el JSX de cada card: salen de la
 *    tabla `CARDS_HOY_FCL`. Así el color de una card no puede decir una cosa
 *    y el de la de al lado otra, y el id que se guarda en `user_prefs` es
 *    siempre el mismo string.
 *  · El plegado es CONTROLADO: el estado vive en el hook, no en el panel. Por
 *    eso lo plegado no se reabre cuando llega un refetch de datos o cambia el
 *    contador.
 *  · Es un componente SIN hooks: se puede llamar como función en los tests y
 *    revisar los props que le pasa al panel (incluido el `onToggle`).
 *
 * `extras` son los chips que siguen a la vista con la card plegada ("3 para
 * reagendar"). Viven DENTRO del botón del header: contenido no interactivo.
 */
import { Fragment, type ReactNode } from 'react'
import { PanelPlegable, Chip, clasesTono, type TonoPanel } from '@/components/partner/PanelCard'
import { cardHoy, type CardHoyId } from '@/lib/hoyCards'
import type { CardsPlegadas } from '@/lib/cardsPlegadas'
import { useBrand } from '@/lib/brand'

export default function CardHoy({
  id, plegadas, icono, contador, subtitulo, extras, children,
}: {
  id: CardHoyId
  plegadas: CardsPlegadas
  icono: ReactNode
  contador?: number
  /** Pisa el subtítulo fijo de la definición (el que se arma con datos). */
  subtitulo?: ReactNode
  extras?: ReactNode
  children: ReactNode
}) {
  const def = cardHoy(id)
  return (
    <PanelPlegable
      tono={def.tono}
      icono={icono}
      titulo={def.titulo}
      subtitulo={subtitulo ?? def.subtitulo}
      contador={contador}
      extras={extras}
      abierta={plegadas.estaAbierta(id)}
      onToggle={abierta => plegadas.toggle(id, abierta)}
    >
      {children}
    </PanelPlegable>
  )
}

/**
 * Chip urgente del header ("2 vencidos", "avisar cliente"). El color sale del
 * TONO, no de un hex: bajo Mediterránea son los tokens del manual y bajo TWF
 * la escala de siempre, sin un solo `med ? … : …` en la card.
 */
export function ChipUrgente({ tono, children, title }: {
  tono: TonoPanel
  children: ReactNode
  title?: string
}) {
  const med = useBrand().id === 'med'
  return <Chip title={title} clase={`${clasesTono(tono, med).pill} border-transparent`}>{children}</Chip>
}

/**
 * Los chips del header, ya filtrados. Cada card los arma condicionalmente
 * (`n > 0 && <ChipUrgente…>`), y si NINGUNO aplica devuelve `undefined` en vez
 * de un fragmento vacío: así el panel no pinta el contenedor de extras cuando
 * no hay nada urgente que avisar.
 */
export function chipsHeader(...chips: ReactNode[]): ReactNode | undefined {
  const vivos = chips.filter(Boolean)
  if (vivos.length === 0) return undefined
  return vivos.map((chip, i) => <Fragment key={i}>{chip}</Fragment>)
}

/** El cuerpo de una card de HOY que no son filas de `PanelFila`: le pone el
 *  padding que el panel no impone (los hijos van sueltos, sin envoltorio). */
export function CuerpoCardHoy({ children }: { children: ReactNode }) {
  return <div className="px-4 py-3.5">{children}</div>
}
