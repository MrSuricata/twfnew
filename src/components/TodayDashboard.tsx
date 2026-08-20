import { useState, useMemo, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import {
  Truck,
  Warehouse,
  MapPin,
  Warning,
  LockKey,
  CheckCircle,
  Coffee,
  Package,
  Siren,
  PencilSimple,
  CaretRight,
  CalendarBlank,
  CircleNotch,
  Check,
  Coins,
} from '@phosphor-icons/react'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import {
  buildTodaySnapshot,
  AVISO_STEP_BY_COLUMN,
  AVISO_LABEL_BY_COLUMN,
  type OpMatch,
  type LibreAlert,
  type TodayColumn,
  type TruckMatch,
} from '@/lib/todayFilters'
import ShipmentDetailsDialog from './ShipmentDetailsDialog'
import ContainerQuickEdit from './operations/ContainerQuickEdit'
import { deriveKnownTransportes, deriveKnownValues, DEPOSITOS_UY, type DbShipment } from '@/lib/operationsTypes'
import { faltantesUrgentes, resumenFaltantes, FALTANTES_DIAS_COORDINACION, type FaltanteUrgente, type CampoFaltante } from '@/lib/datosFaltantes'
import { buildFaltantePatch, columnaDeCampo, FALTANTE_INPUTS } from '@/lib/faltantesEdit'
import {
  esCargaSinDatosPago, montosUrgentes, formaPagoEfectiva, parseMontoUY,
  MONTO_KEYS, type PagoRubro,
} from '@/lib/pagosVencimientos'
import type { CatalogClient } from '@/lib/clientCatalog'
import type { ShipmentDocument, OperativeReport, OriginPhoto } from '@/lib/quotationTypes'
import type { Truck as TruckType, TruckLoad } from '@/lib/truckTypes'
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
import { RefNotaLine, useRefNotas } from './RefNotaLine'
import { getAdminName } from '@/lib/authClient'
import { fmtDateDMY } from '@/lib/format'
import { fmtDMY } from '@/lib/salidaCheck'
import { isSinTelex } from '@/lib/telexCheck'

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

/** Puertos donde TWF recibe carga — filtro de la tarjeta de incompletas.
 *  "Sin destino" es su propio grupo: esas cargas no matchean ningún país y
 *  son justo las que necesitan que les completen el dato. */
const DESTINOS_FILTRO: { id: string; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'UY', label: 'Montevideo' },
  { id: 'AR', label: 'Buenos Aires' },
  { id: 'CL', label: 'Chile' },
  { id: 'OTRO', label: 'Otros' },
  { id: 'SIN', label: 'Sin destino' },
]

/** "quién lo marcó" corto para el tooltip: parte antes de la @ si es email. */
function shortWho(by: string | undefined): string {
  return String(by || '').split('@')[0]
}

interface TodayDashboardProps {
  shipments: ParsedShipment[]
  /** Filas crudas de la DB (pkgs/agente/doc_number…) — alimentan la tarjeta
   *  de campos pendientes; los demás bloques siguen sobre ParsedShipment. */
  dbShipments?: DbShipment[]
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
  /** Catálogo de clientes — canonicaliza el cliente tipeado en el editor de faltantes. */
  clients?: CatalogClient[]
  /** Navega a otra pestaña del dashboard (el contador de montos abre Pagos). */
  onOpenTab?: (tab: string) => void
}

/**
 * "HOY" — quick-glance dashboard for TWF staff.
 *
 * Shows three cards (cargas saliendo / en frontera / llegando a fiscal) + a LIBRE alert
 * strip. Intended as the default admin landing — what's moving today, at a glance.
 */
