import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  LockKey,
  Users,
  Package,
  Handshake,
  CircleNotch,
  SignIn,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { loginAdmin, loginClient, loginPartner } from '@/lib/authClient'
import { useTranslation, getStoredLanguage } from '@/lib/i18n'

// ─── Diálogo de acceso unificado para la landing ──────────────────────────
// Un solo botón "Ingresar" que abre este diálogo, con 3 pestañas: Equipo,
// Cliente y Partner. Cada pestaña reusa EXACTAMENTE la lógica de submit de su
// pantalla dedicada (loginAdmin / loginClient / loginPartner de authClient).
// Al éxito, esas funciones ya persisten el token en sessionStorage vía
// setAuth(); acá redirigimos con window.location a la ruta correspondiente
// (/admin · /portal · /depot|/transport) y el verifySession() de App.tsx
// restaura la sesión al montar. Así no duplicamos estado ni tocamos los flujos
// existentes.
// ──────────────────────────────────────────────────────────────────────────

type AccessType = 'equipo' | 'cliente' | 'partner'

interface LoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function LoginDialog({ open, onOpenChange }: LoginDialogProps) {
  const t = useTranslation(getStoredLanguage())
  const [tab, setTab] = useState<AccessType>('equipo')

  // ── Equipo ──
  const [adminUser, setAdminUser] = useState('')
  const [adminPass, setAdminPass] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)

  // ── Cliente (email + contraseña) ──
  const [clientEmail, setClientEmail] = useState('')
  const [clientPass, setClientPass] = useState('')
  const [clientLoading, setClientLoading] = useState(false)

  // ── Partner ──
  const [partnerEmail, setPartnerEmail] = useState('')
  const [partnerPass, setPartnerPass] = useState('')
  const [partnerLoading, setPartnerLoading] = useState(false)

  // Reset de estado al cerrar (no dejar credenciales a medio camino).
  useEffect(() => {
    if (!open) {
      setTab('equipo')
      setAdminUser(''); setAdminPass(''); setAdminLoading(false)
      setClientEmail(''); setClientPass(''); setClientLoading(false)
      setPartnerEmail(''); setPartnerPass(''); setPartnerLoading(false)
    }
  }, [open])

  // ── Equipo: mismo endpoint/flujo que Login.tsx ──
  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdminLoading(true)
    const result = await loginAdmin(adminUser, adminPass)
    if (result.success) {
      toast.success(t.auth.loginSuccess)
      // El token ya quedó en sessionStorage → /admin lo restaura al montar.
      window.location.assign('/admin')
    } else {
      const msg = result.error === 'Invalid credentials' ? t.auth.adminInvalid : result.error
      toast.error(msg || t.auth.adminInvalid)
      setAdminLoading(false)
    }
  }

  // ── Cliente: email + contraseña (mismo flujo que ClientLogin.tsx) ──
  const handleClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setClientLoading(true)
    try {
      const result = await loginClient(clientEmail, clientPass)
      if (result.success) {
        const name = result.clientData?.name || ''
        toast.success(`${t.auth.welcome}${name ? `, ${name}` : ''}`)
        // Token ya persistido → /portal restaura la sesión.
        window.location.assign('/portal')
      } else {
        toast.error(result.error || 'Usuario o contraseña incorrectos')
        setClientLoading(false)
      }
    } catch {
      toast.error(t.auth.connectionError)
      setClientLoading(false)
    }
  }

  // ── Partner: mismo endpoint/flujo que PartnerLogin.tsx ──
  const handlePartnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPartnerLoading(true)
    try {
      const result = await loginPartner(partnerEmail, partnerPass)
      if (!result.success) {
        toast.error(result.error || t.auth.partnerInvalid)
        setPartnerLoading(false)
        return
      }
      toast.success(t.auth.loginSuccess)
      // Depot y transport tienen dashboards distintos → redirigir según el rol.
      // /partner también funciona (verifySession lo mapea), pero mandamos a la
      // ruta específica para que el back/forward del browser sea coherente.
      window.location.assign(result.role === 'depot' ? '/depot' : '/transport')
    } catch {
      toast.error(t.auth.connectionError)
      setPartnerLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ingresar</DialogTitle>
          <DialogDescription>Elegí tu tipo de acceso para continuar.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as AccessType)} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="equipo" className="gap-1.5">
              <Users size={15} weight="duotone" /> Equipo
            </TabsTrigger>
            <TabsTrigger value="cliente" className="gap-1.5">
              <Package size={15} weight="duotone" /> Cliente
            </TabsTrigger>
            <TabsTrigger value="partner" className="gap-1.5">
              <Handshake size={15} weight="duotone" /> Partner
            </TabsTrigger>
          </TabsList>

          {/* ===== Equipo ===== */}
          <TabsContent value="equipo" className="mt-4">
            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="dlg-admin-user">Usuario</Label>
                <Input
                  id="dlg-admin-user"
                  value={adminUser}
                  onChange={(e) => setAdminUser(e.target.value)}
                  placeholder="Tu usuario"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dlg-admin-pass">Contraseña</Label>
                <Input
                  id="dlg-admin-pass"
                  type="password"
                  value={adminPass}
                  onChange={(e) => setAdminPass(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={adminLoading}>
                {adminLoading ? (
                  <CircleNotch size={18} className="mr-2 animate-spin" />
                ) : (
                  <LockKey size={18} className="mr-2" />
                )}
                {adminLoading ? t.auth.verifying : t.auth.login}
              </Button>
            </form>
          </TabsContent>

          {/* ===== Cliente (email + contraseña) ===== */}
          <TabsContent value="cliente" className="mt-4">
            <form onSubmit={handleClientSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="dlg-client-email">Email</Label>
                <Input
                  id="dlg-client-email"
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="tu@email.com"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dlg-client-pass">Contraseña</Label>
                <Input
                  id="dlg-client-pass"
                  type="password"
                  value={clientPass}
                  onChange={(e) => setClientPass(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={clientLoading}>
                {clientLoading ? (
                  <CircleNotch size={18} className="mr-2 animate-spin" />
                ) : (
                  <SignIn size={18} className="mr-2" />
                )}
                {clientLoading ? t.auth.verifying : t.auth.login}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Acceso para clientes. ¿No tenés usuario? Pedilo a tu contacto comercial.
              </p>
            </form>
          </TabsContent>

          {/* ===== Partner ===== */}
          <TabsContent value="partner" className="mt-4">
            <form onSubmit={handlePartnerSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="dlg-partner-email">Email</Label>
                <Input
                  id="dlg-partner-email"
                  type="email"
                  value={partnerEmail}
                  onChange={(e) => setPartnerEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dlg-partner-pass">Contraseña</Label>
                <Input
                  id="dlg-partner-pass"
                  type="password"
                  value={partnerPass}
                  onChange={(e) => setPartnerPass(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={partnerLoading}>
                {partnerLoading ? (
                  <CircleNotch size={18} className="mr-2 animate-spin" />
                ) : (
                  <SignIn size={18} className="mr-2" />
                )}
                {partnerLoading ? t.auth.verifying : t.auth.login}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Acceso para depósitos y transportes.
              </p>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
