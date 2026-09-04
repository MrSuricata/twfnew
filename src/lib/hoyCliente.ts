/**
 * HOY del cliente — la lógica de las cards del portal "Mis Cargas".
 *
 * Brian (02/09/2026): "pensemos la lógica para el cliente: qué le interesa?
 * cuándo le llegan las próximas cargas, cargas que están zarpando, y luego
 * activas y agenda". Misma idea que HOY depósito/transporte: cards con
 * contador, filas cortas, card vacía = no se muestra.
 *
 * Segunda vuelta (02/09, tarde): "Llegan a DESTINO" (no "a tu depósito"):
 * destino = el depósito fiscal en Argentina para lo que viene por Montevideo,
 * y el puerto de llegada para lo que va directo a Chile / Buenos Aires /
 * otros. El cliente ve TODAS sus cargas (cualquier país, FCL o LCL) y filtra
 * por ruta y por tipo. Las LCL traen su salida/llegada desde el camión
 * consolidado (operativa sintética CONSOLIDADO que arma la API).
 *
 * Deriva TODO de los ParsedShipment que el portal recibe del server (lista
 * blanca del cliente). Pura y testeable: `hoyISO` entra por parámetro.
 *
 * Reglas que dejó la revisión adversaria (02/09):
 *  · El día de la ETA el buque "llega hoy": la carga está SOLO en "Llegan a
 *    Montevideo" (ruta UY) o en "Llegan a destino" (rutas directas). Pasa a
 *    "En Montevideo / En puerto" desde el día siguiente.
 *  · "En camino" solo si algo está viajando (salió ANTES de hoy y no llegó).
 *  · "Entregada" = la carga SALIÓ y el contenedor está DEVUELTO (OPERATIVA o
 *    LIBRE). DESCARGA (fecha en que se confirmó el arribo) y DEV (lugar) no
 *    significan entrega.
 *  · Sin ETA_FISC, una salida de hace más de 14 días se da por llegada
 *    (DIAS_LLEGADA_SUPUESTA): nada queda "en camino" para siempre.
 *  · "Embarcadas" no repite lo que ya está en una card de llegada.
 *  · Activo/Historial se decide con estas reglas (esActivaParaCliente).
 *
 * Spec: docs/superpowers/specs/2026-09-02-portal-cliente-hoy-design.md
 */
import type { ParsedShipment, OperativasRecord, ShipmentAlert } from './shipmentTypes'
import { fmtDateDMY } from './format'
import { refsCliente, type RefsCliente } from './refsCliente'

const ISO_RE = /^\d{4}-\d{2}-\d{2}/
const txt = (v: unknown): string => String(v ?? '').trim()

/** YYYY-MM-DD o null si el valor no es una fecha. */
const isoDia = (v: unknown): string | null => {
  const s = txt(v).slice(0, 10)
  return ISO_RE.test(s) ? s : null
}

/** fecha − hoy en días (negativo = pasó · 0 = hoy · positivo = viene). */
const diffDias = (hoyISO: string, fecha: string): number =>
  Math.round((Date.parse(fecha + 'T00:00:00Z') - Date.parse(hoyISO + 'T00:00:00Z')) / 86400000)

/** días hasta la fecha del campo, o null si no hay fecha. */
const dias = (hoyISO: string, v: unknown): number | null => {
  const f = isoDia(v)
  return f === null ? null : diffDias(hoyISO, f)
}

const sumarDias = (iso: string, n: number): string =>
  new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)

/** Operativa con el camión (LCL, la arma la API): código y si el equipo ya lo
 *  marcó entregado (los camiones importados no tienen fecha de llegada). */
type Op = OperativasRecord & { CAMION?: string; ENTREGADO?: boolean }
const ops = (s: ParsedShipment): Op[] => ((s.operativas || []) as Op[]).filter(Boolean)

// ── Ruta y tipo ───────────────────────────────────────────────────────────

/** Por dónde entra la carga: UY = vía Montevideo (destino = fiscal AR);
 *  AR = Buenos Aires directo; CL = Chile; OTRO = Paraguay, etc. */
export type Ruta = 'UY' | 'AR' | 'CL' | 'OTRO'
export type Tipo = 'fcl' | 'lcl' | 'air' | 'otro'

export const RUTA_ORDEN: Ruta[] = ['UY', 'AR', 'CL', 'OTRO']
export const TIPO_ORDEN: Tipo[] = ['fcl', 'lcl', 'air', 'otro']

/** Nombre del filtro (chip) — el mismo vocabulario que la fila y los mails. */
export const RUTA_LABEL: Record<Ruta, string> = { UY: 'Vía Montevideo', AR: 'Buenos Aires', CL: 'Chile', OTRO: 'Otros destinos' }
/** Marca corta en la fila. */
export const RUTA_CHIP: Record<Ruta, string> = { UY: 'vía Montevideo', AR: 'Buenos Aires', CL: 'Chile', OTRO: 'Otro destino' }
export const TIPO_LABEL: Record<Tipo, string> = { fcl: 'FCL', lcl: 'LCL', air: 'Aéreo', otro: 'Otro' }

