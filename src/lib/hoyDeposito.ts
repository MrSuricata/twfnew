/**
 * HOY del depósito (PLANIR, GODILCO, TCP…): qué se mueve hoy en su predio, qué
 * contenedor tiene que ir a retirar de la terminal, qué vacío tiene que devolver
 * antes de que venza el libre y qué LCL le falta desconsolidar.
 *
 * Todo derivado en el momento de leer, con los MISMOS datos que ya recibe el
 * portal (`/api/data/partner-shipments`, lista blanca `opSegura`): acá no se
 * guarda ningún estado. Lo único que el depósito puede hacer es PROPONER un
 * aviso (`partner_avisos`) que el equipo confirma desde HOY admin — y esas
 * propuestas se cruzan acá para que la fila diga "esperando confirmación" o
 * desaparezca cuando ya la confirmaron.
 *
 * Funciones puras, testeadas en hoyDeposito.test.ts. La UI (DepotDashboard)
 * solo pinta. Spec: docs/superpowers/specs/2026-09-01-partner-hoy-avisos-design.md
 */
import type { ParsedShipment, OperativasRecord } from './shipmentTypes'
import { parseLocalDate } from './shipmentTypes'
import { etaVigente } from './salidaCheck'
import { ultimoAviso, type PartnerAviso, type PartnerAvisoTipo } from './partnerAvisos'

/**
 * La operativa tal como viaja al partner. Los campos de abajo los suma la API
 * (W1 del plan) y pueden NO venir todavía: se tratan como vacíos, nunca se
 * inventan. `MODE`/`STOCK`/`ETA` son de la carga (repetidos en cada operativa);
 * `TURNO_RETIRO`/`RETIRADO` salen de `montecon_agenda`: el turno solo si la
 * terminal es MONTECON (TCP no agenda), el RETIRADO en cualquier terminal.
 */
export interface OperativaPartner extends OperativasRecord {
  /** Sobredimensionada (SI/NO). */
  OOG?: string
  /** fcl · lcl · air · road. Vacío = se asume FCL (lo histórico del portal). */
  MODE?: string
  /** Nº de stock del depósito (LCL). Vacío = todavía no lo dieron. */
  STOCK?: string
  /** ETA de la carga (ISO). */
  ETA?: string
  /** Fecha del turno de retiro conseguido en Montecon (ISO). */
  TURNO_RETIRO?: string
  /** Fecha en que se marcó retirado (ISO o timestamp). Vacío = sigue en la terminal. */
  RETIRADO?: string
}

/**
 * La CARGA tal como viaja al partner. `partnerShipmentsVisibles` estampa
 * `TURNO_RETIRO`/`RETIRADO` acá arriba —salen de `montecon_agenda`, que se
 * lleva por REF, no por contenedor— y recién ahora los baja también a cada
 * operativa. Por eso se leen los dos lados: la operativa manda y la carga es el
 * respaldo (mismo patrón que WOOD y DESCRIPCION).
 */
export interface CargaPartner extends ParsedShipment {
  /** Turno de retiro conseguido en Montecon (ISO). */
  TURNO_RETIRO?: string
  /** Fecha en que se marcó retirado (ISO o timestamp). Vacío = sigue en la terminal. */
  RETIRADO?: string
}

// ── Ventanas y umbrales ────────────────────────────────────────────────

/** Retiros: desde hace dos días (llegó y todavía no lo fueron a buscar)… */
export const RETIROS_DIAS_ATRAS = 2
/** …hasta una semana adelante (lo que se planifica con camión y turno). */
export const RETIROS_DIAS_ADELANTE = 7
/** LIBRE: se avisa desde 5 días antes (Brian: mismo umbral que HOY admin). */
export const LIBRE_DIAS_AVISO = 5

// ── Helpers ────────────────────────────────────────────────────────────

