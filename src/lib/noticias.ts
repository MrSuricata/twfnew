// ── Novedades logísticas (Brian 28/08) ───────────────────────────────────
// Noticias y avisos operativos que se cargan desde Admin → Contenido web y se
// muestran en la landing (sección estilo diario + alerta 1×/día) y en
// /novedades. La regla de oro es la VIGENCIA: la portada solo muestra lo
// vigente — sin notas viejas, la web nunca se ve abandonada.
// Regla de contenido: SIN números de tarifas (cualitativo siempre).

export interface Noticia {
  id: string
  titulo: string
  bajada: string
  cuerpo: string
  categoria: string
  imagenUrl: string
  /** Se muestra como alerta al abrir la web (1 vez por día por visitante). */
  alerta: boolean
  activo: boolean
  publicadaAt: string       // ISO timestamp
  /** Última edición (ISO). Una nota actualizada vuelve arriba: lo último que
   *  tocamos es lo primero que se ve (Brian 02/09). */
  actualizadaAt: string
  /** '' = sin vencimiento. 'YYYY-MM-DD' = última fecha en portada. */
  vigenteHasta: string
  // ── Slide del carrusel de portada (todos opcionales, con fallback) ──
  /** Variante visual: 'violeta' | 'celeste' | 'actualizacion' | 'papel'. '' = según categoría. */
  estilo: string
  /** Texto de la pill naranja. '' = etiqueta de la categoría. */
  kicker: string
  /** Texto corto al lado del kicker (fecha, país…). '' = fecha de publicación. */
  kickerExtra: string
  /** Pill celeste bajo el título (variante celeste) o 2º párrafo (actualización). */
  subtitulo: string
  /** Mensaje de la columna derecha del slide. */
  mensaje: string
  /** Nota fuente ("Ir a la noticia"). '' = /novedades. */
  linkUrl: string
}

export type EstiloSlide = 'violeta' | 'celeste' | 'actualizacion' | 'papel'

/** Variante visual del slide: la elegida a mano o la de su categoría. */
export function estiloSlide(n: Pick<Noticia, 'estilo' | 'categoria'>): EstiloSlide {
  const e = (n.estilo || '').toLowerCase()
  if (e === 'violeta' || e === 'celeste' || e === 'actualizacion' || e === 'papel') return e
  if (n.categoria === 'tifones') return 'violeta'
  if (n.categoria === 'feriados') return 'papel'
  return 'celeste'
}

/** 'Tifones en China:|cierres portuarios' → ['Tifones en China:', 'cierres portuarios'].
 *  La barra corta el título en dos líneas; la 2ª va en el color de acento del slide. */
export function tituloPartes(titulo: string): [string, string] {
  const ix = titulo.indexOf('|')
  return ix === -1 ? [titulo, ''] : [titulo.slice(0, ix).trim(), titulo.slice(ix + 1).trim()]
}

/** Título sin la barra, para listas y textos corridos. */
export const tituloPlano = (titulo: string) => titulo.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim()

/** Ancla de una nota dentro del Diario. Sirve de id en la página y de hash en
 *  el link, así el botón del banner abre justo esa nota. */
export const anclaNoticia = (id: string): string => `nota-${String(id || '').trim()}`

/** A dónde manda el botón del banner de los portales: SIEMPRE al Diario, con la
 *  nota abierta. Brian (03/09): "si lo mandamos a la noticia directamente no la
 *  puede leer; al Diario ve otras cosas y cómo lo tenemos armado". La fuente
 *  externa queda como enlace secundario (linkNoticia). */
export const linkDiario = (n: Pick<Noticia, 'id'>): string => `/novedades#${anclaNoticia(n.id)}`