/** Por dónde entra la carga. Sin país cargado (o el genérico 'OTRO') decide el
 *  puerto de descarga; sin puerto tampoco, la operación de la casa es vía
 *  Montevideo (revisión 02/09: una LCL con el país vacío caía en "ruta directa"
 *  y aparecía "En destino" estando en un depósito de Montevideo). */
export function rutaDe(s: { PAIS?: unknown; POD?: unknown } | null | undefined): Ruta {
  const p = txt(s?.PAIS).toUpperCase()
  if (p === 'UY') return 'UY'
  if (p === 'AR') return 'AR'
  if (p === 'CL') return 'CL'
  const pod = txt(s?.POD).toUpperCase()
  if (p === '' || p === 'OTRO') return pod === '' || pod.includes('MONTEVIDEO') ? 'UY' : 'OTRO'
  return 'OTRO'
}
export const porUruguay = (s: { PAIS?: unknown; POD?: unknown } | null | undefined): boolean => rutaDe(s) === 'UY'

export function tipoDe(s: { MODE?: unknown; REF?: unknown } | null | undefined): Tipo {
  const m = txt(s?.MODE).toLowerCase()
  if (m === '' || m === 'fcl') return 'fcl'
  if (m === 'lcl') return 'lcl'
  if (m === 'air' || m === 'aereo' || m === 'aéreo') return 'air'
  return 'otro'
}

export interface FiltroCargas {
  ruta: Ruta | 'todas'
  tipo: Tipo | 'todos'
}
export const FILTRO_TODO: FiltroCargas = { ruta: 'todas', tipo: 'todos' }

export function filtrarCargas(shipments: ParsedShipment[], f: FiltroCargas): ParsedShipment[] {
  return (shipments || []).filter(s =>
    (f.ruta === 'todas' || rutaDe(s) === f.ruta) && (f.tipo === 'todos' || tipoDe(s) === f.tipo))
}

/** Qué rutas y tipos tiene ESTE cliente (los selectores solo ofrecen lo que existe). */
export function opcionesFiltro(shipments: ParsedShipment[]): { rutas: Ruta[]; tipos: Tipo[] } {
  const rutas = new Set<Ruta>()
  const tipos = new Set<Tipo>()
  for (const s of shipments || []) { rutas.add(rutaDe(s)); tipos.add(tipoDe(s)) }
  return {
    rutas: RUTA_ORDEN.filter(r => rutas.has(r)),
    tipos: TIPO_ORDEN.filter(t => tipos.has(t)),
  }
}

// ── Fechas y hechos por operativa ─────────────────────────────────────────

/** El buque YA llegó al puerto (Montevideo o el de destino): ETA anterior a
 *  hoy — el día de la ETA todavía "llega hoy". Sin ETA no se puede saber → se
 *  asume que sí, misma convención que getShipmentStatus. */
const llegoAPuerto = (s: ParsedShipment, hoyISO: string): boolean => {
  const d = dias(hoyISO, s.ETA)
  return d === null ? true : d < 0
}

/** Sin ETA_FISC cargada, una salida de hace más de esto se da por llegada al
 *  destino (misma convención que el admin: "SALIDA > 2 semanas = llegó"). */
export const DIAS_LLEGADA_SUPUESTA = 14
/** Un camión consolidado Montevideo → fiscal argentino tarda 2-3 días: para
 *  las LCL en camión el supuesto es corto (revisión 02/09). */
export const DIAS_LLEGADA_SUPUESTA_CAMION = 3

const fiscalAlcanzada = (o: Op, hoyISO: string): boolean => (dias(hoyISO, o.ETA_FISC) ?? 1) <= 0
const esCamion = (o: Op): boolean => txt(o.OPERATIVA).toUpperCase() === 'CONSOLIDADO' || !!txt(o.CAMION)

/** Fecha (ISO) en que ESTA operativa llegó al destino: ETA_FISC si ya pasó;
 *  si no hay ETA_FISC, SALIDA + supuesto de tránsito cuando ya pasó (y si el
 *  camión está marcado ENTREGADO, a más tardar hoy). null = todavía no llegó
 *  (o no se puede saber). */
