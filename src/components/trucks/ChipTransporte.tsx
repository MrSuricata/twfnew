/**
 * Chip de transporte con su color (transporteColor.ts), hermano de
 * ChipDeposito: el depósito mira el Plan de carga y sabe quién viene sin leer.
 */
import { Badge } from '@/components/ui/badge'
import { Truck } from '@phosphor-icons/react'
import { colorTransporte } from '@/lib/transporteColor'

export default function ChipTransporte({ transporte, className = '' }: {
  transporte: string
  className?: string
}) {
  const nombre = String(transporte || '').trim()
  return (
    <Badge
      variant="outline"
      title={nombre ? `Transporte: ${nombre}` : 'Transporte a confirmar'}
      className={`gap-1 font-semibold ${colorTransporte(nombre)} ${nombre ? '' : 'border-dashed'} ${className}`}
    >
      <Truck size={11} weight="fill" />
      {nombre || 'a confirmar'}
    </Badge>
  )
}
