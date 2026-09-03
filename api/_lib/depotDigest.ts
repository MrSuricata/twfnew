// ── Digest diario para los depósitos (pedido de Brian, 03/09/2026) ────────
//
// "Un mail recordatorio una vez al día que diga los contenedores que están
// pendientes de retirar y los contenedores que están pendientes de devolver
// por parte de ellos, y que diga abajo 'por favor recordar completar con
// retirado o devuelto', y que te mande un enlace al portal."
//
// El mail lo manda n8n: acá sólo se arma el JSON. Molde: api/_lib/clientDigest.ts
// (la lógica en la lib, el handler fino, todo solo lectura).
//
// ══════════════════════════════════════════════════════════════════════════
//  ESPEJO DE src/lib/hoyDeposito.ts — SI CAMBIA ALLÁ, CAMBIA ACÁ
// ══════════════════════════════════════════════════════════════════════════
// El recordatorio tiene que listar EXACTAMENTE lo que el depósito ve al entrar
// al portal: si el mail y la pantalla no coinciden, el depósito deja de creerle
// a los dos. Todo lo que sigue —ventanas, umbrales, criterios de pertenencia,
// estados, motivos y orden— está copiado de `src/lib/hoyDeposito.ts`, que es la
// FUENTE DE VERDAD.
//
// Se copia en vez de importarse porque api/ compila con `moduleResolution:
// NodeNext` (tsconfig.api.json) y src/ importa sin extensión
// (`from './shipmentTypes'`): en cuanto api/ toca hoyDeposito.ts se cae el
// typecheck entero de las serverless. Mismo motivo que TIPOS_POR_ROL_API en
// partnerAvisosRules.ts.
//
// El candado contra la divergencia SILENCIOSA es `src/lib/depotDigest.api.test.ts`:
// corre los mismos casos contra las dos implementaciones y falla si una devuelve
// una fila que la otra no, o con otro estado / severidad / plazo. Ese test vive
// en src/ (y no acá) porque la flecha al revés sí se puede: src/ compila con
// `moduleResolution: bundler` y puede importar api/. Si tocás una regla de acá
// sin tocarla allá —o al revés— ese test se pone rojo.
//
// Seguridad: no viaja un solo monto ni fecha de pago. De la plata sólo se sabe
// lo que ya le llega al portal convertido en booleano (LIBERADA /
// TERMINAL_PAGADA / DEVOLUCION_PAGADA en partnerShipmentsVisibles).

import type { PartnerAviso, PartnerAvisoTipo } from '../../src/lib/partnerAvisos.js'

// ── Ventanas y umbrales (espejo de hoyDeposito.ts) ─────────────────────

/** Retiros: desde hace dos días (llegó y todavía no lo fueron a buscar)… */
export const RETIROS_DIAS_ATRAS = 2
/** …hasta una semana adelante (lo que se planifica con camión y turno). */
export const RETIROS_DIAS_ADELANTE = 7
/** LIBRE: se avisa desde 5 días antes (mismo umbral que HOY admin y el portal). */
export const LIBRE_DIAS_AVISO = 5

const MS_DIA = 86_400_000

const txt = (v: unknown): string => String(v ?? '').trim()
const up = (v: unknown): string => txt(v).toUpperCase()
const num = (v: unknown): number => {
  const n = Number(v)
  return isFinite(n) ? n : 0
}

/** Espejo de parseLocalDate: SOLO ISO. Un "DEVUELTO" o un "2/7" no es fecha. */
function fechaValida(s: string): boolean {
  const m = s.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return false
  return !isNaN(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime())
}

const fechaISO = (v: unknown): string => {
  const s = txt(v).slice(0, 10)
  return fechaValida(s) ? s : ''
}

/** Días de `desde` a `hasta` (positivo = hasta es después). null si alguna no es fecha. */
export function diasEntre(desdeISO: string, hastaISO: string): number | null {
  const a = fechaISO(desdeISO)
  const b = fechaISO(hastaISO)
  if (!a || !b) return null
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / MS_DIA)
}

// ── Shape de entrada: lo que devuelve partnerShipmentsVisibles ─────────

