/**
 * Las cargas LCL y aéreas.
 *
 * Hasta el 31/08/2026 esta pantalla leía `lcl_air_shipments`, el registro viejo
 * — una sola fila, de mayo — mientras las cargas reales viven en `shipments`
 * con mode lcl/air. El armador de camiones sí las veía. Alguien migró el LCL a
 * la tabla unificada y esta pantalla quedó apuntando a la vieja: por eso la
 * sección se veía vacía.
 *
 * El estado tampoco se elige más: sale de los datos (ver `lclEstados`). El
 * desplegable manual dejó cuatro cargas congeladas en "en origen" desde junio.
 */
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
import type { DbShipment, Modality } from '@/lib/operationsTypes'
import { newDbShipment } from '@/lib/operationsTypes'
import { formatKg, formatM3 } from '@/lib/truckUtils'
import { nextTruckCode } from '@/lib/dataClient'
import {
  estadoLcl, almacenaje, ESTADO_LCL_LABEL, ESTADOS_LCL, type EstadoLcl,
} from '@/lib/lclEstados'

type ModalidadLcl = Extract<Modality, 'lcl' | 'air'>

interface LclAirManagerProps {
  /** Las LCL/aéreo de la tabla unificada (`shipments`, mode lcl|air). */
  dbShipments: DbShipment[]
  /** Refs que ya viajan en un camión publicado, en MAYÚSCULAS. */
  refsEnCamion: Set<string>
  /** Refs cuyo camión ya salió. */
  refsDespachadas: Set<string>
  onPatch: (id: string, fields: Record<string, unknown>) => void
  onCreate?: (row: DbShipment) => boolean | void
  onDelete: (id: string) => void
}

type ModalityFilter = 'all' | ModalidadLcl
type StatusFilter = 'all' | EstadoLcl

const REF = (r: unknown) => String(r ?? '').trim().toUpperCase()

