// Sección de salidas y arribos por contenedor (Panel detalle de operación FCL).
// Se monta entre ViabilityBlock y la sección "Contenedores".
// Editable solo cuando la operación es una fila DB (FCL horneada) no read-only.

import { forwardRef, useImperativeHandle, useState } from 'react'
import type { UnifiedOperation } from '@/lib/operationsTypes'
import { applyLugarSalida, lugarOrDeposito } from '@/lib/operationsTypes'
import type { ParsedShipment, OperativasRecord } from '@/lib/shipmentTypes'
import { getShipmentStatus } from '@/lib/shipmentTypes'
import { parseCntr } from '@/lib/cntrUtils'
import { isSalidaBeforeArrival, avisoSalida, fmtDMY, etaVigente } from '@/lib/salidaCheck'
import { sugerirEtaFiscal, llegadaFiscalAtipica, nombreDia } from '@/lib/transitoFiscal'
import { isSinTelex, SIN_TELEX_MSG } from '@/lib/telexCheck'
import { toast } from 'sonner'

/** Handle imperativo que el panel usa para forzar el commit de los borradores
 *  pendientes ANTES de cerrar el Sheet (si no, el draft tipeado/elegido se pierde
 *  al desmontar — el onBlur no llega a dispararse). */
export interface ContainerDatesHandle {
  /** Comitea todos los borradores pendientes (salida, arribo fiscal, bultos, kg,
   *  m³). Devuelve true si hubo algo que comitear. */
  flush: () => boolean
}

const LUGAR_OPTIONS = [
  { value: '', label: '— en terminal —' },
  { value: 'TCP', label: 'TCP' },
  { value: 'MONTECON', label: 'MONTECON' },
  { value: 'GODILCO', label: 'GODILCO' },
  { value: 'PLANIR', label: 'PLANIR' },
]

/** Micro-status para un contenedor individual derivado de su OperativasRecord. */
function microStatus(op: UnifiedOperation, record: OperativasRecord): string {
  // Fix 4: annotate as ParsedShipment (no `as` cast) so schema changes fail at compile time.
  const mini: ParsedShipment = {
    REF: op.ref,
    CLIENTE: op.cliente || '',
    ETA: op.eta,
    ETD: op.etd,
    FT: 0,
    LIBRE_HASTA: '',
    CNTR: record.CNTR_OP || '',
    N: 1,
    MBL: '',
    LINEA: '',
    BUQUE: '',
    TERMINAL: '',
    C_TERMINAL: 0,
    C_DEV: 0,
    LOCALES: 0,
    FLETE: 0,
    FORMA_DE_PAGO: 'al arribo',
    VTO: '',
    CR: false,
    BL: false,
    AD: false,
    AT: false,
    POL: '',
    POD: '',
    PAIS: 'OTRO',
    SEGUIMIENTO: '',
    TIPO: '',
    containers: [],
    calculatedN: 1,
    calculatedLibreHasta: '',
    operativas: [record],
  }
  return getShipmentStatus(mini).label
}

/**
 * Resolves the existing OperativasRecord for container at index `i`.
 *
 * Fix 1+2: match by CNTR_OP first (not by array index) to prevent silent data
 * clobber when the cntr string has more entries than op.operativas has elements.
 * Falls back to existing[i] only when no CNTR match is found, and finally to a
 * synthetic blank (with CNTR_OP pre-filled) for genuinely-new containers.
 */
