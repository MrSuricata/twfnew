import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  UserPlus,
  PencilSimple,
  Trash,
  UserCircle,
  CircleNotch,
  CaretDown,
  Key,
  Copy,
  ArrowsClockwise,
  MagnifyingGlass,
  UsersThree,
} from '@phosphor-icons/react'
import { ClientAccount, ClientPortalUser } from '@/lib/quotationTypes'
import { toast } from 'sonner'
import { ParsedShipment } from '@/lib/shipmentTypes'
import {
  impersonateClient,
  deleteClient,
  fetchClientUsers,
  createClientUser,
  patchClientUser,
  deleteClientUser,
} from '@/lib/dataClient'
import { getMatchCount as computeMatchCount } from '@/lib/clientMatching'
import { deriveClientePattern } from '@/lib/clientCatalog'

// ── Gestión del catálogo de clientes ─────────────────────────────────────
// Tabla real de clientes (datos legales + aliases) + accesos al portal por
// usuario (client_users, email+contraseña — reemplaza el OTP). El nombre es
// lo único obligatorio; el patrón de cargas se autocompleta desde
// nombre+aliases y solo se toca a mano en "Avanzado".

interface ClientManagerProps {
  clients: ClientAccount[]
  onUpdateClients: (clients: ClientAccount[]) => void
  shipments?: ParsedShipment[]
}

interface ClientForm {
  name: string
  razonSocial: string
  cuitDoc: string
  pais: string
  direccion: string
  email: string
  aliases: string
  clientePattern: string
}

const EMPTY_FORM: ClientForm = {
  name: '',
  razonSocial: '',
  cuitDoc: '',
  pais: '',
  direccion: '',
  email: '',
  aliases: '',
  clientePattern: '',
}

const PAISES_SUGERIDOS = ['AR', 'UY', 'BR', 'PY', 'CL', 'CN', 'US']

/** Contraseña legible de 12 chars (sin caracteres ambiguos 0/O/1/l/I). */
function genPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const arr = new Uint32Array(12)
  crypto.getRandomValues(arr)
  return Array.from(arr, n => alphabet[n % alphabet.length]).join('')
}