const fechaLlegadaOp = (o: Op, hoyISO: string): string | null => {
  const fisc = isoDia(o.ETA_FISC)
  if (fisc) return diffDias(hoyISO, fisc) <= 0 ? fisc : null
  const salida = isoDia(o.SALIDA)
  if (!salida) return null
  const dSalida = diffDias(hoyISO, salida)
  if (dSalida > 0) return null
  const supuesto = esCamion(o) ? DIAS_LLEGADA_SUPUESTA_CAMION : DIAS_LLEGADA_SUPUESTA
  const estimada = sumarDias(salida, supuesto)
  if (o.ENTREGADO) return estimada <= hoyISO ? estimada : hoyISO
  return dSalida > -supuesto ? null : estimada
}
const llegoAlDestino = (o: Op, hoyISO: string): boolean => fechaLlegadaOp(o, hoyISO) !== null
/** Salió ANTES de hoy y todavía no llegó: está viajando. */
const viajando = (o: Op, hoyISO: string): boolean => (dias(hoyISO, o.SALIDA) ?? 1) < 0 && !llegoAlDestino(o, hoyISO)
/** Contenedor devuelto: DEVUELTO en OPERATIVA o en LIBRE (donde vive en la web). */
const devuelto = (o: Op, libreCarga: unknown): boolean =>
  txt(o.OPERATIVA).toUpperCase() === 'DEVUELTO'
  || txt(o.LIBRE).toUpperCase() === 'DEVUELTO'
  || txt(libreCarga).toUpperCase() === 'DEVUELTO'
/** Entregada = la carga SALIÓ y el contenedor se devolvió. Un DEVUELTO sin
 *  salida (carga a piso: el contenedor vuelve vacío y la mercadería sigue en
 *  el depósito uruguayo) NO es entrega. */
const entregada = (o: Op, libreCarga: unknown): boolean => !!isoDia(o.SALIDA) && devuelto(o, libreCarga)
/** La operativa no tiene ningún tramo terrestre cargado (ni salida ni llegada). */
const sinTramo = (o: Op): boolean => !isoDia(o.SALIDA) && !isoDia(o.ETA_FISC)
/** Hay un depósito fiscal de destino cargado: después del puerto hay un tramo. */
const tieneFiscal = (s: ParsedShipment): boolean => ops(s).some(o => !!txt(o.FISCAL))

/** Ruta directa donde el puerto ES el destino: Chile siempre (no seguimos el
 *  tramo interno); Buenos Aires / otros solo si no hay fiscal ni tramo cargado.
 *  Con fiscal, la carga sigue el flujo puerto → salida → en camino → destino,
 *  así el estado no retrocede cuando el equipo carga la salida (revisión 02/09). */
const puertoEsDestino = (s: ParsedShipment): boolean =>
  !porUruguay(s) && (rutaDe(s) === 'CL' || (!tieneFiscal(s) && ops(s).every(sinTramo)))

// Las referencias (principal / secundaria) las decide lib/refsCliente: UNA
// regla para todo el portal (spec D2). Acá solo se las cuelga a cada fila.

// ── Estado en lenguaje del cliente ────────────────────────────────────────

export type EstadoCliente =
  | 'por_embarcar'   // sin ETD o ETD futuro
  | 'embarcada'      // zarpó, todavía no llegó al puerto (incluye el día de la ETA)
  | 'en_montevideo'  // llegó al puerto; nada viaja hacia el destino (ruta UY: "En Montevideo"; directa: "En puerto")
  | 'en_camino'      // algo salió antes de hoy y no llegó al destino
  | 'en_deposito'    // todo llegó al destino (fiscal AR, o el puerto en rutas directas)
  | 'entregada'      // todo devuelto / cerrado

export const ESTADO_CLIENTE_ORDEN: EstadoCliente[] = [
  'por_embarcar', 'embarcada', 'en_montevideo', 'en_camino', 'en_deposito', 'entregada',
]

/** Etiqueta genérica (filtros); para la fila usar etiquetaEstado(s, estado). */
export const ESTADO_CLIENTE_LABEL: Record<EstadoCliente, string> = {
  por_embarcar: 'Por embarcar',
  embarcada: 'Embarcada',
  en_montevideo: 'En puerto',
  en_camino: 'En camino',
  en_deposito: 'En destino',
  entregada: 'Entregada',
}

/** La etiqueta de la fila sabe por dónde viene la carga. */
export function etiquetaEstado(s: ParsedShipment, estado: EstadoCliente): string {
  if (estado === 'en_montevideo') return porUruguay(s) ? 'En Montevideo' : 'En puerto'
  return ESTADO_CLIENTE_LABEL[estado]
}

/** Clases del chip de estado (claras, funcionan en las dos marcas). */
export const ESTADO_CLIENTE_CLASE: Record<EstadoCliente, string> = {
  por_embarcar: 'bg-slate-100 text-slate-700',
  embarcada: 'bg-blue-100 text-blue-700',
  en_montevideo: 'bg-violet-100 text-violet-700',
  en_camino: 'bg-orange-100 text-orange-700',
  en_deposito: 'bg-emerald-100 text-emerald-700',
  entregada: 'bg-gray-100 text-gray-600',
}

/** Avance 0..100 para la barra de la fila expandida: derivado del estado. */
export function progresoCliente(estado: EstadoCliente): number {
  return Math.round((ESTADO_CLIENTE_ORDEN.indexOf(estado) / (ESTADO_CLIENTE_ORDEN.length - 1)) * 100)
}