export default function LclAirManager({
  dbShipments, refsEnCamion, refsDespachadas, onPatch, onCreate, onDelete,
}: LclAirManagerProps) {
  const [search, setSearch] = useState('')
  const [modalityFilter, setModalityFilter] = useState<ModalityFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [editing, setEditing] = useState<DbShipment | null>(null)
  const [editingEsNueva, setEditingEsNueva] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<DbShipment | null>(null)

  const hoy = new Date().toISOString().slice(0, 10)

  const todas = useMemo(
    () => dbShipments.filter(s => (s.mode === 'lcl' || s.mode === 'air') && !s.archived),
    [dbShipments],
  )

  const filas = useMemo(() => {
    const q = search.toLowerCase().trim()
    return todas
      .map(s => ({
        s,
        estado: estadoLcl(
          { ref: s.ref, eta: s.eta, stock: s.stock, desconsol: s.desconsol_date },
          hoy,
          { enCamion: refsEnCamion.has(REF(s.ref)), camionSalio: refsDespachadas.has(REF(s.ref)) },
        ),
      }))
      .filter(({ s, estado }) => {
        if (modalityFilter !== 'all' && s.mode !== modalityFilter) return false
        if (statusFilter !== 'all' && estado !== statusFilter) return false
        if (q) {
          const blob = `${s.ref} ${s.cliente} ${s.fiscal} ${s.origin} ${s.hbl || ''} ${s.doc_number} ${s.observacion} ${s.stock || ''}`.toLowerCase()
          if (!blob.includes(q)) return false
        }
        return true
      })
      // La que llegó primero es la que más tiempo lleva esperando.
      .sort((a, b) => String(a.s.eta || '').localeCompare(String(b.s.eta || '')))
  }, [todas, search, modalityFilter, statusFilter, refsEnCamion, refsDespachadas, hoy])

  const handleNew = async (modality: ModalidadLcl) => {
    let ref = ''
    try {
      ref = await nextTruckCode(modality === 'lcl' ? 'LCL' : 'AIR')
    } catch (err) {
      const prefix = modality === 'lcl' ? 'LCL' : 'AIR'
      const max = todas
        .filter(s => s.mode === modality)
        .map(s => {
          const m = new RegExp(`^${prefix}-(\\d+)$`).exec(s.ref || '')
          return m ? parseInt(m[1], 10) : 0
        })
        .reduce((m, n) => Math.max(m, n), 0)
      ref = `${prefix}-${String(max + 1).padStart(4, '0')}`
      console.warn('[LclAir] nextTruckCode fallback used:', ref, err)
    }
    setEditingEsNueva(true)
    setEditing(newDbShipment({ mode: modality, ref, source: 'web' }))
  }

  const guardar = (draft: DbShipment) => {
    if (editingEsNueva) {
      if (onCreate?.(draft) === false) return
      toast.success(`${draft.ref} creado`)
    } else {
      onPatch(draft.id, {
        cliente: draft.cliente, origin: draft.origin, hbl: draft.hbl || '',
        fiscal: draft.fiscal, eta: draft.eta, desconsol_date: draft.desconsol_date || '',
        pkgs: draft.pkgs, kg: draft.kg, m3: draft.m3,
        observacion: draft.observacion, notes: draft.notes, wood: draft.wood,
        stock: draft.stock || '',
        marca_cliente: draft.marca_cliente ?? null,
        marca_motivo: draft.marca_motivo || '',
      })
      toast.success(`${draft.ref} actualizado`)
    }
    setEditing(null)
    setEditingEsNueva(false)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <MagnifyingGlass size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar ref, cliente, BL, stock…"
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
            {ESTADOS_LCL.map(e => (
              <SelectItem key={e} value={e}>{ESTADO_LCL_LABEL[e]}</SelectItem>
            ))}
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
      {todas.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center space-y-3">
            <Boat size={48} className="mx-auto text-muted-foreground/50" weight="duotone" />
            <div>
              <p className="font-medium">No hay cargas LCL ni aéreas</p>
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
                  <th className="text-left px-3 py-2">Stock</th>
                  <th className="text-right px-3 py-2">Kg</th>
                  <th className="text-right px-3 py-2">m³</th>
                  <th className="text-left px-3 py-2">ETA MVD</th>
                  <th className="text-left px-3 py-2">Estado</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {filas.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-8 text-sm text-muted-foreground">Sin resultados</td></tr>
                ) : filas.map(({ s, estado }) => {
                  const alm = almacenaje({ ref: s.ref, desconsol: s.desconsol_date }, hoy)
                  return (
                    <tr key={s.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {s.mode === 'lcl'
                            ? <Boat size={12} weight="fill" className="text-primary" />
                            : <Airplane size={12} weight="fill" className="text-primary" />}
                          <span className="font-medium">{s.ref}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">{s.cliente || '—'}</td>
                      <td className="px-3 py-2">{s.origin || '—'}</td>
                      <td className="px-3 py-2">{s.fiscal || '—'}</td>
                      <td className="px-3 py-2 text-xs tabular-nums">{s.stock || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatKg(s.kg)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatM3(s.m3)}</td>
                      <td className="px-3 py-2 text-xs">{s.eta || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant="outline" className="text-[10px]">{ESTADO_LCL_LABEL[estado]}</Badge>
                          {s.marca_cliente === 'stand_by' && (
                            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700" title={s.marca_motivo || ''}>
                              Stand by
                            </Badge>
                          )}
                          {s.marca_cliente === 'prioridad' && (
                            <Badge variant="outline" className="text-[10px] border-rose-300 text-rose-700" title={s.marca_motivo || ''}>
                              Prioridad
                            </Badge>
                          )}
                          {alm && alm.diasRestantes <= 7 && (
                            <Badge
                              variant="outline"
                              className={alm.vencido
                                ? 'text-[10px] border-rose-400 text-rose-700'
                                : 'text-[10px] border-orange-300 text-orange-700'}
                              title={`Almacenaje hasta el ${alm.vence}`}
                            >
                              {alm.vencido ? 'Almacenaje vencido' : `Almacenaje: ${alm.diasRestantes}d`}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 justify-end">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditingEsNueva(false); setEditing(s) }} title="Editar">
                            <PencilSimple size={12} />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setPendingDelete(s)}>
                            <Trash size={12} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Editor dialog */}
      {editing && (
        <LclAirEditor
          shipment={editing}
          onCancel={() => { setEditing(null); setEditingEsNueva(false) }}
          onSave={guardar}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar {pendingDelete?.ref}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción borra la carga LCL/aérea. Si está dentro de algún camión, quedará huérfana —
              conviene quitarla primero del camión.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDelete) return
                onDelete(pendingDelete.id)
                toast.success(`${pendingDelete.ref} eliminada`)
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
  shipment: DbShipment
  onCancel: () => void
  onSave: (s: DbShipment) => void
}) {
  const [draft, setDraft] = useState<DbShipment>(shipment)
  const update = (patch: Partial<DbShipment>) => setDraft(prev => ({ ...prev, ...patch }))

  const marcas: { v: 'stand_by' | 'prioridad' | null; t: string }[] = [
    { v: null, t: 'Sin marca' },
    { v: 'stand_by', t: 'Stand by' },
    { v: 'prioridad', t: 'Prioridad' },
  ]

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {draft.mode === 'lcl'
              ? <Boat weight="fill" className="text-primary" />
              : <Airplane weight="fill" className="text-primary" />}
            {draft.ref} — {draft.mode === 'lcl' ? 'LCL' : 'Aéreo'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <Field label="Cliente">
            <Input value={draft.cliente} onChange={e => update({ cliente: e.target.value })} />
          </Field>
          <Field label="Origen">
            <Input value={draft.origin} onChange={e => update({ origin: e.target.value })} placeholder="Shanghai, Ningbo, …" />
          </Field>
          <Field label="MBL / HBL">
            <Input value={draft.hbl || ''} onChange={e => update({ hbl: e.target.value })} />
          </Field>
          <Field label="Destino fiscal">
            <Input value={draft.fiscal} onChange={e => update({ fiscal: e.target.value })} placeholder="CACEC, RAFAELA, MARE…" />
          </Field>
          <Field label="ETA MVD">
            <Input type="date" value={draft.eta} onChange={e => update({ eta: e.target.value })} />
          </Field>
          <Field label="Desconsolidación">
            <Input
              type="date"
              value={draft.desconsol_date || ''}
              onChange={e => update({ desconsol_date: e.target.value })}
            />
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
          <Field label="Stock del depósito">
            <Input
              value={draft.stock || ''}
              onChange={e => update({
                stock: e.target.value,
                // Desconsolidar ES entregar el stock: si la fecha está vacía se
                // estampa la de hoy, que es de donde cuelga el almacenaje.
                desconsol_date: draft.desconsol_date || (e.target.value.trim()
                  ? new Date().toISOString().slice(0, 10)
                  : ''),
              })}
              placeholder="nº de stock"
            />
          </Field>

          <div className="md:col-span-2 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Marca del cliente</Label>
            <div className="flex gap-2">
              {marcas.map(o => (
                <button
                  key={o.t}
                  type="button"
                  onClick={() => update({
                    marca_cliente: o.v,
                    marca_motivo: o.v ? draft.marca_motivo : '',
                  })}
                  className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm font-semibold transition-colors ${
                    (draft.marca_cliente ?? null) === o.v
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  {o.t}
                </button>
              ))}
            </div>
            {draft.marca_cliente && (
              <Input
                value={draft.marca_motivo || ''}
                onChange={e => update({ marca_motivo: e.target.value })}
                placeholder={draft.marca_cliente === 'stand_by' ? 'por qué no sale' : 'por qué es prioridad'}
              />
            )}
            <p className="text-[11px] text-muted-foreground">
              Stand by la saca de las candidatas a camión. Prioridad la pone primera.
            </p>
          </div>

          <div className="md:col-span-2">
            <Label className="text-xs text-muted-foreground">Descripción</Label>
            <Input value={draft.observacion} onChange={e => update({ observacion: e.target.value })} className="mt-1" />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs text-muted-foreground">Notas</Label>
            <Textarea rows={2} value={draft.notes} onChange={e => update({ notes: e.target.value })} className="mt-1" />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="wood" checked={draft.wood === true} onCheckedChange={(v) => update({ wood: v })} />
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