const txt = (v: unknown): string => String(v ?? '').trim()
const up = (v: unknown): string => txt(v).toUpperCase()
const num = (v: unknown): number => {
  const n = Number(v)
  return isFinite(n) ? n : 0
}
const siNo = (v: unknown): boolean => up(v).startsWith('SI')
const MS_DIA = 86_400_000

/** Solo fechas ISO estrictas (un "CONFIRMAR" o un "2/7" no es una fecha). */
const fechaISO = (v: unknown): string => {
  const s = txt(v).slice(0, 10)
  return parseLocalDate(s) ? s : ''
}

/** Días de `desde` a `hasta` (positivo = hasta es después). null si alguna no es fecha. */
export function diasEntre(desdeISO: string, hastaISO: string): number | null {
  const a = parseLocalDate(txt(desdeISO).slice(0, 10))
  const b = parseLocalDate(txt(hastaISO).slice(0, 10))
  if (!a || !b) return null
  return Math.round((b.getTime() - a.getTime()) / MS_DIA)
}

/** El depósito de la operativa es el mío. Sin nombre de depósito no se filtra
 *  (el server ya recortó al alcance del partner). */
const esMiDeposito = (op: OperativaPartner, deposito: string): boolean =>
  !up(deposito) || up(op.DEPOSITO) === up(deposito)

/** Modo de la carga: la operativa lo trae repetido; vacío = FCL. */
const modoDe = (op: OperativaPartner): string => up(op.MODE) || 'FCL'
const esLcl = (op: OperativaPartner): boolean => modoDe(op) === 'LCL'
const esFcl = (op: OperativaPartner): boolean => modoDe(op) === 'FCL'

/** TRASIEGO y CARGA A PISO pasan por el depósito; CONTENEDOR va directo al fiscal. */
const pasaPorDeposito = (op: OperativaPartner): boolean => {
  const o = up(op.OPERATIVA)
  return o.includes('TRASIEGO') || o.includes('PISO')
}

/** "DEVUELTO" vive en LIBRE (ver memoria): el vacío ya volvió a la terminal. */
const devuelto = (op: OperativaPartner, cab: CargaPartner): boolean =>
  up(op.LIBRE).includes('DEVUELTO') || up(cab.LIBRE_HASTA).includes('DEVUELTO') || !!txt(op.DEV_FECHA)

/**
 * ¿La operativa YA se hizo? O sea: ¿la mercadería salió del contenedor y hay un
 * vacío de verdad para devolver?
 *
 * Brian 03/09, mirando el portal de GODILCO: "un contenedor solo se puede
 * devolver si la operativa ya se hizo". Mientras la carga está adentro no hay
 * nada que llevar a la terminal, y una fila de más le hace perder tiempo al
 * depósito.
 *
 * El campo que lo representa es la fecha en que el contenedor se vacía, y se
 * miran dos, en este orden:
 *  - DESCARGA — CARGA A PISO: se desconsolida y la mercadería queda en el
 *    predio. La SALIDA puede ser semanas después (cuando el cliente la retira),
 *    y esperarla dejaría el vacío invisible todo ese tiempo.
 *  - SALIDA — TRASIEGO: el contenedor se vuelca al camión el mismo día en que
 *    la carga sale del depósito.
 * El día de la operativa ya cuenta ("hoy estamos haciendo la A8121, a partir de
 * hoy le tiene que aparecer").
 *
 * Lo que NO sirve como señal: RETIRADO, el turno de Montecon o la ETA. Los tres
 * dicen que el contenedor salió de la terminal, pero llega al depósito LLENO —
 * ese fue exactamente el error que Brian vio en pantalla. Ante la duda (sin
 * fecha cargada) la fila no aparece: conservador.
 */
const operativaHecha = (op: OperativaPartner, hoyISO: string): boolean => {
  const fecha = fechaISO(op.DESCARGA) || fechaISO(op.SALIDA)
  return !!fecha && fecha <= hoyISO
}

