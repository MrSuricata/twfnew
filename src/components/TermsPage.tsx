import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from '@phosphor-icons/react'
import BrandLogo from './BrandLogo'
import { useBrand } from '@/lib/brand'

interface TermsPageProps {
  onBack?: () => void
}

export default function TermsPage({ onBack }: TermsPageProps) {
  const brand = useBrand()
  return (
    <div className="min-h-screen bg-background">
      {/* Header minimal con logo */}
      <header className="border-b bg-white sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <BrandLogo variant="icon" className="h-9 w-auto" />
            <span className="font-bold text-primary">{brand.displayName}</span>
          </a>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (onBack) onBack()
              else window.location.href = '/'
            }}
          >
            <ArrowLeft size={16} className="mr-2" />
            Volver al inicio
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12">
        <Card>
          <CardContent className="px-8 py-8 space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-primary mb-2">Términos y Condiciones</h1>
              <p className="text-sm text-muted-foreground">Última actualización: abril de 2026</p>
            </div>

            <p className="text-base leading-relaxed">
              Bienvenido a la plataforma de Transit World Forwarding (en adelante, &quot;TWF&quot;). Estos
              Términos regulan el uso de nuestra aplicación de gestión logística. Al ingresar o usar
              el servicio, aceptás los términos que siguen. Si no estás de acuerdo, no uses la plataforma.
            </p>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-primary">1. Aceptación de los términos</h2>
              <p className="leading-relaxed">
                Al crear una cuenta, ingresar con un usuario existente o usar cualquier funcionalidad
                de la plataforma, confirmás que leíste, entendiste y aceptás estos Términos, así como
                la Política de Privacidad. Si usás la plataforma en nombre de una empresa, declarás
                tener facultades suficientes para obligarla.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-primary">2. Descripción del servicio</h2>
              <p className="leading-relaxed">
                TWF ofrece una aplicación web de gestión logística pensada para operadores de comercio
                exterior y sus clientes. Permite hacer seguimiento de cargas, gestionar documentación,
                coordinar con depósitos y transportes, y centralizar información operativa de embarques.
                El alcance exacto del servicio depende del plan contratado y del rol asignado a cada
                usuario.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-primary">3. Cuentas y accesos</h2>
              <p className="leading-relaxed">
                La plataforma maneja distintos roles: administrador, cliente y partners (depósito o
                transporte). Cada cuenta es personal e intransferible. Sos responsable de mantener la
                confidencialidad de tu contraseña y de toda actividad que ocurra bajo tu usuario.
                Notificanos de inmediato a <a href="mailto:info@twf.uy" className="text-primary underline">info@twf.uy</a> ante
                cualquier acceso no autorizado.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-primary">4. Uso permitido y prohibiciones</h2>
              <p className="leading-relaxed">
                Te comprometés a usar la plataforma solo para los fines legítimos del servicio. Queda
                expresamente prohibido:
              </p>
              <ul className="list-disc pl-6 space-y-1 leading-relaxed">
                <li>Hacer scraping, crawling o extracción automatizada de datos.</li>
                <li>Intentar acceder a cuentas, datos o áreas a las que no estés autorizado.</li>
                <li>Redistribuir, revender o publicar la información obtenida en la plataforma.</li>
                <li>Introducir código malicioso, virus o cualquier elemento que comprometa el servicio.</li>
                <li>Usar la plataforma para actividades contrarias a la ley aplicable.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-primary">5. Propiedad intelectual</h2>
              <p className="leading-relaxed">
                El software, el diseño, los textos, los logos y el resto del material de la plataforma
                son propiedad exclusiva de TWF o de sus licenciantes. No te otorgamos ningún derecho
                sobre el código fuente ni sobre los componentes de la plataforma más allá del uso
                permitido mientras dure tu acceso.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-primary">6. Limitación de responsabilidad</h2>
              <p className="leading-relaxed">
                El servicio se presta &quot;tal cual&quot; y &quot;según disponibilidad&quot;. Hacemos lo posible para
                mantener la plataforma estable y disponible, pero no garantizamos un uptime del 100%
                ni que esté libre de errores. TWF no será responsable por daños indirectos, lucro
                cesante ni pérdida de datos derivados del uso o de la imposibilidad de uso del servicio,
                más allá de lo previsto por la ley aplicable.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-primary">7. Privacidad</h2>
              <p className="leading-relaxed">
                El tratamiento de tus datos personales se rige por nuestra{' '}
                <a href="/privacidad" className="text-primary underline">Política de Privacidad</a>,
                que forma parte de estos Términos.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-primary">8. Modificaciones de los términos</h2>
              <p className="leading-relaxed">
                Podemos actualizar estos Términos cuando sea necesario. Si los cambios son relevantes,
                te avisaremos por correo electrónico a la dirección registrada en tu cuenta. El uso
                del servicio luego de la notificación implica la aceptación de los nuevos Términos.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-primary">9. Ley aplicable y jurisdicción</h2>
              <p className="leading-relaxed">
                Estos Términos se rigen por las leyes de la República Oriental del Uruguay. Cualquier
                controversia que surja de su interpretación o ejecución se someterá a los tribunales
                competentes de la ciudad de Montevideo, renunciando las partes a cualquier otro fuero
                que pudiera corresponderles.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-primary">10. Contacto</h2>
              <p className="leading-relaxed">
                Para dudas, reclamos o cualquier consulta sobre estos Términos podés escribirnos a{' '}
                <a href="mailto:info@twf.uy" className="text-primary underline">info@twf.uy</a>.
              </p>
            </section>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
