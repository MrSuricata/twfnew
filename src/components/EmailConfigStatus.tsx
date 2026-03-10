import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { CheckCircle, Warning, Envelope } from '@phosphor-icons/react'
import { isEmailJSConfigured, EMAILJS_CONFIG } from '@/lib/emailjs-config'

export default function EmailConfigStatus() {
  const isConfigured = isEmailJSConfigured()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Envelope size={24} weight="duotone" />
          Estado de Configuración de Email
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isConfigured ? (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle size={20} weight="fill" className="text-green-600" />
            <AlertTitle className="text-green-800">EmailJS Configurado Correctamente</AlertTitle>
            <AlertDescription className="text-green-700">
              Las cotizaciones se enviarán automáticamente a: <strong>{EMAILJS_CONFIG.TO_EMAIL}</strong>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="bg-amber-50 border-amber-200">
            <Warning size={20} weight="fill" className="text-amber-600" />
            <AlertTitle className="text-amber-800">EmailJS NO Configurado</AlertTitle>
            <AlertDescription className="text-amber-700">
              <p className="mb-2">
                Las cotizaciones NO se están enviando por email. Configura EmailJS para recibir notificaciones automáticas.
              </p>
              <p className="text-sm mt-3">
                📖 Lee la guía: <code className="bg-amber-100 px-2 py-1 rounded">GUIA_EMAIL_RAPIDA.md</code>
              </p>
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2 text-sm">
          <h4 className="font-semibold">Configuración Actual:</h4>
          <div className="space-y-1 font-mono text-xs bg-muted p-3 rounded">
            <div>
              <span className="text-muted-foreground">Public Key:</span>{' '}
              <span className={EMAILJS_CONFIG.PUBLIC_KEY === 'YOUR_PUBLIC_KEY' ? 'text-red-600' : 'text-green-600'}>
                {EMAILJS_CONFIG.PUBLIC_KEY === 'YOUR_PUBLIC_KEY' ? '❌ No configurada' : '✅ Configurada'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Service ID:</span>{' '}
              <span className={EMAILJS_CONFIG.SERVICE_ID === 'YOUR_SERVICE_ID' ? 'text-red-600' : 'text-green-600'}>
                {EMAILJS_CONFIG.SERVICE_ID === 'YOUR_SERVICE_ID' ? '❌ No configurado' : '✅ Configurado'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Template ID:</span>{' '}
              <span className={EMAILJS_CONFIG.TEMPLATE_ID === 'YOUR_TEMPLATE_ID' ? 'text-red-600' : 'text-green-600'}>
                {EMAILJS_CONFIG.TEMPLATE_ID === 'YOUR_TEMPLATE_ID' ? '❌ No configurado' : '✅ Configurado'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Email destino:</span>{' '}
              <span className="text-foreground">{EMAILJS_CONFIG.TO_EMAIL}</span>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
          <p className="font-semibold text-blue-900 mb-1">📝 Para configurar:</p>
          <ol className="list-decimal list-inside space-y-1 text-blue-800">
            <li>Abre <code className="bg-blue-100 px-1 rounded">src/lib/emailjs-config.ts</code></li>
            <li>Reemplaza las claves con tus credenciales de EmailJS</li>
            <li>Guarda y recarga la aplicación</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  )
}
