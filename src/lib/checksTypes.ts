// ─── Checks documentarios por referencia (pestaña Checks) ───────────────
// 5 checks por carga (Brian, 13/07/2026 · Pagos OK sumado el 11/08/2026):
//   BL entregado · Carta entregada · Docs transporte · Docs depósito · Pagos OK
// Pagos OK se marca a mano y significa "los pagos que hacían falta (locales,
// flete, o los dos) están hechos" — el operador decide cuáles aplicaban.
//
// Cerrando el circuito está LIBERADO, que NO es un check más: lo confirma la
// naviera y es lo que saca la carga del tablero. Con los 5 checks se habilita
// el botón; recién al apretarlo la carga desaparece de Checks.
// Regla de negocio: los 4 tienen que estar listos 2 SEMANAS antes de la ETA
// (un digest diario de n8n avisa los que faltan).
// La tabla `ref_checks` guarda SOLO el estado: el universo de refs se deriva
// SIEMPRE de las cargas al leer (derive-on-read) — nunca se copia a la tabla.
//
// En el MISMO jsonb conviven los 3 AVISOS por contenedor que usa la pestaña
// HOY (aviso_salida / cruce_frontera / arribo_fiscal): están en CHECK_STEPS
// con flag `aviso` y NO se muestran en la pestaña Checks.
//
// Las keys del checklist viejo (salida_origen, carta_resp, bl_naviera, …)
// pueden seguir apareciendo en el jsonb guardado de filas previas: se ignoran
// al leer y el schema del server ya no las acepta al escribir. Los datos de
// carta_resp/bl_naviera se migraron a carta_entregada/bl_entregado (13/07).
// ────────────────────────────────────────────────────────────────────────

import type { UnifiedOperation } from './operationsTypes'
import { isOperationActive } from './operationsTypes'
import { parseLocalDate } from './shipmentTypes'

export type CheckStepKey =
  // Checks documentarios (pestaña Checks)
  | 'bl_entregado'
  | 'carta_entregada'
  | 'docs_transporte'
  | 'docs_deposito'
  | 'pagos_ok'
  // Cierre: lo confirma la naviera, no nosotros
  | 'liberado'
  // Avisos por contenedor (se marcan desde HOY)
  | 'aviso_traslado'
  | 'visita_deposito'
  | 'aviso_salida'
  | 'cruce_frontera'
  | 'arribo_fiscal'

export interface CheckStepDef {
  key: CheckStepKey
  label: string
  /** Aviso por contenedor: vive en la pestaña HOY (una tarjeta = un cntr) y
   *  NO se muestra en la pestaña Checks. */
  aviso?: boolean
  /** Paso de CIERRE: no es un check de la lista sino el botón que saca la
   *  carga del tablero. Se marca cuando la línea confirma la liberación. */
  cierre?: boolean
  /** Paso PERSONAL (página /mirendimiento): tampoco va a la pestaña Checks ni
   *  al progreso documentario. A diferencia de los avisos, es nivel CARGA —
   *  se fue al depósito por la operativa, no "por el contenedor 2 de 3". */
  personal?: boolean
}

/** Todos los pasos conocidos del jsonb `steps`: los 4 checks documentarios
 *  (orden y redacción de Brian) + los 3 avisos de HOY. */
export const CHECK_STEPS: CheckStepDef[] = [
  { key: 'bl_entregado', label: 'BL entregado' },
  { key: 'carta_entregada', label: 'Carta entregada' },
  { key: 'docs_transporte', label: 'Docs transporte' },
  { key: 'docs_deposito', label: 'Docs depósito' },
  { key: 'pagos_ok', label: 'Pagos OK' },
  { key: 'liberado', label: 'Liberado', cierre: true },
  { key: 'aviso_traslado', label: 'Avisar traslado del CNTR al depósito', aviso: true },
  { key: 'visita_deposito', label: 'Estuve en el depósito por esta carga', personal: true },
  { key: 'aviso_salida', label: 'Avisar salida en el día de carga', aviso: true },
  { key: 'cruce_frontera', label: 'Avisar cruce de frontera', aviso: true },
  { key: 'arribo_fiscal', label: 'Avisar arribo a fiscal', aviso: true },
]

