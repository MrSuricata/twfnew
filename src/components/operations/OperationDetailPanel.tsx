import { useState, useEffect, useRef } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { LockSimple, Truck as TruckIcon, Archive, ArrowCounterClockwise, Trash, Plus, X, PencilSimple } from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { Operator, UnifiedOperation } from '@/lib/operationsTypes'
import {
  EDITABLE_FIELDS, EDITABLE_FCL_FIELDS, MODALITY_COLORS, MODALITY_LABELS,
  STATUS_LABEL, STATUS_OPTIONS, operatorsForMode, isSeguimientoVencido,
} from '@/lib/operationsTypes'
import { parseCntr, serializeCntr, normalizeCntr, isStandardCntr } from '@/lib/cntrUtils'
import ViabilityBlock from './ViabilityBlock'

interface TruckRefInfo { truckCode: string; status: string }

const PAIS_LABEL: Record<string, string> = { UY: '🇺🇾 UY', AR: '🇦🇷 AR', CL: '🇨🇱 CL', OTRO: '—' }
const NUM_FMT = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 })

// Secciones del panel: declarativas.
// kind: 'number' → input numérico.
// wide: true → col-span-2 en el grid de 2 columnas.
// Nota: los campos bool (tlx, wood, oog, imo, noApilable, seguro, certi, impresa)
// se sacan de las secciones y se renderizan como chips interactivos en la sección Carga.
const SECTIONS: { title: string; fields: { key: keyof UnifiedOperation; label: string; kind?: 'number'; wide?: boolean }[] }[] = [
  {
    title: 'Identificación',
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
    fields: [
      { key: 'docNumber', label: 'BL / MAWB / CRT' },
      { key: 'buque', label: 'Buque' },
      { key: 'linea', label: 'Línea' },
    ],
  },
  {
    title: 'Ruta',
    fields: [
      { key: 'origin', label: 'Origen' },
      { key: 'dischargePort', label: 'Pto. descarga' },
      { key: 'destPort', label: 'Destino' },
      { key: 'pais', label: 'País' },
    ],
  },
  {
    title: 'Fechas',
    fields: [
      { key: 'etd', label: 'ETD' },
      { key: 'eta', label: 'ETA' },
      { key: 'salida', label: 'Salida' },
      { key: 'etaFisc', label: 'ETA fiscal' },
      { key: 'libre', label: 'LIBRE' },
      { key: 'seguimiento', label: 'Seguimiento' },
    ],
  },
  {
    title: 'Carga',
    fields: [
      { key: 'descripcion', label: 'Descripción', wide: true },
      { key: 'tipo', label: 'Tipo' },
    ],
  },
  {
    title: 'Operativa',
    fields: [
      { key: 'operativa', label: 'Operativa' },
      { key: 'transporte', label: 'Transporte' },
      { key: 'camion', label: 'Camión' },
      { key: 'despacho', label: 'Despacho' },
      { key: 'dev', label: 'DEV' },
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
  onAssign,
  onPatch,
  onPatchFcl,
  onRenameRef,
  onRequestDelete,
  onClose,
}: {
  op: UnifiedOperation | null
  truckStatus?: TruckRefInfo
  operators: Operator[]
  operatorById: Map<string, Operator>
  hoy: Date
  knownDepositos?: string[]
  onAssign: (op: UnifiedOperation, operatorId: string | null) => void
  onPatch: (id: string, fields: Record<string, unknown>) => void
  onPatchFcl?: (dbId: string, edits: Record<string, unknown>) => void
  onRenameRef?: (op: UnifiedOperation, newRef: string, pin: string) => Promise<void>
  onRequestDelete?: (op: UnifiedOperation) => void
  onClose: () => void
}) {
  const [newCntr, setNewCntr] = useState('')
  const [addingCntr, setAddingCntr] = useState(false)
  // Renombrado de REF (flip Etapa 4): form inline con PIN.
  const [renaming, setRenaming] = useState(false)
  const [refDraft, setRefDraft] = useState('')
  const [pinDraft, setPinDraft] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)

  // El panel no se desmonta al cambiar de operación: limpiar el borrador.
  const opUid = op?.uid
  useEffect(() => { setNewCntr(''); setAddingCntr(false); setRenaming(false); setRefDraft(''); setPinDraft('') }, [opUid])

  if (!op) return <Sheet open={false}><SheetContent side="right" /></Sheet>

  const commit = (key: keyof UnifiedOperation, v: unknown) => {
    const mode = editModeFor(op, key)
    if (!mode || !op.dbId) return
    if (mode.kind === 'db') onPatch(op.dbId, { [mode.col]: v })
    else onPatchFcl?.(op.dbId, { [EDITABLE_FCL_FIELDS[key]!]: v })
  }

  // ── Contenedores ──
  const cntrs = parseCntr(op.cntr)
  const cntrEditable = !!editModeFor(op, 'cntr')
  const removeCntr = (i: number) => commit('cntr', serializeCntr(cntrs.filter((_, j) => j !== i)))
  const addCntr = () => {
    const c = normalizeCntr(newCntr)
    if (!c || cntrs.includes(c)) { setNewCntr(''); return }
    commit('cntr', serializeCntr([...cntrs, c]))
    setNewCntr('')
    // Mantener el input abierto para carga rápida múltiple
  }

  const assigned = op.operatorId ? operatorById.get(op.operatorId) : null
  const eligible = operatorsForMode(operators, op.mode)
  // El estado de la FCL es DERIVADO (de las fechas de operativa) — read-only, como
  // en la planilla. Editable solo en LCL/aéreo/terrestre sin camión.
  const statusEditable = op.source === 'db' && op.mode !== 'fcl' && !!op.dbId && !truckStatus
  const segVencido = isSeguimientoVencido(op, truckStatus?.status, hoy)

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
    <Sheet open={!!op} onOpenChange={(v) => { if (!v) onClose() }}>
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
          </SheetTitle>
          <SheetDescription className="text-left">{op.cliente || '—'}</SheetDescription>
          <div className="flex items-center gap-1.5 flex-wrap pb-1">
            <Badge variant="outline" className="h-5 text-[9px]">{op.tipo || MODALITY_LABELS[op.mode]}</Badge>
            {op.pais && <Badge variant="outline" className="h-5 text-[9px]">{PAIS_LABEL[op.pais] || op.pais}</Badge>}
            {truckStatus ? (
              <Badge variant="outline" className="h-5 text-[9px] gap-1" title={`Estado controlado por el camión ${truckStatus.truckCode}`}>
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
              op.status && <Badge variant="outline" className="h-5 text-[9px]">{op.status}</Badge>
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
            onCommit={commit}
          />

          {/* Contenedores */}
          <section>
            <h4 className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 pb-1 border-b">
              Contenedores ({cntrs.length})
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {cntrs.length === 0 && !cntrEditable && <span className="text-muted-foreground">—</span>}
              {cntrs.map((c, i) => (
                <span
                  key={`${c}-${i}`}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-mono ${isStandardCntr(c) ? 'bg-muted/50' : 'bg-amber-50 border-amber-300 text-amber-800'}`}
                  title={isStandardCntr(c) ? c : `${c} — formato no estándar`}
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
                    <Plus size={12} /> agregar
                  </button>
                )
              )}
            </div>
          </section>

          {/* Secciones de campos */}
          {SECTIONS.map(sec => (
            <section key={sec.title}>
              <h4 className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 pb-1 border-b">{sec.title}</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                {sec.fields.map(f => (
                  <FieldRow
                    key={f.key}
                    label={f.label}
                    op={op}
                    fieldKey={f.key}
                    kind={f.kind}
                    wide={f.wide}
                    segVencido={f.key === 'seguimiento' && segVencido}
                    onCommit={commit}
                  />
                ))}
              </div>
              {/* Indicadores booleanos — solo en la sección Carga */}
              {sec.title === 'Carga' && (
                <div className="mt-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Indicadores</p>
                  <div className="flex flex-wrap gap-1.5">
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
                          className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                            isOn
                              ? 'bg-green-50 border-green-300 text-green-700 font-semibold'
                              : 'bg-card border-border text-muted-foreground'
                          } ${mode ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
                        >
                          {f.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </section>
          ))}

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
                  className="inline-flex items-center gap-1.5 text-xs rounded-md border px-2.5 py-1.5 text-muted-foreground hover:text-red-600 hover:border-red-300 hover:bg-red-50"
                >
                  <Trash size={13} /> Eliminar…
                </button>
              )}
            </section>
          )}

          {op.source === 'fcl' && (
            <p className="text-[11px] text-muted-foreground border-t pt-3 flex items-center gap-1.5">
              <LockSimple size={11} /> FCL espejo de la planilla: los campos con lápiz se editan acá (✏️ pisa a la planilla);
              salida / ETA fiscal / LIBRE siguen viniendo de la planilla hasta el flip.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ── Una stat-block label+valor del panel; editable según editModeFor ──
// Los campos bool (tlx, wood, oog, etc.) se renderizan en OperationDetailPanel
// como chips interactivos en la sección Carga, no como FieldRow.
function FieldRow({
  label,
  op,
  fieldKey,
  kind,
  wide,
  segVencido,
  onCommit,
}: {
  label: string
  op: UnifiedOperation
  fieldKey: keyof UnifiedOperation
  kind?: 'number'
  wide?: boolean
  segVencido?: boolean
  onCommit: (key: keyof UnifiedOperation, v: unknown) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const mode = editModeFor(op, fieldKey)
  const raw = (op as unknown as Record<string, unknown>)[fieldKey]

  const display = kind === 'number'
    ? (Number(raw) ? NUM_FMT.format(Number(raw)) : '—')
    : (String(raw ?? '') || '—')

  const isEmpty = display === '—'

  const startEdit = () => {
    if (!mode) return
    setDraft(String(raw ?? ''))
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

  return (
    <div className={`group flex flex-col gap-0.5 min-w-0 ${wide ? 'col-span-2' : ''}`}>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">{label}</span>
      {editing ? (
        <Input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onFocus={e => e.target.select()}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          className="h-6 text-[13px] px-1"
          inputMode={kind === 'number' ? 'decimal' : undefined}
        />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          disabled={!mode}
          className={`text-left text-[13px] leading-snug rounded px-0.5 py-0.5 break-words min-w-0 ${
            segVencido
              ? 'text-red-700 font-semibold bg-red-50 rounded px-1'
              : isEmpty
                ? 'text-muted-foreground'
                : 'font-medium'
          } ${mode ? 'hover:bg-primary/5 cursor-text' : 'cursor-default'}`}
          title={mode ? 'Click para editar (Enter guarda · Esc cancela)' : 'Solo lectura (viene de la planilla)'}
        >
          {display}
          {mode && !isEmpty && <PencilSimple size={10} className="inline ml-1 opacity-0 group-hover:opacity-40" />}
        </button>
      )}
    </div>
  )
}