export function resolveRecord(
  cntrs: string[],
  existing: OperativasRecord[],
  i: number,
  op: UnifiedOperation
): OperativasRecord {
  const cntrKey = (cntrs[i] || '').trim().toUpperCase()

  // Primary: match by container number
  if (cntrKey) {
    const byNumber = existing.find(
      o => (o.CNTR_OP || '').trim().toUpperCase() === cntrKey
    )
    if (byNumber) return byNumber
  }

  // Fallback: positional match (only if the existing record has no CNTR_OP).
  // Estampamos CNTR_OP = cntrs[i]: si la operativa existente vino SIN número de
  // contenedor (dato viejo o cargado antes de asignar el contenedor), reusarla sin
  // estampar dejaba su CNTR_OP vacío → el rollup (que arma `contenedor` juntando
  // los CNTR_OP) BORRABA el contenedor. Preserva la data existente y le pone el nº.
  const byIndex = existing[i]
  if (byIndex && !(byIndex.CNTR_OP || '').trim()) {
    return cntrKey ? { ...byIndex, CNTR_OP: cntrs[i] } : byIndex
  }

  // New container: synthetic blank (CNTR_OP set so future edits match by number).
  // Con UN solo contenedor, sus bultos/kg/m3 SON los totales de la carga:
  // sembrarlos evita cargar los mismos numeros dos veces (caso A8045, 19/08 —
  // la fila nacia en 0 y habia que retipear 463/4484/68 a mano abajo). Con
  // varios contenedores no se puede adivinar el desglose: quedan en 0.
  const unico = cntrs.length === 1
  return {
    REF: op.ref,
    TLX: '',
    DEPOSITO: op.deposito || '',
    ETA_OP: op.eta || '',
    SALIDA: '',
    ETA_FISC: '',
    LIBRE: op.libre || '',
    OPERATIVA: op.operativa || '',
    CNTR_OP: cntrs[i] || '',
    PKGS: unico ? (op.pkgs || 0) : 0,
    KG: unico ? (op.kg || 0) : 0,
    M3: unico ? (op.m3 || 0) : 0,
    DESCRIPCION: '',
    FISCAL: op.fiscal || '',
    DESCARGA: '',
    DEV: '',
    CLIENTE_OP: op.cliente || '',
    TIPO: op.tipo || '',
    WOOD: op.wood ? 'SI' : '',
    TRANSPORTE: op.transporte || '',
    HORARIO: '',
    LUGAR_SALIDA: '',
  }
}

/**
 * Builds the full updated operativas array when one field of one container changes.
 *
 * Fix 1+2: spreads the resolved record (which is matched by CNTR_OP) and only
 * overlays the changed field — all other fields (DESCARGA, DEV, KG, M3, etc.)
 * on matched records are preserved.
 */
export function buildNextOperativas(
  cntrs: string[],
  existing: OperativasRecord[],
  op: UnifiedOperation,
  idx: number,
  patch: Partial<Pick<OperativasRecord, 'SALIDA' | 'ETA_FISC' | 'LUGAR_SALIDA' | 'PKGS' | 'KG' | 'M3'>>
): OperativasRecord[] {
  return cntrs.map((_, i) => {
    const base = resolveRecord(cntrs, existing, i, op)
    if (i === idx) return { ...base, ...patch }
    return base
  })
}

/**
 * Reconcilia el array `operativas` con la lista de contenedores: UNA entrada por
 * contenedor, preservando la existente por CNTR_OP y sintetizando (con CNTR_OP
 * seteado) las nuevas. Lo usa el panel al AGREGAR/QUITAR un contenedor para que
 * `operativas` no quede desalineado con la columna `contenedor`.
 *
 * Sin esto: agregar un contenedor solo crecía la columna `contenedor`; el array
 * seguía corto → la siguiente edición de un campo nivel-carga (buildPerContainerPatch
 * mapea sobre `op.operativas`) producía un array corto → el rollup recomputaba
 * `contenedor` con MENOS contenedores y borraba el nuevo (y su data por contenedor).
 */
export function reconcileOperativasToCntrs(
  cntrs: string[],
  existing: OperativasRecord[],
  op: UnifiedOperation,
): OperativasRecord[] {
  return cntrs.map((_, i) => resolveRecord(cntrs, existing, i, op))
}

/** Campos que el flush conoce (los mismos que se editan por contenedor). */
type FlushField = 'SALIDA' | 'ETA_FISC' | 'PKGS' | 'KG' | 'M3'
const NUMERIC_FLUSH_FIELDS: ReadonlySet<FlushField> = new Set(['PKGS', 'KG', 'M3'])

