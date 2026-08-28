import type { ReactNode } from 'react'
import { ArrowLeft } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useBrand } from '@/lib/brand'

// ── Marco visual de las pantallas de acceso ──────────────────────────────
// Panel de marca a la izquierda (pitch + números) y el formulario a la
// derecha. Los formularios llegan como children INTACTOS: esto es solo el
// escenario. En pantalla chica el panel de marca se esconde y queda el
// formulario sobre el degradado, como siempre.
// Los colores salen de las variables de la marca activa: en Mediterránea es
// el violeta del sistema; en TWF, su azul de siempre.

interface MarcoLoginProps {
  titulo: string
  acento: string
  bajada: string
  onBack?: () => void
  children: ReactNode
}

export default function MarcoLogin({ titulo, acento, bajada, onBack, children }: MarcoLoginProps) {
  const brand = useBrand()
  const med = brand.id === 'med'
  const tituloCls = med ? 'titulo-med' : 'font-bold tracking-tight'
  const acentoCls = med ? 'text-med-celeste' : 'text-accent'

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      {/* Panel de marca */}
      <div className="relative overflow-hidden hidden lg:flex flex-col justify-between p-14 xl:p-16 bg-gradient-to-br from-primary via-primary/95 to-secondary text-white">
        <div className="absolute -top-[300px] -left-[260px] w-[520px] h-[520px] rounded-full border-[26px] border-white/15 pointer-events-none" aria-hidden />
        <div className="absolute -bottom-[280px] left-[120px] w-[420px] h-[420px] rounded-full bg-white/[0.07] pointer-events-none" aria-hidden />
        <img src={brand.logo.white} alt={brand.displayName} className="relative h-11 w-auto self-start" />
        <div className="relative flex flex-col items-start gap-6">
          <h1 className={`${tituloCls} text-4xl xl:text-[54px] text-white`}>
            {titulo}
            <br />
            <span className={acentoCls}>{acento}</span>
          </h1>
          <div className={`w-[180px] h-1.5 ${med ? 'bg-med-celeste' : 'bg-accent'}`} />
          <p className="text-lg leading-relaxed text-white/70 max-w-[440px]">{bajada}</p>
        </div>
        <div className="relative flex gap-11">
          {([['24/7', 'Disponible'], ['+250', 'Destinos'], ['+15', 'Años']] as const).map(([v, l]) => (
            <div key={l}>
              <div className={`${tituloCls} text-[30px] ${acentoCls}`}>{v}</div>
              <div className="mt-1 text-[11px] font-semibold tracking-widest uppercase text-white/60">{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Panel del formulario */}
      <div className="flex items-center justify-center p-4 py-10 bg-gradient-to-br from-primary via-primary/95 to-secondary lg:bg-none lg:bg-med-fondo">
        <div className="w-full max-w-md">
          {onBack && (
            <Button
              variant="ghost"
              onClick={onBack}
              className="mb-6 text-white hover:bg-white/10 lg:text-med-texto lg:hover:bg-black/5"
            >
              <ArrowLeft size={20} className="mr-2" />
              Volver al sitio
            </Button>
          )}
          {children}
        </div>
      </div>
    </div>
  )
}
