import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Plus,
  MagnifyingGlass,
  Trash,
  PencilSimple,
  Package,
  CalendarBlank,
  Truck as TruckIcon,
  Warning,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { Truck, TruckLoad, TruckStatus } from '@/lib/truckTypes'
import {
  TRUCK_STATUS_LABELS,
  TRUCK_STATUS_COLORS,
  computeTruckTotals,
  getTruckLimits,
  deriveTruckDisplayStatus,
  deriveTruckDisplayInfo,
} from '@/lib/truckTypes'
import { formatKg, formatM3 } from '@/lib/truckUtils'
import { nextTruckCode } from '@/lib/dataClient'
import { makeEmptyTruck } from '@/lib/truckUtils'

interface TrucksListProps {
  trucks: Truck[]
  truckLoads: TruckLoad[]
  onUpdateTrucks: (trucks: Truck[]) => void
  onDeleteTruck: (id: string) => void
  onOpenBuilder: (id: string) => void
}

type StatusFilter = 'all' | TruckStatus

export default function TrucksList({
  trucks,
  truckLoads,
  onUpdateTrucks,
  onDeleteTruck,
  onOpenBuilder,
}: TrucksListProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [creating, setCreating] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Truck | null>(null)
  // Estado mostrado/filtrado = derivado de las fechas del camión.
  const hoyList = new Date(); hoyList.setHours(0, 0, 0, 0)

  // Group loads by truck for quick totals lookup
  const loadsByTruck = useMemo(() => {
    const m = new Map<string, TruckLoad[]>()
    for (const l of truckLoads) {
      const arr = m.get(l.truckId) || []
      arr.push(l)
      m.set(l.truckId, arr)
    }
    return m
  }, [truckLoads])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return trucks.filter(t => {
      if (statusFilter !== 'all' && deriveTruckDisplayStatus(t, hoyList) !== statusFilter) return false
      if (q) {
        const blob = `${t.code} ${t.transport} ${t.driver} ${t.plate} ${t.notes}`.toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    }).sort((a, b) => {
      // Active first (planning/loaded/in_transit before delivered), then most-recently-updated
      const aDelivered = a.status === 'delivered' ? 1 : 0
      const bDelivered = b.status === 'delivered' ? 1 : 0
      if (aDelivered !== bDelivered) return aDelivered - bDelivered
      return (b.updatedAt || 0) - (a.updatedAt || 0)
    })
  }, [trucks, search, statusFilter])

  const handleCreate = async () => {
    if (creating) return
    setCreating(true)
    try {
      // Try to get the next code from the server (atomic counter).
      let code = ''
      try {
        code = await nextTruckCode('C')
      } catch (err) {
        // Fallback: compute next from local data if API isn't reachable.
        const localMax = trucks
          .map(t => {
            const m = /^C(\d+)$/.exec(t.code || '')
            return m ? parseInt(m[1], 10) : 0
          })
          .reduce((max, n) => Math.max(max, n), 429)
        code = `C${localMax + 1}`
        console.warn('[TrucksList] nextTruckCode fallback used:', code, err)
      }
      const truck = makeEmptyTruck(code)
      onUpdateTrucks([...trucks, truck])
      toast.success(`Camión ${code} creado`)
      onOpenBuilder(truck.id)
    } catch (err: any) {
      toast.error(`Error al crear camión: ${err?.message || 'desconocido'}`)
    } finally {
      setCreating(false)
    }
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    onDeleteTruck(pendingDelete.id)
    toast.success(`Camión ${pendingDelete.code} eliminado`)
    setPendingDelete(null)
  }

  // ── Empty state ──
  if (trucks.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-16 text-center space-y-4">
          <TruckIcon size={48} className="mx-auto text-muted-foreground/50" weight="duotone" />
          <div className="space-y-1">
            <p className="font-medium">No hay camiones todavía</p>
            <p className="text-sm text-muted-foreground">
              Creá tu primer camión para empezar a consolidar cargas.
            </p>
          </div>
          <Button onClick={handleCreate} disabled={creating}>
            <Plus size={16} className="mr-1.5" />
            {creating ? 'Creando…' : 'Crear primer camión'}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <MagnifyingGlass
            size={16}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Buscar por código, transporte, chofer…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="planning">Planificando</SelectItem>
            <SelectItem value="loaded">Cargado</SelectItem>
            <SelectItem value="in_transit">En Ruta</SelectItem>
            <SelectItem value="delivered">Entregado</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Button onClick={handleCreate} disabled={creating}>
            <Plus size={16} className="mr-1.5" />
            {creating ? 'Creando…' : 'Nuevo Camión'}
          </Button>
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(t => {
          const loads = loadsByTruck.get(t.id) || []
          const totals = computeTruckTotals(t, loads)
          const limits = getTruckLimits(t.isSider)
          return (
            <Card key={t.id} className="hover:border-primary/40 transition-colors">
              <CardContent className="p-4 space-y-3">
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg tracking-tight">{t.code}</span>
                      {t.isSider && (
                        <Badge variant="outline" className="text-[10px] h-5">Sider</Badge>
                      )}
                    </div>
                    {t.transport && (
                      <p className="text-xs text-muted-foreground mt-0.5">{t.transport}</p>
                    )}
                  </div>
                  {(() => {
                    const info = deriveTruckDisplayInfo(t, hoyList)
                    return (
                      <Badge className={`border ${TRUCK_STATUS_COLORS[info.status]} ${info.hoy ? 'animate-pulse font-semibold' : ''}`} variant="outline" title="Estado automático según las fechas del camión">
                        {info.label}
                      </Badge>
                    )
                  })()}
                </div>

                {/* Totals */}
                <div className="grid grid-cols-3 gap-2 text-center pt-1">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Cargas
                    </div>
                    <div className="font-semibold">{totals.loadCount}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Peso
                    </div>
                    <div className={`font-semibold ${totals.overKg ? 'text-destructive' : ''}`}>
                      {formatKg(totals.kg)}
                      <span className="text-[10px] text-muted-foreground ml-0.5">kg</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Volumen
                    </div>
                    <div className={`font-semibold ${totals.overM3 ? 'text-destructive' : ''}`}>
                      {formatM3(totals.m3)}
                      <span className="text-[10px] text-muted-foreground ml-0.5">m³</span>
                    </div>
                  </div>
                </div>

                {/* Capacity bars */}
                <div className="space-y-1.5">
                  <CapacityBar
                    label={`${formatKg(totals.kg)} / ${formatKg(limits.kgMax)} kg`}
                    pct={totals.kgPct}
                    over={totals.overKg}
                  />
                  <CapacityBar
                    label={`${formatM3(totals.m3)} / ${formatM3(limits.m3Max)} m³`}
                    pct={totals.m3Pct}
                    over={totals.overM3}
                  />
                </div>

                {/* Meta: fiscals + dates */}
                <div className="space-y-1 text-xs text-muted-foreground">
                  {totals.fiscals.length > 0 && (
                    <div className="flex items-start gap-1.5">
                      <Package size={12} className="mt-0.5 shrink-0" />
                      <span className="truncate">
                        {totals.fiscals.join(' · ')}
                        {totals.multifiscal && (
                          <Warning
                            size={12}
                            weight="fill"
                            className="inline ml-1 text-amber-500"
                          />
                        )}
                      </span>
                    </div>
                  )}
                  {(t.loadDate || t.departureDate || t.arrivalDate) && (
                    <div className="flex items-start gap-1.5">
                      <CalendarBlank size={12} className="mt-0.5 shrink-0" />
                      <span className="truncate">
                        {t.loadDate && `Carga ${formatDateShort(t.loadDate)}`}
                        {t.departureDate && ` · Sale ${formatDateShort(t.departureDate)}`}
                        {t.arrivalDate && ` · Arribo ${formatDateShort(t.arrivalDate)}`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => onOpenBuilder(t.id)}
                  >
                    <PencilSimple size={14} className="mr-1.5" />
                    Armar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setPendingDelete(t)}
                  >
                    <Trash size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-center py-8 text-sm text-muted-foreground">
          No hay camiones que coincidan con los filtros.
        </p>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar camión {pendingDelete?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción borra el camión y todas sus cargas asociadas. Las refs FCL vuelven a
              quedar disponibles para armar en otro camión. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function CapacityBar({ label, pct, over }: { label: string; pct: number; over: boolean }) {
  const clamped = Math.min(Math.max(pct, 0), 1.2)
  // Color: green <80%, amber 80-100%, red >100%
  const color = over
    ? 'bg-red-500'
    : clamped > 0.8
    ? 'bg-amber-500'
    : 'bg-emerald-500'
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>{label}</span>
        <span className={over ? 'text-destructive font-medium' : ''}>
          {Math.round(clamped * 100)}%
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${Math.min(clamped, 1) * 100}%` }}
        />
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
