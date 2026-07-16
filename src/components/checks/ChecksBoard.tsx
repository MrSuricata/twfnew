// ─── Pestaña Checks — 4 checks documentarios por ref ────────────────────
// BL entregado · Carta entregada · Docs transporte · Docs depósito
// (Brian 13/07/2026 — deben estar listos 2 semanas antes de la ETA; los
// avisos salida/frontera/fiscal viven en HOY, no acá.)
// Solo FCL activas que operan por Uruguay (criterio en checksTypes:
// PAIS='UY' ⇔ POD Montevideo; incluye AR-vía-MVD, excluye Chile/Buenos
// Aires directo). El universo de refs se DERIVA de las cargas del admin
// (buildOperations sobre shipments+dbShipments, igual que Operaciones);
// ref_checks solo guarda el estado de los pasos.
//
// Estado de los checks: fetch PROPIO de la pestaña + refetch al recuperar el
// foco de la ventana (V1 simple, sin estado global en App) — el guardado es
// optimista con revert en error (patrón handlePatchShipment) y se reconcilia
// con los steps que devuelve el server (que estampa `by` desde el token).
//
// El chip TELEX de cada fila es un toggle real (si la carga es editable):
// escribe por el MISMO camino que el toggle Telex del panel de detalle —
// buildPerContainerPatch(op, 'telex', boolean) → onPatchShipment (App).
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
import { buildOperations, buildPerContainerPatch, type DbShipment, type UnifiedOperation } from '@/lib/operationsTypes'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import { parseCntr } from '@/lib/cntrUtils'
import { hasTelex as hasTelexValue } from '@/lib/telexCheck'
import { subscribeTrucksLive } from '@/lib/realtimeBus'
import { fetchRefChecks, saveRefCheckSteps, saveRefCheckCntrs } from '@/lib/dataClient'
import {
  buildChecksUniverse,
  checksProgress,
  mergeChecksSteps,
  nextPendingStep,
  normalizeRef,
  stepsForOperativa,
  isAvisoStep,
  avisoAggregate,
  buildAvisoCntrsMap,
  type CheckStepKey,
  type RefCheckStep,
  type RefCheckSteps,
} from '@/lib/checksTypes'

