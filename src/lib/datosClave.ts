/**
 * Los datos clave de una carga, por modalidad — UNA sola definición.
 *
 * Pedido de Brian (01/09/2026): "cruzar los campos de las LCL, tanto de la
 * parte de camiones como de operaciones, para que queden coherentes una cosa
 * con la otra, y lo que te pide para unas cargas y lo que te pide para otras".
 *
 * Todo el que pide, muestra o copia datos de una LCL lee ESTA lista, en este
 * orden y con estas etiquetas:
 *   (1) alta en Operaciones (NewShipmentDialog, modo LCL)
 *   (2) alta y edición en Camiones (LclAirManager)
 *   (3) la card "Datos faltantes" de HOY LCL (los `reclamable`)
 *   (4) lo que la línea de camión copia de la carga (`LOAD_DESDE_SHIPMENT`)
 *
 * Cada `key` es la columna real de `shipments`: un test recorre la lista y
 * verifica que esté en la whitelist del API (api/_lib/shipmentCols.ts), así
 * ningún dato clave se pierde en silencio en el PATCH.
 *
 * FCL y aéreo declaran lo que HOY piden sus pantallas (no cambia el
 * comportamiento; solo queda dicho en el mismo lugar).
 *
 * Puro: sin React, sin fetch.
 */

/** Cómo se edita cada dato. */
export type ControlDatoClave =
  | 'texto'
  | 'numero'
  | 'fecha'
  | 'combo'      // texto con sugerencias (fiscal, depósito)
  | 'cliente'    // texto con catálogo + canonicalización
  | 'madera'     // tri-estado: Sí / No / A confirmar (null)
  | 'apilable'   // "¿es apilable?" sobre la columna no_apilable
  | 'tilde'      // boolean

export interface DatoClave {
  /** Columna real de `shipments`. */
  key: string
  label: string
  control: ControlDatoClave
  /** Sin esto no se crea la carga. */
  obligatorioAlta: boolean
  /** Si está vacío, HOY lo reclama con input inline. Las tildes no se
   *  reclaman: false es un valor válido, no "sin dato". */
  reclamable: boolean
  /** Placeholder / ayuda corta para el input. */
  hint?: string
}

export type Modalidad = 'lcl' | 'fcl' | 'air'

/** Los 14 datos clave de una LCL, en el orden que pidió Brian. */
const LCL: DatoClave[] = [
  { key: 'ref', label: 'Ref', control: 'texto', obligatorioAlta: true, reclamable: false, hint: 'LCL247, E163 A…' },
  { key: 'cliente', label: 'Cliente', control: 'cliente', obligatorioAlta: true, reclamable: false },
  { key: 'fiscal', label: 'Fiscal', control: 'combo', obligatorioAlta: false, reclamable: true, hint: 'RAFAELA, CACEC, DFC…' },
  { key: 'doc_number', label: 'BL', control: 'texto', obligatorioAlta: false, reclamable: false, hint: 'Nº de BL' },
  { key: 'pkgs', label: 'Bultos', control: 'numero', obligatorioAlta: false, reclamable: true },
  { key: 'kg', label: 'Kilos', control: 'numero', obligatorioAlta: false, reclamable: true },
  { key: 'm3', label: 'M³', control: 'numero', obligatorioAlta: false, reclamable: true },
  { key: 'stock', label: 'Nº stock', control: 'texto', obligatorioAlta: false, reclamable: false, hint: 'vacío = el depósito no lo dio' },
  { key: 'wood', label: 'Madera', control: 'madera', obligatorioAlta: false, reclamable: true },
  { key: 'no_apilable', label: 'Apilable', control: 'apilable', obligatorioAlta: false, reclamable: false },
  { key: 'imo', label: 'IMO', control: 'tilde', obligatorioAlta: false, reclamable: false },
  { key: 'entrega_planta', label: 'Entrega en planta', control: 'tilde', obligatorioAlta: false, reclamable: false },
  { key: 'eta', label: 'Llegada a Montevideo', control: 'fecha', obligatorioAlta: false, reclamable: true },
  { key: 'deposito', label: 'Depósito de desconsolidación', control: 'combo', obligatorioAlta: false, reclamable: true, hint: 'GODILCO, PLANIR, TCP…' },
]

