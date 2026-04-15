import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from '@phosphor-icons/react'

interface PrivacyPageProps {
  onBack?: () => void
}

export default function PrivacyPage({ onBack }: PrivacyPageProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <img src="/images/twf-icon-dark.png" alt="TWF" className="h-9 w-auto" />
            <span className="font-bold text-primary">Transit World Forwarding</span>
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
              <h1 className="text-3xl font-bold text-primary mb-2">Política de Privacidad</h1>
              <p className="text-sm text-muted-foreground">Última actualización: abril de 2026</p>
            </div>

            <p className="text-base leading-relaxed">
              En Transit World Forwarding (&quot;TWF&quot;) nos tomamos en serio el cuidado de tus datos. Esta
              política explica qué información recolectamos, para qué la usamos, con quién la
              compartimos y qué derechos tenés sobre ella.
            </p>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-primary">1. Qué datos recolectamos</h2>
              <p className="leading-relaxed">Recolectamos dos grandes tipos de información:</p>
              <ul className="list-disc pl-6 space-y-1 leading-relaxed">
                <li>
                  <strong>Datos de cuenta:</strong> nombre, correo electrónico, empresa y rol dentro
                  de la plataforma.
                </li>
                <li>
                  <strong>Datos operativos:</strong> referencias de embarques, números de contenedor,
                  fechas, estados de carga, documentos asociados y cualquier información necesaria
                  para operar el servicio.
                </li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-primary">2. Para qué los usamos</h2>
              <p className="leading-relaxed">Usamos tus datos exclusivamente para:</p>
              <ul className="list-disc pl-6 space-y-1 leading-relaxed">
                <li>Prestar y mantener el servicio de gestión logística.</li>
                <li>Notificarte cambios de estado, arribos, vencimientos y otras novedades operativas.</li>
                <li>Brindarte soporte cuando lo solicites.</li>
                <li>Mejorar la plataforma en base a métricas agregadas de uso.</li>
              </ul>
              <p className="leading-relaxed">
                No vendemos tus datos ni los usamos para publicidad de terceros.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-primary">3. Con quién los compartimos</h2>
              <p className="leading-relaxed">
                Compartimos datos únicamente con los partners autorizados por vos en el marco de una
                operación concreta. Por ejemplo, el depósito donde va tu carga o el transportista que
                retira el contenedor puede acceder a la información mínima necesaria para cumplir su
                parte del servicio. También podemos compartir datos con proveedores tecnológicos que
                nos dan soporte (alojamiento, base de datos, envío de correos), siempre bajo acuerdos
                de confidencialidad.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-primary">4. Retención</h2>
              <p className="leading-relaxed">
                Conservamos los datos de cuenta mientras la cuenta esté activa. Los datos operativos
                (embarques, documentación, registros de trazabilidad) se mantienen por el plazo que
                exigen las normas aduaneras y fiscales uruguayas, que en general es de hasta diez (10)
                años. Pasado ese plazo, los datos se anonimizan o eliminan.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-primary">5. Derechos del usuario</h2>
              <p className="leading-relaxed">
                Tenés derecho a acceder a los datos que tenemos sobre vos, pedir que los rectifiquemos
                si están incorrectos y solicitar su eliminación cuando ya no sean necesarios (sujeto a
                las obligaciones legales de retención). Para ejercer cualquiera de estos derechos,
                escribinos a <a href="mailto:info@twf.uy" className="text-primary underline">info@twf.uy</a> desde
                la dirección registrada en tu cuenta.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-primary">6. Cookies</h2>
              <p className="leading-relaxed">
                La plataforma usa solo cookies estrictamente necesarias para el funcionamiento del
                servicio: sesión y autenticación. No usamos cookies de marketing ni de seguimiento
                cruzado entre sitios.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-primary">7. Seguridad</h2>
              <p className="leading-relaxed">
                Aplicamos las medidas técnicas que consideramos razonables para proteger tu información:
              </p>
              <ul className="list-disc pl-6 space-y-1 leading-relaxed">
                <li>Todo el tráfico viaja cifrado bajo HTTPS.</li>
                <li>La autenticación usa tokens JWT de corta duración.</li>
                <li>Las contraseñas se almacenan hasheadas (SHA-256, nunca en texto plano).</li>
                <li>
                  La base de datos está protegida con Row Level Security (RLS) en Supabase, de modo
                  que cada usuario solo puede ver los datos que le corresponden.
                </li>
              </ul>
              <p className="leading-relaxed">
                Ningún sistema es 100% infalible, pero hacemos lo razonable para mantener tus datos
                seguros.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-primary">8. Contacto del responsable</h2>
              <p className="leading-relaxed">
                El responsable del tratamiento de datos es Transit World Forwarding, con domicilio en
                la República Oriental del Uruguay. Para cualquier consulta sobre esta política o el
                tratamiento de tus datos, contactanos a{' '}
                <a href="mailto:info@twf.uy" className="text-primary underline">info@twf.uy</a>.
              </p>
            </section>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
