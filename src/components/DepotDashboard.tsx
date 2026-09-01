import { Warehouse } from '@phosphor-icons/react'
import AgendaCalendar from '@/components/agenda/AgendaCalendar'
import PartnerDashboardShell from '@/components/PartnerDashboardShell'
import ProximasSalidas from '@/components/ProximasSalidas'
import AvisoOperativo from '@/components/AvisoOperativo'
import { ParsedShipment } from '@/lib/shipmentTypes'

interface DepotDashboardProps {
  shipments: ParsedShipment[]
  depotName: string
  userName: string
  onLogout: () => void
}

export default function DepotDashboard({ shipments, depotName, userName, onLogout }: DepotDashboardProps) {
  return (
    <PartnerDashboardShell
      icon={<Warehouse size={24} className="text-primary" weight="duotone" />}
      title={depotName}
      userName={userName}
      onLogout={onLogout}
    >
      <div className="space-y-4">
        <AvisoOperativo />
        <ProximasSalidas shipments={shipments} rol="depot" />
        <AgendaCalendar shipments={shipments} depotFilter={depotName} partnerView={true} />
      </div>
    </PartnerDashboardShell>
  )
}
