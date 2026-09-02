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
  Anchor,
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
import { faltantesUrgentes, faltantesFuturos, resumenFaltantes, FALTANTES_DIAS_COORDINACION, type FaltanteUrgente, type CampoFaltante } from '@/lib/datosFaltantes'
import { buildFaltantePatch, columnaDeCampo, FALTANTE_INPUTS, DEVOLUCIONES_PLAZA } from '@/lib/faltantesEdit'
import ClienteSelect from '@/components/operations/ClienteSelect'
import {
  esCargaSinDatosPago, montosUrgentes, formaPagoEfectiva, parseMontoUY,
  paisDePago, agruparPorPais, MONTO_KEYS, type PagoRubro,
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
import { useBrand } from '@/lib/brand'
import { saludoPersonal } from '@/lib/saludo'
import { fmtDateDMY } from '@/lib/format'
import AvisosPartnersCard from './AvisosPartnersCard'
import { cargasMontecon, cargasSinTerminal, MONTECON_DIAS_ADELANTE, type AgendaRow, type CargaMontecon, type CargaSinTerminal } from '@/lib/monteconAgenda'
import { fetchMonteconAgenda, agendarMontecon, desagendarMontecon, marcarMontecon } from '@/lib/dataClient'
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
  /** Cambia de pestaña. `opts.ref` (solo 'checks'): la pestaña abre buscando esa ref. */
  onOpenTab?: (tab: string, opts?: { ref?: string }) => void
  /** Recarga TODO desde la DB (App.loadDataFromDB). Lo usa la card de avisos
   *  de partners después de confirmar: LIBRE=DEVUELTO o stock cambian en
   *  `shipments` y hay que verlos sin F5. */
  onReloadFromDB?: () => Promise<void>
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
  onReloadFromDB,
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
  // Hasta que ref_checks llegó, "no liberada" no se sabe: la etiqueta de la
  // fila de retiros espera este flag (si no, todo parpadea en rojo al abrir).
  const [checksCargados, setChecksCargados] = useState(false)
  const refreshChecks = useCallback(async () => {
    try {
      const rows = await fetchRefChecks()
      setChecksByRef(new Map(rows.map(r => [normalizeRef(r.ref), r.steps || {}])))
    } catch (err) {
      console.warn('[hoy] no se pudieron cargar los avisos:', err)
    } finally {
      // Como ChecksBoard: el fallo también "cargó" — las dos cards de HOY
      // pasan a decir lo mismo (todo sin liberar) en vez de contradecirse.
      setChecksCargados(true)
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
  // Bloque "Adelantar datos" (Brian 28/08): plegado por defecto.
  const [adelantarOpen, setAdelantarOpen] = useState(false)

  // Campos pendientes URGENTES: llegan dentro de la semana (o ya llegaron sin
  // salida) con datos faltantes según su etapa — la webapp repartiendo tareas.
  // Las LCL NO entran acá: tienen su propia card en HOY LCL (Brian 02/09:
  // "por algo dividimos el dashboard en LCL y FCL").
  const cargasCampos = useMemo(() =>
    (dbShipments || [])
      .filter(s => !s.archived && String(s.mode || '').toLowerCase() !== 'lcl')
      .map(s => ({
        dbId: s.id, ref: s.ref, mode: s.mode, pais: s.dest_country, cliente: s.cliente,
        clientRef: s.client_ref,
        eta: s.eta, etd: s.etd, buque: s.buque, linea: s.linea, docNumber: s.doc_number,
        cntr: s.contenedor,
        pkgs: s.pkgs, kg: s.kg, m3: s.m3, descripcion: s.observacion,
        agente: s.agente, deposito: s.deposito,
        operativa: s.operativa, transporte: s.transporte, fiscal: s.fiscal,
        terminal: s.terminal, dev: s.dev,
        devFecha: s.dev_fecha || (Array.isArray(s.operativas) ? (s.operativas.find(o => o.DEV_FECHA)?.DEV_FECHA || '') : ''),
        libre: s.libre || (Array.isArray(s.operativas) ? (s.operativas.find(o => o.LIBRE)?.LIBRE || '') : ''),
        salida: s.salida,
      })), [dbShipments])
  const incompletasTodas = useMemo(() => faltantesUrgentes(cargasCampos, new Date()), [cargasCampos])
  // "Adelantar datos": lo que llega después de la ventana, para cuando lo
  // urgente quedó en cero (la devolución no se adelanta — regla 28/08).
  const adelantables = useMemo(() => faltantesFuturos(cargasCampos, new Date()), [cargasCampos])

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
  // ── Agenda MONTECON (Brian 22/08): turnos de retiro escasos. La fila
  // guarda la ETA contra la que se agendó; si la ETA actual difiere, el
  // estado deriva a "reagendar" — sin cron, sin acordarse de nada.
  const [agendaMontecon, setAgendaMontecon] = useState<AgendaRow[]>([])
  useEffect(() => {
    fetchMonteconAgenda().then(setAgendaMontecon).catch(() => { /* card muestra sin agenda */ })
  }, [])
  // Después de confirmar un aviso de partner: `retire` marca retirado en la
  // agenda Montecon (refetch local) y `devolvi` deja LIBRE=DEVUELTO en la
  // carga (recarga desde la DB). Todo derive-on-read: nada se copia acá.
  const onAvisoResuelto = useCallback(async () => {
    const agenda = fetchMonteconAgenda().then(setAgendaMontecon).catch(() => { /* la card sigue con la agenda vieja */ })
    await Promise.all([agenda, onReloadFromDB?.()])
  }, [onReloadFromDB])
  const shipmentsModo = useMemo(
    () => (dbShipments || []).map(s => ({ ref: s.ref, mode: s.mode })),
    [dbShipments],
  )
  const cargasTerminalInput = useMemo(
    () => (dbShipments || []).map(s => ({
      dbId: s.id, ref: s.ref, cliente: s.cliente, terminal: s.terminal, pais: s.dest_country,
      contenedor: s.contenedor, eta: s.eta, mode: s.mode, archived: s.archived,
      salida: s.salida || (Array.isArray(s.operativas) ? (s.operativas.find(o => o.SALIDA)?.SALIDA || '') : ''),
    })),
    [dbShipments],
  )
  const montecon = useMemo(
    () => cargasMontecon(cargasTerminalInput, agendaMontecon, todayIso()),
    [cargasTerminalInput, agendaMontecon],
  )
  // Llegan sin terminal confirmada (Brian 02/09): sin terminal no entran a
  // ningún retiro — se reclaman arriba de la card con MONTECON / TCP a un toque.
  const sinTerminal = useMemo(() => cargasSinTerminal(cargasTerminalInput, todayIso()), [cargasTerminalInput])
  const monteconReagendar = montecon.filter(c => c.estado === 'reagendar').length
  const monteconAvisar = montecon.filter(c => c.estado === 'retirado').length
  // Etiqueta "NO LIBERADA" en la fila (Brian 02/09): LA MISMA lista que la
  // card "Llegan sin liberar" (sinLiberarAlerts: paso LIBERADO de ref_checks,
  // carga activa en el universo de Checks, sin SALIDA pasada). Una sola regla,
  // así "Ir a checks" siempre cae en una fila que existe. SIN_LIBERAR_DIAS (10)
  // cubre la ventana de retiros (8). El flag evita pintar todo en rojo antes
  // de que ref_checks haya respondido.
  const refsSinLiberar = useMemo(
    () => new Set(snapshot.sinLiberar.map(a => normalizeRef(a.shipment.REF))),
    [snapshot.sinLiberar],
  )
  const noLiberada = (ref: string) => checksCargados && refsSinLiberar.has(normalizeRef(ref))
  // Completar la terminal desde la card: mismo camino que la edición inline de
  // faltantes (buildFaltantePatch → onPatchShipment optimista con revert).
  const marcarTerminal = (c: CargaSinTerminal, terminal: 'MONTECON' | 'TCP') => {
    if (!onPatchShipment || !c.dbId) return
    const fila = (dbShipments || []).find(s => s.id === c.dbId)
    const r = buildFaltantePatch('terminal', terminal, fila?.operativas)
    if (!r.ok) { toast.error(`Terminal: ${r.error}`, { description: c.ref }); return }
    const previo = fila?.terminal ?? ''
    onPatchShipment(c.dbId, r.patch)
    toast.success(`Terminal ${terminal} · ${c.ref}`, {
      description: 'Ya aparece en los retiros de terminal.',
      action: { label: 'Deshacer', onClick: () => onPatchShipment(c.dbId, { terminal: previo }) },
    })
  }

  // Upsert local de una fila de agenda (el server ya guardó): preserva la ETA
  // agendada si existía — pisarla haría "reagendar" fantasma al deshacer.
  const upsertAgendaLocal = (ref: string, patch: Partial<AgendaRow>) => {
    setAgendaMontecon(prev => {
      const key = ref.trim().toUpperCase()
      const base = prev.find(r => r.ref.trim().toUpperCase() === key) ?? { ref, eta_agendada: '' }
      return [...prev.filter(r => r.ref.trim().toUpperCase() !== key), { ...base, ...patch }]
    })
  }

  // El botón AGENDADA pide la fecha del TURNO conseguido (Brian 26/08: "que te
  // diga para qué fecha agendaste") — el draft por ref abre el date picker
  // inline, arrancando en la ETA (el turno suele ser ese día o el siguiente).
  const [turnoDraft, setTurnoDraft] = useState<Record<string, string>>({})
  const cerrarTurnoDraft = (ref: string) =>
    setTurnoDraft(d => { const n = { ...d }; delete n[ref]; return n })

  const agendarRetiro = async (c: CargaMontecon, fechaRetiro: string) => {
    const anio = Number(String(fechaRetiro).slice(0, 4))
    if (!fechaRetiro || anio < 2015 || anio > 2100) {
      toast.error('Elegí la fecha del turno de retiro')
      return
    }
    try {
      await agendarMontecon(c.ref, c.eta, fechaRetiro)
      setAgendaMontecon(prev => [...prev.filter(r => r.ref.trim().toUpperCase() !== c.ref.toUpperCase()), { ref: c.ref, eta_agendada: c.eta, fecha_retiro: fechaRetiro }])
      cerrarTurnoDraft(c.ref)
      toast.success(`${c.ref} — turno de retiro para el ${fmtDateDMY(fechaRetiro)}`, {
        description: `Agendado contra ETA ${fmtDateDMY(c.eta)} — si la ETA se mueve, esta card te lo marca en rojo.`,
      })
    } catch (err) {
      toast.error('No se pudo agendar', { description: (err as Error)?.message })
    }
  }

  const quitarAgenda = async (c: CargaMontecon) => {
    const anterior = c.etaAgendada
    const turnoAnterior = c.fechaRetiro
    try {
      await desagendarMontecon(c.ref)
      setAgendaMontecon(prev => prev.filter(r => r.ref.trim().toUpperCase() !== c.ref.toUpperCase()))
      toast.success(`${c.ref} — agenda quitada`, {
        action: anterior ? {
          label: 'Deshacer',
          onClick: () => {
            agendarMontecon(c.ref, anterior, turnoAnterior || undefined)
              .then(() => setAgendaMontecon(prev => [...prev, { ref: c.ref, eta_agendada: anterior, fecha_retiro: turnoAnterior || null }]))
              .catch(() => toast.error('No se pudo restaurar la agenda'))
          },
        } : undefined,
      })
    } catch (err) {
      toast.error('No se pudo quitar la agenda', { description: (err as Error)?.message })
    }
  }

  // Ciclo post-retiro (Brian 26/08): RETIRADO deja la fila abajo recordando
  // avisar al cliente del traslado a depósito; AVISADO la saca de la card.
  const marcarRetirado = async (c: CargaMontecon) => {
    try {
      await marcarMontecon(c.ref, 'retirado', true)
      upsertAgendaLocal(c.ref, { retirado_at: new Date().toISOString() })
      toast.success(`${c.ref} — contenedor retirado de ${c.terminal}`, {
        description: 'Queda abajo en la card hasta que avises al cliente que ya está en depósito.',
      })
    } catch (err) {
      toast.error('No se pudo marcar el retiro', { description: (err as Error)?.message })
    }
  }

  const deshacerRetirado = async (c: CargaMontecon) => {
    try {
      await marcarMontecon(c.ref, 'retirado', false)
      upsertAgendaLocal(c.ref, { retirado_at: null })
      toast.success(`${c.ref} — retiro desmarcado`)
    } catch (err) {
      toast.error('No se pudo deshacer el retiro', { description: (err as Error)?.message })
    }
  }

  const marcarAvisado = async (c: CargaMontecon) => {
    try {
      await marcarMontecon(c.ref, 'avisado', true)
      upsertAgendaLocal(c.ref, { avisado_at: new Date().toISOString() })
      toast.success(`${c.ref} — cliente avisado, ciclo cerrado`, {
        action: {
          label: 'Deshacer',
          onClick: () => {
            marcarMontecon(c.ref, 'avisado', false)
              .then(() => upsertAgendaLocal(c.ref, { avisado_at: null }))
              .catch(() => toast.error('No se pudo deshacer el aviso'))
          },
        },
      })
    } catch (err) {
      toast.error('No se pudo marcar el aviso', { description: (err as Error)?.message })
    }
  }

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
  // Mismo filtro por país que Pagos → Sin datos (Brian 20/08): completar de a
  // un país. Deriva de paisDePago, así los chips de acá y los de Pagos nunca
  // pueden decir cosas distintas.
  const [montosPais, setMontosPais] = useState<string | null>(null)
  const montosVisibles = useMemo(
    () => (montosPais === null ? montosCard : montosCard.filter(s => paisDePago(s) === montosPais)),
    [montosCard, montosPais],
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

  // Terminación por marca (handoff 03-admin): bajo Mediterránea los títulos y
  // tarjetas de HOY usan el sistema (Nunito 900, naranja de riesgo, violeta
  // informativo). Bajo TWF, ni una clase cambia.
  const med = useBrand().id === 'med'

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
          <p className="text-sm text-muted-foreground mb-0.5">{saludoPersonal(getAdminName())}</p>
          <h1 className="text-3xl font-bold tracking-tight">
            <span className={med ? 'titulo-med text-med-violeta' : 'text-muted-foreground/70 font-semibold'}>Hoy</span>
            <span className="text-muted-foreground/50 font-normal mx-2">·</span>
            <span className={med ? 'text-lg font-normal text-med-gris' : ''}>{todayLabel}</span>
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

      {/* ── Avisos de partners (depósito/transporte proponen, el equipo confirma) ── */}
      <AvisosPartnersCard area="fcl" shipmentsModo={shipmentsModo} onResuelto={onAvisoResuelto} />

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
        <Card className={med ? 'overflow-hidden bg-med-aviso-tinte border-2 border-med-aviso-borde' : 'accent-top overflow-hidden bg-destructive/[0.04] border-destructive/25'} style={{ ['--bar-color' as any]: 'var(--destructive)' }}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2.5 mb-1">
              <div className={med ? 'p-1.5 bg-med-aviso/10 rounded-md' : 'p-1.5 bg-destructive/10 rounded-md'}>
                <Warning size={18} weight="fill" className={med ? 'text-med-aviso pulse-soft' : 'text-destructive pulse-soft'} />
              </div>
              <h2 className={med ? 'titulo-med text-[17px] text-med-aviso-texto' : 'text-sm font-semibold uppercase tracking-wide text-destructive'}>
                Salidas pisadas por el buque
              </h2>
              <span className={med ? 'ml-auto inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-med-aviso text-white text-xs font-bold' : 'ml-auto inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-destructive text-destructive-foreground text-xs font-bold'}>
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
                  className={med ? 'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left hover:bg-med-aviso/10 transition-colors' : 'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left hover:bg-destructive/10 transition-colors'}
                >
                  <span className="ref-med text-sm shrink-0 min-w-[64px]">{a.shipment.REF}</span>
                  <span className="text-sm text-foreground/85 truncate flex-1 min-w-0">
                    {a.shipment.CLIENTE || '—'}
                    {a.cntr && <span className="hidden sm:inline font-mono text-xs text-muted-foreground ml-2">{a.cntr}</span>}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0 hidden md:inline">
                    sale {fmtDMY(a.salida)} · buque llega {fmtDMY(a.eta)}
                  </span>
                  <span className={`text-xs font-bold shrink-0 px-1.5 py-0.5 ${
                    med
                      ? `rounded-full px-2.5 uppercase tracking-wide ${a.grave ? 'bg-med-aviso text-white' : 'bg-med-aviso-pill text-med-aviso-texto'}`
                      : `rounded ${a.grave ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`
                  }`}>
                    {a.margen < 0 ? 'IMPOSIBLE' : a.margen === 0 ? 'MISMO DÍA' : 'MUY JUSTA'}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Retiros de terminal (Brian 22/08 Montecon + 26/08 TCP): primera de
          las cards — turnos escasos en Montecon, y en ambas terminales el
          retiro termina con el aviso al cliente del traslado a depósito */}
      {(montecon.length > 0 || sinTerminal.length > 0) && (
        <Card className={med ? 'overflow-hidden bg-med-info-tinte border-2 border-med-info-borde' : 'accent-top overflow-hidden bg-sky-500/[0.04] border-sky-500/25'} style={{ ['--bar-color' as any]: 'rgb(14 165 233)' }}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2.5 mb-1">
              <div className={med ? 'p-1.5 bg-med-violeta/10 rounded-md' : 'p-1.5 bg-sky-500/10 rounded-md'}>
                <Anchor size={18} weight="fill" className={med ? 'text-med-violeta' : 'text-sky-600'} />
              </div>
              <h2 className={med ? 'titulo-med text-[17px] text-med-violeta' : 'text-sm font-semibold uppercase tracking-wide text-sky-700'}>
                Retiros de terminal — Montecon y TCP
              </h2>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">próx. {MONTECON_DIAS_ADELANTE} días</span>
              {monteconReagendar > 0 && (
                <span className={med ? 'inline-flex items-center gap-1 text-xs font-bold text-med-error bg-med-error/10 border border-med-error/30 rounded-full px-2 py-0.5' : 'inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-500/10 border border-red-500/30 rounded-full px-2 py-0.5'}>
                  {monteconReagendar} para reagendar
                </span>
              )}
              {monteconAvisar > 0 && (
                <span className={med ? 'inline-flex items-center gap-1 text-xs font-bold text-med-aviso-texto bg-med-aviso/10 border border-med-aviso/30 rounded-full px-2 py-0.5' : 'inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-0.5'}>
                  {monteconAvisar} avisar cliente
                </span>
              )}
              {sinTerminal.length > 0 && (
                <span className={med ? 'inline-flex items-center gap-1 text-xs font-bold text-med-error bg-med-error/10 border border-med-error/30 rounded-full px-2 py-0.5' : 'inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-500/10 border border-red-500/30 rounded-full px-2 py-0.5'}>
                  {sinTerminal.length} sin terminal
                </span>
              )}
              <span className={med ? 'ml-auto inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-med-violeta text-med-celeste text-xs font-bold' : 'ml-auto inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-sky-500 text-white text-xs font-bold'}>
                {montecon.length + sinTerminal.length}
              </span>
            </div>
            {sinTerminal.length > 0 && (
              <div className={med ? 'mt-1.5 mb-2.5 rounded-lg border border-med-error/40 bg-med-error/[0.06] px-2.5 py-2' : 'mt-1.5 mb-2.5 rounded-lg border border-red-500/40 bg-red-500/[0.06] px-2.5 py-2'}>
                <div className="flex items-center gap-2 mb-1">
                  <Warning size={16} weight="fill" className={med ? 'text-med-error shrink-0' : 'text-red-600 shrink-0'} />
                  <h3 className={med ? 'text-xs font-bold uppercase tracking-wide text-med-error' : 'text-xs font-bold uppercase tracking-wide text-red-700'}>
                    Llegan sin terminal confirmada
                  </h3>
                  <span className={med ? 'ml-auto text-xs font-bold text-med-error' : 'ml-auto text-xs font-bold text-red-700'}>{sinTerminal.length}</span>
                </div>
                <p className={med ? 'text-[11px] text-med-error/80 mb-1.5' : 'text-[11px] text-red-700/80 mb-1.5'}>
                  Sin terminal no entran a los retiros. Marcá dónde descarga el buque y la fila baja sola a la lista.
                </p>
                <div className="space-y-1">
                  {sinTerminal.map(c => (
                    <div key={c.dbId || c.ref} className={med ? 'rounded-md border border-med-error/30 bg-white px-2.5 py-2 flex flex-wrap items-center gap-x-2.5 gap-y-1' : 'rounded-md border border-red-500/30 bg-background/60 px-2.5 py-2 flex flex-wrap items-center gap-x-2.5 gap-y-1'}>
                      <button type="button" onClick={() => onOpenDetail?.(c.ref)} className="ref-med text-sm hover:underline">
                        {c.ref}
                      </button>
                      <span className="text-xs text-muted-foreground truncate max-w-[160px]" title={c.cliente}>{c.cliente || '—'}</span>
                      {c.cntr && <span className="font-mono text-[11px] text-muted-foreground">{c.cntr}</span>}
                      {c.eta && (
                        <span className="text-xs whitespace-nowrap">
                          ETA <b>{fmtDateDMY(c.eta)}</b>
                          <span className="text-muted-foreground"> · {c.dias === 0 ? 'hoy' : c.dias > 0 ? `en ${c.dias}d` : `llegó hace ${-c.dias}d`}</span>
                        </span>
                      )}
                      {noLiberada(c.ref) && (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            title="La naviera todavía no confirmó la liberación — sin eso el contenedor no se retira"
                            className={med ? 'inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-med-error/10 text-med-error border border-med-error/30' : 'inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-700 border border-red-500/30'}
                          >
                            <LockKey size={11} weight="fill" /> NO LIBERADA
                          </span>
                          <button
                            type="button"
                            onClick={() => onOpenTab?.('checks', { ref: c.ref })}
                            className={med ? 'text-[11px] font-semibold underline underline-offset-2 text-med-error hover:opacity-80' : 'text-[11px] font-semibold underline underline-offset-2 text-red-700 hover:opacity-80'}
                          >
                            Ir a checks
                          </button>
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-1.5">
                        {(['MONTECON', 'TCP'] as const).map(term => (
                          <button
                            key={term}
                            type="button"
                            disabled={!onPatchShipment || !c.dbId}
                            onClick={() => marcarTerminal(c, term)}
                            title={`Descarga en ${term}`}
                            className={med ? 'h-7 px-3 rounded-full border border-med-violeta/40 text-xs font-bold text-med-violeta hover:bg-med-violeta/10 transition-colors disabled:opacity-50' : 'h-7 px-3 rounded-full border border-sky-500/40 text-xs font-bold text-sky-700 hover:bg-sky-500/10 transition-colors disabled:opacity-50'}
                          >
                            {term}
                          </button>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground mb-2.5">
              MONTECON: agendá el turno contra la ETA (si el buque se corre, la fila se pone en rojo sola). TCP: sin turnos, pasa a RETIRAR cuando llega el buque. <b>NO LIBERADA</b>: la naviera no confirmó la liberación → Ir a checks. Cuando el contenedor sale marcá RETIRADO y después AVISADO al cliente.
            </p>
            <div className="space-y-1">
              {montecon.map(c => (
                <div
                  key={c.dbId || c.ref}
                  className={`rounded-lg border px-2.5 py-2 ${
                    c.estado === 'reagendar'
                      ? (med ? 'border-med-error/40 bg-med-error/[0.06]' : 'border-red-500/40 bg-red-500/[0.06]')
                      : c.estado === 'retirado'
                        ? (med ? 'border-med-aviso/40 bg-med-aviso/[0.06]' : 'border-amber-500/40 bg-amber-500/[0.06]')
                        : (med ? 'border-med-info-borde bg-white' : 'border-border/60 bg-background/50')
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <button type="button" onClick={() => onOpenDetail?.(c.ref)} className="ref-med text-sm hover:underline">
                      {c.ref}
                    </button>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                      c.terminal === 'MONTECON'
                        ? (med ? 'bg-med-pastel text-med-texto' : 'bg-sky-500/10 text-sky-700 dark:text-sky-300')
                        : (med ? 'bg-med-lila text-med-violeta' : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300')
                    }`}>
                      {c.terminal}
                    </span>
                    <span className="text-xs text-muted-foreground truncate max-w-[160px]" title={c.cliente}>{c.cliente || '—'}</span>
                    {c.cntr && <span className="font-mono text-[11px] text-muted-foreground">{c.cntr}</span>}
                    {c.eta && (
                      <span className="text-xs whitespace-nowrap">
                        ETA <b>{fmtDateDMY(c.eta)}</b>
                        <span className="text-muted-foreground"> · {c.dias === 0 ? 'hoy' : c.dias > 0 ? `en ${c.dias}d` : `llegó hace ${-c.dias}d`}</span>
                      </span>
                    )}
                    {c.estado !== 'retirado' && noLiberada(c.ref) && (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          title="La naviera todavía no confirmó la liberación — sin eso el contenedor no se retira"
                          className={med ? 'inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-med-error/10 text-med-error border border-med-error/30' : 'inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-700 border border-red-500/30'}
                        >
                          <LockKey size={11} weight="fill" /> NO LIBERADA
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpenTab?.('checks', { ref: c.ref })}
                          title="Ver qué le falta en la pestaña Checks"
                          className={med ? 'text-[11px] font-semibold underline underline-offset-2 text-med-error hover:opacity-80' : 'text-[11px] font-semibold underline underline-offset-2 text-red-700 hover:opacity-80'}
                        >
                          Ir a checks
                        </button>
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-1.5">
                      {(c.estado === 'sin_agendar' || c.estado === 'reagendar') && turnoDraft[c.ref] !== undefined && (
                        <span className="flex items-center gap-1">
                          <input
                            type="date"
                            autoFocus
                            value={turnoDraft[c.ref]}
                            onChange={e => setTurnoDraft(d => ({ ...d, [c.ref]: e.target.value }))}
                            onKeyDown={e => {
                              if (e.key === 'Enter') agendarRetiro(c, turnoDraft[c.ref])
                              if (e.key === 'Escape') cerrarTurnoDraft(c.ref)
                            }}
                            title="¿Para qué fecha conseguiste el turno de retiro?"
                            className={med ? 'h-7 rounded-md border border-med-violeta/40 bg-background px-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-med-violeta/50' : 'h-7 rounded-md border border-sky-500/40 bg-background px-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-sky-500/50'}
                          />
                          <button
                            type="button"
                            onClick={() => agendarRetiro(c, turnoDraft[c.ref])}
                            className={med ? 'h-7 px-2.5 rounded-full bg-med-violeta text-white text-xs font-bold hover:opacity-90 transition-opacity' : 'h-7 px-2.5 rounded-full bg-sky-600 text-white text-xs font-bold hover:opacity-90 transition-opacity'}
                          >
                            OK
                          </button>
                          <button
                            type="button"
                            onClick={() => cerrarTurnoDraft(c.ref)}
                            aria-label="Cancelar"
                            className="h-7 px-2 rounded-full border border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
                          >
                            ✕
                          </button>
                        </span>
                      )}
                      {c.estado === 'sin_agendar' && turnoDraft[c.ref] === undefined && (
                        <button
                          type="button"
                          onClick={() => setTurnoDraft(d => ({ ...d, [c.ref]: c.eta }))}
                          title="Conseguiste turno: cargá para qué fecha"
                          className={med ? 'h-7 px-3 rounded-full border border-med-violeta/40 text-xs font-semibold text-med-violeta hover:bg-med-violeta/10 transition-colors' : 'h-7 px-3 rounded-full border border-sky-500/40 text-xs font-semibold text-sky-700 hover:bg-sky-500/10 transition-colors'}
                        >
                          Agendada
                        </button>
                      )}
                      {c.estado === 'por_llegar' && (
                        <span
                          title="TCP no maneja turnos: el día que llegue el buque la fila pasa a RETIRAR"
                          className="h-7 px-3 rounded-full border border-dashed border-border text-xs text-muted-foreground inline-flex items-center"
                        >
                          Sin turno · retirar al llegar
                        </span>
                      )}
                      {c.estado === 'agendada' && (
                        <button
                          type="button"
                          onClick={() => quitarAgenda(c)}
                          title={`${c.fechaRetiro ? `Turno de retiro para el ${fmtDateDMY(c.fechaRetiro)}, ` : ''}agendada contra ETA ${fmtDateDMY(c.etaAgendada)} — click para quitar`}
                          className={med ? 'h-7 px-3 rounded-full bg-med-violeta text-white text-xs font-bold inline-flex items-center gap-1 hover:opacity-90 transition-opacity' : 'h-7 px-3 rounded-full bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1 hover:opacity-90 transition-opacity'}
                        >
                          <CheckCircle size={13} weight="fill" /> Agendada{c.fechaRetiro ? ` · ${fmtDateDMY(c.fechaRetiro)}` : ''}
                        </button>
                      )}
                      {c.estado === 'reagendar' && turnoDraft[c.ref] === undefined && (
                        <>
                          <button
                            type="button"
                            onClick={() => setTurnoDraft(d => ({ ...d, [c.ref]: c.eta }))}
                            className={med ? 'h-7 px-3 rounded-full bg-med-error text-white text-xs font-bold hover:opacity-90 transition-opacity' : 'h-7 px-3 rounded-full bg-red-600 text-white text-xs font-bold hover:opacity-90 transition-opacity'}
                          >
                            Volver a agendar
                          </button>
                          <button
                            type="button"
                            onClick={() => quitarAgenda(c)}
                            className="h-7 px-2.5 rounded-full border border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
                          >
                            Quitar
                          </button>
                        </>
                      )}
                      {c.estado !== 'retirado' && c.dias <= 0 && (
                        <button
                          type="button"
                          onClick={() => marcarRetirado(c)}
                          title="El contenedor ya salió de Montecon hacia el depósito"
                          className={med ? 'h-7 px-3 rounded-full border border-med-violeta/30 text-xs font-semibold text-med-violeta hover:bg-med-violeta/10 transition-colors' : 'h-7 px-3 rounded-full border border-amber-500/50 text-xs font-semibold text-amber-700 hover:bg-amber-500/10 transition-colors'}
                        >
                          Retirado
                        </button>
                      )}
                      {c.estado === 'retirado' && (
                        <>
                          <button
                            type="button"
                            onClick={() => marcarAvisado(c)}
                            title="Ya le avisé al cliente — sacar de la card"
                            className={med ? 'h-7 px-3 rounded-full bg-med-ok text-white text-xs font-bold inline-flex items-center gap-1 hover:opacity-90 transition-opacity' : 'h-7 px-3 rounded-full bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1 hover:opacity-90 transition-opacity'}
                          >
                            <CheckCircle size={13} weight="fill" /> Avisado
                          </button>
                          <button
                            type="button"
                            onClick={() => deshacerRetirado(c)}
                            className="h-7 px-2.5 rounded-full border border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
                          >
                            Deshacer
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                  {c.estado === 'reagendar' && (
                    <p className={med ? 'mt-1 text-xs font-semibold text-med-error' : 'mt-1 text-xs font-semibold text-red-700'}>
                      Se modificó la fecha de arribo — estaba agendada para {fmtDateDMY(c.etaAgendada)}, ahora la ETA es {fmtDateDMY(c.eta)}.
                      {c.fechaRetiro ? ` Tenías turno para el ${fmtDateDMY(c.fechaRetiro)} — conseguí uno nuevo.` : ''}
                    </p>
                  )}
                  {c.estado === 'retirado' && (
                    <p className={med ? 'mt-1 text-xs font-semibold text-med-aviso-texto' : 'mt-1 text-xs font-semibold text-amber-700'}>
                      Retirado el {fmtDateDMY(c.retiradoEl)} — avisale al cliente que el contenedor ya se trasladó al depósito y marcá AVISADO.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Llegan sin liberar ───────────────────────────── */}
      {snapshot.sinLiberar.length === 0 && (
        /* Estado feliz explícito (pedido Brian 13/08): que se VEA que el
           trabajo de liberación está al día, no solo la ausencia de alerta. */
        <div className={med ? 'flex items-center gap-2.5 rounded-lg border border-med-ok/25 bg-med-ok-suave px-4 py-2.5' : 'flex items-center gap-2.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.05] px-4 py-2.5'}>
          <CheckCircle size={18} weight="fill" className={med ? 'text-med-ok shrink-0' : 'text-emerald-600 dark:text-emerald-400 shrink-0'} />
          <p className={med ? 'text-sm text-med-ok' : 'text-sm text-emerald-700 dark:text-emerald-400'}>
            <b>¡Felicitaciones!</b> Todas tus cargas de los próximos 10 días están liberadas.
          </p>
        </div>
      )}
      {snapshot.sinLiberar.length > 0 && (
        <Card className={med ? 'overflow-hidden bg-med-aviso-tinte border-2 border-med-aviso-borde' : 'accent-top overflow-hidden bg-amber-500/[0.04] border-amber-500/25'} style={{ ['--bar-color' as any]: 'rgb(245 158 11)' }}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2.5 mb-1">
              <div className={med ? 'p-1.5 bg-med-aviso/10 rounded-md' : 'p-1.5 bg-amber-500/10 rounded-md'}>
                <LockKey size={18} weight="fill" className={med ? 'text-med-aviso' : 'text-amber-600 dark:text-amber-400'} />
              </div>
              <h2 className={med ? 'titulo-med text-[17px] text-med-aviso-texto' : 'text-sm font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400'}>
                Llegan sin liberar
              </h2>
              <span className={med ? 'ml-auto inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-med-aviso text-white text-xs font-bold' : 'ml-auto inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-amber-500 text-white text-xs font-bold'}>
                {snapshot.sinLiberar.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Llegan dentro de 10 días y la naviera todavía no confirmó la liberación — sin eso el contenedor no se retira.
            </p>
            <div className="space-y-1">
              {snapshot.sinLiberar.map(a => (
                <div key={a.shipment.REF} className={med ? 'rounded-md hover:bg-med-aviso/10 transition-colors pb-1.5' : 'rounded-md hover:bg-amber-500/10 transition-colors pb-1.5'}>
                  <button
                    type="button"
                    onClick={() => {
                      const op = (a.shipment.operativas ?? [])[0]
                      if (op) openOpMatch({ shipment: a.shipment, op })
                      else openShipment(a.shipment)
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 pt-2 pb-0.5 text-left"
                  >
                    <span className="ref-med text-sm shrink-0 min-w-[64px]">{a.shipment.REF}</span>
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

      {/* ── Llegan con datos incompletos ─────────────────── */}
      {(incompletasTodas.length > 0 || adelantables.length > 0) && (
        <Card className={med ? 'overflow-hidden bg-med-aviso-tinte border-2 border-med-aviso-borde' : 'accent-top overflow-hidden bg-amber-500/[0.04] border-amber-500/25'} style={{ ['--bar-color' as any]: 'rgb(245 158 11)' }}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2.5 mb-1">
              <div className={med ? 'p-1.5 bg-med-aviso/10 rounded-md' : 'p-1.5 bg-amber-500/10 rounded-md'}>
                <PencilSimple size={18} weight="fill" className={med ? 'text-med-aviso' : 'text-amber-600'} />
              </div>
              <h2 className={med ? 'titulo-med text-[17px] text-med-aviso-texto' : 'text-sm font-semibold uppercase tracking-wide text-amber-700'}>
                Llegan con datos incompletos
              </h2>
              <span className={med ? 'ml-auto inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-med-aviso text-white text-xs font-bold' : 'ml-auto inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-amber-500 text-white text-xs font-bold'}>
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
                    cardTab === id ? (med ? 'bg-med-aviso text-white' : 'bg-amber-600 text-white') : (med ? 'bg-white text-med-gris border border-med-borde hover:bg-med-aviso/10' : 'bg-background/60 text-muted-foreground border border-border hover:bg-amber-500/10')
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
                        ? (med ? 'bg-med-aviso text-white' : 'bg-amber-500 text-white')
                        : (med ? 'bg-white text-med-gris border border-med-borde hover:bg-med-aviso/10' : 'bg-background/60 text-muted-foreground border border-border hover:bg-amber-500/10')
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
                {montosCard.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5 pb-2">
                    <button
                      type="button"
                      onClick={() => setMontosPais(null)}
                      aria-pressed={montosPais === null}
                      className={`h-7 px-2.5 rounded-full text-xs font-semibold transition-colors ${
                        montosPais === null ? (med ? 'bg-med-aviso text-white' : 'bg-amber-600 text-white') : (med ? 'bg-white text-med-gris border border-med-borde hover:bg-med-aviso/10' : 'bg-background/60 text-muted-foreground border border-border hover:bg-amber-500/10')
                      }`}
                    >
                      Todas <span className="opacity-70">{montosCard.length}</span>
                    </button>
                    {agruparPorPais(montosCard).map(g => (
                      <button
                        key={g.pais}
                        type="button"
                        onClick={() => setMontosPais(prev => (prev === g.pais ? null : g.pais))}
                        aria-pressed={montosPais === g.pais}
                        className={`h-7 px-2.5 rounded-full text-xs font-semibold transition-colors ${
                          montosPais === g.pais ? (med ? 'bg-med-aviso text-white' : 'bg-amber-600 text-white') : (med ? 'bg-white text-med-gris border border-med-borde hover:bg-amber-500/10' : 'bg-background/60 text-muted-foreground border border-border hover:bg-amber-500/10')
                        }`}
                      >
                        {g.pais} <span className="opacity-70">{g.n}</span>
                      </button>
                    ))}
                  </div>
                )}
                {montosCard.length === 0 && (
                  <p className="px-2.5 py-3 text-xs text-muted-foreground">
                    🎉 Todo lo que llega estos días tiene montos cargados.
                  </p>
                )}
                {montosCard.length > 0 && montosVisibles.length === 0 && (
                  <p className="px-2.5 py-3 text-xs text-muted-foreground">
                    Nada de {montosPais} en la ventana — probá otro chip.
                  </p>
                )}
                {montosVisibles.map(s => (
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

              {/* ── Adelantar datos (Brian 28/08): llegan después de la ventana ── */}
              {adelantables.length > 0 && (
                <div className="pt-2 mt-1 border-t border-border/60">
                  {incompletasTodas.length === 0 && (
                    <p className="px-2.5 pb-1 text-xs font-medium text-emerald-700">
                      ✅ Al día con lo urgente — si querés, adelantá lo que viene.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setAdelantarOpen(v => !v)}
                    aria-expanded={adelantarOpen}
                    className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <CaretRight size={12} weight="bold" className={`shrink-0 transition-transform ${adelantarOpen ? 'rotate-90' : ''}`} />
                    Adelantar datos ({adelantables.length})
                    <span className="font-normal">— llegan después de los {FALTANTES_DIAS_COORDINACION} días · la devolución no se adelanta</span>
                  </button>
                  {adelantarOpen && (
                    <div className="space-y-1">
                      {adelantables.slice(0, 10).map(u => {
                        const rowKey = `adel-${String(u.carga.dbId || u.carga.ref)}`
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
                      {adelantables.length > 10 && (
                        <p className="px-2.5 pt-1 text-xs text-muted-foreground">
                          … y {adelantables.length - 10} más, ordenadas por llegada.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            )}
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
              <h2 className={med ? 'titulo-med text-[17px] text-destructive' : 'text-sm font-semibold uppercase tracking-wide text-destructive'}>
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
  const med = useBrand().id === 'med'
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
            <h3 className={med ? 'text-[11px] font-semibold uppercase tracking-[0.08em] text-med-gris-suave truncate' : 'text-sm font-semibold uppercase tracking-wide truncate'}>{title}</h3>
            <p className={med ? 'text-[11px] text-med-gris-suave truncate' : 'text-[11px] text-muted-foreground truncate'}>{subtitle}</p>
          </div>
          <span className={med ? 'ref-med inline-flex items-center justify-center min-w-7 h-7 px-2 text-2xl tabular-nums' : 'inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-muted text-foreground text-xs font-bold tabular-nums'}>
            {total}
          </span>
        </div>
        {/* Consolidados primero: son un camión entero, no una carga suelta. */}
        {trucks.length > 0 && (
          <div className="mb-3 space-y-2">
            {trucks.map(({ truck, refs, kg, m3 }) => (
              <div
                key={truck.id}
                className={med ? 'rounded-lg border border-med-info-borde bg-med-info-tinte px-3 py-2.5' : 'rounded-lg border border-amber-300/70 bg-amber-50/60 dark:bg-amber-500/5 px-3 py-2.5'}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm">🚛 {truck.code}</span>
                  <Badge variant="outline" className={med ? 'text-[10px] whitespace-nowrap border-med-celeste text-med-texto bg-med-pastel' : 'text-[10px] whitespace-nowrap border-amber-400 text-amber-700 dark:text-amber-400'}>
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
                    <span className="ref-med text-sm flex items-center gap-1.5 min-w-0">
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
  const diasLabel = u.diasAEta === null
    ? 'sin ETA'
    : u.diasAEta < 0 ? `llegó hace ${-u.diasAEta}d` : u.diasAEta === 0 ? 'llega hoy' : `en ${u.diasAEta}d`
  const header = (
    <>
      <span className="ref-med text-sm shrink-0 min-w-[64px]">{u.carga.ref}</span>
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

  const commit = (valor?: string) => {
    const texto = (valor ?? draft).trim()
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
    : spec.sugerencias === 'terminales' ? ['TCP', 'MONTECON']
    : spec.sugerencias === 'devoluciones' ? DEVOLUCIONES_PLAZA
    : []

  return (
    <label className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">{etiqueta}</span>
      {spec.widget === 'cliente' ? (
        <ClienteSelect
          value={draft}
          onChange={v => { setDraft(v); commit(v) }}
          clientes={clientes}
          placeholder={spec.placeholder}
          className="h-9 w-56"
        />
      ) : spec.widget === 'select' ? (
        <select
          value={draft}
          onChange={e => { setDraft(e.target.value); if (invalido) setInvalido(false) }}
          onBlur={() => commit()}
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
            onBlur={() => commit()}
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
