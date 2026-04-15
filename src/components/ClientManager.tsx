import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  UserPlus,
  PencilSimple,
  Trash,
  UserCircle,
  CircleNotch
} from '@phosphor-icons/react'
import { ClientAccount } from '@/lib/quotationTypes'
import { toast } from 'sonner'
import { ParsedShipment } from '@/lib/shipmentTypes'
import { impersonateClient } from '@/lib/dataClient'
import { getMatchCount as computeMatchCount } from '@/lib/clientMatching'

interface ClientManagerProps {
  clients: ClientAccount[]
  onUpdateClients: (clients: ClientAccount[]) => void
  shipments?: ParsedShipment[]
}

interface ClientForm {
  email: string
  name: string
  company: string
  clientePattern: string
}

const EMPTY_FORM: ClientForm = {
  email: '',
  name: '',
  company: '',
  clientePattern: ''
}

export default function ClientManager({ clients, onUpdateClients, shipments = [] }: ClientManagerProps) {
  const [showDialog, setShowDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ClientForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null)
  const clientToDelete = clients.find(c => c.id === deleteId)

  const getMatchCount = (pattern: string) => computeMatchCount(shipments, pattern)

  const openNew = () => {
    setForm(EMPTY_FORM)
    setFormError(null)
    setEditingId(null)
    setShowDialog(true)
  }

  const openEdit = (client: ClientAccount) => {
    setForm({
      email: client.email,
      name: client.name,
      company: client.company,
      clientePattern: client.clientePattern
    })
    setEditingId(client.id)
    setShowDialog(true)
  }

  const handleSave = async () => {
    setFormError(null)

    const email = form.email.trim()
    const name = form.name.trim()
    const company = form.company.trim()
    const clientePattern = form.clientePattern.trim()

    if (!email || !name || !clientePattern) {
      setFormError('Email, nombre y patrón son obligatorios')
      return
    }

    const emailExists = clients.some(c => c.email.trim().toLowerCase() === email.toLowerCase() && c.id !== editingId)
    if (emailExists) {
      setFormError(`Ya existe un cliente con el email "${email}"`)
      return
    }

    setIsSaving(true)
    try {
      let updated: ClientAccount[]

      if (editingId) {
        updated = clients.map(c => {
          if (c.id !== editingId) return c
          return {
            ...c,
            email,
            name,
            company,
            clientePattern
          }
        })

        toast.success('Cliente actualizado')
      } else {
        const newClient: ClientAccount = {
          id: `${Date.now()}`,
          email,
          name,
          company,
          clientePattern,
          createdAt: Date.now()
        }
        updated = [...clients, newClient]
        toast.success('Cliente creado — el cliente ingresará con código OTP por email')
      }

      await onUpdateClients(updated)
      setShowDialog(false)
      setForm(EMPTY_FORM)
      setEditingId(null)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    const client = clients.find(c => c.id === id)
    if (!client) return

    setIsDeleting(true)
    try {
      await onUpdateClients(clients.filter(c => c.id !== id))
      toast.success('Cliente eliminado')
      setDeleteId(null)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleImpersonate = async (client: ClientAccount) => {
    setImpersonatingId(client.id)
    try {
      const result = await impersonateClient(client.email)
      toast.info('Iniciando sesión como ' + client.name)
      // Persist the client token so session restore picks it up on /portal.
      // Full page nav reinitializes the auth module, which reads this key.
      try { sessionStorage.setItem('twf-token', result.token) } catch {}
      // Small delay so the toast is visible before the redirect.
      setTimeout(() => { window.location.href = '/portal' }, 300)
    } catch (err: any) {
      console.error('[impersonate] error:', err)
      toast.error(err?.message || 'No se pudo iniciar sesión como este cliente')
      setImpersonatingId(null)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Gestión de Clientes</h2>
          <p className="text-sm text-muted-foreground">{clients.length} clientes registrados</p>
        </div>
        <Button onClick={openNew} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <UserPlus size={20} className="mr-2" />
          Agregar Cliente
        </Button>
      </div>

      {clients.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <UserPlus size={48} className="mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No hay clientes</h3>
            <p className="text-muted-foreground mb-4">Crea el primer cliente para que pueda acceder al portal</p>
            <Button onClick={openNew} className="bg-accent text-accent-foreground hover:bg-accent/90">
              <UserPlus size={20} className="mr-2" />
              Agregar Cliente
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {clients.map(client => (
            <Card key={client.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold truncate">{client.name}</h3>
                      <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full font-medium shrink-0">
                        {getMatchCount(client.clientePattern)} cargas
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span>{client.email}</span>
                      <span>{client.company}</span>
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                        Patrón: {client.clientePattern}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0 ml-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleImpersonate(client)}
                      title="Ver portal como este cliente"
                      disabled={impersonatingId === client.id}
                    >
                      {impersonatingId === client.id
                        ? <CircleNotch size={18} className="animate-spin" />
                        : <UserCircle size={18} />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(client)} title="Editar">
                      <PencilSimple size={18} />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(client.id)} title="Eliminar" className="text-red-500 hover:text-red-600 hover:bg-red-50">
                      <Trash size={18} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="client-name">Nombre</Label>
                <Input
                  id="client-name"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Juan Pérez"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="client-company">Empresa</Label>
                <Input
                  id="client-company"
                  value={form.company}
                  onChange={e => setForm({ ...form, company: e.target.value })}
                  placeholder="Empresa SRL"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="client-email">Email</Label>
              <Input
                id="client-email"
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="cliente@email.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="client-pattern">Patrón de Cliente</Label>
              <Input
                id="client-pattern"
                value={form.clientePattern}
                onChange={e => setForm({ ...form, clientePattern: e.target.value })}
                placeholder="PERETTI o PERETTI,ACME,MARTINEZ"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Usá comas para múltiples razones sociales. Ej: <span className="font-mono">CHIAPERO,MARTINEZ</span>
                {form.clientePattern && (
                  <span className="ml-1 font-medium text-accent">
                    ({getMatchCount(form.clientePattern)} cargas coinciden ahora)
                  </span>
                )}
              </p>
            </div>

            {formError && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {formError}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowDialog(false)} disabled={isSaving}>
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
              >
                {isSaving ? (
                  <><CircleNotch size={16} className="animate-spin" /> Guardando...</>
                ) : (
                  editingId ? 'Guardar' : 'Crear Cliente'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open && !isDeleting) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará a {clientToDelete?.name} ({clientToDelete?.email}) permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (deleteId) handleDelete(deleteId)
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
            >
              {isDeleting ? (
                <><CircleNotch size={16} className="animate-spin" /> Eliminando...</>
              ) : (
                'Eliminar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
