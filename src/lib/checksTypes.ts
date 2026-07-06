// ─── Checks operativos por referencia (pestaña Checks) ─────────────────
// Checklist del PROCEDIMIENTO OPERATIVO (redacción textual del dueño) para
// FCL que operan por Uruguay, con pasos condicionales por operativa:
//   TRASIEGO   → 11 pasos (9 comunes + traslado a depósito + coordinar trasiego)
//   CONTENEDOR → 13 pasos (9 comunes + confirmar devolución en AR antes del
//                viaje + transferencia / drop off / gate in post-arribo)
//   resto      → 9 pasos comunes
// La tabla `ref_checks` guarda SOLO el estado de los pasos: el universo de
// refs se deriva SIEMPRE de las cargas al leer (derive-on-read) — nunca se
// copia a la tabla.
//
// V1: todos los pasos se marcan a MANO. "Avisar cruce de frontera" y
// "Avisar arribo a fiscal" NO se auto-marcan desde las fechas de la
// operativa (salida/ETA fiscal) — mejora futura.
// ────────────────────────────────────────────────────────────────────────

import type { UnifiedOperation } from './operationsTypes'
import { isOperationActive } from './operationsTypes'
import { parseLocalDate } from './shipmentTypes'

export type CheckStepKey =
  | 'salida_origen'
  | 'arribo_buque'
  | 'carta_resp'
  | 'bl_naviera'
  | 'pagos_liberacion'
  | 'confirmar_dev_arg'
  | 'traslado_deposito'
  | 'coord_trasiego'
  | 'fotos_carga'
  | 'aviso_salida'
  | 'cruce_frontera'
  | 'arribo_fiscal'
  | 'transferir_cntr'
  | 'pagar_dropoff'
  | 'pagar_gatein'

export interface CheckStepDef {
  key: CheckStepKey
  label: string
  /** Paso condicional: solo aplica cuando la OPERATIVA es esta.
   *  'TRASIEGO' → traslado a depósito + coordinar trasiego ·
   *  'CONTENEDOR' → confirmar devolución en AR + transferencia/drop off/gate in. */
  solo?: 'TRASIEGO' | 'CONTENEDOR'
}

/** Los pasos del PROCEDIMIENTO OPERATIVO — mantener este orden y esta
 *  redacción (labels textuales del dueño). Los condicionales se intercalan
 *  donde ocurren en la operación real: confirmar devolución en AR es PREVIO
 *  al viaje (tras pagar la liberación); transferencia, drop off y gate in
 *  son POST-arribo a fiscal. */
export const CHECK_STEPS: CheckStepDef[] = [
  { key: 'salida_origen', label: 'Avisar salida de origen' },
  { key: 'arribo_buque', label: 'Avisar arribo del buque a destino' },
  { key: 'carta_resp', label: 'Entregar carta de responsabilidad' },
  { key: 'bl_naviera', label: 'Entregar BL a naviera' },
  { key: 'pagos_liberacion', label: 'Pagar gastos para liberar' },
  { key: 'confirmar_dev_arg', label: 'Confirmar si puede devolver en Argentina', solo: 'CONTENEDOR' },
  { key: 'traslado_deposito', label: 'Avisar traslado de contenedor a depósito en Uruguay', solo: 'TRASIEGO' },
  { key: 'coord_trasiego', label: 'Coordinar fecha de trasiego', solo: 'TRASIEGO' },
  { key: 'fotos_carga', label: 'Mandar fotos día de carga' },
  { key: 'aviso_salida', label: 'Avisar salida en el día de carga' },
  { key: 'cruce_frontera', label: 'Avisar cruce de frontera' },
  { key: 'arribo_fiscal', label: 'Avisar arribo a fiscal' },
  { key: 'transferir_cntr', label: 'Transferir el contenedor', solo: 'CONTENEDOR' },
  { key: 'pagar_dropoff', label: 'Pagar drop off a la línea', solo: 'CONTENEDOR' },
  { key: 'pagar_gatein', label: 'Pagar gate in a la terminal en Argentina', solo: 'CONTENEDOR' },
]

/** Estado guardado de un paso. `by` lo estampa el server desde el token. */
export interface RefCheckStep {
  done: boolean
  date?: string   // YYYY-MM-DD (default: el día en que se marcó)
  by?: string     // quién lo marcó (email/usuario del token)
  /** SOLO pasos-aviso (salida/frontera/fiscal): estado POR CONTENEDOR. Cuando
   *  existe, manda `cntrs` (no el `done` de arriba, que queda como "algún
   *  contenedor avisado"). Ausente = paso nivel-ref (resto de los pasos, y las
   *  filas legacy previas a este cambio: su `done` aplica a TODOS los cntr). */
  cntrs?: Record<string, { done: boolean; date?: string; by?: string }>
}

/** Los 3 pasos que son POR CONTENEDOR (eventos que ocurren por contenedor:
 *  salida, cruce de frontera, arribo a fiscal). El resto es nivel-ref. */
export const AVISO_STEP_KEYS: ReadonlySet<CheckStepKey> = new Set<CheckStepKey>([
  'aviso_salida', 'cruce_frontera', 'arribo_fiscal',
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

/** ¿La operativa es trasiego? (habilita traslado_deposito + coord_trasiego). */
export function isTrasiego(operativa: string | null | undefined): boolean {
  return String(operativa || '').toUpperCase().includes('TRASIEGO')
}

/** ¿La operativa es contenedor (retiro directo de terminal a fiscal AR)?
 *  Habilita confirmar_dev_arg + transferir_cntr + pagar_dropoff + pagar_gatein. */
export function isContenedor(operativa: string | null | undefined): boolean {
  return String(operativa || '').toUpperCase().includes('CONTENEDOR')
}

/** Pasos visibles para una operativa: 11 si es TRASIEGO, 13 si es CONTENEDOR,
 *  9 en el resto (se ocultan los condicionales que no aplican). */
export function stepsForOperativa(operativa: string | null | undefined): CheckStepDef[] {
  const trasiego = isTrasiego(operativa)
  const contenedor = isContenedor(operativa)
  return CHECK_STEPS.filter(s =>
    !s.solo || (s.solo === 'TRASIEGO' && trasiego) || (s.solo === 'CONTENEDOR' && contenedor)
  )
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
 *  elimina (vuelve a pendiente) y el resto se conserva intacto. */
export function mergeChecksSteps(base: RefCheckSteps, patch: RefCheckSteps): RefCheckSteps {
  const out: RefCheckSteps = { ...base }
  for (const [key, step] of Object.entries(patch) as [CheckStepKey, RefCheckStep | undefined][]) {
    if (step === undefined) continue
    if (!step.done) delete out[key]
    else out[key] = step
  }
  return out
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
