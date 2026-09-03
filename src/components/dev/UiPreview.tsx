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

const haceDias = (n: number): number => Date.now() - n * 86400000

/** Subidas de ejemplo, para ver la card "Novedades de tus cargas". */
const foto = (ref: string, tipo: 'origen' | 'uruguay', dias: number, i: number) => ({
  id: `f-${ref}-${i}`, shipmentRef: ref, photoType: tipo, createdAt: haceDias(dias),
  fileName: `foto-${i}.jpg`, fileType: 'image/jpeg', createdBy: 'demo',
}) as never
const fotosDemo = [
  foto('D9001', 'uruguay', 0, 1), foto('D9001', 'uruguay', 0, 2),
  foto('D9005', 'origen', 2, 3), foto('D9005', 'origen', 2, 4), foto('D9005', 'origen', 3, 5),
]
const informesDemo = [{
  id: 'i-1', shipmentRef: 'D9004', title: 'Informe operativo', content: '',
  fileName: 'informe.pdf', fileType: 'application/pdf', createdAt: haceDias(1), createdBy: 'demo',
} as never]

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
          clientEmail="demo@cliente.com"
          clientName="DEMO ALPHA S.A."
          clients={[{ id: 'demo', name: 'DEMO ALPHA S.A.', email: 'demo@cliente.com', company: '', createdAt: 0, clientePattern: 'DEMO' } as never]}
          shipments={shipments}
          fotos={fotosDemo}
          informes={informesDemo}
          onLogout={salir}
          preview
        />
      )}
    </div>
  )
}