/** Solo se navega a links http(s) — cualquier otra cosa cae en /novedades. */
export function linkNoticia(n: Pick<Noticia, 'linkUrl'>): { href: string; externo: boolean } {
  const url = (n.linkUrl || '').trim()
  if (/^https?:\/\//i.test(url)) return { href: url, externo: true }
  return { href: '/novedades', externo: false }
}

/** Categorías con su estética (chips estilo landing Mediterránea). */
export const CATEGORIAS: Record<string, { label: string; chip: string }> = {
  tifones: { label: 'Tifones · Clima', chip: 'bg-amber-100 text-amber-800' },
  feriados: { label: 'Feriados · Asia', chip: 'bg-[#9bd1e5]/30 text-[#261c79]' },
  fletes: { label: 'Fletes marítimos', chip: 'bg-cyan-100 text-cyan-800' },
  paros: { label: 'Paros · Gremiales', chip: 'bg-rose-100 text-rose-800' },
  general: { label: 'Interés general', chip: 'bg-[#e5e4f1] text-[#49286b]' },
}

export const categoriaMeta = (c: string) => CATEGORIAS[c] || CATEGORIAS.general

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

/** ¿La noticia está vigente hoy? (activa y sin vencer). */
export function esVigente(n: Pick<Noticia, 'activo' | 'vigenteHasta'>, hoyISO: string): boolean {
  if (!n.activo) return false
  const v = (n.vigenteHasta || '').slice(0, 10)
  if (!ISO_RE.test(v)) return true         // sin vencimiento
  return v >= hoyISO
}

/** Cuán reciente es una nota: la más nueva entre publicación y última edición.
 *  Actualizar el Cristo Redentor a "cerrado" tiene que subirla, aunque la nota
 *  se haya publicado la semana pasada. */
export function recencia(n: Pick<Noticia, 'publicadaAt' | 'actualizadaAt'>): string {
  const p = String(n.publicadaAt || '')
  const a = String(n.actualizadaAt || '')
  return a > p ? a : p
}

/** Vigentes, lo último que subimos o actualizamos primero. */
export function noticiasVigentes<T extends Noticia>(list: T[], hoyISO: string): T[] {
  return list
    .filter(n => esVigente(n, hoyISO))
    .sort((a, b) => recencia(b).localeCompare(recencia(a)))
}

/** Las que se muestran como alerta al abrir la web. */
export function alertasVigentes<T extends Noticia>(list: T[], hoyISO: string): T[] {
  return noticiasVigentes(list, hoyISO).filter(n => n.alerta)
}

/** Orden del carrusel de portada: los avisos abren y atrás el resto, todo de
 *  más nuevo a más viejo (Brian 02/09: "que se vean primeras las últimas
 *  subidas"). Antes el resto iba invertido y la nota más vieja abría el bloque. */
export function ordenSlides<T extends Noticia>(vigentes: T[], max = 6): T[] {
  const top = vigentes.slice(0, max)
  return [...top.filter(n => n.alerta), ...top.filter(n => !n.alerta)]
}

const LS_KEY = 'med_novedad_alerta_vista'

/** Clave del día + ids: si cambia el día O aparece una alerta nueva, se vuelve
 *  a mostrar. Cerrarla la marca vista por hoy en este navegador. */
export function claveAlertas(hoyISO: string, alertas: Pick<Noticia, 'id'>[]): string {
  return hoyISO + '|' + alertas.map(a => a.id).sort().join(',')
}

export function alertaYaVista(hoyISO: string, alertas: Pick<Noticia, 'id'>[]): boolean {
  try {
    return localStorage.getItem(LS_KEY) === claveAlertas(hoyISO, alertas)
  } catch { return true }   // sin localStorage (SSR/privacidad): no molestar
}

export function marcarAlertaVista(hoyISO: string, alertas: Pick<Noticia, 'id'>[]): void {
  try { localStorage.setItem(LS_KEY, claveAlertas(hoyISO, alertas)) } catch { /* no-op */ }
}

/** Fila de la API (snake_case) → Noticia. */
export function rowToNoticia(r: Record<string, unknown>): Noticia {
  const s = (v: unknown) => String(v ?? '')
  return {
    id: s(r.id),
    titulo: s(r.titulo),
    bajada: s(r.bajada),
    cuerpo: s(r.cuerpo),
    categoria: s(r.categoria) || 'general',
    imagenUrl: s(r.imagen_url ?? r.imagenUrl),
    alerta: !!r.alerta,
    activo: r.activo !== false,
    publicadaAt: s(r.publicada_at ?? r.publicadaAt),
    actualizadaAt: s(r.updated_at ?? r.actualizadaAt),
    vigenteHasta: s(r.vigente_hasta ?? r.vigenteHasta),
    estilo: s(r.estilo),
    kicker: s(r.kicker),
    kickerExtra: s(r.kicker_extra ?? r.kickerExtra),
    subtitulo: s(r.subtitulo),
    mensaje: s(r.mensaje),
    linkUrl: s(r.link_url ?? r.linkUrl),
  }
}

// ── Aviso operativo rotativo (portales de depósito, transporte y cliente) ──

/** Cada cuánto pasa al siguiente aviso. Ocho segundos alcanzan para leer
 *  título y bajada sin que el panel parezca quieto. */
export const AVISO_ROTACION_MS = 8000

/** Cada cuánto el portal vuelve a pedir el Diario. Igual al caché del server
 *  (s-maxage=300): pedir más seguido no trae nada nuevo. */
export const NOTICIAS_REFRESCO_MS = 5 * 60 * 1000

/** Lo que va pasando en el banner de los portales: las MISMAS tarjetas y en el
 *  MISMO orden que el carrusel del Diario (avisos primero, después el resto,
 *  todo de más nuevo a más viejo). Brian 03/09: "para todos aparece lo de los
 *  3 tifones; que vayan pasando las noticias cada ciertos segundos, conectado
 *  con el diario, los banners y las tarjetas". Antes el banner mostraba solo la
 *  primera alerta, fija. */
export function avisosRotativos<T extends Noticia>(list: T[], hoyISO: string, max = 6): T[] {
  return ordenSlides(noticiasVigentes(list, hoyISO), max)
}

/** Índice del siguiente aviso; vuelve al primero al terminar. Con una sola
 *  tarjeta (o ninguna) se queda en 0. */
export function indiceSiguiente(actual: number, total: number): number {
  if (total <= 1) return 0
  return (actual + 1) % total
}

/** Si la lista cambió (una nota nueva, una vencida) el índice guardado puede
 *  apuntar afuera: se acomoda al rango en vez de dejar el banner en blanco. */
export function indiceValido(actual: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(Math.max(0, actual), total - 1)
}

// ── Cuánto texto entra en un slide del carrusel (Brian 03/09) ─────────────
// "acá en el diario logístico aparece texto cortado, no puede pasarnos más".
// El slide se maqueta en una caja fija de 1600×900 y después se escala entero,
// así que una nota larga desbordaba ese alto y el último renglón quedaba
// partido contra el borde (pasaba en la nota del conflicto en TCP, que cortaba
// a la mitad de "Trabajo"). Acá calculamos, para el alto real de cada columna,
// cuántas líneas entra cada bloque; el componente las recorta con line-clamp,
// que corta SIEMPRE en un borde de renglón y termina en puntos suspensivos, y
// el botón "Ir a la noticia" lleva a leerla completa.
//
// La garantía no depende de que la estimación sea exacta: el alto que reserva
// cada bloque es el mismo número de líneas que después recorta el CSS, así que
// la suma de las reservas nunca puede pasarse del alto de la columna. Si la
// estimación se queda corta lo único que pasa es que sobran puntos suspensivos;
// nunca queda un renglón cortado por la mitad.

/** Ancho medio de un carácter, como fracción del tamaño de fuente. Medido con
 *  canvas sobre las fuentes reales del slide (Montserrat 400/600 y Nunito 900)
 *  con los textos que hay cargados hoy, y redondeado PARA ARRIBA a propósito:
 *  conviene estimar de más (una nota queda un punto más chica) que de menos
 *  (aparecerían puntos suspensivos donde el texto entraba entero). */
export const ANCHO_CARACTER = {
  /** Montserrat 300/400, texto corrido. Medido 0,50. */
  texto: 0.55,
  /** Nunito 900 con letter-spacing -0.02em, títulos y mensajes destacados. Medido 0,49. */
  titulo: 0.52,
  /** Montserrat 600 en MAYÚSCULAS con letter-spacing 0.08em (kicker). Medido 0,70. */
  kicker: 0.70,
} as const

/** Los `**` de las negritas nunca se ven en pantalla: no ocupan ancho. */
const sinNegritas = (texto: string): string => String(texto || '').replace(/\*\*/g, '')

/** Cuántas líneas ocupa un texto en un ancho dado. Corta por palabras igual que
 *  el navegador (una palabra más larga que la línea se parte en varias) y
 *  respeta los saltos de línea explícitos (`\n`), que es como el título manda
 *  su segunda mitad. */
export function lineasEstimadas(
  texto: string,
  { ancho, fontSize, factor = ANCHO_CARACTER.texto }: { ancho: number; fontSize: number; factor?: number },
): number {
  const limpio = sinNegritas(texto).trim()
  if (!limpio) return 0
  const cupo = Math.max(1, Math.floor(ancho / (fontSize * factor)))
  let lineas = 0
  for (const parrafo of limpio.split('\n')) {
    let enLinea = 0
    lineas++
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      if (enLinea === 0) {
        enLinea = palabra.length
        if (palabra.length > cupo) lineas += Math.ceil(palabra.length / cupo) - 1
      } else if (enLinea + 1 + palabra.length <= cupo) {
        enLinea += 1 + palabra.length
      } else {
        lineas++
        enLinea = palabra.length
        if (palabra.length > cupo) lineas += Math.ceil(palabra.length / cupo) - 1
      }
    }
  }
  return lineas
}