/** Ya lo fueron a buscar a la terminal. Se mira la operativa Y la carga porque
 *  el dato nace en `montecon_agenda`, que es por REF, y la API lo estampa a
 *  nivel carga: leyendo solo la operativa llegaba siempre vacío y lo que el
 *  equipo marcaba RETIRADO desde admin le seguía apareciendo pendiente al
 *  depósito (Brian 03/09). */
const yaRetirado = (op: OperativaPartner, cab: CargaPartner): boolean =>
  !!txt(op.RETIRADO) || !!txt(cab.RETIRADO)

/** El turno conseguido en Montecon, con el mismo respaldo a nivel carga. */
const turnoDe = (op: OperativaPartner, cab: CargaPartner): string =>
  fechaISO(op.TURNO_RETIRO) || fechaISO(cab.TURNO_RETIRO)

/** Fecha en que el contenedor sale de la terminal: el turno de Montecon si lo
 *  hay, si no la ETA del buque. La ETA de la CARGA manda: la copia por contenedor
 *  (ETA_OP) queda congelada al hornear y no se actualiza cuando el buque se corre
 *  (caso A8163, 02/09: ETA_OP 02/09 con la carga en 11/10). Misma regla que HOY
 *  admin (etaVigente). */
const fechaRetiro = (op: OperativaPartner, cab: CargaPartner): string =>
  turnoDe(op, cab) || fechaISO(etaVigente(cab.ETA, op.ETA || op.ETA_OP))

const libreDe = (op: OperativaPartner, cab: CargaPartner): string =>
  txt(op.LIBRE) || txt(cab.LIBRE_HASTA) || txt(cab.calculatedLibreHasta)

/**
 * El último aviso de este tipo para esta carga/contenedor. Si no hay uno con el
 * contenedor exacto se acepta el de la ref entera (cntr ''), que es como queda
 * un aviso de una carga de un solo contenedor o de una LCL.
 */
export function estadoAvisoDe(
  avisos: PartnerAviso[],
  tipo: PartnerAvisoTipo,
  ref: string,
  cntr = '',
): PartnerAviso | undefined {
  return ultimoAviso(avisos, tipo, ref, cntr) || (cntr ? ultimoAviso(avisos, tipo, ref, '') : undefined)
}

/** Base común de todas las filas del HOY del depósito. */
export interface FilaDeposito {
  ref: string
  cliente: string
  cntr: string
  tipo: string
  operativa: string
  descripcion: string
  pkgs: number
  kg: number
  m3: number
  /** Último aviso del tipo que corresponde a la card (pendiente/rechazado). */
  aviso?: PartnerAviso
}

const filaBase = (op: OperativaPartner, cab: CargaPartner): FilaDeposito => ({
  ref: txt(op.REF) || txt(cab.REF),
  cliente: txt(op.CLIENTE_OP) || txt(cab.CLIENTE),
  cntr: txt(op.CNTR_OP),
  tipo: txt(op.TIPO),
  operativa: txt(op.OPERATIVA),
  descripcion: txt(op.DESCRIPCION),
  pkgs: num(op.PKGS),
  kg: num(op.KG),
  m3: num(op.M3),
})

const ops = (s: CargaPartner): OperativaPartner[] => (s.operativas || []) as OperativaPartner[]

// ── Card 1: operativas de hoy ──────────────────────────────────────────

export interface OperativaHoy extends FilaDeposito {
  /** Qué pasa hoy: carga el camión, retiro de la terminal, o las dos cosas. */
  motivo: 'carga' | 'retiro' | 'ambos'
  transporte: string
  fiscal: string
  horario: string
  salida: string
  /** Fecha estimada del retiro (turno o ETA), si hoy retira. */
  retiro: string
  madera: boolean
  imo: boolean
  oog: boolean
  noApilable: boolean
  tlxPendiente: boolean
}

/**
 * Lo que se mueve HOY en mi depósito: cargas con SALIDA = hoy (viene el camión)
 * y contenedores que llegan hoy desde la terminal (turno de retiro = hoy, o ETA
 * = hoy en un trasiego / carga a piso sin turno). Un CONTENEDOR directo no
 * pasa por el depósito, así que su ETA no es un retiro mío.
 */
