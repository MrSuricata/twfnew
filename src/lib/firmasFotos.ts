/**
 * Cuándo hay que volver a pedirle al server las URLs de las fotos.
 *
 * Las miniaturas no son archivos públicos: el server las firma con
 * `createSignedUrls` y esa firma dura 8 horas (`THUMB_TTL` en
 * api/_lib/photoStorage.ts). Un portal que queda abierto toda la jornada —el
 * caso normal en una oficina— pasa las 8 horas y a partir de ahí muestra
 * íconos rotos, sin ningún error visible.
 *
 * La cura es la misma que ya usa el Diario (`useNoticias` en
 * NovedadesSection): volver a pedir cada tanto y al volver a la pestaña. Acá
 * vive SOLO la decisión —pura, testeable— de si toca pedir; el `useEffect`
 * que pide vive en el portal.
 *
 * Tres motivos y dos umbrales, porque no son lo mismo:
 *  · `intervalo` — el reloj de fondo. Se pide a las 4 h, la mitad de la vida
 *    de la firma: si el pedido falla, todavía quedan 4 h de margen. El reloj
 *    PREGUNTA cada `TICK_FIRMAS_MS` (minutos): el que decide es el umbral, no
 *    el pulso del `setInterval`.
 *  · `volvio` — el cliente volvió a la pestaña. Es el momento en que MIRA,
 *    así que alcanza con que la última vuelta no sea de recién: sin este
 *    piso, alguien que alterna entre dos pestañas dispara un pedido (y una
 *    firma de N URLs) por cada cambio de foco.
 *  · `rota` — una miniatura no cargó. Es la señal más directa de que la firma
 *    venció; mismo piso que `volvio` para que 20 imágenes rotas no sean 20
 *    pedidos.
 *
 * Spec: docs/superpowers/specs/2026-09-04-rediseno-portal-cliente-y-hoy-design.md (D3)
 */

/** Lo que dura la firma que manda el server (THUMB_TTL = 28800 s). */
export const FIRMA_TTL_MS = 8 * 60 * 60 * 1000

/** Cada cuánto se vuelve a pedir por reloj: la mitad de la vida de la firma. */
export const REFRESCO_FIRMAS_MS = 4 * 60 * 60 * 1000

/**
 * Cada cuánto CORRE el reloj de fondo. No es el umbral: es el pulso con el que
 * el portal le pregunta a `tocaRefrescarFirmas`.
 *
 * Son dos cosas distintas y confundirlas dejaba el refresco sin efecto: el
 * intervalo corría cada `REFRESCO_FIRMAS_MS` y preguntaba con ese mismo
 * umbral, pero la ventana se cuenta desde que el pedido RESOLVIÓ (arranque +
 * latencia), así que el primer tick llegaba con `edad = 4 h − latencia` y se
 * salteaba SIEMPRE. El refresco terminaba cayendo a las 8 h: el TTL exacto,
 * margen cero. Con un pulso corto el que decide es el umbral, que es lo que
 * pedía el diseño "reloj + umbral".
 */
export const TICK_FIRMAS_MS = 10 * 60 * 1000

/** Piso entre pedidos disparados por el usuario (volver a la pestaña, una
 *  miniatura rota). Ni un pedido por cada cambio de foco. */
export const REFRESCO_MIN_MS = 5 * 60 * 1000

export type MotivoRefresco = 'intervalo' | 'volvio' | 'rota'

/**
 * ¿Toca volver a pedir las URLs firmadas?
 *
 * @param ultimoMs cuándo se pidieron por última vez (ms epoch). `null` /
 *   `0` = nunca: siempre toca.
 * @param ahoraMs  ahora (ms epoch). Entra por parámetro para poder testear.
 */
export function tocaRefrescarFirmas(
  ultimoMs: number | null | undefined,
  ahoraMs: number,
  motivo: MotivoRefresco,
): boolean {
  const ultimo = Number(ultimoMs)
  if (!Number.isFinite(ultimo) || ultimo <= 0) return true
  const edad = Number(ahoraMs) - ultimo
  // Edad negativa = el reloj de la máquina se movió (o el valor quedó en el
  // futuro): se pide igual, que es el lado seguro.
  if (!Number.isFinite(edad) || edad < 0) return true
  return edad >= (motivo === 'intervalo' ? REFRESCO_FIRMAS_MS : REFRESCO_MIN_MS)
}

