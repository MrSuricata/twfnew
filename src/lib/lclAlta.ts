/**
 * Alta de una LCL: los datos que importan (Brian, 01/09/2026).
 *
 * "Los datos más importantes para UNA LCL: REFERENCIA, CLIENTE, EL FISCAL, BL,
 * BULTOS, KILOS, METROS CUBICOS, NUMERO STOCK, SI TIENE MADERA O NO, SI ES
 * STAKEABLE O NO, SI ES IMO O NO, SI VA A ENTREGAR EN PLANTA."
 *
 * Este módulo es la parte pura: el mismo formulario se abre desde Operaciones
 * y desde Camiones, y los dos tienen que guardar exactamente lo mismo. Acá vive
 * la traducción del formulario a columnas de `shipments` y la validación de
 * ref repetida. Sin React.
 */
import type { DbShipment } from '@/lib/operationsTypes'

/** Apilable se pregunta en positivo ("¿es apilable?") pero la columna es
 *  `no_apilable`. 'sin_dato' = nadie lo confirmó → no se marca nada. */
export type Apilable = 'sin_dato' | 'si' | 'no'

export interface LclDatosClaveState {
  ref: string
  cliente: string
  fiscal: string
  /** BL (columna doc_number). */
  docNumber: string
  pkgs: string
  kg: string
  m3: string
  /** Nº de stock que da el depósito (columna stock). */
  stock: string
  /** Madera tri-estado: null = a confirmar. */
  wood: boolean | null
  apilable: Apilable
  imo: boolean
  entregaPlanta: boolean
}

/** Fiscales argentinos frecuentes (medidos en la base el 31/08/2026). Semilla
 *  del combo Fiscal; se mezclan con los ya usados en las cargas. */
export const FISCALES_BASE = ['RAFAELA', 'MARE', 'CACEC', 'DFC', 'ZOFRACOR', 'CLIR', 'BPB', 'TORTONE']

export const LCL_DATOS_CLAVE_VACIOS: LclDatosClaveState = {
  ref: '', cliente: '', fiscal: '', docNumber: '', pkgs: '', kg: '', m3: '',
  stock: '', wood: null, apilable: 'sin_dato', imo: false, entregaPlanta: false,
}

/** Etiquetas en el orden que pidió Brian — el formulario las recorre así. */
export const LCL_DATOS_CLAVE_ORDEN: { key: keyof LclDatosClaveState; label: string }[] = [
  { key: 'ref', label: 'Ref' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'fiscal', label: 'Fiscal' },
  { key: 'docNumber', label: 'BL' },
  { key: 'pkgs', label: 'Bultos' },
  { key: 'kg', label: 'Kilos' },
  { key: 'm3', label: 'M³' },
  { key: 'stock', label: 'Nº stock' },
  { key: 'wood', label: 'Madera' },
  { key: 'apilable', label: 'Apilable' },
  { key: 'imo', label: 'IMO' },
  { key: 'entregaPlanta', label: 'Entrega en planta' },
]

export const parseNum = (s: string): number => {
  const n = parseFloat(String(s ?? '').replace(',', '.'))
  return isFinite(n) ? n : 0
}

/** 'no' apilable → no_apilable=true. 'si' y 'sin_dato' → false (no se inventa). */
export const noApilableDesde = (a: Apilable): boolean => a === 'no'

/** Inverso, para cargar el formulario desde una fila existente. */
export const apilableDesde = (noApilable: boolean | null | undefined): Apilable =>
  noApilable ? 'no' : 'sin_dato'

/**
 * Columnas de `shipments` que salen de los datos clave. `hoyISO` estampa
 * `desconsol_date` cuando se carga stock sin fecha: desconsolidar ES entregar
 * el stock (spec consolidados 31/08), mismo criterio que la bandeja de stock.
 * Si ya venía una fecha (`desconsolActual`), se respeta.
 */
export function camposDesdeDatosClave(
  s: LclDatosClaveState,
  hoyISO: string,
  desconsolActual = '',
): Partial<DbShipment> {
  const stock = s.stock.trim()
  return {
    ref: s.ref.trim(),
    cliente: s.cliente.trim(),
    fiscal: s.fiscal.trim(),
    doc_number: s.docNumber.trim(),
    pkgs: parseNum(s.pkgs),
    kg: parseNum(s.kg),
    m3: parseNum(s.m3),
    stock,
    desconsol_date: desconsolActual.trim() || (stock ? hoyISO : ''),
    wood: s.wood,
    no_apilable: noApilableDesde(s.apilable),
    imo: s.imo,
    entrega_planta: s.entregaPlanta,
  }
}

// ── Ref repetida ──────────────────────────────────────────────────────────

/** Misma ref si coincide sin importar mayúsculas ni espacios de más
 *  ("lcl 247" = "LCL  247" = "LCL 247"). */
export const normalizarRef = (r: string | null | undefined): string =>
  String(r ?? '').replace(/\s+/g, ' ').trim().toUpperCase()

/**
 * Otra carga ACTIVA (no archivada) con la misma ref. Las archivadas no cuentan:
 * una ref vieja se puede reusar. Devuelve la primera que choca o null.
 */
export function buscarRefDuplicada<T extends { ref: string; archived?: boolean }>(
  ref: string,
  cargas: T[],
  opts: { ignorarId?: string } = {},
): T | null {
  const buscada = normalizarRef(ref)
  if (!buscada) return null
  for (const c of cargas) {
    if (c.archived) continue
    if (opts.ignorarId && (c as { id?: string }).id === opts.ignorarId) continue
    if (normalizarRef(c.ref) === buscada) return c
  }
  return null
}

/** Sufijos para una carga partida: "LCL247" → ["LCL247 A", "LCL247 B"]. Si la
 *  ref ya termina en " A"/" B" se sugiere la letra siguiente. */
export function sufijosSugeridos(ref: string): string[] {
  const base = normalizarRef(ref)
  const m = /^(.*\S)\s([A-Z])$/.exec(base)
  if (m) {
    const sig = String.fromCharCode(m[2].charCodeAt(0) + 1)
    return sig <= 'Z' ? [`${m[1]} ${sig}`] : []
  }
  return [`${base} A`, `${base} B`]
}
