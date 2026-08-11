import { parseLocalDate, type ParsedShipment } from './shipmentTypes'
import { isPorUruguay } from './checksTypes'

/**
 * Reparto de cargas entre transportes.
 *
 * Se mide en CONTENEDORES, no en referencias: cada contenedor es un viaje de
 * camión y es lo que el transportista factura. Una ref con dos contenedores
 * pesa dos, y sus contenedores pueden ir a transportes distintos.
 *
 * Universo: cargas que pasan por Montevideo (isPorUruguay) y NO son de RDM.
 * RDM va siempre a Olaverry o Siroco por decisión caso a caso, así que queda
 * fuera de la cuota — si entrara, correría los porcentajes de los demás.
 *
 * Se cuentan salidas YA despachadas (SALIDA dentro de la ventana y no futura):
 * el panel mide lo que pasó, no lo que está agendado.
 */

export interface CuotaTransporte {
  transporte: string
  porcentaje: number
  activo: boolean
  orden: number
}

export type Ventana = '90d' | 'mes' | 'semana'

/**
 * `despachado` mira lo que ya salió (para medir cumplimiento).
 * `prevision` mira lo agendado hacia adelante (para repartir lo que viene).
 */
export type Modo = 'despachado' | 'prevision'

export interface Rango {
  desde: Date
  hasta: Date
}

export interface FilaDistribucion {
  transporte: string
  contenedores: number
  porcentaje: number
  /** null cuando el transporte no tiene cuota asignada. */
  objetivo: number | null
  ideal: number | null
  /** Positivo = le faltan cargas · negativo = le sobran. null si está fuera de cuota. */
  diferencia: number | null
  enCuota: boolean
}

export interface Distribucion {
  filas: FilaDistribucion[]
  total: number
  desde: Date
  hasta: Date
  /** Contenedores del período que todavía no tienen transporte: los repartibles. */
  sinAsignar: number
  rdm: { transporte: string; contenedores: number }[]
}

export interface Recomendacion {
  transporte: string | null
  opciones: string[]
  motivo: string
}

/** Transportes de RDM. No entran en la cuota: los elige Brian carga a carga. */
export const TRANSPORTES_RDM = ['OLAVERRY', 'SIROCO'] as const

/**
 * Vairolatti trabaja con furgones. Estos clientes no aceptan que su mercadería
 * viaje así, por lo que nunca se les recomienda — aunque sea el de mayor deuda.
 */
export const VAIROLATTI_BLOQUEADOS = ['VMG', 'CHIAPERO'] as const

export const SIN_ASIGNAR = 'SIN ASIGNAR'

const norm = (s: string | null | undefined): string => String(s || '').trim().toUpperCase()

/** RDM como palabra entera: 'RDM - ABEA' sí, 'GUARDMEX' no. */
export function esRdm(s: ParsedShipment): boolean {
  return /\bRDM\b/.test(norm(s.CLIENTE))
}

const medianoche = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** Inicio de la ventana hacia atrás. La semana arranca el lunes (criterio ISO). */
export function ventanaDesde(v: Ventana, hoy: Date): Date {
  const h = medianoche(hoy)
  if (v === 'mes') return new Date(h.getFullYear(), h.getMonth(), 1)
  if (v === 'semana') {
    const dow = (h.getDay() + 6) % 7          // 0 = lunes … 6 = domingo
    return new Date(h.getFullYear(), h.getMonth(), h.getDate() - dow)
  }
  return new Date(h.getFullYear(), h.getMonth(), h.getDate() - 90)
}

