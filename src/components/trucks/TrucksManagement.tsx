import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Truck as TruckIcon, Boat, Package } from '@phosphor-icons/react'
import type { Truck, TruckLoad, LclAirShipment } from '@/lib/truckTypes'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import type { DbShipment, Operator } from '@/lib/operationsTypes'
import TrucksList from './TrucksList'
import TruckBuilder from './TruckBuilder'
import LclAirManager from './LclAirManager'
import BandejaStock from './BandejaStock'

interface TrucksManagementProps {
  trucks: Truck[]
  truckLoads: TruckLoad[]
  lclAir: LclAirShipment[]
  dbShipments?: DbShipment[]
  shipments: ParsedShipment[]
  /** Operativos para el alta de carga desde el armador (diálogo Nueva carga). */
  operators?: Operator[]
  onUpdateTrucks: (trucks: Truck[], changedIds?: string[]) => void
  onDeleteTruck: (id: string) => void
  onUpdateTruckLoads: (loads: TruckLoad[], changedIds?: string[]) => void
  onDeleteTruckLoad: (id: string) => void
  onUpdateLclAir: (shipments: LclAirShipment[]) => void
  onDeleteLclAir: (id: string) => void
  onRefreshTrucks?: () => Promise<boolean>
  /** Alta real de una carga (App.handleCreateShipment). false = abortada. */
  onCreateShipment?: (row: DbShipment) => boolean | void
  /** PATCH de una carga — para alinear sus fechas con las del consolidado. */
  onPatchShipment?: (id: string, fields: Record<string, unknown>) => void
  /** Baja de una carga (LCL/aéreo desde su pestaña). */
  onDeleteShipment?: (id: string) => void
}

export default function TrucksManagement(props: TrucksManagementProps) {
  const [subTab, setSubTab] = useState<'trucks' | 'lcl-air' | 'stock'>('trucks')

  // Refs que ya viajan en un camión publicado y refs cuyo camión ya salió. Mismo
  // criterio que AvailableLoadsPanel: camión no borrador, con fecha, y cargas
  // que no estén marcadas para agregar en un borrador de edición.
  const { trucks, truckLoads } = props
  const refsPorCamion = useMemo(() => {
    const enCamion = new Set<string>()
    const despachadas = new Set<string>()
    for (const t of trucks) {
      if (t.draft) continue
      const publicado = !!(t.loadDate || t.departureDate)
      if (!publicado) continue
      for (const l of truckLoads) {
        if (l.truckId !== t.id || l.pending === 'add') continue
        const r = String(l.sourceRef || '').trim().toUpperCase()
        if (!r) continue
        enCamion.add(r)
        if (t.departureDate) despachadas.add(r)
      }
    }
    return { enCamion, despachadas }
  }, [trucks, truckLoads])

  const lclCount = useMemo(
    () => (props.dbShipments || []).filter(s => (s.mode === 'lcl' || s.mode === 'air') && !s.archived).length,
    [props.dbShipments],
  )

  // Al entrar a Camiones: traer lo último (multi-usuario). Al volver el foco
  // a la ventana, ídem con throttle de 60s.
  const { onRefreshTrucks } = props
  const lastRefresh = useRef(0)
  const doRefresh = useCallback(async () => {
    if (Date.now() - lastRefresh.current < 60_000) return
    const ok = await (onRefreshTrucks?.() ?? Promise.resolve(true))
    if (ok) lastRefresh.current = Date.now()
  }, [onRefreshTrucks])
  useEffect(() => { doRefresh() }, [doRefresh])
  useEffect(() => {
    const onFocus = () => doRefresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [doRefresh])
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null)

  const selectedTruck = selectedTruckId
    ? props.trucks.find(t => t.id === selectedTruckId) || null
    : null

  // ── Builder view (a truck is selected) ──
  if (selectedTruck) {
    return (
      <TruckBuilder
        truck={selectedTruck}
        trucks={props.trucks}
        truckLoads={props.truckLoads}
        lclAir={props.lclAir}
        dbShipments={props.dbShipments || []}
        shipments={props.shipments}
        operators={props.operators}
        onBack={() => setSelectedTruckId(null)}
        onUpdateTrucks={props.onUpdateTrucks}
        onUpdateTruckLoads={props.onUpdateTruckLoads}
        onDeleteTruckLoad={props.onDeleteTruckLoad}
        onDeleteTruck={props.onDeleteTruck}
        onCreateShipment={props.onCreateShipment}
        onPatchShipment={props.onPatchShipment}
      />
    )
  }

  // ── List view (sub-tabs) ──
  return (
    <div className="space-y-4">
      <Tabs value={subTab} onValueChange={v => setSubTab(v as 'trucks' | 'lcl-air' | 'stock')} className="space-y-4">
        <TabsList>
          <TabsTrigger value="trucks" className="gap-1.5">
            <TruckIcon size={16} weight="fill" />
            Camiones
            {props.trucks.length > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">({props.trucks.length})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="lcl-air" className="gap-1.5">
            <Boat size={16} weight="fill" />
            LCL / Aéreos
            {lclCount > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">({lclCount})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="stock" className="gap-1.5">
            <Package size={16} weight="fill" />
            Aguarda stock
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trucks">
          <TrucksList
            trucks={props.trucks}
            truckLoads={props.truckLoads}
            onUpdateTrucks={props.onUpdateTrucks}
            onUpdateTruckLoads={props.onUpdateTruckLoads}
            onDeleteTruck={props.onDeleteTruck}
            onDeleteTruckLoad={props.onDeleteTruckLoad}
            onOpenBuilder={(id) => setSelectedTruckId(id)}
          />
        </TabsContent>

        <TabsContent value="lcl-air">
          <LclAirManager
            dbShipments={props.dbShipments || []}
            refsEnCamion={refsPorCamion.enCamion}
            refsDespachadas={refsPorCamion.despachadas}
            onPatch={props.onPatchShipment || (() => {})}
            onCreate={props.onCreateShipment}
            onDelete={props.onDeleteShipment || (() => {})}
          />
        </TabsContent>

        <TabsContent value="stock">
          <BandejaStock
            dbShipments={props.dbShipments || []}
            refsEnCamion={refsPorCamion.enCamion}
            onPatch={props.onPatchShipment || (() => {})}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
