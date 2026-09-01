import { Truck } from '@phosphor-icons/react'
import AgendaCalendar from '@/components/agenda/AgendaCalendar'
import PartnerDashboardShell from '@/components/PartnerDashboardShell'
import ProximasSalidas from '@/components/ProximasSalidas'
import AvisoOperativo from '@/components/AvisoOperativo'
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
        {/* Un paro o un paso cerrado le cambia el día al transporte igual que
            al cliente: el aviso del Diario va arriba de todo. Después el plan
            de las dos semanas, y el calendario para ubicarse en la semana. */}
        <AvisoOperativo />
        <ProximasSalidas shipments={shipments} rol="transport" />
        <AgendaCalendar shipments={shipments} transportFilter={transportName} partnerView={true} />
      </div>
    </PartnerDashboardShell>
  )
}