export function estadoCliente(s: ParsedShipment, hoyISO: string): EstadoCliente {
  if (!llegoAPuerto(s, hoyISO)) {
    const dEtd = dias(hoyISO, s.ETD)
    return dEtd !== null && dEtd <= 0 ? 'embarcada' : 'por_embarcar'
  }
  // Ruta directa sin tramo terrestre: llegar al puerto ES llegar a destino.
  if (puertoEsDestino(s)) return 'en_deposito'
  const lista = ops(s)
  if (lista.length === 0) return 'en_montevideo'
  if (lista.every(o => entregada(o, s.LIBRE_HASTA))) return 'entregada'
  if (lista.some(o => viajando(o, hoyISO))) return 'en_camino'
  if (lista.every(o => llegoAlDestino(o, hoyISO))) return 'en_deposito'
  // Nada viaja y algo no salió (o sale hoy): sigue en el puerto / depósito UY.
  return 'en_montevideo'
}

/** Fechas de llegada a destino de la carga (una por operativa que llegó; en
 *  rutas directas sin tramo, la ETA al puerto). */
const fechasLlegadaDestino = (s: ParsedShipment, hoyISO: string): string[] => {
  if (puertoEsDestino(s)) {
    const eta = isoDia(s.ETA)
    return eta && diffDias(hoyISO, eta) < 0 ? [eta] : []
  }
  return ops(s).map(o => fechaLlegadaOp(o, hoyISO)).filter((f): f is string => !!f)
}

/** Días desde la última llegada a destino (null si ninguna llegó). */
const diasDesdeUltimaLlegada = (s: ParsedShipment, hoyISO: string): number | null => {
  const llegadas = fechasLlegadaDestino(s, hoyISO).map(f => -diffDias(hoyISO, f))
  return llegadas.length === 0 ? null : Math.min(...llegadas)
}

export const CLIENTE_ENTREGADA_DIAS = 10
export const CLIENTE_SIN_OPERATIVA_DIAS = 60

/** Qué se considera "activa" en el portal (lista Mis cargas + cards HOY);
 *  lo demás va a Historial. Misma regla que el chip de estado, no la del
 *  admin (isShipmentCompleted mandaba los trasiegos a Historial el día después
 *  de la salida, con el camión en la frontera). */
export function esActivaParaCliente(s: ParsedShipment, hoyISO: string): boolean {
  const estado = estadoCliente(s, hoyISO)
  if (estado === 'entregada') return false
  if (estado === 'en_deposito') {
    const d = diasDesdeUltimaLlegada(s, hoyISO)
    return d === null || d <= CLIENTE_ENTREGADA_DIAS
  }
  if (ops(s).length === 0) {
    // Sin operativas nunca va a llegar a "en destino": una carga arribada hace
    // meses sin datos no es trabajo vivo (mismo tope que el server, 60 días).
    const d = dias(hoyISO, s.ETA)
    if (d !== null && -d > CLIENTE_SIN_OPERATIVA_DIAS) return false
  }
  return true
}

// ── Próximo hito (la columna derecha de la lista, SIEMPRE el mismo dato por estado) ──

export interface HitoCliente {
  label: string
  /** dd/mm/yyyy, o un texto ("A confirmar", "A coordinar", ''). */
  fecha: string
  /** ISO de la fecha si la hay. */
  iso: string
}

const minIso = (vals: unknown[]): string => vals.map(isoDia).filter((v): v is string => !!v).sort()[0] || ''
const maxIso = (vals: unknown[]): string => vals.map(isoDia).filter((v): v is string => !!v).sort().pop() || ''
const fmt = (iso: string): string => (iso ? fmtDateDMY(iso) : '')

export function proximoHito(s: ParsedShipment, hoyISO: string): HitoCliente {
  const estado = estadoCliente(s, hoyISO)
  const lista = ops(s)
  const uy = porUruguay(s)
  switch (estado) {
    case 'por_embarcar': {
      const etd = isoDia(s.ETD) || ''
      return etd ? { label: 'Zarpa', fecha: fmt(etd), iso: etd } : { label: 'Zarpe', fecha: 'A confirmar', iso: '' }
    }
    case 'embarcada': {
      const eta = isoDia(s.ETA) || ''
      const label = uy ? 'Llega a Montevideo' : 'Llega a destino'
      return eta ? { label, fecha: fmt(eta), iso: eta } : { label: uy ? 'Llegada a Montevideo' : 'Llegada a destino', fecha: 'A confirmar', iso: '' }
    }
    case 'en_montevideo': {
      // Salida programada (hoy o futura) → se muestra; sin salida → hay que coordinarla.
      const programada = minIso(lista.map(o => o.SALIDA).filter(v => (dias(hoyISO, v) ?? -1) >= 0))
      return programada
        ? { label: uy ? 'Sale de Montevideo' : 'Sale del puerto', fecha: fmt(programada), iso: programada }
        : { label: 'Salida', fecha: 'A coordinar', iso: '' }
    }
    case 'en_camino': {
      const llegada = minIso(lista.filter(o => viajando(o, hoyISO)).map(o => o.ETA_FISC))
      return llegada
        ? { label: 'Llega a destino', fecha: fmt(llegada), iso: llegada }
        : { label: 'Llegada a destino', fecha: 'A confirmar', iso: '' }
    }
    case 'en_deposito': {
      const desde = maxIso(fechasLlegadaDestino(s, hoyISO))
      const estimada = !puertoEsDestino(s) && !lista.some(o => isoDia(o.ETA_FISC))
      return desde
        ? { label: estimada ? 'En destino (estimado)' : 'En destino desde', fecha: fmt(desde), iso: desde }
        : { label: 'En destino', fecha: '', iso: '' }
    }
    case 'entregada':
      return { label: 'Entregada', fecha: '', iso: '' }
  }
}

