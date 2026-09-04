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
 *
 * 04/09/2026 — UNA sola alta: esta pantalla y el alta de Operaciones escriben
 * las dos en `shipments` (mode lcl|air), que es la fuente única. El registro
 * viejo `lcl_air_shipments` se sacó de toda la app (dataClient, armador de
 * camiones y endpoint): Brian preguntó "¿por qué vamos a tener los dos?" con
 * 444 cargas de un lado y 1 fila de mayo del otro, ya migrada. La tabla no se
 * borró — queda en Supabase como archivo histórico, sin lector.
 *
 * Alta (Brian 01/09/2026): la ref la escribe el operativo (se sugiere la
 * autogenerada pero se puede pisar) y el formulario pide los mismos datos
 * clave que el alta LCL desde Operaciones — mismo componente <LclDatosClave>
 * (la lista vive en lib/datosClave), misma traducción a columnas
 * (`camposDesdeDatosClave`). La EDICIÓN usa el mismo bloque, con la ref fija
 * (cambiarla tiene su flujo con PIN). Si ya hay otra carga activa con esa
 * ref, avisa y sugiere el sufijo A/B; no bloquea.
 */
import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
  DialogDescription,
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
import {
  camposDesdeDatosClave, datosClaveDesdeFila, buscarRefDuplicada,
  LCL_DATOS_CLAVE_VACIOS, type LclDatosClaveState,
} from '@/lib/lclAlta'
import type { CatalogClient } from '@/lib/clientCatalog'
import LclDatosClave from '@/components/operations/LclDatosClave'
import { RefDuplicadaAviso } from '@/components/operations/formAtoms'
import { hoyISO } from '@/lib/format'

type ModalidadLcl = Extract<Modality, 'lcl' | 'air'>

interface LclAirManagerProps {
  /** Las LCL/aéreo de la tabla unificada (`shipments`, mode lcl|air). */
  dbShipments: DbShipment[]
  /** Refs que ya viajan en un camión publicado, en MAYÚSCULAS. */
  refsEnCamion: Set<string>
  /** Refs cuyo camión ya salió. */
  refsDespachadas: Set<string>
  onPatch: (id: string, fields: Record<string, unknown>) => void
  /** `duplicadoConfirmado`: el alta ya preguntó por la ref repetida. */
  onCreate?: (row: DbShipment, opts?: { duplicadoConfirmado?: boolean }) => boolean | void
  onDelete: (id: string) => void
  /** Catálogo de clientes para el datalist del alta (opcional). */
  clientes?: CatalogClient[]
}

type ModalityFilter = 'all' | ModalidadLcl
type StatusFilter = 'all' | EstadoLcl

const REF = (r: unknown) => String(r ?? '').trim().toUpperCase()