/** Operativa saneada (lista blanca `opSegura`). Todo puede venir vacío. */
export interface OperativaDepotDigest {
  /** Ref y cliente por operativa: hoy opSegura no los manda, pero el portal les
   *  da prioridad sobre los de la carga y el espejo tiene que hacer lo mismo. */
  REF?: string
  CLIENTE_OP?: string
  DEPOSITO?: string
  OPERATIVA?: string
  CNTR_OP?: string
  TIPO?: string
  LIBRE?: string
  DEV?: string
  DESCRIPCION?: string
  ETA_OP?: string
  /** ETA de la CARGA repetida en la operativa, cuando la API la baja. */
  ETA?: string
  SALIDA?: string
  /** Desconsolidación (CARGA A PISO): el día en que el contenedor queda vacío. */
  DESCARGA?: string
  PKGS?: unknown
  KG?: unknown
  M3?: unknown
  /** fcl · lcl · air · road. Vacío = FCL (lo histórico del portal). */
  MODE?: string
  /** Fecha del turno de retiro en Montecon / fecha de retiro, si la API las bajó a la operativa. */
  TURNO_RETIRO?: string
  RETIRADO?: string
  DEV_FECHA?: string
}

/** Carga saneada. Los tres booleanos son TODO lo que el depósito sabe de la plata. */
export interface CargaDepotDigest {
  REF?: string
  CLIENTE?: string
  ETA?: string
  TERMINAL?: string
  LIBRE_HASTA?: string
  /** Respaldo del LIBRE calculado por el parser de la planilla. */
  calculatedLibreHasta?: string
  /** La naviera liberó (check LIBERADO). */
  LIBERADA?: boolean
  /** Terminal paga (estampado en Pagos, o monto 0 = convención vieja). */
  TERMINAL_PAGADA?: boolean
  /** Devolución del vacío (CDEV) paga. */
  DEVOLUCION_PAGADA?: boolean
  TURNO_RETIRO?: string
  RETIRADO?: string
  operativas?: OperativaDepotDigest[]
}

/** Fila de `partner_users` con role='depot'. */
export interface UsuarioDeposito {
  email?: string | null
  name?: string | null
  filter_value?: string | null
  active?: boolean | null
  role?: string | null
}

// ── Estados derivados (espejo de hoyDeposito.ts) ───────────────────────

/** ¿Se puede ir a buscar el contenedor? Liberación de la naviera Y terminal
 *  paga: con liberación sin pago el depósito va y no se lo dan (Brian 03/09). */
export type EstadoRetiro = 'listo' | 'falta_liberacion' | 'falta_pago' | 'faltan_ambos'

export function estadoRetiro(liberada: boolean, terminalPagada: boolean): EstadoRetiro {
  if (liberada && terminalPagada) return 'listo'
  if (!liberada && !terminalPagada) return 'faltan_ambos'
  return liberada ? 'falta_pago' : 'falta_liberacion'
}

export const ETIQUETA_RETIRO: Record<EstadoRetiro, string> = {
  listo: 'LISTO PARA RETIRAR',
  falta_liberacion: 'Falta liberación',
  falta_pago: 'Falta pago de terminal',
  faltan_ambos: 'Falta liberación y pago',
}

/** ¿Se puede devolver el vacío? Devolución paga Y terminal de devolución
 *  asignada: sin terminal no sabe a dónde llevarlo, sin pago no se lo reciben. */
export type EstadoDevolucion = 'listo' | 'falta_pago' | 'falta_terminal' | 'faltan_ambos'

