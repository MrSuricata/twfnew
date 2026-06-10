import { useMemo, useState, useEffect, useCallback, memo } from 'react'
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
  ClipboardText,
  DownloadSimple,
  Plus,
  Archive,
  ArrowCounterClockwise,
  Trash,
} from '@phosphor-icons/react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import OperatorsManager from './OperatorsManager'
import PasteImportDialog from './PasteImportDialog'
import NewShipmentDialog from './NewShipmentDialog'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import type { Operator, OperatorAssignment, Modality, UnifiedOperation, DbShipment } from '@/lib/operationsTypes'
import type { Truck, TruckLoad } from '@/lib/truckTypes'
import {
  buildOperations,
  indexAssignments,
  isOperationActive,
  operatorsForMode,
  deriveTruckCargoStatus,
  OPERATION_COLUMNS,
  EDITABLE_FIELDS,
  STATUS_LABEL,
  STATUS_OPTIONS,
  MODALITY_LABELS,
  MODALITY_COLORS,
} from '@/lib/operationsTypes'

// Per-ref truck info for the Estado column (LCL/aéreo driven by their truck).
interface TruckRefInfo { truckCode: string; status: string }

interface OperationsGridProps {
  shipments: ParsedShipment[]
  dbShipments: DbShipment[]
  trucks?: Truck[]
  truckLoads?: TruckLoad[]
  operators: Operator[]
  assignments: OperatorAssignment[]
  onAssignOperator: (ref: string, operatorId: string | null) => void
  onPatchShipment: (id: string, fields: Record<string, unknown>) => void
  onCreateShipment?: (row: DbShipment) => void
  onDeleteShipment?: (op: UnifiedOperation) => void
  onUpdateOperators: (operators: Operator[]) => void
  onDeleteOperator: (id: string) => void
}

type ModeFilter = 'all' | Modality
type ZonaFilter = 'all' | 'UY' | 'AR' | 'CL' | 'OTRO'
const COLS_STORAGE_KEY = 'twf-ops-columns'     // per-user visible columns
const COL_ORDER_KEY = 'twf-ops-col-order'      // per-user column order (drag & drop)
const ACTIVE_ONLY_KEY = 'twf-ops-active-only'  // toggle "Solo activas"

const PAIS_LABEL: Record<string, string> = { UY: '🇺🇾 UY', AR: '🇦🇷 AR', CL: '🇨🇱 CL', OTRO: '—' }

// Column value typing for sorting.
const NUMERIC_KEYS = new Set(['pkgs', 'kg', 'm3'])
const DATE_KEYS = new Set(['etd', 'eta', 'salida', 'etaFisc', 'libre', 'descarga', 'dev'])
const parseDateMs = (s: string): number => {
  const p = String(s || '').split('-')
  if (p.length !== 3) return NaN
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
  return isNaN(d.getTime()) ? NaN : d.getTime()
}

const NUM_FMT = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 })
const fmtNum = (n: number) => (n === 0 ? '' : NUM_FMT.format(n))

const MODE_ICON: Record<Modality, typeof Boat> = { fcl: TruckIcon, lcl: Stack, air: Airplane, land: TruckIcon }

