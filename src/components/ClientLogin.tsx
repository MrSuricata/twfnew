import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Package, SignIn } from '@phosphor-icons/react'
import { loginClient } from '@/lib/authClient'
import { toast } from 'sonner'
import { useTranslation, getStoredLanguage } from '@/lib/i18n'
import { useBrand } from '@/lib/brand'

// ── Login del portal de clientes ─────────────────────────────────────────
// Email + contraseña (2026-07, reemplaza el OTP que nadie usaba). Los accesos
// los crea el admin en la pestaña Clientes; la contraseña se comunica por
// otro canal (WhatsApp/teléfono), nunca por email.

interface ClientLoginProps {
  onLogin: (email: string) => void
  onBack: () => void
}

export default function ClientLogin({ onLogin, onBack }: ClientLoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const t = useTranslation(getStoredLanguage())
  const brand = useBrand()

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      toast.error('Completá tu email y contraseña')
      return
    }

    setIsLoading(true)
    try {
      const result = await loginClient(email, password)
      if (result.success) {
        const name = result.clientData?.name || ''
        toast.success(`${t.auth.welcome}${name ? `, ${name}` : ''}`)
        onLogin(email.toLowerCase().trim())
      } else {
        toast.error(result.error || 'Usuario o contraseña incorrectos')
      }
    } catch {
      toast.error('Error de conexión con el servidor')
    } finally {
      setIsLoading(false)
    }
  }, [email, password, onLogin, t])

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary via-primary/95 to-secondary flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Button
          variant="ghost"
          onClick={onBack}
          className="mb-6 text-white hover:bg-white/10"
        >
          <ArrowLeft size={20} className="mr-2" />
          Volver al sitio
        </Button>

        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-accent/10 rounded-full">
                <Package size={48} className="text-accent" weight="duotone" />
              </div>
            </div>
            <CardTitle className="text-2xl">Portal de Cliente</CardTitle>
            <p className="text-muted-foreground">
              Ingresá con tu email y contraseña para seguir tus cargas.
            </p>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="client-login-email">Email</Label>
                <Input
                  id="client-login-email"
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client-login-password">Contraseña</Label>
                <Input
                  id="client-login-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                disabled={isLoading}
              >
                {isLoading ? (
                  t.auth.verifying
                ) : (
                  <>
                    <SignIn size={20} className="mr-2" />
                    Ingresar
                  </>
                )}
              </Button>

              <div className="mt-6 p-4 bg-muted rounded-lg text-sm text-muted-foreground">
                <p className="font-medium mb-2">¿No tenés acceso?</p>
                <p>
                  Escribinos a{' '}
                  <a href={`mailto:${brand.contact.email}`} className="text-accent hover:underline">
                    {brand.contact.email}
                  </a>{' '}
                  para solicitar tu usuario del portal.
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
