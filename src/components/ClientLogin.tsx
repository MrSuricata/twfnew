import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, SignIn, Package } from '@phosphor-icons/react'
import { ClientAccount } from '@/lib/quotationTypes'
import { toast } from 'sonner'

interface ClientLoginProps {
  onLogin: (email: string) => void
  onBack: () => void
  clients?: ClientAccount[]
}

export default function ClientLogin({ onLogin, onBack, clients = [] }: ClientLoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    setTimeout(() => {
      const client = clients?.find(
        c => c.email.toLowerCase() === email.toLowerCase() && c.password === password
      )

      if (client) {
        toast.success(`Bienvenido/a, ${client.name}`)
        onLogin(client.email)
      } else {
        toast.error('Email o contraseña incorrectos')
      }
      
      setIsLoading(false)
    }, 500)
  }

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
              Accede para ver tus cargas y documentos
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
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
                  'Ingresando...'
                ) : (
                  <>
                    <SignIn size={20} className="mr-2" />
                    Ingresar
                  </>
                )}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => toast.info('Contacte a TWF para recuperar su contraseña')}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            </form>

            <div className="mt-6 p-4 bg-muted rounded-lg text-sm text-muted-foreground">
              <p className="font-medium mb-2">¿No tienes una cuenta?</p>
              <p>Contacta a Transit World Forwarding para obtener acceso al portal de cliente.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
