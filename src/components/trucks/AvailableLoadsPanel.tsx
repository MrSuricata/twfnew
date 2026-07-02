import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Plus, MagnifyingGlass, Package, Boat, Airplane, Truck as TruckIcon } from '@phosphor-icons/react'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import type { LclAirShipment, Truck, TruckLoad, LoadSource } from '@/lib/truckTypes'
import type { DbShipment } from '@/lib/operationsTypes'
import { formatKg, formatM3, getAssignedRefs, isFclAvailable, isLclAirAvailable } from '@/lib/truckUtils'

interface AvailableLoadsPanelProps {
  shipments: ParsedShipment[]
  lclAir: LclAirShipment[]
  dbShipments?: DbShipment[]          // unified table (LCL/aéreo) — la fuente nueva
  trucks: Truck[]
  truckLoads: TruckLoad[]
  currentTruckId: string
  onAddFcl: (shipment: ParsedShipment) => void
  onAddLclAir: (shipment: LclAirShipment) => void
  onAddDb?: (shipment: DbShipment) => void
  /** Abre el alta de carga desde el armador (cuando la carga aún no existe). */
  onCreateNew?: () => void
}

type ModeFilter = 'all' | 'fcl' | 'lcl' | 'air'

interface AvailableRow {
  ref: string
  type: LoadSource
  client: string
  fiscal: string
  kg: number
  m3: number
  pkgs: number
  description: string
  mvdArrival: string
  noApilable?: boolean   // ⚠️ va arriba de todo en el camión
  imo?: boolean          // ☢️ mercancía peligrosa
  fcl?: ParsedShipment
  lclAir?: LclAirShipment
  db?: DbShipment
}

