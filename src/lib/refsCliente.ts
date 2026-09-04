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
 *    libre cargado a mano: hay una carga cuya `client_ref` dice literalmente
 *    el nombre del cliente, y un párrafo tampoco es un título. Lo que no pasa
 *    el filtro no se muestra: la principal vuelve a ser nuestro número.
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

/** Nombres comparables: mayúsculas, sin acentos y sin espacios de más, para
 *  que "chiapero  y asoc." y "CHIAPERO Y ASOC." sean el mismo nombre. */
const claveNombre = (v: unknown): string =>
  txt(v).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')

/**
 * ¿La referencia del cliente sirve como título de la carga?
 * No sirve si está vacía, si es el nombre del cliente (dato mal cargado) o si
 * pasa de REF_CLIENTE_MAX caracteres.
 */
export function refClienteSana(clientRef: unknown, ...nombres: unknown[]): boolean {
  const r = txt(clientRef)
  if (!r || r.length > REF_CLIENTE_MAX) return false
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
  if (!refClienteSana(propia, nombreCliente, s?.CLIENTE)) {
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
