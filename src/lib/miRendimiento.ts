/**
 * Mi rendimiento — el parte personal de las operativas de depósito.
 *
 * Brian (18/08/2026) necesita poder responder, operativa por operativa:
 * ¿fui al depósito? ¿pasé las fotos? ¿avisé el traslado del contenedor?
 * ¿avisé la salida rumbo a frontera? ¿hice el informe operativo?
 * Y arriba de todo: de cuántas operativas hice cada cosa.
 *
 * DECISIONES DE MEDICIÓN
 *
 * 1. El denominador sale de las CARGAS, no de lo que uno elige registrar: son
 *    las operativas que pasaron (o pasan) por depósito en el período. Así el
 *    número no se puede inflar marcando de más — solo se sube haciendo.
 *
 * 2. Dos señales se derivan de hechos, no de un tilde:
 *      · FOTOS   → hay fotos de Uruguay cargadas para esa ref
 *      · INFORME → hay un informe operativo subido para esa ref
 *    Las otras tres (visita, aviso de traslado, aviso de salida) son pasos de
 *    ref_checks con fecha y usuario.
 *
 * 3. LAS FOTOS NO PRUEBAN LA VISITA (corrección de Brian, 18/08). Puede haber
 *    fotos sin que él haya ido: las manda el depósito. Así que la visita es
 *    SOLO el tilde, y las fotos son una señal aparte — que la carga quedó
 *    documentada, venga de donde venga. Contarlas como visita inflaba
 *    exactamente el número que la página existe para defender.
 *    Y al revés: si hay INFORME, hay fotos, porque van adentro del informe
 *    (Brian 18/08). Un informe subido sin galería no es una carga sin fotos.
 *
 * 4. EL INFORME SE MIDE SOBRE LAS VISITAS, no sobre el total: el informe
 *    operativo sale de haber ido. Pedir informe de una operativa donde no
 *    fue no es un pendiente, es una métrica mal planteada. Un informe SIN
 *    visita se marca aparte (o falta el tilde, o el informe no corresponde).
 *
 * 5. AUTORÍA. Lo marcado con la identidad de OTRA persona no cuenta como
 *    propio. Lo marcado en la época del login compartido ('admin') o traído
 *    del import de la planilla ('planilla') no identifica a nadie: eso SÍ
 *    cuenta, porque "no atribuible" no es lo mismo que "de otro". De acá en
 *    más cada marca lleva la identidad real, así que el número se limpia solo.
 *
 * Pura y testeable: no toca red ni React.
 */

import type { RefCheckSteps } from './checksTypes'
import { normalizeRef, avisoForCntr, isPorUruguay } from './checksTypes'
import type { RefCheckStep } from './checksTypes'
import { parseCntr } from './cntrUtils'
import { parseLocalDate } from './shipmentTypes'

/** Operativas que pasan por depósito (las que generan visita e informe). */
const OPERATIVAS_DEPOSITO = new Set(['TRASIEGO', 'CARGA A PISO'])

export interface CargaRendimiento {
  ref: string
  cliente?: string | null
  deposito?: string | null
  operativa?: string | null
  cntr?: string | null
  eta?: string | null
  salida?: string | null
  pais?: string | null
  mode?: string | null
  archived?: boolean
  /** Fechas POR CONTENEDOR (planilla Operativas). Cada contenedor sale su
   *  propio día: sin esto, los dos contenedores de una carga mostraban la
   *  misma fecha y podían caer en la semana equivocada (A8025: el EGSU sale el
   *  19 y el EMCU el 18 — Brian 18/08). */
  operativas?: { cntr: string; salida?: string | null; eta?: string | null }[] | null
}

