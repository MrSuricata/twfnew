import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp'
import { ArrowLeft, EnvelopeSimple, Package, ShieldCheck, ArrowCounterClockwise, CaretLeft } from '@phosphor-icons/react'
import { requestOTP, verifyOTPServer } from '@/lib/authClient'
import { toast } from 'sonner'

type LoginStep = 'email' | 'otp'

interface ClientLoginProps {
  onLogin: (email: string) => void
  onBack: () => void
}

export default function ClientLogin({ onLogin, onBack }: ClientLoginProps) {
  const [step, setStep] = useState<LoginStep>('email')
  const [email, setEmail] = useState('')
  const [otpValue, setOtpValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [clientName, setClientName] = useState('')

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [countdown])

  const handleSendCode = useCallback(async (isResend = false) => {
    if (!email.trim()) {
      toast.error('Ingresa tu email')
      return
    }

    // Cooldown check (client-side only for UX)
    if (isResend && countdown > 0) {
      toast.error(`Espera ${countdown}s para reenviar`)
      return
    }

    setIsLoading(true)

    try {
      const result = await requestOTP(email.trim())

      if (result.success) {
        setStep('otp')
        setOtpValue('')
        setCountdown(60)
        toast.success(isResend ? 'Nuevo codigo enviado' : `Codigo enviado a ${email}`)
      } else {
        toast.error(result.error || 'Error al enviar el codigo')
      }
    } catch {
      toast.error('Error al procesar la solicitud')
    } finally {
      setIsLoading(false)
    }
  }, [email, countdown])

  const handleVerifyOTP = useCallback(async (code: string) => {
    if (code.length !== 6) return

    setIsLoading(true)

    try {
      const result = await verifyOTPServer(email.toLowerCase().trim(), code)

      if (result.success) {
        const name = result.clientData?.name || ''
        setClientName(name)
        toast.success(`Bienvenido/a${name ? `, ${name}` : ''}`)
        onLogin(email.toLowerCase().trim())
      } else {
        toast.error(result.error || 'Codigo incorrecto')
        setOtpValue('')
      }
    } catch {
      toast.error('Error al verificar el codigo')
      setOtpValue('')
    } finally {
      setIsLoading(false)
    }
  }, [email, onLogin])

  const handleOTPChange = useCallback((value: string) => {
    setOtpValue(value)
    // Auto-submit when 6 digits entered
    if (value.length === 6) {
      handleVerifyOTP(value)
    }
  }, [handleVerifyOTP])

  const handleBackToEmail = useCallback(() => {
    setStep('email')
    setOtpValue('')
  }, [])

  const handleEmailSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    handleSendCode(false)
  }, [handleSendCode])

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
                {step === 'email' ? (
                  <Package size={48} className="text-accent" weight="duotone" />
                ) : (
                  <ShieldCheck size={48} className="text-accent" weight="duotone" />
                )}
              </div>
            </div>
            <CardTitle className="text-2xl">Portal de Cliente</CardTitle>
            <p className="text-muted-foreground">
              {step === 'email'
                ? 'Ingresa tu email para recibir un codigo de acceso'
                : (
                  <>
                    Ingresa el codigo de 6 digitos enviado a{' '}
                    <span className="font-medium text-foreground">{email}</span>
                  </>
                )
              }
            </p>
          </CardHeader>

          <CardContent>
            {step === 'email' ? (
              /* ===== STEP 1: EMAIL ===== */
              <form onSubmit={handleEmailSubmit} className="space-y-4">
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
                    autoFocus
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    'Enviando...'
                  ) : (
                    <>
                      <EnvelopeSimple size={20} className="mr-2" />
                      Enviar Codigo de Acceso
                    </>
                  )}
                </Button>

                <div className="mt-6 p-4 bg-muted rounded-lg text-sm text-muted-foreground">
                  <p className="font-medium mb-2">No tienes una cuenta?</p>
                  <p>Contacta a Transit World Forwarding para obtener acceso al portal de cliente.</p>
                </div>
              </form>
            ) : (
              /* ===== STEP 2: OTP CODE ===== */
              <div className="space-y-6">
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={otpValue}
                    onChange={handleOTPChange}
                    disabled={isLoading}
                    autoFocus
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} className="h-12 w-12 text-lg" />
                      <InputOTPSlot index={1} className="h-12 w-12 text-lg" />
                      <InputOTPSlot index={2} className="h-12 w-12 text-lg" />
                    </InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup>
                      <InputOTPSlot index={3} className="h-12 w-12 text-lg" />
                      <InputOTPSlot index={4} className="h-12 w-12 text-lg" />
                      <InputOTPSlot index={5} className="h-12 w-12 text-lg" />
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <Button
                  onClick={() => handleVerifyOTP(otpValue)}
                  className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                  disabled={isLoading || otpValue.length !== 6}
                >
                  {isLoading ? (
                    'Verificando...'
                  ) : (
                    <>
                      <ShieldCheck size={20} className="mr-2" />
                      Verificar
                    </>
                  )}
                </Button>

                {/* Resend section */}
                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    No recibiste el codigo?
                  </p>
                  {countdown > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Reenviar en <span className="font-mono font-semibold text-foreground">{countdown}s</span>
                    </p>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSendCode(true)}
                      disabled={isLoading}
                      className="text-accent hover:text-accent/80"
                    >
                      <ArrowCounterClockwise size={16} className="mr-1" />
                      Reenviar codigo
                    </Button>
                  )}
                </div>

                {/* Back to email */}
                <div className="text-center pt-2 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBackToEmail}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <CaretLeft size={16} className="mr-1" />
                    Cambiar email
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
