/**
 * Campos pendientes de completar — "la webapp te reparte las tareas del día"
 * (Brian 17/08/2026): mantener los datos como se mantenía la planilla, pero
 * con la app diciéndote QUÉ falta y CUÁNDO empieza a importar.
 *
 * La regla es por ETAPA — una carga en origen sin contenedor no está
 * "incompleta", es normal. Cuanto más cerca la llegada, más exigente:
 *
 *   Siempre (activa)      → Cliente · País destino · ETA
 *   Embarcada (ETD pasó)  → Buque · Línea · BL · Contenedor (solo FCL)
 *   Llega en ≤14 días     → Bultos · Kg · M³ · Descripción · Agente
 *                            + Terminal (FCL por MVD)
 *   Llega en ≤7 / llegó   → Depósito · Operativa · Transporte · Fiscal
 *                            (coordinación: solo cargas por Uruguay)
 *                            + Despachante de destino (el que libera en AR),
 *                            recién cuando ya se sabe a qué fiscal va
 *   Llegó (ETA+1)         → Devolución (lugar) · Fecha devolución
 *                            (Brian 28/08: no antes — el buque tiene que
 *                            haber atracado para que el dato importe)
 *
 * Marítimas (FCL/LCL) no archivadas. Pura y testeable.
 */

import { parseLocalDate } from './shipmentTypes'
import { isPorUruguay } from './checksTypes'
import { refClienteSana } from './refsCliente'

export interface CargaCampos {
  mode?: string | null
  archived?: boolean
  pais?: string | null
  cliente?: string | null
  /** Referencia PROPIA del cliente (ej. CHIAPERO "1410"): es como ELLOS nombran
   *  la carga en mails y planes — sin ella no se les puede contestar nada. */
  clientRef?: string | null
  eta?: string | null
  etd?: string | null
  buque?: string | null
  /** Naviera. No es cosmética: de acá sale la forma de pago (deriveFormaPago)
   *  y por lo tanto el vencimiento de flete y locales, y el link de tracking. */
  linea?: string | null
  docNumber?: string | null
  cntr?: string | null
  pkgs?: number | null
  kg?: number | null
  m3?: number | null
  /** Descripción de la mercadería (columna real: `observacion`, herencia de la
   *  DESCRIPCION de la planilla): sin ella no se arma DJ ni informe. */
  descripcion?: string | null
  agente?: string | null
  deposito?: string | null
  operativa?: string | null
  transporte?: string | null
  fiscal?: string | null
  /** Terminal de llegada MVD (TCP/MONTECON): define el vencimiento del pago. */
  terminal?: string | null
  /** Madera en el embalaje: true = sí · false = no · null/undefined = a
   *  confirmar. Decide si hay que pedir SENASA el día de carga y va en el
   *  Word de AD/AT. Tri-estado: `false` es una respuesta, no un vacío. */
  wood?: boolean | null
  /** Terminal/depósito de DEVOLUCIÓN del vacío (STL/MPS/TCP…): Pagos saca de
   *  acá a QUIÉN se le paga la devolución y su costo default. */
  dev?: string | null
  /** Despachante de DESTINO: el que libera la carga en Argentina (Brian
   *  02/09). No es Navatta, que es el despachante uruguayo. Columna `despacho`. */
  despacho?: string | null
  /** Fecha de devolución del vacío, una vez que ocurrió. NO es un dato que se
   *  pueda pedir al arribo: recién existe cuando el contenedor volvió. Sirve
   *  para medir sobrestadía contra `libre`. */
  devFecha?: string | null
  /** Hasta cuándo el contenedor está libre de sobrestadía ("Libre (máx.
   *  devolución)"). Este SÍ se sabe al arribo y es el que hay que pedir. */
  libre?: string | null
  salida?: string | null
}

export interface CampoFaltante {
  campo: keyof CargaCampos
  etiqueta: string
}

/** Ventanas de exigencia (días antes de la llegada). */
export const FALTANTES_DIAS_CHECKS = 14
// 7 → 14 (Brian 22/08): "poneme las que llegan los próximos 14 días". La
// ventana de coordinación pasa a coincidir con la de checks — todo lo que
// llega en dos semanas pide sus datos completos de una.
export const FALTANTES_DIAS_COORDINACION = 14

const MS_DIA = 86_400_000
const medianoche = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate())

const vacio = (s: string | null | undefined): boolean => !String(s || '').trim()
const cero = (n: number | null | undefined): boolean => !(Number(n) > 0)

