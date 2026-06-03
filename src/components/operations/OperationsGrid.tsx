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
} from '@phosphor-icons/react'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import type { LclAirShipment } from '@/lib/truckTypes'
import type { Operator, OperatorAssignment, Modality, UnifiedOperation } from '@/lib/operationsTypes'
import {
  buildOperations,
  indexAssignments,
  operatorsForMode,
  OPERATION_COLUMNS,
  MODALITY_LABELS,
  MODALITY_COLORS,
} from '@/lib/operationsTypes'

interface OperationsGridProps {
  shipments: ParsedShipment[]
  lclAir: LclAirShipment[]
  operators: Operator[]
  assignments: OperatorAssignment[]
  onAssignOperator: (ref: string, operatorId: string | null) => void
}

type ModeFilter = 'all' | Modality
const COLS_STORAGE_KEY = 'twf-ops-columns' // per-user (per-browser) column prefs

const NUM_FMT = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 })
const fmtNum = (n: number) => (n === 0 ? '' : NUM_FMT.format(n))

const MODE_ICON: Record<Modality, typeof Boat> = { fcl: TruckIcon, lcl: Stack, air: Airplane, land: TruckIcon }

export default function OperationsGrid({
  shipments,
  lclAir,
  operators,
  assignments,
  onAssignOperator,
}: OperationsGridProps) {
  const [search, setSearch] = useState('')
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')
  const [operatorFilter, setOperatorFilter] = useState<string>('all')

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
    () => buildOperations(shipments, lclAir, assignMap),
    [shipments, lclAir, assignMap]
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: operations.length, fcl: 0, lcl: 0, air: 0, land: 0 }
    for (const o of operations) c[o.mode] = (c[o.mode] || 0) + 1
    return c
  }, [operations])

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
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#1e3a8a] text-white">
              {cols.map(c => (
                <th key={c.key} className={`px-2.5 py-2 text-left font-semibold uppercase tracking-wide text-[10px] ${c.numeric ? 'text-right' : ''} ${c.sticky ? 'sticky left-0 bg-[#1e3a8a] z-20' : ''}`}>
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
                onAssign={onAssignOperator}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <LockSimple size={12} /> Las FCL son espejo de la planilla (read-only) hasta la migración. LCL/aéreo/terrestre se editan desde su módulo. El operativo se asigna acá para todas.
      </p>
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
}: {
  op: UnifiedOperation
  cols: typeof OPERATION_COLUMNS
  operators: Operator[]
  operatorById: Map<string, Operator>
  even: boolean
  onAssign: (ref: string, operatorId: string | null) => void
}) {
  const Icon = MODE_ICON[op.mode]
  const eligible = operatorsForMode(operators, op.mode)
  const assigned = op.operatorId ? operatorById.get(op.operatorId) : null
  const bg = even ? 'bg-card' : 'bg-muted/30'

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
            onChange={e => onAssign(op.ref, e.target.value || null)}
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
      {cols.map(c => (
        <td key={c.key} className={`px-2.5 py-1.5 ${c.numeric ? 'text-right tabular-nums' : ''} ${c.sticky ? `sticky left-0 ${even ? 'bg-card' : 'bg-muted/30'}` : ''}`}>
          {cell(c.key)}
        </td>
      ))}
    </tr>
  )
}
