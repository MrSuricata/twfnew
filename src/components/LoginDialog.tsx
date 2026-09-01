import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Users, Package, Handshake, CaretRight } from '@phosphor-icons/react'

// ─── Elección de acceso desde la landing ──────────────────────────────────
// Cada tipo de acceso YA tiene su pantalla completa (Login / ClientLogin /
// PartnerLogin, las tres sobre MarcoLogin, con el panel de marca y el pitch
// que le corresponde a cada uno). Este diálogo elige la puerta y manda ahí;
// no vuelve a pedir usuario y contraseña, porque hacerlo dejaba a clientes y
// partners entrando por un formulario chico mientras su pantalla quedaba sin
// usar.
// ──────────────────────────────────────────────────────────────────────────

interface LoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PUERTAS = [
  {
    ruta: '/admin',
    Icono: Users,
    titulo: 'Equipo',
    bajada: 'Cargas, agenda, facturación y pagos.',
  },
  {
    ruta: '/portal',
    Icono: Package,
    titulo: 'Cliente',
    bajada: 'Seguí tus embarques y sus documentos.',
  },
  {
    ruta: '/partner',
    Icono: Handshake,
    titulo: 'Partner',
    bajada: 'Depósitos y transportes: retiros y viajes.',
  },
] as const

export default function LoginDialog({ open, onOpenChange }: LoginDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ingresar</DialogTitle>
          <DialogDescription>Elegí tu tipo de acceso para continuar.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {PUERTAS.map(({ ruta, Icono, titulo, bajada }) => (
            <a
              key={ruta}
              href={ruta}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary hover:bg-muted/50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icono size={20} weight="duotone" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-sm">{titulo}</span>
                <span className="block text-xs text-muted-foreground">{bajada}</span>
              </span>
              <CaretRight
                size={16}
                weight="bold"
                className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
              />
            </a>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