export interface BloqueTexto {
  /** Nombre con el que el componente lee el resultado. */
  clave: string
  texto: string
  /** Ancho útil del texto en px de diseño (la columna menos sus paddings). */
  ancho: number
  /** Escalones de tamaño de fuente, del más grande al más chico: si el texto no
   *  entra, primero se achica un punto antes de recortar. */
  tamanos: number[]
  lineHeight: number
  /** Ancho medio de carácter (ver ANCHO_CARACTER). */
  factor?: number
  /** Alto propio del bloque además del texto: el padding de la tarjeta blanca o
   *  el de la pill celeste. */
  extra?: number
}

export interface BloqueAjustado {
  clave: string
  fontSize: number
  lineHeight: number
  /** Líneas que se muestran. 0 = no entra nada y el bloque no se dibuja. */
  maxLineas: number
  /** Alto que el bloque tiene reservado en la columna. */
  alto: number
  /** El texto no entró entero: termina en puntos suspensivos. */
  recortado: boolean
}

/** Renglones que se le aseguran a cada bloque antes de repartir el resto: un
 *  bloque que aparece con un solo renglón no se entiende. */
const PISO_LINEAS = 2

function repartir(bloques: BloqueTexto[], paso: number, libre: number): BloqueAjustado[] {
  const items = bloques.map(b => {
    const fontSize = b.tamanos[Math.min(paso, b.tamanos.length - 1)]
    const caja = fontSize * b.lineHeight
    const extra = b.extra || 0
    const pide = lineasEstimadas(b.texto, { ancho: b.ancho, fontSize, factor: b.factor })
    return { b, fontSize, caja, extra, pide, lineas: 0 }
  })
  // El padding propio de cada bloque se reserva de entrada: sin él no hay
  // tarjeta que dibujar.
  let usado = items.reduce((a, it) => a + (it.pide > 0 ? it.extra : 0), 0)
  // Primero el piso: cada bloque se lleva sus dos renglones antes de que nadie
  // pida un tercero. Sin esto, una bajada larguísima se quedaba con todo el
  // alto y la pill del subtítulo desaparecía entera de la tarjeta.
  for (const it of items) {
    while (it.lineas < Math.min(it.pide, PISO_LINEAS) && usado + it.caja <= libre) {
      it.lineas++
      usado += it.caja
    }
  }
  // Después, reparto por goteo: cada vuelta le damos una línea al bloque al que
  // más le falta, así ninguno se queda corto mientras otro se lleva todo.
  for (;;) {
    let mejor = -1
    let mayorFalta = 0
    items.forEach((it, ix) => {
      const falta = it.pide - it.lineas
      if (falta <= 0 || usado + it.caja > libre) return
      if (falta > mayorFalta) { mayorFalta = falta; mejor = ix }
    })
    if (mejor < 0) break
    items[mejor].lineas++
    usado += items[mejor].caja
  }
  return items.map(it => ({
    clave: it.b.clave,
    fontSize: it.fontSize,
    lineHeight: it.b.lineHeight,
    maxLineas: it.lineas,
    alto: it.lineas > 0 ? it.lineas * it.caja + it.extra : 0,
    recortado: it.lineas < it.pide,
  }))
}