/** Una operativa con sus cinco señales. */
export interface FilaRendimiento {
  ref: string
  cliente: string
  deposito: string
  operativa: string
  /** Fecha que ordena la fila: la salida si está, si no la llegada. */
  fecha: string
  /** QUÉ es esa fecha. Sin esto la pantalla muestra una llegada con la misma
   *  cara que una salida y se lee como "sale hoy" (Brian 18/08, caso A7958:
   *  llegó el 18 y todavía no tiene salida coordinada). */
  fechaEs: 'salida' | 'llegada'
  /** El contenedor de ESTA fila. '' = la carga no tiene contenedor cargado. */
  cntr: string
  /** TODOS los contenedores de la ref. Hace falta para escribir el mapa
   *  completo del paso sin pisar lo marcado en los otros contenedores. */
  cntrs: string[]
  visita: boolean
  /** La carga quedó documentada: hay fotos subidas O informe (que las lleva). */
  fotos: boolean
  /** Hay fotos en la galería (no solo dentro del informe). */
  fotosSubidas: boolean
  /** Avisado en TODOS los contenedores. */
  avisoTraslado: boolean
  /** Avisado en algunos, no en todos. */
  avisoTrasladoParcial: boolean
  avisoSalida: boolean
  avisoSalidaParcial: boolean
  informe: boolean
  /** Informe subido sin haber marcado la visita: o falta el tilde, o el
   *  informe no corresponde. Se muestra, no se corrige solo. */
  informeSinVisita: boolean
}

export interface ResumenRendimiento {
  filas: FilaRendimiento[]
  total: number
  visitas: number
  fotos: number
  traslados: number
  salidas: number
  informes: number
  /** Informes de operativas a las que SÍ fue — el denominador honesto del
   *  informe operativo es la visita, no el total. */
  informesDeVisitadas: number
  /** Fui pero no hice el informe: el pendiente real. */
  visitasSinInforme: number
  /** Operativas sin ninguna de las cinco señales — lo que quedó sin tocar. */
  sinNada: number
}

const txt = (s: unknown): string => String(s ?? '').trim()

/** Autores que NO identifican a una persona: el login compartido de antes de
 *  las cuentas por usuario y el import de la planilla. */
const AUTOR_SIN_DUENO = new Set(['', 'admin', 'planilla', 'sistema', 'desconocido'])

/**
 * ¿Este registro lo hizo la persona del parte?
 *
 * @param by          autor guardado (ref_checks.steps[].by, created_by de fotos/informes)
 * @param identidades cómo se llama uno en los datos (email de login + nombre).
 *                    Vacío = no filtrar (cuenta todo el equipo).
 */
export function esAutorPropio(by: unknown, identidades: string[]): boolean {
  const b = txt(by).toLowerCase()
  if (AUTOR_SIN_DUENO.has(b)) return true
  if (identidades.length === 0) return true
  return identidades.some(i => txt(i).toLowerCase() === b)
}

/** ¿La carga entra al parte? Marítima por Uruguay, con operativa de depósito. */
export function esOperativaDeposito(c: CargaRendimiento): boolean {
  if (c.archived) return false
  const m = txt(c.mode).toLowerCase()
  if (m !== 'fcl' && m !== 'lcl') return false
  if (!isPorUruguay(c.pais)) return false
  return OPERATIVAS_DEPOSITO.has(txt(c.operativa).toUpperCase())
}

/** Fecha que ubica la operativa en el tiempo: la salida si es una fecha de
 *  verdad, si no la llegada. OJO: la columna SALIDA trae valores de texto
 *  reales ('CONFIRMAR', '#N/A') que son truthy — sin este guard la carga se
 *  caía del parte en silencio, justo la que está parada en depósito. */
export function fechaDeOperativa(c: CargaRendimiento, cntr?: string): string {
  return fechaConTipo(c, cntr).fecha
}

