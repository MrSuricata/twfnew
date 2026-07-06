import { useState, useMemo, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import {
  Truck,
  Warehouse,
  MapPin,
  Warning,
  Coffee,
  Package,
  Siren,
  CaretRight,
  CalendarBlank,
  CircleNotch,
  Check,
} from '@phosphor-icons/react'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import {
  buildTodaySnapshot,
  AVISO_STEP_BY_COLUMN,
  AVISO_LABEL_BY_COLUMN,
  type OpMatch,
  type LibreAlert,
  type TodayColumn,
} from '@/lib/todayFilters'
import ShipmentDetailsDialog from './ShipmentDetailsDialog'
import ContainerQuickEdit from './operations/ContainerQuickEdit'
import { deriveKnownTransportes } from '@/lib/operationsTypes'
import type { ShipmentDocument, OperativeReport, OriginPhoto } from '@/lib/quotationTypes'
import type { Truck as TruckType, TruckLoad } from '@/lib/truckTypes'
import { deriveTruckDisplayInfo, deriveTruckDisplayStatus } from '@/lib/truckTypes'
import { Badge } from '@/components/ui/badge'
import { fetchRefChecks, saveRefCheckSteps, saveRefCheckCntrs } from '@/lib/dataClient'
import {
  normalizeRef,
  mergeChecksSteps,
  avisoForCntr,
  buildAvisoCntrsMap,
  type CheckStepKey,
  type RefCheckStep,
  type RefCheckSteps,
} from '@/lib/checksTypes'
import { parseCntr } from '@/lib/cntrUtils'
import { subscribeTrucksLive } from '@/lib/realtimeBus'
import { getAdminName } from '@/lib/authClient'
import { fmtDateDMY } from '@/lib/format'

// ─── Avisos por tarjeta (unificados con la pestaña Checks) ────────────────
// El check "Aviso" de cada tarjeta marca EXACTAMENTE un paso de ref_checks
// (aviso_salida / cruce_frontera / arribo_fiscal según la columna — mapa en
// todayFilters.AVISO_STEP_BY_COLUMN). No es un estado nuevo: escribe el MISMO
// paso que la pestaña Checks (done=true, date=hoy, by=usuario), y lee de la
// misma tabla → se reflejan mutuamente (derive-on-read). El estado se fetchea
// acá (fetch on mount + refetch on focus, igual que ChecksBoard) para no
// hoistear estado global; el guardado es optimista con revert + toast Deshacer.
// El paso es NIVEL-REF (por operación): si un ref tiene 2 contenedores saliendo
// hoy, ambas tarjetas comparten el mismo estado del aviso — es un aviso por
// operación, correcto y esperado.

/** Hoy en ISO local (YYYY-MM-DD) — default de fecha al marcar un aviso. */
function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** "quién lo marcó" corto para el tooltip: parte antes de la @ si es email. */
function shortWho(by: string | undefined): string {
  return String(by || '').split('@')[0]
}

interface TodayDashboardProps {
  shipments: ParsedShipment[]
  /** Carga inicial de datos en curso (banner "Sincronizando datos..." activo). */
  isDataLoading?: boolean
  trucks?: TruckType[]
  truckLoads?: TruckLoad[]
  documents?: ShipmentDocument[]
  reports?: OperativeReport[]
  originPhotos?: OriginPhoto[]
  onUpdateShipments?: (shipments: ParsedShipment[]) => void
  onUpdateOriginPhotos?: (photos: OriginPhoto[]) => void
  /** PATCH callback threaded from DashboardEnhanced — writes to /api/data/shipments (FCL only). */
  onPatchShipment?: (id: string, fields: Record<string, unknown>) => void
  /** Opens the OperationDetailPanel for the given FCL ref (navigates to operaciones tab). */
  onOpenDetail?: (ref: string) => void
}

/**
 * "HOY" — quick-glance dashboard for TWF staff.
 *
 * Shows three cards (cargas saliendo / en frontera / llegando a fiscal) + a LIBRE alert
 * strip. Intended as the default admin landing — what's moving today, at a glance.
 */
export default function TodayDashboard({
  shipments,
  isDataLoading = false,
  trucks = [],
  truckLoads = [],
  documents = [],
  reports = [],
  originPhotos = [],
  onUpdateShipments,
  onUpdateOriginPhotos,
  onPatchShipment,
  onOpenDetail,
}: TodayDashboardProps) {
  const [selected, setSelected] = useState<ParsedShipment | null>(null)
  const [open, setOpen] = useState(false)

  // Quick-edit state for FCL rows (opened via ContainerQuickEdit)
  const [quickEditMatch, setQuickEditMatch] = useState<OpMatch | null>(null)
  const [quickEditOpen, setQuickEditOpen] = useState(false)

  const snapshot = useMemo(() => buildTodaySnapshot(shipments), [shipments])

  // ── Estado de los avisos (ref_checks) — fetch + refetch on focus + Realtime ──
  // Fuente de verdad = ref_checks. Los 3 pasos-aviso son POR CONTENEDOR: cada
  // tarjeta (= un contenedor) marca SU aviso; la pestaña Checks agrega.
  const [checksByRef, setChecksByRef] = useState<Map<string, RefCheckSteps>>(new Map())
  const refreshChecks = useCallback(async () => {
    try {
      const rows = await fetchRefChecks()
      setChecksByRef(new Map(rows.map(r => [normalizeRef(r.ref), r.steps || {}])))
    } catch (err) {
      console.warn('[hoy] no se pudieron cargar los avisos:', err)
    }
  }, [])
  useEffect(() => { refreshChecks() }, [refreshChecks])
  useEffect(() => {
    const onFocus = () => refreshChecks()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshChecks])
  // Timbre Realtime: cuando OTRO usuario marca un aviso, refetchamos para ver el
  // check verde al instante (bug del "no sincroniza"). Debounce para ráfagas.
  // Sin env de Realtime → subscribeTrucksLive es no-op (sigue el refetch on-focus).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsub = subscribeTrucksLive(msg => {
      if (msg.kind !== 'ref_checks') return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { void refreshChecks() }, 300)
    })
    return () => { if (timer) clearTimeout(timer); unsub() }
  }, [refreshChecks])

  // Reconcilia el estado optimista con lo que devuelve el server (estampa `by`).
  const reconcile = useCallback((norm: string, merged: RefCheckSteps) => {
    setChecksByRef(cur => { const next = new Map(cur); next.set(norm, merged); return next })
  }, [])

  // Aviso NIVEL-REF (fallback: solo cuando la fila no tiene contenedor).
  const applyAvisoStep = useCallback((ref: string, key: CheckStepKey, step: RefCheckStep | null) => {
    const norm = normalizeRef(ref)
    const prev = checksByRef
    const patch: RefCheckSteps = { [key]: step ?? { done: false } }
    setChecksByRef(cur => { const next = new Map(cur); next.set(norm, mergeChecksSteps(cur.get(norm) || {}, patch)); return next })
    saveRefCheckSteps(ref, patch).then(m => reconcile(norm, m)).catch(err => {
      setChecksByRef(prev)
      toast.error(`No se pudo guardar el aviso: ${(err as Error)?.message || 'sin detalles'}`)
    })
  }, [checksByRef, reconcile])

  // Aviso POR CONTENEDOR: guarda el mapa completo de la ref para ese paso.
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
    saveRefCheckCntrs(ref, key, map).then(m => reconcile(norm, m)).catch(err => {
      setChecksByRef(prev)
      toast.error(`No se pudo guardar el aviso: ${(err as Error)?.message || 'sin detalles'}`)
    })
  }, [checksByRef, reconcile])

  // Toggle del check "Aviso" de una tarjeta = UN contenedor (op.CNTR_OP). Marca/
  // desmarca solo ESA línea; los otros contenedores de la ref no se tocan.
  const toggleAviso = useCallback((shipment: ParsedShipment, cntr: string, key: CheckStepKey, label: string) => {
    const ref = shipment.REF
    const step = checksByRef.get(normalizeRef(ref))?.[key]
    if (!cntr) {
      const done = !!step?.done
      const mk = (d: boolean): RefCheckStep | null => (d ? { done: true, date: todayIso(), by: getAdminName() } : null)
      applyAvisoStep(ref, key, mk(!done))
      toast.success(done ? `${label} — aviso quitado` : `${label} avisado — ${fmtDateDMY(todayIso())}`, {
        description: ref,
        action: { label: 'Deshacer', onClick: () => applyAvisoStep(ref, key, mk(done)) },
      })
      return
    }
    const cntrList = parseCntr(shipment.CNTR)
    const wasDone = !!avisoForCntr(step, cntr)
    const ctx = { date: todayIso(), by: getAdminName() }
    applyAvisoCntrs(ref, key, buildAvisoCntrsMap(step, cntrList, cntr, !wasDone, ctx))
    toast.success(wasDone ? `${label} — aviso quitado · ${cntr}` : `${label} avisado · ${cntr}`, {
      description: ref,
      action: { label: 'Deshacer', onClick: () => applyAvisoCntrs(ref, key, buildAvisoCntrsMap(step, cntrList, cntr, wasDone, ctx)) },
    })
  }, [checksByRef, applyAvisoStep, applyAvisoCntrs])

  // Transportes ya usados en las cargas → sugerencias del combo Transporte del quick-edit.
  const knownTransportes = useMemo(
    () => deriveKnownTransportes(shipments.flatMap(s => (s.operativas ?? []).map(o => o.TRANSPORTE))),
    [shipments]
  )

  // 🚛 Consolidados en movimiento: carga/sale/llega HOY o en frontera ahora.
  // Estados derivados de las fechas del camión (misma lógica que sus cargas).
  const trucksHoy = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return trucks
      .filter(t => !t.draft)                    // camiones borrador: invisibles en HOY
      .map(t => {
        const info = deriveTruckDisplayInfo(t, today)
        const status = deriveTruckDisplayStatus(t, today)
        const loads = truckLoads.filter(l => l.truckId === t.id && l.pending !== 'add')
        const refs = loads.map(l => l.sourceRef).filter(Boolean)
        const kg = loads.reduce((a, l) => a + (Number(l.kg) || 0), 0)
        const m3 = loads.reduce((a, l) => a + (Number(l.m3) || 0), 0)
        return { t, info, status, refs, kg, m3 }
      })
      // En el HOY entran: hitos de hoy (carga/sale/llega) + los que están en frontera
      .filter(x => x.info.hoy || (x.status === 'in_transit'))
  }, [trucks, truckLoads])

  // Carga inicial en curso y todavía sin nada que mostrar → estado "Cargando"
  // en vez del empty state ("Día tranquilo"), para no dar un falso "no hay nada
  // hoy" mientras el banner de sincronizando sigue activo. Con datos ya
  // cargados, isDataLoading no cambia nada.
  const initialLoading = isDataLoading && !snapshot.hasMovement && trucksHoy.length === 0

  // For LIBRE alert rows (only have a ParsedShipment, no op)
  const openShipment = (s: ParsedShipment) => {
    setSelected(s)
    setOpen(true)
  }

  // For TodayCard rows (have both shipment + op). FCL rows with __dbId go to
  // ContainerQuickEdit; all others go to the read-only ShipmentDetailsDialog.
  const openOpMatch = (match: OpMatch) => {
    if (onPatchShipment && match.shipment.__dbId) {
      setQuickEditMatch(match)
      setQuickEditOpen(true)
    } else {
      setSelected(match.shipment)
      setOpen(true)
    }
  }

  // "jueves 2 de julio" — minúsculas como corresponde en español (sin la coma
  // del locale y SIN la clase `capitalize`, que capitalizaba mes y preposición).
  const todayLabel = new Date().toLocaleDateString('es-UY', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).replace(',', '')

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-muted-foreground/70 font-semibold">Hoy</span>
            <span className="text-muted-foreground/50 font-normal mx-2">·</span>
            {todayLabel}
          </h1>
          {snapshot.hasMovement ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <StatChip icon={<CalendarBlank size={14} weight="fill" />} label={`${snapshot.totalCount} movimientos`} tone="muted" />
              {snapshot.libreAlerts.length > 0 && (
                <StatChip icon={<Warning size={14} weight="fill" />} label={`${snapshot.libreAlerts.length} alerta${snapshot.libreAlerts.length === 1 ? '' : 's'} LIBRE`} tone="destructive" />
              )}
            </div>
          ) : initialLoading ? (
            <p className="text-sm text-muted-foreground mt-1">Cargando movimientos…</p>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">Día tranquilo — sin movimientos programados</p>
          )}
        </div>
      </div>

      {/* ── Estado de carga inicial (sincronizando, sin datos aún) ── */}
      {initialLoading && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <div className="p-4 bg-muted rounded-full mb-4">
              <CircleNotch size={36} className="animate-spin opacity-70" />
            </div>
            <p className="text-lg font-semibold text-foreground">Cargando movimientos…</p>
            <p className="text-sm mt-1">Sincronizando los datos del día</p>
          </CardContent>
        </Card>
      )}

      {/* ── Empty state (tampoco hay consolidados en movimiento) ── */}
      {!initialLoading && !snapshot.hasMovement && trucksHoy.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <div className="p-4 bg-muted rounded-full mb-4">
              <Coffee size={36} weight="duotone" className="opacity-70" />
            </div>
            <p className="text-lg font-semibold text-foreground">Nada programado hoy</p>
            <p className="text-sm mt-1">Tomá un café ☕</p>
          </CardContent>
        </Card>
      )}

      {/* ── 🚛 Consolidados en movimiento (carga/sale/llega HOY + en frontera) ── */}
      {trucksHoy.length > 0 && (
        <Card className="accent-top overflow-hidden" style={{ ['--bar-color' as any]: '#f59e0b' }}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="p-1.5 bg-amber-100 rounded-md">
                <Truck size={18} weight="fill" className="text-amber-600" />
              </div>
              <h2 className="text-sm font-semibold uppercase tracking-wide">Consolidados en movimiento</h2>
              <span className="text-xs text-muted-foreground">{trucksHoy.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {trucksHoy.map(({ t, info, refs, kg, m3 }) => (
                <div key={t.id} className="rounded-lg border bg-card px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">🚛 {t.code}</span>
                    <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${info.hoy ? 'animate-pulse font-semibold border-amber-400 text-amber-700' : ''}`}>
                      {info.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate" title={refs.join(', ')}>
                    {t.transport || 'Sin transporte'}{refs.length > 0 ? ` · Lleva: ${refs.join(', ')}` : ' · Sin cargas'}
                  </p>
                  {(kg > 0 || m3 > 0) && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{Math.round(kg).toLocaleString('es-UY')} kg · {m3.toLocaleString('es-UY', { maximumFractionDigits: 1 })} m³</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── LIBRE alerts strip ───────────────────────────── */}
      {snapshot.libreAlerts.length > 0 && (
        <Card className="accent-top overflow-hidden bg-destructive/[0.03] border-destructive/20" style={{ ['--bar-color' as any]: 'var(--destructive)' }}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-1.5 bg-destructive/10 rounded-md">
                <Siren size={18} weight="fill" className="text-destructive pulse-soft" />
              </div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-destructive">
                LIBRE vencido / crítico
              </h2>
              <span className="ml-auto inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-destructive text-destructive-foreground text-xs font-bold">
                {snapshot.libreAlerts.length}
              </span>
            </div>
            <div className="space-y-1">
              {snapshot.libreAlerts.map((a) => (
                <LibreAlertRow
                  key={a.shipment.REF}
                  alert={a}
                  onClick={() => {
                    // Mismo camino que las demás tarjetas de HOY: quick-edit para
                    // FCL editable (ahí mismo se corrige el LIBRE / se marca
                    // DEVUELTO, y "Más datos" abre el panel completo); diálogo de
                    // lectura como fallback. LIBRE es nivel-carga, así que la
                    // primera operativa alcanza para el quick-edit.
                    const op = (a.shipment.operativas ?? [])[0]
                    if (op) openOpMatch({ shipment: a.shipment, op })
                    else openShipment(a.shipment)
                  }}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 3-card grid (oculta durante la carga inicial — evita "Sin salidas hoy" falsos) ── */}
      {!initialLoading && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TodayCard
          title="Saliendo hoy"
          subtitle="Camiones saliendo de Uruguay"
          icon={<Truck size={18} weight="fill" className="text-blue-600 dark:text-blue-400" />}
          iconBg="bg-blue-100 dark:bg-blue-500/10"
          barColor="var(--chart-2)"
          matches={snapshot.salientes}
          emptyLabel="Sin salidas hoy"
          onRowClick={openOpMatch}
          column="salientes"
          checksByRef={checksByRef}
          onToggleAviso={toggleAviso}
        />
        <TodayCard
          title="En frontera hoy"
          subtitle="Estimado (salió hace 1-2 días)"
          icon={<MapPin size={18} weight="fill" className="text-amber-600 dark:text-amber-400" />}
          iconBg="bg-amber-100 dark:bg-amber-500/10"
          barColor="oklch(0.75 0.15 70)"
          matches={snapshot.frontera}
          emptyLabel="Sin cargas en frontera"
          onRowClick={openOpMatch}
          column="frontera"
          checksByRef={checksByRef}
          onToggleAviso={toggleAviso}
        />
        <TodayCard
          title="Llegando a fiscal hoy"
          subtitle="Arribos a depósito fiscal"
          icon={<Warehouse size={18} weight="fill" className="text-emerald-600 dark:text-emerald-400" />}
          iconBg="bg-emerald-100 dark:bg-emerald-500/10"
          barColor="var(--chart-3)"
          matches={snapshot.llegandoFiscal}
          emptyLabel="Sin arribos fiscales hoy"
          onRowClick={openOpMatch}
          column="llegandoFiscal"
          checksByRef={checksByRef}
          onToggleAviso={toggleAviso}
        />
      </div>
      )}

      {/* FCL quick-edit modal (admin, when onPatchShipment is provided + row has __dbId) */}
      {quickEditMatch?.shipment.__dbId && (
        <ContainerQuickEdit
          key={`${quickEditMatch.op.CNTR_OP || quickEditMatch.shipment.CNTR || ''}-${quickEditMatch.shipment.REF}`}
          shipment={quickEditMatch.shipment}
          cntr={quickEditMatch.op.CNTR_OP || quickEditMatch.shipment.CNTR || ''}
          editable={!!onPatchShipment}
          knownTransportes={knownTransportes}
          open={quickEditOpen}
          onOpenChange={(o) => {
            setQuickEditOpen(o)
            if (!o) setQuickEditMatch(null)
          }}
          onPatch={(dbId, fields) => onPatchShipment?.(dbId, fields)}
          onMasDatos={() => {
            // dbId resuelve la op exacta post-flip; REF como fallback.
            const key = quickEditMatch.shipment.__dbId || quickEditMatch.shipment.REF
            setQuickEditOpen(false)
            setQuickEditMatch(null)
            onOpenDetail?.(key)
          }}
          onSaved={() => {
            setQuickEditOpen(false)
            setQuickEditMatch(null)
          }}
        />
      )}

      {/* Read-only details dialog — non-FCL rows (no __dbId) or LIBRE alert rows.
          clientView=true hides the "Guardar Cambios" button so the no-op onSave
          doesn't show a misleading enabled save action (Fix 5). */}
      {selected && (
        <ShipmentDetailsDialog
          shipment={selected}
          open={open}
          onOpenChange={setOpen}
          onSave={() => {}}
          clientView
          documents={documents}
          reports={reports}
          originPhotos={originPhotos}
          onUpdateOriginPhotos={onUpdateOriginPhotos}
        />
      )}
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

interface StatChipProps {
  icon: React.ReactNode
  label: string
  tone: 'muted' | 'destructive'
}

function StatChip({ icon, label, tone }: StatChipProps) {
  const toneClasses = tone === 'destructive'
    ? 'bg-destructive/10 text-destructive border-destructive/20'
    : 'bg-muted text-muted-foreground border-border'
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${toneClasses}`}>
      {icon}
      {label}
    </span>
  )
}

interface TodayCardProps {
  title: string
  subtitle: string
  icon: React.ReactNode
  iconBg: string
  barColor: string
  matches: OpMatch[]
  emptyLabel: string
  onRowClick: (match: OpMatch) => void
  /** Columna de HOY → determina qué paso de aviso marca el chip de la fila. */
  column: TodayColumn
  /** Estado de los pasos por ref (ref_checks) — para pintar el chip verde/gris. */
  checksByRef: Map<string, RefCheckSteps>
  /** Toggle del aviso de UNA fila = un contenedor (op.CNTR_OP) de la ref. */
  onToggleAviso: (shipment: ParsedShipment, cntr: string, key: CheckStepKey, label: string) => void
}

function TodayCard({ title, subtitle, icon, iconBg, barColor, matches, emptyLabel, onRowClick, column, checksByRef, onToggleAviso }: TodayCardProps) {
  const stepKey = AVISO_STEP_BY_COLUMN[column]
  const avisoLabel = AVISO_LABEL_BY_COLUMN[column]
  return (
    <Card
      className="accent-top overflow-hidden shadow-sm hover:shadow-md transition-shadow card-lift"
      style={{ ['--bar-color' as any]: barColor }}
    >
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2.5 mb-4">
          <div className={`p-1.5 rounded-md ${iconBg}`}>{icon}</div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold uppercase tracking-wide truncate">{title}</h3>
            <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
          </div>
          <span className="inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-muted text-foreground text-xs font-bold tabular-nums">
            {matches.length}
          </span>
        </div>
        {matches.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground italic">{emptyLabel}</div>
        ) : (
          <div className="divide-y divide-border/60">
            {matches.map((match, idx) => {
              const { shipment, op } = match
              // Aviso POR CONTENEDOR: el estado de ESTA línea (op.CNTR_OP), no de
              // toda la ref → 2 contenedores del mismo ref se marcan por separado.
              const step = (checksByRef.get(normalizeRef(shipment.REF)) || {})[stepKey]
              const aviso = avisoForCntr(step, op.CNTR_OP || '')
              return (
              <button
                key={`${shipment.REF}-${op.CNTR_OP || idx}`}
                onClick={() => onRowClick(match)}
                className="row-hover w-full text-left py-2.5 px-2 -mx-2 rounded-md hover:bg-muted/60 cursor-pointer flex items-start gap-2 group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="font-mono text-sm font-bold tracking-tight flex items-center gap-1.5 min-w-0">
                      <span>{shipment.REF}</span>
                      {op.CNTR_OP && (
                        <>
                          <span className="text-muted-foreground/60 font-normal">·</span>
                          <span className="text-[11px] font-semibold text-muted-foreground truncate">
                            {op.CNTR_OP}
                            {op.TIPO && <span className="ml-1 opacity-70">[{op.TIPO}]</span>}
                          </span>
                        </>
                      )}
                    </span>
                    <span className="text-[11px] font-medium text-foreground/80 truncate max-w-[40%] shrink-0">
                      {op.CLIENTE_OP || shipment.CLIENTE || '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Package size={11} />
                    <span className="truncate">
                      <span className="font-medium">{op.DEPOSITO || '—'}</span>
                      <span className="mx-1 opacity-60">→</span>
                      <span className="font-medium">{op.FISCAL || '—'}</span>
                      {op.TRANSPORTE && <span className="ml-1.5 opacity-70">· {op.TRANSPORTE}</span>}
                    </span>
                  </div>
                </div>
                <AvisoChip
                  aviso={aviso}
                  label={avisoLabel}
                  onToggle={() => onToggleAviso(shipment, op.CNTR_OP || '', stepKey, avisoLabel)}
                />
                <CaretRight size={14} className="row-caret text-muted-foreground mt-1 shrink-0" />
              </button>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface LibreAlertRowProps {
  alert: LibreAlert
  onClick: () => void
}

function LibreAlertRow({ alert, onClick }: LibreAlertRowProps) {
  const { shipment, daysOverdue, severity } = alert
  const badgeClasses =
    severity === 'vencido'
      ? 'bg-destructive text-destructive-foreground'
      : severity === 'hoy'
      ? 'bg-orange-500 text-white'
      : 'bg-amber-400 text-amber-950'
  const badgeLabel =
    severity === 'vencido'
      ? `vencido hace ${daysOverdue}d`
      : severity === 'hoy'
      ? 'vence HOY'
      : `vence en ${Math.abs(daysOverdue)}d`

  return (
    <button
      onClick={onClick}
      className="row-hover w-full text-left py-2 px-2 -mx-2 rounded-md hover:bg-background/70 cursor-pointer flex items-center gap-3 group"
    >
      <div className="p-1 bg-destructive/10 rounded shrink-0">
        <Warning size={14} weight="fill" className="text-destructive" />
      </div>
      <span className="font-mono font-bold text-sm">{shipment.REF}</span>
      <span className="text-sm text-muted-foreground truncate flex-1">
        <span className="font-medium text-foreground/80">{shipment.CLIENTE || '—'}</span>
        {shipment.TERMINAL && <span className="opacity-70"> · {shipment.TERMINAL}</span>}
      </span>
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${badgeClasses}`}>
        {badgeLabel}
      </span>
      <CaretRight size={14} className="row-caret text-muted-foreground shrink-0" />
    </button>
  )
}

// ─── Chip "Aviso" por tarjeta (toggle de un paso de ref_checks) ─────────
// Vive DENTRO del <button> de la fila → es un <span role="button"> con
// stopPropagation (mismo patrón que TelexChip de ChecksBoard) para que el click
// marque el aviso SIN abrir el detalle de la tarjeta. Hueco/gris sin avisar,
// verde (emerald) con ícono Check una vez avisado. El tooltip trae la fecha y
// quién avisó ("Avisado 03/07 por Joaquín").
function AvisoChip({ aviso, label, onToggle }: { aviso?: RefCheckStep; label: string; onToggle: () => void }) {
  const done = !!aviso?.done
  const who = shortWho(aviso?.by)
  const title = done
    ? `${label} · Avisado${aviso?.date ? ` ${fmtDateDMY(aviso.date)}` : ''}${who ? ` por ${who}` : ''} — click para desmarcar`
    : `${label} — marcar como avisado`
  return (
    <span
      role="button"
      tabIndex={0}
      aria-pressed={done}
      aria-label={done ? `Quitar aviso (${label})` : `Marcar aviso (${label})`}
      title={title}
      onClick={e => { e.stopPropagation(); onToggle() }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onToggle() }
      }}
      className={`shrink-0 mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-4 cursor-pointer transition-shadow ${
        done
          ? 'bg-emerald-100 text-emerald-800 hover:ring-2 hover:ring-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300'
          : 'bg-muted text-muted-foreground border border-border hover:ring-2 hover:ring-primary/30'
      }`}
    >
      <Check size={11} weight="bold" className={done ? 'opacity-100' : 'opacity-50'} />
      Aviso
    </span>
  )
}
