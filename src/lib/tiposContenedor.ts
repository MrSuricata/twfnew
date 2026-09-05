/**
 * Tipos de contenedor — lista canónica, normalización y etiquetas.
 *
 * Por qué existe: hasta ahora el tipo era UN campo de texto libre a nivel CARGA.
 * Con eso en la base convivían "20GP" (12 filas) con "20 GP" (1), 51 contenedores
 * decían "FCL" (que es la MODALIDAD, no un tipo) y 3 decían literalmente
 * "20GP + 40HQ" — dos tipos escritos en un campo porque no había dónde poner el
 * segundo. El dato es del CONTENEDOR, no de la carga (pedido de Brian, 05/09).
 *
 * Reglas de normalización (todas puras, testeadas en tiposContenedor.test.ts):
 *  · mayúsculas y espacios: "20 gp" → "20GP"
 *  · 40HC es sinónimo de 40HQ → se guarda 40HQ
 *  · FCL / LCL son modalidad, no tipo → se guardan vacíos
 *  · lo que no cae en la lista NO se pierde: vuelve prolijo (mayúsculas, un solo
 *    espacio) y el selector lo ofrece como opción extra marcada, para que el
 *    operador vea qué había antes de elegir.
 */

/** Los que Brian usa + los especiales (05/09/2026). El orden es el del selector. */
export const TIPOS_CONTENEDOR = [
  '20GP', '40GP', '40HQ', '20NOR', '40NOR', '20OT', '40OT', '20FR', '40FR',
] as const

export type TipoContenedor = (typeof TIPOS_CONTENEDOR)[number]

const CANONICOS: ReadonlySet<string> = new Set(TIPOS_CONTENEDOR)

/** Qué es cada uno, en castellano de depósito. */
const DESCRIPCION: Record<TipoContenedor, string> = {
  '20GP': '20 pies estándar',
  '40GP': '40 pies estándar',
  '40HQ': '40 pies high cube',
  '20NOR': 'reefer apagado',
  '40NOR': 'reefer apagado',
  '20OT': 'open top',
  '40OT': 'open top',
  '20FR': 'flat rack',
  '40FR': 'flat rack',
}

/** Se escriben distinto pero son EL MISMO tipo. */
const SINONIMOS: Record<string, TipoContenedor> = {
  '40HC': '40HQ',
}

/** No son tipos de contenedor: son la MODALIDAD de la carga. Se descartan. */
const NO_ES_TIPO: ReadonlySet<string> = new Set(['FCL', 'LCL'])

/** Etiqueta del "todavía no se sabe" (la opción vacía del selector). */
export const SIN_TIPO_LABEL = '— sin definir —'

/** Sufijo que marca un valor viejo fuera de la lista dentro del selector. */
export const TIPO_LEGACY_SUFIJO = 'dato anterior, revisar'

/**
 * Normaliza un tipo de contenedor. Función PURA.
 *
 * Devuelve un código canónico ('20GP', '40HQ', …), vacío si no hay dato o si lo
 * que vino es una modalidad (FCL/LCL), o el valor viejo prolijo si no lo
 * reconoce (no se inventa ni se descarta nada).
 */
export function normalizarTipo(valor: unknown): string {
  // Prolijo: mayúsculas, sin espacios de más (ni al borde ni dobles adentro).
  const prolijo = String(valor ?? '').trim().toUpperCase().replace(/\s+/g, ' ')
  if (!prolijo) return ''
  // Compacto: sin espacios NI separadores decorativos ("40'HQ", "40-HQ").
  const compacto = prolijo.replace(/[\s'"._-]/g, '')
  if (NO_ES_TIPO.has(compacto)) return ''
  if (SINONIMOS[compacto]) return SINONIMOS[compacto]
  if (CANONICOS.has(compacto)) return compacto
  // Fuera de la lista: se conserva legible (ej. "20GP + 40HQ"), no se pisa.
  return prolijo
}

/** ¿El valor (ya normalizado) es uno de los tipos de la lista? */
export function esTipoCanonico(valor: unknown): boolean {
  return CANONICOS.has(normalizarTipo(valor))
}

/**
 * Etiqueta legible: `40HQ — 40 pies high cube`. El selector muestra la etiqueta
 * y guarda el código. Vacío → SIN_TIPO_LABEL. Fuera de lista → el valor tal cual.
 */
export function etiquetaTipo(valor: unknown): string {
  const t = normalizarTipo(valor)
  if (!t) return SIN_TIPO_LABEL
  const desc = DESCRIPCION[t as TipoContenedor]
  return desc ? `${t} — ${desc}` : t
}

export interface OpcionTipoContenedor {
  /** Lo que se guarda. */
  value: string
  /** Lo que se muestra. */
  label: string
  /** true = valor viejo fuera de la lista, ofrecido solo para no perderlo. */
  legacy?: boolean
}

/**
 * Opciones del desplegable: vacío + la lista canónica, y —si el contenedor trae
 * un valor viejo que no está en la lista ("20GP + 40HQ", "20DV")— una opción
 * extra MARCADA con ese valor. Así el operador ve qué había antes de elegir y
 * el dato no se pierde solo por abrir el panel.
 */
export function opcionesTipoContenedor(actual?: unknown): OpcionTipoContenedor[] {
  const opciones: OpcionTipoContenedor[] = [
    { value: '', label: SIN_TIPO_LABEL },
    ...TIPOS_CONTENEDOR.map(t => ({ value: t, label: etiquetaTipo(t) })),
  ]
  const v = normalizarTipo(actual)
  if (v && !CANONICOS.has(v)) {
    opciones.push({ value: v, label: `${v} — ${TIPO_LEGACY_SUFIJO}`, legacy: true })
  }
  return opciones
}

/**
 * Tipo a nivel CARGA, derivado de los contenedores (derive-on-read).
 *
 * Una carga con un 20GP y un 40HQ no puede mentir con uno solo: devuelve los
 * tipos distintos unidos con " + " ("20GP + 40HQ"), en el orden en que aparecen.
 * Si ningún contenedor tiene tipo, cae a la columna vieja de la carga (que se
 * normaliza igual: un "FCL" ahí adentro sale vacío).
 */
export function tipoDeCarga(
  operativas: readonly { TIPO?: string }[] | null | undefined,
  columna?: unknown,
): string {
  const vistos: string[] = []
  for (const o of operativas || []) {
    const t = normalizarTipo(o?.TIPO)
    if (t && !vistos.includes(t)) vistos.push(t)
  }
  if (vistos.length > 0) return vistos.join(' + ')
  return normalizarTipo(columna)
}