/** Reparte el alto de una columna del slide entre sus bloques de texto.
 *  `fijos` son los altos de los hijos que no llevan texto variable (el kicker,
 *  la línea naranja, el botón, el logo): entran en la cuenta pero no se tocan.
 *  Devuelve, por clave, el tamaño de fuente y el tope de líneas de cada bloque. */
export function ajustarColumna(
  bloques: BloqueTexto[],
  { alto, gap, fijos = [] }: { alto: number; gap: number; fijos?: number[] },
): Record<string, BloqueAjustado> {
  const hijos = bloques.length + fijos.length
  const libre = alto - fijos.reduce((a, b) => a + b, 0) - gap * Math.max(0, hijos - 1)
  const pasos = Math.max(1, ...bloques.map(b => b.tamanos.length))
  let elegido = repartir(bloques, 0, libre)
  for (let paso = 1; paso < pasos && elegido.some(b => b.recortado); paso++) {
    elegido = repartir(bloques, paso, libre)
  }
  const res: Record<string, BloqueAjustado> = {}
  for (const b of elegido) res[b.clave] = b
  return res
}

/** Filas que ocupa la fila del kicker (pill naranja + fecha al lado). Es lo
 *  único de alto variable que no es texto corrido, y el componente recorta pill
 *  y fecha a esta misma cantidad de líneas: así la reserva es exacta. */
export function filasKicker(
  kicker: string,
  aside: string,
  { ancho, fontPill = 28, fontAside = 26, padPill = 80, gap = 28 }:
    { ancho: number; fontPill?: number; fontAside?: number; padPill?: number; gap?: number },
): 1 | 2 {
  const anchoPill = padPill + sinNegritas(kicker).trim().length * fontPill * ANCHO_CARACTER.kicker
  const anchoAside = sinNegritas(aside).trim()
    ? gap + sinNegritas(aside).trim().length * fontAside * ANCHO_CARACTER.kicker
    : 0
  return anchoPill + anchoAside <= ancho ? 1 : 2
}
