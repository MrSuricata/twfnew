/**
 * /ui — SOLO EN DESARROLLO. Muestra los portales de depósito, transporte y
 * cliente con datos inventados, sin pedir cuenta.
 *
 * Existe porque esas tres pantallas solo se ven entrando con una cuenta real:
 * trabajar su diseño a ciegas es cómo se llegó a que Brian dijera "mucho
 * cúmulo de datos y líneas de texto" (02/09/2026). Acá se ven, se miden y se
 * arreglan.
 *
 * En producción la ruta no existe (App.tsx la resuelve solo con import.meta.env.DEV)
 * y este archivo no entra al bundle.
 */
import { useState } from 'react'
import DepotDashboard from '../DepotDashboard'
import TransportDashboard from '../TransportDashboard'
import ClientPortal from '../ClientPortal'
import { demoPartnerShipments } from '@/lib/demoPartner'

type Vista = 'deposito' | 'transporte' | 'cliente'

const VISTAS: { id: Vista; label: string }[] = [
  { id: 'deposito', label: 'Depósito (GODILCO)' },
  { id: 'transporte', label: 'Transporte (TRANSCAL)' },
  { id: 'cliente', label: 'Cliente' },
]

export default function UiPreview() {
  const [vista, setVista] = useState<Vista>('deposito')
  const shipments = demoPartnerShipments()
  const salir = () => { /* en el preview no hay sesión que cerrar */ }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-[60] bg-fuchsia-600 text-white text-sm">
        <div className="max-w-[1600px] mx-auto px-4 py-1.5 flex items-center gap-3 flex-wrap">
          <b>Vista de diseño</b>
          <span className="text-white/80 text-xs">datos inventados · solo en desarrollo</span>
          <div className="ml-auto flex gap-1.5">
            {VISTAS.map(v => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVista(v.id)}
                className={`h-7 px-3 rounded-full text-xs font-semibold transition-colors ${
                  vista === v.id ? 'bg-white text-fuchsia-700' : 'bg-white/15 hover:bg-white/25'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {vista === 'deposito' && (
        <DepotDashboard shipments={shipments} depotName="GODILCO" userName="Ana Papke" onLogout={salir} preview />
      )}
      {vista === 'transporte' && (
        <TransportDashboard shipments={shipments} transportName="TRANSCAL" userName="Irina Foos" onLogout={salir} preview />
      )}
      {vista === 'cliente' && (
        <ClientPortal
          clientEmail=""
          clientName="DEMO ALPHA S.A."
          clients={[{ id: 'demo', name: 'DEMO ALPHA S.A.', email: '', company: '', createdAt: 0, clientePattern: 'DEMO ALPHA' } as never]}
          shipments={shipments}
          onLogout={salir}
          preview
        />
      )}
    </div>
  )
}