// ── Base común de las filas ───────────────────────────────────────────────

interface FilaBase {
  ref: string
  refs: RefsCliente
  ruta: Ruta
  tipo: Tipo
}
/** `nombreCliente` lo pasa el portal: el server manda CLIENTE vacío (ya sabe
 *  quién es), y sin el nombre no se puede descartar la `client_ref` que dice
 *  literalmente el nombre del cliente (refsCliente). */
const base = (s: ParsedShipment, nombreCliente = ''): FilaBase =>
  ({ ref: txt(s.REF), refs: refsCliente(s, nombreCliente), ruta: rutaDe(s), tipo: tipoDe(s) })

// ── Card 1: Llegan a destino ──────────────────────────────────────────────

/** en_frontera = viajando · sale_hoy · sale = salida programada · llega =
 *  ruta directa, el buque llega al puerto de destino. */
export type EstadoLlegadaDestino = 'en_frontera' | 'sale_hoy' | 'sale' | 'llega'

export interface FilaDestino extends FilaBase {
  descripcion: string
  cntr: string
  /** Código del camión consolidado (LCL). */
  camion: string
  /** Fecha de llegada a destino ISO ('' = a confirmar). */
  fecha: string
  /** días hasta la llegada (null si no hay fecha). */
  dias: number | null
  estado: EstadoLlegadaDestino
  /** SALIDA ISO ('' en rutas directas sin tramo). */
  salida: string
  fiscal: string
}

export const DESTINO_DIAS_ADELANTE = 7

/** Lo que está llegando a destino: contenedores/consolidados con SALIDA
 *  cargada que van hacia el fiscal (ya salieron, salen hoy o en los próximos
 *  días), y en rutas directas los buques que llegan al puerto de destino en
 *  los próximos días. Sin SALIDA no hay nada que "llegue": eso es card 2. */
export function llegadasADestino(shipments: ParsedShipment[], hoyISO: string, adelante = DESTINO_DIAS_ADELANTE, nombreCliente = ''): FilaDestino[] {
  const out: FilaDestino[] = []
  for (const s of shipments || []) {
    if (!porUruguay(s) && ops(s).every(sinTramo)) {
      // Ruta directa llegando al puerto de destino (con tramo cargado sigue abajo).
      const eta = isoDia(s.ETA)
      if (!eta) continue
      const d = diffDias(hoyISO, eta)
      if (d < 0 || d > adelante) continue
      const o = ops(s)[0]
      out.push({
        ...base(s, nombreCliente), descripcion: txt(o?.DESCRIPCION), cntr: txt(s.CNTR), camion: '',
        fecha: eta, dias: d, estado: 'llega', salida: '', fiscal: txt(s.POD),
      })
      continue
    }
    if (!llegoAPuerto(s, hoyISO)) continue
    for (const o of ops(s)) {
      if (llegoAlDestino(o, hoyISO)) continue // ya está en destino (o se da por llegado)
      if (entregada(o, s.LIBRE_HASTA)) continue
      const salida = isoDia(o.SALIDA)
      if (!salida) continue
      const dSalida = diffDias(hoyISO, salida)
      if (dSalida > adelante) continue
      const estado: EstadoLlegadaDestino = dSalida < 0 ? 'en_frontera' : dSalida === 0 ? 'sale_hoy' : 'sale'
      const fiscal = isoDia(o.ETA_FISC) || ''
      out.push({
        ...base(s, nombreCliente),
        descripcion: txt(o.DESCRIPCION),
        cntr: txt(o.CNTR_OP),
        camion: txt(o.CAMION),
        fecha: fiscal,
        dias: fiscal ? diffDias(hoyISO, fiscal) : null,
        estado,
        salida,
        fiscal: txt(o.FISCAL),
      })
    }
  }
  // Lo que ya viene primero (en frontera / sale hoy), después por fecha de llegada.
  const rango = (e: EstadoLlegadaDestino) => (e === 'en_frontera' ? 0 : e === 'sale_hoy' ? 1 : 2)
  return out.sort((a, b) =>
    rango(a.estado) - rango(b.estado)
    || (a.fecha || '9999').localeCompare(b.fecha || '9999')
    || (a.salida || '9999').localeCompare(b.salida || '9999')
    || a.ref.localeCompare(b.ref))
}