const masDias = (d: Date, n: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/**
 * Rango de fechas de una ventana.
 *
 * Despachado corta en HOY: nunca incluye lo que todavía no pasó, así el
 * cumplimiento no se ve cumplido antes de estarlo.
 *
 * En previsión, `semana` es la semana QUE VIENE completa (lunes a domingo) —
 * es la unidad con la que se arma el trabajo. `mes` y `90d` son los próximos
 * 30 y 90 días corridos desde hoy. Para cualquier otro corte está el rango
 * propio, que `calcularDistribucion` acepta directamente.
 */
export function rangoVentana(v: Ventana, hoy: Date, modo: Modo = 'despachado'): Rango {
  const h = medianoche(hoy)
  if (modo === 'despachado') return { desde: ventanaDesde(v, h), hasta: h }
  if (v === 'semana') {
    const lunesQueViene = masDias(ventanaDesde('semana', h), 7)
    return { desde: lunesQueViene, hasta: masDias(lunesQueViene, 6) }
  }
  return { desde: h, hasta: masDias(h, v === 'mes' ? 30 : 90) }
}

/** Una carga entra al universo del reparto. */
function entraAlUniverso(s: ParsedShipment): boolean {
  if ((s as ParsedShipment & { archived?: boolean }).archived) return false
  return isPorUruguay(s.PAIS)
}

/** Contenedores despachados por transporte dentro de la ventana. */
function contar(
  shipments: ParsedShipment[],
  desde: Date,
  hasta: Date,
): { cuenta: Map<string, number>; rdm: Map<string, number> } {
  const cuenta = new Map<string, number>()
  const rdm = new Map<string, number>()
  for (const s of shipments) {
    if (!entraAlUniverso(s)) continue
    const destino = esRdm(s) ? rdm : cuenta
    for (const op of s.operativas || []) {
      const salida = parseLocalDate(op.SALIDA || '')
      if (!salida) continue
      const d = medianoche(salida)
      if (d < desde || d > hasta) continue
      const t = norm(op.TRANSPORTE) || SIN_ASIGNAR
      destino.set(t, (destino.get(t) || 0) + 1)
    }
  }
  return { cuenta, rdm }
}

export function calcularDistribucion(
  shipments: ParsedShipment[],
  cuotas: CuotaTransporte[],
  ventanaORango: Ventana | Rango,
  hoy: Date,
  modo: Modo = 'despachado',
): Distribucion {
  const { desde, hasta } = typeof ventanaORango === 'string'
    ? rangoVentana(ventanaORango, hoy, modo)
    : { desde: medianoche(ventanaORango.desde), hasta: medianoche(ventanaORango.hasta) }
  const { cuenta, rdm } = contar(shipments, desde, hasta)

  const activas = cuotas.filter(c => c.activo)
  const objetivos = new Map(activas.map(c => [norm(c.transporte), c.porcentaje]))
  const total = [...cuenta.values()].reduce((a, b) => a + b, 0)

  // Los transportes con cuota se muestran siempre, aunque estén en cero: que
  // Rigatosso no aparezca porque no despachó nada es justo lo que hay que ver.
  const nombres = new Set<string>([...objetivos.keys(), ...cuenta.keys()])

  const filas: FilaDistribucion[] = [...nombres].map(t => {
    const contenedores = cuenta.get(t) || 0
    const objetivo = objetivos.has(t) ? objetivos.get(t)! : null
    const ideal = objetivo === null ? null : Math.round((objetivo / 100) * total)
    return {
      transporte: t,
      contenedores,
      porcentaje: total ? (contenedores / total) * 100 : 0,
      objetivo,
      ideal,
      diferencia: ideal === null ? null : ideal - contenedores,
      enCuota: objetivo !== null,
    }
  })

  // Primero los que tienen cuota (por orden configurado), después el resto por volumen.
  const orden = new Map(activas.map(c => [norm(c.transporte), c.orden]))
  filas.sort((a, b) => {
    if (a.enCuota !== b.enCuota) return a.enCuota ? -1 : 1
    if (a.enCuota) return (orden.get(a.transporte) || 0) - (orden.get(b.transporte) || 0)
    return b.contenedores - a.contenedores
  })

  return {
    filas,
    total,
    desde,
    hasta,
    sinAsignar: cuenta.get(SIN_ASIGNAR) || 0,
    rdm: [...rdm.entries()]
      .map(([transporte, contenedores]) => ({ transporte, contenedores }))
      .sort((a, b) => b.contenedores - a.contenedores),
  }
}

export interface RepartoSugerido {
  transporte: string
  cantidad: number
}

/**
 * Reparte N contenedores todavía sin transporte para acercarse a los objetivos.
 *
 * Asigna de a uno al de mayor deuda y recalcula después de cada asignación: si
 * se hiciera de una sola pasada, todo caería en el que más atrás viene y se
 * pasaría de largo. `base` es la foto contra la que se mide — normalmente los
 * 90 días despachados, que es donde la cuota tiene sentido.
 *
 * No mira las restricciones por cliente (Vairolatti y los furgones): es un
 * reparto agregado, no una asignación carga por carga.
 */
export function sugerirReparto(
  pendientes: number,
  base: Distribucion,
  cuotas: CuotaTransporte[],
): RepartoSugerido[] {
  const activas = cuotas.filter(c => c.activo)
  if (pendientes <= 0 || !activas.length) return []

  const yaTiene = new Map<string, number>()
  const asignado = new Map<string, number>()
  for (const c of activas) {
    const t = norm(c.transporte)
    yaTiene.set(t, base.filas.find(f => f.transporte === t)?.contenedores || 0)
    asignado.set(t, 0)
  }

  let total = base.total
  for (let i = 0; i < pendientes; i++) {
    total++
    const ranking = activas
      .map(c => {
        const t = norm(c.transporte)
        const tiene = (yaTiene.get(t) || 0) + (asignado.get(t) || 0)
        return { t, pct: c.porcentaje, deuda: Math.round((c.porcentaje / 100) * total) - tiene }
      })
      .sort((a, b) => b.deuda - a.deuda || b.pct - a.pct)
    const gana = ranking[0].t
    asignado.set(gana, (asignado.get(gana) || 0) + 1)
  }

  return activas.map(c => ({
    transporte: norm(c.transporte),
    cantidad: asignado.get(norm(c.transporte)) || 0,
  }))
}

/**
 * Sugiere el transporte con mayor deuda contra su objetivo. Es una sugerencia:
 * el operador elige el que quiera. Medir por deuda (y no por sorteo) hace que
 * el reparto se autocorrija y que la sugerencia sea explicable.
 */
export function recomendarTransporte(
  carga: ParsedShipment,
  historial: ParsedShipment[],
  cuotas: CuotaTransporte[],
  hoy: Date,
): Recomendacion {
  if (esRdm(carga)) {
    return {
      transporte: TRANSPORTES_RDM[0],
      opciones: [...TRANSPORTES_RDM],
      motivo: 'Carga de RDM — sale por Olaverry o Siroco, fuera de la cuota',
    }
  }

  const cliente = norm(carga.CLIENTE)
  const bloqueaVairolatti = VAIROLATTI_BLOQUEADOS.some(b => cliente.includes(b))

  const { filas } = calcularDistribucion(historial, cuotas, '90d', hoy)
  const candidatas = filas
    .filter(f => f.enCuota)
    .filter(f => !(bloqueaVairolatti && f.transporte === 'VAIROLATTI'))

  if (!candidatas.length) {
    return { transporte: null, opciones: [], motivo: 'No hay cuotas de transporte configuradas' }
  }

  // Mayor deuda primero; a igualdad de deuda, el de mayor cuota.
  const ranking = [...candidatas].sort((a, b) => {
    const d = (b.diferencia ?? 0) - (a.diferencia ?? 0)
    return d !== 0 ? d : (b.objetivo ?? 0) - (a.objetivo ?? 0)
  })

  const elegida = ranking[0]
  const faltan = elegida.diferencia ?? 0
  const motivo = faltan > 0
    ? `${elegida.transporte} — le faltan ${faltan} para su ${elegida.objetivo}%`
    : `${elegida.transporte} — todos en meta, va por cuota (${elegida.objetivo}%)`

  return {
    transporte: elegida.transporte,
    opciones: ranking.map(f => f.transporte),
    motivo: bloqueaVairolatti ? `${motivo} · Vairolatti excluido (furgones)` : motivo,
  }
}
