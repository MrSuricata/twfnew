/**
 * Cómo se NOMBRA una carga cuando la mira el cliente. Una sola regla para
 * todo el portal: cards de HOY, lista "Mis cargas", modales, PDF, alertas y
 * agenda.
 *
 * Brian (04/09/2026): "especialmente para Chiapero o VMG, les gusta ver su
 * referencia predominante en lugar de la nuestra; y para la nuestra no hace
 * falta ponerle TWF, solo el número sin la A delante".
 *
 * De ahí las tres reglas:
 *  · PRINCIPAL = la referencia del cliente, si está cargada y SIRVE. Es texto
 *    libre cargado a mano: hay cargas cuya `client_ref` dice literalmente el
 *    nombre del cliente, un párrafo tampoco es un título, y —lo más común—
 *    muchas traen un ALIAS NUESTRO en vez de la ref del cliente. Lo que no
 *    pasa el filtro no se muestra: la principal vuelve a ser nuestro número.
 *  · NUESTRO NÚMERO = los dígitos y nada más. Sin la "A" (regla de los mails
 *    con clientes) y SIN prefijo de marca: "8121", nunca "TWF 8121".
 *  · SECUNDARIA = la otra, siempre visible. El cliente llama o escribe citando
 *    cualquiera de las dos, y el equipo tiene que poder encontrar la carga.
 *
 * Lo que NO cambia: `shipment.REF` sigue siendo la clave interna (anclas,
 * keys de React, matching, búsquedas). Acá solo se decide qué se MUESTRA.
 *
 * Antes esto vivía tres veces (refsCliente en hoyCliente, refParaCliente en
 * clientAgenda, un `.replace(/^A/i,'')` suelto en el PDF) y la misma carga se
 * veía "TWF 8121", "8121" y "A8121" según la sección.
 *
 * Puro: sin React, sin fetch. Spec D2 · 2026-09-04-rediseno-portal-cliente.
 */

export interface RefsCliente {
  /** Lo que va grande: la ref del cliente, o nuestro número ("8121"). */
  principal: string
  /** Lo que va chico: nuestro número cuando la principal es la del cliente
   *  ('' cuando la principal YA es la nuestra — no se repite). */
  secundaria: string
  /** true = se está mostrando la referencia propia del cliente. */
  propia: boolean
}

/** Una ref del cliente más larga que esto no es un identificador: es una
 *  descripción que alguien pegó en el campo. No se usa de título. */
export const REF_CLIENTE_MAX = 24

const txt = (v: unknown): string => String(v ?? '').trim()

/**
 * Nuestro número tal como se lo decimos al cliente: sin la "A" inicial.
 * La "A" se saca SOLO si le sigue un dígito, así las refs que no son FCL de
 * la planilla quedan intactas: "E200", "LCL00365UY", "AIT-1" no se mutilan.
 * El sufijo de operación dividida se conserva: "A8068 B" → "8068 B".
 */
export function numeroNuestro(ref: unknown): string {
  return txt(ref).replace(/^A(?=\d)/, '')
}

/** Los dígitos de una ref, sin ceros a la izquierda: "LCL127" y "E127" son
 *  los dos "127". Es lo que permite reconocer un alias de nuestra propia ref. */
const digitos = (v: unknown): string => txt(v).replace(/\D/g, '').replace(/^0+/, '')

/** Cantidad mínima de dígitos para animarse a decir "esto es un alias nuestro".
 *  Con menos, la coincidencia es casualidad: nuestra "8121" CONTIENE "1". */
const MIN_DIGITOS_ALIAS = 3

