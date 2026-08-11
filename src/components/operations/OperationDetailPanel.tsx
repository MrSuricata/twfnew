import { useState, useEffect, useRef } from 'react'
import type { Sugerencia } from '@/lib/sugerenciaHistorica'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LockSimple, Truck as TruckIcon, Archive, ArrowCounterClockwise, Trash, Plus, X, PencilSimple, Check, Camera, ArrowsSplit } from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { DbShipment, Operator, UnifiedOperation } from '@/lib/operationsTypes'
import {
  EDITABLE_FIELDS, EDITABLE_FCL_FIELDS, MODALITY_COLORS, MODALITY_LABELS,
  STATUS_LABEL, STATUS_OPTIONS, operatorsForMode, isSeguimientoVencido,
  buildPerContainerPatch, statusBadgeClass,
} from '@/lib/operationsTypes'
import { fmtDateDMY } from '@/lib/format'
import { parseCntr, serializeCntr, normalizeCntr, isStandardCntr } from '@/lib/cntrUtils'
import { canonicalizeCliente, type CatalogClient } from '@/lib/clientCatalog'
import type { OriginPhoto, OperativeReport } from '@/lib/quotationTypes'
import ViabilityBlock from './ViabilityBlock'
import ContainerDatesSection, { reconcileOperativasToCntrs, type ContainerDatesHandle } from './ContainerDatesSection'
import OperationMediaSection from './OperationMediaSection'
import PagosSection from './PagosSection'
import RefChecksInline from './RefChecksInline'
import { isPorUruguay } from '@/lib/checksTypes'
import { costoTerminalDefault, costoDevDefault } from '@/lib/pagosVencimientos'
import { fmtMoneyUY } from '@/lib/fichaFacturacionPdf'

interface TruckRefInfo { truckCode: string; status: string }

const PAIS_LABEL: Record<string, string> = { UY: 'UY', AR: 'AR', CL: 'CL', OTRO: '—' }
const NUM_FMT = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 })

// Identidad de color por sección (pedido del dueño 03/07): cada bloque es un
// card con fondo pastel + borde + label teñido, para ubicar de un vistazo dónde
// va cada dato. SOLO cambia el fondo/acento — los valores siguen en el índigo
// de marca (text-foreground) y los labels de campo en muted (contraste AA en
// ambos brands). La app no tiene dark mode (TWF/Med son claros) → pasteles fijos.
const SECTION_TONES = {
  slate:    { card: 'bg-slate-50/70 border-slate-200',     label: 'text-slate-600',   box: 'border-slate-200' },
  sky:      { card: 'bg-sky-50/60 border-sky-200',         label: 'text-sky-700',     box: 'border-sky-200/80' },
  amber:    { card: 'bg-amber-50/60 border-amber-200',     label: 'text-amber-700',   box: 'border-amber-200/80' },
  violet:   { card: 'bg-violet-50/60 border-violet-200',   label: 'text-violet-700',  box: 'border-violet-200/80' },
  emerald:  { card: 'bg-emerald-50/60 border-emerald-200', label: 'text-emerald-700', box: 'border-emerald-200/80' },
  rose:     { card: 'bg-rose-50/60 border-rose-200',       label: 'text-rose-700',    box: 'border-rose-200/80' },
  bluegray: { card: 'bg-slate-100/70 border-slate-300/70', label: 'text-slate-700',   box: 'border-slate-300/70' },
} as const
type SectionTone = keyof typeof SECTION_TONES

