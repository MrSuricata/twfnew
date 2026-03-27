import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SignIn, Envelope, Lock, Warehouse, Truck } from '@phosphor-icons/react'
import { toast } from 'sonner'

interface PartnerLoginProps {
  onLogin: (token: string, role: string, userData: any) => void
  onBack?: () => void
}

export default function PartnerLogin({ onLogin, onBack }: PartnerLoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/auth/partner-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Credenciales incorrectas')
        setLoading(false)
        return
      }

      toast.success('Inicio de sesión exitoso')
      onLogin(data.token, data.role, data.user)
    } catch (err) {
      toast.error('Error de conexión — intente nuevamente')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary via-primary/95 to-secondary flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <img src="/images/twf-logo-white.png" alt="TWF" className="h-12 w-auto" />
            </div>
            <CardTitle className="text-2xl">Acceso Partners</CardTitle>
            <p className="text-muted-foreground text-sm">
              Depósitos y Transportes — Transit World Forwarding
            </p>
            <div className="flex justify-center gap-4 mt-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Warehouse size={16} weight="duotone" />
                <span>Depósitos</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Truck size={16} weight="duotone" />
                <span>Transportes</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="partner-email">Email</Label>
                <div className="relative">
                  <Envelope size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="partner-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@empresa.com"
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="partner-password">Contraseña</Label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="partner-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                disabled={loading}
              >
                {loading ? (
                  <SignIn size={20} className="mr-2 animate-spin" />
                ) : (
                  <SignIn size={20} className="mr-2" />
                )}
                {loading ? 'Verificando...' : 'Ingresar'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
