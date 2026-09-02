/**
 * El saludo de bienvenida de cada pantalla: "Hola Cata, buenas tardes".
 *
 * Brian (02/09/2026): "que cada vez que inicias diga Hola Cata! por ejemplo,
 * o buenos días / buenas tardes / buenas noches, así con cada usuario".
 *
 * Puro y testeable: la hora y el nombre entran por parámetro. El umbral de
 * mañana/tarde es el mismo que usan los mails a clientes (lib/seguimientos.ts).
 */

/** Antes de esta hora es "buenos días" (mismo corte que los mails). */
export const HORA_TARDE = 13
/** Desde esta hora es "buenas noches". */
export const HORA_NOCHE = 20

export type Franja = 'dias' | 'tardes' | 'noches'

export function franjaHoraria(fecha: Date = new Date()): Franja {
  const h = fecha.getHours()
  if (h < HORA_TARDE) return 'dias'
  if (h < HORA_NOCHE) return 'tardes'
  return 'noches'
}

/** "Buenos días" · "Buenas tardes" · "Buenas noches". */
export function saludoHorario(fecha: Date = new Date()): string {
  const f = franjaHoraria(fecha)
  return f === 'dias' ? 'Buenos días' : f === 'tardes' ? 'Buenas tardes' : 'Buenas noches'
}

const LIMPIAR = /["'()]/g

/**
 * El nombre con el que se saluda a alguien: el primer nombre de pila.
 *  · "Catalina Simes" → "Catalina"
 *  · "cata@mediterraneacarghas.com" → "Cata" (la parte antes de la @, sin
 *    puntos ni números: los usuarios de equipo se logean con su email)
 *  · "CHIAPERO Y ASOC. S.R.L." → "Chiapero" (a una empresa se la saluda por
 *    su primera palabra, no por la razón social entera)
 * Devuelve '' si no hay nada usable: el llamador cae al saludo sin nombre.
 */
export function nombreDeSaludo(nombre?: string | null): string {
  const crudo = String(nombre ?? '').replace(LIMPIAR, ' ').trim()
  if (!crudo) return ''
  const base = crudo.includes('@') ? crudo.split('@')[0] : crudo
  const palabra = base
    .split(/[\s._-]+/)
    .map(p => p.replace(/[^\p{L}]/gu, ''))
    .find(p => p.length >= 2)
  if (!palabra) return ''
  // "CATALINA" o "catalina" → "Catalina"; "McCoy" o "Cata" quedan como están.
  const yaTieneForma = /\p{Lu}/u.test(palabra) && /\p{Ll}/u.test(palabra)
  return yaTieneForma ? palabra : palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase()
}

/**
 * El saludo completo de la pantalla: "Hola Cata, buenas tardes" o, sin nombre,
 * "Buenas tardes". Una sola coma y sin signos de exclamación: se lee todos los
 * días, varias veces por día.
 */
export function saludoPersonal(nombre?: string | null, fecha: Date = new Date()): string {
  const n = nombreDeSaludo(nombre)
  const hora = saludoHorario(fecha)
  return n ? `Hola ${n}, ${hora.toLowerCase()}` : hora
}
