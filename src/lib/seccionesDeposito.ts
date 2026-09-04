/**
 * Las secciones del HOY del depósito: en qué ORDEN se ven y cuáles se ofrecen
 * en la barra de navegación.
 *
 * Brian, 04/09/2026, entrando al portal como Bruno Franco (GODILCO): lo primero
 * que se leía era *"Operativas de hoy: 0 — Hoy no tenés cargas ni retiros
 * programados"*, con OCHO retiros justo abajo. "El que entra a trabajar lee
 * primero que no tiene nada que hacer".
 *
 * La regla, en una línea: **sin operativas hoy, esa card no encabeza nunca.**
 *  · **Con operativas hoy**, "Operativas de hoy" va primero. Es el trabajo
 *    del día y no lo desplaza nada.
 *  · **Sin operativas**, esa card BAJA pero NO desaparece —que diga "no hay
 *    nada" también es información— y arriba quedan las dos cards de trabajo
 *    real, retiros y vacíos. Entre ESAS DOS manda la urgencia, en el orden
 *    que eligió Brian:
 *      1. **Vacíos vencidos o a ≤5 días**: "primero lo que sangra", el
 *         demurrage corre todos los días.
 *      2. **Retiros en verde**: liberado + terminal paga, se puede ir a
 *         buscar YA.
 *    Si no hay nada urgente, esas dos van en el orden de siempre (retiros,
 *    vacíos) y "Hoy" baja igual: tercera.
 *
 * Por qué SIN EXCEPCIÓN (cambio del 04/09, misma mañana): la primera versión
 * bajaba la card solo cuando había algo urgente, así que con el portal en cero
 * "hoy no tenés nada" volvía a ser el titular. Brian dijo que le daba lo mismo
 * y que decidiéramos: se eligió la regla sin excepción porque se explica en una
 * línea y no hay que acordarse de cuándo aplica. El costo conocido es que en un
 * día totalmente vacío lo primero pasa a ser "Retiros próximos: 0", que no dice
 * más que la otra — pero tampoco menos.
 *
 * Lo que este archivo NO hace: inventar una definición nueva de "urgente".
 * Las dos señales salen tal cual de `lib/hoyDeposito.ts` — `motivo:
 * 'vencimiento'` de `libresPorVencer` (que por construcción es "LIBRE a
 * LIBRE_DIAS_AVISO días o menos, vencidos incluidos") y `estadoRetiro(...) ===
 * 'listo'`. Si mañana cambia el umbral, cambia allá y acá no se toca nada.
 *
 * Consecuencia buscada: con nada urgente pendiente, el orden queda como
 * siempre. La card vacía arriba solo molesta cuando hay algo que hacer, y en
 * ese caso lo que se puede hacer es lo que sube.
 *
 * Puro y testeado (seccionesDeposito.test.ts): la UI (DepotDashboard) solo
 * recorre el orden que sale de acá.
 */

/** Cada bloque del portal, en el orden de siempre. Se guarda en el plegado de
 *  cards: los ids son ESTABLES, renombrar uno deja huérfana la preferencia. */
export type SeccionDepositoId = 'hoy' | 'retiros' | 'vacios' | 'lcl' | 'plan' | 'avisos' | 'agenda'

export interface DefSeccionDeposito {
  id: SeccionDepositoId
  /** Texto del chip en la barra de accesos directos. Sin `chip`, la sección
   *  existe en la página pero no se ofrece para saltar. */
  chip?: string
}

/**
 * El orden de siempre, y el nombre corto de cada sección en la barra.
 *
 * TODA sección que se ve en la página tiene su chip. La primera versión dejó
 * afuera el plan de 14 días para no alargar la barra en el celular, y Brian
 * enseguida preguntó por qué faltaba: una card visible sin acceso directo se
 * lee como un olvido, no como una decisión. La barra se desliza; el costo de
 * un chip de más es mucho menor que el de una sección que parece perdida.
 */
