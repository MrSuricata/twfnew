/**
 * /ui — SOLO EN DESARROLLO. Muestra los portales de depósito, transporte y
 * cliente con datos inventados, sin pedir cuenta.
 *
 * Desde el rediseño 04/09 también muestra el modal de cambios rápidos del
 * admin, que tiene el mismo problema: solo se ve con una carga real cargada.
 *
 * Existe porque esas pantallas solo se ven entrando con una cuenta real:
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
import ContainerQuickEdit from '../operations/ContainerQuickEdit'
import { demoPartnerShipments } from '@/lib/demoPartner'
import type { ParsedShipment } from '@/lib/shipmentTypes'

type Vista = 'deposito' | 'transporte' | 'cliente' | 'modal'

const VISTAS: { id: Vista; label: string }[] = [
  { id: 'deposito', label: 'Depósito (GODILCO)' },
  { id: 'transporte', label: 'Transporte (TRANSCAL)' },
  { id: 'cliente', label: 'Cliente' },
  { id: 'modal', label: 'Modal rápido (admin)' },
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
  const [modalAbierto, setModalAbierto] = useState(true)
  const shipments = demoPartnerShipments()
  const salir = () => { /* en el preview no hay sesión que cerrar */ }
  // Una carga FCL de mentira con __dbId, para que el modal salga editable.
  // Los guardados no van a ningún lado: acá se mira la piel, no el guardado.
  const cargaModal = { ...shipments.find(s => s.CNTR), __dbId: 'demo' } as ParsedShipment

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
      {vista === 'modal' && (
        <div className="p-8">
          <button
            type="button"
            onClick={() => setModalAbierto(true)}
            className="h-9 px-4 rounded-md border border-input bg-background text-sm font-medium hover:bg-muted"
          >
            Abrir el modal
          </button>
          <ContainerQuickEdit
            shipment={cargaModal}
            cntr={cargaModal.CNTR || ''}
            editable
            knownTransportes={['OLAVERRY', 'TRANSCAL', 'VAIROLATTI']}
            open={modalAbierto}
            onOpenChange={setModalAbierto}
            onPatch={() => {}}
            onMasDatos={() => setModalAbierto(false)}
          />
        </div>
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