export function estadoDevolucion(pagada: boolean, terminalDev: string): EstadoDevolucion {
  const tiene = !!txt(terminalDev)
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

/** `sin_dato` NO es un plazo: es que no hay fecha de LIBRE cargada. El mail lo
 *  tiene que escribir con palabras ("sin fecha"), nunca como un vencimiento. */
export type SeveridadLibre = 'vencido' | 'hoy' | 'urgente' | 'proximo' | 'sin_dato'

export function severidadLibre(dias: number): SeveridadLibre {
  if (dias < 0) return 'vencido'
  if (dias === 0) return 'hoy'
  if (dias <= 2) return 'urgente'
  return 'proximo'
}

/**
 * Por qué el vacío está en la lista. Son dos cosas distintas y el mail las tiene
 * que mostrar distinto (Brian 03/09): "nos falta un dato" no es lo mismo que
 * "se te vence".
 *  - `vencimiento`: el LIBRE está por vencer o ya venció → devolverlo ya.
 *  - `falta_dato`: falta la fecha de LIBRE o la terminal de devolución (DEV).
 *    No es un plazo del depósito: es deuda NUESTRA.
 */
export type MotivoVacio = 'vencimiento' | 'falta_dato'

// ── Criterios de pertenencia (espejo de hoyDeposito.ts) ────────────────

const esMiDeposito = (op: OperativaDepotDigest, deposito: string): boolean =>
  !up(deposito) || up(op.DEPOSITO) === up(deposito)

/** El modo viaja repetido en la operativa; vacío = FCL. */
const esFcl = (op: OperativaDepotDigest): boolean => (up(op.MODE) || 'FCL') === 'FCL'

/** TRASIEGO y CARGA A PISO pasan por el depósito; CONTENEDOR va directo al fiscal. */
const pasaPorDeposito = (op: OperativaDepotDigest): boolean => {
  const o = up(op.OPERATIVA)
  return o.includes('TRASIEGO') || o.includes('PISO')
}

/** "DEVUELTO" vive en LIBRE (memoria del proyecto): el vacío ya volvió. */
const devuelto = (op: OperativaDepotDigest, cab: CargaDepotDigest): boolean =>
  up(op.LIBRE).includes('DEVUELTO') || up(cab.LIBRE_HASTA).includes('DEVUELTO') || !!txt(op.DEV_FECHA)

/**
 * ¿La operativa YA se hizo? O sea: ¿la mercadería salió del contenedor y hay un
 * vacío de verdad para devolver? (espejo de `operativaHecha`).
 *
 * Brian 03/09, mirando el portal de GODILCO: "un contenedor solo se puede
 * devolver si la operativa ya se hizo". Se miran dos fechas, en este orden:
 *  - DESCARGA — CARGA A PISO: se desconsolida y la mercadería queda en el
 *    predio; la SALIDA puede ser semanas después (cuando el cliente la retira) y
 *    esperarla dejaría el vacío invisible todo ese tiempo.
 *  - SALIDA — TRASIEGO: el contenedor se vuelca al camión el mismo día en que
 *    la carga sale del depósito.
 * El día de la operativa ya cuenta ("hoy estamos haciendo la A8121, a partir de
 * hoy le tiene que aparecer").
 *
 * Lo que NO sirve como señal: RETIRADO, el turno de Montecon o la ETA. Los tres
 * dicen que el contenedor salió de la TERMINAL, pero llega al depósito LLENO —
 * ese fue el error que Brian vio en pantalla, y el mail lo repetiría igual. Sin
 * fecha cargada la fila no aparece: conservador.
 */
const operativaHecha = (op: OperativaDepotDigest, hoyISO: string): boolean => {
  const fecha = fechaISO(op.DESCARGA) || fechaISO(op.SALIDA)
  return !!fecha && fecha <= hoyISO
}

/** Retirado de la terminal. La API estampa RETIRADO/TURNO_RETIRO a nivel CARGA
 *  (partnerShipmentsVisibles) y hoyDeposito los lee de la operativa: se miran
 *  los dos lados para que "ya lo marcamos retirado" saque la fila sí o sí
 *  (Brian 03/09: "si yo desde admin ya apreté retirado, a ellos les debe salir
 *  de la lista"). */
const yaRetirado = (op: OperativaDepotDigest, cab: CargaDepotDigest): boolean =>
  !!txt(op.RETIRADO) || !!txt(cab.RETIRADO)

/** Espejo de etaVigente: la ETA de la CARGA manda — la copia por contenedor
 *  queda congelada al hornear y no se mueve cuando el buque se corre. */
const etaVigente = (etaCarga: unknown, etaOp: unknown): string =>
  fechaISO(etaCarga) || fechaISO(etaOp)

/** Cuándo sale el contenedor de la terminal: el turno de Montecon si lo hay,
 *  si no la ETA vigente. */
const fechaRetiro = (op: OperativaDepotDigest, cab: CargaDepotDigest): string =>
  fechaISO(op.TURNO_RETIRO) || fechaISO(cab.TURNO_RETIRO) || etaVigente(cab.ETA, op.ETA || op.ETA_OP)

const libreDe = (op: OperativaDepotDigest, cab: CargaDepotDigest): string =>
  txt(op.LIBRE) || txt(cab.LIBRE_HASTA) || txt(cab.calculatedLibreHasta)

/**
 * Último aviso de este tipo para esta carga/contenedor (espejo de `ultimoAviso`
 * + `estadoAvisoDe`): si no hay uno con el contenedor exacto vale el de la ref
 * entera, que es como queda el aviso de una carga de un solo contenedor.
 */
function ultimoAvisoDe(
  avisos: PartnerAviso[],
  tipo: PartnerAvisoTipo,
  ref: string,
  cntr: string,
): PartnerAviso | undefined {
  const buscar = (c: string) => avisos
    .filter(a => a.tipo === tipo && up(a.ref) === up(ref) && up(a.cntr) === up(c))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0]
  return buscar(cntr) || (cntr ? buscar('') : undefined)
}

