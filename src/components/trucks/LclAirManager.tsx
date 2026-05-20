import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  Plus,
  MagnifyingGlass,
  Trash,
  PencilSimple,
  Boat,
  Airplane,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { LclAirShipment, LclAirModality, LclAirStatus } from '@/lib/truckTypes'
import { LCL_AIR_STATUS_LABELS } from '@/lib/truckTypes'
import { formatKg, formatM3, newId } from '@/lib/truckUtils'
import { nextTruckCode } from '@/lib/dataClient'

interface LclAirManagerProps {
  lclAir: LclAirShipment[]
  onUpdateLclAir: (shipments: LclAirShipment[]) => void
  onDeleteLclAir: (id: string) => void
}

type ModalityFilter = 'all' | LclAirModality
type StatusFilter = 'all' | LclAirStatus

export default function LclAirManager({ lclAir, onUpdateLclAir, onDeleteLclAir }: LclAirManagerProps) {
  const [search, setSearch] = useState('')
  const [modalityFilter, setModalityFilter] = useState<ModalityFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [editing, setEditing] = useState<LclAirShipment | null>(null)
  const [creating, setCreating] = useState<LclAirModality | null>(null)
  const [pendingDelete, setPendingDelete] = useState<LclAirShipment | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return lclAir.filter(s => {
      if (modalityFilter !== 'all' && s.modality !== modalityFilter) return false
      if (statusFilter !== 'all' && s.status !== statusFilter) return false
      if (q) {
        const blob = `${s.ref} ${s.client} ${s.fiscal} ${s.origin} ${s.mblHbl} ${s.description}`.toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    }).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  }, [lclAir, search, modalityFilter, statusFilter])

  const handleNew = async (modality: LclAirModality) => {
    let ref = ''
    try {
      ref = await nextTruckCode(modality === 'lcl' ? 'LCL' : 'AIR')
    } catch (err) {
      // Fallback: local max
      const prefix = modality === 'lcl' ? 'LCL' : 'AIR'
      const max = lclAir
        .filter(s => s.modality === modality)
        .map(s => {
          const m = new RegExp(`^${prefix}-(\\d+)$`).exec(s.ref || '')
          return m ? parseInt(m[1], 10) : 0
        })
        .reduce((m, n) => Math.max(m, n), 0)
      ref = `${prefix}-${String(max + 1).padStart(4, '0')}`
      console.warn('[LclAir] nextTruckCode fallback used:', ref, err)
    }
    const draft: LclAirShipment = {
      id: newId('lclair'),
      ref,
      modality,
      client: '',
      origin: '',
      mblHbl: '',
      etaMvd: '',
      desconsolDate: '',
      pkgs: 0,
      kg: 0,
      m3: 0,
      fiscal: '',
      description: '',
      wood: false,
      status: 'en_origen',
      notes: '',
      createdAt: Date.now(),
    }
    setCreating(null)
    setEditing(draft)
  }

  const saveDraft = (draft: LclAirShipment) => {
    const isNew = !lclAir.some(s => s.id === draft.id)
    if (isNew) {
      onUpdateLclAir([draft, ...lclAir])
      toast.success(`${draft.ref} creado`)
    } else {
      onUpdateLclAir(lclAir.map(s => s.id === draft.id ? draft : s))
      toast.success(`${draft.ref} actualizado`)
    }
    setEditing(null)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <MagnifyingGlass size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar ref, cliente, MBL/HBL…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={modalityFilter} onValueChange={v => setModalityFilter(v as ModalityFilter)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo tipo</SelectItem>
            <SelectItem value="lcl">LCL</SelectItem>
            <SelectItem value="air">Aéreo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="en_origen">En Origen</SelectItem>
            <SelectItem value="en_transito">En Tránsito</SelectItem>
            <SelectItem value="arribado">Arribado</SelectItem>
            <SelectItem value="desconsolidado">Desconsolidado</SelectItem>
            <SelectItem value="despachado">Despachado</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleNew('lcl')}>
            <Plus size={14} className="mr-1.5" />
            LCL
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleNew('air')}>
            <Plus size={14} className="mr-1.5" />
            Aéreo
          </Button>
        </div>
      </div>

      {/* List */}
      {lclAir.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center space-y-3">
            <Boat size={48} className="mx-auto text-muted-foreground/50" weight="duotone" />
            <div>
              <p className="font-medium">No hay shipments LCL/Aéreos cargados</p>
              <p className="text-sm text-muted-foreground">
                Registrá un envío LCL o aéreo para poder armarlo en camiones consolidados.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Button onClick={() => handleNew('lcl')}><Plus size={14} className="mr-1.5" /> LCL</Button>
              <Button onClick={() => handleNew('air')} variant="outline"><Plus size={14} className="mr-1.5" /> Aéreo</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Ref</th>
                  <th className="text-left px-3 py-2">Cliente</th>
                  <th className="text-left px-3 py-2">Origen</th>
                  <th className="text-left px-3 py-2">Fiscal</th>
                  <th className="text-left px-3 py-2">MBL/HBL</th>
                  <th className="text-right px-3 py-2">Kg</th>
                  <th className="text-right px-3 py-2">m³</th>
                  <th className="text-left px-3 py-2">ETA MVD</th>
                  <th className="text-left px-3 py-2">Estado</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-8 text-sm text-muted-foreground">Sin resultados</td></tr>
                ) : filtered.map(s => (
                  <tr key={s.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {s.modality === 'lcl' ? <Boat size={12} weight="fill" className="text-primary" /> : <Airplane size={12} weight="fill" className="text-primary" />}
                        <span className="font-medium">{s.ref}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">{s.client || '—'}</td>
                    <td className="px-3 py-2">{s.origin || '—'}</td>
                    <td className="px-3 py-2">{s.fiscal || '—'}</td>
                    <td className="px-3 py-2 text-xs">{s.mblHbl || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatKg(s.kg)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatM3(s.m3)}</td>
                    <td className="px-3 py-2 text-xs">{s.etaMvd || '—'}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[10px]">{LCL_AIR_STATUS_LABELS[s.status]}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(s)} title="Editar">
                          <PencilSimple size={12} />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setPendingDelete(s)}>
                          <Trash size={12} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Editor dialog */}
      {editing && (
        <LclAirEditor
          shipment={editing}
          onCancel={() => setEditing(null)}
          onSave={saveDraft}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar {pendingDelete?.ref}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción borra el shipment LCL/Aéreo. Si está dentro de algún camión, quedará huérfano —
              recomendamos quitarlo primero del camión.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDelete) return
                onDeleteLclAir(pendingDelete.id)
                toast.success(`${pendingDelete.ref} eliminado`)
                setPendingDelete(null)
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Editor dialog ──

function LclAirEditor({
  shipment,
  onCancel,
  onSave,
}: {
  shipment: LclAirShipment
  onCancel: () => void
  onSave: (s: LclAirShipment) => void
}) {
  const [draft, setDraft] = useState<LclAirShipment>(shipment)
  const update = (patch: Partial<LclAirShipment>) => setDraft(prev => ({ ...prev, ...patch }))

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {draft.modality === 'lcl' ? <Boat weight="fill" className="text-primary" /> : <Airplane weight="fill" className="text-primary" />}
            {draft.ref} — {draft.modality === 'lcl' ? 'LCL' : 'Aéreo'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <Field label="Cliente">
            <Input value={draft.client} onChange={e => update({ client: e.target.value })} />
          </Field>
          <Field label="Origen">
            <Input value={draft.origin} onChange={e => update({ origin: e.target.value })} placeholder="Shanghai, Ningbo, …" />
          </Field>
          <Field label="MBL / HBL">
            <Input value={draft.mblHbl} onChange={e => update({ mblHbl: e.target.value })} />
          </Field>
          <Field label="Destino fiscal">
            <Input value={draft.fiscal} onChange={e => update({ fiscal: e.target.value })} placeholder="CACEC, ZP RAFAELA…" />
          </Field>
          <Field label="ETA MVD">
            <Input type="date" value={draft.etaMvd} onChange={e => update({ etaMvd: e.target.value })} />
          </Field>
          <Field label="Desconsolidación">
            <Input type="date" value={draft.desconsolDate} onChange={e => update({ desconsolDate: e.target.value })} />
          </Field>
          <Field label="Bultos">
            <Input type="number" value={draft.pkgs || ''} onChange={e => update({ pkgs: parseInt(e.target.value) || 0 })} />
          </Field>
          <Field label="Kg">
            <Input type="number" value={draft.kg || ''} onChange={e => update({ kg: parseFloat(e.target.value) || 0 })} />
          </Field>
          <Field label="m³">
            <Input type="number" step={0.01} value={draft.m3 || ''} onChange={e => update({ m3: parseFloat(e.target.value) || 0 })} />
          </Field>
          <Field label="Estado">
            <Select value={draft.status} onValueChange={v => update({ status: v as LclAirStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en_origen">En Origen</SelectItem>
                <SelectItem value="en_transito">En Tránsito</SelectItem>
                <SelectItem value="arribado">Arribado</SelectItem>
                <SelectItem value="desconsolidado">Desconsolidado</SelectItem>
                <SelectItem value="despachado">Despachado</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="md:col-span-2">
            <Label className="text-xs text-muted-foreground">Descripción</Label>
            <Input value={draft.description} onChange={e => update({ description: e.target.value })} className="mt-1" />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs text-muted-foreground">Notas</Label>
            <Textarea rows={2} value={draft.notes} onChange={e => update({ notes: e.target.value })} className="mt-1" />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="wood" checked={draft.wood} onCheckedChange={(v) => update({ wood: v })} />
            <Label htmlFor="wood" className="text-sm cursor-pointer">Embalaje con madera (SENASA)</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button onClick={() => onSave(draft)}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  )
}
