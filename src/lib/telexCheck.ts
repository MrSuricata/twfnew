// ─── Telex (TLX): liberación documental de la naviera ────────────────
// Sin telex liberado NO se puede retirar ni mover el contenedor de la
// terminal. Regla de Brian: una carga sin telex con fecha de carga/salida
// puesta (o ya visible en la agenda) es un problema a resolver YA → alerta.
//
// El dato viaja como string: 'SI' = liberado, '' = falta. En filas DB es la
// columna booleana `telex`, convertida a 'SI'/'' al armar los modelos
// (buildOperations / dbFclToParsedShipment).

/** ¿El telex está liberado? Centraliza el `=== 'SI'` disperso por el repo.
 *  Acepta también 'TRUE' (texto del checkbox de la planilla vieja — los datos
 *  se normalizaron a SI/'' el 10/07, esto cubre cualquier rezagado). */
export function hasTelex(tlx: string | undefined | null): boolean {
  const v = (tlx || '').trim().toUpperCase()
  return v === 'SI' || v === 'TRUE'
}

/** ¿Falta el telex? (inverso legible de hasTelex) */
export function isSinTelex(tlx: string | undefined | null): boolean {
  return !hasTelex(tlx)
}

/**
 * ¿Corresponde alertar "SIN TELEX" para esta operativa/carga?
 * Alerta cuando falta el telex Y ya hay una fecha de movimiento comprometida
 * (salida del contenedor o fecha de carga del camión). Sin fecha no se alerta:
 * una carga en puerto esperando telex es lo normal, no una anomalía.
 */
export function needsTelexAlert(args: {
  tlx: string | undefined | null
  /** fecha de salida MVD (contenedor) o fecha de carga/salida del camión */
  fecha: string | undefined | null
}): boolean {
  return isSinTelex(args.tlx) && !!(args.fecha || '').trim()
}

/** Texto estándar del aviso (mismo mensaje en toasts, banners y tooltips). */
export const SIN_TELEX_MSG =
  'SIN TELEX: la naviera todavía no liberó el documento — sin telex no se puede retirar el contenedor.'
