/**
 * Caja de comentarios de los portales de partners: "¿algo no funcionó?".
 *
 * Brian (04/09/2026) está por dar de alta los usuarios reales de GODILCO,
 * PLANIR y los transportes. La primera semana de uso es la única en la que la
 * fricción se ve: después el usuario se acostumbra al problema y deja de
 * nombrarlo. Por eso el encuadre es ANGOSTO — "¿algo no funcionó?", no
 * "sugerencias": en fase de prueba la gente reporta problemas concretos, no
 * imagina mejoras, y una caja de sugerencias se llena de silencio.
 * Spec: docs/superpowers/specs/2026-09-04-caja-comentarios-partners-design.md
 *
 * Este módulo es el CONTRATO compartido entre el portal de partners, la card
 * de HOY admin y la API. Nadie redefine estos tipos ni estas reglas en otro
 * lado. El espejo del servidor vive en `api/_lib/partnerFeedbackRules.ts`
 * (la API no importa código de src/) y un test corre los DOS caminos sobre la
 * misma matriz de casos.
 *
 * Todo acá es PURO: sin `window`, sin fetch, sin estado. Lo que necesita el
 * navegador (ancho de pantalla, user agent) entra como parámetro.
 */
import type { PartnerRol } from './partnerAvisos.js'

// ── Topes ────────────────────────────────────────────────────────────────
// Los dos primeros son los MISMOS que los CHECK de `partner_feedback`
// (texto 1..2000, respuesta <=2000): si acá se agrandan sin tocar la tabla, el
// insert explota con un error de Postgres en vez de un mensaje amigable.

export const TOPE_TEXTO = 2000
export const TOPE_RESPUESTA = 2000
/** El "¿en qué estabas?" es una etiqueta, no un relato. */
export const TOPE_PANTALLA = 160
export const TOPE_REF = 40
export const TOPE_CORTO = 120

export type FeedbackEstado = 'nuevo' | 'leido' | 'respondido'
export type FeedbackAccion = 'visto' | 'responder'

/**
 * El contexto que se captura SOLO, sin que el usuario escriba nada. Es la
 * mitad del valor del comentario: "no me dejó marcar el retiro" sin esto no se
 * puede reproducir. `navegador` + `viewport` + `movil` no son un detalle — los
 * depósitos entran desde el celular, parados en el predio, y ahí aparece la
 * mitad de los problemas que en escritorio no se ven.
 */
export interface ContextoFeedback {
  /** "HOY del depósito" — precargado con la pantalla, editable por el usuario. */
  pantalla: string
  /** Ruta del navegador: "/depot", "/transport". */
  ruta: string
  /** Ref de la carga que tenía a mano, si había una. '' = ninguna. */
  ref: string
  /** "Chrome en Android". '' si el user agent no dice nada. */
  navegador: string
  /** "390×844". '' si no se pudo medir. */
  viewport: string
  /** Ancho < 768: entró desde el celular. */
  movil: boolean
}

export const CONTEXTO_VACIO: ContextoFeedback = {
  pantalla: '', ruta: '', ref: '', navegador: '', viewport: '', movil: false,
}

/** Un comentario, como lo ven el partner y el equipo. */
export interface PartnerComentario {
  id: string
  partnerEmail: string
  partnerName: string
  partnerRole: PartnerRol
  /** Alcance del partner: PLANIR, GODILCO, TRANSCAL… */
  partnerFilter: string
  texto: string
  contexto: ContextoFeedback
  estado: FeedbackEstado
  respuesta: string
  /** Email del admin que respondió (identidad de login, no el nombre visible). */
  respondidoPor: string
  respondidoAt: string | null
  createdAt: string
}

/** Lo que manda el partner al escribir. La identidad NO viaja: el servidor la
 *  relee de `partner_users` (email, nombre, rol y alcance). */
export interface NuevoComentario {
  texto: string
  contexto?: Partial<ContextoFeedback>
}