/** La fecha Y de dónde salió: la salida manda, la llegada es el respaldo. */
export function fechaConTipo(c: CargaRendimiento, cntr?: string): { fecha: string; es: 'salida' | 'llegada' } {
  // Si el contenedor tiene su propia fila en Operativas, MANDA la de él: es la
  // fecha de SU camión. Recién si no está se cae a la de la carga.
  const op = cntr
    ? (c.operativas || []).find(o => txt(o.cntr).toUpperCase() === txt(cntr).toUpperCase())
    : undefined
  const salidaOp = txt(op?.salida)
  if (salidaOp && parseLocalDate(salidaOp)) return { fecha: salidaOp, es: 'salida' }
  const etaOp = txt(op?.eta)
  if (op && etaOp) return { fecha: etaOp, es: 'llegada' }

  const salida = txt(c.salida)
  if (salida && parseLocalDate(salida)) return { fecha: salida, es: 'salida' }
  return { fecha: txt(c.eta), es: 'llegada' }
}

const enRango = (iso: string, desde: string, hasta: string): boolean => {
  const d = parseLocalDate(iso)
  const a = parseLocalDate(desde)
  const b = parseLocalDate(hasta)
  if (!d || !a || !b) return false
  // Por tiempo, no por string: parseLocalDate acepta '2026-8-20' y esa forma
  // comparada como texto se caía del rango.
  return d.getTime() >= a.getTime() && d.getTime() <= b.getTime()
}

/**
 * Arma el parte del período.
 *
 * @param cargas    todas las cargas (se filtran acá adentro)
 * @param checksByRef  pasos de ref_checks indexados por ref normalizada
 * @param refsConFotos ref normalizada → tiene fotos de Uruguay
 * @param refsConInforme ref normalizada → tiene informe operativo subido
 * @param desde/hasta  ISO inclusive
 */