/**
 * La firma ya venció (pasaron las 8 h): lo que se ve en pantalla son íconos
 * rotos. Sirve para decidir si conviene esconder las miniaturas mientras
 * llega el pedido nuevo, en vez de mostrar cuadros vacíos.
 */
export function firmaVencida(ultimoMs: number | null | undefined, ahoraMs: number): boolean {
  const ultimo = Number(ultimoMs)
  if (!Number.isFinite(ultimo) || ultimo <= 0) return false
  return Number(ahoraMs) - ultimo >= FIRMA_TTL_MS
}

// ── El pedido en sí: una ventana que corre solo si el pedido SIRVIÓ ────────

/**
 * El estado del refresco, sin React: cuándo fue el último pedido que trajo
 * firmas nuevas y si hay uno en vuelo. El portal lo guarda en un `useRef` y le
 * pregunta; acá se puede testear.
 *
 * Dos cosas que el portal hacía mal y que este objeto no deja repetir:
 *  · Marcaba la ventana ANTES del fetch, así que un pedido que fallaba
 *    (offline de un minuto, 500 del server) quemaba las 4 h igual y el próximo
 *    intento por reloj era recién 4 h después — con la firma ya vencida.
 *  · Sin "en vuelo", contar solo los pedidos que salieron bien haría que 20
 *    miniaturas rotas dispararan 20 fetch: la ventana todavía no corrió.
 */
export interface RefrescoFirmas {
  /** ¿Sale un pedido ahora? Si vuelve `true`, queda marcado como en vuelo. */
  pedir(motivo: MotivoRefresco, ahoraMs?: number): boolean
  /** El pedido terminó. `ok` = trajo firmas nuevas: recién ahí corre la ventana. */
  termino(ok: boolean, ahoraMs?: number): void
  /** Cuándo resolvió el último pedido que sirvió (0 = ninguno todavía). */
  ultimoOk(): number
  /** Hay un pedido esperando respuesta. */
  enVuelo(): boolean
}

export function crearRefrescoFirmas(ultimoOkMs = 0): RefrescoFirmas {
  const inicial = Number(ultimoOkMs)
  let ultimo = Number.isFinite(inicial) && inicial > 0 ? inicial : 0
  let vuelo = false
  return {
    pedir(motivo, ahoraMs = Date.now()) {
      if (vuelo) return false
      if (!tocaRefrescarFirmas(ultimo, ahoraMs, motivo)) return false
      vuelo = true
      return true
    },
    termino(ok, ahoraMs = Date.now()) {
      vuelo = false
      if (ok) ultimo = ahoraMs
    },
    ultimoOk: () => ultimo,
    enVuelo: () => vuelo,
  }
}

// ── Las miniaturas que fallaron ───────────────────────────────────────────

/**
 * Qué miniaturas fallaron, atado a LAS FUENTES con las que fallaron.
 *
 * Sin ese atado, una miniatura rota quedaba rota para siempre: la fila tiene
 * `key` estable, el componente no se vuelve a montar cuando llegan URLs
 * nuevas, y con `rota === true` el `<img>` ni se dibuja. El refresco traía
 * firmas buenas y el cliente seguía viendo íconos de cámara hasta recargar la
 * página — justo el bug que este módulo existe para curar.
 */
export interface RotasMiniaturas {
  /** Huella de las fuentes que se dibujaban cuando fallaron. */
  clave: string
  /** Ids de las que fallaron con ESA clave. */
  ids: string[]
}

export const SIN_ROTAS: RotasMiniaturas = { clave: '', ids: [] }

/** La huella de lo que se está dibujando: si cambia, las firmas son otras. */
export function claveDeFuentes(fuentes: readonly string[]): string {
  // JSON y no un `join`: una fuente con el separador adentro no puede hacer
  // que dos listas distintas den la misma clave.
  return JSON.stringify([...(fuentes || [])])
}

/** Las que siguen rotas para estas fuentes. Fuentes nuevas → ninguna. */
export function rotasVigentes(estado: RotasMiniaturas | null | undefined, clave: string): string[] {
  return estado && estado.clave === clave ? estado.ids : []
}

/** Marca una miniatura como rota, olvidando las de fuentes viejas. */
export function conRota(
  estado: RotasMiniaturas | null | undefined, clave: string, id: string,
): RotasMiniaturas {
  const vigentes = rotasVigentes(estado, clave)
  if (vigentes.includes(id)) return estado as RotasMiniaturas
  return { clave, ids: [...vigentes, id] }
}
