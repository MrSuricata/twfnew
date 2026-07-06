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
        <span className="text-[10px] uppercase tracking-wide font-semibold text-sky-700">
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
              className="rounded-md border border-sky-200/80 bg-card px-2.5 py-2 space-y-2"
            >
              {/* Cabecera: código de contenedor + micro-status */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-mono font-medium text-foreground truncate" title={cntr}>
                  {cntr}
                </span>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0" title="Estado derivado">
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
                      className="h-9 w-full rounded border border-input bg-background px-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
                      className="h-9 w-full rounded border border-input bg-background px-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
}
