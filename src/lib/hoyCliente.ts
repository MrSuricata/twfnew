/**
 * HOY del cliente — la lógica de las cards del portal "Mis Cargas".
 *
 * Brian (02/09/2026): "pensemos la lógica para el cliente: qué le interesa?
 * cuándo le llegan las próximas cargas, cargas que están zarpando, y luego
 * activas y agenda". Misma idea que HOY depósito/transporte: cards con
 * contador, filas cortas, card vacía = no se muestra.
 *
 * Deriva TODO de los ParsedShipment que el portal ya recibe del server (lista
 * blanca del cliente). Cero datos nuevos. Pura y testeable: `hoyISO` entra por
 * parámetro, nunca se lee el reloj acá.
 *
 * Reglas que dejó la revisión adversaria (02/09):
 *  · El día de la ETA el buque "llega hoy": la carga está SOLO en "Llegan a
 *    Montevideo". Pasa a "En Montevideo" desde el día siguiente. Así ninguna
 *    carga cae en dos cards a la vez.
 *  · "En camino" solo si algo está viajando (salió ANTES de hoy y no llegó).
 *    El día de la salida la card dice SALE HOY y la fila "Sale de Montevideo hoy".
 *  · "Entregada" = la carga SALIÓ y el contenedor está DEVUELTO (en OPERATIVA o
 *    en LIBRE, que es donde vive en la web). DESCARGA es la fecha en que se
 *    confirmó el arribo del buque y DEV es un LUGAR: ninguno significa entrega.
 *  · Sin ETA_FISC, una salida de hace más de 14 días se da por llegada al
 *    depósito (DIAS_LLEGADA_SUPUESTA): nada queda "en camino" para siempre.
 *  · "Embarcadas" no repite lo que ya está en "Llegan a Montevideo" (ETA a
 *    14 días o menos).
 *  · Activo/Historial para el cliente se decide con estas mismas reglas
 *    (esActivaParaCliente), no con isShipmentCompleted del admin, que mandaba
 *    los trasiegos a Historial el día después de la salida con el camión en
 *    la frontera.
 *
 * Spec: docs/superpowers/specs/2026-09-02-portal-cliente-hoy-design.md
 */
import type { ParsedShipment, OperativasRecord, ShipmentAlert } from './shipmentTypes'
import { fmtDateDMY } from './format'

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

const ops = (s: ParsedShipment): OperativasRecord[] => (s.operativas || []).filter(Boolean)

/** El buque YA llegó a Montevideo: ETA anterior a hoy (el día de la ETA
 *  todavía "llega hoy"). Sin ETA no se puede saber → se asume que sí, misma
 *  convención que getShipmentStatus. */
const llegoAMvd = (s: ParsedShipment, hoyISO: string): boolean => {
  const d = dias(hoyISO, s.ETA)
  return d === null ? true : d < 0
}

/** Sin ETA_FISC cargada, una salida de hace más de esto se da por llegada al
 *  depósito (misma convención que el admin: "SALIDA > 2 semanas = llegó"). Sin
 *  este tope una carga con salida vieja y sin fecha de llegada quedaba "En
 *  camino" para siempre (revisión 02/09). */
export const DIAS_LLEGADA_SUPUESTA = 14

const fiscalAlcanzada = (o: OperativasRecord, hoyISO: string): boolean => (dias(hoyISO, o.ETA_FISC) ?? 1) <= 0
/** Fecha (ISO) en que la carga llegó al depósito del cliente: ETA_FISC si está
 *  y ya pasó; si no hay ETA_FISC, SALIDA + DIAS_LLEGADA_SUPUESTA cuando ya
 *  pasó. null = todavía no llegó (o no se puede saber). */
const fechaLlegadaDeposito = (o: OperativasRecord, hoyISO: string): string | null => {
  const fisc = isoDia(o.ETA_FISC)
  if (fisc) return diffDias(hoyISO, fisc) <= 0 ? fisc : null
  const salida = isoDia(o.SALIDA)
  if (!salida) return null
  const dSalida = diffDias(hoyISO, salida)
  if (dSalida > -DIAS_LLEGADA_SUPUESTA) return null
  const d = new Date(Date.parse(salida + 'T00:00:00Z') + DIAS_LLEGADA_SUPUESTA * 86400000)
  return d.toISOString().slice(0, 10)
}
const llegoAlDeposito = (o: OperativasRecord, hoyISO: string): boolean => fechaLlegadaDeposito(o, hoyISO) !== null
/** Salió ANTES de hoy y todavía no llegó: está viajando. */
const viajando = (o: OperativasRecord, hoyISO: string): boolean => (dias(hoyISO, o.SALIDA) ?? 1) < 0 && !llegoAlDeposito(o, hoyISO)
/** Contenedor devuelto: DEVUELTO en OPERATIVA o en LIBRE (donde vive en la web). */
const devuelto = (o: OperativasRecord, libreCarga: unknown): boolean =>
  txt(o.OPERATIVA).toUpperCase() === 'DEVUELTO'
  || txt(o.LIBRE).toUpperCase() === 'DEVUELTO'
  || txt(libreCarga).toUpperCase() === 'DEVUELTO'