/** FCL: lo que hoy pide el alta (Ref, Cliente + principales del diálogo). */
const FCL: DatoClave[] = [
  { key: 'ref', label: 'Ref', control: 'texto', obligatorioAlta: true, reclamable: false },
  { key: 'cliente', label: 'Cliente', control: 'cliente', obligatorioAlta: true, reclamable: false },
  // La referencia PROPIA del cliente. Se reclama desde el rediseño 04/09: el
  // portal muestra la del cliente cuando existe, y hoy la tienen 16 de 377
  // cargas — sin cargarla al alta, 3 de cada 4 clientes siguen viendo la
  // nuestra. Qué clientes la usan lo decide datosFaltantes (no se le pide a
  // todo el mundo un dato que su cliente no tiene).
  { key: 'client_ref', label: 'Ref. del cliente', control: 'texto', obligatorioAlta: false, reclamable: true, hint: 'ej: 1410' },
  { key: 'contenedor', label: 'Contenedor', control: 'texto', obligatorioAlta: false, reclamable: true },
  { key: 'eta', label: 'ETA', control: 'fecha', obligatorioAlta: false, reclamable: true },
  { key: 'buque', label: 'Buque', control: 'texto', obligatorioAlta: false, reclamable: true },
  { key: 'linea', label: 'Línea', control: 'combo', obligatorioAlta: false, reclamable: true },
  { key: 'doc_number', label: 'BL', control: 'texto', obligatorioAlta: false, reclamable: true },
  { key: 'fiscal', label: 'Fiscal', control: 'combo', obligatorioAlta: false, reclamable: true },
  // Madera: define si hay que pedir SENASA el día de carga y va en el Word de
  // AD/AT. 39 FCL activas la tienen sin definir (04/09) — se reclama, como en
  // LCL. `null` = a confirmar; `false` es una respuesta, no un vacío.
  { key: 'wood', label: 'Madera', control: 'madera', obligatorioAlta: false, reclamable: true },
  { key: 'imo', label: 'IMO', control: 'tilde', obligatorioAlta: false, reclamable: false },
  { key: 'oog', label: 'OOG', control: 'tilde', obligatorioAlta: false, reclamable: false },
]

/** Aéreo: mismo alta genérico que FCL/terrestre, sin contenedor ni IMO/OOG. */
const AIR: DatoClave[] = [
  { key: 'ref', label: 'Ref', control: 'texto', obligatorioAlta: true, reclamable: false },
  { key: 'cliente', label: 'Cliente', control: 'cliente', obligatorioAlta: true, reclamable: false },
  { key: 'fiscal', label: 'Fiscal', control: 'combo', obligatorioAlta: false, reclamable: true },
  { key: 'doc_number', label: 'AWB', control: 'texto', obligatorioAlta: false, reclamable: true },
  { key: 'pkgs', label: 'Bultos', control: 'numero', obligatorioAlta: false, reclamable: true },
  { key: 'kg', label: 'Kilos', control: 'numero', obligatorioAlta: false, reclamable: true },
  { key: 'm3', label: 'M³', control: 'numero', obligatorioAlta: false, reclamable: false },
  { key: 'eta', label: 'Llegada', control: 'fecha', obligatorioAlta: false, reclamable: true },
  { key: 'wood', label: 'Madera', control: 'madera', obligatorioAlta: false, reclamable: false },
]

export const DATOS_CLAVE: Record<Modalidad, readonly DatoClave[]> = { lcl: LCL, fcl: FCL, air: AIR }

/** Los datos que HOY reclama cuando faltan, en el orden de la lista. */
export function reclamables(modalidad: Modalidad): DatoClave[] {
  return DATOS_CLAVE[modalidad].filter(d => d.reclamable)
}

export function datoClave(modalidad: Modalidad, key: string): DatoClave | undefined {
  return DATOS_CLAVE[modalidad].find(d => d.key === key)
}

/** Etiqueta de un dato clave ('kg' → 'Kilos'); la key si no está declarado. */
export function etiquetaDe(modalidad: Modalidad, key: string): string {
  return datoClave(modalidad, key)?.label ?? key
}

/**
 * Lo que la línea de camión (`truck_loads`) copia de la carga al subirla.
 * La fuente es la shipment; el load guarda una copia para que el plan del
 * camión se imprima solo, y `overrides` marca lo que el usuario pisó a mano.
 * Nunca dos valores distintos sin marca: si el operativo no tocó el campo,
 * el load dice lo mismo que la carga.
 *
 * Clave = campo del TruckLoad · valor = columna(s) de `shipments`, en orden
 * de preferencia (la primera con valor gana).
 */
export const LOAD_DESDE_SHIPMENT: Record<string, readonly string[]> = {
  client: ['cliente'],
  fiscal: ['fiscal'],
  kg: ['kg'],
  m3: ['m3'],
  pkgs: ['pkgs'],
  stock: ['stock'],
  wood: ['wood'],
  // El BL puede venir en doc_number (alta guiada) o en hbl (registro viejo).
  bl: ['doc_number', 'hbl'],
  mvdArrival: ['eta'],
  desconsolDate: ['desconsol_date', 'fecha_consol'],
  description: ['observacion'],
}

// ── Faltantes (puro, lo usa HOY LCL) ──────────────────────────────────

const txt = (v: unknown): string => String(v ?? '').trim()
const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * ¿Le falta este dato a la fila? Regla por control:
 *  - numero: vacío o 0 (una LCL de 0 kg no existe)
 *  - madera: null = "a confirmar" (false explícito NO falta)
 *  - tilde/apilable: nunca faltan (false es un valor)
 *  - resto: texto vacío
 */
export function faltaDato(d: DatoClave, row: Record<string, unknown>): boolean {
  const v = row[d.key]
  switch (d.control) {
    case 'numero': return num(v) <= 0
    case 'madera': return v === null || v === undefined
    case 'tilde':
    case 'apilable': return false
    default: return !txt(v)
  }
}

/** Keys de los datos reclamables que faltan en la fila, en el orden de la lista. */
export function datosQueFaltan(modalidad: Modalidad, row: Record<string, unknown>): DatoClave[] {
  return reclamables(modalidad).filter(d => faltaDato(d, row))
}