export function operativasDeHoy(shipments: CargaPartner[], hoyISO: string, deposito: string): OperativaHoy[] {
  const out: OperativaHoy[] = []
  for (const cab of shipments) {
    for (const op of ops(cab)) {
      if (!esMiDeposito(op, deposito)) continue
      const salida = fechaISO(op.SALIDA)
      const cargaHoy = salida === hoyISO
      const retiro = esFcl(op) && pasaPorDeposito(op) && !yaRetirado(op, cab) && !devuelto(op, cab) ? fechaRetiro(op, cab) : ''
      const retiraHoy = retiro === hoyISO
      if (!cargaHoy && !retiraHoy) continue
      out.push({
        ...filaBase(op, cab),
        motivo: cargaHoy && retiraHoy ? 'ambos' : cargaHoy ? 'carga' : 'retiro',
        transporte: txt(op.TRANSPORTE),
        fiscal: txt(op.FISCAL),
        horario: txt(op.HORARIO),
        salida,
        retiro: retiraHoy ? retiro : '',
        madera: siNo(op.WOOD),
        imo: siNo(op.IMO),
        oog: siNo(op.OOG),
        noApilable: siNo(op.NO_APILABLE),
        tlxPendiente: !txt(op.TLX) || up(op.TLX) === 'NO' || up(op.TLX) === 'PENDIENTE',
      })
    }
  }
  // Primero los retiros (llegan durante la mañana), después las cargas por horario.
  const rango = (m: OperativaHoy['motivo']) => (m === 'retiro' ? 0 : m === 'ambos' ? 1 : 2)
  return out.sort((a, b) => rango(a.motivo) - rango(b.motivo) || a.horario.localeCompare(b.horario) || a.ref.localeCompare(b.ref))
}

// ── Card 2: retiros próximos ───────────────────────────────────────────

export interface RetiroProximo extends FilaDeposito {
  /** ¿Se puede retirar? Liberación de la naviera + terminal paga. */
  estado: EstadoRetiro
  terminal: string
  eta: string
  /** Turno de retiro en Montecon ('' si no hay). */
  turno: string
  libre: string
  /** Fecha que manda (turno o ETA). */
  fecha: string
  /** Días hasta esa fecha: 0 = hoy · <0 = ya llegó · >0 = por llegar. */
  dias: number
}

/**
 * Contenedores que tengo que ir a buscar a la terminal: TRASIEGO / CARGA A PISO
 * con destino mi depósito, con fecha (turno de Montecon o ETA) entre hoy-2 y
 * hoy+7, que todavía no se retiraron ni devolvieron. Con un aviso "retiré"
 * confirmado la fila desaparece; pendiente o rechazado, se muestra el estado.
 */
export function retirosProximos(
  shipments: CargaPartner[],
  hoyISO: string,
  deposito: string,
  avisos: PartnerAviso[],
): RetiroProximo[] {
  const out: RetiroProximo[] = []
  for (const cab of shipments) {
    for (const op of ops(cab)) {
      if (!esMiDeposito(op, deposito) || !esFcl(op) || !pasaPorDeposito(op)) continue
      if (yaRetirado(op, cab) || devuelto(op, cab)) continue
      const fecha = fechaRetiro(op, cab)
      const dias = diasEntre(hoyISO, fecha)
      if (dias === null || dias < -RETIROS_DIAS_ATRAS || dias > RETIROS_DIAS_ADELANTE) continue
      const base = filaBase(op, cab)
      const aviso = estadoAvisoDe(avisos, 'retire', base.ref, base.cntr)
      if (aviso?.estado === 'confirmado') continue
      out.push({
        ...base,
        aviso,
        estado: estadoRetiro(
          !!(cab as unknown as { LIBERADA?: boolean }).LIBERADA,
          !!(cab as unknown as { TERMINAL_PAGADA?: boolean }).TERMINAL_PAGADA,
        ),
        terminal: txt(cab.TERMINAL),
        eta: fechaISO(etaVigente(cab.ETA, op.ETA || op.ETA_OP)),
        turno: turnoDe(op, cab),
        libre: libreDe(op, cab),
        fecha,
        dias,
      })
    }
  }
  return out.sort((a, b) => a.dias - b.dias || a.ref.localeCompare(b.ref))
}

