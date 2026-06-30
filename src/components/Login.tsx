import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LockKey, ArrowLeft, ShieldCheck, CircleNotch } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { loginAdmin } from '@/lib/authClient'
import { useTranslation, getStoredLanguage } from '@/lib/i18n'
import { useBrand } from '@/lib/brand'

interface LoginProps {
  onLogin: () => void
  onBack: () => void
}

export default function Login({ onLogin, onBack }: LoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const t = useTranslation(getStoredLanguage())
  const brand = useBrand()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const result = await loginAdmin(username, password)

    if (result.success) {
      toast.success(t.auth.loginSuccess)
      onLogin()
    } else {
      toast.error(result.error || t.auth.adminInvalid)
    }

    setLoading(false)
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
              <div className="p-4 bg-primary/10 rounded-full">
                <ShieldCheck size={48} className="text-primary" weight="duotone" />
              </div>
            </div>
            <CardTitle className="text-2xl">Panel Administrativo</CardTitle>
            <p className="text-muted-foreground text-sm">
              Acceso restringido — {brand.displayName}
            </p>
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
                  autoComplete="username"
                  autoFocus
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
                  autoComplete="current-password"
                  required
                />
              </div>
              <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={loading}>
                {loading ? (
                  <CircleNotch size={20} className="mr-2 animate-spin" />
                ) : (
                  <LockKey size={20} className="mr-2" />
                )}
                {loading ? t.auth.verifying : t.auth.login}
              </Button>
            </form>

            {/* DEV-only preview bypass — lets you see the dashboard locally
                without the backend API. Never rendered in production builds. */}
            {import.meta.env.DEV && (
              <button
                type="button"
                onClick={onLogin}
                className="mt-3 w-full text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Vista previa (dev) — entrar sin backend
              </button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