/** Estado guardado de un paso. `by` lo estampa el server desde el token. */
export interface RefCheckStep {
  done: boolean
  date?: string   // YYYY-MM-DD (default: el día en que se marcó)
  by?: string     // quién lo marcó (email/usuario del token)
  /** Reclamo del DÍA (Brian 17/07): "hoy reclamé la factura/datos para poder
   *  completar este paso" (ej: instrucción de CRT). Vence solo al día
   *  siguiente — derive-on-read: activo ⇔ reclamado === hoy, sin cron — para
   *  volver a reclamar cada día hasta tenerlo. Marcar el paso hecho (o quitar
   *  el reclamo) lo borra. reclamadoBy lo estampa el server desde el token. */
  reclamado?: string      // YYYY-MM-DD del último reclamo
  reclamadoBy?: string
  /** SOLO pasos-aviso (salida/frontera/fiscal): estado POR CONTENEDOR. Cuando
   *  existe, manda `cntrs` (no el `done` de arriba, que queda como "algún
   *  contenedor avisado"). Ausente = paso nivel-ref (resto de los pasos, y las
   *  filas legacy previas a este cambio: su `done` aplica a TODOS los cntr). */
  cntrs?: Record<string, { done: boolean; date?: string; by?: string }>
}

/** Los 3 pasos que son POR CONTENEDOR (eventos que ocurren por contenedor:
 *  salida, cruce de frontera, arribo a fiscal). El resto es nivel-ref. */
export const AVISO_STEP_KEYS: ReadonlySet<CheckStepKey> = new Set<CheckStepKey>([
  'aviso_traslado', 'aviso_salida', 'cruce_frontera', 'arribo_fiscal',
])
export function isAvisoStep(key: CheckStepKey): boolean {
  return AVISO_STEP_KEYS.has(key)
}

export type RefCheckSteps = Partial<Record<CheckStepKey, RefCheckStep>>

/** Fila de la tabla ref_checks tal como la devuelve la API. */
export interface RefCheckRecord {
  ref: string
  steps: RefCheckSteps
  updatedAt?: string
  updatedBy?: string
}

/** Ref normalizada para indexar (mismo criterio que refOf del server). */
export function normalizeRef(ref: string | null | undefined): string {
  return String(ref || '').trim().toUpperCase()
}

/** Checks visibles en la pestaña Checks: los 4 documentarios (los avisos se
 *  marcan desde HOY). La operativa ya no condiciona pasos — el parámetro se
 *  conserva por compatibilidad de firma con los callers. */
export function stepsForOperativa(_operativa: string | null | undefined): CheckStepDef[] {
  return CHECK_STEPS.filter(s => !s.aviso && !s.cierre && !s.personal)
}

/**
 * La carga fue liberada por la naviera. Es el cierre del circuito: recién acá
 * sale del tablero de Checks.
 *
 * Se lee del dato, no de los checks: si la línea confirmó, la carga está
 * liberada aunque haya quedado un paso sin tildar. `puedeLiberarse` es lo que
 * gobierna el botón.
 */
export function estaLiberada(steps: RefCheckSteps): boolean {
  return !!steps.liberado?.done
}

/** El botón de liberar se habilita con los 5 checks documentarios completos. */
export function puedeLiberarse(
  steps: RefCheckSteps,
  operativa: string | null | undefined,
  cntrList?: string[],
): boolean {
  const { done, total } = checksProgress(steps, operativa, cntrList)
  return total > 0 && done === total
}

