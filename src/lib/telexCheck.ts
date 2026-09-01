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

/**
 * Texto del popup que pregunta si se agenda igual una carga sin telex.
 *
 * Hasta el 31/08/2026 esto era un toast que salía DESPUÉS de guardar: te
 * enterabas cuando la salida ya estaba puesta. Brian pidió que pregunte antes,
 * porque agendar sin telex es una decisión, no una notificación.
 *
 * Vive acá y no en el componente para que el mensaje sea el mismo en los tres
 * lugares donde se agenda: la Agenda (arrastrando), el quick-edit y la ficha.
 */
export function mensajeConfirmarSinTelex(args: {
  ref: string
  /** Contenedor concreto, cuando se sabe cuál se está moviendo. */
  cntr?: string | null
  /** Fecha de salida que se está por dejar. */
  fecha: string
}): string {
  const f = (args.fecha || '').trim()
  // La fecha llega ISO desde la agenda y a veces como texto libre ('a
  // confirmar') desde la planilla: se muestra tal cual si no es una fecha.
  const fechaTxt = /^\d{4}-\d{2}-\d{2}$/.test(f)
    ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`
    : f
  const cntr = (args.cntr || '').trim()
  return [
    `🚨 ${args.ref} no tiene el telex liberado.`,
    '',
    cntr ? `Contenedor: ${cntr}` : null,
    `Salida: ${fechaTxt || '—'}`,
    '',
    'Sin telex la naviera no libera el contenedor y no se puede retirar de la terminal.',
    '',
    '¿Agendar igual?',
  ].filter(l => l !== null).join('\n')
}