interface ChecksBoardProps {
  /** FCL del cache legacy de la planilla (vacío post-flip). */
  shipments?: ParsedShipment[]
  /** Cargas de la tabla shipments (post-flip las FCL viven acá). */
  dbShipments?: DbShipment[]
  /** Patch de una fila DB — el handlePatchShipment de App (optimista + revert).
   *  Habilita el toggle de telex desde la fila; sin él, chip estático. */
  onPatchShipment?: (id: string, fields: Record<string, unknown>) => void
  /** Abre la ficha completa de la carga (overlay del panel de detalle) — la ref
   *  de cada fila pasa a ser clickeable (pedido Brian 16/07). */
  onOpenDetail?: (key: string) => void
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

export default function ChecksBoard({ shipments = [], dbShipments = [], onPatchShipment, onOpenDetail }: ChecksBoardProps) {
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
  // Timbre Realtime: si otro usuario marca un aviso/check, refetchamos en vivo.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsub = subscribeTrucksLive(msg => {
      if (msg.kind !== 'ref_checks') return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { void refresh() }, 300)
    })
    return () => { if (timer) clearTimeout(timer); unsub() }
  }, [refresh])

  const [search, setSearch] = useState('')
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [expandedRef, setExpandedRef] = useState<string | null>(null)

  const visible = useMemo(() => {
    const q = search.trim().toUpperCase()
    return universe.filter(op => {
      if (q && !`${op.ref} ${op.cliente} ${op.cntr}`.toUpperCase().includes(q)) return false
      if (soloPendientes) {
        const { done, total } = checksProgress(checksByRef.get(normalizeRef(op.ref)) || {}, op.operativa, parseCntr(op.cntr))
        if (done >= total) return false
      }
      return true
    })
  }, [universe, search, soloPendientes, checksByRef])

  const alDia = useMemo(() => universe.filter(op => {
    const { done, total } = checksProgress(checksByRef.get(normalizeRef(op.ref)) || {}, op.operativa, parseCntr(op.cntr))
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

  // Aviso POR CONTENEDOR (bulk desde la pestaña, que es por-ref): guarda el mapa
  // completo de la ref para ese paso. Optimista + revert, igual que applyStep.
  const applyAvisoCntrs = useCallback((ref: string, key: CheckStepKey, map: Record<string, { done: boolean; date?: string; by?: string }>) => {
    const norm = normalizeRef(ref)
    const prev = checksByRef
    const anyDone = Object.values(map).some(c => c.done)
    setChecksByRef(cur => {
      const next = new Map(cur)
      const steps: RefCheckSteps = { ...(cur.get(norm) || {}) }
      if (anyDone) steps[key] = { done: true, cntrs: map }
      else delete steps[key]
      next.set(norm, steps)
      return next
    })
    saveRefCheckCntrs(ref, key, map)
      .then(merged => setChecksByRef(cur => { const next = new Map(cur); next.set(norm, merged); return next }))
      .catch(err => {
        setChecksByRef(prev)
        toast.error(`No se pudo guardar el paso: ${(err as Error)?.message || 'sin detalles'}`)
      })
  }, [checksByRef])

  const handleToggleStep = useCallback((op: UnifiedOperation, key: CheckStepKey, label: string) => {
    const step = (checksByRef.get(normalizeRef(op.ref)) || {})[key]
    // Los 3 pasos-aviso son POR CONTENEDOR. En esta pestaña (agregada) el toggle
    // marca/desmarca TODOS los contenedores de la ref a la vez.
    if (isAvisoStep(key)) {
      const cntrList = parseCntr(op.cntr)
      if (cntrList.length === 0) {
        const done = !!step?.done
        applyStep(op.ref, key, done ? null : { done: true, date: todayIso(), by: getAdminName() })
        return
      }
      const agg = avisoAggregate(step, cntrList)
      const allDone = agg.total > 0 && agg.done === agg.total
      const ctx = { date: todayIso(), by: getAdminName() }
      applyAvisoCntrs(op.ref, key, buildAvisoCntrsMap(step, cntrList, null, !allDone, ctx))
      toast.success(allDone ? `${label} — quitado (todos)` : `${label} — avisados los ${cntrList.length} contenedores`, {
        description: op.ref,
        action: { label: 'Deshacer', onClick: () => applyAvisoCntrs(op.ref, key, buildAvisoCntrsMap(step, cntrList, null, allDone, ctx)) },
      })
      return
    }
    if (step?.done) {
      applyStep(op.ref, key, null)
      return
    }
    const date = todayIso()
    applyStep(op.ref, key, { done: true, date, by: getAdminName() })
    toast.success(`${label} — ${fmtDateDMY(date)}`, {
      description: op.ref,
      action: { label: 'Deshacer', onClick: () => applyStep(op.ref, key, null) },
    })
  }, [checksByRef, applyStep, applyAvisoCntrs])

  const handleDateChange = useCallback((op: UnifiedOperation, key: CheckStepKey, date: string) => {
    const cur = (checksByRef.get(normalizeRef(op.ref)) || {})[key]
    if (!cur?.done || !date) return
    applyStep(op.ref, key, { ...cur, date })
  }, [checksByRef, applyStep])

  // ── Telex desde la fila — MISMO camino que el toggle Telex del panel ──
  // ViabilityBlock hace onCommit('tlx', !hasTelex(op.tlx)) y el commit del panel
  // lo traduce a onPatch(op.dbId, buildPerContainerPatch(op, 'telex', boolean)).
  // Desde el 10/07 ese patch propaga la columna boolean Y el TLX 'SI'/'' a todo
  // el array operativas (antes solo la columna → la pantalla leía el TLX viejo
  // y el toggle "no agarraba", bug A7759). onPatchShipment es el
  // handlePatchShipment de App: optimista con revert en error. Deshacer del
  // toast = el mismo patch con el valor anterior.
  const handleToggleTelex = useCallback((op: UnifiedOperation) => {
    if (!onPatchShipment || !op.dbId) return
    const next = !hasTelexValue(op.tlx)
    const apply = (v: boolean) => onPatchShipment(op.dbId!, buildPerContainerPatch(op, 'telex', v))
    apply(next)
    toast.success(next ? `Telex marcado — ${op.ref}` : `Telex quitado — ${op.ref}`, {
      action: { label: 'Deshacer', onClick: () => apply(!next) },
    })
  }, [onPatchShipment])

  return (
    <div className="space-y-4">
      {/* Encabezado + controles */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ListChecks size={20} weight="fill" className="text-primary" />
            Checks documentarios
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            BL · Carta · Docs transporte · Docs depósito — listos 2 semanas antes de la ETA · {universe.length} cargas · {alDia} al día
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
            // Telex editable con el MISMO criterio que el ViabilityBlock del
            // panel (editable={op.source === 'db' && !!op.dbId && !op.readOnly});
            // si la carga no es editable (caso raro), chip estático como hoy.
            const telexEditable = !!onPatchShipment && op.source === 'db' && !!op.dbId && !op.readOnly
            return (
              <ChecksRow
                key={op.uid}
                op={op}
                steps={checksByRef.get(norm) || {}}
                expanded={expandedRef === norm}
                onToggleExpand={() => setExpandedRef(cur => (cur === norm ? null : norm))}
                onToggleStep={(key, label) => handleToggleStep(op, key, label)}
                onDateChange={(key, date) => handleDateChange(op, key, date)}
                onToggleTelex={telexEditable ? () => handleToggleTelex(op) : undefined}
                onOpenRef={onOpenDetail ? () => onOpenDetail(op.dbId || op.ref) : undefined}
              />
            )
          })}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Los checks se marcan a mano. Los avisos de salida, frontera y fiscal se marcan desde la pestaña HOY.
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
  /** Marcar/quitar telex desde la fila (mismo camino que el panel). Sin esto
   *  (carga no editable) el chip queda estático como siempre. */
  onToggleTelex?: () => void
  /** Abrir la ficha completa de la carga (click en la ref). */
  onOpenRef?: () => void
}

function ChecksRow({ op, steps, expanded, onToggleExpand, onToggleStep, onDateChange, onToggleTelex, onOpenRef }: ChecksRowProps) {
  const operativa = (op.operativa || '').trim()
  const opColor = operativa ? getOperativaColor(operativa) : null
  // Operativa desconocida (mapa devuelve "Otro") → mostrar el valor real.
  const badgeLabel = !opColor ? 'TBD' : opColor.label === 'Otro' ? operativa : opColor.label
  // Telex: derive-on-read con EXACTAMENTE el mismo criterio que el toggle del
  // panel de detalle (ViabilityBlock: hasTelex de telexCheck) — tlx viene de la
  // columna telex de shipments (FCL horneada) o del TLX de operativas (cache
  // legacy). No se guarda nada en ref_checks. Semáforo del dueño: sí=verde, no=rojo.
  const hasTelex = hasTelexValue(op.tlx)
  const cntrList = parseCntr(op.cntr)
  const { done, total } = checksProgress(steps, operativa, cntrList)
  const complete = done >= total
  const next = nextPendingStep(steps, operativa, cntrList)
  const visibleSteps = stepsForOperativa(operativa)
  // ¿Paso completo? Los avisos (por contenedor) cuentan hechos solo si TODOS los
  // contenedores están avisados; el resto usa el done del paso.
  const isStepDone = (key: CheckStepKey): boolean => {
    const st = steps[key]
    if (isAvisoStep(key) && cntrList.length > 0) {
      const a = avisoAggregate(st, cntrList)
      return a.total > 0 && a.done === a.total
    }
    return !!st?.done
  }
  const nextDef = next ? visibleSteps.find(s => s.key === next) : undefined
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  const telexChip = <TelexChip hasTelex={hasTelex} onToggle={onToggleTelex} />

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
        {/* Ref clickeable → abre la ficha completa (overlay). Span role=button
            porque vive DENTRO del botón de la fila (mismo patrón que TelexChip);
            stopPropagation para no expandir/cerrar la fila al abrirla. */}
        {onOpenRef ? (
          <span
            role="button"
            tabIndex={0}
            title="Abrir la ficha de la carga"
            onClick={e => { e.stopPropagation(); onOpenRef() }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onOpenRef() }
            }}
            className="font-mono text-sm font-semibold shrink-0 min-w-[64px] text-primary cursor-pointer hover:underline underline-offset-2"
          >
            {op.ref}
          </span>
        ) : (
          <span className="font-mono text-sm font-semibold shrink-0 min-w-[64px]">{op.ref}</span>
        )}
        <span className="text-sm text-foreground/85 truncate flex-1 min-w-0">{op.cliente || '—'}</span>
        {/* Mini-línea: un punto por check (los 4 documentarios). Relleno
            emerald = hecho · hueco gris = pendiente · anillo índigo = el
            SIGUIENTE pendiente. En pantallas chicas se oculta (hidden sm:flex)
            para que la fila no se rompa. */}
        <span className="hidden sm:flex items-center gap-1 shrink-0">
          {visibleSteps.map((def, i) => {
            const st = steps[def.key]
            const stepDone = isStepDone(def.key)
            const agg = isAvisoStep(def.key) ? avisoAggregate(st, cntrList) : null
            const isNext = !stepDone && def.key === next
            const detalle = stepDone
              ? `hecho${!agg && st?.date ? ` ${fmtDateDMY(st.date)}` : ''}${!agg && st?.by ? ` por ${shortWho(st.by)}` : ''}`
              : agg && agg.done > 0
                ? `${agg.done}/${agg.total} avisados`
                : 'pendiente'
            return (
              <span
                key={def.key}
                title={`${i + 1}. ${def.label} — ${detalle}`}
                className={`h-2 w-2 rounded-full ${
                  stepDone
                    ? 'bg-emerald-500'
                    : isNext
                      ? 'bg-background ring-2 ring-indigo-500'
                      : agg && agg.done > 0
                        ? 'bg-amber-400'
                        : 'bg-background border border-muted-foreground/35'
                }`}
              />
            )
          })}
        </span>
        {nextDef && (
          <span className="hidden lg:inline-block text-xs text-muted-foreground truncate max-w-[190px] shrink-0">
            Siguiente: {nextDef.label}
          </span>
        )}
        <span
          className={`shrink-0 rounded-full px-2 py-px text-[10px] font-semibold leading-4 ${
            opColor ? `${opColor.bg} ${opColor.textColor}` : 'bg-muted text-muted-foreground'
          }`}
        >
          {badgeLabel}
        </span>
        {telexChip}
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
          <div className="flex items-center gap-2 mb-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Checks documentarios — listos 2 semanas antes de la ETA
            </p>
            {telexChip}
          </div>
          <div className="rounded-md border border-border/60 bg-background divide-y divide-border/60">
            {visibleSteps.map((def, i) => {
              const st = steps[def.key]
              const stepDone = isStepDone(def.key)
              const agg = isAvisoStep(def.key) ? avisoAggregate(st, cntrList) : null
              const isNext = !stepDone && def.key === next
              return (
                <div
                  key={def.key}
                  className={`flex items-center gap-2.5 px-3 py-2 ${isNext ? 'bg-primary/5' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => onToggleStep(def.key, def.label)}
                    aria-label={stepDone ? `Desmarcar: ${def.label}` : `Marcar: ${def.label}`}
                    className="shrink-0 rounded-full transition-transform hover:scale-110"
                  >
                    {stepDone
                      ? <CheckCircle size={22} weight="fill" className="text-emerald-500" />
                      : <Circle size={22} className={isNext ? 'text-primary' : agg && agg.done > 0 ? 'text-amber-500' : 'text-muted-foreground/40'} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleStep(def.key, def.label)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <span className={`text-sm ${stepDone ? 'text-muted-foreground' : 'text-foreground'}`}>
                      <span className="tabular-nums text-muted-foreground mr-1.5">{i + 1}.</span>
                      {def.label}
                    </span>
                    {isNext && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide font-semibold text-primary">
                        Siguiente
                      </span>
                    )}
                  </button>
                  {agg ? (
                    // Aviso por contenedor: se marca en HOY (una tarjeta por
                    // contenedor). Acá se ve el agregado; el toggle marca todos.
                    <span
                      className={`shrink-0 text-[11px] tabular-nums font-medium ${agg.done === agg.total ? 'text-emerald-600' : agg.done > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}
                      title="Avisos por contenedor (se marcan en la pestaña HOY)"
                    >
                      {agg.done}/{agg.total} avisados
                    </span>
                  ) : st?.done ? (
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
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Chip TELEX / Sin telex (semáforo del dueño: sí=verde, no=rojo) ─────
// Con onToggle es un toggle real: span role=button (vive DENTRO del botón de
// la fila — mismo patrón que AgendaEventCard para no anidar <button> en
// <button>) con stopPropagation para no expandir/cerrar la fila al click.
// Sin onToggle (carga no editable, caso raro) queda estático como siempre.
function TelexChip({ hasTelex, onToggle }: { hasTelex: boolean; onToggle?: () => void }) {
  const base = `shrink-0 rounded-full px-2 py-px text-[10px] font-semibold leading-4 ${
    hasTelex ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
  }`
  if (!onToggle) {
    return (
      <span className={base} title={hasTelex ? 'Telex release recibido' : 'Sin telex release'}>
        {hasTelex ? 'TELEX' : 'Sin telex'}
      </span>
    )
  }
  return (
    <span
      role="button"
      tabIndex={0}
      aria-pressed={hasTelex}
      title={hasTelex ? 'Quitar telex' : 'Marcar telex'}
      onClick={e => { e.stopPropagation(); onToggle() }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onToggle() }
      }}
      className={`${base} cursor-pointer transition-shadow hover:ring-2 ${
        hasTelex ? 'hover:ring-emerald-300' : 'hover:ring-red-300'
      }`}
    >
      {hasTelex ? 'TELEX' : 'Sin telex'}
    </span>
  )
}
