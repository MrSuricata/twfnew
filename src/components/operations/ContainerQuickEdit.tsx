// ContainerQuickEdit — centered modal Dialog para editar las fechas de UN contenedor.
// Salida MVD + Arribo fiscal + Lugar. Botón "Más datos →" abre el panel completo.
// Convertido de Popover a Dialog (2026-06) — centrado en pantalla, visualmente limpio.

import { useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import type { ParsedShipment, OperativasRecord } from '@/lib/shipmentTypes'
import { getShipmentStatus } from '@/lib/shipmentTypes'
import { isSalidaBeforeArrival, fmtDMY } from '@/lib/salidaCheck'

// ─── Lugar options (mirrors ContainerDatesSection) ────────────────────────

const LUGAR_OPTIONS = [
  { value: '', label: '— en terminal —' },
  { value: 'TCP', label: 'TCP' },
  { value: 'MONTECON', label: 'MONTECON' },
  { value: 'GODILCO', label: 'GODILCO' },
  { value: 'PLANIR', label: 'PLANIR' },
]

// ─── Local save-array helper ──────────────────────────────────────────────

/**
 * Builds the updated operativas array patching only the container matching
 * `cntr` by CNTR_OP. Does not require a UnifiedOperation — works from the
 * ParsedShipment directly, preserving all other records untouched.
 *
 * If no record exists for `cntr` a new minimal record is appended.
 * This mirrors the CNTR_OP-first approach of resolveRecord/buildNextOperativas
 * from ContainerDatesSection without needing a UnifiedOperation.
 */
export function buildPatchedOperativas(
  shipment: ParsedShipment,
  cntr: string,
  patch: Partial<Pick<OperativasRecord, 'SALIDA' | 'ETA_FISC' | 'LUGAR_SALIDA'>>
): OperativasRecord[] {
  const existing = shipment.operativas || []
  const key = cntr.trim().toUpperCase()
  const matched = existing.find(r => (r.CNTR_OP || '').trim().toUpperCase() === key)

  if (matched) {
    return existing.map(r =>
      (r.CNTR_OP || '').trim().toUpperCase() === key
        ? { ...r, ...patch }
        : r
    )
  }

  // No existing record for this container — append a new minimal one
  const newRecord: OperativasRecord = {
    REF: shipment.REF,
    TLX: '',
    DEPOSITO: '',
    ETA_OP: shipment.ETA || '',
    SALIDA: '',
    ETA_FISC: '',
    LIBRE: shipment.calculatedLibreHasta || '',
    OPERATIVA: '',
    CNTR_OP: cntr,
    PKGS: 0,
    KG: 0,
    M3: 0,
    DESCRIPCION: '',
    FISCAL: '',
    DESCARGA: '',
    DEV: '',
    CLIENTE_OP: shipment.CLIENTE || '',
    TIPO: shipment.TIPO || '',
    WOOD: '',
    TRANSPORTE: '',
    HORARIO: '',
    LUGAR_SALIDA: '',
    ...patch,
  }
  return [...existing, newRecord]
}

// ─── Micro-status for a single container ─────────────────────────────────

function containerMicroStatus(shipment: ParsedShipment, op: OperativasRecord): string {
  const mini: ParsedShipment = {
    ...shipment,
    operativas: [op],
  }
  return getShipmentStatus(mini).label
}

// ─── Status badge color ───────────────────────────────────────────────────

function statusBadgeClass(label: string): string {
  const l = label.toLowerCase()
  if (l.includes('fiscal') || l.includes('devuelto')) return 'bg-green-100 text-green-700'
  if (l.includes('hoy') || l.includes('salió')) return 'bg-blue-100 text-blue-700'
  if (l.includes('frontera')) return 'bg-orange-100 text-orange-700'
  if (l.includes('embarcado') || l.includes('viaje')) return 'bg-sky-100 text-sky-700'
  return 'bg-slate-100 text-slate-600'
}

// ─── Props ────────────────────────────────────────────────────────────────

export interface ContainerQuickEditProps {
  shipment: ParsedShipment
  cntr: string
  editable: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Unused in Dialog mode — kept for API compatibility with call sites. */
  children?: React.ReactNode
  onPatch: (dbId: string, fields: Record<string, unknown>) => void | Promise<void>
  onMasDatos: () => void
  onSaved?: () => void
}

// ─── Component ────────────────────────────────────────────────────────────

export default function ContainerQuickEdit({
  shipment,
  cntr,
  editable,
  open,
  onOpenChange,
  onPatch,
  onMasDatos,
}: ContainerQuickEditProps) {
  // Resolve the current op for this container
  const existing = shipment.operativas || []
  const key = cntr.trim().toUpperCase()
  const currentOp: OperativasRecord = existing.find(
    r => (r.CNTR_OP || '').trim().toUpperCase() === key
  ) ?? {
    REF: shipment.REF,
    TLX: '', DEPOSITO: '', ETA_OP: shipment.ETA || '',
    SALIDA: '', ETA_FISC: '', LIBRE: shipment.calculatedLibreHasta || '',
    OPERATIVA: '', CNTR_OP: cntr, PKGS: 0, KG: 0, M3: 0, DESCRIPCION: '',
    FISCAL: '', DESCARGA: '', DEV: '', CLIENTE_OP: shipment.CLIENTE || '',
    TIPO: shipment.TIPO || '', WOOD: '', TRANSPORTE: '', HORARIO: '',
    LUGAR_SALIDA: '',
  }

  // Draft state for date inputs (commit on blur/Enter)
  const [drafts, setDrafts] = useState<{ salida: string; etaFisc: string }>({
    salida: currentOp.SALIDA || '',
    etaFisc: currentOp.ETA_FISC || '',
  })
  const [lugar, setLugar] = useState<string>(currentOp.LUGAR_SALIDA || '')
  const [saving, setSaving] = useState(false)

  // Fix 2: guard against double-save (Enter+blur fires two commitSave calls).
  // We track the last-committed serialized value; commitSave is a no-op when
  // nothing changed since the last successful persist.
  // Init to the CURRENT values so a blur without edits (e.g. clicking from the
  // auto-focused Salida MVD to another field) is a true no-op — no spurious patch.
  const lastCommittedRef = useRef<string>(
    JSON.stringify({
      salida: currentOp.SALIDA || '',
      etaFisc: currentOp.ETA_FISC || '',
      lugar: currentOp.LUGAR_SALIDA || '',
    })
  )

  const canSave = editable && !!shipment.__dbId
  // Llegada de la carga a MVD para este contenedor (per-op, si no la de la carga).
  const etaArrival = currentOp.ETA_OP || shipment.ETA || ''

  /**
   * Commit the current draft values to the DB.
   * Accepts explicit overrides so the lugar onChange can pass the NEW lugar
   * value before the useState update has settled (Fix 3).
   * Returns early if nothing changed since the last commit (Fix 2).
   */
  const commitSave = async (
    overrides?: { salida?: string; etaFisc?: string; lugar?: string }
  ) => {
    if (!canSave) return
    const salida = overrides?.salida ?? drafts.salida
    const etaFisc = overrides?.etaFisc ?? drafts.etaFisc
    const lugarVal = overrides?.lugar ?? lugar
    const serialized = JSON.stringify({ salida, etaFisc, lugar: lugarVal })
    if (serialized === lastCommittedRef.current) return // no change → skip
    // Solo al COORDINAR la salida (cuando la fecha de salida CAMBIÓ): no puede ser
    // anterior a la llegada a MVD → avisar y pedir confirmación. Editar arribo/lugar
    // con una salida ya puesta NO vuelve a preguntar.
    let prevSalida = ''
    try { prevSalida = (JSON.parse(lastCommittedRef.current).salida as string) || '' } catch { /* sin commit previo */ }
    if (salida !== prevSalida && isSalidaBeforeArrival(salida, etaArrival)) {
      const ok = window.confirm(
        `⏰ La salida de MVD (${fmtDMY(salida)}) queda ANTES de la llegada de la carga a MVD (${fmtDMY(etaArrival)}).\n\n¿Guardar igual?`
      )
      if (!ok) {
        setDrafts(d => ({ ...d, salida: prevSalida })) // revertir a la última salida confirmada, no guardar
        return
      }
    }
    setSaving(true)
    try {
      const next = buildPatchedOperativas(shipment, cntr, {
        SALIDA: salida,
        ETA_FISC: etaFisc,
        LUGAR_SALIDA: lugarVal,
      })
      await onPatch(shipment.__dbId!, { operativas: next })
      lastCommittedRef.current = serialized
      // NO cerrar al guardar: el usuario edita varios campos (salida → arribo →
      // lugar) en el mismo modal. El cierre lo manejan "Listo" y Escape. Cerrar
      // en cada commit (vía onBlur) hacía que al pasar de un campo a otro se
      // cerrara el diálogo.
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void commitSave()
    // Escape is handled natively by the Dialog (Radix closes on Escape)
  }

  const status = containerMicroStatus(shipment, {
    ...currentOp,
    SALIDA: drafts.salida,
    ETA_FISC: drafts.etaFisc,
    LUGAR_SALIDA: lugar,
  })

  const lugarLabel = LUGAR_OPTIONS.find(o => o.value === lugar)?.label ?? lugar

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm w-[calc(100%-2rem)] p-0 gap-0 overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="px-5 pt-5 pb-4 border-b bg-[#1e3a8a]/5">
          {/* REF + CNTR row */}
          <div className="flex items-baseline gap-2 min-w-0 mb-2">
            <span className="text-[15px] font-bold text-foreground leading-none">
              {shipment.REF}
            </span>
            <span className="text-[12px] font-mono text-muted-foreground truncate">
              {cntr}
            </span>
          </div>
          {/* Micro-status chip */}
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusBadgeClass(status)}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
            {status}
          </span>
        </div>

        {/* ── Fields ─────────────────────────────────────────────────── */}
        <div className="px-5 pt-4 pb-3 space-y-3.5">
          {/* Salida MVD */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Salida MVD
            </label>
            {editable ? (
              <input
                type="date"
                value={drafts.salida}
                onChange={e => setDrafts(d => ({ ...d, salida: e.target.value }))}
                onBlur={() => void commitSave()}
                onKeyDown={e => { if (e.key === 'Enter') void commitSave() }}
                disabled={saving}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/40 disabled:opacity-50 transition-shadow"
              />
            ) : (
              <span className={`text-sm font-medium ${drafts.salida ? 'text-foreground' : 'text-muted-foreground'}`}>
                {drafts.salida || '—'}
              </span>
            )}
            {isSalidaBeforeArrival(drafts.salida, etaArrival) && (
              <span className="text-[11px] font-medium text-red-600">
                ⏰ Anterior a la llegada a MVD ({fmtDMY(etaArrival)})
              </span>
            )}
          </div>

          {/* Arribo fiscal */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Arribo fiscal
            </label>
            {editable ? (
              <input
                type="date"
                value={drafts.etaFisc}
                onChange={e => setDrafts(d => ({ ...d, etaFisc: e.target.value }))}
                onBlur={() => void commitSave()}
                onKeyDown={e => { if (e.key === 'Enter') void commitSave() }}
                disabled={saving}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/40 disabled:opacity-50 transition-shadow"
              />
            ) : (
              <span className={`text-sm font-medium ${drafts.etaFisc ? 'text-foreground' : 'text-muted-foreground'}`}>
                {drafts.etaFisc || '—'}
              </span>
            )}
          </div>

          {/* Lugar de salida */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Lugar de salida
            </label>
            {editable ? (
              <select
                value={lugar}
                onChange={e => {
                  const newLugar = e.target.value
                  setLugar(newLugar)
                  // Fix 3: pass the new lugar explicitly so commitSave reads
                  // the just-typed draft dates (not a stale closure snapshot).
                  void commitSave({ lugar: newLugar })
                }}
                disabled={saving || !shipment.__dbId}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/40 disabled:opacity-50 transition-shadow"
              >
                {LUGAR_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              <span className={`text-sm font-medium ${lugar ? 'text-foreground' : 'text-muted-foreground'}`}>
                {lugarLabel || '—'}
              </span>
            )}
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t px-5 py-3 bg-muted/20">
          <div className="flex items-center gap-2">
            {!shipment.__dbId && (
              <span className="text-[11px] text-destructive font-medium">
                Sin ID — edición no disponible
              </span>
            )}
            {saving && (
              <span className="text-[11px] text-muted-foreground animate-pulse">
                Guardando…
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onMasDatos}
              className="text-[12px] font-semibold text-[#1e3a8a] hover:underline underline-offset-2 transition-colors"
            >
              Más datos →
            </button>
            <button
              onClick={async () => { await commitSave(); onOpenChange(false) }}
              className="px-3 py-1.5 text-[12px] font-medium rounded-md border border-input bg-background hover:bg-muted transition-colors"
            >
              {saving ? 'Cancelar' : 'Listo'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
