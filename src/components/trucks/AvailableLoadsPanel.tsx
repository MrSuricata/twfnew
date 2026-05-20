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
import { formatKg, formatM3, getAssignedRefs, isFclAvailable, isLclAirAvailable } from '@/lib/truckUtils'

interface AvailableLoadsPanelProps {
  shipments: ParsedShipment[]
  lclAir: LclAirShipment[]
  trucks: Truck[]
  truckLoads: TruckLoad[]
  currentTruckId: string
  onAddFcl: (shipment: ParsedShipment) => void
  onAddLclAir: (shipment: LclAirShipment) => void
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
  fcl?: ParsedShipment
  lclAir?: LclAirShipment
}

export default function AvailableLoadsPanel({
  shipments,
  lclAir,
  trucks,
  truckLoads,
  currentTruckId,
  onAddFcl,
  onAddLclAir,
}: AvailableLoadsPanelProps) {
  const [search, setSearch] = useState('')
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')
  const [fiscalFilter, setFiscalFilter] = useState<string>('all')
  const [showArchived, setShowArchived] = useState(false)
  const [onlyArrived, setOnlyArrived] = useState(false)

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

    // LCL / Air from registry
    for (const s of lclAir) {
      if (modeFilter === 'fcl') continue
      if (modeFilter !== 'all' && modeFilter !== s.modality) continue
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
  }, [shipments, lclAir, modeFilter, assignedElsewhere, inThisTruck, showArchived, onlyArrived])

  const fiscals = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) {
      if (r.fiscal) set.add(r.fiscal)
    }
    return Array.from(set).sort()
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return rows.filter(r => {
      if (fiscalFilter !== 'all' && r.fiscal !== fiscalFilter) return false
      if (q) {
        const blob = `${r.ref} ${r.client} ${r.fiscal} ${r.description}`.toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
  }, [rows, search, fiscalFilter])

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
          <div className="p-6 text-center text-sm text-muted-foreground">
            No hay cargas disponibles para los filtros actuales.
          </div>
        ) : (
          filtered.map(r => (
            <AvailableRowCard
              key={`${r.type}-${r.ref}`}
              row={r}
              onAdd={() => {
                if (r.fcl) onAddFcl(r.fcl)
                else if (r.lclAir) onAddLclAir(r.lclAir)
              }}
            />
          ))
        )}
      </div>
    </div>
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
