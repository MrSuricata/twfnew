// ContainerQuickEdit — Radix Popover para editar las fechas de UN contenedor.
// Salida MVD + Arribo fiscal + Lugar. Botón "Más datos →" abre el panel completo.

import { useState } from 'react'
import { X } from '@phosphor-icons/react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverAnchor,
} from '@/components/ui/popover'
import type { ParsedShipment, OperativasRecord } from '@/lib/shipmentTypes'
import { getShipmentStatus } from '@/lib/shipmentTypes'

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

// ─── Props ────────────────────────────────────────────────────────────────

export interface ContainerQuickEditProps {
  shipment: ParsedShipment
  cntr: string
  editable: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  /** trigger element — wrap it with PopoverTrigger or use anchorRef */
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
  children,
  onPatch,
  onMasDatos,
  onSaved,
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

  const canSave = editable && !!shipment.__dbId

  const commitSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const next = buildPatchedOperativas(shipment, cntr, {
        SALIDA: drafts.salida,
        ETA_FISC: drafts.etaFisc,
        LUGAR_SALIDA: lugar,
      })
      await onPatch(shipment.__dbId!, { operativas: next })
      onSaved?.()
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void commitSave()
    if (e.key === 'Escape') onOpenChange(false)
  }

  const status = containerMicroStatus(shipment, {
    ...currentOp,
    SALIDA: drafts.salida,
    ETA_FISC: drafts.etaFisc,
    LUGAR_SALIDA: lugar,
  })

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {children ? (
        <PopoverTrigger asChild>{children}</PopoverTrigger>
      ) : (
        <PopoverAnchor />
      )}
      <PopoverContent
        className="w-80 p-0 shadow-lg"
        align="start"
        sideOffset={6}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-3 py-2 bg-muted/40">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[12px] font-semibold text-foreground truncate">
              {shipment.REF}
            </span>
            <span className="text-[11px] font-mono text-muted-foreground truncate">
              {cntr}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-muted-foreground">{status}</span>
            <button
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Cerrar"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Fields */}
        <div className="px-3 pt-3 pb-2 space-y-2.5">
          {/* Salida MVD */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
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
                className="h-8 w-full rounded border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
              />
            ) : (
              <span className={`text-sm font-medium ${drafts.salida ? '' : 'text-muted-foreground'}`}>
                {drafts.salida || '—'}
              </span>
            )}
          </div>

          {/* Arribo fiscal */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
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
                className="h-8 w-full rounded border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
              />
            ) : (
              <span className={`text-sm font-medium ${drafts.etaFisc ? '' : 'text-muted-foreground'}`}>
                {drafts.etaFisc || '—'}
              </span>
            )}
          </div>

          {/* Lugar */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Lugar
            </label>
            {editable ? (
              <select
                value={lugar}
                onChange={e => {
                  setLugar(e.target.value)
                  // Lugar is discrete — commit immediately on change
                  const next = buildPatchedOperativas(shipment, cntr, {
                    SALIDA: drafts.salida,
                    ETA_FISC: drafts.etaFisc,
                    LUGAR_SALIDA: e.target.value,
                  })
                  if (shipment.__dbId) {
                    void onPatch(shipment.__dbId, { operativas: next })
                  }
                }}
                disabled={saving || !shipment.__dbId}
                className="h-8 w-full rounded border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
              >
                {LUGAR_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              <span className={`text-sm font-medium ${lugar ? '' : 'text-muted-foreground'}`}>
                {(LUGAR_OPTIONS.find(o => o.value === lugar)?.label ?? lugar) || '—'}
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-3 py-2">
          {!shipment.__dbId && (
            <span className="text-[11px] text-destructive">Sin ID DB — edición no disponible</span>
          )}
          <div className="ml-auto flex gap-2">
            <button
              onClick={onMasDatos}
              className="text-[12px] text-primary hover:underline font-medium"
            >
              Más datos →
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
