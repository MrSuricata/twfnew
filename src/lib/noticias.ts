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

/** Vigentes, más nuevas primero. */
export function noticiasVigentes<T extends Noticia>(list: T[], hoyISO: string): T[] {
  return list
    .filter(n => esVigente(n, hoyISO))
    .sort((a, b) => String(b.publicadaAt).localeCompare(String(a.publicadaAt)))
}

/** Las que se muestran como alerta al abrir la web. */
export function alertasVigentes<T extends Noticia>(list: T[], hoyISO: string): T[] {
  return noticiasVigentes(list, hoyISO).filter(n => n.alerta)
}

/** Orden del carrusel de portada: los avisos abren (el más nuevo primero) y
 *  atrás va el resto en orden cronológico. Lo urgente no queda al final. */
export function ordenSlides<T extends Noticia>(vigentes: T[], max = 6): T[] {
  const top = vigentes.slice(0, max)
  return [...top.filter(n => n.alerta), ...top.filter(n => !n.alerta).reverse()]
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
    vigenteHasta: s(r.vigente_hasta ?? r.vigenteHasta),
    estilo: s(r.estilo),
    kicker: s(r.kicker),
    kickerExtra: s(r.kicker_extra ?? r.kickerExtra),
    subtitulo: s(r.subtitulo),
    mensaje: s(r.mensaje),
    linkUrl: s(r.link_url ?? r.linkUrl),
  }
}