// ── Validación del texto ─────────────────────────────────────────────────
// Espejo exacto en api/_lib/partnerFeedbackRules.ts (mensajes incluidos).

export type ResultadoTexto =
  | { ok: true; texto: string }
  | { ok: false; error: string }

const recortar = (v: unknown): string => String(v ?? '').trim()

export const ERROR_TEXTO_VACIO = 'Escribí qué fue lo que no funcionó.'
export const ERROR_RESPUESTA_VACIA = 'Escribí la respuesta: el partner la va a ver.'

/** El comentario: 1 a 2000 caracteres ya recortados (mismo criterio que el
 *  CHECK de la tabla, que valida `btrim(texto)`). */
export function validarTexto(v: unknown): ResultadoTexto {
  const texto = recortar(v)
  if (!texto) return { ok: false, error: ERROR_TEXTO_VACIO }
  if (texto.length > TOPE_TEXTO) {
    return { ok: false, error: `El comentario no puede pasar de ${TOPE_TEXTO} caracteres (escribiste ${texto.length}).` }
  }
  return { ok: true, texto }
}

/** La respuesta del equipo: mismas reglas, otro mensaje. */
export function validarRespuesta(v: unknown): ResultadoTexto {
  const texto = recortar(v)
  if (!texto) return { ok: false, error: ERROR_RESPUESTA_VACIA }
  if (texto.length > TOPE_RESPUESTA) {
    return { ok: false, error: `La respuesta no puede pasar de ${TOPE_RESPUESTA} caracteres (escribiste ${texto.length}).` }
  }
  return { ok: true, texto }
}

// ── Estado ───────────────────────────────────────────────────────────────
// nuevo → leido → respondido, y NUNCA para atrás: marcar visto un comentario
// ya respondido lo dejaría "sin responder" en la card y el partner vería
// desaparecer la respuesta que ya leyó. Responder de nuevo sí se puede: es
// corregir lo que se dijo, no retroceder.

const ORDEN_ESTADO: Record<FeedbackEstado, number> = { nuevo: 0, leido: 1, respondido: 2 }

/** El estado que queda después de la acción del equipo. */
export function estadoTrasAccion(actual: FeedbackEstado, accion: FeedbackAccion): FeedbackEstado {
  if (accion === 'responder') return 'respondido'
  return actual === 'respondido' ? 'respondido' : 'leido'
}

/** ¿La acción cambia algo? Marcar visto dos veces no escribe la segunda. */
export function cambiaEstado(actual: FeedbackEstado, accion: FeedbackAccion): boolean {
  return accion === 'responder' || estadoTrasAccion(actual, accion) !== actual
}

/** Orden del estado (para el invariante "nunca retrocede"). */
export function ordenEstado(e: FeedbackEstado): number {
  return ORDEN_ESTADO[e] ?? 0
}

/** Sin leer = todavía nadie del equipo lo miró. Es lo que cuenta el header de
 *  la card: plegada tiene que seguir avisando. */
export function sinLeer(comentarios: PartnerComentario[]): PartnerComentario[] {
  return comentarios.filter(c => c.estado === 'nuevo')
}

/** Lo que el equipo tiene para atender: todo lo que no está respondido, del
 *  más viejo al más nuevo (el que más espera, primero). */
export function pendientesDeRespuesta(comentarios: PartnerComentario[]): PartnerComentario[] {
  return comentarios
    .filter(c => c.estado !== 'respondido')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
}

/** Los que el partner tiene que ver al entrar: los suyos ya respondidos, del
 *  más nuevo primero. */
export function conRespuesta(comentarios: PartnerComentario[]): PartnerComentario[] {
  return comentarios
    .filter(c => c.estado === 'respondido' && !!c.respuesta.trim())
    .sort((a, b) => String(b.respondidoAt || b.createdAt).localeCompare(String(a.respondidoAt || a.createdAt)))
}

// ── Contexto ─────────────────────────────────────────────────────────────

const cap = (v: unknown, max: number): string => recortar(v).slice(0, max)

