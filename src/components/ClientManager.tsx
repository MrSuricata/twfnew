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
  UserPlus,
  PencilSimple,
  Trash
} from '@phosphor-icons/react'
import { ClientAccount } from '@/lib/quotationTypes'
import { toast } from 'sonner'
import { ParsedShipment } from '@/lib/shipmentTypes'

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

  const getMatchCount = (pattern: string) => {
    if (!pattern) return 0
    return shipments.filter(s => s.CLIENTE.toUpperCase().includes(pattern.toUpperCase())).length
  }

  const openNew = () => {
    setForm(EMPTY_FORM)
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

  const handleSave = () => {
    if (!form.email || !form.name || !form.clientePattern) {
      toast.error('Email, nombre y patrón son obligatorios')
      return
    }

    const emailExists = clients.some(c => c.email.toLowerCase() === form.email.toLowerCase() && c.id !== editingId)
    if (emailExists) {
      toast.error('Ya existe un cliente con ese email')
      return
    }

    let updated: ClientAccount[]

    if (editingId) {
      updated = clients.map(c => {
        if (c.id !== editingId) return c
        return {
          ...c,
          email: form.email,
          name: form.name,
          company: form.company,
          clientePattern: form.clientePattern
        }
      })

      toast.success('Cliente actualizado')
    } else {
      const newClient: ClientAccount = {
        id: `${Date.now()}`,
        email: form.email,
        name: form.name,
        company: form.company,
        clientePattern: form.clientePattern,
        createdAt: Date.now()
      }
      updated = [...clients, newClient]
      toast.success('Cliente creado — el cliente ingresará con código OTP por email')
    }

    onUpdateClients(updated)
    setShowDialog(false)
    setForm(EMPTY_FORM)
    setEditingId(null)
  }

  const handleDelete = (id: string) => {
    const client = clients.find(c => c.id === id)
    if (!client) return
    if (!window.confirm(`¿Eliminar cliente ${client.name}?`)) return

    onUpdateClients(clients.filter(c => c.id !== id))
    toast.success('Cliente eliminado')
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
                    <Button variant="ghost" size="icon" onClick={() => openEdit(client)} title="Editar">
                      <PencilSimple size={18} />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(client.id)} title="Eliminar" className="text-red-500 hover:text-red-600 hover:bg-red-50">
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
                placeholder="PERETTI"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                El cliente verá todas las cargas donde el nombre del cliente contenga este texto.
                {form.clientePattern && (
                  <span className="ml-1 font-medium text-accent">
                    ({getMatchCount(form.clientePattern)} cargas coinciden ahora)
                  </span>
                )}
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90">
                {editingId ? 'Guardar' : 'Crear Cliente'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