// Secciones del panel: declarativas.
// kind: 'number' → input numérico.
// wide: true → col-span-2 en el grid de 2 columnas.
// tone: identidad de color del card (SECTION_TONES).
// Nota: los campos bool (tlx, wood, oog, imo, noApilable, seguro, certi, impresa)
// se sacan de las secciones y se renderizan como chips interactivos en la sección Carga.
const SECTIONS: { title: string; tone: SectionTone; fields: { key: keyof UnifiedOperation; label: string; kind?: 'number' | 'date'; wide?: boolean; dateDisplay?: boolean }[] }[] = [
  {
    // Fechas PRIMERO (pedido 02/07): es lo que más se consulta al abrir el panel —
    // queda apenas debajo de "Datos clave de la carga" / fechas por contenedor.
    title: 'Fechas',
    tone: 'sky',
    fields: [
      // dateDisplay: se MUESTRAN dd/MM/yyyy (fmtDateDMY, display only) — el valor
      // guardado sigue en ISO y la edición no cambia.
      { key: 'etd', label: 'ETD', dateDisplay: true },
      { key: 'eta', label: 'ETA', dateDisplay: true },
      { key: 'salida', label: 'Salida', dateDisplay: true },
      { key: 'etaFisc', label: 'ETA fiscal', dateDisplay: true },
      // LIBRE se movió a "Datos clave de la carga" (ViabilityBlock): es dato de
      // la carga y se edita ahí (propaga a todos los contenedores).
      { key: 'seguimiento', label: 'Seguimiento', dateDisplay: true },
    ],
  },
  {
    title: 'Identificación',
    tone: 'amber',
    fields: [
      { key: 'cliente', label: 'Cliente / Cnee', wide: true },
      { key: 'clientRef', label: 'Ref cliente' },
      { key: 'shipper', label: 'Shipper' },
      { key: 'agente', label: 'Agente' },
      { key: 'incoterm', label: 'Incoterm' },
    ],
  },
  {
    title: 'Documental',
    tone: 'violet',
    fields: [
      { key: 'docNumber', label: 'BL / MAWB / CRT' },
      { key: 'buque', label: 'Buque' },
      { key: 'linea', label: 'Línea' },
    ],
  },
  {
    title: 'Ruta',
    tone: 'emerald',
    fields: [
      { key: 'origin', label: 'Origen (POL)' },
      { key: 'paisOrigen', label: 'País origen' },
      { key: 'dischargePort', label: 'Pto. descarga' },
      { key: 'destPort', label: 'Destino' },
      { key: 'pais', label: 'País' },
    ],
  },
  {
    title: 'Carga',
    tone: 'rose',
    fields: [
      { key: 'descripcion', label: 'Descripción', wide: true },
      { key: 'tipo', label: 'Tipo' },
    ],
  },
  {
    title: 'Operativa',
    tone: 'bluegray',
    fields: [
      // 'operativa' (tipo) y 'transporte' se movieron a "Datos clave de la carga"
      // (ViabilityBlock) — no duplicar acá.
      // 'camion' NO va acá: era un texto editable que confundía (setearlo NO sube
      // la carga al camión — eso se hace en el armador → "cargas disponibles").
      // El camión real se muestra derivado en el badge del header (truckStatus).
      // 'dev' se movió a "Datos clave de la carga" (ViabilityBlock, "Devuelve en",
      // al lado del LIBRE) — no duplicar acá.
      { key: 'despacho', label: 'Despacho' },
    ],
  },
]

// Flags que se muestran como chips interactivos en la sección Carga.
// tlx es string 'SI'|'' en UnifiedOperation; el resto son boolean.
// wood y noApilable se movieron al ViabilityBlock (toggles grandes).
// Telex e IMO subieron al bloque de viabilidad como toggles grandes (junto a
// Apilable/Madera/Entrega en planta). Acá quedan los flags secundarios.
const FLAGS: { key: keyof UnifiedOperation; label: string }[] = [
  { key: 'oog', label: 'OOG' },
  { key: 'seguro', label: 'Seguro' },
  { key: 'certi', label: 'Certi' },
  { key: 'impresa', label: 'Impresa' },
]

// Cómo se edita un campo para esta operación (mismas reglas que la grilla vieja):
// DB → EDITABLE_FIELDS (col física + tipo) · FCL espejo → EDITABLE_FCL_FIELDS
// (overlay web_edits) · si no, solo lectura.
type EditMode =
  | { kind: 'db'; col: string; type: 'text' | 'number' | 'bool' | 'select'; options?: { value: string; label: string }[] }
  | { kind: 'fcl' }
  | null

function editModeFor(op: UnifiedOperation, key: keyof UnifiedOperation): EditMode {
  if (op.source === 'db' && op.dbId && !op.readOnly) {
    const ef = EDITABLE_FIELDS[key]
    return ef ? { kind: 'db', col: ef.col, type: ef.type, options: ef.options } : null
  }
  if (op.source === 'fcl' && op.dbId && EDITABLE_FCL_FIELDS[key]) return { kind: 'fcl' }
  return null
}