/** Parsea la clave de draft `${cntr}-${i}-${FIELD}`. El separador es el ÚLTIMO
 *  "-" (los CNTR pueden tener guiones); el índice es el penúltimo token. */
function parseDraftKey(key: string): { idx: number; field: FlushField } | null {
  const lastDash = key.lastIndexOf('-')
  if (lastDash < 0) return null
  const field = key.slice(lastDash + 1) as FlushField
  const rest = key.slice(0, lastDash)
  const prevDash = rest.lastIndexOf('-')
  if (prevDash < 0) return null
  const idx = Number(rest.slice(prevDash + 1))
  if (!Number.isInteger(idx) || idx < 0) return null
  if (field !== 'SALIDA' && field !== 'ETA_FISC' && !NUMERIC_FLUSH_FIELDS.has(field)) return null
  return { idx, field }
}

/** Normaliza un draft numérico como lo hace commitNumberDraft: trim, coma→punto,
 *  vacío→0, y descarta (undefined) si no es un número finito ≥ 0. */
function parseNumberDraft(raw: string): number | undefined {
  const s = (raw || '').trim().replace(',', '.')
  const num = s === '' ? 0 : Number(s)
  if (!isFinite(num) || num < 0) return undefined
  return num
}

/**
 * Pliega TODOS los borradores pendientes en UN solo array operativas (evita
 * dos PATCH pisándose cuando el usuario tocó varias fechas antes de cerrar).
 *
 * Es PURA: no toca el DOM ni pregunta (window.confirm). La regla "salida antes
 * de llegada" se resuelve afuera — el caller pasa en `skipSalidaIdx` los índices
 * cuyo SALIDA el usuario decidió NO guardar, y `salidaWarnings` lista los que
 * requieren confirmación para que el caller pueda preguntar y recomputar.
 *
 * Devuelve `next=null` cuando no hay nada efectivo que comitear.
 */
export function computeFlush(
  cntrs: string[],
  existing: OperativasRecord[],
  op: UnifiedOperation,
  drafts: Record<string, string>,
  skipSalidaIdx: ReadonlySet<number> = new Set()
): {
  next: OperativasRecord[] | null
  salidaWarnings: { idx: number; cntr: string; salida: string; eta: string }[]
  /** SALIDA cambiada sin tocar el arribo fiscal: la llegada normal es salida+2
   *  (fin de semana → lunes). El caller pregunta y, si acepta, agrega el draft
   *  de ETA_FISC y recomputa (regla Brian 13/08). */
  fiscalSuggestions: { idx: number; cntr: string; salida: string; sugerida: string; actual: string }[]
} {
  // patch acumulado por índice de contenedor
  const patchByIdx = new Map<number, Partial<Pick<OperativasRecord, FlushField>>>()
  const salidaWarnings: { idx: number; cntr: string; salida: string; eta: string }[] = []
  const fiscalSuggestions: { idx: number; cntr: string; salida: string; sugerida: string; actual: string }[] = []

  for (const [key, rawValue] of Object.entries(drafts)) {
    const parsed = parseDraftKey(key)
    if (!parsed) continue
    const { idx, field } = parsed
    if (idx >= cntrs.length) continue // draft huérfano (contenedor removido)

    if (field === 'SALIDA') {
      if (skipSalidaIdx.has(idx)) continue // el usuario eligió no guardar esta salida
      const rec = resolveRecord(cntrs, existing, idx, op)
      const eta = etaVigente(op.eta, rec.ETA_OP)
      if (avisoSalida(rawValue, eta, rec.OPERATIVA || op.operativa)) {
        salidaWarnings.push({ idx, cntr: cntrs[idx], salida: rawValue, eta })
      }
      const acc = patchByIdx.get(idx) || {}
      acc.SALIDA = rawValue
      patchByIdx.set(idx, acc)
      // ¿Cambió la salida sin tocar el arribo fiscal en el mismo flush? Sugerir
      // la llegada normal. Si el usuario también editó ETA_FISC, eligió él.
      const tocoFiscal = Object.keys(drafts).some(k => {
        const p2 = parseDraftKey(k)
        return p2?.idx === idx && p2.field === 'ETA_FISC'
      })
      if (!tocoFiscal && rawValue !== (rec.SALIDA || '').trim()) {
        const sugerida = sugerirEtaFiscal(rawValue)
        const actual = (rec.ETA_FISC || '').trim()
        if (sugerida && sugerida !== actual) {
          fiscalSuggestions.push({ idx, cntr: cntrs[idx], salida: rawValue, sugerida, actual })
        }
      }
      continue
    }

    if (field === 'ETA_FISC') {
      const acc = patchByIdx.get(idx) || {}
      acc.ETA_FISC = rawValue
      patchByIdx.set(idx, acc)
      continue
    }

    // numérico (PKGS/KG/M3)
    const num = parseNumberDraft(rawValue)
    if (num === undefined) continue // basura tipeada → no comitear ese campo
    const acc = patchByIdx.get(idx) || {}
    acc[field] = num
    patchByIdx.set(idx, acc)
  }

  if (patchByIdx.size === 0) return { next: null, salidaWarnings, fiscalSuggestions }

  // Un solo array: parte de resolveRecord por índice y superpone TODOS los
  // patches acumulados (preserva hermanos y campos no tocados, igual que
  // buildNextOperativas pero para múltiples índices a la vez).
  const next = cntrs.map((_, i) => {
    const base = resolveRecord(cntrs, existing, i, op)
    const patch = patchByIdx.get(i)
    return patch ? { ...base, ...patch } : base
  })
  return { next, salidaWarnings, fiscalSuggestions }
}

