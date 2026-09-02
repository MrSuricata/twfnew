/**
 * La barra de "Ver como": queda fija arriba mientras el admin mira la web con
 * los ojos de un depósito, un transporte o un cliente, y le da la salida.
 *
 * Es una vista PREVIA: los botones que escribirían (avisos del partner) no
 * mandan nada, y no se firma ningún token. Por eso la barra tiene que estar
 * siempre visible: nadie tiene que dudar de si está viendo su pantalla o la
 * de otro.
 */
import { Eye, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { ROL_VISTA_LABEL, type VistaComo } from '@/lib/vistaComo'

export default function VistaComoBarra({ vista, onSalir }: { vista: VistaComo; onSalir: () => void }) {
  return (
    <div className="sticky top-0 z-50 bg-amber-400 text-amber-950 border-b border-amber-500 print:hidden">
      <div className="max-w-[1600px] mx-auto px-4 py-1.5 flex items-center gap-2 text-sm">
        <Eye size={16} weight="fill" className="shrink-0" />
        <span className="min-w-0 truncate">
          Estás viendo la web como <b>{vista.nombre}</b>
          <span className="hidden sm:inline"> · {ROL_VISTA_LABEL[vista.rol]} · vista previa, no se guarda nada</span>
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={onSalir}
          className="ml-auto h-7 shrink-0 border-amber-700/40 bg-amber-300/60 text-amber-950 hover:bg-amber-200"
        >
          <X size={14} className="mr-1" />
          Volver al admin
        </Button>
      </div>
    </div>
  )
}
