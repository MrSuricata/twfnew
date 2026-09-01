/**
 * Chip de depósito uruguayo con el color que ya usa el mail de Próximas
 * salidas (GODILCO ámbar · PLANIR verde · TCP rojo · MONTECON azul). Punteado
 * y con "supuesto" cuando el depósito no está cargado y se deduce del agente
 * (CRAFT→PLANIR, SACO→TCP): la app lo propone, nunca lo escribe sola.
 */
import { Badge } from '@/components/ui/badge'
import { Warehouse } from '@phosphor-icons/react'
import { colorDeposito } from '@/lib/depositoColor'

export default function ChipDeposito({ deposito, supuesto = false, extra = false, agente, className = '' }: {
  deposito: string
  supuesto?: boolean
  /** Parada adicional de una alternativa ("+ GODILCO"). */
  extra?: boolean
  agente?: string | null
  className?: string
}) {
  const title = supuesto
    ? `Depósito sin cargar: se supone ${deposito} por el agente ${agente || ''}. Confirmalo en la carga.`.trim()
    : `Carga en ${deposito}`
  return (
    <Badge
      variant="outline"
      title={title}
      className={`gap-1 font-semibold ${colorDeposito(deposito)} ${supuesto ? 'border-dashed' : ''} ${className}`}
    >
      <Warehouse size={11} weight="fill" />
      {extra ? `+ ${deposito}` : deposito}
      {supuesto && <span className="font-normal opacity-80">· supuesto</span>}
    </Badge>
  )
}
