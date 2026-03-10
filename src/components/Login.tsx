import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Boat, LockKey, ArrowLeft } from '@phosphor-icons/react'
import { toast } from 'sonner'

interface LoginProps {
  onLogin: () => void
  onBack: () => void
}

export default function Login({ onLogin, onBack }: LoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (username === 'admin' && password === 'admin') {
      toast.success('Inicio de sesión exitoso')
      onLogin()
    } else {
      toast.error('Usuario o contraseña incorrectos')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary via-primary/95 to-secondary flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Boat size={40} weight="fill" className="text-primary" />
            <span className="text-2xl font-bold text-primary">TWF Admin</span>
          </div>
          <CardTitle className="text-2xl">Inicio de Sesión</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Usuario</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
              <LockKey size={20} className="mr-2" />
              Ingresar
            </Button>
            <Button type="button" variant="outline" onClick={onBack} className="w-full">
              <ArrowLeft size={20} className="mr-2" />
              Volver al Sitio
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
