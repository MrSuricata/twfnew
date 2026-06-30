import { Button } from '@/components/ui/button'
import { Compass, House, EnvelopeSimple } from '@phosphor-icons/react'
import BrandLogo from './BrandLogo'
import { useBrand } from '@/lib/brand'

interface NotFoundPageProps {
  onGoHome?: () => void
}

export default function NotFoundPage({ onGoHome }: NotFoundPageProps) {
  const brand = useBrand()
  const handleGoHome = () => {
    if (onGoHome) onGoHome()
    else window.location.href = '/'
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
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
          <div className="flex justify-center mb-6">
            <div className="bg-primary/10 rounded-full p-6">
              <Compass size={96} weight="duotone" className="text-primary" />
            </div>
          </div>

          <p className="text-7xl font-bold text-primary mb-2">404</p>
          <h1 className="text-2xl font-bold mb-3">Página no encontrada</h1>
          <p className="text-muted-foreground mb-8 leading-relaxed">
            La página que estás buscando no existe o fue movida. Revisá la dirección o volvé al
            inicio para seguir navegando.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={handleGoHome} size="lg">
              <House size={18} className="mr-2" />
              Ir al inicio
            </Button>
            <Button asChild variant="outline" size="lg">
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