/** ¿Se puede ir a buscar el contenedor? Dos condiciones, no una (Brian 03/09):
 *  la naviera tiene que haber liberado Y la terminal tiene que estar paga. Con
 *  liberación sin pago el depósito va y no se lo dan. */
export type EstadoRetiro = 'listo' | 'falta_liberacion' | 'falta_pago' | 'faltan_ambos'

export function estadoRetiro(liberada: boolean, terminalPagada: boolean): EstadoRetiro {
  if (liberada && terminalPagada) return 'listo'
  if (!liberada && !terminalPagada) return 'faltan_ambos'
  return liberada ? 'falta_pago' : 'falta_liberacion'
}

/** Lo que se lee en la fila. "Listo" es la única frase que habilita a salir. */
export const ETIQUETA_RETIRO: Record<EstadoRetiro, string> = {
  listo: 'LISTO PARA RETIRAR',
  falta_liberacion: 'Falta liberación',
  falta_pago: 'Falta pago de terminal',
  faltan_ambos: 'Falta liberación y pago',
}

/** Por qué no está listo, en una frase que el depósito puede reenviar. */
export const DETALLE_RETIRO: Record<EstadoRetiro, string> = {
  listo: 'La naviera liberó la carga y la terminal está paga: se puede retirar.',
  falta_liberacion: 'La naviera todavía no liberó la carga. Lo estamos gestionando.',
  falta_pago: 'Falta que paguemos la terminal. Lo estamos gestionando.',
  faltan_ambos: 'Falta la liberación de la naviera y el pago de terminal. Lo estamos gestionando.',
}

// ── Card 3: LIBRE por vencer / vencidos ────────────────────────────────

/** ¿Se puede devolver el vacío? Igual que el retiro, dos condiciones (Brian
 *  03/09): la devolución tiene que estar PAGA y tiene que haber TERMINAL de
 *  devolución asignada. Sin terminal el depósito no sabe a dónde llevarlo; sin
 *  pago no se lo reciben. Que la fila lo diga nos obliga a completarlo. */
export type EstadoDevolucion = 'listo' | 'falta_pago' | 'falta_terminal' | 'faltan_ambos'

export function estadoDevolucion(pagada: boolean, terminalDev: string): EstadoDevolucion {
  const tiene = !!String(terminalDev || '').trim()
  if (pagada && tiene) return 'listo'
  if (!pagada && !tiene) return 'faltan_ambos'
  return pagada ? 'falta_terminal' : 'falta_pago'
}

export const ETIQUETA_DEVOLUCION: Record<EstadoDevolucion, string> = {
  listo: 'LISTO PARA DEVOLVER',
  falta_pago: 'Falta pago de la devolución',
  falta_terminal: 'Falta terminal de devolución',
  faltan_ambos: 'Falta terminal y pago',
}

export const DETALLE_DEVOLUCION: Record<EstadoDevolucion, string> = {
  listo: 'La devolución está paga y la terminal asignada: se puede devolver.',
  falta_pago: 'Falta que paguemos la devolución. Lo estamos gestionando.',
  falta_terminal: 'Falta que asignemos la terminal de devolución. Te avisamos.',
  faltan_ambos: 'Falta asignar la terminal de devolución y pagarla. Lo estamos gestionando.',
}

/** `sin_dato` no es un plazo: es que no hay fecha de LIBRE cargada. Se pinta
 *  distinto justamente para que no se lea como un vencimiento. */
export type SeveridadLibre = 'vencido' | 'hoy' | 'urgente' | 'proximo' | 'sin_dato'