export const SECCIONES_DEPOSITO: readonly DefSeccionDeposito[] = [
  { id: 'hoy', chip: 'Hoy' },
  { id: 'retiros', chip: 'Retiros' },
  { id: 'vacios', chip: 'Devoluciones' },
  { id: 'lcl', chip: 'LCL' },
  { id: 'plan', chip: 'Plan de carga' },
  { id: 'avisos', chip: 'Mis avisos' },
  // La agenda estaba en la página desde antes, pero fuera del modelo de
  // secciones: se veía y no se podía saltar a ella. Va última, como se ve.
  { id: 'agenda', chip: 'Agenda' },
] as const

/** El orden de siempre, solo los ids. */
export const ORDEN_BASE_DEPOSITO: readonly SeccionDepositoId[] = SECCIONES_DEPOSITO.map(s => s.id)

/** Ids válidos para el plegado de cards (`parseCardsCerradas` descarta el resto). */
export const IDS_SECCIONES_DEPOSITO: readonly SeccionDepositoId[] = ORDEN_BASE_DEPOSITO

/**
 * Lo que hay hoy en el portal, contado. Son los MISMOS números que ya pintan
 * los contadores de las cards: acá no se recalcula nada.
 */
export interface EstadoSeccionesDeposito {
  /** Filas de "Operativas de hoy". */
  operativasHoy: number
  /** Filas de "Retiros próximos". */
  retiros: number
  /** De esas, las que están LISTAS (`estadoRetiro(...) === 'listo'`). */
  retirosListos: number
  /** Filas de "Vacíos a devolver" (vencimientos + datos faltantes). */
  vacios: number
  /** De esas, las que están ahí por VENCIMIENTO (`motivo === 'vencimiento'`):
   *  LIBRE vencido o a LIBRE_DIAS_AVISO días o menos. */
  vaciosPorVencer: number
  /** Filas de "LCL a desconsolidar". */
  lcl: number
  /** Filas de "Mis avisos". */
  avisos: number
}

/** Estado vacío — sirve de base en los tests y en el primer render. */
export const SIN_NADA: EstadoSeccionesDeposito = {
  operativasHoy: 0, retiros: 0, retirosListos: 0,
  vacios: 0, vaciosPorVencer: 0, lcl: 0, avisos: 0,
}

/**
 * El orden en que se pintan las cards. Ver el docblock del archivo: con
 * operativas hoy manda el trabajo del día; sin operativas, "Hoy" baja SIEMPRE
 * debajo de retiros y vacíos, y entre esos dos sube primero lo que sangra
 * (vacíos por vencer) y después lo que se puede ir a buscar (retiros en verde).
 */
export function ordenSeccionesDeposito(e: EstadoSeccionesDeposito): readonly SeccionDepositoId[] {
  if (e.operativasHoy > 0) return ORDEN_BASE_DEPOSITO

  // El orden de estos dos `if` ES la prioridad que eligió Brian: primero lo que
  // sangra, después lo que se puede ir a buscar.
  const urgentes: SeccionDepositoId[] = []
  if (e.vaciosPorVencer > 0) urgentes.push('vacios')
  if (e.retirosListos > 0) urgentes.push('retiros')

  // Las dos cards de trabajo real van arriba SIEMPRE, con o sin urgencia: sin
  // nada urgente quedan en el orden de siempre. "Hoy" cae justo debajo — nunca
  // encabeza cuando está en cero, que es toda la regla.
  const trabajo: SeccionDepositoId[] = [
    ...urgentes,
    ...(['retiros', 'vacios'] as const).filter(id => !urgentes.includes(id)),
  ]
  const resto = ORDEN_BASE_DEPOSITO.filter(id => id !== 'hoy' && !trabajo.includes(id))
  return [...trabajo, 'hoy', ...resto]
}

/**
 * ¿Esta sección tiene algo adentro AHORA? Decide si va a la barra: un acceso
 * directo a una card vacía es un toque perdido.
 *
 * "Hoy" es la excepción a propósito: su card se muestra siempre —incluso
 * diciendo que no hay nada— y su chip es además la forma de volver arriba.
 */
export function seccionConContenido(e: EstadoSeccionesDeposito, id: SeccionDepositoId): boolean {
  switch (id) {
    case 'hoy': return true
    case 'retiros': return e.retiros > 0
    case 'vacios': return e.vacios > 0
    case 'lcl': return e.lcl > 0
    case 'avisos': return e.avisos > 0
    // El plan de 14 días y la agenda están SIEMPRE en la página (no dependen
    // de un contador), así que siempre se pueden ofrecer para saltar.
    case 'plan': return true
    case 'agenda': return true
  }
}