/**
 * "Chrome en Android". Puro y a propósito grosero: no queremos identificar el
 * dispositivo, queremos saber si el problema es del celular. Se guarda esto y
 * NO el user agent crudo (largo, ilegible y más identificatorio de lo que hace
 * falta para reproducir un bug).
 */
export function describirNavegador(ua: string): string {
  const s = String(ua || '')
  if (!s.trim()) return ''
  const nav =
    /\bEdgA?\//.test(s) ? 'Edge'
    : /\bOPR\/|\bOpera\b/.test(s) ? 'Opera'
    : /\bSamsungBrowser\//.test(s) ? 'Samsung Internet'
    : /\bFirefox\/|\bFxiOS\//.test(s) ? 'Firefox'
    : /\bCriOS\/|\bChrome\//.test(s) ? 'Chrome'
    : /\bSafari\//.test(s) ? 'Safari'
    : ''
  const so =
    /\bAndroid\b/.test(s) ? 'Android'
    : /\b(iPhone|iPad|iPod)\b/.test(s) ? 'iOS'
    : /\bWindows\b/.test(s) ? 'Windows'
    : /\bMac OS X\b|\bMacintosh\b/.test(s) ? 'Mac'
    : /\bLinux\b/.test(s) ? 'Linux'
    : ''
  if (nav && so) return `${nav} en ${so}`
  return cap(nav || so, TOPE_CORTO)
}

/**
 * Deja el contexto en su forma canónica: sólo las claves del contrato, todas
 * string (salvo `movil`), recortadas y con tope. Lo corre el cliente al armar
 * el contexto y OTRA VEZ el servidor sobre lo que llega: `contexto` es un
 * jsonb y sin esto entraría cualquier cosa, de cualquier tamaño.
 */
export function sanearContexto(raw: unknown): ContextoFeedback {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw as Record<string, unknown> : {}
  return {
    pantalla: cap(o.pantalla, TOPE_PANTALLA),
    ruta: cap(o.ruta, TOPE_CORTO),
    ref: cap(o.ref, TOPE_REF).toUpperCase(),
    navegador: cap(o.navegador, TOPE_CORTO),
    viewport: cap(o.viewport, 20),
    movil: o.movil === true,
  }
}

/** Lo que el navegador puede contar de sí mismo, sin preguntarle nada al usuario. */
export interface EntradaContexto {
  pantalla?: string
  ruta?: string
  ref?: string
  ua?: string
  ancho?: number
  alto?: number
}

/** Arma el contexto (y lo sanea): lo que se manda con el comentario. */
export function armarContexto(e: EntradaContexto): ContextoFeedback {
  const ancho = Number(e.ancho) || 0
  const alto = Number(e.alto) || 0
  return sanearContexto({
    pantalla: e.pantalla,
    ruta: e.ruta,
    ref: e.ref,
    navegador: describirNavegador(String(e.ua || '')),
    viewport: ancho > 0 && alto > 0 ? `${Math.round(ancho)}×${Math.round(alto)}` : '',
    movil: ancho > 0 && ancho < 768,
  })
}

/** "HOY del depósito · A8121 · Chrome en Android · 390×844 (celular)". Lo que
 *  lee el equipo en la card para saber desde dónde escribieron. */
export function textoContexto(c: ContextoFeedback | null | undefined): string {
  if (!c) return ''
  const partes = [
    c.pantalla,
    c.ref,
    c.navegador,
    c.viewport ? `${c.viewport}${c.movil ? ' (celular)' : ''}` : (c.movil ? 'celular' : ''),
  ].filter(Boolean)
  return partes.join(' · ')
}

/** Quién escribió: el alcance (PLANIR, TRANSCAL…) es lo que el equipo
 *  reconoce; si no hay, el nombre; si tampoco, el email. Mismo criterio que
 *  `quienPartner` de los avisos. */
export function quienComento(c: PartnerComentario): string {
  return String(c.partnerFilter || '').trim()
    || String(c.partnerName || '').trim()
    || String(c.partnerEmail || '').trim()
}