export function buildRendimiento(args: {
  cargas: CargaRendimiento[]
  checksByRef: Map<string, RefCheckSteps>
  /** Claves `REF|CNTR` con fotos de Uruguay: la foto es de UN contenedor. */
  fotosPorCntr: Set<string>
  /** Refs con fotos de Uruguay SIN contenedor asignado (las de antes de que
   *  se etiquetaran). No se sabe de cuál son, así que cuentan para todos los
   *  contenedores de esa ref: es lo único honesto que se puede afirmar. */
  refsConFotosSinCntr: Set<string>
  /** Claves `REF|CNTR` con informe subido: el informe es de UN contenedor. */
  informesPorCntr: Set<string>
  /** Refs con informe SIN contenedor asignado (los de antes de poder
   *  elegirlo). Cuentan para todos los contenedores de esa ref. */
  refsConInformeSinCntr: Set<string>
  desde: string
  hasta: string
  /** Cómo se llama uno en los datos: identidad de login (el `by` que estampa
   *  el server) + nombre visible. Vacío = no filtrar por persona. */
  identidades?: string[]
}): ResumenRendimiento {
  const filas: FilaRendimiento[] = []
  const identidades = args.identidades || []

  // Una misma ref puede venir más de una vez (cache legacy + DB): sin dedupe
  // el denominador se infla solo y React repite la key.
  const vistas = new Set<string>()

  for (const c of args.cargas || []) {
    if (!esOperativaDeposito(c)) continue
    const norm = normalizeRef(c.ref)
    const steps = args.checksByRef.get(norm) || {}
    const cntrList = parseCntr(txt(c.cntr))
    // UNA FILA POR CONTENEDOR (Brian 18/08): cada contenedor de una carga sale
    // en su propio camión y su propio día, así que se puede haber ido a uno y
    // al otro no. Con una fila por ref no había forma de decirlo.
    // Sin contenedor cargado queda una sola fila con '' — la carga existe
    // igual y hay que poder marcarla.
    const filasCntr = cntrList.length > 0 ? cntrList : ['']

    for (const cntr of filasCntr) {
      const claveFila = `${norm}|${cntr}`
      // Una misma ref+cntr puede venir más de una vez (cache legacy + DB): sin
      // dedupe el denominador se infla solo y React repite la key.
      if (vistas.has(claveFila)) continue
      // El rango se evalúa CON LA FECHA DEL CONTENEDOR: dos contenedores de la
      // misma carga pueden caer en semanas distintas.
      const { fecha, es: fechaEs } = fechaConTipo(c, cntr)
      if (!enRango(fecha, args.desde, args.hasta)) continue
      vistas.add(claveFila)
      // La visita es POR CONTENEDOR y solo el tilde: las fotos pueden venir
      // del depósito, así que no prueban nada (Brian 18/08). avisoForCntr cae
      // al flag de nivel ref cuando no hay mapa por contenedor, así que lo
      // marcado antes de este cambio sigue contando en todos los contenedores.
      const visitaCntr = avisoForCntr(steps.visita_deposito, cntr)
      const visita = !!visitaCntr && esAutorPropio(visitaCntr.by, identidades)

      // Los avisos también son de ESTE contenedor: ya no hay "parcial", porque
      // la fila es un contenedor y no un agregado de varios.
      const trasladoC = avisoForCntr(steps.aviso_traslado, cntr)
      const salidaC = avisoForCntr(steps.aviso_salida, cntr)
      const avisoTraslado = !!trasladoC && esAutorPropio(trasladoC.by, identidades)
      const avisoSalida = !!salidaC && esAutorPropio(salidaC.by, identidades)

      // El informe es de SU contenedor. Los viejos, subidos antes de poder
      // elegirlo, no tienen contenedor: cuentan para todos los de la ref —
      // mismo criterio que las fotos.
      const informeOk = args.informesPorCntr.has(`${norm}|${cntr}`) || args.refsConInformeSinCntr.has(norm)
      // Las fotos van DENTRO del informe: si el informe se mandó, la carga
      // quedó documentada aunque la galería esté vacía (Brian 18/08).
      const fotosSubidas = args.fotosPorCntr.has(`${norm}|${cntr}`) || args.refsConFotosSinCntr.has(norm)
      const fotos = fotosSubidas || informeOk

      filas.push({
        ref: c.ref,
        cliente: txt(c.cliente) || '—',
        deposito: txt(c.deposito) || '—',
        operativa: txt(c.operativa).toUpperCase(),
        fecha,
        fechaEs,
        cntr,
        cntrs: cntrList,
        visita,
        fotos,
        fotosSubidas,
        avisoTraslado,
        avisoTrasladoParcial: false,
        avisoSalida,
        avisoSalidaParcial: false,
        informe: informeOk,
        informeSinVisita: informeOk && !visita,
      })
    }
  }

  // Más reciente arriba; sin fecha al final.
  filas.sort((a, b) => {
    if (!a.fecha) return 1
    if (!b.fecha) return -1
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1
    if (a.ref !== b.ref) return a.ref.localeCompare(b.ref)
    return a.cntr.localeCompare(b.cntr)
  })

  const cuenta = (f: (x: FilaRendimiento) => boolean): number => filas.filter(f).length
  return {
    filas,
    total: filas.length,
    visitas: cuenta(f => f.visita),
    fotos: cuenta(f => f.fotos),
    traslados: cuenta(f => f.avisoTraslado),
    salidas: cuenta(f => f.avisoSalida),
    informes: cuenta(f => f.informe),
    informesDeVisitadas: cuenta(f => f.visita && f.informe),
    visitasSinInforme: cuenta(f => f.visita && !f.informe),
    sinNada: cuenta(f => !f.visita && !f.fotos && !f.avisoTraslado && !f.avisoSalida && !f.informe),
  }
}

/** Una fila del resumen mensual. */
export interface MesRendimiento {
  /** 'YYYY-MM' */
  mes: string
  total: number
  visitas: number
  fotos: number
  traslados: number
  salidas: number
  informesDeVisitadas: number
}

/** Últimos N meses hacia atrás desde `hastaMes` ('YYYY-MM'), del más nuevo al
 *  más viejo. Sin Date-math sobre strings: se arma con el calendario. */