export default function AvailableLoadsPanel({
  shipments,
  lclAir,
  dbShipments,
  trucks,
  truckLoads,
  currentTruckId,
  onAddFcl,
  onAddLclAir,
  onAddDb,
  onCreateNew,
}: AvailableLoadsPanelProps) {
  const [search, setSearch] = useState('')
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')
  const [fiscalFilter, setFiscalFilter] = useState<string>('all')
  const [showArchived, setShowArchived] = useState(false)
  const [onlyArrived, setOnlyArrived] = useState(false)
  // Rango de peso/volumen (para encontrar cargas que entren en lo que le
  // queda al camión) + orden por kg/m³.
  const [kgMin, setKgMin] = useState('')
  const [kgMax, setKgMax] = useState('')
  const [m3Min, setM3Min] = useState('')
  const [m3Max, setM3Max] = useState('')
  const [sortBy, setSortBy] = useState<'eta' | 'kg-desc' | 'kg-asc' | 'm3-desc' | 'm3-asc'>('eta')

  // Refs already used in any other active truck (excluding this one)
  const assignedElsewhere = useMemo(() => {
    const otherTrucks = trucks.filter(t => t.id !== currentTruckId)
    const otherLoads = truckLoads.filter(l => l.truckId !== currentTruckId)
    return getAssignedRefs(otherLoads, otherTrucks)
  }, [trucks, truckLoads, currentTruckId])

  // Refs already in this truck
  const inThisTruck = useMemo(() => {
    const out = new Set<string>()
    for (const l of truckLoads) {
      if (l.truckId === currentTruckId) out.add(l.sourceRef)
    }
    return out
  }, [truckLoads, currentTruckId])

  const rows: AvailableRow[] = useMemo(() => {
    const out: AvailableRow[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // FCL from planilla
    if (modeFilter === 'all' || modeFilter === 'fcl') {
      for (const s of shipments) {
        if (inThisTruck.has(s.REF)) continue
        if (!isFclAvailable(s, assignedElsewhere, { showArchived })) continue
        const ops = s.operativas || []
        const kg = ops.reduce((sum, o) => sum + (Number(o.KG) || 0), 0)
        const m3 = ops.reduce((sum, o) => sum + (Number(o.M3) || 0), 0)
        const pkgs = ops.reduce((sum, o) => sum + (Number(o.PKGS) || 0), 0)
        const fiscal = ops.find(o => o.FISCAL)?.FISCAL || ''
        if (onlyArrived && s.ETA) {
          const eta = new Date(s.ETA)
          if (eta.getTime() > today.getTime()) continue
        }
        out.push({
          ref: s.REF,
          type: 'fcl',
          client: s.CLIENTE,
          fiscal,
          kg,
          m3,
          pkgs,
          description: ops.find(o => o.DESCRIPCION)?.DESCRIPCION || '',
          mvdArrival: s.ETA || '',
          fcl: s,
        })
      }
    }

    // LCL / Air from the unified `shipments` table (the new source of truth).
    const dbRefs = new Set<string>()
    for (const s of (dbShipments || [])) {
      if (s.mode !== 'lcl' && s.mode !== 'air') continue
      dbRefs.add(s.ref)
      if (modeFilter === 'fcl') continue
      if (modeFilter !== 'all' && modeFilter !== s.mode) continue
      if (inThisTruck.has(s.ref)) continue
      if (assignedElsewhere.has(s.ref)) continue
      if (!showArchived && s.archived) continue
      if (onlyArrived && s.eta) {
        const eta = new Date(s.eta)
        if (!isNaN(eta.getTime()) && eta.getTime() > today.getTime()) continue
      }
      out.push({
        ref: s.ref,
        type: s.mode,
        client: s.cliente || '',
        fiscal: s.fiscal || '',
        kg: Number(s.kg) || 0,
        m3: Number(s.m3) || 0,
        pkgs: Number(s.pkgs) || 0,
        description: s.observacion || '',
        mvdArrival: s.eta || '',
        noApilable: !!s.no_apilable,
        imo: !!s.imo,
        db: s,
      })
    }

    // LCL / Air from the legacy registry (lcl_air_shipments) — skip any ref
    // already provided by the DB above to avoid duplicates.
    for (const s of lclAir) {
      if (modeFilter === 'fcl') continue
      if (modeFilter !== 'all' && modeFilter !== s.modality) continue
      if (dbRefs.has(s.ref)) continue
      if (inThisTruck.has(s.ref)) continue
      if (!isLclAirAvailable(s, assignedElsewhere, { showArchived })) continue
      if (onlyArrived && s.status === 'en_origen') continue
      if (onlyArrived && s.status === 'en_transito') continue
      out.push({
        ref: s.ref,
        type: s.modality,
        client: s.client,
        fiscal: s.fiscal,
        kg: s.kg,
        m3: s.m3,
        pkgs: s.pkgs,
        description: s.description,
        mvdArrival: s.etaMvd,
        lclAir: s,
      })
    }

    return out
  }, [shipments, lclAir, dbShipments, modeFilter, assignedElsewhere, inThisTruck, showArchived, onlyArrived])

  const fiscals = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) {
      if (r.fiscal) set.add(r.fiscal)
    }
    return Array.from(set).sort()
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    const num = (s: string) => { const n = parseFloat(s.replace(',', '.')); return isFinite(n) ? n : null }
    const kMin = num(kgMin), kMax = num(kgMax), vMin = num(m3Min), vMax = num(m3Max)
    const out = rows.filter(r => {
      if (fiscalFilter !== 'all' && r.fiscal !== fiscalFilter) return false
      if (kMin !== null && r.kg < kMin) return false
      if (kMax !== null && r.kg > kMax) return false
      if (vMin !== null && r.m3 < vMin) return false
      if (vMax !== null && r.m3 > vMax) return false
      if (q) {
        const blob = `${r.ref} ${r.client} ${r.fiscal} ${r.description}`.toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
    if (sortBy !== 'eta') {
      const key = sortBy.startsWith('kg') ? 'kg' as const : 'm3' as const
      const sign = sortBy.endsWith('desc') ? -1 : 1
      out.sort((a, b) => (a[key] - b[key]) * sign)
    }
    return out
  }, [rows, search, fiscalFilter, kgMin, kgMax, m3Min, m3Max, sortBy])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-muted/30 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Cargas disponibles</h3>
          <span className="text-xs text-muted-foreground">{filtered.length}</span>
        </div>

        <div className="relative">
          <MagnifyingGlass size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar ref, cliente, fiscal…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-7 h-8 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select value={modeFilter} onValueChange={v => setModeFilter(v as ModeFilter)}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo tipo</SelectItem>
              <SelectItem value="fcl">FCL</SelectItem>
              <SelectItem value="lcl">LCL</SelectItem>
              <SelectItem value="air">Aéreo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fiscalFilter} onValueChange={setFiscalFilter}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo fiscal</SelectItem>
              {fiscals.map(f => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Rango kg / m³ + orden — para buscar cargas que entren en lo que queda del camión */}
        <div className="grid grid-cols-4 gap-1.5">
          <Input value={kgMin} onChange={e => setKgMin(e.target.value)} placeholder="Kg mín" inputMode="decimal" className="h-8 text-xs" />
          <Input value={kgMax} onChange={e => setKgMax(e.target.value)} placeholder="Kg máx" inputMode="decimal" className="h-8 text-xs" />
          <Input value={m3Min} onChange={e => setM3Min(e.target.value)} placeholder="M³ mín" inputMode="decimal" className="h-8 text-xs" />
          <Input value={m3Max} onChange={e => setM3Max(e.target.value)} placeholder="M³ máx" inputMode="decimal" className="h-8 text-xs" />
        </div>
        <Select value={sortBy} onValueChange={v => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="eta">Orden: llegada</SelectItem>
            <SelectItem value="kg-desc">Más pesadas primero</SelectItem>
            <SelectItem value="kg-asc">Más livianas primero</SelectItem>
            <SelectItem value="m3-desc">Más voluminosas primero</SelectItem>
            <SelectItem value="m3-asc">Menos voluminosas primero</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <Switch
              id="only-arrived"
              checked={onlyArrived}
              onCheckedChange={setOnlyArrived}
              className="data-[state=checked]:bg-primary"
            />
            <Label htmlFor="only-arrived" className="cursor-pointer text-xs">Solo arribadas</Label>
          </div>
          <div className="flex items-center gap-1.5">
            <Switch
              id="show-archived"
              checked={showArchived}
              onCheckedChange={setShowArchived}
              className="data-[state=checked]:bg-primary"
            />
            <Label htmlFor="show-archived" className="cursor-pointer text-xs">Ver archivadas</Label>
          </div>
        </div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto divide-y">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground space-y-3">
            <p>No hay cargas disponibles para los filtros actuales.</p>
            {onCreateNew && (
              <>
                <p className="text-xs">¿La carga todavía no existe? Creala sin salir del armador.</p>
                <CreateNewLoadButton onClick={onCreateNew} />
              </>
            )}
          </div>
        ) : (
          <>
            {filtered.map(r => (
              <AvailableRowCard
                key={`${r.type}-${r.ref}`}
                row={r}
                onAdd={() => {
                  if (r.fcl) onAddFcl(r.fcl)
                  else if (r.db) onAddDb?.(r.db)
                  else if (r.lclAir) onAddLclAir(r.lclAir)
                }}
              />
            ))}
            {onCreateNew && (
              <div className="p-3">
                <CreateNewLoadButton onClick={onCreateNew} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Botón discreto para dar de alta una carga que no existe todavía — abre el
// mismo diálogo "Nueva carga" de Operaciones y la agrega al camión al crearla.
function CreateNewLoadButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed py-2 text-xs text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
    >
      <Plus size={12} /> Crear carga nueva
    </button>
  )
}

function AvailableRowCard({ row, onAdd }: { row: AvailableRow; onAdd: () => void }) {
  const Icon = row.type === 'fcl' ? TruckIcon : row.type === 'lcl' ? Boat : Airplane
  return (
    <div className="px-4 py-3 hover:bg-muted/40 transition-colors space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Icon size={14} className="text-primary shrink-0" weight="fill" />
            <span className="font-medium text-sm truncate">{row.ref}</span>
            <Badge variant="outline" className="h-4 text-[9px] uppercase">{row.type}</Badge>
            {row.noApilable && <Badge variant="outline" className="h-4 text-[9px] text-amber-700 border-amber-400" title="Carga NO apilable — va arriba de todo">📦 NO APILABLE</Badge>}
            {row.imo && <Badge variant="outline" className="h-4 text-[9px] text-red-700 border-red-400" title="Mercancía peligrosa IMO">☢️ IMO</Badge>}
          </div>
          {row.client && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{row.client}</p>
          )}
        </div>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onAdd} title="Agregar al camión">
          <Plus size={14} />
        </Button>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
        {row.fiscal && (
          <span className="inline-flex items-center gap-0.5">
            <Package size={10} />
            {row.fiscal}
          </span>
        )}
        <span>{formatKg(row.kg)} kg</span>
        <span>·</span>
        <span>{formatM3(row.m3)} m³</span>
        {row.mvdArrival && (
          <>
            <span>·</span>
            <span>ETA {formatDateShort(row.mvdArrival)}</span>
          </>
        )}
      </div>
    </div>
  )
}

function formatDateShort(iso: string): string {
  if (!iso) return ''
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  return `${parts[2]}/${parts[1]}`
}
