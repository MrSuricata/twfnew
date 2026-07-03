// ─── Checks operativos por referencia (pestaña Checks) ─────────────────
// Checklist del PROCEDIMIENTO OPERATIVO (11 pasos, redacción textual del
// dueño) para FCL que operan por Uruguay. La tabla `ref_checks` guarda SOLO
// el estado de los pasos: el universo de refs se deriva SIEMPRE de las
// cargas al leer (derive-on-read) — nunca se copia a la tabla.
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
  | 'traslado_deposito'
  | 'coord_trasiego'
  | 'fotos_carga'
  | 'aviso_salida'
  | 'cruce_frontera'
  | 'arribo_fiscal'

export interface CheckStepDef {
  key: CheckStepKey
  label: string
  /** Pasos 6-7 del procedimiento: solo aplican cuando OPERATIVA=TRASIEGO. */
  trasiegoOnly?: boolean
}

/** Los 11 pasos del PROCEDIMIENTO OPERATIVO — mantener este orden y esta
 *  redacción (labels textuales del dueño). */
export const CHECK_STEPS: CheckStepDef[] = [
  { key: 'salida_origen', label: 'Avisar salida de origen' },
  { key: 'arribo_buque', label: 'Avisar arribo del buque a destino' },
  { key: 'carta_resp', label: 'Entregar carta de responsabilidad' },
  { key: 'bl_naviera', label: 'Entregar BL a naviera' },
  { key: 'pagos_liberacion', label: 'Pagar gastos para liberar' },
  { key: 'traslado_deposito', label: 'Avisar traslado de contenedor a depósito en Uruguay', trasiegoOnly: true },
  { key: 'coord_trasiego', label: 'Coordinar fecha de trasiego', trasiegoOnly: true },
  { key: 'fotos_carga', label: 'Mandar fotos día de carga' },
  { key: 'aviso_salida', label: 'Avisar salida en el día de carga' },
  { key: 'cruce_frontera', label: 'Avisar cruce de frontera' },
  { key: 'arribo_fiscal', label: 'Avisar arribo a fiscal' },
]

/** Estado guardado de un paso. `by` lo estampa el server desde el token. */
export interface RefCheckStep {
  done: boolean
  date?: string   // YYYY-MM-DD (default: el día en que se marcó)
  by?: string     // quién lo marcó (email/usuario del token)
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

/** ¿La operativa es trasiego? (los pasos 6-7 solo aplican en ese caso). */
export function isTrasiego(operativa: string | null | undefined): boolean {
  return String(operativa || '').toUpperCase().includes('TRASIEGO')
}

/** Pasos visibles para una operativa: 11 si es TRASIEGO, 9 si no
 *  (se ocultan traslado_deposito y coord_trasiego). */
export function stepsForOperativa(operativa: string | null | undefined): CheckStepDef[] {
  if (isTrasiego(operativa)) return CHECK_STEPS
  return CHECK_STEPS.filter(s => !s.trasiegoOnly)
}

/** Progreso "hecho/total" contando SOLO los pasos visibles para la operativa
 *  (un traslado_deposito marcado no cuenta si la operativa no es trasiego). */
export function checksProgress(steps: RefCheckSteps, operativa: string | null | undefined): { done: number; total: number } {
  const visible = stepsForOperativa(operativa)
  const done = visible.filter(s => steps[s.key]?.done).length
  return { done, total: visible.length }
}

/** Próximo paso sugerido: el PRIMER paso visible sin marcar (o null si está
 *  todo hecho). Es una sugerencia de orden, no un bloqueo. */
export function nextPendingStep(steps: RefCheckSteps, operativa: string | null | undefined): CheckStepKey | null {
  for (const s of stepsForOperativa(operativa)) {
    if (!steps[s.key]?.done) return s.key
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