/** Entregada = la carga SALIÓ y el contenedor se devolvió. Un DEVUELTO sin
 *  salida (carga a piso: el contenedor vuelve vacío y la mercadería sigue en
 *  el depósito uruguayo) NO es entrega. */
const entregada = (o: OperativasRecord, libreCarga: unknown): boolean => !!isoDia(o.SALIDA) && devuelto(o, libreCarga)

// ── Referencias ──────────────────────────────────────────────────────────

export interface RefsCliente {
  /** Lo que va grande: la ref propia del cliente, o "TWF 8216" si no cargó una. */
  principal: string
  /** Lo que va chico: "TWF 7996" cuando la principal es la propia; '' si no. */
  secundaria: string
  /** true = el cliente tiene su propia referencia cargada. */
  propia: boolean
}

/** Una sola regla para nombrar la carga en toda la pantalla (Brian 02/09:
 *  "sin ref propia se ve TWF 8216 y no una ref sin dueño"). */
export function refsCliente(s: { REF?: unknown; CLIENT_REF?: unknown } | null | undefined): RefsCliente {
  const propia = txt(s?.CLIENT_REF)
  const twf = 'TWF ' + txt(s?.REF).replace(/^A(?=\d)/, '')
  if (propia) return { principal: propia, secundaria: twf, propia: true }
  return { principal: twf, secundaria: '', propia: false }
}

// ── Estado en lenguaje del cliente ────────────────────────────────────────

export type EstadoCliente =
  | 'por_embarcar'   // sin ETD o ETD futuro
  | 'embarcada'      // zarpó, todavía no llegó a Montevideo (incluye el día de la ETA)
  | 'en_montevideo'  // llegó; nada viaja hacia el depósito (puede haber salida programada o de hoy)
  | 'en_camino'      // algún contenedor salió antes de hoy y no llegó al depósito
  | 'en_deposito'    // todo llegó al depósito del cliente
  | 'entregada'      // todo devuelto / cerrado

export const ESTADO_CLIENTE_ORDEN: EstadoCliente[] = [
  'por_embarcar', 'embarcada', 'en_montevideo', 'en_camino', 'en_deposito', 'entregada',
]

export const ESTADO_CLIENTE_LABEL: Record<EstadoCliente, string> = {
  por_embarcar: 'Por embarcar',
  embarcada: 'Embarcada',
  en_montevideo: 'En Montevideo',
  en_camino: 'En camino',
  en_deposito: 'En tu depósito',
  entregada: 'Entregada',
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
  if (!llegoAMvd(s, hoyISO)) {
    const dEtd = dias(hoyISO, s.ETD)
    return dEtd !== null && dEtd <= 0 ? 'embarcada' : 'por_embarcar'
  }
  const lista = ops(s)
  if (lista.length === 0) return 'en_montevideo'
  if (lista.every(o => entregada(o, s.LIBRE_HASTA))) return 'entregada'
  if (lista.some(o => viajando(o, hoyISO))) return 'en_camino'
  if (lista.every(o => llegoAlDeposito(o, hoyISO))) return 'en_deposito'
  // Nada viaja y algo no salió (o sale hoy): sigue en Montevideo.
  return 'en_montevideo'
}

