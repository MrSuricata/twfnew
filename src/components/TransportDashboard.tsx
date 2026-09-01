import { Truck } from '@phosphor-icons/react'
import AgendaCalendar from '@/components/agenda/AgendaCalendar'
import PartnerDashboardShell from '@/components/PartnerDashboardShell'
import ProximasSinCoordinar from '@/components/ProximasSinCoordinar'
import { ParsedShipment } from '@/lib/shipmentTypes'

interface TransportDashboardProps {
  shipments: ParsedShipment[]
  transportName: string
  userName: string
  onLogout: () => void
}

export default function TransportDashboard({ shipments, transportName, userName, onLogout }: TransportDashboardProps) {
  return (
    <PartnerDashboardShell
      icon={<Truck size={24} className="text-primary" weight="duotone" />}
      title={transportName}
      userName={userName}
      onLogout={onLogout}
    >
      <div className="space-y-4">
        {/* Primero lo que todavía no tiene fecha: es con lo que el transporte
            reserva unidad y chofer. El calendario de abajo muestra lo ya
            coordinado. */}
        <ProximasSinCoordinar shipments={shipments} />
        <AgendaCalendar shipments={shipments} transportFilter={transportName} partnerView={true} />
      </div>
    </PartnerDashboardShell>
  )
}
