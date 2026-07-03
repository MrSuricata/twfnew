import { useState, useEffect, useRef, useCallback } from 'react'
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
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp'
import {
  LockKey,
  ShieldCheck,
  Users,
  Package,
  Handshake,
  EnvelopeSimple,
  CircleNotch,
  ArrowCounterClockwise,
  CaretLeft,
  SignIn,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { loginAdmin, requestOTP, verifyOTPServer, loginPartner } from '@/lib/authClient'
import { useTranslation, getStoredLanguage } from '@/lib/i18n'

// ─── Diálogo de acceso unificado para la landing ──────────────────────────
// Un solo botón "Ingresar" que abre este diálogo, con 3 pestañas: Equipo,
// Cliente y Partner. Cada pestaña reusa EXACTAMENTE la lógica de submit de su
// pantalla dedicada (loginAdmin / requestOTP+verifyOTPServer / loginPartner de
// authClient). Al éxito, esas funciones ya persisten el token en sessionStorage
// vía setAuth(); acá redirigimos con window.location a la ruta correspondiente
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

  // ── Cliente (OTP en 2 pasos) ──
  const [clientStep, setClientStep] = useState<'email' | 'otp'>('email')
  const [clientEmail, setClientEmail] = useState('')
  const [otpValue, setOtpValue] = useState('')
  const [clientLoading, setClientLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)

  // ── Partner ──
  const [partnerEmail, setPartnerEmail] = useState('')
  const [partnerPass, setPartnerPass] = useState('')
  const [partnerLoading, setPartnerLoading] = useState(false)

  // Reset de estado al cerrar (no dejar credenciales ni pasos a medio camino).
  useEffect(() => {
    if (!open) {
      setTab('equipo')
      setAdminUser(''); setAdminPass(''); setAdminLoading(false)
      setClientStep('email'); setClientEmail(''); setOtpValue(''); setClientLoading(false); setCountdown(0)
      setPartnerEmail(''); setPartnerPass(''); setPartnerLoading(false)
    }
  }, [open])

  // Countdown de reenvío de OTP.
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [countdown])

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

  // ── Cliente paso 1: pedir OTP (mismo flujo que ClientLogin.tsx) ──
  const handleClientSendCode = useCallback(async (isResend = false) => {
    if (!clientEmail.trim()) {
      toast.error(t.auth.enterEmail)
      return
    }
    if (isResend && countdown > 0) {
      toast.error(t.auth.waitCountdown.replace('{s}', String(countdown)))
      return
    }
    setClientLoading(true)
    try {
      const result = await requestOTP(clientEmail.trim())
      if (result.success) {
        setClientStep('otp')
        setOtpValue('')
        setCountdown(60)
        toast.success(isResend ? t.auth.newCodeSent : t.auth.codeSent.replace('{email}', clientEmail))
      } else {
        toast.error(result.error || t.auth.otpSendError)
      }
    } catch {
      toast.error(t.auth.otpProcessError)
    } finally {
      setClientLoading(false)
    }
  }, [clientEmail, countdown, t])

  // ── Cliente paso 2: verificar OTP ──
  const handleClientVerify = useCallback(async (code: string) => {
    if (code.length !== 6) return
    setClientLoading(true)
    try {
      const result = await verifyOTPServer(clientEmail.toLowerCase().trim(), code)
      if (result.success) {
        const name = result.clientData?.name || ''
        toast.success(`${t.auth.welcome}${name ? `, ${name}` : ''}`)
        // Token ya persistido → /portal restaura la sesión.
        window.location.assign('/portal')
      } else {
        toast.error(result.error || t.auth.otpIncorrect)
        setOtpValue('')
        setClientLoading(false)
      }
    } catch {
      toast.error(t.auth.otpVerifyError)
      setOtpValue('')
      setClientLoading(false)
    }
  }, [clientEmail, t])

  const handleOtpChange = useCallback((value: string) => {
    setOtpValue(value)
    if (value.length === 6) handleClientVerify(value)
  }, [handleClientVerify])

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

          {/* ===== Cliente (OTP) ===== */}
          <TabsContent value="cliente" className="mt-4">
            {clientStep === 'email' ? (
              <form
                onSubmit={(e) => { e.preventDefault(); handleClientSendCode(false) }}
                className="space-y-4"
              >
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
                <Button type="submit" className="w-full" disabled={clientLoading}>
                  {clientLoading ? (
                    <CircleNotch size={18} className="mr-2 animate-spin" />
                  ) : (
                    <EnvelopeSimple size={18} className="mr-2" />
                  )}
                  {clientLoading ? t.auth.sending : 'Enviar código de acceso'}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Te enviamos un código de 6 dígitos si tu correo está autorizado.
                </p>
              </form>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  Ingresá el código enviado a{' '}
                  <span className="font-medium text-foreground">{clientEmail}</span>
                </p>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={otpValue}
                    onChange={handleOtpChange}
                    disabled={clientLoading}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} className="h-11 w-10 text-lg" />
                      <InputOTPSlot index={1} className="h-11 w-10 text-lg" />
                      <InputOTPSlot index={2} className="h-11 w-10 text-lg" />
                    </InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup>
                      <InputOTPSlot index={3} className="h-11 w-10 text-lg" />
                      <InputOTPSlot index={4} className="h-11 w-10 text-lg" />
                      <InputOTPSlot index={5} className="h-11 w-10 text-lg" />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button
                  onClick={() => handleClientVerify(otpValue)}
                  className="w-full"
                  disabled={clientLoading || otpValue.length !== 6}
                >
                  {clientLoading ? (
                    <CircleNotch size={18} className="mr-2 animate-spin" />
                  ) : (
                    <ShieldCheck size={18} className="mr-2" />
                  )}
                  {clientLoading ? t.auth.verifying : 'Verificar'}
                </Button>
                <div className="flex items-center justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setClientStep('email'); setOtpValue('') }}
                    className="text-muted-foreground"
                  >
                    <CaretLeft size={15} className="mr-1" /> Cambiar email
                  </Button>
                  {countdown > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      Reenviar en <span className="font-mono font-semibold text-foreground">{countdown}s</span>
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleClientSendCode(true)}
                      disabled={clientLoading}
                    >
                      <ArrowCounterClockwise size={15} className="mr-1" /> Reenviar código
                    </Button>
                  )}
                </div>
              </div>
            )}
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
