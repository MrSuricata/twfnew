import { Truck } from '@phosphor-icons/react'
import AgendaCalendar from '@/components/agenda/AgendaCalendar'
import PartnerDashboardShell from '@/components/PartnerDashboardShell'
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
      <AgendaCalendar shipments={shipments} transportFilter={transportName} partnerView={true} />
    </PartnerDashboardShell>
  )
}
