import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  UsersThree,
  Plus,
  Key,
  Trash,
  Prohibit,
  CheckCircle,
  ClockCounterClockwise,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { authFetch } from '@/lib/authClient'

// ─── Equipo: usuarios individuales del admin + log de actividad ──────
// Solo visible/usable por el OWNER (Brian). Los usuarios creados acá entran
// por el mismo login de siempre con su email + contraseña, y TODO lo que
// hagan (editar, facturar, archivar, eliminar) queda registrado con su nombre.

interface AdminUser {
  id: string
  email: string
  name: string
  level: string
  active: boolean
  created_at: string | null
  last_login: string | null
}

interface AuditEntry {
  id: number
  ts: string
  usuario: string
  action: string
  entity: string
  ref: string
  details: Record<string, unknown> | null
}

export default function TeamManager() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [log, setLog] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [fName, setFName] = useState('')
  const [fEmail, setFEmail] = useState('')
  const [fPassword, setFPassword] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [uRes, lRes] = await Promise.all([
        authFetch('/api/data/admin-users'),
        authFetch('/api/data/audit-log'),
      ])
      if (uRes.ok) setUsers((await uRes.json()).users || [])
      if (lRes.ok) setLog((await lRes.json()).log || [])
    } catch {
      toast.error('No se pudo cargar el equipo')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setFName(''); setFEmail(''); setFPassword(''); setDialogOpen(true) }
  const openEdit = (u: AdminUser) => { setEditing(u); setFName(u.name); setFEmail(u.email); setFPassword(''); setDialogOpen(true) }

  const save = async () => {
    if (!fName.trim() || !fEmail.trim()) { toast.error('Nombre y email son obligatorios'); return }
    if (!editing && fPassword.length < 8) { toast.error('La contraseña necesita al menos 8 caracteres'); return }
    if (editing && fPassword && fPassword.length < 8) { toast.error('La contraseña nueva necesita al menos 8 caracteres'); return }
    try {
      const res = await authFetch('/api/data/admin-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editing ? { id: editing.id } : {}),
          email: fEmail.trim(),
          name: fName.trim(),
          ...(fPassword ? { password: fPassword } : {}),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      toast.success(editing ? 'Usuario actualizado' : `Usuario ${fEmail.trim()} creado — pasale el email y la contraseña`)
      setDialogOpen(false)
      load()
    } catch (e: any) {
      toast.error(e?.message || 'Error al guardar')
    }
  }

  const toggleActive = async (u: AdminUser) => {
    try {
      const res = await authFetch(`/api/data/admin-users?id=${encodeURIComponent(u.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !u.active }),
      })
      if (!res.ok) throw new Error()
      toast.success(u.active ? `${u.name} desactivado (no puede entrar)` : `${u.name} activado`)
      load()
    } catch { toast.error('No se pudo cambiar el estado') }
  }

  const removeUser = async (u: AdminUser) => {
    if (!window.confirm(`¿Eliminar el usuario ${u.name} (${u.email})? Su actividad pasada queda en el registro.`)) return
    try {
      const res = await authFetch(`/api/data/admin-users?id=${encodeURIComponent(u.id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success(`Usuario ${u.email} eliminado`)
      load()
    } catch { toast.error('No se pudo eliminar') }
  }

  return (
    <div className="space-y-6">
      {/* ── Usuarios ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <UsersThree size={24} weight="fill" className="text-primary" />
            Equipo
          </h2>
          <p className="text-sm text-muted-foreground">
            Usuarios del admin con login propio — todo lo que hacen queda registrado con su nombre.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5"><Plus size={16} weight="bold" /> Nuevo usuario</Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Cargando…</div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Todavía no hay usuarios. Creá uno para cada persona del equipo (Mediterránea) — entran por el mismo login con su email.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Nombre</th>
                  <th className="text-left px-3 py-2">Email (login)</th>
                  <th className="text-left px-3 py-2">Estado</th>
                  <th className="text-left px-3 py-2">Último acceso</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map(u => (
                  <tr key={u.id} className={`hover:bg-muted/30 ${u.active ? '' : 'opacity-60'}`}>
                    <td className="px-3 py-2 font-medium">{u.name}</td>
                    <td className="px-3 py-2">{u.email}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={`text-[10px] ${u.active ? 'text-green-700 border-green-300' : 'text-muted-foreground'}`}>
                        {u.active ? 'Activo' : 'Desactivado'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{u.last_login ? fmtTs(u.last_login) : 'Nunca entró'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="sm" variant="outline" className="h-7" onClick={() => openEdit(u)} title="Editar / resetear contraseña">
                          <Key size={13} className="mr-1" /> Editar
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => toggleActive(u)} title={u.active ? 'Desactivar (no puede entrar)' : 'Reactivar'}>
                          {u.active ? <Prohibit size={14} /> : <CheckCircle size={14} className="text-green-600" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-muted-foreground hover:text-red-600" onClick={() => removeUser(u)} title="Eliminar usuario">
                          <Trash size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* ── Actividad ── */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <ClockCounterClockwise size={20} className="text-primary" />
          Actividad reciente
        </h3>
        <p className="text-xs text-muted-foreground">Quién hizo qué (últimas 300 acciones): ediciones, facturación, archivado, eliminados, usuarios.</p>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto max-h-[50vh] overflow-y-auto">
          {log.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Sin actividad registrada todavía — se va llenando a medida que el equipo trabaja.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-muted/40 uppercase text-muted-foreground sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">Cuándo</th>
                  <th className="text-left px-3 py-2">Quién</th>
                  <th className="text-left px-3 py-2">Acción</th>
                  <th className="text-left px-3 py-2">Ref</th>
                  <th className="text-left px-3 py-2">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {log.map(e => (
                  <tr key={e.id} className="hover:bg-muted/30">
                    <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{fmtTs(e.ts)}</td>
                    <td className="px-3 py-1.5 font-medium whitespace-nowrap">{e.usuario}</td>
                    <td className="px-3 py-1.5">
                      <Badge variant="outline" className="text-[10px]">{e.action}</Badge>
                    </td>
                    <td className="px-3 py-1.5 font-medium whitespace-nowrap">{e.ref}</td>
                    <td className="px-3 py-1.5 text-muted-foreground max-w-[320px] truncate" title={e.details ? JSON.stringify(e.details) : ''}>
                      {e.details ? Object.entries(e.details).map(([k, v]) => `${k}: ${v}`).join(' · ') : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* ── Crear / editar usuario ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? `Editar ${editing.name}` : 'Nuevo usuario del equipo'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Cambiá nombre/email, o poné una contraseña nueva para resetearla (dejala vacía para no tocarla).'
                : 'Entra por el mismo login de siempre con su email y esta contraseña.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tm-name">Nombre</Label>
              <Input id="tm-name" value={fName} onChange={e => setFName(e.target.value)} placeholder="Martín Colombo" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tm-email">Email (usuario de login)</Label>
              <Input id="tm-email" type="email" value={fEmail} onChange={e => setFEmail(e.target.value)} placeholder="martin@mediterraneacarghas.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tm-pass">{editing ? 'Contraseña nueva (opcional)' : 'Contraseña (mínimo 8)'}</Label>
              <Input id="tm-pass" type="text" value={fPassword} onChange={e => setFPassword(e.target.value)} placeholder="mínimo 8 caracteres" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save}><CheckCircle size={15} className="mr-1.5" weight="fill" />{editing ? 'Guardar' : 'Crear usuario'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function fmtTs(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('es-UY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
