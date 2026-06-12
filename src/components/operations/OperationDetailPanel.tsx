import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { LockSimple, Truck as TruckIcon, Archive, ArrowCounterClockwise, Trash, Plus, X, PencilSimple } from '@phosphor-icons/react'
import type { Operator, UnifiedOperation } from '@/lib/operationsTypes'
import {
  EDITABLE_FIELDS, EDITABLE_FCL_FIELDS, MODALITY_COLORS, MODALITY_LABELS,
  STATUS_LABEL, STATUS_OPTIONS, operatorsForMode, isSeguimientoVencido,
} from '@/lib/operationsTypes'
import { parseCntr, serializeCntr, normalizeCntr, isStandardCntr } from '@/lib/cntrUtils'

interface TruckRefInfo { truckCode: string; status: string }

const PAIS_LABEL: Record<string, string> = { UY: '🇺🇾 UY', AR: '🇦🇷 AR', CL: '🇨🇱 CL', OTRO: '—' }
const NUM_FMT = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 })

// Secciones del panel: declarativas.
// kind: 'bool' → toggle; kind: 'number' → input numérico.
// Nota: tlx tiene kind: 'bool' explícito porque en UnifiedOperation es string 'SI'|'',
// no boolean — ver FieldRow para el manejo especial.
const SECTIONS: { title: string; fields: { key: keyof UnifiedOperation; label: string; kind?: 'bool' | 'number' }[] }[] = [
  {
    title: 'Documental',
    fields: [
      { key: 'docNumber', label: 'BL / MAWB / CRT' },
      { key: 'tlx', label: 'Telex', kind: 'bool' },
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
      { key: 'descarga', label: 'Descarga' },
    ],
  },
  {
    title: 'Carga',
    fields: [
      { key: 'pkgs', label: 'Bultos', kind: 'number' },
      { key: 'kg', label: 'Kg', kind: 'number' },
      { key: 'm3', label: 'M³', kind: 'number' },
      { key: 'descripcion', label: 'Descripción' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'wood', label: 'Wood', kind: 'bool' },
      { key: 'oog', label: 'OOG', kind: 'bool' },
      { key: 'imo', label: 'IMO', kind: 'bool' },
      { key: 'noApilable', label: 'No apilable', kind: 'bool' },
      { key: 'seguro', label: 'Seguro', kind: 'bool' },
      { key: 'certi', label: 'Certificada', kind: 'bool' },
      { key: 'impresa', label: 'Impresa', kind: 'bool' },
    ],
  },
  {
    title: 'Operativa',
    fields: [
      { key: 'deposito', label: 'Depósito' },
      { key: 'operativa', label: 'Operativa' },
      { key: 'fiscal', label: 'Fiscal' },
      { key: 'transporte', label: 'Transporte' },
      { key: 'camion', label: 'Camión' },
      { key: 'despacho', label: 'Despacho' },
      { key: 'dev', label: 'DEV' },
    ],
  },
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
  onAssign,
  onPatch,
  onPatchFcl,
  onRequestDelete,
  onClose,
}: {
  op: UnifiedOperation | null
  truckStatus?: TruckRefInfo
  operators: Operator[]
  operatorById: Map<string, Operator>
  hoy: Date
  onAssign: (op: UnifiedOperation, operatorId: string | null) => void
  onPatch: (id: string, fields: Record<string, unknown>) => void
  onPatchFcl?: (dbId: string, edits: Record<string, unknown>) => void
  onRequestDelete?: (op: UnifiedOperation) => void
  onClose: () => void
}) {
  const [newCntr, setNewCntr] = useState('')

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
    if (!c) return
    commit('cntr', serializeCntr([...cntrs, c]))
    setNewCntr('')
  }

  const assigned = op.operatorId ? operatorById.get(op.operatorId) : null
  const eligible = operatorsForMode(operators, op.mode)
  const statusEditable = op.source === 'db' && !!op.dbId && !truckStatus
  const segVencido = isSeguimientoVencido(op, truckStatus?.status, hoy)

  return (
    <Sheet open={!!op} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent side="right" className="w-full sm:w-[480px] sm:max-w-[90vw] overflow-y-auto p-0">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2 flex-wrap pr-8">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: MODALITY_COLORS[op.mode] }} />
            {op.ref || '(sin ref)'}
            {op.readOnly && <LockSimple size={14} className="text-muted-foreground" />}
            {op.webEdited && op.webEdited.length > 0 && (
              <span title={`Editada en la web: ${op.webEdited.join(', ')} (pisa a la planilla)`} className="text-sm">✏️</span>
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
        </SheetHeader>

        <div className="p-4 space-y-5 text-sm">
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

          {/* Contenedores */}
          <section>
            <h4 className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
              Contenedores ({cntrs.length})
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {cntrs.length === 0 && !cntrEditable && <span className="text-muted-foreground">—</span>}
              {cntrs.map((c, i) => (
                <span
                  key={`${c}-${i}`}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-mono ${isStandardCntr(c) ? 'bg-muted/50' : 'bg-amber-50 border-amber-300 text-amber-800'}`}
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
                <span className="inline-flex items-center gap-1">
                  <Input
                    value={newCntr}
                    onChange={e => setNewCntr(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addCntr() }}
                    placeholder="AGREGAR…"
                    className="h-6 w-32 text-xs font-mono"
                  />
                  <button type="button" onClick={addCntr} title="Agregar contenedor" className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/5">
                    <Plus size={13} />
                  </button>
                </span>
              )}
            </div>
          </section>

          {/* Secciones de campos */}
          {SECTIONS.map(sec => (
            <section key={sec.title}>
              <h4 className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5 border-b pb-1">{sec.title}</h4>
              <div className="space-y-0.5">
                {sec.fields.map(f => (
                  <FieldRow
                    key={f.key}
                    label={f.label}
                    op={op}
                    fieldKey={f.key}
                    kind={f.kind}
                    segVencido={f.key === 'seguimiento' && segVencido}
                    onCommit={commit}
                  />
                ))}
              </div>
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

// ── Una fila label+valor del panel; editable según editModeFor ──
// Nota sobre tlx: en UnifiedOperation es string 'SI'|'' (DB telex es bool,
// pero el campo unificado siempre es string). Con kind='bool' y raw string,
// val = raw === 'SI'. Al commitear un toggle DB, se envía el bool opuesto.
function FieldRow({
  label,
  op,
  fieldKey,
  kind,
  segVencido,
  onCommit,
}: {
  label: string
  op: UnifiedOperation
  fieldKey: keyof UnifiedOperation
  kind?: 'bool' | 'number'
  segVencido?: boolean
  onCommit: (key: keyof UnifiedOperation, v: unknown) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const mode = editModeFor(op, fieldKey)
  const raw = (op as unknown as Record<string, unknown>)[fieldKey]

  // Bool: toggle inmediato si es editable, badge si no.
  // Maneja tanto boolean nativo como string 'SI'|'' (caso tlx en UnifiedOperation).
  if (kind === 'bool' || typeof raw === 'boolean') {
    // val: true si el campo es true (boolean) o 'SI' (string)
    const val = raw === true || raw === 'SI'

    const handleToggle = () => {
      // Para DB con type 'bool' (ej: wood, tlx→telex): enviar bool real.
      // tlx en UnifiedOperation es string, pero la columna DB es bool;
      // EDITABLE_FIELDS['tlx'].col = 'telex', type = 'bool'.
      if (mode?.kind === 'db' && mode.type === 'bool') {
        onCommit(fieldKey, !val)
      } else {
        // FCL o texto bool: enviar como valor opuesto al display actual
        onCommit(fieldKey, !val)
      }
    }

    return (
      <div className="flex items-center gap-2 py-0.5">
        <span className="text-[11px] text-muted-foreground w-24 shrink-0">{label}</span>
        {mode ? (
          <button
            type="button"
            onClick={handleToggle}
            className={`text-xs rounded px-2 py-0.5 border ${val ? 'bg-green-50 border-green-300 text-green-700 font-semibold' : 'bg-card border-border text-muted-foreground'}`}
          >
            {val ? 'SI' : '—'}
          </button>
        ) : (
          <span className={`text-xs ${val ? 'text-green-700 font-semibold' : 'text-muted-foreground'}`}>{val ? 'SI' : '—'}</span>
        )}
      </div>
    )
  }

  const display = kind === 'number'
    ? (Number(raw) ? NUM_FMT.format(Number(raw)) : '—')
    : (String(raw ?? '') || '—')

  const startEdit = () => {
    if (!mode) return
    setDraft(String(raw ?? ''))
    setEditing(true)
  }
  const save = () => {
    setEditing(false)
    const v = kind === 'number' ? (parseFloat(draft.replace(',', '.')) || 0) : draft.trim()
    if (String(raw ?? '') !== String(v)) onCommit(fieldKey, v)
  }

  return (
    <div className="flex items-center gap-2 py-0.5 group">
      <span className="text-[11px] text-muted-foreground w-24 shrink-0">{label}</span>
      {editing ? (
        <Input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          className="h-6 text-xs flex-1"
          inputMode={kind === 'number' ? 'decimal' : undefined}
        />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          disabled={!mode}
          className={`flex-1 text-left text-xs rounded px-1 py-0.5 break-words ${segVencido ? 'bg-red-50 text-red-700 font-semibold' : ''} ${mode ? 'hover:bg-primary/5 cursor-text' : 'cursor-default'}`}
          title={mode ? 'Click para editar (Enter guarda · Esc cancela)' : 'Solo lectura (viene de la planilla)'}
        >
          {display}
          {mode && <PencilSimple size={10} className="inline ml-1.5 opacity-0 group-hover:opacity-40" />}
        </button>
      )}
    </div>
  )
}
