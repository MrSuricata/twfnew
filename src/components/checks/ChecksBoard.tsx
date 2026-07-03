// ─── Pestaña Checks — checklist del PROCEDIMIENTO OPERATIVO por ref ────
// V1: solo FCL activas que operan por Uruguay (criterio en checksTypes:
// PAIS='UY' ⇔ POD Montevideo; incluye AR-vía-MVD, excluye Chile/Buenos
// Aires directo). El universo de refs se DERIVA de las cargas del admin
// (buildOperations sobre shipments+dbShipments, igual que Operaciones);
// ref_checks solo guarda el estado de los pasos.
//
// Estado de los checks: fetch PROPIO de la pestaña + refetch al recuperar el
// foco de la ventana (V1 simple, sin estado global en App) — el guardado es
// optimista con revert en error (patrón handlePatchShipment) y se reconcilia
// con los steps que devuelve el server (que estampa `by` desde el token).
// ────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  CaretDown,
  CaretRight,
  CheckCircle,
  Circle,
  ListChecks,
  MagnifyingGlass,
} from '@phosphor-icons/react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { getOperativaColor } from '@/lib/agendaTypes'
import { fmtDateDMY } from '@/lib/format'
import { getAdminName } from '@/lib/authClient'
import { buildOperations, type DbShipment, type UnifiedOperation } from '@/lib/operationsTypes'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import { fetchRefChecks, saveRefCheckSteps } from '@/lib/dataClient'
import {
  buildChecksUniverse,
  checksProgress,
  mergeChecksSteps,
  nextPendingStep,
  normalizeRef,
  stepsForOperativa,
  type CheckStepKey,
  type RefCheckStep,
  type RefCheckSteps,
} from '@/lib/checksTypes'

interface ChecksBoardProps {
  /** FCL del cache legacy de la planilla (vacío post-flip). */
  shipments?: ParsedShipment[]
  /** Cargas de la tabla shipments (post-flip las FCL viven acá). */
  dbShipments?: DbShipment[]
}

const EMPTY_ASSIGNMENTS = new Map<string, string | null>()

/** Hoy en ISO local (YYYY-MM-DD) — default de fecha al marcar un paso. */
function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** "quién lo marcó" corto para la UI: parte antes de la @ si es un email. */
function shortWho(by: string | undefined): string {
  return String(by || '').split('@')[0]
}