/** Clientes que trabajan con SU referencia propia en cada mail/plan (Brian
 *  26/08): para ellos la ref del cliente es un dato exigido, no un opcional.
 *  Substring case-insensitive: cubre "CHIAPERO Y ASOC. S.R.L.", "VMG S.A.",
 *  "EQUIPO ORIGINAL VMG" y todas las variantes de tipeo. */
export const CLIENTES_CON_REF_PROPIA = /CHIAPERO|VMG/i

/** Nombre de cliente comparable (mayúsculas, sin espacios de más). */
const claveCliente = (v: unknown): string => String(v || '').trim().toUpperCase().replace(/\s+/g, ' ')

/**
 * Clientes que DEMOSTRADAMENTE trabajan con su propia referencia: alguna de
 * sus cargas ya la tiene cargada y sana.
 *
 * Es lo que evita el modo de falla de `devFecha` (revisión 31/08): pedirle la
 * ref propia a los ~300 clientes que no usan ninguna llenaría la tarjeta con
 * un faltante que nunca se puede completar. Así el pedido aparece donde el
 * dato existe, y se enciende solo para un cliente nuevo apenas el equipo le
 * carga la primera. CHIAPERO/VMG entran siempre (Brian los nombró).
 */
export function clientesConRefPropia(cargas: CargaCampos[]): Set<string> {
  const out = new Set<string>()
  for (const c of cargas || []) {
    if (refClienteSana(c.clientRef, c.cliente)) out.add(claveCliente(c.cliente))
  }
  out.delete('')
  return out
}

