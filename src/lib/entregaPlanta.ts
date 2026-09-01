/**
 * Regla de Brian (01/09/2026): "NO PUEDEN PISARSE LAS ENTREGAS EN PLANTA".
 *
 * Una carga con entrega en planta va del fiscal directo a la planta del
 * cliente. Si un mismo viaje lleva dos entregas en planta de clientes distintos
 * (o del mismo cliente pero a otro fiscal), el camión tiene que ir a dos
 * plantas y una de las dos se pisa. La regla AVISA, no bloquea: quien arma el
 * camión sabe si igual conviene.
 *
 * Funciones puras: el armador las llama con lo que ya tiene cargado.
 */

export interface CargaPlanta {
  ref: string
  cliente?: string | null
  fiscal?: string | null
  entregaPlanta?: boolean | null
}

export interface ConflictoPlanta {
  /** Ref de la carga que YA está en el camión y choca con la nueva. */
  con: string
  cliente: string
}

const norm = (v: string | null | undefined): string =>
  String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase()

/** Dos entregas en planta conviven solo si son del mismo cliente al mismo fiscal. */
export function sePisan(a: CargaPlanta, b: CargaPlanta): boolean {
  if (!a.entregaPlanta || !b.entregaPlanta) return false
  if (norm(a.cliente) !== norm(b.cliente)) return true
  return norm(a.fiscal) !== norm(b.fiscal)
}

/**
 * Al agregar `cargaNueva` a un camión que ya lleva `cargasDelCamion`:
 * null si no hay problema, o la primera carga del camión con la que se pisa.
 */
export function conflictoEntregaPlanta(
  cargasDelCamion: CargaPlanta[],
  cargaNueva: CargaPlanta,
): ConflictoPlanta | null {
  if (!cargaNueva.entregaPlanta) return null
  const refNueva = norm(cargaNueva.ref)
  for (const c of cargasDelCamion) {
    // La misma carga (otro contenedor de la misma ref) no choca consigo misma.
    if (norm(c.ref) === refNueva) continue
    if (sePisan(c, cargaNueva)) return { con: c.ref, cliente: String(c.cliente ?? '').trim() }
  }
  return null
}

/**
 * Para el banner del armador: el primer par de cargas YA en el camión que se
 * pisan entre sí (null si el viaje está limpio).
 */
export function conflictoEntregaPlantaEnCamion(
  cargas: CargaPlanta[],
): { a: CargaPlanta; b: CargaPlanta } | null {
  for (let i = 0; i < cargas.length; i++) {
    for (let j = i + 1; j < cargas.length; j++) {
      if (norm(cargas[i].ref) === norm(cargas[j].ref)) continue
      if (sePisan(cargas[i], cargas[j])) return { a: cargas[i], b: cargas[j] }
    }
  }
  return null
}

export function mensajeConflictoEntregaPlanta(c: ConflictoPlanta): string {
  const quien = c.cliente ? `${c.con} – ${c.cliente}` : c.con
  return `Este camión ya lleva una entrega en planta (${quien}). Dos entregas en planta en el mismo viaje se pisan.`
}