// ── Avisos POR CONTENEDOR (salida/frontera/fiscal) ──────────────────────
// Los 3 pasos-aviso guardan estado por contenedor en `step.cntrs`. En HOY cada
// tarjeta (= un contenedor) marca SU aviso; en la pestaña Checks (por-ref) el
// paso se muestra AGREGADO: hecho cuando TODOS los contenedores están avisados
// (progreso d/t mientras falta alguno). Una sola fuente de verdad (ref_checks).

/** Estado EFECTIVO del aviso de UN contenedor. Si el paso tiene `cntrs`, manda
 *  solo eso (contenedor ausente o {done:false} = NO avisado). Si NO tiene `cntrs`
 *  (fila legacy nivel-ref), el `done` del paso aplica a TODOS los contenedores. */
export function avisoForCntr(step: RefCheckStep | undefined, cntr: string): RefCheckStep | undefined {
  if (!step) return undefined
  if (step.cntrs) {
    const c = step.cntrs[cntr]
    return c?.done ? { done: true, date: c.date, by: c.by } : undefined
  }
  return step.done ? { done: true, date: step.date, by: step.by } : undefined
}

/** Agregado del aviso sobre la lista de contenedores de la ref: cuántos avisados
 *  de cuántos. `total` = cantidad de contenedores (mínimo 1). Sin lista de
 *  contenedores cae al `done` del paso (1/1 o 0/1). */
export function avisoAggregate(step: RefCheckStep | undefined, cntrList: string[]): { done: number; total: number } {
  if (cntrList.length === 0) {
    const d = step?.done ? 1 : 0
    return { done: d, total: 1 }
  }
  let done = 0
  for (const c of cntrList) if (avisoForCntr(step, c)) done++
  return { done, total: cntrList.length }
}

/** Construye el mapa `cntrs` COMPLETO de un paso-aviso a partir del estado
 *  actual (sembrando TODOS los contenedores desde su estado efectivo — así una
 *  fila legacy nivel-ref no "pierde" los contenedores que ya estaban avisados)
 *  y aplica el toggle a `target` (un contenedor, o TODOS si target === null).
 *  Lo usan HOY (un contenedor) y la pestaña Checks (bulk = todos). */
export function buildAvisoCntrsMap(
  step: RefCheckStep | undefined,
  cntrList: string[],
  target: string | null,
  done: boolean,
  ctx: { date: string; by: string },
): Record<string, { done: boolean; date?: string; by?: string }> {
  const map: Record<string, { done: boolean; date?: string; by?: string }> = {}
  for (const c of cntrList) {
    const eff = avisoForCntr(step, c)
    map[c] = eff ? { done: true, date: eff.date, by: eff.by } : { done: false }
  }
  for (const c of target === null ? cntrList : [target]) {
    map[c] = done ? { done: true, date: ctx.date, by: ctx.by } : { done: false }
  }
  return map
}

/** ¿El paso está COMPLETO? Para pasos-aviso con lista de contenedores: todos
 *  avisados. Para el resto (o sin lista): el `done` del paso. */
function stepComplete(step: RefCheckStep | undefined, key: CheckStepKey, cntrList?: string[]): boolean {
  if (isAvisoStep(key) && cntrList && cntrList.length > 0) {
    const { done, total } = avisoAggregate(step, cntrList)
    return total > 0 && done === total
  }
  return !!step?.done
}

/** Progreso "hecho/total" contando SOLO los pasos visibles para la operativa
 *  (un paso condicional marcado no cuenta si la operativa ya no aplica). Con
 *  `cntrList`, los pasos-aviso cuentan hechos solo si TODOS los contenedores
 *  están avisados. */
export function checksProgress(steps: RefCheckSteps, operativa: string | null | undefined, cntrList?: string[]): { done: number; total: number } {
  const visible = stepsForOperativa(operativa)
  const done = visible.filter(s => stepComplete(steps[s.key], s.key, cntrList)).length
  return { done, total: visible.length }
}

/** Próximo paso sugerido: el PRIMER paso visible sin completar (o null si está
 *  todo hecho). Es una sugerencia de orden, no un bloqueo. */
