// ContainerQuickEdit — centered modal Dialog para editar las fechas de UN contenedor.
// Salida MVD + Arribo fiscal + Lugar + Transporte. Botón "Más datos →" abre el panel completo.
// Convertido de Popover a Dialog (2026-06) — centrado en pantalla, visualmente limpio.

import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { CheckCircle, ArrowCounterClockwise } from '@phosphor-icons/react'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import type { ParsedShipment, OperativasRecord } from '@/lib/shipmentTypes'
import { getShipmentStatus } from '@/lib/shipmentTypes'
import { buildPerContainerPatch } from '@/lib/operationsTypes'
import { isSalidaBeforeArrival, fmtDMY } from '@/lib/salidaCheck'
import { fmtDateDMY } from '@/lib/format'
import { isLibreDevuelto, libreDevueltoToggle, LIBRE_DEVUELTO } from '@/lib/libreDevuelto'

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
  patch: Partial<Pick<OperativasRecord, 'SALIDA' | 'ETA_FISC' | 'LUGAR_SALIDA' | 'LIBRE'>>
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
  /** Transportes ya usados en las cargas → sugerencias del combo Transporte. */
  knownTransportes?: string[]
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
  knownTransportes = [],
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
  // LIBRE se movió a "Datos clave de la carga" (ViabilityBlock): es dato de la
  // carga, se edita a nivel carga y propaga a todos los contenedores. Acá el
  // quick-edit toca salida / arribo fiscal / lugar (por contenedor) + transporte
  // y el botón "Devuelto" sobre LIBRE (nivel-carga: ambos propagan a todos los
  // contenedores vía buildPerContainerPatch).
  const [drafts, setDrafts] = useState<{ salida: string; etaFisc: string }>({
    salida: currentOp.SALIDA || '',
    etaFisc: currentOp.ETA_FISC || '',
  })
  const [lugar, setLugar] = useState<string>(currentOp.LUGAR_SALIDA || '')
  // Transporte es dato de la CARGA: valor actual = el del contenedor o, si está
  // vacío, el primero no-vacío del array (misma semántica firstWith del rollup).
  const normTrans = (s: string) => s.trim().toUpperCase()
  const initialTransporte = normTrans(
    currentOp.TRANSPORTE || existing.find(o => o.TRANSPORTE)?.TRANSPORTE || ''
  )
  const [transporte, setTransporte] = useState<string>(initialTransporte)
  // LIBRE es nivel-carga (la FECHA se edita en Datos clave del panel; acá solo
  // display + botón "Devuelto"). Valor GUARDADO = columna LIBRE_HASTA o primera
  // operativa con LIBRE (mismo rollup firstWith de dbShipmentToOperation).
  // calculatedLibreHasta es solo display de respaldo — NO es el valor que
  // restaura "Deshacer" (ese debe ser el guardado exacto: fecha o vacío).
  const storedLibre = shipment.LIBRE_HASTA ||
    (existing.find(o => (o.LIBRE || '').trim())?.LIBRE || '')
  const [libreVal, setLibreVal] = useState<string>(storedLibre)
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
      transporte: initialTransporte,
      libre: storedLibre,
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
    overrides?: { salida?: string; etaFisc?: string; lugar?: string; transporte?: string; libre?: string }
  ) => {
    if (!canSave) return
    const salida = overrides?.salida ?? drafts.salida
    const etaFisc = overrides?.etaFisc ?? drafts.etaFisc
    const lugarVal = overrides?.lugar ?? lugar
    const transVal = normTrans(overrides?.transporte ?? transporte)
    const libreV = overrides?.libre ?? libreVal
    const serialized = JSON.stringify({ salida, etaFisc, lugar: lugarVal, transporte: transVal, libre: libreV })
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
      const fields: Record<string, unknown> = { operativas: next }
      // Transporte es nivel-carga: si cambió, propagar a TODOS los contenedores
      // + la columna rollup (REGLA: buildPerContainerPatch — el server NO
      // recalcula transporte desde el array). Mapea sobre `next`, así conserva
      // las fechas/lugar recién editados de este contenedor. Solo cuando cambió,
      // para que un ajuste de fechas no pise transportes distintos por contenedor
      // en datos históricos.
      let prevTrans = initialTransporte
      try { prevTrans = normTrans((JSON.parse(lastCommittedRef.current).transporte as string) || '') } catch { /* sin commit previo */ }
      // Las propagaciones nivel-carga se ENCADENAN sobre `propagated` (no sobre
      // `next` cada una): si transporte Y libre cambian en el mismo commit, la
      // segunda debe mapear el array ya propagado por la primera o la pisa.
      let propagated = next
      if (transVal !== prevTrans) {
        const p = buildPerContainerPatch({ operativas: propagated }, 'transporte', transVal)
        propagated = (p.operativas as OperativasRecord[] | undefined) ?? propagated
        Object.assign(fields, p)
      }
      // LIBRE también es nivel-carga ('DEVUELTO' vive en LIBRE — regla del
      // repo): si cambió, propagar a TODOS los contenedores + la columna con
      // el MISMO buildPerContainerPatch, conservando las fechas/lugar recién
      // editados de este contenedor.
      let prevLibre = storedLibre
      try { prevLibre = (JSON.parse(lastCommittedRef.current).libre as string) ?? storedLibre } catch { /* sin commit previo */ }
      if (libreV !== prevLibre) {
        const p = buildPerContainerPatch({ operativas: propagated }, 'libre', libreV)
        propagated = (p.operativas as OperativasRecord[] | undefined) ?? propagated
        Object.assign(fields, p)
      }
      await onPatch(shipment.__dbId!, fields)
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

  // Botón rápido "Devuelto" — flujo estrella: alerta LIBRE → quick-edit →
  // un click → LIBRE='DEVUELTO' (nivel-carga) → la carga sale de las alertas.
  // Va por el MISMO commitSave (guard anti doble-save incluido); el toast
  // permite deshacer restaurando el valor EXACTO anterior (fecha o vacío,
  // capturado ANTES de pisar). Con LIBRE ya DEVUELTO, el botón pasa a
  // "Deshacer devuelto" y limpia a '' (sin toast: el cambio se ve al instante).
  const devuelto = isLibreDevuelto(libreVal)
  const toggleDevuelto = async () => {
    if (!canSave || saving) return
    const { next, prev } = libreDevueltoToggle(libreVal)
    setLibreVal(next)
    await commitSave({ libre: next })
    if (next === LIBRE_DEVUELTO) {
      toast.success('Contenedor devuelto', {
        action: {
          label: 'Deshacer',
          onClick: () => { setLibreVal(prev); void commitSave({ libre: prev }) },
        },
      })
    }
  }

  const status = containerMicroStatus(shipment, {
    ...currentOp,
    SALIDA: drafts.salida,
    ETA_FISC: drafts.etaFisc,
    LUGAR_SALIDA: lugar,
  })

  const lugarLabel = LUGAR_OPTIONS.find(o => o.value === lugar)?.label ?? lugar
  // Id único por carga para el datalist (puede haber más de un quick-edit montado).
  // Sin espacios: las refs split ("A6902 A") no son un id HTML válido.
  const transporteListId = `qe-transportes-${(shipment.REF || 'x').replace(/\s+/g, '-')}`

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

          {/* Transporte — dato de la CARGA (propaga a todos los contenedores).
              Combo editable: sugiere los ya usados (datalist) + acepta uno nuevo. */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Transporte
            </label>
            {editable ? (
              <>
                <input
                  type="text"
                  list={transporteListId}
                  value={transporte}
                  onChange={e => setTransporte(e.target.value)}
                  onBlur={() => void commitSave()}
                  onKeyDown={e => { if (e.key === 'Enter') void commitSave() }}
                  disabled={saving}
                  placeholder="OLAVERRY, TRANSCAL…"
                  className="h-9 w-full uppercase rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/40 disabled:opacity-50 transition-shadow"
                />
                <datalist id={transporteListId}>
                  {knownTransportes.map(t => <option key={t} value={t} />)}
                </datalist>
              </>
            ) : (
              <span className={`text-sm font-medium uppercase ${transporte ? 'text-foreground' : 'text-muted-foreground'}`}>
                {transporte || '—'}
              </span>
            )}
          </div>

          {/* LIBRE (nivel-carga) + botón "Devuelto". La FECHA se edita en
              Datos clave del panel ("Más datos"); acá display + acción rápida.
              Display con respaldo calculatedLibreHasta (lo mismo que mira
              libreAlerts); "Deshacer" restaura solo el valor GUARDADO. */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Libre (máx. devolución)
            </label>
            <div className="flex items-center justify-between gap-2">
              <span className={`text-sm font-medium ${devuelto ? 'text-emerald-600' : (libreVal || shipment.calculatedLibreHasta) ? 'text-foreground' : 'text-muted-foreground'}`}>
                {fmtDateDMY(libreVal || shipment.calculatedLibreHasta || '') || '—'}
              </span>
              <button
                type="button"
                onClick={() => void toggleDevuelto()}
                disabled={!canSave || saving}
                title={!canSave ? 'Solo lectura' : devuelto ? 'Quitar la marca DEVUELTO (LIBRE queda vacío)' : 'Marcar contenedor devuelto (LIBRE = DEVUELTO)'}
                className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-input bg-background text-[11px] font-medium text-muted-foreground transition-colors enabled:hover:bg-muted enabled:hover:text-foreground disabled:opacity-50"
              >
                {devuelto ? <ArrowCounterClockwise size={12} /> : <CheckCircle size={12} />}
                {devuelto ? 'Deshacer devuelto' : 'Devuelto'}
              </button>
            </div>
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
