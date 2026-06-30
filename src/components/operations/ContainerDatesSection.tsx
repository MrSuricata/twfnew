// Sección de salidas y arribos por contenedor (Panel detalle de operación FCL).
// Se monta entre ViabilityBlock y la sección "Contenedores".
// Editable solo cuando la operación es una fila DB (FCL horneada) no read-only.

import { useState } from 'react'
import type { UnifiedOperation } from '@/lib/operationsTypes'
import type { ParsedShipment, OperativasRecord } from '@/lib/shipmentTypes'
import { getShipmentStatus } from '@/lib/shipmentTypes'
import { parseCntr } from '@/lib/cntrUtils'
import { isSalidaBeforeArrival, fmtDMY } from '@/lib/salidaCheck'

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

  // Fallback: positional match (only if no CNTR_OP is set on either side)
  const byIndex = existing[i]
  if (byIndex && !(byIndex.CNTR_OP || '').trim()) return byIndex

  // New container: synthetic blank (CNTR_OP set so future edits match by number)
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
    PKGS: 0,
    KG: 0,
    M3: 0,
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
  patch: Partial<Pick<OperativasRecord, 'SALIDA' | 'ETA_FISC' | 'LUGAR_SALIDA'>>
): OperativasRecord[] {
  return cntrs.map((_, i) => {
    const base = resolveRecord(cntrs, existing, i, op)
    if (i === idx) return { ...base, ...patch }
    return base
  })
}

export default function ContainerDatesSection({
  op,
  editable,
  onCommitOperativas,
}: {
  op: UnifiedOperation
  editable: boolean
  onCommitOperativas: (next: OperativasRecord[]) => void
}) {
  // Los hooks SIEMPRE primero, antes de cualquier return temprano (regla de hooks de React).
  // Fix 3: local draft state so date inputs commit on onBlur, not per-keystroke.
  // Key: `${cntr}-SALIDA` or `${cntr}-ETA_FISC`; value: string draft.
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const cntrs = parseCntr(op.cntr)
  // Si no hay contenedores, no hay nada que mostrar.
  if (cntrs.length === 0) return null

  // Solo relevante para FCL (o DB rows con modo fcl).
  if (op.mode !== 'fcl') return null

  const existing = op.operativas || []

  const draftKey = (i: number, field: string) => `${cntrs[i]}-${i}-${field}`

  const getDraft = (i: number, field: 'SALIDA' | 'ETA_FISC', committed: string) => {
    const k = draftKey(i, field)
    return k in drafts ? drafts[k] : committed
  }

  const setDraft = (i: number, field: 'SALIDA' | 'ETA_FISC', value: string) => {
    setDrafts(prev => ({ ...prev, [draftKey(i, field)]: value }))
  }

  const commitDraft = (i: number, field: 'SALIDA' | 'ETA_FISC') => {
    const k = draftKey(i, field)
    if (!(k in drafts)) return
    const value = drafts[k]
    // La salida no puede ser anterior a la llegada a MVD: avisar y pedir confirmación.
    if (field === 'SALIDA') {
      const rec = resolveRecord(cntrs, existing, i, op)
      const eta = rec.ETA_OP || op.eta || ''
      if (isSalidaBeforeArrival(value, eta)) {
        const ok = window.confirm(
          `⏰ La salida (${fmtDMY(value)}) del contenedor ${cntrs[i]} queda ANTES de la llegada a MVD (${fmtDMY(eta)}).\n\n¿Guardar igual?`
        )
        if (!ok) {
          setDrafts(prev => { const next = { ...prev }; delete next[k]; return next }) // revertir, no guardar
          return
        }
      }
    }
    setDrafts(prev => { const next = { ...prev }; delete next[k]; return next })
    onCommitOperativas(buildNextOperativas(cntrs, existing, op, i, { [field]: value }))
  }

  // Fix 3: LUGAR_SALIDA is a discrete pick — commit onChange (no draft needed).
  const handleLugarChange = (i: number, value: string) => {
    onCommitOperativas(buildNextOperativas(cntrs, existing, op, i, { LUGAR_SALIDA: value }))
  }

  return (
    <section className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Salidas y arribos por contenedor ({cntrs.length})
        </span>
      </div>

      <div className="space-y-3">
        {cntrs.map((cntr, i) => {
          const rec = resolveRecord(cntrs, existing, i, op)
          const status = microStatus(op, rec)

          return (
            <div
              key={`${cntr}-${i}`}
              className="grid grid-cols-[auto_1fr_1fr_1fr_auto] items-center gap-x-2 gap-y-1 rounded-md border bg-background px-2.5 py-2"
            >
              {/* Código contenedor */}
              <span className="text-[12px] font-mono font-medium text-foreground min-w-[110px] truncate" title={cntr}>
                {cntr}
              </span>

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
                    className="h-7 rounded border border-input bg-background px-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                ) : (
                  <span className={`text-[13px] font-medium ${rec.SALIDA ? '' : 'text-muted-foreground'}`}>
                    {rec.SALIDA || '—'}
                  </span>
                )}
                {isSalidaBeforeArrival(getDraft(i, 'SALIDA', rec.SALIDA || ''), rec.ETA_OP || op.eta || '') && (
                  <span className="text-[10px] font-medium text-red-600 leading-tight">⏰ antes de llegada</span>
                )}
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
                    className="h-7 rounded border border-input bg-background px-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                ) : (
                  <span className={`text-[13px] font-medium ${rec.ETA_FISC ? '' : 'text-muted-foreground'}`}>
                    {rec.ETA_FISC || '—'}
                  </span>
                )}
              </div>

              {/* Lugar de salida — discrete pick: commit onChange */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground leading-none">Lugar</span>
                {editable ? (
                  <select
                    value={rec.LUGAR_SALIDA || ''}
                    onChange={e => handleLugarChange(i, e.target.value)}
                    className="h-7 rounded border border-input bg-background px-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {LUGAR_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : (
                  <span className={`text-[13px] font-medium ${rec.LUGAR_SALIDA ? '' : 'text-muted-foreground'}`}>
                    {rec.LUGAR_SALIDA || '—'}
                  </span>
                )}
              </div>

              {/* Micro-status */}
              <span className="text-[11px] text-muted-foreground text-right whitespace-nowrap min-w-[80px]" title="Estado derivado">
                {status}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