export function nextPendingStep(steps: RefCheckSteps, operativa: string | null | undefined, cntrList?: string[]): CheckStepKey | null {
  for (const s of stepsForOperativa(operativa)) {
    if (!stepComplete(steps[s.key], s.key, cntrList)) return s.key
  }
  return null
}

/** Merge de un patch PARCIAL de pasos sobre los existentes (misma semántica
 *  que el server): la clave que llega reemplaza solo ESE paso, done=false lo
 *  elimina (vuelve a pendiente) — SALVO que traiga `reclamado` (paso pendiente
 *  pero reclamado hoy: se guarda) — y el resto se conserva intacto. */
export function mergeChecksSteps(base: RefCheckSteps, patch: RefCheckSteps): RefCheckSteps {
  const out: RefCheckSteps = { ...base }
  for (const [key, step] of Object.entries(patch) as [CheckStepKey, RefCheckStep | undefined][]) {
    if (step === undefined) continue
    if (!step.done && !step.reclamado) delete out[key]
    else out[key] = step
  }
  return out
}

/** ¿El paso pendiente está reclamado HOY? Ayer reclamado → hoy ya no (vuelve
 *  el botón para re-reclamar), hasta que el paso se marque hecho. */
export function esReclamadoHoy(step: RefCheckStep | undefined, hoyIso: string): boolean {
  return !!step && !step.done && !!step.reclamado && step.reclamado === hoyIso
}

/** Criterio "opera por Uruguay" = PAIS/dest_country 'UY', que en la planilla se
 *  deriva del POD: 'UY' ⇔ descarga en MONTEVIDEO. Cubre las UY finales Y las
 *  AR-vía-MVD (descargan en MVD y cruzan por camión). Excluye lo que NO toca
 *  MVD: CL (SAN ANTONIO/VALPARAISO directo), AR directo (POD BUENOS AIRES),
 *  OTRO (ROSARIO/PARAGUAY/…) y sin dato.
 *  Verificado en datos reales (03/07/2026, FCL no archivadas): UY 605 cargas
 *  (530 con datos de operativa UY) · CL 382 (solo 3 con operativa) · AR-BA 78
 *  (0) · OTRO 92 (1) · vacío 37 (0) → 'UY' captura el universo correcto. */
export function isPorUruguay(pais: string | null | undefined): boolean {
  return String(pais || '').trim().toUpperCase() === 'UY'
}

const etaTime = (eta: string): number => {
  const d = parseLocalDate(eta || '')
  return d ? d.getTime() : Number.POSITIVE_INFINITY   // sin ETA → al final
}

/** Universo de refs de la pestaña Checks, SIEMPRE derivado de las cargas del
 *  admin (nunca de ref_checks): FCL, no archivadas, activas (isOperationActive
 *  — ojo: "DEVUELTO" vive en LIBRE) y que operan por Uruguay (isPorUruguay).
 *  Deduplica por ref (si el cache legacy y la DB traen la misma, gana la DB)
 *  y ordena por ETA ascendente (sin ETA al final, empate por ref). */
export function buildChecksUniverse(ops: UnifiedOperation[], today: Date): UnifiedOperation[] {
  const byRef = new Map<string, UnifiedOperation>()
  for (const op of ops) {
    if (op.mode !== 'fcl' || op.archived) continue
    if (!isPorUruguay(op.pais)) continue
    if (!isOperationActive(op, undefined, today)) continue
    const key = normalizeRef(op.ref)
    if (!key) continue
    const prev = byRef.get(key)
    if (!prev || (prev.source !== 'db' && op.source === 'db')) byRef.set(key, op)
  }
  return [...byRef.values()].sort((a, b) => {
    const ta = etaTime(a.eta)
    const tb = etaTime(b.eta)
    if (ta !== tb) return ta - tb
    return a.ref.localeCompare(b.ref)
  })
}