export function datosFaltantes(c: CargaCampos, hoy: Date, conRefPropia?: ReadonlySet<string>): CampoFaltante[] {
  if (c.archived) return []
  const m = String(c.mode || '').toLowerCase()

  const h = medianoche(hoy).getTime()
  const eta = parseLocalDate(String(c.eta || '').trim())
  const etd = parseLocalDate(String(c.etd || '').trim())
  const diasAEta = eta ? Math.round((medianoche(eta).getTime() - h) / MS_DIA) : null
  const embarcada = etd !== null && medianoche(etd).getTime() <= h
  const ventanaChecks = diasAEta !== null && diasAEta <= FALTANTES_DIAS_CHECKS
  const ventanaCoord = diasAEta !== null && diasAEta <= FALTANTES_DIAS_COORDINACION

  const out: CampoFaltante[] = []
  const falta = (campo: keyof CargaCampos, etiqueta: string) => out.push({ campo, etiqueta })

  // Siempre y en TODOS los modos: sin esto la carga ni se puede identificar
  // ni asignar a un área (el país es el eje de las agendas por área — plan
  // 01/09). Un aéreo o terrestre sin cliente era invisible para siempre.
  if (vacio(c.cliente)) falta('cliente', 'Cliente')
  if (vacio(c.pais)) falta('pais', 'País')
  if (!eta) falta('eta', 'ETA')

  // Las ventanas de embarque/checks/coordinación/llegada son marítimas.
  if (m !== 'fcl' && m !== 'lcl') return out

  // Embarcada: el viaje existe, estos datos ya viajaron en el pre-alerta.
  if (embarcada || ventanaChecks) {
    if (vacio(c.buque)) falta('buque', 'Buque')
    if (vacio(c.linea)) falta('linea', 'Línea')
    if (vacio(c.docNumber)) falta('docNumber', 'BL')
    if (m === 'fcl' && vacio(c.cntr)) falta('cntr', 'Contenedor')
    // Ref del cliente (Brian 26/08): CHIAPERO/VMG nombran cada carga con SU
    // número — sin cargarlo acá no hay cómo mapear sus mails ni sus planes.
    // Existe desde el booking, así que se pide junto con buque/BL.
    //
    // Desde el rediseño 04/09 el portal MUESTRA esa ref cuando está, así que
    // se pide también a los demás clientes que ya la usan (`conRefPropia`), y
    // se vuelve a pedir cuando lo cargado NO sirve de referencia: hay cargas
    // cuya `client_ref` dice literalmente el nombre del cliente.
    const usaRefPropia = CLIENTES_CON_REF_PROPIA.test(String(c.cliente || ''))
      || (conRefPropia?.has(claveCliente(c.cliente)) ?? false)
    if (usaRefPropia && !refClienteSana(c.clientRef, c.cliente)) {
      falta('clientRef', 'Ref. del cliente')
    }
    // Madera: se sabe desde el packing list y define si hay que pedir SENASA
    // el día de carga. Tri-estado — `false` ya es respuesta; falta solo cuando
    // nadie la definió (39 FCL activas al 04/09).
    if (m === 'fcl' && (c.wood === null || c.wood === undefined)) falta('wood', 'Madera')
  }

  // Ventana de checks: sin bultos/kg/m³ no se arma AD/AT ni se factura bien;
  // sin agente, Pagos no sabe a quién se le debe el flete.
  if (ventanaChecks) {
    if (cero(c.pkgs)) falta('pkgs', 'Bultos')
    if (cero(c.kg)) falta('kg', 'Kg')
    if (cero(c.m3)) falta('m3', 'M³')
    // Descripción de la mercadería (Brian 26/08: "me están quedando vacíos"):
    // sin ella no se arma la DJ, el plan operativo sale con "—" y el informe
    // no puede decir qué se cargó.
    if (vacio(c.descripcion)) falta('descripcion', 'Descripción')
    if (vacio(c.agente)) falta('agente', 'Agente')
    // Terminal de llegada (Brian 22/08: "es importante saberla"): define el
    // vencimiento del pago (MONTECON = ETA − 5 días, se paga ANTES de que el
    // buque llegue) y la agenda de retiros. Solo FCL que toca Montevideo:
    // las cargas por Chile van directo a San Antonio, sin terminal MVD.
    if (m === 'fcl' && String(c.pais || '').trim().toUpperCase() !== 'CL') {
      if (vacio(c.terminal)) falta('terminal', 'Terminal')
    }
  }

  // Llegada (ETA + 1 día en adelante, Brian 28/08): la devolución se reclama
  // recién con el buque en puerto — antes ocupaba lugar en la tarjeta de HOY
  // que necesitan las cargas que sí piden datos ya. Lugar (STL/MPS…) para que
  // Pagos sepa a quién pagar, y hasta cuándo está libre.
  //
  // Pedía `devFecha` y estaba mal (Brian 31/08): esa es la fecha en que el
  // vacío VOLVIÓ, y al arribo todavía no existe — por eso la tenían 5 cargas
  // de 371 y el aviso no se apagaba nunca. Lo que sí se sabe al arribo es el
  // libre, que es el dato que se carga en la práctica (79 cargas). No son lo
  // mismo: el libre es el vencimiento y devFecha la devolución real, y la
  // diferencia entre ambos es la sobrestadía.
  const llego = diasAEta !== null && diasAEta <= -1
  if (llego && m === 'fcl' && String(c.pais || '').trim().toUpperCase() !== 'CL') {
    if (vacio(c.dev)) falta('dev', 'Devolución')
    if (vacio(c.libre)) falta('libre', 'Libre (máx. devolución)')
  }

  // Coordinación (solo por Uruguay): con el buque encima hay que saber a qué
  // depósito va, cómo opera, quién la lleva y a qué fiscal.
  if (ventanaCoord && isPorUruguay(c.pais)) {
    // Operativa CONTENEDOR = retiro directo desde terminal: el depósito UY va
    // legítimamente vacío — pedirlo acá invitaba a "completarlo" y la regla
    // "Depósito manda" pisaba el LUGAR_SALIDA puesto a mano (revisión 17/08).
    const directa = String(c.operativa || '').trim().toUpperCase() === 'CONTENEDOR'
    if (!directa && vacio(c.deposito)) falta('deposito', 'Depósito')
    if (vacio(c.operativa)) falta('operativa', 'Operativa')
    if (vacio(c.transporte)) falta('transporte', 'Transporte')
    if (vacio(c.fiscal)) falta('fiscal', 'Fiscal')
    // Despachante de destino: se pide junto con el fiscal, porque va de la
    // mano (quién libera en ese depósito). Solo cuando el fiscal ya está: sin
    // saber a dónde va, todavía no hay a quién asignar.
    if (!vacio(c.fiscal) && vacio(c.despacho)) falta('despacho', 'Despachante')
  }

  return out
}

/** "Bultos, Kg, M³" — para tooltips y filas. */
export const resumenFaltantes = (f: CampoFaltante[]): string => f.map(x => x.etiqueta).join(', ')

export interface FaltanteUrgente {
  carga: CargaCampos & { dbId?: string | null; ref?: string | null }
  faltantes: CampoFaltante[]
  /** Días hasta la llegada (negativo = ya llegó). null = SIN ETA: la carga
   *  más rota de todas — antes ni aparecía (9 FCL sin país ni ETA, 01/09). */
  diasAEta: number | null
}

