/**
 * El aviso vigente del Diario Logístico, para quien esté mirando su panel.
 *
 * Un paro en TCP o un paso cerrado le cambia el día al cliente, al depósito y
 * al transporte por igual, así que el aviso es el mismo para los tres y sale
 * de un solo lugar: lo que se publica en Noticias aparece acá sin tocar nada.
 *
 * El Diario es de Mediterránea; en TWF no se muestra.
 */
import { useMemo } from 'react'
import { useNoticias } from '@/components/NovedadesSection'
import { alertasVigentes, tituloPlano } from '@/lib/noticias'
import { getBrand } from '@/lib/brand'

export default function AvisoOperativo({ className = '' }: { className?: string }) {
  const { noticias } = useNoticias()
  const aviso = useMemo(
    () => (getBrand().id === 'med'
      ? alertasVigentes(noticias, new Date().toISOString().slice(0, 10))[0] ?? null
      : null),
    [noticias]
  )

  if (!aviso) return null

  return (
    <div className={`degradado-med relative overflow-hidden rounded-[20px] p-6 text-white ${className}`}>
      <div
        className="absolute -bottom-24 -right-24 w-56 h-56 rounded-full border-[14px] border-white/15 pointer-events-none"
        aria-hidden
      />
      <span className="inline-block rounded-full border-2 border-[#9bd1e5] px-4 py-1 text-[11px] font-semibold tracking-widest uppercase text-[#9bd1e5]">
        Aviso operativo
      </span>
      <h3 className="titulo-med mt-2.5 text-xl lg:text-2xl text-white">{tituloPlano(aviso.titulo)}</h3>
      {aviso.bajada && (
        <p className="mt-1.5 text-sm text-white/80 max-w-2xl">{aviso.bajada.replace(/\*\*/g, '')}</p>
      )}
      <a
        href="/novedades"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center rounded-full bg-[#ceffff] px-5 py-2 text-sm font-semibold text-[#352e6a]"
      >
        Ver aviso completo →
      </a>
    </div>
  )
}
