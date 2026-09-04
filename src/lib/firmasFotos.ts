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
 *    de la firma: si el pedido falla, todavía quedan 4 h de margen.
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