export default function TodayDashboard({
  shipments,
  dbShipments = [],
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
  clients = [],
  onOpenTab,
}: TodayDashboardProps) {
  const [selected, setSelected] = useState<ParsedShipment | null>(null)
  const [open, setOpen] = useState(false)

  // Bitácora de gestiones (ref_notas) — las notas de "lo reclamé por wpp…"
  // que se ven acá y en la pestaña Checks.
  const { notas, agregar: agregarNota } = useRefNotas()

  // Quick-edit state for FCL rows (opened via ContainerQuickEdit)
  const [quickEditMatch, setQuickEditMatch] = useState<OpMatch | null>(null)
  const [quickEditOpen, setQuickEditOpen] = useState(false)

  // Los consolidados entran en las MISMAS 3 columnas que las cargas sueltas, y
  // sus cargas no se listan aparte (van dentro de la tarjeta del camión).

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
  // El snapshot se arma DESPUÉS de checksByRef: la alerta "llegan sin liberar"
  // necesita saber cuáles ya tienen la liberación marcada.
  const snapshot = useMemo(
    () => buildTodaySnapshot(shipments, trucks, truckLoads, checksByRef),
    [shipments, trucks, truckLoads, checksByRef],
  )

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
      // Si la ref ya lleva estado POR CONTENEDOR, el toggle nivel-ref lo pisaría
      // entero (hallazgo revisión 12/08): se pierde qué contenedor estaba avisado.
      if (step?.cntrs && Object.keys(step.cntrs).length > 0) {
        toast.error('Esta ref lleva avisos por contenedor — marcá el aviso desde la tarjeta del contenedor', { description: ref })
        return
      }
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

  // Agentes y líneas ya usados → sugerencias de los inputs del editor.
  const knownAgentes = useMemo(
    () => deriveKnownValues((dbShipments || []).map(s => s.agente)),
    [dbShipments]
  )
  const knownLineas = useMemo(
    () => deriveKnownValues((dbShipments || []).map(s => s.linea)),
    [dbShipments]
  )

  // Fila desplegada de la tarjeta de incompletas (una a la vez, keyed por ref).
  const [incompletaAbierta, setIncompletaAbierta] = useState<string | null>(null)

  // Campos pendientes URGENTES: llegan dentro de la semana (o ya llegaron sin
  // salida) con datos faltantes según su etapa — la webapp repartiendo tareas.
  const incompletasTodas = useMemo(() => {
    const hoy = new Date()
    return faltantesUrgentes(
      (dbShipments || [])
        .filter(s => !s.archived)
        .map(s => ({
          dbId: s.id, ref: s.ref, mode: s.mode, pais: s.dest_country, cliente: s.cliente,
          eta: s.eta, etd: s.etd, buque: s.buque, linea: s.linea, docNumber: s.doc_number,
          cntr: s.contenedor,
          pkgs: s.pkgs, kg: s.kg, m3: s.m3, agente: s.agente, deposito: s.deposito,
          operativa: s.operativa, transporte: s.transporte, fiscal: s.fiscal, salida: s.salida,
        })),
      hoy,
    )
  }, [dbShipments])

  // Filtro por puerto de llegada (Brian 18/08): la tarjeta arrancó solo con
  // Uruguay; ahora se elige el destino. "Sin destino" es su propio grupo — si
  // no, esas cargas quedan invisibles bajo cualquier filtro y son justo las
  // que necesitan que les completen el país.
  const [destinoFiltro, setDestinoFiltro] = useState<string>('UY')
  const paisDe = (p: string | null | undefined): string => {
    const v = String(p || '').trim().toUpperCase()
    return v === 'UY' || v === 'AR' || v === 'CL' || v === 'OTRO' ? v : 'SIN'
  }
  const incompletasPorDestino = useMemo(() => {
    const m: Record<string, number> = { all: incompletasTodas.length }
    for (const u of incompletasTodas) m[paisDe(u.carga.pais)] = (m[paisDe(u.carga.pais)] || 0) + 1
    return m
  }, [incompletasTodas])
  const incompletas = useMemo(
    () => destinoFiltro === 'all' ? incompletasTodas : incompletasTodas.filter(u => paisDe(u.carga.pais) === destinoFiltro),
    [incompletasTodas, destinoFiltro]
  )

  // Cargas sin NINGÚN monto cargado — mismo criterio que la pestaña Pagos
  // (esCargaSinDatosPago: FCL viva, sin Chile, ETA no más vieja de 60 días).
  // Va como contador que lleva a Pagos, no como campo de cada fila: son 60 de
  // 76 cargas y taparían lo operativo, y el criterio tiene que ser UNO solo.
  const sinMontos = useMemo(() => {
    const hoyIso = todayIso()
    return (dbShipments || []).filter(s => esCargaSinDatosPago(s, hoyIso)).length
  }, [dbShipments])

  // Sub-pestaña de la card de incompletos (Brian 20/08, revisa la decisión del
  // 18/08 de no mostrar montos acá): los montos van en una vista PROPIA — no
  // como campos de cada fila operativa — y solo la tajada urgente: sin montos
  // Y llegando dentro de la ventana de la card. Mismo criterio que Pagos.
  const [cardTab, setCardTab] = useState<'datos' | 'montos'>('datos')
  const montosCard = useMemo(
    () => montosUrgentes(dbShipments || [], todayIso(), FALTANTES_DIAS_COORDINACION),
    [dbShipments],
  )

  // Carga inicial en curso y todavía sin nada que mostrar → estado "Cargando"
  // en vez del empty state ("Día tranquilo"), para no dar un falso "no hay nada
  // hoy" mientras el banner de sincronizando sigue activo. Con datos ya
  // cargados, isDataLoading no cambia nada. Los consolidados ya están contados
  // dentro de snapshot.hasMovement.
  const initialLoading = isDataLoading && !snapshot.hasMovement

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
              {snapshot.salidasPisadas.length > 0 && (
                <StatChip icon={<Siren size={14} weight="fill" />} label={`${snapshot.salidasPisadas.length} salida${snapshot.salidasPisadas.length === 1 ? '' : 's'} pisada${snapshot.salidasPisadas.length === 1 ? '' : 's'}`} tone="destructive" />
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

      {/* ── Empty state (los consolidados ya cuentan en hasMovement) ── */}
      {!initialLoading && !snapshot.hasMovement && (
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

      {/* ── Salidas pisadas por el buque ─────────────────── */}
      {snapshot.salidasPisadas.length > 0 && (
        <Card className="accent-top overflow-hidden bg-destructive/[0.04] border-destructive/25" style={{ ['--bar-color' as any]: 'var(--destructive)' }}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="p-1.5 bg-destructive/10 rounded-md">
                <Warning size={18} weight="fill" className="text-destructive pulse-soft" />
              </div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-destructive">
                Salidas pisadas por el buque
              </h2>
              <span className="ml-auto inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-destructive text-destructive-foreground text-xs font-bold">
                {snapshot.salidasPisadas.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              El buque se movió y estas salidas quedaron pisadas (o muy justas) con la llegada a MVD — recoordinar con depósito y transporte.
            </p>
            <div className="space-y-1">
              {snapshot.salidasPisadas.map(a => (
                <button
                  key={`${a.shipment.REF}-${a.cntr}`}
                  type="button"
                  onClick={() => openOpMatch({ shipment: a.shipment, op: a.op })}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left hover:bg-destructive/10 transition-colors"
                >
                  <span className="font-mono text-sm font-semibold shrink-0 min-w-[64px]">{a.shipment.REF}</span>
                  <span className="text-sm text-foreground/85 truncate flex-1 min-w-0">
                    {a.shipment.CLIENTE || '—'}
                    {a.cntr && <span className="hidden sm:inline font-mono text-xs text-muted-foreground ml-2">{a.cntr}</span>}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0 hidden md:inline">
                    sale {fmtDMY(a.salida)} · buque llega {fmtDMY(a.eta)}
                  </span>
                  <span className={`text-xs font-bold shrink-0 px-1.5 py-0.5 rounded ${
                    a.grave
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  }`}>
                    {a.margen < 0 ? 'IMPOSIBLE' : a.margen === 0 ? 'MISMO DÍA' : 'MUY JUSTA'}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Llegan con datos incompletos ─────────────────── */}
      {incompletasTodas.length > 0 && (
        <Card className="accent-top overflow-hidden bg-amber-500/[0.04] border-amber-500/25" style={{ ['--bar-color' as any]: 'rgb(245 158 11)' }}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="p-1.5 bg-amber-500/10 rounded-md">
                <PencilSimple size={18} weight="fill" className="text-amber-600" />
              </div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-700">
                Llegan con datos incompletos
              </h2>
              <span className="ml-auto inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-amber-500 text-white text-xs font-bold">
                {incompletas.length}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mb-2">
              {([['datos', `Datos · ${incompletas.length}`], ['montos', `Montos · ${montosCard.length}`]] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCardTab(id)}
                  aria-pressed={cardTab === id}
                  className={`h-7 px-3 rounded-full text-xs font-bold transition-colors ${
                    cardTab === id ? 'bg-amber-600 text-white' : 'bg-background/60 text-muted-foreground border border-border hover:bg-amber-500/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mb-2.5">
              {cardTab === 'datos'
                ? `Llegan dentro de ${FALTANTES_DIAS_COORDINACION} días (o ya llegaron sin salida) y les faltan campos según su etapa — tocá una carga y completá los campos acá mismo.`
                : `Sin ningún monto cargado y llegando dentro de ${FALTANTES_DIAS_COORDINACION} días (o ya llegadas): la plata que vence primero. Vacío = sin dato · 0 = ya pagado.`}
            </p>
            {cardTab === 'datos' && (
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              {DESTINOS_FILTRO.map(d => {
                const n = incompletasPorDestino[d.id] || 0
                // Un destino sin nada no ocupa lugar, salvo que sea el elegido
                // (si no, tocarlo lo haría desaparecer) o el "Todos".
                if (n === 0 && d.id !== destinoFiltro && d.id !== 'all') return null
                const activo = destinoFiltro === d.id
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDestinoFiltro(d.id)}
                    aria-pressed={activo}
                    className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-semibold transition-colors ${
                      activo
                        ? 'bg-amber-500 text-white'
                        : 'bg-background/60 text-muted-foreground border border-border hover:bg-amber-500/10'
                    }`}
                  >
                    {d.label}
                    <span className={activo ? 'opacity-80' : 'opacity-60'}>{n}</span>
                  </button>
                )
              })}
            </div>
            )}
            {cardTab === 'montos' && (
              <div className="space-y-1">
                {montosCard.length === 0 && (
                  <p className="px-2.5 py-3 text-xs text-muted-foreground">
                    🎉 Todo lo que llega estos días tiene montos cargados.
                  </p>
                )}
                {montosCard.map(s => (
                  <MontosUrgenteRow key={s.id} s={s} onPatchShipment={onPatchShipment} onOpenDetail={onOpenDetail} />
                ))}
                {sinMontos > montosCard.length && (
                  <button
                    type="button"
                    onClick={() => onOpenTab?.('pagos')}
                    className="mt-1 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-semibold text-muted-foreground border border-dashed border-border hover:bg-muted transition-colors"
                    title="El resto no llega todavía: está en Pagos → Sin datos, ordenado por llegada"
                  >
                    <Coins size={13} weight="bold" />
                    Ver las {sinMontos} en Pagos
                    <CaretRight size={11} weight="bold" />
                  </button>
                )}
              </div>
            )}
            {cardTab === 'datos' && (
            <div className="space-y-1">
              {incompletas.length === 0 && (
                <p className="px-2.5 py-3 text-xs text-muted-foreground">
                  Nada incompleto en este destino — probá otro filtro.
                </p>
              )}
              {incompletas.slice(0, 10).map(u => {
                // dbId como clave: la REF puede estar duplicada (el alta lo
                // permite con confirmación) y duplicaría keys/expansión.
                const rowKey = String(u.carga.dbId || u.carga.ref)
                return (
                  <IncompletaRow
                    key={rowKey}
                    u={u}
                    dbRow={dbShipments.find(s => s.id === u.carga.dbId)}
                    expanded={incompletaAbierta === rowKey}
                    onToggle={() => setIncompletaAbierta(prev => (prev === rowKey ? null : rowKey))}
                    onPatchShipment={onPatchShipment}
                    onOpenDetail={onOpenDetail}
                    transportes={knownTransportes}
                    agentes={knownAgentes}
                    lineas={knownLineas}
                    clientes={clients}
                  />
                )
              })}
              {incompletas.length > 10 && (
                <p className="px-2.5 pt-1 text-xs text-muted-foreground">
                  … y {incompletas.length - 10} más — están todas en Operaciones con el filtro <b>Faltan datos</b>.
                </p>
              )}
            </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Llegan sin liberar ───────────────────────────── */}
      {snapshot.sinLiberar.length === 0 && (
        /* Estado feliz explícito (pedido Brian 13/08): que se VEA que el
           trabajo de liberación está al día, no solo la ausencia de alerta. */
        <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.05] px-4 py-2.5">
          <CheckCircle size={18} weight="fill" className="text-emerald-600 dark:text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            <b>¡Felicitaciones!</b> Todas tus cargas de los próximos 10 días están liberadas.
          </p>
        </div>
      )}
      {snapshot.sinLiberar.length > 0 && (
        <Card className="accent-top overflow-hidden bg-amber-500/[0.04] border-amber-500/25" style={{ ['--bar-color' as any]: 'rgb(245 158 11)' }}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="p-1.5 bg-amber-500/10 rounded-md">
                <LockKey size={18} weight="fill" className="text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Llegan sin liberar
              </h2>
              <span className="ml-auto inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-amber-500 text-white text-xs font-bold">
                {snapshot.sinLiberar.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Llegan dentro de 10 días y la naviera todavía no confirmó la liberación — sin eso el contenedor no se retira.
            </p>
            <div className="space-y-1">
              {snapshot.sinLiberar.map(a => (
                <div key={a.shipment.REF} className="rounded-md hover:bg-amber-500/10 transition-colors pb-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const op = (a.shipment.operativas ?? [])[0]
                      if (op) openOpMatch({ shipment: a.shipment, op })
                      else openShipment(a.shipment)
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 pt-2 pb-0.5 text-left"
                  >
                    <span className="font-mono text-sm font-semibold shrink-0 min-w-[64px]">{a.shipment.REF}</span>
                    <span className="text-sm text-foreground/85 truncate flex-1 min-w-0">{a.shipment.CLIENTE || '—'}</span>
                    {a.shipment.BUQUE && (
                      <span className="hidden md:inline text-xs text-muted-foreground truncate max-w-[160px]">{a.shipment.BUQUE}</span>
                    )}
                    <span className={`text-xs font-semibold shrink-0 ${
                      a.severity === 'vencido' ? 'text-destructive'
                        : a.severity === 'urgente' ? 'text-amber-600 dark:text-amber-400'
                        : 'text-muted-foreground'
                    }`}>
                      {a.diasParaLlegar < 0
                        ? `llegó hace ${-a.diasParaLlegar}d`
                        : a.diasParaLlegar === 0 ? 'llega hoy'
                        : `en ${a.diasParaLlegar}d`}
                    </span>
                  </button>
                  {/* Bitácora de gestiones: la última nota ES el estado del
                      reclamo; verde = gestionada hoy, ámbar = quedó de antes. */}
                  <RefNotaLine
                    refCarga={a.shipment.REF}
                    nota={notas.get(normalizeRef(a.shipment.REF))}
                    onAgregar={agregarNota}
                  />
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
          trucks={snapshot.trucksSalientes}
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
          trucks={snapshot.trucksFrontera}
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
          trucks={snapshot.trucksLlegandoFiscal}
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
  /** Consolidados de esta columna. Van arriba de las cargas sueltas: el camión
   *  se mueve como una unidad y sus cargas no se repiten abajo. */
  trucks?: TruckMatch[]
  emptyLabel: string
  onRowClick: (match: OpMatch) => void
  /** Columna de HOY → determina qué paso de aviso marca el chip de la fila. */
  column: TodayColumn
  /** Estado de los pasos por ref (ref_checks) — para pintar el chip verde/gris. */
  checksByRef: Map<string, RefCheckSteps>
  /** Toggle del aviso de UNA fila = un contenedor (op.CNTR_OP) de la ref. */
  onToggleAviso: (shipment: ParsedShipment, cntr: string, key: CheckStepKey, label: string) => void
}

function TodayCard({ title, subtitle, icon, iconBg, barColor, matches, trucks = [], emptyLabel, onRowClick, column, checksByRef, onToggleAviso }: TodayCardProps) {
  const stepKey = AVISO_STEP_BY_COLUMN[column]
  const avisoLabel = AVISO_LABEL_BY_COLUMN[column]
  const total = matches.length + trucks.length
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
            {total}
          </span>
        </div>
        {/* Consolidados primero: son un camión entero, no una carga suelta. */}
        {trucks.length > 0 && (
          <div className="mb-3 space-y-2">
            {trucks.map(({ truck, refs, kg, m3 }) => (
              <div
                key={truck.id}
                className="rounded-lg border border-amber-300/70 bg-amber-50/60 dark:bg-amber-500/5 px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm">🚛 {truck.code}</span>
                  <Badge variant="outline" className="text-[10px] whitespace-nowrap border-amber-400 text-amber-700 dark:text-amber-400">
                    Consolidado
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate" title={refs.join(', ')}>
                  {truck.transport || 'Sin transporte'}
                  {refs.length > 0 ? ` · Lleva: ${refs.join(', ')}` : ' · Sin cargas'}
                </p>
                {(kg > 0 || m3 > 0) && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {Math.round(kg).toLocaleString('es-UY')} kg · {m3.toLocaleString('es-UY', { maximumFractionDigits: 1 })} m³
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        {total === 0 ? (
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
                  {/* Sale HOY con el telex sin liberar → no se puede retirar el contenedor. */}
                  {column === 'salientes' && isSinTelex(op.TLX) && (
                    <span className="inline-block mb-0.5 rounded-full px-1.5 py-px text-[10px] font-semibold bg-red-100 text-red-700">
                      🚨 SIN TELEX
                    </span>
                  )}
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

// ─── Fila de la sub-pestaña Montos (card de incompletos) ─────────────────
// Borrador local + UN botón Guardar: si cada campo guardara al salir, la fila
// desaparecería al primer blur (con un solo monto la carga ya no es "sin
// datos") y quedarían tres campos sin cargar. Vacío = no guardar ese rubro.
const RUBRO_LABEL: { rubro: PagoRubro; label: string }[] = [
  { rubro: 'flete', label: 'Flete' },
  { rubro: 'locales', label: 'Locales' },
  { rubro: 'terminal', label: 'Terminal' },
  { rubro: 'devolucion', label: 'Devolución' },
]

function MontosUrgenteRow({ s, onPatchShipment, onOpenDetail }: {
  s: DbShipment
  onPatchShipment?: (id: string, fields: Record<string, unknown>) => void
  onOpenDetail?: (ref: string) => void
}) {
  const [draft, setDraft] = useState<Record<PagoRubro, string>>({ flete: '', locales: '', terminal: '', devolucion: '' })
  const fp = formaPagoEfectiva(s)
  const algo = RUBRO_LABEL.some(r => draft[r.rubro].trim() !== '')

  const guardar = () => {
    if (!onPatchShipment || !algo) return
    const fields: Record<string, unknown> = {}
    const partes: string[] = []
    for (const { rubro, label } of RUBRO_LABEL) {
      const t = draft[rubro].trim()
      if (t === '') continue
      const n = parseMontoUY(t)
      if (!isFinite(n) || n < 0) {
        toast.error(`${label}: "${t}" no es un monto válido`)
        return
      }
      fields[MONTO_KEYS[rubro]] = n
      partes.push(`${label} ${n}`)
    }
    onPatchShipment(String(s.id), fields)
    toast.success(`${s.ref} — montos cargados`, { description: partes.join(' · ') })
  }

  return (
    <div className="rounded-lg border border-border/70 bg-background/60 px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          type="button"
          onClick={() => onOpenDetail?.(s.ref)}
          className="font-bold text-sm hover:underline"
        >
          {s.ref}
        </button>
        <span className="text-xs text-muted-foreground truncate max-w-[180px]" title={s.cliente}>{s.cliente || '—'}</span>
        <span className="text-xs text-muted-foreground whitespace-nowrap">ETA {fmtDateDMY(s.eta) || '—'}</span>
        <span className={`text-[11px] whitespace-nowrap ${fp.value === 'al arribo' ? 'text-amber-700 font-semibold' : 'text-muted-foreground'}`}>
          {fp.value}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-end gap-2">
        {RUBRO_LABEL.map(({ rubro, label }) => (
          <label key={rubro} className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
            <input
              type="text"
              inputMode="decimal"
              value={draft[rubro]}
              onChange={e => setDraft(d => ({ ...d, [rubro]: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') guardar() }}
              placeholder="—"
              className="h-8 w-24 rounded-md border border-border bg-background px-2 text-sm text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </label>
        ))}
        <button
          type="button"
          disabled={!algo || !onPatchShipment}
          onClick={guardar}
          className="h-8 px-3 rounded-md bg-amber-600 text-white text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          Guardar
        </button>
      </div>
    </div>
  )
}

// ─── Fila desplegable de "Llegan con datos incompletos" ──────────────────
// Tocar la fila la despliega con UN input por campo faltante para completarlo
// ahí mismo (pedido Brian 17/08). El guardado usa el mismo camino que el panel
// de detalle: buildFaltantePatch (columna + propagación al array operativas) →
// onPatchShipment (optimista con revert en App). Los campos completados quedan
// visibles como chips ✓ mientras la fila siga desplegada (si desaparecieran al
// instante, el layout se corre bajo el puntero y se comen clicks); cuando no
// falta nada, la fila sale sola de la tarjeta.
function IncompletaRow({ u, dbRow, expanded, onToggle, onPatchShipment, onOpenDetail, transportes, agentes, lineas, clientes }: {
  u: FaltanteUrgente
  dbRow?: DbShipment
  expanded: boolean
  onToggle: () => void
  onPatchShipment?: (id: string, fields: Record<string, unknown>) => void
  onOpenDetail?: (ref: string) => void
  transportes: string[]
  agentes: string[]
  lineas: string[]
  clientes: CatalogClient[]
}) {
  // Snapshot de los faltantes al ABRIR la fila: el panel muestra esa lista fija
  // (input si sigue faltando, chip ✓ si ya se completó) para que nada se
  // desmonte bajo el foco mientras se completan varios campos seguidos.
  const [camposPanel, setCamposPanel] = useState<CampoFaltante[] | null>(null)
  useEffect(() => {
    if (expanded) setCamposPanel(prev => prev ?? u.faltantes)
    else setCamposPanel(null)
    // u.faltantes solo importa en el instante de abrir — el snapshot es a propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])
  const diasLabel = u.diasAEta < 0 ? `llegó hace ${-u.diasAEta}d` : u.diasAEta === 0 ? 'llega hoy' : `en ${u.diasAEta}d`
  const header = (
    <>
      <span className="font-mono text-sm font-semibold shrink-0 min-w-[64px]">{u.carga.ref}</span>
      <span className="text-sm text-foreground/85 truncate flex-1 min-w-0">{u.carga.cliente || '—'}</span>
      <span className="hidden sm:inline text-xs text-amber-700 truncate max-w-[300px]">
        faltan: {resumenFaltantes(u.faltantes)}
      </span>
      <span className="text-xs font-semibold shrink-0 text-muted-foreground">{diasLabel}</span>
    </>
  )

  // Sin PATCH o sin fila de DB (no debería pasar: la tarjeta nace de dbShipments),
  // el click navega a la ficha como antes.
  if (!onPatchShipment || !dbRow) {
    return (
      <button
        type="button"
        onClick={() => onOpenDetail?.(String(u.carga.dbId || u.carga.ref || ''))}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left hover:bg-amber-500/10 transition-colors"
      >
        {header}
      </button>
    )
  }

  return (
    <div className={`rounded-md transition-colors ${expanded ? 'bg-amber-500/10' : 'hover:bg-amber-500/10'}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left"
      >
        <CaretRight size={12} weight="bold" className={`shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
        {header}
      </button>
      {expanded && (
        <div className="px-2.5 pb-2.5 pl-8">
          <div className="flex flex-wrap items-end gap-2">
            {(camposPanel ?? u.faltantes).map(f => {
              const sigueFaltando = u.faltantes.some(x => x.campo === f.campo)
              if (!sigueFaltando) {
                const col = columnaDeCampo(f.campo)
                const valor = col ? String((dbRow as unknown as Record<string, unknown>)[col] ?? '') : ''
                return (
                  <span
                    key={f.campo}
                    className="inline-flex items-center gap-1 h-9 rounded border border-emerald-500/30 bg-emerald-500/[0.07] px-2 text-sm text-emerald-700 dark:text-emerald-400"
                  >
                    <Check size={13} weight="bold" />
                    <span className="text-[11px] uppercase tracking-wide opacity-70">{f.etiqueta}</span>
                    <span className="font-medium truncate max-w-[160px]">{valor || '✓'}</span>
                  </span>
                )
              }
              return (
                <CampoFaltanteInput
                  key={f.campo}
                  campo={f.campo}
                  etiqueta={f.etiqueta}
                  dbRow={dbRow}
                  onPatchShipment={onPatchShipment}
                  transportes={transportes}
                  agentes={agentes}
                  lineas={lineas}
                  clientes={clientes}
                />
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => onOpenDetail?.(String(u.carga.dbId || u.carga.ref || ''))}
            className="mt-2 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Abrir ficha completa →
          </button>
        </div>
      )}
    </div>
  )
}

// Un input por campo faltante. Borrador local + commit en blur/Enter (Escape
// limpia) — NUNCA onChange→PATCH directo (tipear el año dispara '0002-…' y el
// remount pierde el foco; misma regla que la grilla). Los selects también
// guardan en blur/Enter: con onChange, navegar las opciones con ↑/↓ en un
// select nativo cerrado disparaba un PATCH + toast por cada flecha (revisión
// 17/08). Toast con Deshacer SOLO para patches escalares: si el patch propaga
// el array `operativas`, reponer el snapshot completo pisaría commits
// posteriores de la misma fila (misma razón por la que el revert de App es
// granular por clave — con el array, la clave ES el conjunto entero).
function CampoFaltanteInput({ campo, etiqueta, dbRow, onPatchShipment, transportes, agentes, lineas, clientes }: {
  campo: CampoFaltante['campo']
  etiqueta: string
  dbRow: DbShipment
  onPatchShipment: (id: string, fields: Record<string, unknown>) => void
  transportes: string[]
  agentes: string[]
  lineas: string[]
  clientes: CatalogClient[]
}) {
  const [draft, setDraft] = useState('')
  const [invalido, setInvalido] = useState(false)
  const spec = FALTANTE_INPUTS[campo]
  if (!spec) return null

  const commit = () => {
    const texto = draft.trim()
    if (!texto) return
    const r = buildFaltantePatch(campo, texto, dbRow.operativas, clientes)
    if (!r.ok) { setInvalido(true); toast.error(`${etiqueta}: ${r.error}`, { description: String(dbRow.ref) }); return }
    setInvalido(false)
    const conArray = 'operativas' in r.patch
    // Valores previos de la fila para el Deshacer (granular, como App) —
    // solo cuando el patch es escalar (ver comentario del componente).
    const previos = Object.fromEntries(
      Object.keys(r.patch).map(k => [k, (dbRow as unknown as Record<string, unknown>)[k]])
    )
    onPatchShipment(dbRow.id, r.patch)
    toast.success(`${etiqueta} guardado · ${dbRow.ref}`, {
      description: String((r.patch as Record<string, unknown>)[Object.keys(r.patch)[0]] ?? texto),
      ...(conArray ? {} : { action: { label: 'Deshacer', onClick: () => onPatchShipment(dbRow.id, previos) } }),
    })
  }

  const base = 'h-9 rounded border bg-background px-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring'
  const borde = invalido ? 'border-red-400' : 'border-input'
  const listId = `dl-faltante-${campo}-${dbRow.id}`
  const sugerencias = spec.sugerencias === 'transportes' ? transportes
    : spec.sugerencias === 'agentes' ? agentes
    : spec.sugerencias === 'lineas' ? lineas
    : spec.sugerencias === 'depositos' ? DEPOSITOS_UY
    : []

  return (
    <label className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">{etiqueta}</span>
      {spec.widget === 'select' ? (
        <select
          value={draft}
          onChange={e => { setDraft(e.target.value); if (invalido) setInvalido(false) }}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            else if (e.key === 'Escape') { setDraft(''); setInvalido(false) }
          }}
          className={`${base} ${borde} w-44`}
        >
          <option value="">—</option>
          {(spec.opciones ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <>
          <input
            type={spec.widget === 'date' ? 'date' : 'text'}
            inputMode={spec.widget === 'number' ? 'decimal' : undefined}
            value={draft}
            placeholder={spec.placeholder}
            list={spec.widget === 'datalist' ? listId : undefined}
            onChange={e => { setDraft(e.target.value); if (invalido) setInvalido(false) }}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commit() }
              else if (e.key === 'Escape') { setDraft(''); setInvalido(false) }
            }}
            className={`${base} ${borde} ${spec.widget === 'number' ? 'w-24' : spec.widget === 'date' ? 'w-36' : 'w-44'}`}
          />
          {spec.widget === 'datalist' && (
            <datalist id={listId}>
              {sugerencias.map(v => <option key={v} value={v} />)}
            </datalist>
          )}
        </>
      )}
    </label>
  )
}