/** Días desde la última llegada al depósito (null si ninguna llegó). */
const diasDesdeUltimaLlegada = (s: ParsedShipment, hoyISO: string): number | null => {
  const llegadas = ops(s).map(o => fechaLlegadaDeposito(o, hoyISO)).filter((f): f is string => !!f).map(f => -diffDias(hoyISO, f))
  if (llegadas.length === 0) return null
  return Math.min(...llegadas)
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
    // Sin operativas nunca va a llegar a "en depósito": una carga arribada hace
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
  switch (estado) {
    case 'por_embarcar': {
      const etd = isoDia(s.ETD) || ''
      return etd ? { label: 'Zarpa', fecha: fmt(etd), iso: etd } : { label: 'Zarpe', fecha: 'A confirmar', iso: '' }
    }
    case 'embarcada': {
      const eta = isoDia(s.ETA) || ''
      return eta ? { label: 'Llega a Montevideo', fecha: fmt(eta), iso: eta } : { label: 'Llegada a Montevideo', fecha: 'A confirmar', iso: '' }
    }
    case 'en_montevideo': {
      // Salida programada (hoy o futura) → se muestra; sin salida → hay que coordinarla.
      const programada = minIso(lista.map(o => o.SALIDA).filter(v => (dias(hoyISO, v) ?? -1) >= 0))
      return programada
        ? { label: 'Sale de Montevideo', fecha: fmt(programada), iso: programada }
        : { label: 'Salida', fecha: 'A coordinar', iso: '' }
    }
    case 'en_camino': {
      const llegada = minIso(lista.filter(o => viajando(o, hoyISO)).map(o => o.ETA_FISC))
      return llegada
        ? { label: 'Llega a tu depósito', fecha: fmt(llegada), iso: llegada }
        : { label: 'Llegada a tu depósito', fecha: 'A confirmar', iso: '' }
    }
    case 'en_deposito': {
      const desde = maxIso(lista.map(o => fechaLlegadaDeposito(o, hoyISO)))
      const estimada = !lista.some(o => isoDia(o.ETA_FISC))
      return desde
        ? { label: estimada ? 'En tu depósito (estimado)' : 'En tu depósito desde', fecha: fmt(desde), iso: desde }
        : { label: 'En tu depósito', fecha: '', iso: '' }
    }
    case 'entregada':
      return { label: 'Entregada', fecha: '', iso: '' }
  }
}

// ── Card 1: Llegan a tu depósito ──────────────────────────────────────────

export type EstadoLlegadaDeposito = 'en_frontera' | 'sale_hoy' | 'sale'

export interface FilaDeposito {
  ref: string
  refs: RefsCliente
  descripcion: string
  cntr: string
  /** ETA_FISC ISO ('' = a confirmar). */
  fecha: string
  /** días hasta ETA_FISC (null si no hay). */
  dias: number | null
  estado: EstadoLlegadaDeposito
  /** SALIDA ISO. */
  salida: string
  fiscal: string
}

export const DEPOSITO_DIAS_ADELANTE = 7

/** Contenedores con SALIDA cargada que van hacia el depósito del cliente: ya
 *  salieron y no llegaron, salen hoy, o salen en los próximos días. Sin
 *  SALIDA no hay nada que "llegue": eso es "esperando salida" (card 2). */
export function llegadasADeposito(shipments: ParsedShipment[], hoyISO: string, adelante = DEPOSITO_DIAS_ADELANTE): FilaDeposito[] {
  const out: FilaDeposito[] = []
  for (const s of shipments || []) {
    if (!llegoAMvd(s, hoyISO)) continue
    for (const o of ops(s)) {
      if (llegoAlDeposito(o, hoyISO)) continue // ya está en el depósito (o se da por llegado)
      if (entregada(o, s.LIBRE_HASTA)) continue
      const salida = isoDia(o.SALIDA)
      if (!salida) continue
      const dSalida = diffDias(hoyISO, salida)
      if (dSalida > adelante) continue
      const estado: EstadoLlegadaDeposito = dSalida < 0 ? 'en_frontera' : dSalida === 0 ? 'sale_hoy' : 'sale'
      const fiscal = isoDia(o.ETA_FISC) || ''
      out.push({
        ref: txt(s.REF),
        refs: refsCliente(s),
        descripcion: txt(o.DESCRIPCION),
        cntr: txt(o.CNTR_OP),
        fecha: fiscal,
        dias: fiscal ? diffDias(hoyISO, fiscal) : null,
        estado,
        salida,
        fiscal: txt(o.FISCAL),
      })
    }
  }
  // Lo que ya viene primero (en frontera / sale hoy), después por fecha de llegada.
  const rango = (e: EstadoLlegadaDeposito) => (e === 'en_frontera' ? 0 : e === 'sale_hoy' ? 1 : 2)
  return out.sort((a, b) =>
    rango(a.estado) - rango(b.estado)
    || (a.fecha || '9999').localeCompare(b.fecha || '9999')
    || a.salida.localeCompare(b.salida)
    || a.ref.localeCompare(b.ref))
}

// ── Card 2: En Montevideo, esperando salida ──────────────────────────────

export interface FilaEsperando {
  ref: string
  refs: RefsCliente
  descripcion: string
  cntr: string
  /** Dónde está: LUGAR_SALIDA del contenedor, si no la terminal de arribo. */
  lugar: string
  /** ETA a Montevideo (ISO). */
  desde: string
  /** Días desde que llegó (≥ 1: el día de la ETA todavía está "llegando"). */
  dias: number
}

/** Contenedores arribados a Montevideo (ETA anterior a hoy) sin salida cargada:
 *  el cliente tiene que decidir cuándo los quiere. */