/**
 * Por qué el vacío está en la lista. Son dos cosas distintas y el depósito tiene
 * que distinguirlas de un vistazo (Brian 03/09):
 *  - `vencimiento`: el LIBRE está por vencer o ya venció → hay que devolverlo ya.
 *  - `falta_dato`: falta la fecha de LIBRE o la terminal de devolución (DEV). No
 *    es un plazo del depósito: es un dato que tenemos que completar NOSOTROS.
 */
export type MotivoVacio = 'vencimiento' | 'falta_dato'

export interface LibrePorVencer extends FilaDeposito {
  /** ¿Se puede devolver ya? (pago + terminal asignada). */
  estado: EstadoDevolucion
  /** Fecha de LIBRE. '' si no hay fecha cargada (o si dice "CONFIRMAR"). */
  libre: string
  /**
   * Días hasta el vencimiento: <0 vencido · 0 hoy · 1-2 urgente · 3-5 próximo.
   * **null = no hay fecha de LIBRE**, y la UI tiene que decirlo con palabras.
   * Antes acá iba un 9999 de relleno para ordenar y se veía en pantalla como
   * "vence en 9999d" (Brian 03/09): de acá no sale ningún número inventado.
   */
  dias: number | null
  severidad: SeveridadLibre
  /** Vencimiento o alerta de dato faltante. */
  motivo: MotivoVacio
  /** No hay fecha de LIBRE cargada. */
  faltaLibre: boolean
  /** No hay terminal de devolución (DEV) asignada. */
  faltaDev: boolean
  terminal: string
  /** Dónde se devuelve el vacío (DEV), si está. */
  dev: string
}

/** Ordena por vencimiento; sin fecha de LIBRE va al final (y no adelante por un
 *  número de relleno). */
const porVencimiento = (a: number | null, b: number | null): number =>
  a === null && b === null ? 0 : a === null ? 1 : b === null ? -1 : a - b

export function severidadLibre(dias: number): SeveridadLibre {
  if (dias < 0) return 'vencido'
  if (dias === 0) return 'hoy'
  if (dias <= 2) return 'urgente'
  return 'proximo'
}

/**
 * Vacíos que el depósito tiene que devolver, UNA FILA POR CONTENEDOR (una carga
 * con dos contenedores da dos filas independientes, cada una con su estado y su
 * botón: son dos devoluciones distintas).
 *
 * Dos reglas, las dos de Brian el 03/09 mirando el portal de GODILCO:
 *
 * 1. **La operativa tiene que estar hecha** (`operativaHecha`): "un contenedor
 *    solo se puede devolver si la operativa ya se hizo". Antes alcanzaba con que
 *    el contenedor hubiera salido de la terminal, y el portal le recomendaba
 *    devolver contenedores que todavía tenían la mercadería adentro.
 * 2. **Y además tiene que haber algo que hacer**: o el LIBRE aprieta
 *    (`LIBRE_DIAS_AVISO` días o menos, vencidos incluidos), o falta un dato
 *    nuestro — la fecha de LIBRE o la terminal de devolución (DEV). El segundo
 *    caso no es un vencimiento: es una alerta de dato faltante y sale marcada
 *    como tal (`motivo: 'falta_dato'`).
 *    Un vacío ya desconsolidado, con el LIBRE lejos y todos los datos completos,
 *    NO aparece: no hay nada que decidir hoy.
 *
 * Además tiene que ser una operativa que pase por el depósito (TRASIEGO /
 * CARGA A PISO, nunca CONTENEDOR directo: ese vacío no lo devuelve el depósito),
 * del depósito que mira y FCL. "DEVUELTO" en LIBRE o una DEV_FECHA = ya
 * devuelto, no entra; con un aviso "devolví" confirmado la fila desaparece.
 */