export default function OperationsGrid({
  shipments,
  dbShipments,
  trucks,
  truckLoads,
  operators,
  assignments,
  onAssignOperator,
  onPatchShipment,
  onCreateShipment,
  onDeleteShipment,
  onUpdateOperators,
  onDeleteOperator,
}: OperationsGridProps) {
  const [search, setSearch] = useState('')
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')
  const [zonaFilter, setZonaFilter] = useState<ZonaFilter>('all')
  const [originFilter, setOriginFilter] = useState('')
  const [destFilter, setDestFilter] = useState('')
  const [operatorFilter, setOperatorFilter] = useState<string>('all')
  // "Solo activas" (ON por defecto): oculta devueltas+en fiscal / terminadas.
  const [activeOnly, setActiveOnly] = useState<boolean>(() => {
    try { const s = localStorage.getItem(ACTIVE_ONLY_KEY); if (s != null) return s === '1' } catch { /* ignore */ }
    return true
  })
  useEffect(() => {
    try { localStorage.setItem(ACTIVE_ONLY_KEY, activeOnly ? '1' : '0') } catch { /* ignore */ }
  }, [activeOnly])
  const [managerOpen, setManagerOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  // "Ver archivadas" (OFF por defecto) + confirmación de eliminado definitivo.
  const [showArchived, setShowArchived] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<UnifiedOperation | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState('')

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

  // Column order (per-user, drag-and-drop). Defaults to the canonical order.
  const [colOrder, setColOrder] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(COL_ORDER_KEY)
      if (stored) return JSON.parse(stored)
    } catch { /* ignore */ }
    return OPERATION_COLUMNS.map(c => c.key as string)
  })
  useEffect(() => {
    try { localStorage.setItem(COL_ORDER_KEY, JSON.stringify(colOrder)) } catch { /* ignore */ }
  }, [colOrder])

  // Sort by a column (click header → asc → desc → none).
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  // Drag-and-drop reorder state.
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)

  const assignMap = useMemo(() => indexAssignments(assignments), [assignments])
  const operations = useMemo(
    () => buildOperations(shipments, dbShipments, assignMap, showArchived),
    [shipments, dbShipments, assignMap, showArchived]
  )

  // ref → { truckCode, derivedStatus } for cargas loaded on a truck. The truck
  // drives the cargo's status (its dates are the source of truth), so the Estado
  // cell becomes read-only for these. planning trucks (no advance) are skipped.
  const truckByRef = useMemo(() => {
    const m = new Map<string, TruckRefInfo>()
    if (!trucks?.length || !truckLoads?.length) return m
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const tById = new Map(trucks.map(t => [t.id, t]))
    for (const l of truckLoads) {
      const t = tById.get(l.truckId)
      if (!t) continue
      const status = deriveTruckCargoStatus(
        { status: t.status, loadDate: t.loadDate, departureDate: t.departureDate, arrivalDate: t.arrivalDate },
        today,
      )
      if (status) m.set(l.sourceRef, { truckCode: t.code, status })
    }
    return m
  }, [trucks, truckLoads])

  // Unified operator assignment: DB rows patch shipments.operator_id;
  // FCL (cache) rows use the operator_assignments overlay by ref.
  // useCallback → stable ref so memoized rows don't re-render on sort/scroll.
  const assignOp = useCallback((op: UnifiedOperation, operatorId: string | null) => {
    if (op.source === 'db' && op.dbId) onPatchShipment(op.dbId, { operator_id: operatorId })
    else onAssignOperator(op.ref, operatorId)
  }, [onPatchShipment, onAssignOperator])

  // Abrir confirmación de eliminado (estable para las filas memoizadas).
  const requestDelete = useCallback((op: UnifiedOperation) => {
    setDeleteConfirm('')
    setDeleteTarget(op)
  }, [])

  // Base visible: con "Solo activas" ON se ocultan las terminadas (criterio:
  // devuelta Y en fiscal · DB: estado terminal · sin datos: ETA >60d atrás).
  const visibleOps = useMemo(() => {
    if (!activeOnly) return operations
    const today = new Date(); today.setHours(0, 0, 0, 0)
    // Archivadas exentas del filtro de activas: si "Ver archivadas" está ON,
    // se muestran siempre (si no, ese toggle no mostraría nada).
    return operations.filter(o => o.archived || isOperationActive(o, truckByRef.get(o.ref)?.status, today))
  }, [operations, activeOnly, truckByRef])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: visibleOps.length, fcl: 0, lcl: 0, air: 0, land: 0 }
    for (const o of visibleOps) c[o.mode] = (c[o.mode] || 0) + 1
    return c
  }, [visibleOps])

  const zonaCounts = useMemo(() => {
    const c: Record<string, number> = { all: visibleOps.length, UY: 0, AR: 0, CL: 0, OTRO: 0 }
    for (const o of visibleOps) { const z = o.pais || 'OTRO'; c[z] = (c[z] || 0) + 1 }
    return c
  }, [visibleOps])

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
    return visibleOps.filter(o => {
      if (modeFilter !== 'all' && o.mode !== modeFilter) return false
      if (zonaFilter !== 'all' && (o.pais || 'OTRO') !== zonaFilter) return false
      if (originFilter && !(o.origin || '').toLowerCase().includes(originFilter.toLowerCase())) return false
      if (destFilter && !(`${o.dischargePort} ${o.destPort}` || '').toLowerCase().includes(destFilter.toLowerCase())) return false
      if (operatorFilter !== 'all' && (o.operatorId || '') !== operatorFilter) return false
      if (q) {
        const blob = `${o.ref} ${o.clientRef} ${o.cliente} ${o.cntr} ${o.docNumber} ${o.fiscal} ${o.descripcion} ${o.transporte}`.toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
  }, [visibleOps, modeFilter, zonaFilter, originFilter, destFilter, operatorFilter, search])

  // Totals for the current filter (planning at a glance).
  const totals = useMemo(() => {
    let pkgs = 0, kg = 0, m3 = 0
    for (const o of filtered) { pkgs += o.pkgs || 0; kg += o.kg || 0; m3 += o.m3 || 0 }
    return { count: filtered.length, pkgs, kg, m3 }
  }, [filtered])

  // Visible columns in the user's drag-and-drop order (sticky col pinned first).
  const cols = useMemo(() => {
    const byKey = new Map(OPERATION_COLUMNS.map(c => [c.key as string, c]))
    const seen = new Set<string>()
    const ordered: typeof OPERATION_COLUMNS = []
    for (const k of colOrder) { const d = byKey.get(k); if (d) { ordered.push(d); seen.add(k) } }
    for (const c of OPERATION_COLUMNS) if (!seen.has(c.key as string)) ordered.push(c)
    const visible = ordered.filter(c => visibleCols.has(c.key))
    return [...visible].sort((a, b) => (b.sticky ? 1 : 0) - (a.sticky ? 1 : 0))
  }, [colOrder, visibleCols])

  const operatorById = useMemo(() => {
    const m = new Map<string, Operator>()
    for (const o of operators) m.set(o.id, o)
    return m
  }, [operators])

  // Plain-text value of a cell (for CSV export).
  const cellText = (op: UnifiedOperation, key: string): string => {
    switch (key) {
      case 'operator': return op.operatorId ? (operatorById.get(op.operatorId)?.name || '') : ''
      case 'wood': return op.wood ? 'SI' : ''
      case 'noApilable': return op.noApilable ? 'SI' : ''
      case 'oog': return op.oog ? 'SI' : ''
      case 'imo': return op.imo ? 'SI' : ''
      case 'seguro': return op.seguro ? 'SI' : ''
      case 'certi': return op.certi ? 'SI' : ''
      case 'impresa': return op.impresa ? 'SI' : ''
      case 'pkgs': return op.pkgs ? String(op.pkgs) : ''
      case 'kg': return op.kg ? String(op.kg) : ''
      case 'm3': return op.m3 ? String(op.m3) : ''
      case 'status': return op.source === 'fcl' ? op.status : (STATUS_LABEL[op.status] || op.status)
      default: return String((op as unknown as Record<string, unknown>)[key] ?? '')
    }
  }

  // Export the currently filtered rows (visible columns) to CSV for Excel.
  const exportCsv = () => {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const lines = [cols.map(c => esc(c.label)).join(',')]
    for (const op of filtered) lines.push(cols.map(c => esc(cellText(op, c.key))).join(','))
    const csv = '﻿' + lines.join('\r\n') // BOM → Excel reads UTF-8 + accents
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `operaciones_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`${filtered.length} cargas exportadas a CSV`)
  }

  // ── Sorting ──
  const sortValue = (op: UnifiedOperation, key: string): { empty: boolean; cmp: number | string } => {
    if (NUMERIC_KEYS.has(key)) { const n = (op as unknown as Record<string, number>)[key] || 0; return { empty: n === 0, cmp: n } }
    if (DATE_KEYS.has(key)) { const ms = parseDateMs((op as unknown as Record<string, string>)[key]); return { empty: isNaN(ms), cmp: isNaN(ms) ? 0 : ms } }
    const s = cellText(op, key)
    return { empty: !s, cmp: s.toLowerCase() }
  }
  const sorted = useMemo(() => {
    if (!sort) return filtered
    const sign = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, sort.key), vb = sortValue(b, sort.key)
      if (va.empty && vb.empty) return 0
      if (va.empty) return 1          // empties always last, regardless of dir
      if (vb.empty) return -1
      const c = (typeof va.cmp === 'number' && typeof vb.cmp === 'number')
        ? va.cmp - vb.cmp
        : String(va.cmp).localeCompare(String(vb.cmp), 'es')
      return c * sign
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort, operatorById])

  const toggleSort = (key: string) => {
    setSort(prev => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' }
      if (prev.dir === 'asc') return { key, dir: 'desc' }
      return null
    })
  }

  // ── Column drag-and-drop reorder ──
  const dropReorder = (targetKey: string) => {
    if (!dragKey || dragKey === targetKey) { setDragKey(null); setOverKey(null); return }
    setColOrder(prev => {
      const order = prev.length ? [...prev] : OPERATION_COLUMNS.map(c => c.key as string)
      for (const c of OPERATION_COLUMNS) if (!order.includes(c.key as string)) order.push(c.key as string)
      const from = order.indexOf(dragKey), to = order.indexOf(targetKey)
      if (from < 0 || to < 0) return prev
      order.splice(to, 0, order.splice(from, 1)[0])
      return order
    })
    setDragKey(null); setOverKey(null)
  }

  const modeChips: { id: ModeFilter; label: string; color?: string }[] = [
    { id: 'all', label: 'Todas' },
    { id: 'fcl', label: 'FCL', color: MODALITY_COLORS.fcl },
    { id: 'lcl', label: 'LCL', color: MODALITY_COLORS.lcl },
    { id: 'air', label: 'Aéreo', color: MODALITY_COLORS.air },
    { id: 'land', label: 'Terrestre', color: MODALITY_COLORS.land },
  ]

  const zonaChips: { id: ZonaFilter; label: string }[] = [
    { id: 'all', label: 'Todas las zonas' },
    { id: 'UY', label: '🇺🇾 Uruguay' },
    { id: 'AR', label: '🇦🇷 Argentina' },
    { id: 'CL', label: '🇨🇱 Chile' },
    { id: 'OTRO', label: 'Otros' },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Operaciones</h2>
          <p className="text-sm text-muted-foreground">{counts.all.toLocaleString('es-UY')} cargas · vista unificada FCL · LCL · aéreo · terrestre</p>
        </div>
        {onCreateShipment && (
          <Button onClick={() => setNewOpen(true)} className="gap-1.5">
            <Plus size={16} weight="bold" /> Nueva carga
          </Button>
        )}
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

      {/* Zone chips + toggle "Solo activas" */}
      <div className="flex flex-wrap items-center gap-2">
        {zonaChips.map(z => (
          <button
            key={z.id}
            onClick={() => setZonaFilter(z.id)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 border text-xs transition-all hover:shadow-sm ${
              zonaFilter === z.id ? 'bg-primary/5 border-primary/40' : 'bg-card border-border'
            }`}
          >
            <span className="font-medium">{z.label}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">{zonaCounts[z.id] ?? 0}</span>
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        <button
          onClick={() => setActiveOnly(v => !v)}
          title="Activa = contenedor sin devolver o carga sin llegar a fiscal. Apagalo para ver el histórico completo."
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 border text-xs transition-all hover:shadow-sm ${
            activeOnly ? 'bg-green-50 border-green-300 text-green-700' : 'bg-card border-border text-muted-foreground'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${activeOnly ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
          <span className="font-medium">Solo activas</span>
        </button>
        <button
          onClick={() => setShowArchived(v => !v)}
          title="Mostrar también las cargas archivadas"
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 border text-xs transition-all hover:shadow-sm ${
            showArchived ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-card border-border text-muted-foreground'
          }`}
        >
          <Archive size={12} />
          <span className="font-medium">Ver archivadas</span>
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar ref, cliente, CNTR, fiscal…" className="pl-9 h-9" />
        </div>

        {/* Origen / Destino (puerto) */}
        <Input value={originFilter} onChange={e => setOriginFilter(e.target.value)} placeholder="Origen…" className="h-9 w-28" />
        <Input value={destFilter} onChange={e => setDestFilter(e.target.value)} placeholder="Destino…" className="h-9 w-28" />

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

        {/* Bulk paste from Excel */}
        <Button variant="outline" size="sm" className="h-9" onClick={() => setPasteOpen(true)} title="Pegar un bloque desde Excel para actualizar varias cargas a la vez">
          <ClipboardText size={16} className="mr-1.5" /> Pegar
        </Button>

        {/* Export filtered rows to CSV */}
        <Button variant="outline" size="sm" className="h-9" onClick={exportCsv} title="Exportar las cargas filtradas (columnas visibles) a CSV para Excel">
          <DownloadSimple size={16} className="mr-1.5" /> CSV
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

      {/* Grid — desktop table */}
      <div className="hidden md:block border rounded-lg overflow-auto max-h-[68vh] bg-card">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#1e3a8a] text-white">
              {cols.map(c => {
                const active = sort?.key === c.key
                const arrow = active ? (sort!.dir === 'asc' ? '▲' : '▼') : ''
                const draggable = !c.sticky
                return (
                  <th
                    key={c.key}
                    draggable={draggable}
                    onDragStart={draggable ? () => setDragKey(c.key) : undefined}
                    onDragOver={draggable ? (e) => { e.preventDefault(); if (overKey !== c.key) setOverKey(c.key) } : undefined}
                    onDragLeave={draggable ? () => setOverKey(k => (k === c.key ? null : k)) : undefined}
                    onDrop={draggable ? () => dropReorder(c.key) : undefined}
                    onDragEnd={() => { setDragKey(null); setOverKey(null) }}
                    onClick={() => toggleSort(c.key)}
                    title="Click: ordenar · Arrastrá para reordenar"
                    className={`px-2 py-2 text-left font-semibold uppercase tracking-wide text-[10px] align-bottom cursor-pointer select-none hover:bg-[#274aa3] ${c.w || ''} ${c.numeric ? 'text-right' : ''} ${c.sticky ? 'sticky left-0 bg-[#1e3a8a] z-20' : ''} ${overKey === c.key && dragKey ? 'border-l-2 border-[#9bd1e5]' : ''} ${dragKey === c.key ? 'opacity-50' : ''}`}
                  >
                    <span className={`inline-flex items-center gap-1 ${c.numeric ? 'flex-row-reverse' : ''}`}>
                      {c.label}
                      {arrow && <span className="text-[#9bd1e5] text-[8px]">{arrow}</span>}
                    </span>
                  </th>
                )
              })}
              <th className="px-2 py-2 w-[64px]" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.length === 0 ? (
              <tr><td colSpan={cols.length + 1} className="text-center py-12 text-muted-foreground">Sin operaciones para los filtros actuales.</td></tr>
            ) : sorted.map((op) => (
              <OperationRow
                key={op.uid}
                op={op}
                cols={cols}
                operators={operators}
                operatorById={operatorById}
                truckStatus={truckByRef.get(op.ref)}
                onAssign={assignOp}
                onPatch={onPatchShipment}
                onDelete={requestDelete}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Grid — mobile cards */}
      <div className="md:hidden space-y-2">
        {sorted.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm border rounded-lg bg-card">Sin operaciones para los filtros actuales.</div>
        ) : sorted.map(op => (
          <OperationCard
            key={op.uid}
            op={op}
            operators={operators}
            operatorById={operatorById}
            truckStatus={truckByRef.get(op.ref)}
            onAssign={assignOp}
            onPatch={onPatchShipment}
          />
        ))}
      </div>

      {/* Totals for the current filter */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        <span className="font-semibold text-foreground">{totals.count.toLocaleString('es-UY')} cargas</span>
        <span className="text-muted-foreground">Bultos: <strong className="text-foreground tabular-nums">{fmtNum(totals.pkgs) || 0}</strong></span>
        <span className="text-muted-foreground">Kg: <strong className="text-foreground tabular-nums">{fmtNum(totals.kg) || 0}</strong></span>
        <span className="text-muted-foreground">M³: <strong className="text-foreground tabular-nums">{fmtNum(totals.m3) || 0}</strong></span>
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

      <PasteImportDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        dbShipments={dbShipments}
        onPatch={onPatchShipment}
      />

      {onCreateShipment && (
        <NewShipmentDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          operators={operators}
          onCreate={onCreateShipment}
        />
      )}

      {/* Confirmación de eliminado definitivo: hay que tipear la ref exacta. */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600"><Trash size={18} /> Eliminar carga</DialogTitle>
            <DialogDescription>
              La carga <strong>{deleteTarget?.ref || '(sin ref)'}</strong>{deleteTarget?.cliente ? ` de ${deleteTarget.cliente}` : ''} se elimina
              <strong> PARA SIEMPRE</strong> — no se puede deshacer. Si solo querés sacarla de la vista, usá <em>Archivar</em>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">
              Escribí <strong>{deleteTarget?.ref || 'ELIMINAR'}</strong> para confirmar:
            </span>
            <Input
              autoFocus
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder={deleteTarget?.ref || 'ELIMINAR'}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteConfirm.trim() !== (deleteTarget?.ref || 'ELIMINAR')}
              onClick={() => {
                if (deleteTarget && onDeleteShipment) onDeleteShipment(deleteTarget)
                setDeleteTarget(null)
              }}
            >
              <Trash size={14} className="mr-1.5" /> Eliminar definitivamente
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Row ──

const OperationRow = memo(function OperationRow({
  op,
  cols,
  operators,
  operatorById,
  truckStatus,
  onAssign,
  onPatch,
  onDelete,
}: {
  op: UnifiedOperation
  cols: typeof OPERATION_COLUMNS
  operators: Operator[]
  operatorById: Map<string, Operator>
  truckStatus?: TruckRefInfo
  onAssign: (op: UnifiedOperation, operatorId: string | null) => void
  onPatch: (id: string, fields: Record<string, unknown>) => void
  onDelete?: (op: UnifiedOperation) => void
}) {
  const eligible = operatorsForMode(operators, op.mode)
  const assigned = op.operatorId ? operatorById.get(op.operatorId) : null
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
            {op.archived && <Badge variant="outline" className="h-4 text-[8px] text-amber-700 border-amber-300">ARCHIVADA</Badge>}
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
      case 'pais':
        return op.pais ? <Badge variant="outline" className="h-5 text-[9px] whitespace-nowrap">{PAIS_LABEL[op.pais] || op.pais}</Badge> : ''
      case 'status': {
        // FCL: derived label (read-only). DB: code → label.
        const label = op.source === 'fcl' ? op.status : (STATUS_LABEL[op.status] || op.status)
        return label ? <Badge variant="outline" className="h-5 text-[9px] whitespace-nowrap">{label}</Badge> : ''
      }
      default:
        return (op as unknown as Record<string, unknown>)[key] as string || ''
    }
  }

  return (
    // Zebra via CSS (even:) instead of an index prop → rows don't re-render on
    // sort/reorder, only the DOM nodes move (memo stays valid).
    <tr className="bg-card even:bg-muted/30 hover:bg-primary/5">
      {cols.map((c) => {
        const ef = editable ? EDITABLE_FIELDS[c.key as keyof UnifiedOperation] : undefined
        const tdClass = `px-2 py-1.5 align-top ${c.w || ''} ${c.numeric ? 'text-right tabular-nums' : ''} ${c.wrap ? 'whitespace-normal break-words' : 'whitespace-nowrap'} ${c.sticky ? 'sticky left-0 bg-inherit' : ''}`

        // Estado of a cargo loaded on a truck is driven by the truck (read-only).
        if (c.key === 'status' && truckStatus) {
          return (
            <td key={c.key} className={tdClass}>
              <Badge variant="outline" className="h-5 text-[9px] whitespace-nowrap gap-1" title={`Estado controlado por el camión ${truckStatus.truckCode}`}>
                <TruckIcon size={10} weight="fill" className="text-primary" />
                {truckStatus.truckCode} · {STATUS_LABEL[truckStatus.status] || truckStatus.status}
              </Badge>
            </td>
          )
        }

        if (ef) {
          return (
            <td key={c.key} className={tdClass}>
              <EditableCell
                value={(op as unknown as Record<string, unknown>)[c.key] as string | number | boolean}
                type={ef.type}
                options={ef.options}
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
      {/* Acciones (solo filas DB): archivar/restaurar + eliminar. FCL = espejo planilla, sin acciones. */}
      <td className="px-1 py-1.5 align-top whitespace-nowrap text-right">
        {op.source === 'db' && op.dbId && (
          <span className="inline-flex items-center gap-0.5">
            <button
              type="button"
              title={op.archived ? 'Restaurar carga' : 'Archivar carga (reversible)'}
              onClick={() => onPatch(op.dbId!, { archived: !op.archived })}
              className="p-1 rounded text-muted-foreground/60 hover:text-amber-600 hover:bg-amber-50"
            >
              {op.archived ? <ArrowCounterClockwise size={13} /> : <Archive size={13} />}
            </button>
            {onDelete && (
              <button
                type="button"
                title="Eliminar definitivamente…"
                onClick={() => onDelete(op)}
                className="p-1 rounded text-muted-foreground/60 hover:text-red-600 hover:bg-red-50"
              >
                <Trash size={13} />
              </button>
            )}
          </span>
        )}
      </td>
    </tr>
  )
})

// ── Mobile card (one cargo) — replaces the wide table on phones ──
const CARD_FIELDS: { key: keyof UnifiedOperation; label: string }[] = [
  { key: 'cliente', label: 'Cliente' },
  { key: 'eta', label: 'ETA' },
  { key: 'cntr', label: 'CNTR' },
  { key: 'docNumber', label: 'BL / AWB' },
  { key: 'fiscal', label: 'Fiscal' },
  { key: 'destPort', label: 'Destino' },
  { key: 'pkgs', label: 'Bultos' },
  { key: 'kg', label: 'Kg' },
  { key: 'm3', label: 'M³' },
  { key: 'transporte', label: 'Transporte' },
]

const OperationCard = memo(function OperationCard({
  op,
  operators,
  operatorById,
  truckStatus,
  onAssign,
  onPatch,
}: {
  op: UnifiedOperation
  operators: Operator[]
  operatorById: Map<string, Operator>
  truckStatus?: TruckRefInfo
  onAssign: (op: UnifiedOperation, operatorId: string | null) => void
  onPatch: (id: string, fields: Record<string, unknown>) => void
}) {
  const editable = op.source === 'db' && !!op.dbId && !op.readOnly
  const eligible = operatorsForMode(operators, op.mode)
  const assigned = op.operatorId ? operatorById.get(op.operatorId) : null

  const renderVal = (key: keyof UnifiedOperation) => {
    const ef = editable ? EDITABLE_FIELDS[key] : undefined
    if (ef) {
      return (
        <EditableCell
          value={(op as unknown as Record<string, unknown>)[key] as string | number | boolean}
          type={ef.type}
          options={ef.options}
          onCommit={v => onPatch(op.dbId!, { [ef.col]: v })}
        />
      )
    }
    const num = key === 'pkgs' || key === 'kg' || key === 'm3'
    const raw = (op as unknown as Record<string, unknown>)[key]
    return <span>{num ? fmtNum(Number(raw) || 0) : (String(raw ?? '') || '—')}</span>
  }

  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      {/* Header: ref + estado */}
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-semibold text-sm">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: MODALITY_COLORS[op.mode] }} />
          {op.ref || '—'}
          {op.readOnly && <LockSimple size={12} className="text-muted-foreground" />}
        </span>
        {truckStatus ? (
          <Badge variant="outline" className="text-[10px] gap-1"><TruckIcon size={11} weight="fill" className="text-primary" />{truckStatus.truckCode} · {STATUS_LABEL[truckStatus.status] || truckStatus.status}</Badge>
        ) : editable ? (
          <select
            value={op.status || ''}
            onChange={e => onPatch(op.dbId!, { status: e.target.value })}
            className="h-7 max-w-[150px] text-xs rounded border border-border bg-card px-1.5"
          >
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          op.status && <Badge variant="outline" className="text-[10px]">{op.status}</Badge>
        )}
      </div>

      {/* Operativo */}
      <div className="mt-2">
        <select
          value={op.operatorId || ''}
          onChange={e => onAssign(op, e.target.value || null)}
          className="w-full h-8 text-sm rounded-md border border-border bg-card px-2"
          style={assigned ? { color: assigned.color || undefined } : undefined}
        >
          <option value="">— operativo sin asignar —</option>
          {eligible.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>

      {/* Fields */}
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        {CARD_FIELDS.map(f => (
          <div key={f.key}>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{f.label}</div>
            <div className="text-foreground break-words">{renderVal(f.key)}</div>
          </div>
        ))}
      </div>
    </div>
  )
})

// ── Inline-editable cell (DB rows only) ──
// text/number → click to edit, Enter/blur saves, Esc cancels.
// bool → click toggles SI/— and saves immediately.
function EditableCell({
  value,
  type,
  options,
  wrap,
  onCommit,
}: {
  value: string | number | boolean
  type: 'text' | 'number' | 'bool' | 'select'
  options?: { value: string; label: string }[]
  wrap?: boolean
  onCommit: (v: string | number | boolean | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  if (type === 'select') {
    const cur = String(value ?? '')
    return (
      <select
        value={cur}
        onChange={e => onCommit(e.target.value)}
        className="h-6 w-full max-w-[128px] text-xs rounded border border-transparent hover:border-border bg-transparent px-1 cursor-pointer focus:border-primary"
      >
        {(options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  }

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