export default function ChecksBoard({ shipments = [], dbShipments = [] }: ChecksBoardProps) {
  // Hoy a medianoche local — para isOperationActive (vía buildChecksUniverse).
  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  // Universo SIEMPRE derivado de las cargas (derive-on-read, nunca de ref_checks).
  const universe = useMemo(
    () => buildChecksUniverse(buildOperations(shipments, dbShipments, EMPTY_ASSIGNMENTS), today),
    [shipments, dbShipments, today],
  )

  // ── Estado de los pasos por ref (fetch propio + refetch on focus) ──
  const [checksByRef, setChecksByRef] = useState<Map<string, RefCheckSteps>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const refresh = useCallback(async () => {
    try {
      const rows = await fetchRefChecks()
      setChecksByRef(new Map(rows.map(r => [normalizeRef(r.ref), r.steps || {}])))
    } catch (err) {
      console.warn('[checks] no se pudieron cargar:', err)
    } finally {
      setLoaded(true)
    }
  }, [])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  const [search, setSearch] = useState('')
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [expandedRef, setExpandedRef] = useState<string | null>(null)

  const visible = useMemo(() => {
    const q = search.trim().toUpperCase()
    return universe.filter(op => {
      if (q && !`${op.ref} ${op.cliente} ${op.cntr}`.toUpperCase().includes(q)) return false
      if (soloPendientes) {
        const { done, total } = checksProgress(checksByRef.get(normalizeRef(op.ref)) || {}, op.operativa)
        if (done >= total) return false
      }
      return true
    })
  }, [universe, search, soloPendientes, checksByRef])

  const alDia = useMemo(() => universe.filter(op => {
    const { done, total } = checksProgress(checksByRef.get(normalizeRef(op.ref)) || {}, op.operativa)
    return done >= total
  }).length, [universe, checksByRef])

  // ── Guardado optimista con revert en error (patrón handlePatchShipment) ──
  const applyStep = useCallback((ref: string, key: CheckStepKey, step: RefCheckStep | null) => {
    const norm = normalizeRef(ref)
    const prev = checksByRef // snapshot para revertir si el guardado falla
    const patch: RefCheckSteps = { [key]: step ?? { done: false } }
    setChecksByRef(cur => {
      const next = new Map(cur)
      next.set(norm, mergeChecksSteps(cur.get(norm) || {}, patch))
      return next
    })
    saveRefCheckSteps(ref, patch)
      .then(merged => {
        // Reconciliar con lo que quedó guardado (el server estampa `by` del token).
        setChecksByRef(cur => {
          const next = new Map(cur)
          next.set(norm, merged)
          return next
        })
      })
      .catch(err => {
        setChecksByRef(prev)
        toast.error(`No se pudo guardar el paso: ${(err as Error)?.message || 'sin detalles'}`)
      })
  }, [checksByRef])

  const handleToggleStep = useCallback((op: UnifiedOperation, key: CheckStepKey, label: string) => {
    const cur = (checksByRef.get(normalizeRef(op.ref)) || {})[key]
    if (cur?.done) {
      applyStep(op.ref, key, null)
      return
    }
    const date = todayIso()
    applyStep(op.ref, key, { done: true, date, by: getAdminName() })
    toast.success(`${label} — ${fmtDateDMY(date)}`, {
      description: op.ref,
      action: { label: 'Deshacer', onClick: () => applyStep(op.ref, key, null) },
    })
  }, [checksByRef, applyStep])

  const handleDateChange = useCallback((op: UnifiedOperation, key: CheckStepKey, date: string) => {
    const cur = (checksByRef.get(normalizeRef(op.ref)) || {})[key]
    if (!cur?.done || !date) return
    applyStep(op.ref, key, { ...cur, date })
  }, [checksByRef, applyStep])

  return (
    <div className="space-y-4">
      {/* Encabezado + controles */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ListChecks size={20} weight="fill" className="text-primary" />
            Checks operativos
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Procedimiento por referencia — FCL activas que operan por Uruguay · {universe.length} cargas · {alDia} al día
          </p>
        </div>
        <div className="sm:ml-auto flex flex-wrap items-center gap-3">
          <div className="relative">
            <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar ref, cliente o contenedor…"
              className="h-9 pl-8 w-64"
              aria-label="Buscar en checks"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <Switch
              checked={soloPendientes}
              onCheckedChange={setSoloPendientes}
              aria-label="Solo con pendientes"
            />
            Solo con pendientes
          </label>
        </div>
      </div>

      {/* Lista */}
      {!loaded ? (
        <div className="rounded-lg border border-border bg-card py-10 text-center text-sm text-muted-foreground">
          Cargando checks…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card py-10 text-center text-sm text-muted-foreground">
          {universe.length === 0
            ? 'No hay FCL activas por Uruguay para mostrar.'
            : search.trim()
              ? `Sin resultados para «${search.trim()}».`
              : 'Todo al día — ninguna carga con pasos pendientes.'}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card divide-y divide-border overflow-hidden">
          {visible.map(op => {
            const norm = normalizeRef(op.ref)
            return (
              <ChecksRow
                key={op.uid}
                op={op}
                steps={checksByRef.get(norm) || {}}
                expanded={expandedRef === norm}
                onToggleExpand={() => setExpandedRef(cur => (cur === norm ? null : norm))}
                onToggleStep={(key, label) => handleToggleStep(op, key, label)}
                onDateChange={(key, date) => handleDateChange(op, key, date)}
              />
            )
          })}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Los pasos se marcan a mano — el cruce de frontera y el arribo a fiscal no se marcan solos desde las fechas de la operativa (mejora futura).
      </p>
    </div>
  )
}

// ─── Fila por ref (expandible con el detalle de pasos) ──────────────────

interface ChecksRowProps {
  op: UnifiedOperation
  steps: RefCheckSteps
  expanded: boolean
  onToggleExpand: () => void
  onToggleStep: (key: CheckStepKey, label: string) => void
  onDateChange: (key: CheckStepKey, date: string) => void
}

function ChecksRow({ op, steps, expanded, onToggleExpand, onToggleStep, onDateChange }: ChecksRowProps) {
  const operativa = (op.operativa || '').trim()
  const opColor = operativa ? getOperativaColor(operativa) : null
  // Operativa desconocida (mapa devuelve "Otro") → mostrar el valor real.
  const badgeLabel = !opColor ? 'TBD' : opColor.label === 'Otro' ? operativa : opColor.label
  const { done, total } = checksProgress(steps, operativa)
  const complete = done >= total
  const next = nextPendingStep(steps, operativa)
  const visibleSteps = stepsForOperativa(operativa)
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className={expanded ? 'bg-muted/20' : undefined}>
      {/* Fila resumen */}
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Cerrar' : 'Abrir'} checks de ${op.ref}`}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
      >
        {expanded
          ? <CaretDown size={14} className="text-muted-foreground shrink-0" />
          : <CaretRight size={14} className="text-muted-foreground shrink-0" />}
        <span className="font-mono text-sm font-semibold shrink-0 min-w-[64px]">{op.ref}</span>
        <span className="text-sm text-foreground/85 truncate flex-1 min-w-0">{op.cliente || '—'}</span>
        <span
          className={`shrink-0 rounded-full px-2 py-px text-[10px] font-semibold leading-4 ${
            opColor ? `${opColor.bg} ${opColor.textColor}` : 'bg-muted text-muted-foreground'
          }`}
        >
          {badgeLabel}
        </span>
        <span className="hidden sm:inline text-xs text-muted-foreground shrink-0 w-[104px] text-right">
          ETA {fmtDateDMY(op.eta) || '—'}
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-px text-[10px] font-bold leading-4 tabular-nums ${
            complete
              ? 'bg-emerald-100 text-emerald-800'
              : done > 0
                ? 'bg-blue-50 text-blue-700'
                : 'bg-muted text-muted-foreground'
          }`}
          title={`${done} de ${total} pasos hechos`}
        >
          {done}/{total}
        </span>
        <span className="hidden md:block w-16 h-1.5 rounded-full bg-muted shrink-0 overflow-hidden">
          <span
            className={`block h-full rounded-full ${complete ? 'bg-emerald-500' : 'bg-primary'}`}
            style={{ width: `${pct}%` }}
          />
        </span>
      </button>

      {/* Detalle: los pasos en orden */}
      {expanded && (
        <div className="px-4 pb-3 pt-0.5 sm:pl-9">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
            Procedimiento operativo{operativa && !opColor?.label.startsWith('Otro') ? ` · ${badgeLabel.toLowerCase()}` : ''}
          </p>
          <div className="rounded-md border border-border/60 bg-background divide-y divide-border/60">
            {visibleSteps.map((def, i) => {
              const st = steps[def.key]
              const isNext = !st?.done && def.key === next
              return (
                <div
                  key={def.key}
                  className={`flex items-center gap-2.5 px-3 py-2 ${isNext ? 'bg-primary/5' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => onToggleStep(def.key, def.label)}
                    aria-label={st?.done ? `Desmarcar: ${def.label}` : `Marcar: ${def.label}`}
                    className="shrink-0 rounded-full transition-transform hover:scale-110"
                  >
                    {st?.done
                      ? <CheckCircle size={22} weight="fill" className="text-emerald-500" />
                      : <Circle size={22} className={isNext ? 'text-primary' : 'text-muted-foreground/40'} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleStep(def.key, def.label)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <span className={`text-sm ${st?.done ? 'text-muted-foreground' : 'text-foreground'}`}>
                      <span className="tabular-nums text-muted-foreground mr-1.5">{i + 1}.</span>
                      {def.label}
                    </span>
                    {isNext && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide font-semibold text-primary">
                        Siguiente
                      </span>
                    )}
                  </button>
                  {st?.done && (
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="date"
                        value={st.date || ''}
                        onChange={e => onDateChange(def.key, e.target.value)}
                        aria-label={`Fecha de: ${def.label}`}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                      />
                      {st.by && (
                        <span className="hidden sm:inline text-[10px] text-muted-foreground max-w-[90px] truncate">
                          por {shortWho(st.by)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