// ── Filas del digest ───────────────────────────────────────────────────

interface FilaBaseDigest {
  ref: string
  cliente: string
  cntr: string
  tipo: string
  terminal: string
  operativa: string
  descripcion: string
  pkgs: number
  kg: number
  m3: number
  /** Ya nos avisó y todavía no lo confirmamos: el mail no se lo vuelve a pedir. */
  avisoPendiente: boolean
}

export interface FilaRetiroDigest extends FilaBaseDigest {
  /** ETA vigente del buque (ISO). */
  eta: string
  /** Turno de retiro en Montecon ('' si no hay o si es TCP). */
  turno: string
  /** La que manda: turno si lo hay, si no la ETA. */
  fecha: string
  /** Días hasta esa fecha: 0 = hoy · <0 = ya llegó · >0 = por llegar. */
  dias: number
  libre: string
  estado: EstadoRetiro
  /** La frase lista para pegar en el mail. */
  etiqueta: string
}

export interface FilaDevolucionDigest extends FilaBaseDigest {
  /** Vencimiento del LIBRE (ISO). '' = todavía no lo cargamos. */
  libre: string
  /**
   * Días hasta el vencimiento: <0 vencido · 0 hoy · 1-2 urgente · 3-5 próximo.
   * **null = no hay fecha de LIBRE cargada**, y la plantilla del mail lo tiene
   * que decir con palabras ("sin fecha").
   * Antes acá iba un 9999 de relleno para ordenar y terminaba impreso como
   * "vence en 9999d" (Brian 03/09): de este JSON no sale ningún plazo inventado.
   */
  dias: number | null
  severidad: SeveridadLibre
  /** Vencimiento o alerta de dato faltante: el mail los muestra distinto. */
  motivo: MotivoVacio
  /** No hay fecha de LIBRE cargada. */
  faltaLibre: boolean
  /** No hay terminal de devolución (DEV) asignada. */
  faltaDev: boolean
  /** Dónde se devuelve el vacío (DEV). */
  dev: string
  estado: EstadoDevolucion
  etiqueta: string
}

export interface DepositoDigest {
  /** Alcance del partner: GODILCO, PLANIR, TCP… (= partner_users.filter_value). */
  nombre: string
  /** Destinatarios, coma-separados (como clientDigest). */
  emails: string
  sinEmail: boolean
  pendientesRetiro: FilaRetiroDigest[]
  pendientesDevolucion: FilaDevolucionDigest[]
  totales: {
    retiro: number
    devolucion: number
    /** Vacíos con el LIBRE ya vencido: lo que cuesta plata si sigue ahí. */
    devolucionVencidos: number
    /** Vacíos que están en la lista porque falta un dato NUESTRO, no por el plazo. */
    devolucionFaltaDato: number
    total: number
  }
}

/**
 * `partner_users` con role='depot' → un depósito por `filter_value`, con todos
 * sus usuarios activos como destinatarios (GODILCO tiene varias casillas). Los
 * inactivos no reciben nada: el mail no puede llegarle a un acceso dado de baja.
 */