/** Chip de la barra: id + texto. */
export interface ChipSeccion {
  id: SeccionDepositoId
  chip: string
}

/**
 * Los chips de la barra, EN EL MISMO ORDEN en que se ven las cards. Tienen que
 * ir en orden de página: si no, el resaltado del scroll saltaría para atrás.
 */
export function chipsSeccionesDeposito(e: EstadoSeccionesDeposito): readonly ChipSeccion[] {
  const texto = new Map(SECCIONES_DEPOSITO.map(s => [s.id, s.chip]))
  const out: ChipSeccion[] = []
  for (const id of ordenSeccionesDeposito(e)) {
    const chip = texto.get(id)
    if (chip && seccionConContenido(e, id)) out.push({ id, chip })
  }
  return out
}

/** Con un solo destino no hay a dónde navegar: la barra sería ruido. */
export function hayBarraSecciones(chips: readonly ChipSeccion[]): boolean {
  return chips.length >= 2
}

/** Id del bloque en el DOM: el ancla a la que salta el chip. */
export const anclaSeccion = (id: SeccionDepositoId): string => `sec-${id}`

export interface PosicionSeccion {
  id: SeccionDepositoId
  /** Distancia del comienzo de la sección al BORDE INFERIOR del encabezado
   *  fijo, en px. Negativa = la sección ya pasó por debajo del encabezado. */
  top: number
}

/**
 * Qué chip se resalta mientras el usuario scrollea: la última sección que ya
 * empezó (su comienzo pasó por debajo del encabezado fijo). Arriba de todo,
 * antes de que ninguna haya empezado, se resalta la primera.
 *
 * `posiciones` tiene que venir en orden de página. La tolerancia absorbe el
 * medio píxel de un scroll suave: sin ella, el chip parpadea entre dos
 * secciones justo al terminar la animación.
 */
export function seccionActiva(
  posiciones: readonly PosicionSeccion[],
  tolerancia = 8,
): SeccionDepositoId | null {
  if (posiciones.length === 0) return null
  let activa = posiciones[0].id
  for (const p of posiciones) {
    if (p.top <= tolerancia) activa = p.id
  }
  return activa
}

/**
 * Clave del plegado de cards de ESTE portal, por usuario.
 *
 * Por usuario y no a secas porque en el depósito la computadora del mostrador
 * la usan varios: lo que pliega uno no puede aparecerle plegado al otro.
 * Y con nombre propio (no `hoyFclCardsCerradas`) para no mezclarse con las
 * cards de HOY del admin, que son otras.
 */
export const claveCardsDeposito = (usuario: string): string =>
  `depositoCardsCerradas:${String(usuario || '').trim().toLowerCase() || 'sin-usuario'}`

/**
 * ¿Se puede adoptar un orden nuevo AHORA, o hay que esperar?
 *
 * El orden se recalcula con datos vivos, y los datos cambian solos: apenas el
 * depósito toca "Devolví el vacío", se refrescan los avisos, y si el equipo
 * confirmó un retiro en el medio, ese retiro deja de estar "en verde" y las
 * cards se reordenan **abajo del dedo**. El toque siguiente cae sobre otro
 * contenedor.
 *
 * Es el mismo modo de falla que hizo que el banner tuviera que dejar de
 * cambiar de alto, y con el mismo costo: marcar el contenedor equivocado.
 *
 * Por eso el orden solo cambia cuando el usuario está **arriba de todo**, que
 * es cuando todavía no está apuntando a ninguna fila. Si está scrolleado, el
 * orden que tiene en pantalla se queda quieto hasta que vuelva a subir.
 */
export function puedeAdoptarOrden(
  actual: readonly SeccionDepositoId[] | null,
  nuevo: readonly SeccionDepositoId[],
  scrollY: number,
  umbral = 24,
): boolean {
  if (!actual) return true                                   // primer render
  if (actual.length === nuevo.length && actual.every((id, i) => id === nuevo[i])) return false
  return scrollY <= umbral
}