// ── Card 2: En Montevideo, esperando salida (solo ruta UY) ───────────────

export interface FilaEsperando extends FilaBase {
  descripcion: string
  cntr: string
  /** Dónde está: LUGAR_SALIDA del contenedor (o el depósito de la LCL), si no la terminal / el puerto de arribo. */
  lugar: string
  /** true = ruta directa con fiscal: está en el puerto de destino, no en Montevideo. */
  enPuerto: boolean
  /** Día en que se retiró de la terminal ('' si sigue ahí). Con fecha, la carga
   *  ya está en el depósito uruguayo, no en el puerto. */
  retirado: string
  /** ETA a Montevideo (ISO). */
  desde: string
  /** Días desde que llegó (≥ 1: el día de la ETA todavía está "llegando"). */
  dias: number
}

/** Contenedores/consolidados arribados (ETA anterior a hoy) sin salida cargada
 *  hacia el fiscal: el cliente tiene que decidir cuándo los quiere. Vía
 *  Montevideo, o ruta directa con fiscal (en el puerto de destino). */
export function esperandoSalida(shipments: ParsedShipment[], hoyISO: string, nombreCliente = ''): FilaEsperando[] {
  const out: FilaEsperando[] = []
  for (const s of shipments || []) {
    if (puertoEsDestino(s)) continue // ya está en destino: no espera nada
    const eta = isoDia(s.ETA)
    if (!eta || diffDias(hoyISO, eta) >= 0) continue // sin ETA no se afirma que llegó; el día 0 es "llega hoy"
    const uy = porUruguay(s)
    // Retirado de la terminal: está en el depósito, aunque no tenga salida.
    const retirado = isoDia((s as unknown as { RETIRADO?: string }).RETIRADO) || ''
    for (const o of ops(s)) {
      if (isoDia(o.SALIDA)) continue // tiene salida (pasada, de hoy o programada) → card 1 o en camino
      if (fiscalAlcanzada(o, hoyISO)) continue
      const lugar = (retirado && (txt(o.DEPOSITO) ? `depósito ${txt(o.DEPOSITO)}` : 'depósito'))
        || txt(o.LUGAR_SALIDA)
        || (uy
          ? (txt(s.TERMINAL) ? `terminal ${txt(s.TERMINAL)}` : 'terminal')
          : (txt(s.POD) ? `puerto ${txt(s.POD)}` : 'puerto'))
      out.push({
        ...base(s, nombreCliente),
        descripcion: txt(o.DESCRIPCION),
        cntr: txt(o.CNTR_OP),
        lugar,
        retirado,
        enPuerto: !uy,
        desde: eta,
        dias: -diffDias(hoyISO, eta),
      })
    }
  }
  return out.sort((a, b) => b.dias - a.dias || a.ref.localeCompare(b.ref))
}

// ── Card: novedades (fotos e informes) ───────────────────────────────────

/** Dónde se sacaron las fotos. `origen` = en la fábrica / puerto de salida ·
 *  `uruguay` = en el depósito de Montevideo (es el `photo_type` que ya guarda
 *  la app). */
export type LugarFoto = 'origen' | 'uruguay'

export interface NovedadCliente extends FilaBase {
  clase: 'fotos' | 'informe'
  /** "en origen", "en Montevideo", "en depósito GODILCO". */
  lugar: string
  /** Cuántas fotos nuevas (1 para un informe). */
  cantidad: number
  /** Día de la subida (ISO). */
  fecha: string
  /** Días desde la subida: 0 = hoy. */
  dias: number
  /** La carga está cargando el camión hoy: las fotos son de eso, en vivo. */
  cargandoAhora: boolean
}

/** Cuánto tiempo una subida sigue siendo "nueva" para el cliente. */
export const NOVEDADES_DIAS = 7

interface SubidaFoto { shipmentRef?: string | null; photoType?: string | null; createdAt?: number | null }
interface SubidaInforme { shipmentRef?: string | null; title?: string | null; createdAt?: number | null }