/**
 * ¿Lo cargado en `client_ref` es en realidad NUESTRA propia ref con otra
 * cara? Verificado contra la base el 04/09/2026: de las 243 LCL activas, las
 * 243 traen un alias nuestro y NINGUNA la ref del cliente — "E127" tiene
 * "LCL127", "E160 B" tiene "LCL160B", "R84I26040203" tiene "LCLBUE6040203".
 * Mostrarlas como "su referencia" sería peor que no hacer nada: le pondríamos
 * al cliente, en grande, un código interno que él nunca vio.
 *
 * Se comparan los DÍGITOS, que es lo que sobrevive al cambio de prefijo, y se
 * acepta que uno contenga al otro (nuestra "8426040203" contiene "6040203").
 * Las 16 FCL con ref propia real no se tocan: "1410" no vive dentro de "8121".
 */
export function esAliasNuestro(clientRef: unknown, ref: unknown): boolean {
  const c = digitos(clientRef)
  const n = digitos(ref)
  if (c.length < MIN_DIGITOS_ALIAS || n.length < MIN_DIGITOS_ALIAS) return false
  return c === n || c.includes(n) || n.includes(c)
}

/** Nombres comparables: mayúsculas, sin acentos y sin espacios de más, para
 *  que "chiapero  y asoc." y "CHIAPERO Y ASOC." sean el mismo nombre. */
const claveNombre = (v: unknown): string =>
  txt(v).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')

/**
 * ¿Esto parece el NOMBRE de una empresa y no una referencia?
 *
 * Comparar contra el nombre del cliente no alcanza: el portal recibe ese
 * nombre de `client_users`, donde puede estar cargado el de la persona de
 * contacto y no la razón social — y entonces "BICI PERETTI S.A." pasaría el
 * filtro y saldría de título grande (pasa hoy en la base: 4 cargas tienen la
 * razón social metida en `client_ref`).
 *
 * Regla independiente de quién esté mirando: una referencia **sin un solo
 * dígito y con más de una palabra** no es un identificador. Las refs reales
 * de los clientes siempre traen números ("1410", "OCE 80-1", "2051-5 / 2054",
 * "LY26-BP001-1"), y una sigla suelta de una palabra se conserva por las
 * dudas.
 */
function pareceNombre(r: string): boolean {
  return !/\d/.test(r) && r.trim().split(/\s+/).length > 1
}

/**
 * ¿La referencia del cliente sirve como título de la carga?
 * No sirve si está vacía, si pasa de REF_CLIENTE_MAX caracteres, si es el
 * nombre del cliente (dato mal cargado), si PARECE un nombre aunque no
 * conozcamos el del cliente, o si es un alias de nuestra propia ref (ver
 * `esAliasNuestro`).
 */
export function refClienteSana(clientRef: unknown, ...nombres: unknown[]): boolean {
  const r = txt(clientRef)
  if (!r || r.length > REF_CLIENTE_MAX) return false
  if (pareceNombre(r)) return false
  const clave = claveNombre(r)
  return !nombres.some(n => txt(n) && claveNombre(n) === clave)
}

/**
 * Las dos referencias de una carga para el cliente.
 * `nombreCliente` lo pasa el portal (el server manda CLIENTE vacío: el portal
 * ya sabe quién es); si no viene, se usa el CLIENTE de la propia carga.
 */
export function refsCliente(
  s: { REF?: unknown; CLIENT_REF?: unknown; CLIENTE?: unknown } | null | undefined,
  nombreCliente?: unknown,
): RefsCliente {
  const nuestro = numeroNuestro(s?.REF)
  const propia = txt(s?.CLIENT_REF)
  if (!refClienteSana(propia, nombreCliente, s?.CLIENTE) || esAliasNuestro(propia, s?.REF)) {
    return { principal: nuestro, secundaria: '', propia: false }
  }
  // Si el cliente cargó exactamente nuestro número, no se repite dos veces.
  const repetida = propia === nuestro || propia === txt(s?.REF)
  return { principal: propia, secundaria: repetida ? '' : nuestro, propia: true }
}

/** Las dos refs en un solo renglón ("1410 · 8121"), para los lugares donde no
 *  entra un segundo elemento (los chips del calendario). */
export function refsEnLinea(r: RefsCliente): string {
  return r.secundaria ? `${r.principal} · ${r.secundaria}` : r.principal
}