export function ultimosMeses(hastaMes: string, n: number): string[] {
  const [y, m] = hastaMes.split('-').map(Number)
  if (!y || !m) return []
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(y, m - 1 - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

/**
 * El mismo parte, mes a mes — para ver cómo viene la cosa y no solo la semana.
 *
 * Reusa buildRendimiento por mes completo: una sola definición de "qué cuenta",
 * así el número del mes y el de la semana nunca se contradicen.
 */
export function resumenMensual(
  args: Omit<Parameters<typeof buildRendimiento>[0], 'desde' | 'hasta'> & { meses: string[] },
): MesRendimiento[] {
  return args.meses.map(mes => {
    const [y, m] = mes.split('-').map(Number)
    const desde = `${mes}-01`
    // Día 0 del mes siguiente = último día de este mes (sin tabla de 28/30/31).
    const fin = new Date(y, m, 0)
    const hasta = `${mes}-${String(fin.getDate()).padStart(2, '0')}`
    const r = buildRendimiento({ ...args, desde, hasta })
    return {
      mes,
      total: r.total,
      visitas: r.visitas,
      fotos: r.fotos,
      traslados: r.traslados,
      salidas: r.salidas,
      informesDeVisitadas: r.informesDeVisitadas,
    }
  })
}

/** Depósitos visitados en el período, con las refs de cada uno. */
export function depositosVisitados(r: ResumenRendimiento): { deposito: string; refs: string[] }[] {
  // Con una fila por contenedor, una misma ref aparece varias veces: la lista
  // de refs del depósito se deduplica para no decir "fui 2 veces a PLANIR por
  // A8025" cuando fue una sola carga con dos contenedores.
  const m = new Map<string, Set<string>>()
  for (const f of r.filas) {
    if (!f.visita) continue
    const d = f.deposito || '—'
    const set = m.get(d) || new Set<string>()
    set.add(f.ref)
    m.set(d, set)
  }
  return [...m.entries()]
    .map(([deposito, refs]) => ({ deposito, refs: [...refs] }))
    .sort((a, b) => b.refs.length - a.refs.length)
}

/** Texto para pasarle el parte a alguien (WhatsApp/mail). Muestra lo hecho Y
 *  lo que falta: un parte que esconde los pendientes no aguanta una revisión. */
export function textoParte(r: ResumenRendimiento, desde: string, hasta: string): string {
  const dmy = (iso: string) => { const p = iso.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}` : iso }
  const frac = (n: number) => `${n}/${r.total}`
  const deps = depositosVisitados(r)
  const lineas = [
    `Parte de operativas ${dmy(desde)} al ${dmy(hasta)} — ${r.total} operativas por depósito`,
    `• Fui al depósito: ${frac(r.visitas)}`,
    `• Traslado avisado al cliente: ${frac(r.traslados)}`,
    `• Salida avisada: ${frac(r.salidas)}`,
    // El informe sale de haber ido: el denominador honesto son las visitas.
    `• Informe operativo: ${r.informesDeVisitadas}/${r.visitas} de las que fui`,
    `• Fotos de la carga: ${frac(r.fotos)} (propias o del depósito)`,
  ]
  if (deps.length) lineas.push(`• Depósitos: ${deps.map(d => `${d.deposito} (${d.refs.length})`).join(' · ')}`)
  // Pendiente = le falta CUALQUIERA de las cinco señales. Listar solo las de
  // los avisos dejaba afuera operativas sin visita, sin fotos y sin informe.
  const faltan = r.filas.filter(f => !f.visita || !f.fotos || !f.avisoTraslado || !f.avisoSalida || !f.informe)
  if (faltan.length) {
    lineas.push(`• Pendientes: ${faltan.slice(0, 6).map(f => f.ref).join(', ')}${faltan.length > 6 ? ` y ${faltan.length - 6} más` : ''}`)
  }
  return lineas.join('\n')
}