const diaDeTimestamp = (ms: unknown): string => {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return ''
  const d = new Date(n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Dónde decir que se sacaron: las de Uruguay nombran el depósito si se sabe. */
function lugarDeFotos(s: ParsedShipment, tipo: string): string {
  if (tipo === 'origen') {
    const pol = txt(s.POL)
    return pol ? `en origen (${pol})` : 'en origen'
  }
  const dep = ops(s).map(o => txt(o.DEPOSITO)).find(Boolean)
  return dep ? `en depósito ${dep}` : 'en Montevideo'
}

/** ¿Hoy está cargando el camión? Es lo que vuelve la subida un "en vivo"
 *  (Brian 03/09: "hoy la A8121 de Chiapero está cargando; que se vayan
 *  subiendo las fotos de la operativa"). */
function cargaHoy(s: ParsedShipment, hoyISO: string): boolean {
  return ops(s).some(o => isoDia(o.SALIDA) === hoyISO)
}

/**
 * Fotos e informes subidos en los últimos `dias`, agrupados por carga y lugar:
 * lo que el cliente quiere ver apenas entra. Una carga puede traer dos filas
 * (fotos en origen y fotos en Montevideo) porque son dos momentos distintos.
 */
export function novedadesCliente(
  shipments: ParsedShipment[],
  fotos: SubidaFoto[],
  informes: SubidaInforme[],
  hoyISO: string,
  dias = NOVEDADES_DIAS,
  nombreCliente = '',
): NovedadCliente[] {
  const porRef = new Map<string, ParsedShipment>()
  for (const s of shipments || []) {
    const r = txt(s.REF).toUpperCase()
    if (r) porRef.set(r, s)
  }
  const dentroDeVentana = (fecha: string): number | null => {
    if (!fecha) return null
    const d = diffDias(fecha, hoyISO)   // días desde la subida (hoy = 0)
    return Number.isFinite(d) && d >= 0 && d <= dias ? d : null
  }

  const out: NovedadCliente[] = []

  // Fotos: una fila por (carga, lugar), con la subida más reciente.
  const grupos = new Map<string, { s: ParsedShipment; tipo: string; n: number; fecha: string }>()
  for (const f of fotos || []) {
    const ref = txt(f.shipmentRef).toUpperCase()
    const s = porRef.get(ref)
    if (!s) continue                                  // carga de otro cliente o archivada
    const fecha = diaDeTimestamp(f.createdAt)
    if (dentroDeVentana(fecha) === null) continue
    const tipo = txt(f.photoType) || 'origen'
    const clave = `${ref}|${tipo}`
    const g = grupos.get(clave)
    if (g) { g.n += 1; if (fecha > g.fecha) g.fecha = fecha }
    else grupos.set(clave, { s, tipo, n: 1, fecha })
  }
  for (const g of grupos.values()) {
    out.push({
      ...base(g.s),
      clase: 'fotos',
      lugar: lugarDeFotos(g.s, g.tipo),
      cantidad: g.n,
      fecha: g.fecha,
      dias: dentroDeVentana(g.fecha) ?? 0,
      cargandoAhora: g.tipo !== 'origen' && cargaHoy(g.s, hoyISO),
    })
  }

  // Informes: uno por documento, que es un hecho puntual.
  for (const i of informes || []) {
    const s = porRef.get(txt(i.shipmentRef).toUpperCase())
    if (!s) continue
    const fecha = diaDeTimestamp(i.createdAt)
    const d = dentroDeVentana(fecha)
    if (d === null) continue
    out.push({
      ...base(s, nombreCliente),
      clase: 'informe',
      lugar: txt(i.title) || 'Informe operativo',
      cantidad: 1,
      fecha,
      dias: d,
      cargandoAhora: false,
    })
  }

  // Lo más nuevo primero; a igual día, primero lo que está pasando ahora.
  return out.sort((a, b) =>
    a.dias - b.dias
    || Number(b.cargandoAhora) - Number(a.cargandoAhora)
    || a.ref.localeCompare(b.ref))
}

// ── Card 3: Llegan a Montevideo (solo ruta UY) ───────────────────────────

export interface FilaLlegadaMvd extends FilaBase {
  buque: string
  descripcion: string
  eta: string
  dias: number
  cntrs: number
  /** Qué pasa cuando llega, en palabras del cliente. */
  pasoSiguiente: string
}

export const MVD_DIAS_ADELANTE = 14

export function pasoSiguiente(s: ParsedShipment): string {
  const o = ops(s)[0]
  const dep = txt(o?.DEPOSITO)
  if (tipoDe(s) === 'lcl') return dep ? `Desconsolida en ${dep}` : 'Desconsolida en depósito'
  if (!o) return ''
  const op = txt(o.OPERATIVA).toUpperCase()
  if (op === 'TRASIEGO') return dep ? `Trasiego en ${dep}` : 'Trasiego a camión'
  if (op === 'CONTENEDOR') return 'Directo a tu depósito'
  if (op === 'CARGA A PISO') return dep ? `Desconsolida en ${dep}` : 'Desconsolida en depósito'
  return ''
}

export function llegadasAMontevideo(shipments: ParsedShipment[], hoyISO: string, adelante = MVD_DIAS_ADELANTE, nombreCliente = ''): FilaLlegadaMvd[] {
  const out: FilaLlegadaMvd[] = []
  for (const s of shipments || []) {
    if (!porUruguay(s)) continue
    const eta = isoDia(s.ETA)
    if (!eta) continue
    const d = diffDias(hoyISO, eta)
    if (d < 0 || d > adelante) continue
    const lista = ops(s)
    out.push({
      ...base(s, nombreCliente),
      buque: txt(s.BUQUE),
      descripcion: txt(lista[0]?.DESCRIPCION),
      eta,
      dias: d,
      cntrs: Number(s.N) || lista.filter(o => txt(o.CNTR_OP)).length,
      pasoSiguiente: pasoSiguiente(s),
    })
  }
  return out.sort((a, b) => a.eta.localeCompare(b.eta) || a.ref.localeCompare(b.ref))
}

// ── Card 4: Embarcadas ────────────────────────────────────────────────────

export interface FilaEmbarque extends FilaBase {
  buque: string
  descripcion: string
  etd: string
  /** días hasta el zarpe: negativo = ya zarpó. */
  dias: number
  /** true = ya zarpó. */
  zarpo: boolean
  /** ETA al puerto (ISO, '' si no hay). */
  eta: string
}

export const EMBARQUE_DIAS_ATRAS = 7
export const EMBARQUE_DIAS_ADELANTE = 7

export function embarcadas(
  shipments: ParsedShipment[],
  hoyISO: string,
  atras = EMBARQUE_DIAS_ATRAS,
  adelante = EMBARQUE_DIAS_ADELANTE,
  nombreCliente = '',
): FilaEmbarque[] {
  const out: FilaEmbarque[] = []
  for (const s of shipments || []) {
    const etd = isoDia(s.ETD)
    if (!etd) continue
    const eta = isoDia(s.ETA)
    // Lo que ya está en una card de llegada no se repite acá.
    const topeLlegada = porUruguay(s) ? MVD_DIAS_ADELANTE : DESTINO_DIAS_ADELANTE
    if (eta && diffDias(hoyISO, eta) <= topeLlegada) continue
    const d = diffDias(hoyISO, etd)
    if (d < -atras || d > adelante) continue
    out.push({
      ...base(s, nombreCliente),
      buque: txt(s.BUQUE),
      descripcion: txt(ops(s)[0]?.DESCRIPCION),
      etd,
      dias: d,
      zarpo: d <= 0,
      eta: eta || '',
    })
  }
  return out.sort((a, b) => a.etd.localeCompare(b.etd) || a.ref.localeCompare(b.ref))
}

// ── Card 5: Atención — las alertas traducidas al cliente ─────────────────

export interface AlertaCliente {
  id: string
  ref: string
  refs: RefsCliente
  titulo: string
  detalle: string
  critica: boolean
}

/** Las alertas del portal hablan en nuestro idioma ("Días libres vencidos").
 *  Acá se traducen: la ref del cliente sale de `shipmentRef` (el texto ya no
 *  la trae, spec 04/09) y se dice qué puede hacer. */
export function alertasCliente(alerts: ShipmentAlert[], shipments: ParsedShipment[], nombreCliente = ''): AlertaCliente[] {
  const porRef = new Map<string, ParsedShipment>()
  for (const s of shipments || []) porRef.set(txt(s.REF), s)
  const out: AlertaCliente[] = []
  for (const a of alerts || []) {
    if (a.severity !== 'critical' && a.severity !== 'warning') continue
    const s = porRef.get(txt(a.shipmentRef))
    const refs = refsCliente(s || { REF: a.shipmentRef }, nombreCliente)
    let titulo = a.title
    let detalle = a.message
    if (a.type === 'libre_vencido') {
      titulo = 'Conviene coordinar la salida'
      detalle = 'El contenedor ya está generando costos de demora en Montevideo.'
    } else if (a.type === 'libre_urgente') {
      titulo = 'Conviene coordinar la salida'
      detalle = 'El contenedor está por generar costos de demora en Montevideo.'
    }
    out.push({ id: a.id, ref: txt(a.shipmentRef), refs, titulo, detalle, critica: a.severity === 'critical' })
  }
  return out
}

// ── Todo junto (para el componente y los contadores) ─────────────────────

export interface HoyCliente {
  destino: FilaDestino[]
  esperando: FilaEsperando[]
  montevideo: FilaLlegadaMvd[]
  embarques: FilaEmbarque[]
}

export function hoyCliente(shipments: ParsedShipment[], hoyISO: string, nombreCliente = ''): HoyCliente {
  return {
    destino: llegadasADestino(shipments, hoyISO, DESTINO_DIAS_ADELANTE, nombreCliente),
    esperando: esperandoSalida(shipments, hoyISO, nombreCliente),
    montevideo: llegadasAMontevideo(shipments, hoyISO, MVD_DIAS_ADELANTE, nombreCliente),
    embarques: embarcadas(shipments, hoyISO, EMBARQUE_DIAS_ATRAS, EMBARQUE_DIAS_ADELANTE, nombreCliente),
  }
}

/** "hoy" / "mañana" / "en 4d" / "hace 2d" — el mismo texto en todas las cards. */
export function textoDias(d: number | null): string {
  if (d === null) return ''
  if (d === 0) return 'hoy'
  if (d === 1) return 'mañana'
  if (d > 0) return `en ${d}d`
  return d === -1 ? 'ayer' : `hace ${-d}d`
}