export function esperandoSalida(shipments: ParsedShipment[], hoyISO: string): FilaEsperando[] {
  const out: FilaEsperando[] = []
  for (const s of shipments || []) {
    const eta = isoDia(s.ETA)
    if (!eta || diffDias(hoyISO, eta) >= 0) continue // sin ETA no se afirma que llegó; el día 0 es "llega hoy"
    for (const o of ops(s)) {
      if (isoDia(o.SALIDA)) continue // tiene salida (pasada, de hoy o programada) → card 1 o en camino
      if (fiscalAlcanzada(o, hoyISO)) continue
      const lugar = txt(o.LUGAR_SALIDA) || (txt(s.TERMINAL) ? `terminal ${txt(s.TERMINAL)}` : 'terminal')
      out.push({
        ref: txt(s.REF),
        refs: refsCliente(s),
        descripcion: txt(o.DESCRIPCION),
        cntr: txt(o.CNTR_OP),
        lugar,
        desde: eta,
        dias: -diffDias(hoyISO, eta),
      })
    }
  }
  return out.sort((a, b) => b.dias - a.dias || a.ref.localeCompare(b.ref))
}

// ── Card 3: Llegan a Montevideo ───────────────────────────────────────────

export interface FilaLlegadaMvd {
  ref: string
  refs: RefsCliente
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
  if (!o) return ''
  const op = txt(o.OPERATIVA).toUpperCase()
  const dep = txt(o.DEPOSITO)
  if (op === 'TRASIEGO') return dep ? `Trasiego en ${dep}` : 'Trasiego a camión'
  if (op === 'CONTENEDOR') return 'Directo a tu depósito'
  if (op === 'CARGA A PISO') return dep ? `Desconsolida en ${dep}` : 'Desconsolida en depósito'
  return ''
}

export function llegadasAMontevideo(shipments: ParsedShipment[], hoyISO: string, adelante = MVD_DIAS_ADELANTE): FilaLlegadaMvd[] {
  const out: FilaLlegadaMvd[] = []
  for (const s of shipments || []) {
    const eta = isoDia(s.ETA)
    if (!eta) continue
    const d = diffDias(hoyISO, eta)
    if (d < 0 || d > adelante) continue
    const lista = ops(s)
    out.push({
      ref: txt(s.REF),
      refs: refsCliente(s),
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

export interface FilaEmbarque {
  ref: string
  refs: RefsCliente
  buque: string
  descripcion: string
  etd: string
  /** días hasta el zarpe: negativo = ya zarpó. */
  dias: number
  /** true = ya zarpó. */
  zarpo: boolean
  /** ETA a Montevideo (ISO, '' si no hay). */
  eta: string
}

export const EMBARQUE_DIAS_ATRAS = 7
export const EMBARQUE_DIAS_ADELANTE = 7

export function embarcadas(
  shipments: ParsedShipment[],
  hoyISO: string,
  atras = EMBARQUE_DIAS_ATRAS,
  adelante = EMBARQUE_DIAS_ADELANTE,
): FilaEmbarque[] {
  const out: FilaEmbarque[] = []
  for (const s of shipments || []) {
    const etd = isoDia(s.ETD)
    if (!etd) continue
    const eta = isoDia(s.ETA)
    if (eta && diffDias(hoyISO, eta) <= MVD_DIAS_ADELANTE) continue // ya está (o estuvo) en "Llegan a Montevideo"
    const d = diffDias(hoyISO, etd)
    if (d < -atras || d > adelante) continue
    out.push({
      ref: txt(s.REF),
      refs: refsCliente(s),
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

/** Las alertas del portal hablan en nuestro idioma ("Días libres vencidos:
 *  A8045…"). Acá se traducen: ref del cliente y qué puede hacer. */
export function alertasCliente(
  alerts: ShipmentAlert[],
  shipments: ParsedShipment[],
): AlertaCliente[] {
  const porRef = new Map<string, ParsedShipment>()
  for (const s of shipments || []) porRef.set(txt(s.REF), s)
  const out: AlertaCliente[] = []
  for (const a of alerts || []) {
    if (a.severity !== 'critical' && a.severity !== 'warning') continue
    const s = porRef.get(txt(a.shipmentRef))
    const refs = refsCliente(s || { REF: a.shipmentRef })
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
  deposito: FilaDeposito[]
  esperando: FilaEsperando[]
  montevideo: FilaLlegadaMvd[]
  embarques: FilaEmbarque[]
}

export function hoyCliente(shipments: ParsedShipment[], hoyISO: string): HoyCliente {
  return {
    deposito: llegadasADeposito(shipments, hoyISO),
    esperando: esperandoSalida(shipments, hoyISO),
    montevideo: llegadasAMontevideo(shipments, hoyISO),
    embarques: embarcadas(shipments, hoyISO),
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