async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copiada al portapapeles`)
  } catch {
    toast.error('No se pudo copiar — copiala a mano')
  }
}

/** Patrón efectivo para contar cargas: el guardado o el derivado de nombre+aliases. */
function effectivePattern(c: Pick<ClientAccount, 'name' | 'aliases' | 'clientePattern'>): string {
  return (c.clientePattern || '').trim() || deriveClientePattern(c.name, c.aliases)
}

const fmtLastLogin = (iso?: string | null) => {
  if (!iso) return 'Nunca'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'Nunca'
  return d.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })
}

export default function ClientManager({ clients, onUpdateClients, shipments = [] }: ClientManagerProps) {
  // ── Alta / edición de cliente ──
  const [showDialog, setShowDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ClientForm>(EMPTY_FORM)
  const [patternTouched, setPatternTouched] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  // ── Eliminar ──
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  // ── Impersonate ──
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null)
  // ── Accesos al portal (client_users) ──
  const [users, setUsers] = useState<ClientPortalUser[]>([])
  const [usersLoaded, setUsersLoaded] = useState(false)
  const [accessClientId, setAccessClientId] = useState<string | null>(null)
  const [newUser, setNewUser] = useState({ email: '', name: '', password: '' })
  const [creatingUser, setCreatingUser] = useState(false)
  const [resetUserId, setResetUserId] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  // ── Búsqueda ──
  const [search, setSearch] = useState('')

  const clientToDelete = clients.find(c => c.id === deleteId)
  const accessClient = clients.find(c => c.id === accessClientId) || null

  const refreshUsers = useCallback(async () => {
    try {
      const list = await fetchClientUsers()
      setUsers(list)
      setUsersLoaded(true)
    } catch {
      // no bloquea el catálogo: la columna Accesos muestra "—"
      setUsersLoaded(true)
    }
  }, [])

  useEffect(() => { refreshUsers() }, [refreshUsers])

  const usersByClient = useMemo(() => {
    const m = new Map<string, ClientPortalUser[]>()
    for (const u of users) {
      const arr = m.get(u.clientId) || []
      arr.push(u)
      m.set(u.clientId, arr)
    }
    return m
  }, [users])

  const getMatchCount = (c: ClientAccount) => computeMatchCount(shipments, effectivePattern(c))

  const visibleClients = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = [...clients].sort((a, b) => a.name.localeCompare(b.name, 'es'))
    if (!q) return list
    return list.filter(c =>
      [c.name, c.razonSocial, c.cuitDoc, c.email, c.aliases, c.pais]
        .some(v => (v || '').toLowerCase().includes(q))
    )
  }, [clients, search])

  // ── Alta / edición ──

  const openNew = () => {
    setForm(EMPTY_FORM)
    setFormError(null)
    setEditingId(null)
    setPatternTouched(false)
    setAdvancedOpen(false)
    setShowDialog(true)
  }

  const openEdit = (client: ClientAccount) => {
    const derived = deriveClientePattern(client.name, client.aliases)
    setForm({
      name: client.name,
      razonSocial: client.razonSocial || '',
      cuitDoc: client.cuitDoc || '',
      pais: client.pais || '',
      direccion: client.direccion || '',
      email: client.email || '',
      aliases: client.aliases || '',
      clientePattern: client.clientePattern || '',
    })
    // Si el patrón guardado difiere del derivado, alguien lo tocó a mano →
    // no lo pisamos al editar nombre/aliases.
    setPatternTouched(!!(client.clientePattern || '').trim() && client.clientePattern.trim() !== derived)
    setFormError(null)
    setEditingId(client.id)
    setAdvancedOpen(false)
    setShowDialog(true)
  }

  /** Actualiza un campo del form; nombre/aliases re-derivan el patrón salvo que esté tocado a mano. */
  const setField = (key: keyof ClientForm, value: string) => {
    setForm(prev => {
      const next = { ...prev, [key]: value }
      if ((key === 'name' || key === 'aliases') && !patternTouched) {
        next.clientePattern = deriveClientePattern(next.name, next.aliases)
      }
      return next
    })
  }

  const handleSave = async () => {
    setFormError(null)

    const name = form.name.trim()
    const email = form.email.trim()
    const clientePattern = form.clientePattern.trim()

    if (!name) {
      setFormError('El nombre es obligatorio')
      return
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError('El email no tiene un formato válido')
      return
    }
    const nameExists = clients.some(c => c.name.trim().toLowerCase() === name.toLowerCase() && c.id !== editingId)
    if (nameExists) {
      setFormError(`Ya existe un cliente llamado "${name}"`)
      return
    }
    // Cada token del patrón (separado por coma) debe tener ≥4 caracteres — el
    // backend lo rechaza y el matcheo ignora los más cortos. Avisamos ANTES.
    const shortToken = clientePattern.split(',').map(t => t.trim()).find(t => t.length > 0 && t.length < 4)
    if (shortToken) {
      setFormError(`Cada cliente del patrón debe tener al menos 4 caracteres. "${shortToken}" tiene ${shortToken.length}.`)
      return
    }

    setIsSaving(true)
    try {
      const fields = {
        name,
        razonSocial: form.razonSocial.trim(),
        cuitDoc: form.cuitDoc.trim(),
        pais: form.pais.trim().toUpperCase(),
        direccion: form.direccion.trim(),
        email,
        aliases: form.aliases.split(',').map(a => a.trim()).filter(Boolean).join(', '),
        clientePattern,
      }
      let updated: ClientAccount[]
      if (editingId) {
        updated = clients.map(c => (c.id === editingId ? { ...c, ...fields, company: c.company || '' } : c))
      } else {
        updated = [...clients, { id: `client-${Date.now()}`, company: '', createdAt: Date.now(), ...fields }]
      }

      // Éxito y cierre DESPUÉS del guardado: si el backend rechaza cae al catch,
      // muestra el motivo y deja el formulario abierto.
      await onUpdateClients(updated)
      toast.success(editingId ? 'Cliente actualizado' : 'Cliente creado')
      setShowDialog(false)
      setForm(EMPTY_FORM)
      setEditingId(null)
    } catch (err) {
      setFormError((err as Error)?.message || 'No se pudo guardar el cliente')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    const client = clients.find(c => c.id === id)
    if (!client) return

    setIsDeleting(true)
    try {
      await deleteClient(id)
      await onUpdateClients(clients.filter(c => c.id !== id))
      toast.success('Cliente eliminado')
      setDeleteId(null)
      refreshUsers() // los accesos caen en cascada
    } catch (err: any) {
      toast.error(err?.message || 'Error al eliminar cliente')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleImpersonate = async (client: ClientAccount) => {
    setImpersonatingId(client.id)
    try {
      const result = await impersonateClient({ id: client.id })
      toast.info('Iniciando sesión como ' + client.name)
      // Persist the client token so session restore picks it up on /portal.
      // Full page nav reinitializes the auth module, which reads this key.
      try { sessionStorage.setItem('twf-token', result.token) } catch { /* ignore */ }
      // Small delay so the toast is visible before the redirect.
      setTimeout(() => { window.location.href = '/portal' }, 300)
    } catch (err: any) {
      console.error('[impersonate] error:', err)
      toast.error(err?.message || 'No se pudo iniciar sesión como este cliente')
      setImpersonatingId(null)
    }
  }

  // ── Accesos al portal ──

  const openAccess = (client: ClientAccount) => {
    setAccessClientId(client.id)
    setNewUser({ email: '', name: '', password: genPassword() })
    setResetUserId(null)
    setResetPassword('')
  }

  const handleCreateUser = async () => {
    if (!accessClient) return
    const email = newUser.email.trim()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Ingresá un email válido para el acceso')
      return
    }
    if (newUser.password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres')
      return
    }
    setCreatingUser(true)
    try {
      await createClientUser({
        clientId: accessClient.id,
        email,
        name: newUser.name.trim() || undefined,
        password: newUser.password,
      })
      toast.success(`Acceso creado para ${email} — pasale la contraseña por otro canal`)
      setNewUser({ email: '', name: '', password: genPassword() })
      refreshUsers()
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo crear el acceso')
    } finally {
      setCreatingUser(false)
    }
  }

  const handleToggleUser = async (user: ClientPortalUser) => {
    try {
      await patchClientUser(user.id, { active: !user.active })
      toast.success(user.active ? 'Acceso desactivado' : 'Acceso activado')
      refreshUsers()
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo cambiar el estado')
    }
  }

  const handleResetPassword = async (user: ClientPortalUser) => {
    if (resetPassword.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres')
      return
    }
    setResetBusy(true)
    try {
      await patchClientUser(user.id, { password: resetPassword })
      toast.success(`Contraseña de ${user.email} actualizada — pasásela por otro canal`)
      setResetUserId(null)
      setResetPassword('')
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo resetear la contraseña')
    } finally {
      setResetBusy(false)
    }
  }

  const handleDeleteUser = async (user: ClientPortalUser) => {
    try {
      await deleteClientUser(user.id)
      toast.success(`Acceso de ${user.email} eliminado`)
      refreshUsers()
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo eliminar el acceso')
    }
  }

  const accessUsers = accessClient ? (usersByClient.get(accessClient.id) || []) : []

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Clientes</h2>
          <p className="text-sm text-muted-foreground">
            {clients.length} clientes en el catálogo · {users.filter(u => u.active).length} accesos al portal activos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <MagnifyingGlass size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cliente…"
              className="pl-8 h-9 w-56"
            />
          </div>
          <Button onClick={openNew} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <UserPlus size={20} className="mr-2" />
            Nuevo cliente
          </Button>
        </div>
      </div>

      {clients.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <UserPlus size={48} className="mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No hay clientes</h3>
            <p className="text-muted-foreground mb-4">Creá el primer cliente del catálogo</p>
            <Button onClick={openNew} className="bg-accent text-accent-foreground hover:bg-accent/90">
              <UserPlus size={20} className="mr-2" />
              Nuevo cliente
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
                    <TableHead>Cliente</TableHead>
                    <TableHead>CUIT / Doc</TableHead>
                    <TableHead>País</TableHead>
                    <TableHead className="text-center">Cargas</TableHead>
                    <TableHead className="text-center">Accesos</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleClients.map(client => {
                    const clientUsers = usersByClient.get(client.id) || []
                    const activos = clientUsers.filter(u => u.active).length
                    return (
                      <TableRow key={client.id}>
                        <TableCell>
                          <div className="font-medium">{client.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {[client.razonSocial, client.email].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{client.cuitDoc || '—'}</TableCell>
                        <TableCell className="text-sm">{client.pais || '—'}</TableCell>
                        <TableCell className="text-center">
                          <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full font-medium">
                            {getMatchCount(client)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <button
                            type="button"
                            onClick={() => openAccess(client)}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors hover:border-primary hover:text-primary ${
                              activos > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'text-muted-foreground border-dashed'
                            }`}
                            title="Gestionar accesos al portal"
                          >
                            <Key size={12} />
                            {usersLoaded ? (activos > 0 ? `${activos} activo${activos > 1 ? 's' : ''}` : 'Sin acceso') : '…'}
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          <TooltipProvider delayDuration={200}>
                            <div className="flex justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleImpersonate(client)}
                                    disabled={impersonatingId === client.id}
                                  >
                                    {impersonatingId === client.id
                                      ? <CircleNotch size={18} className="animate-spin" />
                                      : <UserCircle size={18} />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">Entrar como este cliente</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={() => openEdit(client)}>
                                    <PencilSimple size={18} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">Editar cliente</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={() => setDeleteId(client.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                                    <Trash size={18} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">Eliminar cliente</TooltipContent>
                              </Tooltip>
                            </div>
                          </TooltipProvider>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            {visibleClients.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Ningún cliente coincide con “{search}”.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Alta / edición de cliente ── */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
            <DialogDescription>
              Solo el nombre es obligatorio — el resto lo podés completar cuando lo tengas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="client-name">Nombre <span className="text-red-600">*</span></Label>
              <Input
                id="client-name"
                value={form.name}
                onChange={e => setField('name', e.target.value)}
                placeholder="BALSAMO S.A"
              />
              <p className="text-xs text-muted-foreground">Como figura en las cargas — es el nombre canónico.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="client-razon">Razón social</Label>
                <Input
                  id="client-razon"
                  value={form.razonSocial}
                  onChange={e => setField('razonSocial', e.target.value)}
                  placeholder="Bálsamo Sociedad Anónima"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="client-cuit">CUIT / RUT / Doc</Label>
                <Input
                  id="client-cuit"
                  value={form.cuitDoc}
                  onChange={e => setField('cuitDoc', e.target.value)}
                  placeholder="30-12345678-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="client-pais">País</Label>
                <Input
                  id="client-pais"
                  list="client-pais-list"
                  value={form.pais}
                  onChange={e => setField('pais', e.target.value)}
                  placeholder="AR, UY…"
                />
                <datalist id="client-pais-list">
                  {PAISES_SUGERIDOS.map(p => <option key={p} value={p} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="client-email">Email de contacto</Label>
                <Input
                  id="client-email"
                  type="email"
                  value={form.email}
                  onChange={e => setField('email', e.target.value)}
                  placeholder="cliente@email.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="client-direccion">Dirección</Label>
              <Input
                id="client-direccion"
                value={form.direccion}
                onChange={e => setField('direccion', e.target.value)}
                placeholder="Calle 123, Córdoba, Argentina"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="client-aliases">Aliases</Label>
              <Input
                id="client-aliases"
                value={form.aliases}
                onChange={e => setField('aliases', e.target.value)}
                placeholder="BALSAMO, BALSAMO SA"
              />
              <p className="text-xs text-muted-foreground">
                Otras formas en que aparece escrito en las cargas, separadas por coma.
              </p>
            </div>

            {/* Avanzado: patrón de matcheo (se autocompleta desde nombre+aliases) */}
            <button
              type="button"
              onClick={() => setAdvancedOpen(v => !v)}
              className="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            >
              <CaretDown size={12} className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
              Avanzado: patrón de cargas
            </button>
            {advancedOpen && (
              <div className="space-y-1.5">
                <Label htmlFor="client-pattern">Patrón de cliente</Label>
                <Input
                  id="client-pattern"
                  value={form.clientePattern}
                  onChange={e => { setPatternTouched(true); setForm(prev => ({ ...prev, clientePattern: e.target.value })) }}
                  placeholder="Se autocompleta desde nombre + aliases"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Define qué cargas ve este cliente en el portal (comas = varias razones sociales).
                  {form.clientePattern && (
                    <span className="ml-1 font-medium text-accent">
                      ({computeMatchCount(shipments, form.clientePattern)} cargas coinciden ahora)
                    </span>
                  )}
                </p>
              </div>
            )}

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
                  editingId ? 'Guardar' : 'Crear cliente'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Accesos al portal por cliente ── */}
      <Dialog open={!!accessClient} onOpenChange={(open) => { if (!open) setAccessClientId(null) }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UsersThree size={20} weight="duotone" />
              Accesos al portal — {accessClient?.name}
            </DialogTitle>
            <DialogDescription>
              Usuarios con contraseña que ven las cargas de este cliente en el portal.
              La contraseña se comunica por otro canal — nunca viaja por email.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {accessUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3 border border-dashed rounded-md">
                Este cliente todavía no tiene usuarios del portal.
              </p>
            ) : (
              <div className="space-y-2">
                {accessUsers.map(user => (
                  <div key={user.id} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono text-sm truncate">{user.email}</div>
                        <div className="text-xs text-muted-foreground">
                          {user.name || 'Sin nombre'} · Último ingreso: {fmtLastLogin(user.lastLogin)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Switch checked={user.active} onCheckedChange={() => handleToggleUser(user)} />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">{user.active ? 'Desactivar acceso' : 'Activar acceso'}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (resetUserId === user.id) { setResetUserId(null); return }
                                  setResetUserId(user.id)
                                  setResetPassword(genPassword())
                                }}
                              >
                                <Key size={16} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Resetear contraseña</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(user)} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                                <Trash size={16} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Eliminar acceso</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                    {resetUserId === user.id && (
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={resetPassword}
                          onChange={e => setResetPassword(e.target.value)}
                          className="h-8 text-sm font-mono flex-1"
                          placeholder="Nueva contraseña (mín. 8)"
                        />
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Generar otra" onClick={() => setResetPassword(genPassword())}>
                          <ArrowsClockwise size={15} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Copiar" onClick={() => copyToClipboard(resetPassword, 'Contraseña')}>
                          <Copy size={15} />
                        </Button>
                        <Button size="sm" className="h-8" onClick={() => handleResetPassword(user)} disabled={resetBusy}>
                          {resetBusy ? <CircleNotch size={14} className="animate-spin" /> : 'Guardar'}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Crear usuario */}
            <div className="rounded-md border border-dashed p-3 space-y-2.5">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <UserPlus size={15} /> Nuevo acceso
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="cu-email" className="text-xs">Email</Label>
                  <Input
                    id="cu-email"
                    type="email"
                    value={newUser.email}
                    onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))}
                    placeholder="usuario@cliente.com"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cu-name" className="text-xs">Nombre</Label>
                  <Input
                    id="cu-name"
                    value={newUser.name}
                    onChange={e => setNewUser(u => ({ ...u, name: e.target.value }))}
                    placeholder="Nombre y apellido"
                    className="h-9 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cu-pass" className="text-xs">Contraseña</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    id="cu-pass"
                    value={newUser.password}
                    onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))}
                    className="h-9 text-sm font-mono flex-1"
                    placeholder="Mínimo 8 caracteres"
                  />
                  <Button variant="ghost" size="icon" className="h-9 w-9" title="Generar otra" onClick={() => setNewUser(u => ({ ...u, password: genPassword() }))}>
                    <ArrowsClockwise size={16} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9" title="Copiar" onClick={() => copyToClipboard(newUser.password, 'Contraseña')}>
                    <Copy size={16} />
                  </Button>
                </div>
              </div>
              <Button onClick={handleCreateUser} disabled={creatingUser} className="w-full gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
                {creatingUser ? (
                  <><CircleNotch size={16} className="animate-spin" /> Creando...</>
                ) : (
                  <><UserPlus size={16} /> Crear acceso</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Confirmación de eliminado ── */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open && !isDeleting) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará a {clientToDelete?.name} del catálogo permanentemente,
              junto con sus accesos al portal. Las cargas no se tocan.
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
