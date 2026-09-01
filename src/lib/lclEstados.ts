/**
 * Estados de una carga LCL. Ninguno se elige: todos salen de datos que ya se
 * cargan. Reemplazan al desplegable manual `LclAirStatus`, que dejó cuatro
 * cargas congeladas en "en origen" desde junio de 2026 porque nadie lo movía.
 *
 * No hay estado "desconsolidada": desconsolidar ES recibir el stock (Brian
 * 31/08), así que sería el mismo estado con otro nombre.
 *
 * Funciones puras a propósito — la previsión por fiscal y los avisos de armado
 * (etapa siguiente) consumen estas mismas funciones desde otro lado.
 */

export type EstadoLcl = 'en_viaje' | 'aguarda_stock' | 'con_stock' | 'asignada' | 'despachada'

export interface CargaLcl {
  ref: string
  /** Llegada a Montevideo (columna `eta`). */
  eta?: string | null
  /** Nº de stock del depósito (columna `stock`). Vacío = todavía no lo dieron. */
  stock?: string | null
  /** Fecha de desconsolidación (columna `desconsol_date`) = cuándo dieron el stock. */
  desconsol?: string | null
}

/** Si está en un camión y si ese camión ya salió. Lo sabe el llamador, que es
 *  quien tiene los camiones cargados; la lib no consulta nada. */
export interface ContextoCamion {
  enCamion?: boolean
  camionSalio?: boolean
}

const vacio = (v: string | null | undefined): boolean => !String(v ?? '').trim()

// ── Universo: qué LCL pasa por Montevideo ──────────────────────────────

/** Lo mínimo de una fila `shipments` para decidir si es del universo LCL
 *  Montevideo. DbShipment lo cumple; los tests usan objetos sueltos. */
export interface FilaLclUniverso {
  mode?: string | null
  archived?: boolean | null
  /** País destino: 'AR' = bloque "LCL BUENOS AIRES" de la planilla (no toca
   *  Montevideo). Una LCL a Córdoba VÍA Montevideo lleva 'UY' por convención. */
  dest_country?: string | null
  /** Puerto de descarga. Vacío = Montevideo (convención de la app). */
  discharge_port?: string | null
}

/**
 * ÚNICO criterio de "LCL por Montevideo": lo usan HOY LCL (lclActivas), las
 * sugerencias de camión (candidatas, previsión, aviso al publicar) y el panel.
 * Visto en producción (01/09/2026): las LCL del bloque BUENOS AIRES tienen
 * dest_country='AR' y discharge_port vacío, así que mirar solo el puerto no
 * alcanza. Queda afuera si:
 *   - no es LCL o está archivada,
 *   - dest_country es AR/ARGENTINA,
 *   - o el puerto está cargado y no es Montevideo (BUENOS AIRES, BUE, otro).
 */
export function esLclMontevideo(row: FilaLclUniverso): boolean {
  if (String(row.mode ?? '').trim().toUpperCase() !== 'LCL') return false
  if (row.archived) return false
  const pais = String(row.dest_country ?? '').trim().toUpperCase()
  if (pais === 'AR' || pais === 'ARGENTINA') return false
  const puerto = String(row.discharge_port ?? '').trim().toUpperCase()
  if (puerto && !/MONTEVIDEO|MVD/.test(puerto)) return false
  return true
}

export const ESTADO_LCL_LABEL: Record<EstadoLcl, string> = {
  en_viaje: 'En viaje',
  aguarda_stock: 'Aguarda stock',
  con_stock: 'Con stock',
  asignada: 'Asignada',
  despachada: 'Despachada',
}

/** Los cinco estados en el orden del recorrido real de una carga. */
export const ESTADOS_LCL: EstadoLcl[] = [
  'en_viaje', 'aguarda_stock', 'con_stock', 'asignada', 'despachada',
]

export function estadoLcl(c: CargaLcl, hoyISO: string, ctx: ContextoCamion = {}): EstadoLcl {
  // El camión manda: una vez que salió, lo demás es historia.
  if (ctx.camionSalio) return 'despachada'
  if (ctx.enCamion) return 'asignada'
  if (!vacio(c.stock)) return 'con_stock'
  // Sin ETA no se asume que llegó: quedaría pidiendo stock de algo que sigue
  // navegando.
  if (vacio(c.eta)) return 'en_viaje'
  return String(c.eta).slice(0, 10) <= hoyISO ? 'aguarda_stock' : 'en_viaje'
}

// ── Los relojes ────────────────────────────────────────────────────────

/** Días de almacenaje gratis desde que el depósito desconsolida. */
export const ALMACENAJE_DIAS = 30

const MS_DIA = 86_400_000

const aFecha = (iso: string): Date => {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(a, (m || 1) - 1, d || 1)
}

export const sumarDias = (iso: string, dias: number): string => {
  const f = aFecha(iso)
  f.setDate(f.getDate() + dias)
  const mm = String(f.getMonth() + 1).padStart(2, '0')
  const dd = String(f.getDate()).padStart(2, '0')
  return `${f.getFullYear()}-${mm}-${dd}`
}

export const diasEntre = (desdeISO: string, hastaISO: string): number =>
  Math.round((aFecha(hastaISO).getTime() - aFecha(desdeISO).getTime()) / MS_DIA)

export interface Almacenaje {
  /** Último día sin cargo. */
  vence: string
  /** Negativo = ya se pasó. */
  diasRestantes: number
  vencido: boolean
}

/**
 * El reloj que hoy no mira nadie: para una FCL el vencimiento es el libre del
 * contenedor, pero una LCL no tiene contenedor que devolver, así que ese aviso
 * no existía. Corre desde la desconsolidación, que es cuando dan el stock.
 */
export function almacenaje(
  c: Pick<CargaLcl, 'ref' | 'desconsol'>,
  hoyISO: string,
): Almacenaje | null {
  if (vacio(c.desconsol)) return null
  const vence = sumarDias(String(c.desconsol), ALMACENAJE_DIAS)
  const diasRestantes = diasEntre(hoyISO, vence)
  return { vence, diasRestantes, vencido: diasRestantes < 0 }
}

/**
 * Hace cuántos días la carga está lista y todavía no salió. Null cuando no
 * corresponde: sin stock no está esperando camión, y sin fecha no hay cómo
 * contar.
 */
export function diasEsperando(
  c: Pick<CargaLcl, 'ref' | 'stock' | 'desconsol'>,
  hoyISO: string,
): number | null {
  if (vacio(c.stock) || vacio(c.desconsol)) return null
  return diasEntre(String(c.desconsol), hoyISO)
}