export default function OperationDetailPanel({
  op,
  truckStatus,
  operators,
  operatorById,
  hoy,
  knownDepositos = [],
  knownTransportes = [],
  knownFiscales = [],
  fiscalSugerido,
  knownDevs = [],
  knownLugaresDescarga = [],
  knownTerminales = [],
  knownClientes = [],
  dbRow = null,
  originPhotos,
  reports,
  onUpdateOriginPhotos,
  onUpdateReports,
  onAssign,
  onPatch,
  onPatchFcl,
  onRenameRef,
  onRequestDelete,
  onSplit,
  onClose,
}: {
  op: UnifiedOperation | null
  truckStatus?: TruckRefInfo
  operators: Operator[]
  operatorById: Map<string, Operator>
  hoy: Date
  knownDepositos?: string[]
  /** Catálogo de clientes → datalist + canonicalización del campo Cliente. */
  knownClientes?: CatalogClient[]
  knownTransportes?: string[]
  /** Fiscales de destino y devoluciones ya usados → combos con catálogo. */
  knownFiscales?: string[]
  /** Fiscal habitual del cliente (atajo en el bloque de datos clave). */
  fiscalSugerido?: Sugerencia | null
  knownDevs?: string[]
  /** Lugares de descarga del camión (post-fiscal) ya usados → combo Descarga. */
  knownLugaresDescarga?: string[]
  /** Terminales de arribo (TCP/MONTECON + usadas) → combo Terminal. */
  knownTerminales?: string[]
  /** Fila cruda de shipments de esta op (por dbId) — los montos/pagos viven
   *  ahí, no en UnifiedOperation. Habilita la sección Pagos del panel. */
  dbRow?: DbShipment | null
  /** Fotos e informes de todas las operaciones (sección "Fotos e informes");
   *  el panel filtra por op.ref. Si no se threadean, la sección no se muestra. */
  originPhotos?: OriginPhoto[]
  reports?: OperativeReport[]
  onUpdateOriginPhotos?: (photos: OriginPhoto[]) => void
  onUpdateReports?: (reports: OperativeReport[]) => void
  onAssign: (op: UnifiedOperation, operatorId: string | null) => void
  onPatch: (id: string, fields: Record<string, unknown>) => void
  onPatchFcl?: (dbId: string, edits: Record<string, unknown>) => void
  onRenameRef?: (op: UnifiedOperation, newRef: string, pin: string) => Promise<void>
  onRequestDelete?: (op: UnifiedOperation) => void
  /** Abre el diálogo "Dividir carga en A/B" (vive en la grilla, que tiene el alta). */
  onSplit?: () => void
  onClose: () => void
}) {
  const [newCntr, setNewCntr] = useState('')
  const [addingCntr, setAddingCntr] = useState(false)
  // Renombrado de REF (flip Etapa 4): form inline con PIN.
  const [renaming, setRenaming] = useState(false)
  const [refDraft, setRefDraft] = useState('')
  const [pinDraft, setPinDraft] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
  // Fotos e informes: viven en un Dialog que se abre desde el chip del header.
  const [mediaOpen, setMediaOpen] = useState(false)
  // Handle a las fechas por contenedor: al cerrar el Sheet forzamos el commit de
  // los borradores pendientes (arribo fiscal / salida elegidos en el calendario
  // que aún no blurearon) ANTES de desmontar, si no se pierden.
  const datesRef = useRef<ContainerDatesHandle>(null)

  // El panel no se desmonta al cambiar de operación: limpiar el borrador.
  const opUid = op?.uid
  useEffect(() => { setNewCntr(''); setAddingCntr(false); setRenaming(false); setRefDraft(''); setPinDraft(''); setMediaOpen(false) }, [opUid])

  if (!op) return <Sheet open={false}><SheetContent side="right" /></Sheet>

  const commit = (key: keyof UnifiedOperation, v: unknown) => {
    const mode = editModeFor(op, key)
    if (!mode || !op.dbId) return
    // Cliente: si lo tipeado matchea un alias del catálogo, guardar el nombre
    // canónico (unificación de clientes). Texto libre sigue permitido.
    if (key === 'cliente' && typeof v === 'string') v = canonicalizeCliente(v, knownClientes)
    if (mode.kind === 'db') {
      // Campos que viven también por contenedor (operativa, libre, depósito, dev,
      // descarga…) se propagan al array operativas: la Agenda/HOY/chips leen el
      // valor POR CONTENEDOR, no la columna. El helper solo agrega `operativas`
      // para esos campos; el resto setea solo la columna.
      const patch = buildPerContainerPatch(op, mode.col, v)
      // Costos DEFAULT (Brian 17/07): al setear Terminal (MONTECON 618 / TCP
      // 507,16) o Devuelve en (STL 205 / MPS 189) se completa el monto del
      // rubro EN EL MISMO PATCH — solo si estaba sin datos (null): un 0 (=
      // pagado) o un monto ya cargado nunca se pisan. Siempre editable después.
      if (dbRow && typeof v === 'string') {
        if (key === 'terminal' && (dbRow.monto_terminal ?? null) === null) {
          const def = costoTerminalDefault(v)
          if (def !== null) {
            patch.monto_terminal = def
            toast.info(`Costo de terminal: USD ${fmtMoneyUY(def)} (default ${v.trim().toUpperCase()})`, {
              description: 'Editable en la sección Pagos si difiere.',
            })
          }
        }
        if (key === 'dev' && (dbRow.monto_devolucion ?? null) === null) {
          const def = costoDevDefault(v)
          if (def !== null) {
            patch.monto_devolucion = def
            toast.info(`Costo de devolución: USD ${fmtMoneyUY(def)} (default ${v.trim().toUpperCase()})`, {
              description: 'Editable en la sección Pagos si difiere.',
            })
          }
        }
      }
      onPatch(op.dbId, patch)
    } else {
      onPatchFcl?.(op.dbId, { [EDITABLE_FCL_FIELDS[key]!]: v })
    }
  }

  // ── Contenedores ──
  const cntrs = parseCntr(op.cntr)
  const cntrEditable = !!editModeFor(op, 'cntr')
  // FCL con contenedores: Salida MVD y ETA fiscal se editan POR CONTENEDOR arriba
  // (ContainerDatesSection) → no mostrarlas de nuevo (colapsadas) en "Fechas".
  const hidePerContainerDates = op.mode === 'fcl' && cntrs.length > 0
  // Agregar/quitar contenedor: además de la columna `contenedor`, sincronizar el
  // array `operativas` con la nueva lista (preserva por CNTR_OP, sintetiza el
  // nuevo). Sin esto, `operativas` quedaba corto y la SIGUIENTE edición de un
  // campo nivel-carga (buildPerContainerPatch mapea sobre op.operativas) colapsaba
  // el array → el rollup recomputaba `contenedor` con menos contenedores y borraba
  // el recién agregado (y su data por contenedor).
  const commitCntrs = (nextCntrs: string[]) => {
    const mode = editModeFor(op, 'cntr')
    if (!mode || !op.dbId) return
    // FCL espejo (cache legacy, vacío post-flip): comportamiento previo (sin operativas).
    if (mode.kind !== 'db') { commit('cntr', serializeCntr(nextCntrs)); return }
    const operativas = reconcileOperativasToCntrs(nextCntrs, op.operativas || [], op)
    onPatch(op.dbId, { [mode.col]: serializeCntr(nextCntrs), operativas })
  }
  const removeCntr = (i: number) => commitCntrs(cntrs.filter((_, j) => j !== i))
  const addCntr = () => {
    const c = normalizeCntr(newCntr)
    if (!c || cntrs.includes(c)) { setNewCntr(''); return }
    commitCntrs([...cntrs, c])
    setNewCntr('')
    // Mantener el input abierto para carga rápida múltiple
  }

  const assigned = op.operatorId ? operatorById.get(op.operatorId) : null
  const eligible = operatorsForMode(operators, op.mode)
  // Nombres canónicos del catálogo → datalist del campo Cliente.
  const clienteOptions = knownClientes.map(c => c.name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'))
  // El estado de la FCL es DERIVADO (de las fechas de operativa) — read-only, como
  // en la planilla. Editable solo en LCL/aéreo/terrestre sin camión.
  const statusEditable = op.source === 'db' && op.mode !== 'fcl' && !!op.dbId && !truckStatus
  const segVencido = isSeguimientoVencido(op, truckStatus?.status, hoy)

  // Fotos e informes: chip compacto junto a la REF (abre el Dialog). El conteo
  // suma fotos de la operación (origen + Uruguay) + informes PDF — mismo criterio
  // de matcheo que OperationMediaSection (shipmentRef === REF exacto).
  const mediaEnabled = !!(originPhotos || reports) && !!op.ref
  const mediaCount = mediaEnabled
    ? (originPhotos || []).filter(p => p.shipmentRef === op.ref).length +
      (reports || []).filter(r => r.shipmentRef === op.ref).length
    : 0

  // Renombrar la REF: solo cargas DB editables (incl. FCL horneada). PIN 0000 + cascada.
  const canRenameRef = op.source === 'db' && !!op.dbId && !op.readOnly && !!onRenameRef
  const submitRename = async () => {
    if (!onRenameRef || renameBusy) return
    const nr = refDraft.trim()
    if (!nr || nr === op.ref) { setRenaming(false); return }
    setRenameBusy(true)
    try {
      await onRenameRef(op, nr, pinDraft)
      setRenaming(false); setRefDraft(''); setPinDraft('')
    } catch (e) {
      toast.error((e as Error)?.message || 'No se pudo renombrar la REF')
    } finally {
      setRenameBusy(false)
    }
  }

  return (
    <Sheet open={!!op} onOpenChange={(v) => {
      if (!v) {
        // Comitear los borradores de fechas por contenedor ANTES de cerrar: el
        // arribo fiscal / salida recién elegidos en el calendario nativo no
        // blurean al cerrar con la X / Escape / click afuera → se perderían.
        datesRef.current?.flush()
        onClose()
      }
    }}>
      <SheetContent side="right" className="w-full sm:w-[480px] sm:max-w-[90vw] overflow-y-auto p-0" onEscapeKeyDown={e => { if ((e.target as HTMLElement)?.tagName === 'INPUT') e.preventDefault() }}>
        <SheetHeader className="border-b px-4 pt-4 pb-2">
          <SheetTitle className="flex items-center gap-2 flex-wrap pr-8">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: MODALITY_COLORS[op.mode] }} />
            {op.ref || '(sin ref)'}
            {op.readOnly && <LockSimple size={14} className="text-muted-foreground" />}
            {op.webEdited && op.webEdited.length > 0 && (
              <span title={`Editada en la web: ${op.webEdited.join(', ')} (pisa a la planilla)`} className="text-sm">✏️</span>
            )}
            {canRenameRef && !renaming && (
              <button
                type="button"
                onClick={() => { setRefDraft(op.ref); setRenaming(true) }}
                title="Renombrar REF (con PIN)"
                className="text-muted-foreground hover:text-foreground"
              >
                <PencilSimple size={13} />
              </button>
            )}
            {onSplit && canRenameRef && !renaming && (
              <button
                type="button"
                onClick={onSplit}
                title="Dividir la carga en partes A/B (contenedores enteros o parte de uno)"
                className="text-muted-foreground hover:text-foreground"
              >
                <ArrowsSplit size={13} />
              </button>
            )}
            {/* Chip fotos e informes — junto a la REF; abre el Dialog de medios */}
            {mediaEnabled && (
              <button
                type="button"
                onClick={() => setMediaOpen(true)}
                title="Fotos e informes"
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  mediaCount > 0
                    ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'
                    : 'border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary'
                }`}
              >
                <Camera size={12} weight={mediaCount > 0 ? 'fill' : 'regular'} />
                {mediaCount > 0 ? mediaCount : 'Agregar'}
              </button>
            )}
          </SheetTitle>
          <SheetDescription className="text-left">{op.cliente || '—'}</SheetDescription>
          <div className="flex items-center gap-1.5 flex-wrap pb-1">
            <Badge variant="outline" className="h-5 text-[9px]">{op.tipo || MODALITY_LABELS[op.mode]}</Badge>
            {op.pais && <Badge variant="outline" className="h-5 text-[9px]">{PAIS_LABEL[op.pais] || op.pais}</Badge>}
            {op.eta && <Badge variant="outline" className="h-5 text-[9px]">ETA {fmtDateDMY(op.eta)}</Badge>}
            {truckStatus && op.mode !== 'fcl' ? (
              <Badge variant="outline" className={`h-5 text-[9px] gap-1 ${statusBadgeClass(STATUS_LABEL[truckStatus.status] || truckStatus.status)}`} title={`Estado controlado por el camión ${truckStatus.truckCode}`}>
                <TruckIcon size={10} weight="fill" className="text-primary" />
                {truckStatus.truckCode} · {STATUS_LABEL[truckStatus.status] || truckStatus.status}
              </Badge>
            ) : statusEditable ? (
              <select
                value={op.status || ''}
                onChange={e => onPatch(op.dbId!, { status: e.target.value })}
                className="h-6 text-xs rounded border border-border bg-card px-1"
              >
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              op.status && <Badge variant="outline" className={`h-5 text-[9px] ${statusBadgeClass(STATUS_LABEL[op.status] || op.status)}`}>{STATUS_LABEL[op.status] || op.status}</Badge>
            )}
            {op.archived && <Badge variant="outline" className="h-5 text-[9px] text-amber-700 border-amber-300">ARCHIVADA</Badge>}
          </div>
          {renaming && (
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <Input value={refDraft} onChange={e => setRefDraft(e.target.value)} placeholder="Nueva REF" className="h-7 w-28 text-xs" autoFocus />
              <Input value={pinDraft} onChange={e => setPinDraft(e.target.value)} placeholder="PIN" type="password" className="h-7 w-16 text-xs" />
              <button type="button" onClick={submitRename} disabled={renameBusy} className="text-[11px] px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50">{renameBusy ? '…' : 'Cambiar'}</button>
              <button type="button" onClick={() => setRenaming(false)} className="text-[11px] px-2 py-1 rounded border border-border">Cancelar</button>
            </div>
          )}
        </SheetHeader>

        <div className="p-4 space-y-4 text-sm">
          {/* Operativo asignado */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground w-24 shrink-0">Operativo</span>
            <select
              value={op.operatorId || ''}
              onChange={e => onAssign(op, e.target.value || null)}
              className="h-7 flex-1 text-xs rounded border border-border bg-card px-1.5"
              style={assigned ? { color: assigned.color || undefined } : undefined}
            >
              <option value="">— sin asignar —</option>
              {eligible.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>

          {/* Bloque de viabilidad */}
          <ViabilityBlock
            op={op}
            editable={op.source === 'db' && !!op.dbId && !op.readOnly}
            knownDepositos={knownDepositos}
            knownTransportes={knownTransportes}
            knownFiscales={knownFiscales}
            fiscalSugerido={fiscalSugerido}
            knownDevs={knownDevs}
            knownLugaresDescarga={knownLugaresDescarga}
            knownTerminales={knownTerminales}
            checksSlot={
              // Mismo universo que la pestaña Checks: FCL activas por Uruguay.
              op.mode === 'fcl' && isPorUruguay(op.pais)
                ? <RefChecksInline refKey={op.ref} operativa={op.operativa} />
                : undefined
            }
            onCommit={commit}
          />

          {/* Salidas y arribos por contenedor (FCL solamente) */}
          <ContainerDatesSection
            ref={datesRef}
            op={op}
            editable={op.source === 'db' && !!op.dbId && !op.readOnly}
            onCommitOperativas={next => {
              if (op.dbId) onPatch(op.dbId, { operativas: next })
            }}
          />

          {/* Pagos de la carga — mismos datos/reglas que la pestaña Pagos
              (pedido 16/07: cargar montos sin salir de la ficha). Mismo
              universo: FCL con fila DB, fuera de Chile. */}
          {op.mode === 'fcl' && dbRow && dbRow.source !== 'sheet' &&
            (dbRow.dest_country || '').trim().toUpperCase() !== 'CL' && (
            <PagosSection
              dbRow={dbRow}
              editable={op.source === 'db' && !!op.dbId && !op.readOnly}
              onPatch={onPatch}
            />
          )}

          {/* Contenedores — card slate suave (identidad de color por sección) */}
          <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <h4 className="text-[10px] uppercase tracking-wide font-semibold text-slate-600 mb-2">
              Contenedores ({cntrs.length})
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {cntrs.length === 0 && !cntrEditable && <span className="text-muted-foreground">—</span>}
              {cntrs.map((c, i) => (
                <span
                  key={`${c}-${i}`}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-mono ${isStandardCntr(c) ? 'bg-muted/50' : 'bg-amber-50 border-amber-300 text-amber-800'}`}
                  title={isStandardCntr(c) ? c : `${c} — no parece un número de contenedor válido, revisalo`}
                >
                  {c}
                  {cntrEditable && (
                    <button type="button" onClick={() => removeCntr(i)} title="Quitar contenedor" className="text-muted-foreground hover:text-red-600">
                      <X size={11} />
                    </button>
                  )}
                </span>
              ))}
              {cntrEditable && (
                addingCntr ? (
                  <span className="inline-flex items-center gap-1">
                    <Input
                      autoFocus
                      value={newCntr}
                      onChange={e => setNewCntr(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') addCntr()
                        if (e.key === 'Escape') { setNewCntr(''); setAddingCntr(false) }
                      }}
                      onBlur={() => { if (!newCntr.trim()) setAddingCntr(false) }}
                      placeholder="CNTR…"
                      className="h-7 w-32 text-xs font-mono"
                    />
                    <button type="button" onClick={addCntr} title="Agregar contenedor" className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/5">
                      <Plus size={13} />
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingCntr(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <Plus size={12} /> Agregar contenedor
                  </button>
                )
              )}
            </div>
          </section>

          {/* Secciones de campos — cada una un card con su identidad de color,
              campos como cuadros grandes (mismo patrón que "Datos clave") */}
          {SECTIONS.map(sec => {
            const fields = (sec.title === 'Fechas' && hidePerContainerDates)
              ? sec.fields.filter(f => f.key !== 'salida' && f.key !== 'etaFisc')
              : sec.fields
            const tone = SECTION_TONES[sec.tone]
            return (
            <section key={sec.title} className={`rounded-lg border p-3 ${tone.card}`}>
              <h4 className={`text-[10px] uppercase tracking-wide font-semibold mb-2 ${tone.label}`}>{sec.title}</h4>
              <div className="grid grid-cols-2 gap-2">
                {fields.map(f => (
                  <FieldRow
                    key={f.key}
                    label={f.label}
                    op={op}
                    fieldKey={f.key}
                    kind={f.kind}
                    wide={f.wide}
                    dateDisplay={f.dateDisplay}
                    segVencido={f.key === 'seguimiento' && segVencido}
                    boxClass={tone.box}
                    options={f.key === 'cliente' && clienteOptions.length > 0 ? clienteOptions : undefined}
                    onCommit={commit}
                  />
                ))}
              </div>
              {/* Indicadores booleanos — solo en la sección Carga */}
              {sec.title === 'Carga' && (
                <div className="mt-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Indicadores</p>
                  <div className="flex flex-wrap gap-1.5">
                    {/* Toggles, no tags: activo = tinte de marca + check; inactivo =
                        borde punteado "para completar". Misma lógica de siempre. */}
                    {FLAGS.map(f => {
                      const raw = (op as unknown as Record<string, unknown>)[f.key]
                      const isOn = raw === true || raw === 'SI'
                      const mode = editModeFor(op, f.key)
                      return (
                        <button
                          key={f.key}
                          type="button"
                          onClick={mode ? () => commit(f.key, !isOn) : undefined}
                          disabled={!mode}
                          title={mode ? (isOn ? `Quitar ${f.label}` : `Marcar ${f.label}`) : 'Solo lectura (viene de la planilla)'}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs select-none transition-all duration-150 ${
                            isOn
                              ? 'bg-primary/10 border-primary/30 text-primary font-semibold'
                              : 'border-dashed border-border text-muted-foreground'
                          } ${mode ? 'cursor-pointer hover:ring-2 hover:ring-primary/20' : 'cursor-default'}`}
                        >
                          {isOn && <Check size={12} weight="bold" />}
                          {f.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </section>
            )
          })}

          {/* Acciones (solo filas DB) */}
          {op.source === 'db' && op.dbId && (
            <section className="flex items-center gap-2 border-t pt-3">
              <button
                type="button"
                onClick={() => onPatch(op.dbId!, { archived: !op.archived })}
                className="inline-flex items-center gap-1.5 text-xs rounded-md border px-2.5 py-1.5 text-muted-foreground hover:text-amber-700 hover:border-amber-300 hover:bg-amber-50"
              >
                {op.archived ? <><ArrowCounterClockwise size={13} /> Restaurar</> : <><Archive size={13} /> Archivar</>}
              </button>
              {onRequestDelete && (
                <button
                  type="button"
                  onClick={() => onRequestDelete(op)}
                  className="inline-flex items-center gap-1.5 text-xs rounded-md border border-red-200 px-2.5 py-1.5 text-red-600 hover:border-red-300 hover:bg-red-50"
                >
                  <Trash size={13} /> Eliminar…
                </button>
              )}
            </section>
          )}

          {op.source === 'fcl' && (
            <p className="text-[11px] text-muted-foreground border-t pt-3 flex items-center gap-1.5">
              <LockSimple size={11} /> Salida y arribo fiscal se editan por contenedor; LIBRE y operativa en “Datos clave de la carga”.
            </p>
          )}
        </div>

        {/* Dialog de fotos e informes — se abre desde el chip del header y reusa
            OperationMediaSection completo (galerías origen/Uruguay + informes +
            uploads). Todas las modalidades: la clave es la ref (fotos/informes
            viven en tablas propias keyed por shipment_ref, no dependen de la fila). */}
        {mediaEnabled && (
          <Dialog open={mediaOpen} onOpenChange={setMediaOpen}>
            <DialogContent className="sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Fotos e informes — {op.ref}</DialogTitle>
                <DialogDescription>
                  Fotos de la carga (origen y Uruguay) e informes PDF de la operación.
                </DialogDescription>
              </DialogHeader>
              <OperationMediaSection
                shipmentRef={op.ref}
                originPhotos={originPhotos || []}
                reports={reports || []}
                onUpdateOriginPhotos={onUpdateOriginPhotos}
                onUpdateReports={onUpdateReports}
                hideHeader
              />
            </DialogContent>
          </Dialog>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ── Cuadro label+valor del panel (mismo patrón que StatBox de "Datos clave"):
// label 10px uppercase arriba, valor grande semibold abajo, editable inline según
// editModeFor. SOLO cambia la presentación — el commit es idéntico al de siempre.
// Los campos bool (tlx, wood, oog, etc.) se renderizan en OperationDetailPanel
// como chips interactivos en la sección Carga, no como FieldRow.
function FieldRow({
  label,
  op,
  fieldKey,
  kind,
  wide,
  dateDisplay,
  segVencido,
  boxClass,
  options,
  onCommit,
}: {
  label: string
  op: UnifiedOperation
  fieldKey: keyof UnifiedOperation
  kind?: 'number' | 'date'
  wide?: boolean
  /** Mostrar como dd/MM/yyyy (display only) — la edición sigue sobre el valor crudo. */
  dateDisplay?: boolean
  segVencido?: boolean
  /** Borde teñido según la sección (SECTION_TONES.box). */
  boxClass?: string
  /** Sugerencias conocidas (datalist) — texto libre sigue permitido. */
  options?: string[]
  onCommit: (key: keyof UnifiedOperation, v: unknown) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  // true cuando la edición arrancó tipeando (type-to-edit): caret al final del
  // seed en vez de seleccionar todo (si no, la 2ª tecla pisa la 1ª).
  const seededRef = useRef(false)
  const mode = editModeFor(op, fieldKey)
  const raw = (op as unknown as Record<string, unknown>)[fieldKey]

  // Campos con opciones FIJAS (ej. País/zona destino): editor <select> que
  // guarda el CÓDIGO ('UY'/'AR'/'CL'/'OTRO') — texto libre acá rompería el
  // universo de Checks/Pagos/Previsión que filtra por esos códigos.
  const selectOptions = (mode?.kind === 'db' && mode.type === 'select' && mode.options) ? mode.options : null

  const display = kind === 'number'
    ? (Number(raw) ? NUM_FMT.format(Number(raw)) : '—')
    : selectOptions
      ? (selectOptions.find(o => o.value === String(raw ?? ''))?.label || String(raw ?? '') || '—')
      : ((dateDisplay ? fmtDateDMY(String(raw ?? '')) : String(raw ?? '')) || '—')

  const isEmpty = display === '—'

  // Campos fecha: editor type=date SOLO si el valor crudo está vacío o ya es ISO
  // (yyyy-MM-dd). Textos legacy (p.ej. anotaciones sueltas) siguen editándose como
  // texto para no perderlos — el input date los normalizaría a vacío.
  const rawStr = String(raw ?? '')
  const editAsDate = (kind === 'date' || dateDisplay) && (rawStr === '' || /^\d{4}-\d{2}-\d{2}$/.test(rawStr))

  const startEdit = (seed?: string) => {
    if (!mode) return
    seededRef.current = seed !== undefined
    setDraft(seed !== undefined ? seed : String(raw ?? ''))
    setEditing(true)
  }
  const save = () => {
    setEditing(false)
    if (kind === 'number') {
      if (draft.trim() === '') { if (raw !== null && raw !== 0) onCommit(fieldKey, null); return }
      const n = parseFloat(draft.replace(',', '.'))
      if (!isFinite(n)) return            // basura tipeada → no comitear nada
      if (String(raw ?? '') !== String(n)) onCommit(fieldKey, n)
      return
    }
    const v = draft.trim()
    if (String(raw ?? '') !== String(v)) onCommit(fieldKey, v)
  }
  // Al guardar con Enter (o cancelar con Escape) el input se desmonta y el foco
  // caía al body → se cortaba la cadena de Tab. Devolverlo al cuadro. (Con Tab
  // no hace falta: el blur guarda y el foco salta solo al siguiente cuadro.)
  const refocus = () => requestAnimationFrame(() => boxRef.current?.querySelector('button')?.focus())

  return (
    <div
      ref={boxRef}
      className={`group rounded-lg border p-2.5 min-w-0 ${
        segVencido ? 'border-red-300 bg-red-50' : `bg-card ${boxClass || ''}`
      } ${wide ? 'col-span-2' : ''}`}
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none mb-1">{label}</div>
      {editing ? (
        selectOptions ? (
          <select
            autoFocus
            value={draft}
            onChange={e => {
              setEditing(false)
              if (String(raw ?? '') !== e.target.value) onCommit(fieldKey, e.target.value)
              refocus()
            }}
            onBlur={() => setEditing(false)}
            onKeyDown={e => { if (e.key === 'Escape') { setEditing(false); refocus() } }}
            className="h-8 w-full rounded-md border border-input bg-background px-1 text-sm"
          >
            {selectOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
        <>
          <Input
            autoFocus
            type={editAsDate ? 'date' : undefined}
            list={options ? `fr-list-${String(fieldKey)}` : undefined}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onFocus={e => {
              const el = e.target as HTMLInputElement
              if (seededRef.current) { try { el.setSelectionRange(el.value.length, el.value.length) } catch { /* type=date no soporta selección */ } }
              else el.select()
            }}
            onBlur={save}
            onKeyDown={e => {
              if (e.key === 'Enter') { save(); refocus() }
              if (e.key === 'Escape') { setEditing(false); refocus() }
            }}
            className="h-8 text-sm px-1.5"
            inputMode={kind === 'number' ? 'decimal' : undefined}
          />
          {options && (
            <datalist id={`fr-list-${String(fieldKey)}`}>
              {options.map(o => <option key={o} value={o} />)}
            </datalist>
          )}
        </>
        )
      ) : (
        <button
          type="button"
          onClick={() => startEdit()}
          onKeyDown={e => {
            // Type-to-edit: tipear abre la edición con ese carácter ya puesto
            // (fechas se abren con Enter — el editor type=date no acepta seed).
            if (!mode || editAsDate) return
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
              e.preventDefault()
              startEdit(e.key)
            }
          }}
          disabled={!mode}
          className={`text-left w-full min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 ${mode ? 'cursor-text hover:opacity-70' : 'cursor-default'}`}
          title={mode ? 'Hacé clic o Enter para editar · Tab guarda y salta al siguiente' : 'Solo lectura (viene de la planilla)'}
        >
          <span
            className={`text-[15px] leading-tight break-words ${
              segVencido ? 'font-semibold text-red-700' : isEmpty ? 'text-muted-foreground' : 'font-semibold'
            }`}
          >
            {display}
          </span>
          {mode && !isEmpty && <PencilSimple size={10} className="inline ml-1 opacity-0 group-hover:opacity-40" />}
        </button>
      )}
    </div>
  )
}