const ContainerDatesSection = forwardRef<ContainerDatesHandle, {
  op: UnifiedOperation
  editable: boolean
  onCommitOperativas: (next: OperativasRecord[]) => void
}>(function ContainerDatesSection({
  op,
  editable,
  onCommitOperativas,
}, ref) {
  // Los hooks SIEMPRE primero, antes de cualquier return temprano (regla de hooks de React).
  // Fix 3: local draft state so date inputs commit on onBlur, not per-keystroke.
  // Key: `${cntr}-SALIDA` or `${cntr}-ETA_FISC`; value: string draft.
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const cntrs = parseCntr(op.cntr)

  // flush(): comitea TODOS los borradores pendientes en un solo array. Lo llama
  // el panel al cerrar el Sheet (onOpenChange(false)) ANTES de desmontar, así el
  // arribo fiscal / salida recién elegidos en el calendario nativo no se pierden
  // (el onBlur no llega a dispararse al cerrar con la X / Escape / click afuera).
  // Corre mientras el componente sigue montado → el confirm de SALIDA funciona.
  // Ojo: aunque haya returns tempranos abajo, el hook va SIEMPRE primero.
  useImperativeHandle(ref, () => ({
    flush: () => {
      if (!editable) return false
      const existingNow = op.operativas || []
      const skip = new Set<number>()
      // Resolver los avisos "salida antes de llegada" con confirm; si el usuario
      // rechaza alguno, se excluye ese índice y se recomputa (una sola pasada:
      // todos los confirmes se responden antes del commit).
      const primera = computeFlush(cntrs, existingNow, op, drafts, skip)
      let next = primera.next
      const salidaWarnings = primera.salidaWarnings
      if (salidaWarnings.length > 0) {
        for (const w of salidaWarnings) {
          const ok = window.confirm(
            `⏰ La salida (${fmtDMY(w.salida)}) del contenedor ${w.cntr} queda ANTES de la llegada a MVD (${fmtDMY(w.eta)}).\n\n¿Guardar igual?`
          )
          if (!ok) skip.add(w.idx)
        }
      }
      // Salida movida sin tocar el fiscal → ofrecer la llegada normal (salida+2,
      // fin de semana → lunes). Si acepta, se agrega como draft y se recomputa
      // junto con los skips en UNA pasada (regla Brian 13/08).
      const draftsFinal = { ...drafts }
      let agregoFiscal = false
      for (const f of primera.fiscalSuggestions) {
        if (skip.has(f.idx)) continue
        // .trim(): con fiscal legacy no-ISO nombreDia da '' → evita "(ahora:  CONFIRMAR)"
        const actualTxt = f.actual ? `${nombreDia(f.actual)} ${fmtDMY(f.actual)}`.trim() : 'sin fecha'
        const ok = window.confirm(
          `🚛 ${f.cntr}: la salida queda el ${nombreDia(f.salida)} ${fmtDMY(f.salida)}.\n\n` +
          `¿Llevar la llegada a fiscal al ${nombreDia(f.sugerida)} ${fmtDMY(f.sugerida)}? (ahora: ${actualTxt})`
        )
        if (ok) {
          draftsFinal[`${cntrs[f.idx]}-${f.idx}-ETA_FISC`] = f.sugerida
          agregoFiscal = true
        }
      }
      if (skip.size > 0 || agregoFiscal) {
        ;({ next } = computeFlush(cntrs, existingNow, op, draftsFinal, skip))
      }
      setDrafts({}) // limpiar SIEMPRE (incluye los rechazados: se descartan)
      if (!next) return false
      // Aviso (no bloquea): quedó una salida coordinada con el telex sin liberar.
      const flushedSalida = Object.entries(drafts).some(([k, v]) => k.endsWith('-SALIDA') && (v || '').trim())
      if (flushedSalida && isSinTelex(op.tlx)) {
        toast.warning(`🚨 ${op.ref} — ${SIN_TELEX_MSG}`)
      }
      onCommitOperativas(next)
      return true
    },
  }), [editable, op, cntrs, drafts, onCommitOperativas])

  // Si no hay contenedores, no hay nada que mostrar.
  if (cntrs.length === 0) return null

  // Solo relevante para FCL (o DB rows con modo fcl).
  if (op.mode !== 'fcl') return null

  const existing = op.operativas || []

  const draftKey = (i: number, field: string) => `${cntrs[i]}-${i}-${field}`

  const getDraft = (i: number, field: string, committed: string) => {
    const k = draftKey(i, field)
    return k in drafts ? drafts[k] : committed
  }

  const setDraft = (i: number, field: string, value: string) => {
    setDrafts(prev => ({ ...prev, [draftKey(i, field)]: value }))
  }

  const commitDraft = (i: number, field: 'SALIDA' | 'ETA_FISC') => {
    const k = draftKey(i, field)
    if (!(k in drafts)) return
    const value = drafts[k]
    // El guardado normal pasa por acá (onBlur/Enter), NO por flush() — flush solo
    // ve drafts cuyo blur nunca llegó a disparar (cierre por click afuera). Por
    // eso la sugerencia de fiscal tiene que vivir acá también, no solo en flush.
    let patch: Partial<Pick<OperativasRecord, 'SALIDA' | 'ETA_FISC'>> =
      field === 'SALIDA' ? { SALIDA: value } : { ETA_FISC: value }
    if (field === 'SALIDA') {
      const rec = resolveRecord(cntrs, existing, i, op)
      // La salida no puede ser anterior a la llegada a MVD: avisar y pedir confirmación.
      const eta = etaVigente(op.eta, rec.ETA_OP)
      if (isSalidaBeforeArrival(value, eta)) {
        const ok = window.confirm(
          `⏰ La salida (${fmtDMY(value)}) del contenedor ${cntrs[i]} queda ANTES de la llegada a MVD (${fmtDMY(eta)}).\n\n¿Guardar igual?`
        )
        if (!ok) {
          setDrafts(prev => { const next = { ...prev }; delete next[k]; return next }) // revertir, no guardar
          return
        }
      }
      // Salida movida sin tocar el arribo fiscal → ofrecer la llegada normal
      // (salida+2, finde → lunes). Si hay draft de ETA_FISC pendiente o el
      // usuario dejó la misma fecha, no molestar. Si acepta, UN solo patch con
      // las dos fechas (evita doble escritura).
      const tocoFiscal = draftKey(i, 'ETA_FISC') in drafts
      if (!tocoFiscal && value !== (rec.SALIDA || '').trim()) {
        const sugerida = sugerirEtaFiscal(value)
        const actual = (rec.ETA_FISC || '').trim()
        if (sugerida && sugerida !== actual) {
          const actualTxt = actual ? `${nombreDia(actual)} ${fmtDMY(actual)}`.trim() : 'sin fecha'
          const ok = window.confirm(
            `🚛 ${cntrs[i]}: la salida queda el ${nombreDia(value)} ${fmtDMY(value)}.\n\n` +
            `¿Llevar la llegada a fiscal al ${nombreDia(sugerida)} ${fmtDMY(sugerida)}? (ahora: ${actualTxt})`
          )
          if (ok) patch = { SALIDA: value, ETA_FISC: sugerida }
        }
      }
    }
    setDrafts(prev => { const next = { ...prev }; delete next[k]; return next })
    // Aviso (no bloquea): se coordinó una salida pero el telex sigue sin liberar.
    if (field === 'SALIDA' && value.trim() && isSinTelex(op.tlx)) {
      toast.warning(`🚨 ${op.ref} — ${SIN_TELEX_MSG}`)
    }
    onCommitOperativas(buildNextOperativas(cntrs, existing, op, i, patch))
  }

  // Fix 3: LUGAR_SALIDA is a discrete pick — commit onChange (no draft needed).
  // Lugar de salida = decisión de la CARGA (regla Brian 07/07): se propaga a
  // TODOS los contenedores, y si es un depósito también actualiza DEPOSITO
  // ("manda Depósito UY" — la columna la materializa el rollup). Base: una
  // entrada por contenedor (reconcilia por si el array estaba corto).
  const handleLugarChange = (_i: number, value: string) => {
    const base = cntrs.map((_, j) => resolveRecord(cntrs, existing, j, op))
    onCommitOperativas(applyLugarSalida(base, value))
  }

  // Bultos/Kg/M³ por contenedor: inputs numéricos, commit onBlur. El total
  // (Peso/Volumen/Bultos de arriba) pasa a ser la SUMA de los contenedores
  // (se recalcula en el rollup al escribir el array operativas).
  const commitNumberDraft = (i: number, field: 'PKGS' | 'KG' | 'M3') => {
    const k = draftKey(i, field)
    if (!(k in drafts)) return
    const raw = (drafts[k] || '').trim().replace(',', '.')
    setDrafts(prev => { const next = { ...prev }; delete next[k]; return next })
    const num = raw === '' ? 0 : Number(raw)
    if (!isFinite(num) || num < 0) return
    onCommitOperativas(buildNextOperativas(cntrs, existing, op, i, { [field]: num }))
  }

  // Totales (suma de los contenedores) — se muestran al pie como confirmación.
  const totals = cntrs.reduce(
    (acc, _c, i) => {
      const r = resolveRecord(cntrs, existing, i, op)
      acc.pkgs += Number(r.PKGS) || 0
      acc.kg += Number(r.KG) || 0
      acc.m3 += Number(r.M3) || 0
      return acc
    },
    { pkgs: 0, kg: 0, m3: 0 }
  )
  const nf = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 })

  return (
    // Identidad de color: celeste como "Fechas" (son las fechas por contenedor).
    <section className="rounded-lg border border-sky-200 bg-sky-50/60 p-3">
      <div className="flex items-center justify-between mb-3">
        <h4 className="flex-1 text-[10px] uppercase tracking-wide font-semibold text-sky-700">
          Salidas y arribos por contenedor ({cntrs.length})
        </h4>
      </div>

      <div className="space-y-3">
        {cntrs.map((cntr, i) => {
          const rec = resolveRecord(cntrs, existing, i, op)
          const status = microStatus(op, rec)

          return (
            <div
              key={`${cntr}-${i}`}
              className="rounded-md border border-sky-200/80 bg-card px-2.5 py-2 space-y-2"
            >
              {/* Cabecera: código de contenedor + micro-status */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-mono font-medium text-foreground truncate" title={cntr}>
                  {cntr}
                </span>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0" title="Estado calculado según las fechas del contenedor (no se edita)">
                  {status}
                </span>
              </div>

              {/* Campos en grilla de 3 columnas (entra en el panel sin cortarse) */}
              <div className="grid grid-cols-3 gap-x-2 gap-y-1.5">
                {/* Salida MVD */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground leading-none">Salida MVD</span>
                  {editable ? (
                    <input
                      type="date"
                      value={getDraft(i, 'SALIDA', rec.SALIDA || '')}
                      onChange={e => setDraft(i, 'SALIDA', e.target.value)}
                      onBlur={() => commitDraft(i, 'SALIDA')}
                      onKeyDown={e => { if (e.key === 'Enter') commitDraft(i, 'SALIDA') }}
                      className="h-9 w-full rounded border border-input bg-background px-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  ) : (
                    <span className={`text-[13px] font-medium ${rec.SALIDA ? '' : 'text-muted-foreground'}`}>
                      {rec.SALIDA || '—'}
                    </span>
                  )}
                  {(() => {
                    const aviso = avisoSalida(getDraft(i, 'SALIDA', rec.SALIDA || ''), etaVigente(op.eta, rec.ETA_OP), rec.OPERATIVA || op.operativa)
                    if (!aviso) return null
                    const grave = isSalidaBeforeArrival(getDraft(i, 'SALIDA', rec.SALIDA || ''), etaVigente(op.eta, rec.ETA_OP))
                    return (
                      <span className={`text-[10px] font-medium leading-tight ${grave ? 'text-red-600' : 'text-amber-600'}`}>
                        ⏰ {aviso}
                      </span>
                    )
                  })()}
                </div>

                {/* Arribo fiscal */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground leading-none">Arribo fiscal</span>
                  {editable ? (
                    <input
                      type="date"
                      value={getDraft(i, 'ETA_FISC', rec.ETA_FISC || '')}
                      onChange={e => setDraft(i, 'ETA_FISC', e.target.value)}
                      onBlur={() => commitDraft(i, 'ETA_FISC')}
                      onKeyDown={e => { if (e.key === 'Enter') commitDraft(i, 'ETA_FISC') }}
                      className="h-9 w-full rounded border border-input bg-background px-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  ) : (
                    <span className={`text-[13px] font-medium ${rec.ETA_FISC ? '' : 'text-muted-foreground'}`}>
                      {rec.ETA_FISC || '—'}
                    </span>
                  )}
                  {/* Llegada atípica (regla 13/08): sábado = pedido del cliente ·
                      martes = cliente o lunes feriado. Se marca, no se bloquea. */}
                  {(() => {
                    const a = llegadaFiscalAtipica(
                      editable ? getDraft(i, 'ETA_FISC', rec.ETA_FISC || '') : (rec.ETA_FISC || ''),
                    )
                    return a ? (
                      <span className="text-[10px] font-medium leading-tight text-amber-600" title={a.motivo}>
                        📌 {a.motivo}
                      </span>
                    ) : null
                  })()}
                </div>

                {/* Lugar de salida — discrete pick: commit onChange. Default de
                    LECTURA: lugar vacío → muestra el DEPÓSITO ("manda Depósito UY",
                    bug 10/07: decía "en terminal" con depósito cargado). Se
                    materializa recién cuando el usuario elige. */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground leading-none">Lugar de salida</span>
                  {editable ? (
                    <select
                      value={lugarOrDeposito(rec.LUGAR_SALIDA, rec.DEPOSITO)}
                      onChange={e => handleLugarChange(i, e.target.value)}
                      className="h-9 w-full rounded border border-input bg-background px-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {LUGAR_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                      {/* Depósito fuera de la lista fija (ej. LOBRAUS) → opción dinámica */}
                      {lugarOrDeposito(rec.LUGAR_SALIDA, rec.DEPOSITO) &&
                        !LUGAR_OPTIONS.some(o => o.value === lugarOrDeposito(rec.LUGAR_SALIDA, rec.DEPOSITO)) && (
                          <option value={lugarOrDeposito(rec.LUGAR_SALIDA, rec.DEPOSITO)}>
                            {lugarOrDeposito(rec.LUGAR_SALIDA, rec.DEPOSITO)}
                          </option>
                        )}
                    </select>
                  ) : (
                    <span className={`text-[13px] font-medium ${lugarOrDeposito(rec.LUGAR_SALIDA, rec.DEPOSITO) ? '' : 'text-muted-foreground'}`}>
                      {lugarOrDeposito(rec.LUGAR_SALIDA, rec.DEPOSITO) || '—'}
                    </span>
                  )}
                </div>

                {/* Bultos por contenedor */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground leading-none">Bultos</span>
                  {editable ? (
                    <input
                      type="number" inputMode="numeric" min="0"
                      value={getDraft(i, 'PKGS', rec.PKGS ? String(rec.PKGS) : '')}
                      onChange={e => setDraft(i, 'PKGS', e.target.value)}
                      onBlur={() => commitNumberDraft(i, 'PKGS')}
                      onKeyDown={e => { if (e.key === 'Enter') commitNumberDraft(i, 'PKGS') }}
                      className="h-9 w-full rounded border border-input bg-background px-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  ) : (
                    <span className={`text-[13px] font-medium ${rec.PKGS ? '' : 'text-muted-foreground'}`}>
                      {rec.PKGS ? nf.format(Number(rec.PKGS)) : '—'}
                    </span>
                  )}
                </div>

                {/* Kg por contenedor */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground leading-none">Kg</span>
                  {editable ? (
                    <input
                      type="number" inputMode="decimal" min="0"
                      value={getDraft(i, 'KG', rec.KG ? String(rec.KG) : '')}
                      onChange={e => setDraft(i, 'KG', e.target.value)}
                      onBlur={() => commitNumberDraft(i, 'KG')}
                      onKeyDown={e => { if (e.key === 'Enter') commitNumberDraft(i, 'KG') }}
                      className="h-9 w-full rounded border border-input bg-background px-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  ) : (
                    <span className={`text-[13px] font-medium ${rec.KG ? '' : 'text-muted-foreground'}`}>
                      {rec.KG ? nf.format(Number(rec.KG)) : '—'}
                    </span>
                  )}
                </div>

                {/* M³ por contenedor */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground leading-none">M³</span>
                  {editable ? (
                    <input
                      type="number" inputMode="decimal" min="0" step="0.01"
                      value={getDraft(i, 'M3', rec.M3 ? String(rec.M3) : '')}
                      onChange={e => setDraft(i, 'M3', e.target.value)}
                      onBlur={() => commitNumberDraft(i, 'M3')}
                      onKeyDown={e => { if (e.key === 'Enter') commitNumberDraft(i, 'M3') }}
                      className="h-9 w-full rounded border border-input bg-background px-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  ) : (
                    <span className={`text-[13px] font-medium ${rec.M3 ? '' : 'text-muted-foreground'}`}>
                      {rec.M3 ? nf.format(Number(rec.M3)) : '—'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Total = suma de los contenedores (el bloque Peso/Volumen/Bultos de arriba
          muestra esta misma suma). */}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 border-t pt-2 text-[11px] text-muted-foreground">
        <span>Total: <b className="text-foreground">{nf.format(totals.pkgs)}</b> bultos</span>
        <span><b className="text-foreground">{nf.format(totals.kg)}</b> kg</span>
        <span><b className="text-foreground">{nf.format(totals.m3)}</b> m³</span>
      </div>
    </section>
  )
})

export default ContainerDatesSection
