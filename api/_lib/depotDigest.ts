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
// ESPEJO SERVIDOR de retirosProximos / libresPorVencer / estadoRetiro /
// estadoDevolucion (src/lib/hoyDeposito.ts): el recordatorio tiene que listar
// exactamente lo que el depósito ve al entrar al portal — si el mail y la
// pantalla no coinciden, el depósito deja de creerle a los dos. Se repite en
// vez de importarse porque la API no importa código de src/ (mismo motivo que
// TIPOS_POR_ROL_API en partnerAvisosRules.ts: api/ compila con moduleResolution
// NodeNext y src/ importa sin extensión). Si cambian las reglas de HOY del
// depósito, hay que cambiarlas también acá.
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
/** Un vacío sin LIBRE cargado va al final de la lista, no adelante. */
const SIN_LIBRE_ORDEN = 9999

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
  DEPOSITO?: string
  OPERATIVA?: string
  CNTR_OP?: string
  TIPO?: string
  LIBRE?: string
  DEV?: string
  DESCRIPCION?: string
  ETA_OP?: string
  SALIDA?: string
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

export type SeveridadLibre = 'vencido' | 'hoy' | 'urgente' | 'proximo'

export function severidadLibre(dias: number): SeveridadLibre {
  if (dias < 0) return 'vencido'
  if (dias === 0) return 'hoy'
  if (dias <= 2) return 'urgente'
  return 'proximo'
}

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
  fechaISO(op.TURNO_RETIRO) || fechaISO(cab.TURNO_RETIRO) || etaVigente(cab.ETA, op.ETA_OP)

const libreDe = (op: OperativaDepotDigest, cab: CargaDepotDigest): string =>
  txt(op.LIBRE) || txt(cab.LIBRE_HASTA)

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
  /** Días hasta el vencimiento. null = sin LIBRE cargado (el vacío existe igual). */
  dias: number | null
  severidad: SeveridadLibre
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
  const ref = txt(cab.REF)
  const cntr = txt(op.CNTR_OP)
  const aviso = ultimoAvisoDe(avisos, tipo, ref, cntr)
  // Confirmado = el equipo ya ejecutó la acción: la fila no existe más.
  if (aviso?.estado === 'confirmado') return null
  return {
    ref,
    cliente: txt(cab.CLIENTE),
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
 * hoy+7, sin retirar ni devolver. Mismo criterio que `retirosProximos`.
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
        eta: etaVigente(cab.ETA, op.ETA_OP),
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

/**
 * Vacíos que el depósito tiene en el predio y todavía no devolvió — venza el
 * LIBRE cuando venza y esté cargado o no: el vacío hay que devolverlo igual
 * (Brian 03/09). Un contenedor que sigue en el buque o en la terminal no entra:
 * "devolví el vacío" sería una acción imposible. Mismo criterio que
 * `libresPorVencer`.
 */
function pendientesDevolucion(
  shipments: CargaDepotDigest[],
  hoyISO: string,
  deposito: string,
  avisos: PartnerAviso[],
): FilaDevolucionDigest[] {
  const out: FilaDevolucionDigest[] = []
  for (const cab of shipments) {
    for (const op of cab.operativas || []) {
      if (!esMiDeposito(op, deposito) || !esFcl(op) || !pasaPorDeposito(op)) continue
      if (devuelto(op, cab)) continue
      const retiro = fechaRetiro(op, cab)
      if (retiro && retiro > hoyISO) continue
      const base = filaBase(op, cab, avisos, 'devolvi')
      if (!base) continue
      const libre = fechaISO(libreDe(op, cab))
      const dias = libre ? diasEntre(hoyISO, libre) : null
      const dev = txt(op.DEV)
      const estado = estadoDevolucion(!!cab.DEVOLUCION_PAGADA, dev)
      out.push({
        ...base,
        libre,
        dias,
        severidad: dias === null ? 'proximo' : severidadLibre(dias),
        dev,
        estado,
        etiqueta: ETIQUETA_DEVOLUCION[estado],
      })
    }
  }
  return out.sort((a, b) => (a.dias ?? SIN_LIBRE_ORDEN) - (b.dias ?? SIN_LIBRE_ORDEN) || a.ref.localeCompare(b.ref))
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
        total: retiro.length + devolucion.length,
      },
    })
  }
  return { depositos: out }
}
