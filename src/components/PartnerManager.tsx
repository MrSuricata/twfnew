import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { UserPlus, Trash, PencilSimple, Warehouse, Truck, ShieldCheck } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { authFetch } from '@/lib/authClient'

interface PartnerUser {
  id: string
  email: string
  name: string
  role: 'depot' | 'transport'
  filterValue: string
  active: boolean
  createdAt?: number
}

interface PartnerForm {
  email: string
  name: string
  role: 'depot' | 'transport'
  filterValue: string
  password: string
}

const EMPTY_FORM: PartnerForm = {
  email: '',
  name: '',
  role: 'depot',
  filterValue: '',
  password: '',
}

export default function PartnerManager() {
  const [users, setUsers] = useState<PartnerUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PartnerForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const fetchUsers = useCallback(async () => {
    try {
      const res = await authFetch('/api/data/partner-users')
      if (!res.ok) throw new Error('Error al cargar partners')
      const data = await res.json()
      setUsers(data.users || data || [])
    } catch (err) {
      toast.error('No se pudieron cargar los partners')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const openNew = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowDialog(true)
  }

  const openEdit = (user: PartnerUser) => {
    setForm({
      email: user.email,
      name: user.name,
      role: user.role,
      filterValue: user.filterValue,
      password: '',
    })
    setEditingId(user.id)
    setShowDialog(true)
  }

  const handleSave = async () => {
    if (!form.email || !form.name || !form.filterValue) {
      toast.error('Email, nombre y valor de filtro son obligatorios')
      return
    }

    if (!editingId && !form.password) {
      toast.error('La contraseña es obligatoria para nuevos usuarios')
      return
    }

    setSaving(true)

    try {
      const method = editingId ? 'PUT' : 'POST'
      const body: Record<string, any> = {
        email: form.email,
        name: form.name,
        role: form.role,
        filterValue: form.filterValue,
      }
      if (editingId) body.id = editingId
      if (form.password) body.password = form.password

      const res = await authFetch('/api/data/partner-users', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al guardar')
      }

      toast.success(editingId ? 'Partner actualizado' : 'Partner creado')
      setShowDialog(false)
      setForm(EMPTY_FORM)
      setEditingId(null)
      fetchUsers()
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar partner')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (user: PartnerUser) => {
    if (!window.confirm(`¿Eliminar partner ${user.name}?`)) return

    try {
      const res = await authFetch(`/api/data/partner-users?id=${user.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Error al eliminar')

      toast.success('Partner eliminado')
      fetchUsers()
    } catch {
      toast.error('Error al eliminar partner')
    }
  }

  const handleToggleActive = async (user: PartnerUser) => {
    try {
      const res = await authFetch('/api/data/partner-users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, active: !user.active }),
      })

      if (!res.ok) throw new Error('Error al actualizar')

      toast.success(user.active ? 'Partner desactivado' : 'Partner activado')
      fetchUsers()
    } catch {
      toast.error('Error al cambiar estado')
    }
  }

  const RoleIcon = ({ role }: { role: string }) =>
    role === 'depot'
      ? <Warehouse size={16} weight="duotone" className="text-blue-600" />
      : <Truck size={16} weight="duotone" className="text-orange-600" />

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck size={24} weight="duotone" />
            Gestión de Partners
          </h2>
          <p className="text-sm text-muted-foreground">
            {users.length} usuarios partner registrados (depósitos y transportes)
          </p>
        </div>
        <Button onClick={openNew} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <UserPlus size={20} className="mr-2" />
          Agregar Partner
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="pt-12 pb-12 text-center text-muted-foreground">
            Cargando partners...
          </CardContent>
        </Card>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <UserPlus size={48} className="mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No hay partners</h3>
            <p className="text-muted-foreground mb-4">
              Crea el primer usuario partner para depósitos o transportes
            </p>
            <Button onClick={openNew} className="bg-accent text-accent-foreground hover:bg-accent/90">
              <UserPlus size={20} className="mr-2" />
              Agregar Partner
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Filtro</TableHead>
                    <TableHead className="text-center">Activo</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(user => (
                    <TableRow key={user.id}>
                      <TableCell className="font-mono text-sm">{user.email}</TableCell>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          <RoleIcon role={user.role} />
                          {user.role === 'depot' ? 'Depósito' : 'Transporte'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {user.filterValue}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={user.active}
                          onCheckedChange={() => handleToggleActive(user)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(user)}>
                            <PencilSimple size={16} />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(user)} className="text-destructive hover:text-destructive">
                            <Trash size={16} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Editar Partner' : 'Nuevo Partner'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="partner-email">Email</Label>
              <Input
                id="partner-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="usuario@empresa.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="partner-name">Nombre</Label>
              <Input
                id="partner-name"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nombre completo"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select
                value={form.role}
                onValueChange={(val: 'depot' | 'transport') => setForm(f => ({ ...f, role: val }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="depot">
                    <span className="flex items-center gap-2">
                      <Warehouse size={16} weight="duotone" />
                      Depósito
                    </span>
                  </SelectItem>
                  <SelectItem value="transport">
                    <span className="flex items-center gap-2">
                      <Truck size={16} weight="duotone" />
                      Transporte
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="partner-filter">
                {form.role === 'depot' ? 'Nombre del Depósito' : 'Nombre del Transporte'}
              </Label>
              <Input
                id="partner-filter"
                value={form.filterValue}
                onChange={(e) => setForm(f => ({ ...f, filterValue: e.target.value }))}
                placeholder={form.role === 'depot' ? 'Ej: GODILCO, PLANIR, TCP' : 'Ej: RAFAELA, MARE, TRANSCAL'}
                required
              />
              <p className="text-xs text-muted-foreground">
                Se usará para filtrar las cargas visibles a este partner
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="partner-password">
                Contraseña{editingId ? ' (dejar vacío para no cambiar)' : ''}
              </Label>
              <Input
                id="partner-password"
                type="password"
                value={form.password}
                onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder={editingId ? '••••••••' : 'Contraseña'}
                required={!editingId}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