export function libresPorVencer(
  shipments: CargaPartner[],
  hoyISO: string,
  deposito: string,
  avisos: PartnerAviso[],
): LibrePorVencer[] {
  const out: LibrePorVencer[] = []
  for (const cab of shipments) {
    // Una vuelta por operativa = una vuelta por contenedor: dos contenedores de
    // la misma carga salen como dos filas, cada una con su LIBRE y su DEV.
    for (const op of ops(cab)) {
      if (!esMiDeposito(op, deposito) || !esFcl(op) || !pasaPorDeposito(op)) continue
      if (devuelto(op, cab)) continue
      // Regla 1: sin operativa hecha el contenedor sigue lleno, no hay vacío.
      if (!operativaHecha(op, hoyISO)) continue
      const libre = fechaISO(libreDe(op, cab))
      const dias = libre ? diasEntre(hoyISO, libre) : null
      const dev = txt(op.DEV)
      const faltaLibre = dias === null
      const faltaDev = !dev
      // Regla 2: o el LIBRE aprieta, o nos falta un dato. Con todo completo y el
      // vencimiento lejos, el depósito no tiene nada que hacer hoy con ese vacío.
      const porVencer = dias !== null && dias <= LIBRE_DIAS_AVISO
      if (!porVencer && !faltaLibre && !faltaDev) continue
      const base = filaBase(op, cab)
      const aviso = estadoAvisoDe(avisos, 'devolvi', base.ref, base.cntr)
      if (aviso?.estado === 'confirmado') continue
      out.push({
        ...base,
        aviso,
        estado: estadoDevolucion(
          !!(cab as unknown as { DEVOLUCION_PAGADA?: boolean }).DEVOLUCION_PAGADA,
          dev,
        ),
        libre: libre || '',
        dias,
        severidad: dias === null ? 'sin_dato' : severidadLibre(dias),
        motivo: porVencer ? 'vencimiento' : 'falta_dato',
        faltaLibre,
        faltaDev,
        terminal: txt(cab.TERMINAL),
        dev,
      })
    }
  }
  // Primero lo que corre contra el reloj (lo más vencido arriba); después las
  // alertas de dato faltante, que son deuda nuestra y no del depósito.
  const rango = (m: MotivoVacio) => (m === 'vencimiento' ? 0 : 1)
  return out.sort((a, b) =>
    rango(a.motivo) - rango(b.motivo) ||
    porVencimiento(a.dias, b.dias) ||
    a.ref.localeCompare(b.ref))
}

// ── Card 4: LCL a desconsolidar ────────────────────────────────────────

export interface LclSinStock extends FilaDeposito {
  eta: string
  diasDesdeEta: number
  fiscal: string
}

/**
 * LCL con depósito = el mío, que ya llegaron (ETA hoy o pasada — mismo corte
 * que `estadoLcl` → 'aguarda_stock') y sin Nº de stock. Sin ETA no se asume
 * que llegó. Con un aviso "desconsolidé" confirmado la fila desaparece (el
 * equipo ya cargó el stock).
 */
export function lclADesconsolidar(
  shipments: CargaPartner[],
  hoyISO: string,
  deposito: string,
  avisos: PartnerAviso[],
): LclSinStock[] {
  const out: LclSinStock[] = []
  for (const cab of shipments) {
    for (const op of ops(cab)) {
      if (!esMiDeposito(op, deposito) || !esLcl(op)) continue
      if (txt(op.STOCK)) continue
      const eta = fechaISO(op.ETA) || fechaISO(cab.ETA)
      if (!eta || eta > hoyISO) continue
      const base = filaBase(op, cab)
      // Una LCL es la ref entera: el aviso va sin contenedor.
      const aviso = estadoAvisoDe(avisos, 'desconsolide', base.ref, '')
      if (aviso?.estado === 'confirmado') continue
      out.push({
        ...base,
        cntr: '',
        aviso,
        eta,
        diasDesdeEta: Math.max(0, diasEntre(eta, hoyISO) ?? 0),
        fiscal: txt(op.FISCAL),
      })
    }
  }
  return out.sort((a, b) => b.diasDesdeEta - a.diasDesdeEta || a.ref.localeCompare(b.ref))
}