/**
 * Lo URGENTE para la tarjeta de HOY: cargas con faltantes que llegan dentro de
 * FALTANTES_DIAS_COORDINACION días o ya llegaron y siguen sin salida coordinada
 * (todavía se trabaja sobre ellas). Ordenadas por llegada más próxima.
 */
export function faltantesUrgentes(
  cargas: (CargaCampos & { dbId?: string | null; ref?: string | null })[],
  hoy: Date,
): FaltanteUrgente[] {
  const h = medianoche(hoy).getTime()
  // Quién usa su propia referencia se deduce de TODAS las cargas, no de la
  // fila: una carga sin ref propia solo la debe si su cliente ya usa una.
  const conRefPropia = clientesConRefPropia(cargas)
  const out: FaltanteUrgente[] = []
  for (const c of cargas) {
    const eta = parseLocalDate(String(c.eta || '').trim())
    if (!eta) {
      // Sin ETA no hay ventana que aplicar: se reclaman solo los básicos
      // (cliente/país/eta — datosFaltantes sin ETA no abre ninguna etapa).
      // Antes el continue la hacía invisible en todas las listas.
      const faltantes = datosFaltantes(c, hoy, conRefPropia)
      if (faltantes.length > 0) out.push({ carga: c, faltantes, diasAEta: null })
      continue
    }
    const dias = Math.round((medianoche(eta).getTime() - h) / MS_DIA)
    if (dias > FALTANTES_DIAS_COORDINACION) continue
    // Piso: llegadas de hace más de 14 días son deuda histórica, no trabajo de
    // hoy (Brian 28/08: "que no me pida tan anteriores" — el piso viejo de 28
    // días llenó la tarjeta de cargas de hace un mes al sumar la devolución).
    if (dias < -FALTANTES_DIAS_COORDINACION) continue
    const faltantes = datosFaltantes(c, hoy, conRefPropia)
    if (faltantes.length === 0) continue
    // Llegada con salida ya coordinada: sigue en la tarjeta SOLO por la
    // devolución (lugar/fecha, etapa post-arribo) — el resto de sus faltantes
    // es deuda vieja que no debe revivir la fila (regla original 17/08).
    if (dias < 0 && !vacio(c.salida) && !faltantes.some(f => f.campo === 'dev' || f.campo === 'devFecha')) continue
    out.push({ carga: c, faltantes, diasAEta: dias })
  }
  // Con ETA primero (por llegada más próxima); las sin ETA al final — son
  // trabajo de completado, no de coordinación del día.
  return out.sort((a, b) => {
    if (a.diasAEta === null) return b.diasAEta === null ? 0 : 1
    if (b.diasAEta === null) return -1
    return a.diasAEta - b.diasAEta
  })
}

/**
 * Modo "adelantar datos" (Brian 28/08): cargas que llegan DESPUÉS de la
 * ventana, con los campos que se les van a pedir al entrar. Se listan aparte,
 * plegadas — para seguir completando cuando lo urgente quedó en cero.
 *
 * Truco: se evalúa datosFaltantes con un "hoy" virtual en la víspera de la
 * ETA — abre embarque/checks/coordinación y deja FUERA la etapa de llegada
 * (la devolución no se adelanta: no antes del arribo, regla explícita).
 */
export function faltantesFuturos(
  cargas: (CargaCampos & { dbId?: string | null; ref?: string | null })[],
  hoy: Date,
): FaltanteUrgente[] {
  const h = medianoche(hoy).getTime()
  const conRefPropia = clientesConRefPropia(cargas)
  const out: FaltanteUrgente[] = []
  for (const c of cargas) {
    const eta = parseLocalDate(String(c.eta || '').trim())
    if (!eta) continue
    const dias = Math.round((medianoche(eta).getTime() - h) / MS_DIA)
    if (dias <= FALTANTES_DIAS_COORDINACION) continue   // esas ya están en lo urgente
    const vispera = new Date(medianoche(eta).getTime() - MS_DIA)
    const faltantes = datosFaltantes(c, vispera, conRefPropia)
    if (faltantes.length === 0) continue
    out.push({ carga: c, faltantes, diasAEta: dias })
  }
  // Acá diasAEta nunca es null (las sin ETA viven en lo urgente), pero el
  // tipo compartido obliga al guard.
  return out.sort((a, b) => (a.diasAEta ?? 0) - (b.diasAEta ?? 0))
}