export default function LclAirManager({
  dbShipments, refsEnCamion, refsDespachadas, onPatch, onCreate, onDelete, clientes = [],
}: LclAirManagerProps) {
  const [search, setSearch] = useState('')
  const [modalityFilter, setModalityFilter] = useState<ModalityFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [editing, setEditing] = useState<DbShipment | null>(null)
  // Alta: modalidad + ref sugerida (editable en el diálogo).
  const [alta, setAlta] = useState<{ modality: ModalidadLcl; refSugerida: string } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<DbShipment | null>(null)

  const hoy = hoyISO()

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

  // Fiscales ya usados en las LCL/aéreas → combo del alta.
  const knownFiscales = useMemo(
    () => Array.from(new Set(todas.map(s => String(s.fiscal || '').trim().toUpperCase()).filter(Boolean))),
    [todas],
  )

  // La ref autogenerada es solo una SUGERENCIA: el operativo escribe la suya
  // (antes no se podía — Brian 01/09).
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
    setAlta({ modality, refSugerida: ref })
  }

  const crear = (row: DbShipment, opts?: { duplicadoConfirmado?: boolean }) => {
    if (onCreate?.(row, opts) === false) return   // ref repetida y canceló → sigue abierto
    toast.success(`${row.ref} creada`)
    setAlta(null)
  }

  const guardar = (id: string, ref: string, patch: Record<string, unknown>) => {
    onPatch(id, patch)
    toast.success(`${ref} actualizado`)
    setEditing(null)
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
                          {s.entrega_planta && (
                            <Badge variant="outline" className="text-[10px] border-violet-300 text-violet-700" title="Entrega en planta: del fiscal va directo a la planta del cliente">
                              🏭 Planta
                            </Badge>
                          )}
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
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(s)} title="Editar">
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

      {/* Alta: ref propia + los 12 datos clave */}
      {alta && (
        <AltaLclAirDialog
          modality={alta.modality}
          refSugerida={alta.refSugerida}
          cargas={dbShipments}
          clientes={clientes}
          knownFiscales={knownFiscales}
          onCancel={() => setAlta(null)}
          onSave={crear}
        />
      )}

      {/* Editor dialog: mismo bloque de datos clave que el alta + extras */}
      {editing && (
        <LclAirEditor
          shipment={editing}
          clientes={clientes}
          knownFiscales={knownFiscales}
          onCancel={() => setEditing(null)}
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

// ── Alta dialog ──
// Pide exactamente lo mismo que el alta LCL de Operaciones (NewShipmentDialog
// en modo LCL): es la intención de Brian — que sea lo mismo desde los dos lados.

function AltaLclAirDialog({
  modality, refSugerida, cargas, clientes, knownFiscales, onCancel, onSave,
}: {
  modality: ModalidadLcl
  refSugerida: string
  cargas: DbShipment[]
  clientes: CatalogClient[]
  knownFiscales: string[]
  onCancel: () => void
  onSave: (row: DbShipment, opts?: { duplicadoConfirmado?: boolean }) => void
}) {
  const [f, setF] = useState<LclDatosClaveState>({ ...LCL_DATOS_CLAVE_VACIOS, ref: refSugerida })
  const [showErrors, setShowErrors] = useState(false)
  const onChange = (patch: Partial<LclDatosClaveState>) => setF(prev => ({ ...prev, ...patch }))

  // Otra carga ACTIVA con la misma ref (mayúsculas/espacios no cuentan).
  // Avisa y sugiere sufijo — no bloquea la edición ni el guardado.
  const duplicada = useMemo(() => buscarRefDuplicada(f.ref, cargas), [f.ref, cargas])

  const guardar = () => {
    const faltan = [!f.ref.trim() ? 'Ref' : null, !f.cliente.trim() ? 'Cliente' : null].filter(Boolean)
    if (faltan.length) {
      setShowErrors(true)
      toast.error(`Faltan campos obligatorios: ${faltan.join(', ')}`)
      return
    }
    // Ref repetida: el aviso inline ya se vio; se confirma UNA vez acá y App no
    // vuelve a preguntar lo mismo (duplicadoConfirmado).
    let duplicadoConfirmado = false
    if (duplicada) {
      const ok = window.confirm(`Ya existe una carga activa con la ref "${f.ref.trim()}"${duplicada.cliente ? ` (${duplicada.cliente})` : ''}.\n\n¿Crearla igual? Si es una carga partida, cancelá y usá un sufijo (A / B).`)
      if (!ok) return
      duplicadoConfirmado = true
    }
    onSave(newDbShipment({ mode: modality, source: 'web', ...camposDesdeDatosClave(f, hoyISO()) }), { duplicadoConfirmado })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {modality === 'lcl'
              ? <Boat weight="fill" className="text-primary" />
              : <Airplane weight="fill" className="text-primary" />}
            Nueva carga {modality === 'lcl' ? 'LCL' : 'aérea'}
          </DialogTitle>
          <DialogDescription>
            <span className="text-red-600 font-semibold">*</span> Ref (la tuya) y cliente son obligatorios.
            La ref sugerida es <strong>{refSugerida}</strong>; podés escribir la que uses vos.
          </DialogDescription>
        </DialogHeader>

        <LclDatosClave
          idPrefix="alta-lcl"
          value={f}
          onChange={onChange}
          clientes={clientes}
          knownFiscales={knownFiscales}
          showErrors={showErrors}
          refPlaceholder={refSugerida}
          refExtra={duplicada ? (
            <RefDuplicadaAviso ref_={f.ref} cliente={duplicada.cliente} onUsar={v => onChange({ ref: v })} />
          ) : null}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button onClick={guardar} className="gap-1.5"><Plus size={14} /> Crear carga</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Editor dialog ──
// Los datos clave se editan con el MISMO componente que el alta (la lista
// única de lib/datosClave); la ref queda fija (cambiarla es el flujo con PIN).
// Abajo, lo que no es dato clave: origen, fecha de desconsolidación, marca del
// cliente, descripción y notas.

function LclAirEditor({
  shipment,
  clientes,
  knownFiscales,
  onCancel,
  onSave,
}: {
  shipment: DbShipment
  clientes: CatalogClient[]
  knownFiscales: string[]
  onCancel: () => void
  onSave: (id: string, ref: string, patch: Record<string, unknown>) => void
}) {
  const [f, setF] = useState<LclDatosClaveState>(() => datosClaveDesdeFila(shipment))
  const onChange = (patch: Partial<LclDatosClaveState>) => setF(prev => ({ ...prev, ...patch }))
  const [extras, setExtras] = useState({
    origin: shipment.origin || '',
    desconsol: String(shipment.desconsol_date || '').slice(0, 10),
    observacion: shipment.observacion || '',
    notes: shipment.notes || '',
    marca: (shipment.marca_cliente ?? null) as 'stand_by' | 'prioridad' | null,
    motivo: shipment.marca_motivo || '',
  })
  const setExtra = <K extends keyof typeof extras>(k: K, v: (typeof extras)[K]) => setExtras(prev => ({ ...prev, [k]: v }))

  const marcas: { v: 'stand_by' | 'prioridad' | null; t: string }[] = [
    { v: null, t: 'Sin marca' },
    { v: 'stand_by', t: 'Stand by' },
    { v: 'prioridad', t: 'Prioridad' },
  ]

  const guardar = () => {
    if (!f.cliente.trim()) { toast.error('El cliente es obligatorio'); return }
    // Misma traducción que el alta (stock → desconsol_date=hoy si está vacía).
    // La ref NO se patchea desde acá (tiene su flujo con PIN y cascada).
    const { ref: _ref, ...clave } = camposDesdeDatosClave(f, hoyISO(), extras.desconsol)
    void _ref
    onSave(shipment.id, shipment.ref, {
      ...clave,
      origin: extras.origin.trim(),
      observacion: extras.observacion,
      notes: extras.notes,
      marca_cliente: extras.marca,
      marca_motivo: extras.marca ? extras.motivo : '',
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {shipment.mode === 'lcl'
              ? <Boat weight="fill" className="text-primary" />
              : <Airplane weight="fill" className="text-primary" />}
            {shipment.ref} — {shipment.mode === 'lcl' ? 'LCL' : 'Aéreo'}
          </DialogTitle>
          <DialogDescription>Los mismos datos clave que el alta, en el mismo orden. La ref se cambia desde Operaciones (PIN).</DialogDescription>
        </DialogHeader>

        <LclDatosClave
          idPrefix={`edit-${shipment.id}`}
          value={f}
          onChange={onChange}
          clientes={clientes}
          knownFiscales={knownFiscales}
          refReadOnly
          refExtra={!!shipment.hbl && !f.docNumber.trim() ? (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>Viejo MBL/HBL: <strong className="text-foreground">{shipment.hbl}</strong></span>
              <button
                type="button"
                className="rounded border px-1.5 py-0.5 font-medium hover:bg-muted"
                onClick={() => onChange({ docNumber: shipment.hbl || '' })}
              >
                Usar como BL
              </button>
            </div>
          ) : null}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm border-t pt-3">
          <Field label="Origen">
            <Input value={extras.origin} onChange={e => setExtra('origin', e.target.value)} placeholder="Shanghai, Ningbo, …" />
          </Field>
          <Field label="Desconsolidación (fecha del stock)">
            <Input type="date" value={extras.desconsol} onChange={e => setExtra('desconsol', e.target.value)} />
          </Field>

          <div className="md:col-span-2 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Marca del cliente</Label>
            <div className="flex gap-2">
              {marcas.map(o => (
                <button
                  key={o.t}
                  type="button"
                  onClick={() => setExtra('marca', o.v)}
                  className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm font-semibold transition-colors ${
                    extras.marca === o.v
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  {o.t}
                </button>
              ))}
            </div>
            {extras.marca && (
              <Input
                value={extras.motivo}
                onChange={e => setExtra('motivo', e.target.value)}
                placeholder={extras.marca === 'stand_by' ? 'por qué no sale' : 'por qué es prioridad'}
              />
            )}
            <p className="text-[11px] text-muted-foreground">
              Stand by la saca de las candidatas a camión. Prioridad la pone primera.
            </p>
          </div>

          <div className="md:col-span-2">
            <Label className="text-xs text-muted-foreground">Descripción</Label>
            <Input value={extras.observacion} onChange={e => setExtra('observacion', e.target.value)} className="mt-1" />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs text-muted-foreground">Notas</Label>
            <Textarea rows={2} value={extras.notes} onChange={e => setExtra('notes', e.target.value)} className="mt-1" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button onClick={guardar}>Guardar</Button>
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
