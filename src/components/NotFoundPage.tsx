import { Button } from '@/components/ui/button'
import { House, EnvelopeSimple } from '@phosphor-icons/react'
import BrandLogo from './BrandLogo'
import { useBrand } from '@/lib/brand'

interface NotFoundPageProps {
  onGoHome?: () => void
}

export default function NotFoundPage({ onGoHome }: NotFoundPageProps) {
  const brand = useBrand()
  const med = brand.id === 'med'
  const handleGoHome = () => {
    if (onGoHome) onGoHome()
    else window.location.href = '/'
  }

  return (
    <div className={`min-h-screen flex flex-col ${med ? 'papel-med' : 'bg-background'}`}>
      {/* Header público */}
      <header className="border-b bg-white">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center">
          <a href="/" className="flex items-center gap-3">
            <BrandLogo variant="icon" className="h-9 w-auto" />
            <span className="font-bold text-primary">{brand.displayName}</span>
          </a>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <p className={`${med ? 'titulo-med' : 'font-bold tracking-tight'} text-[120px] leading-none text-primary`}>404</p>
          <div className={`mx-auto mt-3 mb-5 h-1.5 w-[120px] ${med ? 'bg-med-aviso' : 'bg-accent'}`} />
          <h1 className={`${med ? 'titulo-med' : 'font-bold'} text-2xl text-primary mb-3`}>Página no encontrada</h1>
          <p className="text-muted-foreground mb-8 leading-relaxed">
            La página que estás buscando no existe o fue movida. Revisá la dirección o volvé al
            inicio para seguir navegando.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={handleGoHome} size="lg" className="rounded-full">
              <House size={18} className="mr-2" />
              Ir al inicio
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-full">
              <a href={`mailto:${brand.contact.email}`}>
                <EnvelopeSimple size={18} className="mr-2" />
                Contactar
              </a>
            </Button>
          </div>
        </div>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} {brand.legalName}</p>
      </footer>
    </div>
  )
}