export function agruparDepositos(users: UsuarioDeposito[]): { nombre: string; emails: string }[] {
  const porNombre = new Map<string, { nombre: string; emails: string[] }>()
  for (const u of users || []) {
    if (u.active === false) continue
    if (txt(u.role) && txt(u.role) !== 'depot') continue
    const nombre = txt(u.filter_value)
    if (!nombre) continue
    const clave = nombre.toUpperCase()
    const grupo = porNombre.get(clave) || { nombre, emails: [] }
    const email = txt(u.email).toLowerCase()
    if (email && !grupo.emails.includes(email)) grupo.emails.push(email)
    porNombre.set(clave, grupo)
  }
  return Array.from(porNombre.values())
    .map(g => ({ nombre: g.nombre, emails: g.emails.join(',') }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
}

const filaBase = (
  op: OperativaDepotDigest,
  cab: CargaDepotDigest,
  avisos: PartnerAviso[],
  tipo: PartnerAvisoTipo,
): FilaBaseDigest | null => {
  const ref = txt(op.REF) || txt(cab.REF)
  const cntr = txt(op.CNTR_OP)
  const aviso = ultimoAvisoDe(avisos, tipo, ref, cntr)
  // Confirmado = el equipo ya ejecutó la acción: la fila no existe más.
  if (aviso?.estado === 'confirmado') return null
  return {
    ref,
    cliente: txt(op.CLIENTE_OP) || txt(cab.CLIENTE),
    cntr,
    tipo: txt(op.TIPO),
    terminal: txt(cab.TERMINAL),
    operativa: txt(op.OPERATIVA),
    descripcion: txt(op.DESCRIPCION),
    pkgs: num(op.PKGS),
    kg: num(op.KG),
    m3: num(op.M3),
    avisoPendiente: aviso?.estado === 'pendiente',
  }
}

/**
 * Contenedores que el depósito tiene que ir a buscar a la terminal: TRASIEGO /
 * CARGA A PISO en su predio, con fecha (turno de Montecon o ETA) entre hoy-2 y
 * hoy+7, sin retirar ni devolver. Espejo de `retirosProximos`.
 */
function pendientesRetiro(
  shipments: CargaDepotDigest[],
  hoyISO: string,
  deposito: string,
  avisos: PartnerAviso[],
): FilaRetiroDigest[] {
  const out: FilaRetiroDigest[] = []
  for (const cab of shipments) {
    for (const op of cab.operativas || []) {
      if (!esMiDeposito(op, deposito) || !esFcl(op) || !pasaPorDeposito(op)) continue
      if (yaRetirado(op, cab) || devuelto(op, cab)) continue
      const fecha = fechaRetiro(op, cab)
      const dias = diasEntre(hoyISO, fecha)
      if (dias === null || dias < -RETIROS_DIAS_ATRAS || dias > RETIROS_DIAS_ADELANTE) continue
      const base = filaBase(op, cab, avisos, 'retire')
      if (!base) continue
      const estado = estadoRetiro(!!cab.LIBERADA, !!cab.TERMINAL_PAGADA)
      out.push({
        ...base,
        eta: etaVigente(cab.ETA, op.ETA || op.ETA_OP),
        turno: fechaISO(op.TURNO_RETIRO) || fechaISO(cab.TURNO_RETIRO),
        fecha,
        dias,
        libre: libreDe(op, cab),
        estado,
        etiqueta: ETIQUETA_RETIRO[estado],
      })
    }
  }
  return out.sort((a, b) => a.dias - b.dias || a.ref.localeCompare(b.ref))
}

/** Ordena por vencimiento; sin fecha de LIBRE va al final, y no adelante por un
 *  número de relleno. Espejo de `porVencimiento`. */
const porVencimiento = (a: number | null, b: number | null): number =>
  a === null && b === null ? 0 : a === null ? 1 : b === null ? -1 : a - b

/**
 * Vacíos que el depósito tiene que devolver, UNA FILA POR CONTENEDOR (una carga
 * con dos contenedores manda dos filas independientes: son dos devoluciones
 * distintas, con su plazo y su estado cada una). Espejo de `libresPorVencer`.
 *
 * Dos reglas, las dos de Brian el 03/09 mirando el portal de GODILCO:
 *
 * 1. **La operativa tiene que estar hecha** (`operativaHecha`): "un contenedor
 *    solo se puede devolver si la operativa ya se hizo". Antes alcanzaba con que
 *    el contenedor hubiera salido de la terminal, y el mail le iba a pedir
 *    devolver contenedores que todavía tenían la mercadería adentro.
 * 2. **Y además tiene que haber algo que hacer**: o el LIBRE aprieta
 *    (`LIBRE_DIAS_AVISO` días o menos, vencidos incluidos), o falta un dato
 *    nuestro — la fecha de LIBRE o la terminal de devolución (DEV). El segundo
 *    caso viaja marcado `motivo: 'falta_dato'` para que el mail lo diga distinto.
 *    Un vacío ya desconsolidado, con el LIBRE lejos y todos los datos completos,
 *    NO entra: no hay nada que decidir hoy y una fila de más le hace perder
 *    tiempo al depósito.
 *
 * Además tiene que ser una operativa que pase por el depósito (TRASIEGO /
 * CARGA A PISO, nunca CONTENEDOR directo: ese vacío no lo devuelve el depósito),
 * del depósito que recibe el mail y FCL. "DEVUELTO" en LIBRE o una DEV_FECHA =
 * ya devuelto, no entra; con un aviso "devolví" confirmado la fila desaparece.
 */
function pendientesDevolucion(
  shipments: CargaDepotDigest[],
  hoyISO: string,
  deposito: string,
  avisos: PartnerAviso[],
): FilaDevolucionDigest[] {
  const out: FilaDevolucionDigest[] = []
  for (const cab of shipments) {
    // Una vuelta por operativa = una vuelta por contenedor.
    for (const op of cab.operativas || []) {
      if (!esMiDeposito(op, deposito) || !esFcl(op) || !pasaPorDeposito(op)) continue
      if (devuelto(op, cab)) continue
      // Regla 1: sin operativa hecha el contenedor sigue lleno, no hay vacío.
      if (!operativaHecha(op, hoyISO)) continue
      const libre = fechaISO(libreDe(op, cab))
      const dias = libre ? diasEntre(hoyISO, libre) : null
      const dev = txt(op.DEV)
      const faltaLibre = dias === null
      const faltaDev = !dev
      // Regla 2: o el LIBRE aprieta, o nos falta un dato.
      const porVencer = dias !== null && dias <= LIBRE_DIAS_AVISO
      if (!porVencer && !faltaLibre && !faltaDev) continue
      const base = filaBase(op, cab, avisos, 'devolvi')
      if (!base) continue
      const estado = estadoDevolucion(!!cab.DEVOLUCION_PAGADA, dev)
      out.push({
        ...base,
        libre: libre || '',
        dias,
        severidad: dias === null ? 'sin_dato' : severidadLibre(dias),
        motivo: porVencer ? 'vencimiento' : 'falta_dato',
        faltaLibre,
        faltaDev,
        dev,
        estado,
        etiqueta: ETIQUETA_DEVOLUCION[estado],
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

/**
 * Núcleo del endpoint: usuarios de depósito + cargas saneadas + avisos → una
 * entrada por depósito activo, listo para que n8n arme el mail. Función PURA:
 * ni fetch ni Supabase, `hoyISO` entra por parámetro (se calcula en Montevideo).
 *
 * Los avisos se recortan al depósito que los mandó: en la lista vienen los de
 * todos, y el aviso de GODILCO sobre una ref no puede tapar la fila de PLANIR.
 */
export function buildDepotDigest(
  depositos: UsuarioDeposito[],
  shipments: CargaDepotDigest[],
  avisos: PartnerAviso[],
  hoyISO: string,
): { depositos: DepositoDigest[] } {
  const out: DepositoDigest[] = []
  for (const dep of agruparDepositos(depositos)) {
    const mios = (avisos || []).filter(a => up(a.partnerFilter) === up(dep.nombre))
    const retiro = pendientesRetiro(shipments || [], hoyISO, dep.nombre, mios)
    const devolucion = pendientesDevolucion(shipments || [], hoyISO, dep.nombre, mios)
    out.push({
      nombre: dep.nombre,
      emails: dep.emails,
      sinEmail: !dep.emails,
      pendientesRetiro: retiro,
      pendientesDevolucion: devolucion,
      totales: {
        retiro: retiro.length,
        devolucion: devolucion.length,
        devolucionVencidos: devolucion.filter(d => d.severidad === 'vencido').length,
        devolucionFaltaDato: devolucion.filter(d => d.motivo === 'falta_dato').length,
        total: retiro.length + devolucion.length,
      },
    })
  }
  return { depositos: out }
}
