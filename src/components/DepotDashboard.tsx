import { Button } from '@/components/ui/button'
import { Warehouse, SignOut, User } from '@phosphor-icons/react'
import AgendaCalendar from '@/components/agenda/AgendaCalendar'
import { ParsedShipment } from '@/lib/shipmentTypes'

interface DepotDashboardProps {
  shipments: ParsedShipment[]
  depotName: string
  userName: string
  onLogout: () => void
}

export default function DepotDashboard({ shipments, depotName, userName, onLogout }: DepotDashboardProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Warehouse size={24} className="text-primary" weight="duotone" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">{depotName}</h1>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <User size={14} />
                <span>{userName}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <img src="/images/twf-logo-full-new.png" alt="TWF" className="h-7 w-auto opacity-60" />
            <Button variant="outline" size="sm" onClick={onLogout}>
              <SignOut size={18} className="mr-1.5" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      {/* Agenda Calendar filtered by depot */}
      <main className="max-w-[1600px] mx-auto p-4">
        <AgendaCalendar shipments={shipments} depotFilter={depotName} partnerView={true} />
      </main>
    </div>
  )
}
