import { CircleNotch } from '@phosphor-icons/react'
import { useBrand } from '@/lib/brand'

// Splash neutral mientras verifySession() restaura la sesión: reemplaza al
// formulario de login viejo (que se renderizaba durante el fetch) para que, con
// una sesión válida, NO parpadee el login antes de entrar al dashboard.
// Usa el MISMO gradiente de marca que <Login/> → transición sin saltos.
export default function SessionRestoreScreen() {
  const brand = useBrand()
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary via-primary/95 to-secondary flex flex-col items-center justify-center gap-6 p-4">
      <img
        src={brand.logo.white}
        alt={brand.displayName}
        className="h-12 w-auto opacity-95"
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
      />
      <div className="flex items-center gap-2 text-white/90">
        <CircleNotch size={22} className="animate-spin" weight="bold" />
        <span className="text-sm font-medium">Ingresando…</span>
      </div>
    </div>
  )
}
