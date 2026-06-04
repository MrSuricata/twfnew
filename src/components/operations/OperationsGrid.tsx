import { useMemo, useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  MagnifyingGlass,
  Columns,
  LockSimple,
  Boat,
  Airplane,
  Truck as TruckIcon,
  Stack,
  UsersThree,
  MagicWand,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import OperatorsManager from './OperatorsManager'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import type { Operator, OperatorAssignment, Modality, UnifiedOperation, DbShipment } from '@/lib/operationsTypes'
import {
  buildOperations,
  indexAssignments,
  operatorsForMode,
  OPERATION_COLUMNS,
  EDITABLE_FIELDS,
  MODALITY_LABELS,
  MODALITY_COLORS,
} from '@/lib/operationsTypes'

interface OperationsGridProps {
  shipments: ParsedShipment[]
  dbShipments: DbShipment[]
  operators: Operator[]
  assignments: OperatorAssignment[]
  onAssignOperator: (ref: string, operatorId: string | null) => void
  onPatchShipment: (id: string, fields: Record<string, unknown>) => void
  onUpdateOperators: (operators: Operator[]) => void
  onDeleteOperator: (id: string) => void
}

type ModeFilter = 'all' | Modality
const COLS_STORAGE_KEY = 'twf-ops-columns' // per-user (per-browser) column prefs

const NUM_FMT = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 })
const fmtNum = (n: number) => (n === 0 ? '' : NUM_FMT.format(n))

const MODE_ICON: Record<Modality, typeof Boat> = { fcl: TruckIcon, lcl: Stack, air: Airplane, land: TruckIcon }

