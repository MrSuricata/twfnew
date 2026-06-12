import { useState, useEffect, useCallback, useRef } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Truck as TruckIcon, Boat } from '@phosphor-icons/react'
import type { Truck, TruckLoad, LclAirShipment } from '@/lib/truckTypes'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import type { DbShipment } from '@/lib/operationsTypes'
import TrucksList from './TrucksList'
import TruckBuilder from './TruckBuilder'
import LclAirManager from './LclAirManager'

interface TrucksManagementProps {
  trucks: Truck[]
  truckLoads: TruckLoad[]
  lclAir: LclAirShipment[]
  dbShipments?: DbShipment[]
  shipments: ParsedShipment[]
  onUpdateTrucks: (trucks: Truck[], changedIds?: string[]) => void
  onDeleteTruck: (id: string) => void
  onUpdateTruckLoads: (loads: TruckLoad[], changedIds?: string[]) => void
  onDeleteTruckLoad: (id: string) => void
  onUpdateLclAir: (shipments: LclAirShipment[]) => void
  onDeleteLclAir: (id: string) => void
  onRefreshTrucks?: () => void
}

export default function TrucksManagement(props: TrucksManagementProps) {
  const [subTab, setSubTab] = useState<'trucks' | 'lcl-air'>('trucks')

  // Al entrar a Camiones: traer lo último (multi-usuario). Al volver el foco
  // a la ventana, ídem con throttle de 60s.
  const { onRefreshTrucks } = props
  const lastRefresh = useRef(0)
  const doRefresh = useCallback(() => {
    if (Date.now() - lastRefresh.current < 60_000) return
    lastRefresh.current = Date.now()
    onRefreshTrucks?.()
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
        onBack={() => setSelectedTruckId(null)}
        onUpdateTrucks={props.onUpdateTrucks}
        onUpdateTruckLoads={props.onUpdateTruckLoads}
        onDeleteTruckLoad={props.onDeleteTruckLoad}
        onDeleteTruck={props.onDeleteTruck}
      />
    )
  }

  // ── List view (sub-tabs) ──
  return (
    <div className="space-y-4">
      <Tabs value={subTab} onValueChange={v => setSubTab(v as 'trucks' | 'lcl-air')} className="space-y-4">
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
            {props.lclAir.length > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">({props.lclAir.length})</span>
            )}
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
            lclAir={props.lclAir}
            onUpdateLclAir={props.onUpdateLclAir}
            onDeleteLclAir={props.onDeleteLclAir}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