export default function OperationsGrid({
  shipments,
  dbShipments,
  operators,
  assignments,
  onAssignOperator,
  onPatchShipment,
  onUpdateOperators,
  onDeleteOperator,
}: OperationsGridProps) {
  const [search, setSearch] = useState('')
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')
  const [operatorFilter, setOperatorFilter] = useState<string>('all')
  const [managerOpen, setManagerOpen] = useState(false)

  // Per-user visible columns (localStorage). Default from column defs.
  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(COLS_STORAGE_KEY)
      if (stored) return new Set(JSON.parse(stored))
    } catch { /* ignore */ }
    return new Set(OPERATION_COLUMNS.filter(c => c.defaultOn).map(c => c.key))
  })
  useEffect(() => {
    try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify([...visibleCols])) } catch { /* ignore */ }
  }, [visibleCols])

  const assignMap = useMemo(() => indexAssignments(assignments), [assignments])
  const operations = useMemo(
    () => buildOperations(shipments, dbShipments, assignMap),
    [shipments, dbShipments, assignMap]
  )

  // Unified operator assignment: DB rows patch shipments.operator_id;
  // FCL (cache) rows use the operator_assignments overlay by ref.
  const assignOp = (op: UnifiedOperation, operatorId: string | null) => {
    if (op.source === 'db' && op.dbId) onPatchShipment(op.dbId, { operator_id: operatorId })
    else onAssignOperator(op.ref, operatorId)
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: operations.length, fcl: 0, lcl: 0, air: 0, land: 0 }
    for (const o of operations) c[o.mode] = (c[o.mode] || 0) + 1
    return c
  }, [operations])

  // Auto-assign: for unassigned refs whose mode has exactly ONE eligible
  // operator, assign it (e.g. aéreo/terrestre → Fabián). FCL/LCL have many
  // operators → skipped (no way to guess which).
  const handleAutoAssign = () => {
    let count = 0
    for (const op of operations) {
      if (op.operatorId) continue
      const eligible = operatorsForMode(operators, op.mode)
      if (eligible.length === 1) { assignOp(op, eligible[0].id); count++ }
    }
    toast[count > 0 ? 'success' : 'info'](
      count > 0 ? `${count} carga${count === 1 ? '' : 's'} auto-asignada${count === 1 ? '' : 's'}` : 'No hay cargas auto-asignables (modos con un solo operativo)'
    )
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return operations.filter(o => {
      if (modeFilter !== 'all' && o.mode !== modeFilter) return false
      if (operatorFilter !== 'all' && (o.operatorId || '') !== operatorFilter) return false
      if (q) {
        const blob = `${o.ref} ${o.cliente} ${o.cntr} ${o.fiscal} ${o.descripcion} ${o.transporte}`.toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
  }, [operations, modeFilter, operatorFilter, search])

  const cols = OPERATION_COLUMNS.filter(c => visibleCols.has(c.key))
  const operatorById = useMemo(() => {
    const m = new Map<string, Operator>()
    for (const o of operators) m.set(o.id, o)
    return m
  }, [operators])

  const modeChips: { id: ModeFilter; label: string; color?: string }[] = [
    { id: 'all', label: 'Todas' },
    { id: 'fcl', label: 'FCL', color: MODALITY_COLORS.fcl },
    { id: 'lcl', label: 'LCL', color: MODALITY_COLORS.lcl },
    { id: 'air', label: 'Aéreo', color: MODALITY_COLORS.air },
    { id: 'land', label: 'Terrestre', color: MODALITY_COLORS.land },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Operaciones</h2>
          <p className="text-sm text-muted-foreground">{counts.all.toLocaleString('es-UY')} cargas · vista unificada FCL · LCL · aéreo · terrestre</p>
        </div>
      </div>

      {/* Mode chips */}
      <div className="flex flex-wrap gap-2">
        {modeChips.map(m => (
          <button
            key={m.id}
            onClick={() => setModeFilter(m.id)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 border text-sm transition-all hover:shadow-sm ${
              modeFilter === m.id ? 'bg-primary/5 border-primary/40' : 'bg-card border-border'
            }`}
          >
            {m.color && <span className="w-2 h-2 rounded-sm" style={{ background: m.color }} />}
            <span className="font-medium">{m.label}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{counts[m.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar ref, cliente, CNTR, fiscal…" className="pl-9 h-9" />
        </div>

        {/* Operator filter */}
        <select
          value={operatorFilter}
          onChange={e => setOperatorFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-border bg-card text-sm"
        >
          <option value="all">Todos los operativos</option>
          <option value="">Sin asignar</option>
          {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>

        {/* Auto-assign by mode */}
        <Button variant="outline" size="sm" className="h-9" onClick={handleAutoAssign} title="Asigna automáticamente los modos con un solo operativo (aéreo/terrestre)">
          <MagicWand size={16} className="mr-1.5" /> Auto-asignar
        </Button>

        {/* Manage operators */}
        <Button variant="outline" size="sm" className="h-9" onClick={() => setManagerOpen(true)}>
          <UsersThree size={16} className="mr-1.5" /> Operativos
        </Button>

        {/* Column picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              <Columns size={16} className="mr-1.5" /> Columnas
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-1.5 pb-1.5">Columnas visibles</div>
            <div className="max-h-[320px] overflow-y-auto">
              {OPERATION_COLUMNS.map(c => (
                <label key={c.key} className={`flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted text-sm ${c.sticky ? 'opacity-60' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    checked={visibleCols.has(c.key)}
                    disabled={c.sticky}
                    onChange={e => {
                      setVisibleCols(prev => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(c.key); else next.delete(c.key)
                        return next
                      })
                    }}
                    className="accent-primary"
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Grid */}
      <div className="border rounded-lg overflow-auto max-h-[68vh] bg-card">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#1e3a8a] text-white">
              {cols.map(c => (
                <th key={c.key} className={`px-2 py-2 text-left font-semibold uppercase tracking-wide text-[10px] align-bottom ${c.w || ''} ${c.numeric ? 'text-right' : ''} ${c.sticky ? 'sticky left-0 bg-[#1e3a8a] z-20' : ''}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr><td colSpan={cols.length} className="text-center py-12 text-muted-foreground">Sin operaciones para los filtros actuales.</td></tr>
            ) : filtered.map((op, idx) => (
              <OperationRow
                key={`${op.source}-${op.ref}`}
                op={op}
                cols={cols}
                operators={operators}
                operatorById={operatorById}
                even={idx % 2 === 0}
                onAssign={assignOp}
                onPatch={onPatchShipment}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <LockSimple size={12} /> Las FCL son espejo de la planilla (read-only) 🔒. LCL / aéreo / terrestre se editan acá: <strong>click en una celda</strong> para cambiarla (Enter guarda · Esc cancela). El operativo se asigna para todas.
      </p>

      <OperatorsManager
        open={managerOpen}
        onOpenChange={setManagerOpen}
        operators={operators}
        onUpdateOperators={onUpdateOperators}
        onDeleteOperator={onDeleteOperator}
      />
    </div>
  )
}

// ── Row ──

function OperationRow({
  op,
  cols,
  operators,
  operatorById,
  even,
  onAssign,
  onPatch,
}: {
  op: UnifiedOperation
  cols: typeof OPERATION_COLUMNS
  operators: Operator[]
  operatorById: Map<string, Operator>
  even: boolean
  onAssign: (op: UnifiedOperation, operatorId: string | null) => void
  onPatch: (id: string, fields: Record<string, unknown>) => void
}) {
  const eligible = operatorsForMode(operators, op.mode)
  const assigned = op.operatorId ? operatorById.get(op.operatorId) : null
  const bg = even ? 'bg-card' : 'bg-muted/30'
  // DB rows (LCL/aéreo/terrestre) are inline-editable; FCL is a read-only mirror.
  const editable = op.source === 'db' && !!op.dbId && !op.readOnly

  const cell = (key: string) => {
    switch (key) {
      case 'ref':
        return (
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: MODALITY_COLORS[op.mode] }} />
            {op.ref}
            {op.readOnly && <LockSimple size={11} className="text-muted-foreground" />}
          </span>
        )
      case 'operator':
        return (
          <select
            value={op.operatorId || ''}
            onChange={e => onAssign(op, e.target.value || null)}
            className="h-6 max-w-[130px] text-xs rounded border border-transparent hover:border-border bg-transparent px-1 cursor-pointer focus:border-primary"
            style={assigned ? { color: assigned.color || undefined } : undefined}
          >
            <option value="">— sin asignar —</option>
            {eligible.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )
      case 'wood':
        return op.wood ? <span className="text-green-600 font-semibold">SI</span> : ''
      case 'pkgs': return fmtNum(op.pkgs)
      case 'kg': return fmtNum(op.kg)
      case 'm3': return fmtNum(op.m3)
      case 'tipo':
        return <Badge variant="outline" className="h-5 text-[9px]">{op.tipo || MODALITY_LABELS[op.mode]}</Badge>
      default:
        return (op as unknown as Record<string, unknown>)[key] as string || ''
    }
  }

  return (
    <tr className={`${bg} hover:bg-primary/5`}>
      {cols.map((c) => {
        const ef = editable ? EDITABLE_FIELDS[c.key as keyof UnifiedOperation] : undefined
        const tdClass = `px-2 py-1.5 align-top ${c.w || ''} ${c.numeric ? 'text-right tabular-nums' : ''} ${c.wrap ? 'whitespace-normal break-words' : 'whitespace-nowrap'} ${c.sticky ? `sticky left-0 ${even ? 'bg-card' : 'bg-muted/30'}` : ''}`

        if (ef) {
          return (
            <td key={c.key} className={tdClass}>
              <EditableCell
                value={(op as unknown as Record<string, unknown>)[c.key] as string | number | boolean}
                type={ef.type}
                wrap={c.wrap}
                onCommit={v => onPatch(op.dbId!, { [ef.col]: v })}
              />
            </td>
          )
        }

        const content = cell(c.key)
        return (
          <td key={c.key} className={tdClass}>
            {c.wrap
              ? <div className="line-clamp-2 leading-snug" title={typeof content === 'string' ? content : undefined}>{content}</div>
              : content}
          </td>
        )
      })}
    </tr>
  )
}

// ── Inline-editable cell (DB rows only) ──
// text/number → click to edit, Enter/blur saves, Esc cancels.
// bool → click toggles SI/— and saves immediately.
function EditableCell({
  value,
  type,
  wrap,
  onCommit,
}: {
  value: string | number | boolean
  type: 'text' | 'number' | 'bool'
  wrap?: boolean
  onCommit: (v: string | number | boolean | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  if (type === 'bool') {
    const on = value === 'SI' || value === true
    return (
      <button
        type="button"
        onClick={() => onCommit(!on)}
        title="Click para cambiar"
        className={`h-5 px-1.5 rounded text-[10px] font-semibold transition-colors ${on ? 'text-green-600 hover:bg-green-50' : 'text-muted-foreground/50 hover:bg-muted'}`}
      >
        {on ? 'SI' : '—'}
      </button>
    )
  }

  if (editing) {
    const commit = () => {
      setEditing(false)
      const t = draft.trim()
      if (type === 'number') {
        if (t === '') { if (value !== 0 && value !== '') onCommit(null); return }
        const n = parseFloat(t.replace(',', '.'))
        if (isFinite(n) && n !== Number(value)) onCommit(n)
      } else {
        if (draft !== (value ?? '')) onCommit(draft)
      }
    }
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onFocus={e => e.target.select()}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          else if (e.key === 'Escape') { e.preventDefault(); setEditing(false) }
        }}
        inputMode={type === 'number' ? 'decimal' : undefined}
        className="w-full h-6 px-1 rounded border border-primary bg-background text-xs outline-none"
      />
    )
  }

  const display = type === 'number'
    ? (value === 0 || value === '' ? '' : fmtNum(Number(value)))
    : ((value as string) || '')
  return (
    <div
      onClick={() => { setDraft(value === 0 || value == null ? '' : String(value)); setEditing(true) }}
      title="Click para editar"
      className={`min-h-[20px] cursor-text rounded px-1 -mx-1 hover:bg-primary/10 ${wrap ? 'line-clamp-2 leading-snug' : ''}`}
    >
      {display || <span className="text-muted-foreground/30">—</span>}
    </div>
  )
}
