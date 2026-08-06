import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Trash,
  ArrowLeft,
  Warning,
  CheckCircle,
  Boat,
  Airplane,
  Truck as TruckIcon,
  ArrowsClockwise,
  FilePdf,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import type { Truck, TruckLoad, LclAirShipment, TruckStatus } from '@/lib/truckTypes'
import type { DbShipment, Operator } from '@/lib/operationsTypes'
import { suggestNextRef } from '@/lib/operationsTypes'
import {
  computeTruckTotals,
  getTruckLimits,
  deriveTruckDisplayStatus,
  deriveTruckDisplayInfo,
  applyTruckPending,
  effectiveTruckLoads,
  hasDraftState,
  truckCostPerM3,
  costColor,
  COST_STYLES,
} from '@/lib/truckTypes'
import {
  formatKg,
  formatM3,
  formatPkgs,
  newId,
  prefillFclFromShipment,
  getTruckHealthIssues,
  discardPendingArrays,
  commitPendingArrays,
} from '@/lib/truckUtils'
import AvailableLoadsPanel from './AvailableLoadsPanel'
import NewShipmentDialog from '@/components/operations/NewShipmentDialog'
import { isSinTelex, SIN_TELEX_MSG } from '@/lib/telexCheck'
import { exportTruckPdf } from '@/lib/truckExport'
import { conflictoFechasConsolidado, type ConflictoFechas } from '@/lib/truckUtils'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { fmtDateDMY } from '@/lib/format'

interface TruckBuilderProps {
  truck: Truck
  trucks: Truck[]
  truckLoads: TruckLoad[]
  lclAir: LclAirShipment[]
  dbShipments: DbShipment[]
  shipments: ParsedShipment[]
  /** Operativos para el alta de carga desde el armador. */
  operators?: Operator[]
  onBack: () => void
  onUpdateTrucks: (trucks: Truck[], changedIds?: string[]) => void
  onUpdateTruckLoads: (loads: TruckLoad[], changedIds?: string[]) => void
  onDeleteTruckLoad: (id: string) => void
  onDeleteTruck: (id: string) => void
  /** Alta real de una carga (App.handleCreateShipment). false = abortada. */
  onCreateShipment?: (row: DbShipment) => boolean | void
  /** PATCH de una carga — para alinear sus fechas con las del consolidado. */
  onPatchShipment?: (id: string, fields: Record<string, unknown>) => void
}

export default function TruckBuilder(props: TruckBuilderProps) {
  const { truck, trucks, truckLoads, lclAir, dbShipments, shipments, operators, onBack, onUpdateTrucks, onUpdateTruckLoads, onDeleteTruckLoad, onDeleteTruck, onCreateShipment, onPatchShipment } = props

  const isDraft = truck.draft
  // Lo que se VE y EDITA: el camión con el overlay aplicado.
  const merged = useMemo(() => applyTruckPending(truck), [truck])

  // ALL loads of this truck, sorted by position (for the table — includes pending remove)
  const allMine = useMemo(
    () => truckLoads
      .filter(l => l.truckId === truck.id)
      .sort((a, b) => a.position - b.position),
    [truckLoads, truck.id]
  )

  // Effective loads (for totals): confirmed + pending='add', excluding pending='remove'
  const loads = useMemo(
    () => effectiveTruckLoads(truckLoads, truck.id, { includePending: true }),
    [truckLoads, truck.id]
  )

  const totals = useMemo(() => computeTruckTotals(merged, loads), [merged, loads])
  const limits = getTruckLimits(merged.isSider)
  const healthIssues = useMemo(() => getTruckHealthIssues(merged, loads), [merged, loads])

  // Cargas especiales en ESTE camión: NO apilable (va arriba de todo), IMO
  // (mercancía peligrosa) y SIN TELEX (la naviera no liberó — no se puede
  // retirar). Los flags viven en la carga (tabla shipments). Telex aplica solo
  // a marítimo (FCL/LCL) — aéreo/terrestre no tienen.
  const specialLoads = useMemo(() => {
    const byRef = new Map(dbShipments.map(s => [s.ref, s]))
    const noApilables: string[] = []
    const imos: string[] = []
    const sinTelex: string[] = []
    for (const l of loads) {
      const s = byRef.get(l.sourceRef)
      if (!s) continue
      if (s.no_apilable) noApilables.push(l.sourceRef)
      if (s.imo) imos.push(l.sourceRef)
      if ((s.mode === 'fcl' || s.mode === 'lcl') && !s.telex) sinTelex.push(l.sourceRef)
    }
    return { noApilables, imos, sinTelex }
  }, [loads, dbShipments])

  // ── Truck-level update helpers ──
  const updateTruck = (patch: Partial<Truck>) => {
    if (isDraft) {
      const updated = { ...truck, ...patch, updatedAt: Date.now() }
      onUpdateTrucks(trucks.map(t => (t.id === truck.id ? updated : t)), [truck.id])
    } else {
      // Publicado: el cambio va al overlay, las columnas reales no se tocan.
      const pendingEdits = { ...(truck.pendingEdits || {}), ...patch }
      onUpdateTrucks(trucks.map(t => (t.id === truck.id ? { ...t, pendingEdits, updatedAt: Date.now() } : t)), [truck.id])
    }
  }

  // Estado mostrado = derivado de las fechas (las fechas mandan).
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const derivedStatus = deriveTruckDisplayStatus(merged, hoy)
  const derivedInfo = deriveTruckDisplayInfo(merged, hoy)

  // Tocar un estado completa la fecha correspondiente con HOY si está vacía
  // (así el derivado coincide y la agenda/facturación reaccionan solas).
  const setStatusWithDate = (st: TruckStatus) => {
    const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
    const patch: Partial<Truck> = { status: st }
    if (st === 'in_transit' && !merged.departureDate) { patch.loadDate = iso; patch.departureDate = iso }
    if (st === 'delivered' && !merged.arrivalDate) patch.arrivalDate = iso
    updateTruck(patch)
  }

  const updateLoad = (loadId: string, patch: Partial<TruckLoad>, markOverrides: string[] = []) => {
    const next = truckLoads.map(l => {
      if (l.id !== loadId) return l
      const overrides = { ...(l.overrides || {}) }
      for (const k of markOverrides) overrides[k] = true
      return { ...l, ...patch, overrides }
    })
    onUpdateTruckLoads(next, [loadId])
  }

  // ── Add from panel ──
  // Choque de fechas al subir una carga ya coordinada a un consolidado: se
  // pregunta cuál manda en vez de pisar en silencio (Brian 06/08/2026).
  const [conflicto, setConflicto] = useState<
    { shipment: ParsedShipment; cntr: string; datos: ConflictoFechas } | null
  >(null)

  // cntr = contenedor elegido de esa carga. Un camión lleva UNO: si la carga
  // tiene varios, se agrega una línea por contenedor (Brian 06/08/2026).
  const addFcl = (s: ParsedShipment, cntr = '') => {
    const choque = conflictoFechasConsolidado(s, cntr, merged)
    if (choque) {
      setConflicto({ shipment: s, cntr, datos: choque })
      return                       // se agrega al resolver el diálogo
    }
    agregarFcl(s, cntr)
  }

  const agregarFcl = (s: ParsedShipment, cntr = '') => {
    const prefill = prefillFclFromShipment(s, cntr)
    const load: TruckLoad = {
      id: newId('load'),
      truckId: truck.id,
      sourceType: 'fcl',
      sourceRef: s.REF,
      cntr,
      client: prefill.client,
      fiscal: prefill.fiscal,
      kg: prefill.kg,
      m3: prefill.m3,
      pkgs: prefill.pkgs,
      description: prefill.description,
      mvdArrival: prefill.mvdArrival,
      desconsolDate: prefill.desconsolDate,
      bl: prefill.bl,
      stock: '',
      wood: prefill.wood,
      overrides: {},
      position: allMine.length,
      pending: isDraft ? null : 'add',
    }
    onUpdateTruckLoads([...truckLoads, load], [load.id])
    toast.success(`${s.REF} agregado al camión`)
    // Sin telex la carga no se puede retirar de la terminal.
    if (isSinTelex(s.operativas?.[0]?.TLX)) toast.warning(`🚨 ${s.REF} — ${SIN_TELEX_MSG}`, { duration: 8000 })
  }

  const addLclAir = (s: LclAirShipment) => {
    const load: TruckLoad = {
      id: newId('load'),
      truckId: truck.id,
      sourceType: s.modality,
      sourceRef: s.ref,
      cntr: '',
      client: s.client,
      fiscal: s.fiscal,
      kg: s.kg,
      m3: s.m3,
      pkgs: s.pkgs,
      description: s.description,
      mvdArrival: s.etaMvd,
      desconsolDate: s.desconsolDate,
      bl: s.mblHbl || '',
      stock: '',
      wood: s.wood,
      overrides: {},
      position: allMine.length,
      pending: isDraft ? null : 'add',
    }
    onUpdateTruckLoads([...truckLoads, load], [load.id])
    toast.success(`${s.ref} agregado al camión`)
  }

  // Add an LCL/aéreo load from the unified `shipments` table.
  const addDb = (s: DbShipment) => {
    const load: TruckLoad = {
      id: newId('load'),
      truckId: truck.id,
      sourceType: (s.mode === 'air' ? 'air' : 'lcl'),
      sourceRef: s.ref,
      cntr: '',
      client: s.cliente || '',
      fiscal: s.fiscal || '',
      kg: Number(s.kg) || 0,
      m3: Number(s.m3) || 0,
      pkgs: Number(s.pkgs) || 0,
      description: s.observacion || '',
      mvdArrival: s.eta || '',
      desconsolDate: s.fecha_consol || '',
      bl: s.doc_number || '',
      stock: '',
      wood: !!s.wood,
      overrides: {},
      position: allMine.length,
      pending: isDraft ? null : 'add',
    }
    onUpdateTruckLoads([...truckLoads, load], [load.id])
    toast.success(`${s.ref} agregado al camión`)
    // Aviso inmediato al agregar una carga especial
    if (s.no_apilable) toast.warning(`📦 ${s.ref} es NO APILABLE — va arriba de todo`, { duration: 6000 })
    if (s.imo) toast.warning(`☢️ ${s.ref} lleva mercancía peligrosa (IMO)`, { duration: 6000 })
    // Madera "a confirmar" (null) entra al camión como No — confirmarla ANTES
    // de imprimir el plan (WOOD=SI dispara SENASA en frontera).
    if (s.wood === null) toast.warning(`🪵 ${s.ref}: madera sin confirmar — confirmala en la carga antes de imprimir el plan`, { duration: 8000 })
    // Sin telex la carga no se puede retirar del depósito/terminal.
    if ((s.mode === 'fcl' || s.mode === 'lcl') && !s.telex) toast.warning(`🚨 ${s.ref} — ${SIN_TELEX_MSG}`, { duration: 8000 })
  }

  // ── Crear carga desde el armador ──
  // El operativo no encuentra la carga porque todavía no existe: la da de alta
  // acá mismo (mismo diálogo y pipeline que Operaciones — onCreateShipment →
  // POST shipments) y se sube al camión en el acto como pendiente, con el mismo
  // flujo del botón + (se confirma al Guardar camión). La TruckLoad se arma
  // directo desde la fila DbShipment recién creada (fuente única del alta).
  const [newCargoOpen, setNewCargoOpen] = useState(false)
  const suggestedRef = useMemo(
    () => suggestNextRef([...shipments.map(s => s.REF), ...dbShipments.map(s => s.ref)]),
    [shipments, dbShipments]
  )
  const handleCreateFromBuilder = (row: DbShipment): boolean | void => {
    const created = onCreateShipment?.(row)
    if (created === false) return false          // REF duplicada y canceló → no seguir
    if (row.mode === 'land') {
      // LoadSource no tiene 'land': las cargas terrestres no van dentro de un consolidado.
      toast.success(`${row.ref} creada — las cargas terrestres no se suben a un camión (la ves en Operaciones)`)
      return
    }
    const load: TruckLoad = {
      id: newId('load'),
      truckId: truck.id,
      sourceType: row.mode === 'fcl' ? 'fcl' : row.mode === 'air' ? 'air' : 'lcl',
      sourceRef: row.ref,
      cntr: '',
      client: row.cliente || '',
      fiscal: row.fiscal || '',
      kg: Number(row.kg) || 0,
      m3: Number(row.m3) || 0,
      pkgs: Number(row.pkgs) || 0,
      description: row.observacion || '',
      mvdArrival: row.eta || '',
      desconsolDate: row.desconsol_date || row.fecha_consol || '',
      bl: row.doc_number || '',
      stock: '',
      wood: !!row.wood,
      overrides: {},
      position: allMine.length,
      pending: isDraft ? null : 'add',
    }
    onUpdateTruckLoads([...truckLoads, load], [load.id])
    toast.success(`${row.ref} creada y agregada al camión`)
    if (row.no_apilable) toast.warning(`📦 ${row.ref} es NO APILABLE — va arriba de todo`, { duration: 6000 })
    if (row.imo) toast.warning(`☢️ ${row.ref} lleva mercancía peligrosa (IMO)`, { duration: 6000 })
  }

  // ── Re-sync FCL load from current planilla data ──
  const resyncFcl = (load: TruckLoad) => {
    const s = shipments.find(x => x.REF === load.sourceRef)
    if (!s) {
      toast.error(`${load.sourceRef} ya no está en la planilla`)
      return
    }
    // Re-sincronizar respeta el contenedor elegido: si la línea es de un
    // contenedor, trae SUS datos y no el total de la carga.
    const prefill = prefillFclFromShipment(s, load.cntr || '')
    updateLoad(load.id, {
      client: prefill.client,
      fiscal: prefill.fiscal,
      kg: prefill.kg,
      m3: prefill.m3,
      pkgs: prefill.pkgs,
      description: prefill.description,
      mvdArrival: prefill.mvdArrival,
      desconsolDate: prefill.desconsolDate,
      bl: prefill.bl,
      wood: prefill.wood,
      // stock NO se re-sincroniza: es dato manual del depósito, no viene de planilla.
    })
    // Clear all overrides — values now match planilla
    const next = truckLoads.map(l => l.id === load.id ? { ...l, overrides: {} } : l)
    onUpdateTruckLoads(next, [load.id])
    toast.success(`${load.sourceRef} re-sincronizado desde planilla`)
  }

  const removeLoad = (l: TruckLoad) => {
    if (isDraft || l.pending === 'add') { onDeleteTruckLoad(l.id); return }
    // Publicado: marcar para quitar (se concreta al Guardar)
    onUpdateTruckLoads(truckLoads.map(x => (x.id === l.id ? { ...x, pending: 'remove' as const } : x)), [l.id])
  }

  const undoRemoveLoad = (l: TruckLoad) => {
    onUpdateTruckLoads(truckLoads.map(x => (x.id === l.id ? { ...x, pending: null } : x)), [l.id])
  }

  // ── Draft state + Save/Cancel ──
  const draftState = hasDraftState(truck, truckLoads)

  const handleSave = () => {
    const effLoads = effectiveTruckLoads(truckLoads, truck.id, { includePending: true })
    if (effLoads.length === 0) {
      toast.error('El camión necesita al menos una carga para guardarse')
      return
    }
    if (isDraft) {
      onUpdateTrucks(trucks.map(t => (t.id === truck.id ? { ...t, draft: false, updatedAt: Date.now() } : t)), [truck.id])
    } else {
      // Deletes FIRST, loads array LAST — evita carreras y resurrección de filas.
      const r = commitPendingArrays(trucks, truckLoads, truck.id)
      r.deleteLoadIds.forEach(id => onDeleteTruckLoad(id))
      onUpdateTrucks(r.trucks, [truck.id])
      onUpdateTruckLoads(r.loads, r.changedLoadIds)
    }
    toast.success(`Camión ${truck.code} guardado`)
  }

  const handleCancel = () => {
    if (isDraft) {
      // Cancelar un borrador nuevo = borrar el camión entero (las cargas se liberan).
      if (!window.confirm(`¿Descartar el borrador ${truck.code}? Se borra el camión y se liberan sus cargas.`)) return
      onDeleteTruck(truck.id)
      onBack()
      return
    }
    const r = discardPendingArrays(trucks, truckLoads, truck.id)
    r.deleteLoadIds.forEach(id => onDeleteTruckLoad(id))
    onUpdateTrucks(r.trucks, [truck.id])
    onUpdateTruckLoads(r.loads, r.changedLoadIds)
    toast.info('Cambios descartados')
  }

  const handleExportPdf = async () => {
    try {
      await exportTruckPdf(merged, loads, totals)
      toast.success('PDF generado')
    } catch (err: any) {
      console.error(err)
      toast.error(`Error al generar PDF: ${err?.message || 'sin detalles'}`)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft size={16} className="mr-1.5" />
          Volver
        </Button>
        <h2 className="text-2xl font-bold">{merged.code}</h2>
        <Badge variant="outline" className={derivedInfo.hoy ? 'animate-pulse font-semibold border-amber-400 text-amber-700' : ''} title="Estado automático: derivado de las fechas de carga/salida/arribo">
          {derivedInfo.label}
        </Badge>
        {merged.isSider && <Badge variant="outline">Sider</Badge>}
        {draftState === 'draft' && (
          <Badge className="bg-amber-100 text-amber-800 border-amber-300 border">BORRADOR</Badge>
        )}
        {draftState === 'pending' && (
          <Badge className="bg-orange-100 text-orange-800 border-orange-300 border">CAMBIOS SIN GUARDAR</Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={loads.length === 0}>
            <FilePdf size={14} className="mr-1.5" />
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {(totals.overKg || totals.overM3 || totals.multifiscal || healthIssues.length > 0 || specialLoads.noApilables.length > 0 || specialLoads.imos.length > 0 || specialLoads.sinTelex.length > 0) && (
        <div className="space-y-2">
          {specialLoads.sinTelex.length > 0 && (
            <AlertBanner kind="error">
              <Warning size={16} weight="fill" />
              🚨 Carga SIN TELEX en el camión: {specialLoads.sinTelex.join(', ')} — la naviera no liberó el documento; sin telex esa carga no se puede retirar. Reclamar la liberación antes de la fecha de carga.
            </AlertBanner>
          )}
          {specialLoads.noApilables.length > 0 && (
            <AlertBanner kind="warning">
              <Warning size={16} weight="fill" />
              📦 Carga NO APILABLE en el camión: {specialLoads.noApilables.join(', ')} — tiene que ir ARRIBA de todo, avisar al depósito.
            </AlertBanner>
          )}
          {specialLoads.imos.length > 0 && (
            <AlertBanner kind="error">
              <Warning size={16} weight="fill" />
              ☢️ Mercancía PELIGROSA (IMO) en el camión: {specialLoads.imos.join(', ')} — verificar compatibilidad de cargas y documentación del transporte.
            </AlertBanner>
          )}
          {totals.overKg && (
            <AlertBanner kind="error">
              <Warning size={16} weight="fill" />
              Peso total excede el límite del camión ({formatKg(totals.kg)} kg / máximo {formatKg(limits.kgMax)} kg).
            </AlertBanner>
          )}
          {totals.overM3 && (
            <AlertBanner kind="error">
              <Warning size={16} weight="fill" />
              Volumen total excede el límite del camión ({formatM3(totals.m3)} m³ / máximo {formatM3(limits.m3Max)} m³).
            </AlertBanner>
          )}
          {totals.multifiscal && (
            <AlertBanner kind="warning">
              <Warning size={16} weight="fill" />
              El camión tiene cargas con destinos fiscales distintos ({totals.fiscals.join(', ')}).
            </AlertBanner>
          )}
          {healthIssues.map((m, i) => (
            <AlertBanner key={i} kind="warning">
              <Warning size={16} weight="fill" />
              {m}
            </AlertBanner>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 items-start">
        {/* LEFT — Truck data + loads */}
        <div className="space-y-4">
          {/* Truck metadata card */}
          <Card>
            <CardContent className="p-4 space-y-4">
              {/* Status stepper — el estado REAL se deriva de las fechas; tocar
                  un estado es un atajo que completa la fecha de hoy si falta. */}
              <div className="flex items-center gap-2 flex-wrap">
                <Label className="text-xs text-muted-foreground">Estado:</Label>
                {([
                  { key: 'planning', label: 'Planificando' },
                  { key: 'in_transit', label: 'Cargado / Salió' },
                  { key: 'delivered', label: 'Entregado' },
                ] as { key: TruckStatus; label: string }[]).map(step => {
                  const active = step.key === 'in_transit'
                    ? (derivedStatus === 'in_transit' || derivedStatus === 'loaded')
                    : derivedStatus === step.key
                  return (
                    <Button
                      key={step.key}
                      size="sm"
                      variant={active ? 'default' : 'outline'}
                      onClick={() => setStatusWithDate(step.key)}
                      className="h-7 text-xs"
                    >
                      {step.label}
                    </Button>
                  )
                })}
                <div className="ml-auto flex items-center gap-1.5">
                  <Switch
                    id="is-sider"
                    checked={merged.isSider}
                    onCheckedChange={(v) => updateTruck({ isSider: v })}
                  />
                  <Label htmlFor="is-sider" className="text-xs cursor-pointer">Sider</Label>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground -mt-2">
                ⚡ Automático: al pasar la <strong>fecha de carga/salida</strong> el camión (y sus cargas) pasan a Cargado / Salió solos; al pasar el <strong>arribo a fiscal</strong>, a Entregado — y las cargas entran a Facturación. Tocar un estado completa la fecha de hoy.
              </p>

              <Separator />

              {/* Editable fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                <FieldCode truck={truck} trucks={trucks} onCommit={code => updateTruck({ code })} />
                <FieldText
                  label="Transporte"
                  value={merged.transport}
                  onChange={v => updateTruck({ transport: v })}
                  placeholder="Olaverry, PCS, Wildengold…"
                />
                <FieldText
                  label="Chofer"
                  value={merged.driver}
                  onChange={v => updateTruck({ driver: v })}
                />
                <FieldText
                  label="Patente"
                  value={merged.plate}
                  onChange={v => updateTruck({ plate: v })}
                />
                <FieldDate
                  label="Fecha de carga / salida"
                  value={merged.departureDate || merged.loadDate}
                  onChange={v => {
                    // Pedido de Brian: al PONER la fecha de carga, avisar si alguna
                    // carga del camión sigue sin telex (no bloquea el guardado).
                    if (v && specialLoads.sinTelex.length > 0) {
                      toast.warning(`🚨 Fecha de carga puesta con cargas SIN TELEX: ${specialLoads.sinTelex.join(', ')} — reclamar la liberación a la naviera.`, { duration: 8000 })
                    }
                    updateTruck({ loadDate: v, departureDate: v })
                  }}
                />
                <FieldDate
                  label="Arribo a fiscal"
                  value={merged.arrivalDate}
                  onChange={v => updateTruck({ arrivalDate: v })}
                />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Notas</Label>
                <Textarea
                  rows={2}
                  value={merged.notes}
                  onChange={(e) => updateTruck({ notes: e.target.value })}
                  placeholder="Restricciones, orden de carga, observaciones…"
                  className="mt-1 text-sm"
                />
              </div>

              {/* Costos del flete → USD por m³ del camión armado */}
              <div className="border-t pt-3 mt-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Costos del flete (USD)</div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ['costDespacho', 'Despacho'],
                    ['costFlete', 'Flete terrestre'],
                    ['costCarga', 'Carga s/ camión'],
                  ] as const).map(([key, label]) => (
                    <div key={key}>
                      <div className="text-[10px] text-muted-foreground">{label}</div>
                      <Input
                        type="number"
                        min={0}
                        value={merged[key] || ''}
                        onChange={e => updateTruck({ [key]: parseFloat(e.target.value) || 0 })}
                        className="h-8 text-sm"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
                <CostPerM3Indicator truck={truck} truckLoads={truckLoads} />
              </div>
            </CardContent>
          </Card>

          {/* Totals card */}
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                <TotalCell label="Cargas" value={String(totals.loadCount)} />
                <TotalCell label="Peso (kg)" value={formatKg(totals.kg)} hint={`/ ${formatKg(limits.kgMax)}`} over={totals.overKg} />
                <TotalCell label="Volumen (m³)" value={formatM3(totals.m3)} hint={`/ ${formatM3(limits.m3Max)}`} over={totals.overM3} />
                <TotalCell label="Bultos" value={formatPkgs(totals.pkgs)} />
                <TotalCell label="Fiscales" value={totals.fiscals.length === 0 ? '—' : totals.fiscals.length === 1 ? totals.fiscals[0] : `${totals.fiscals.length} dest.`} over={totals.multifiscal} />
              </div>
            </CardContent>
          </Card>

          {/* Loads table */}
          <Card>
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <h3 className="font-semibold text-sm">Cargas en el camión</h3>
                <span className="text-xs text-muted-foreground">{loads.length} {loads.length === 1 ? 'ref' : 'refs'}</span>
              </div>
              {allMine.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Aún no hay cargas. Agregalas desde el panel de la derecha.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2">Ref</th>
                        <th className="text-left px-3 py-2">Cliente</th>
                        <th className="text-left px-3 py-2">Fiscal</th>
                        <th className="text-right px-3 py-2">Kg</th>
                        <th className="text-right px-3 py-2">m³</th>
                        <th className="text-right px-3 py-2">Bultos</th>
                        <th className="text-left px-3 py-2">BL</th>
                        <th className="text-left px-3 py-2">Stock</th>
                        <th className="text-center px-3 py-2">Madera</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {allMine.map(l => (
                        <LoadRow
                          key={l.id}
                          load={l}
                          onChange={(patch, fields) => updateLoad(l.id, patch, fields)}
                          onResync={() => resyncFcl(l)}
                          onRemove={() => removeLoad(l)}
                          onUndoRemove={() => undoRemoveLoad(l)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT — Available loads panel */}
        <Card className="lg:sticky lg:top-4 lg:h-[calc(100vh-8rem)] flex flex-col">
          <AvailableLoadsPanel
            shipments={shipments}
            lclAir={lclAir}
            dbShipments={dbShipments}
            trucks={trucks}
            truckLoads={truckLoads}
            currentTruckId={truck.id}
            onAddFcl={addFcl}
            onAddLclAir={addLclAir}
            onAddDb={addDb}
            onCreateNew={onCreateShipment ? () => setNewCargoOpen(true) : undefined}
          />
        </Card>
      </div>

      {/* Choque de fechas: la carga ya tenía salida coordinada y el consolidado
          sale otro día. Se pregunta cuál manda — pisar en silencio dejaba la
          misma carga en dos días distintos de la agenda. */}
      <AlertDialog open={!!conflicto} onOpenChange={(o) => { if (!o) setConflicto(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {conflicto?.shipment.REF} ya tenía salida coordinada
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>Esta carga sale en una fecha y el consolidado en otra. Si las dejás
                  distintas, la vas a ver dos veces en la agenda.</p>
                <div className="rounded-md border divide-y text-[13px]">
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Coordinada en la carga</span>
                    <span className="font-medium">
                      sale {fmtDateDMY(conflicto?.datos.salidaCarga || '')}
                      {conflicto?.datos.fiscalCarga ? ` · fiscal ${fmtDateDMY(conflicto.datos.fiscalCarga)}` : ''}
                    </span>
                  </div>
                  <div className="flex justify-between px-3 py-2 bg-muted/40">
                    <span className="text-muted-foreground">Camión {merged.code}</span>
                    <span className="font-medium">
                      sale {fmtDateDMY(conflicto?.datos.salidaCamion || '')}
                      {conflicto?.datos.fiscalCamion ? ` · fiscal ${fmtDateDMY(conflicto.datos.fiscalCamion)}` : ''}
                    </span>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={() => setConflicto(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
              onClick={() => {
                if (!conflicto) return
                agregarFcl(conflicto.shipment, conflicto.cntr)
                toast.info(`${conflicto.shipment.REF} sube al camión con su fecha original`)
                setConflicto(null)
              }}
            >
              Dejar la carga como estaba
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                if (!conflicto) return
                const { shipment, cntr, datos } = conflicto
                const id = (shipment as unknown as { id?: string }).id
                if (id && onPatchShipment) {
                  // La fecha del camión pasa a ser la real: se escribe en el
                  // array por contenedor (el server recalcula las columnas).
                  const buscado = cntr.trim().toUpperCase()
                  const ops = (shipment.operativas || []).map(o =>
                    (!buscado || String(o.CNTR_OP || '').trim().toUpperCase() === buscado)
                      ? { ...o, SALIDA: datos.salidaCamion, ETA_FISC: datos.fiscalCamion || o.ETA_FISC }
                      : o
                  )
                  onPatchShipment(id, { operativas: ops })
                  toast.success(`${shipment.REF} tomó las fechas del camión ${merged.code}`)
                } else {
                  toast.warning(`${shipment.REF} se agregó, pero no se pudieron actualizar sus fechas`)
                }
                agregarFcl(shipment, cntr)
                setConflicto(null)
              }}
            >
              Usar la fecha del consolidado
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alta de carga sin salir del armador (mismo diálogo que Operaciones) */}
      {onCreateShipment && (
        <NewShipmentDialog
          open={newCargoOpen}
          onOpenChange={setNewCargoOpen}
          operators={operators || []}
          onCreate={handleCreateFromBuilder}
          suggestedRef={suggestedRef}
        />
      )}

      {/* Barra de estado + acciones del borrador */}
      <div className="sticky bottom-0 z-10 mt-4 -mx-1 rounded-lg border bg-card/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-3 shadow-lg">
        <span className="text-xs font-medium">
          {draftState === 'draft' && <span className="text-amber-700">🟡 BORRADOR — no publicado</span>}
          {draftState === 'pending' && <span className="text-orange-700">🟠 CAMBIOS SIN GUARDAR</span>}
          {!draftState && <span className="text-green-700">✓ Guardado</span>}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={!draftState}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!draftState} className="gap-1.5">
            💾 Guardar camión
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Cost indicator component ──

function CostPerM3Indicator({ truck, truckLoads }: { truck: Truck; truckLoads: TruckLoad[] }) {
  const { total, m3, perM3 } = truckCostPerM3(truck, truckLoads)
  if (perM3 === null) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        {total > 0 ? 'Agregá cargas con m³ para ver el costo por m³.' : 'Cargá los costos para ver el USD/m³.'}
      </p>
    )
  }
  return (
    <div className={`mt-2 rounded-lg border px-3 py-2 flex items-baseline justify-between ${COST_STYLES[costColor(perM3)]}`}>
      <span className="text-lg font-bold tabular-nums">
        USD {perM3.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / m³
      </span>
      <span className="text-xs">
        {total.toLocaleString('es-UY')} USD ÷ {m3.toLocaleString('es-UY', { maximumFractionDigits: 1 })} m³
      </span>
    </div>
  )
}

// ── Row component ──

function LoadRow({
  load,
  onChange,
  onResync,
  onRemove,
  onUndoRemove,
}: {
  load: TruckLoad
  onChange: (patch: Partial<TruckLoad>, fields: string[]) => void
  onResync: () => void
  onRemove: () => void
  onUndoRemove: () => void
}) {
  const ov = load.overrides || {}
  const Icon = load.sourceType === 'fcl' ? TruckIcon : load.sourceType === 'lcl' ? Boat : Airplane
  const isRemoved = load.pending === 'remove'
  const isNew = load.pending === 'add'
  return (
    <tr className={`hover:bg-muted/30 ${isRemoved ? 'opacity-50' : ''}`}>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Icon size={12} className="text-primary shrink-0" weight="fill" />
          <span className={`font-medium ${isRemoved ? 'line-through' : ''}`}>{load.sourceRef}</span>
          {isNew && (
            <span className="text-[9px] font-bold bg-blue-100 text-blue-700 rounded px-1 py-0.5 uppercase tracking-wide">NUEVA</span>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground uppercase">
          {load.sourceType}
          {load.cntr && <span className="ml-1 font-mono normal-case text-foreground/70">{load.cntr}</span>}
        </div>
      </td>
      <td className={`px-3 py-2 ${isRemoved ? 'line-through' : ''}`}>
        <InlineInput
          value={load.client}
          onChange={v => onChange({ client: v }, ['client'])}
          modified={ov.client}
          placeholder="—"
          className="w-32"
          disabled={isRemoved}
        />
      </td>
      <td className={`px-3 py-2 ${isRemoved ? 'line-through' : ''}`}>
        <InlineInput
          value={load.fiscal}
          onChange={v => onChange({ fiscal: v }, ['fiscal'])}
          modified={ov.fiscal}
          placeholder="—"
          className="w-32"
          disabled={isRemoved}
        />
      </td>
      <td className="px-3 py-2 text-right">
        <InlineNumber
          value={load.kg}
          onChange={v => onChange({ kg: v }, ['kg'])}
          modified={ov.kg}
          className="w-20 text-right"
          disabled={isRemoved}
        />
      </td>
      <td className="px-3 py-2 text-right">
        <InlineNumber
          value={load.m3}
          onChange={v => onChange({ m3: v }, ['m3'])}
          modified={ov.m3}
          step={0.1}
          className="w-16 text-right"
          disabled={isRemoved}
        />
      </td>
      <td className="px-3 py-2 text-right">
        <InlineNumber
          value={load.pkgs}
          onChange={v => onChange({ pkgs: Math.round(v) }, ['pkgs'])}
          modified={ov.pkgs}
          step={1}
          className="w-16 text-right"
          disabled={isRemoved}
        />
      </td>
      <td className="px-3 py-2">
        <InlineInput
          value={load.bl}
          onChange={v => onChange({ bl: v }, ['bl'])}
          modified={ov.bl}
          placeholder="BL"
          className="w-32"
          disabled={isRemoved}
        />
      </td>
      <td className="px-3 py-2">
        <InlineInput
          value={load.stock}
          onChange={v => onChange({ stock: v }, ['stock'])}
          modified={ov.stock}
          placeholder="Stock"
          className="w-28"
          disabled={isRemoved}
        />
      </td>
      <td className="px-3 py-2 text-center">
        <input
          type="checkbox"
          checked={!!load.wood}
          onChange={e => onChange({ wood: e.target.checked }, ['wood'])}
          disabled={isRemoved}
          title="¿Lleva madera?"
          className="h-4 w-4 cursor-pointer accent-[#1e3a8a] disabled:cursor-not-allowed"
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1 justify-end">
          {isRemoved ? (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={onUndoRemove} title="Deshacer eliminación">
              Deshacer
            </Button>
          ) : (
            <>
              {load.sourceType === 'fcl' && (
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onResync} title="Re-sincronizar desde planilla">
                  <ArrowsClockwise size={12} />
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={onRemove} title="Quitar del camión">
                <Trash size={12} />
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Form atoms ──

// Código del consolidado: editable a mano, commit al salir del campo (blur/Enter).
// Valida vacío y unicidad contra los demás camiones; el backend re-valida y
// ajusta truck_counter para que el próximo código automático no choque.
function FieldCode({ truck, trucks, onCommit }: { truck: Truck; trucks: Truck[]; onCommit: (code: string) => void }) {
  const [draft, setDraft] = useState(truck.code)
  useEffect(() => { setDraft(truck.code) }, [truck.code])
  const commit = () => {
    const v = draft.trim().toUpperCase()
    if (!v) { setDraft(truck.code); return }
    if (v === truck.code) { setDraft(v); return }
    if (trucks.some(t => t.id !== truck.id && t.code === v)) {
      toast.error(`El código ${v} ya lo usa otro camión`)
      setDraft(truck.code)
      return
    }
    onCommit(v)
    toast.success(`Código del consolidado: ${v}`)
  }
  return (
    <div>
      <Label className="text-xs text-muted-foreground">Código (consolidado)</Label>
      <Input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() } }}
        placeholder="C440"
        className="mt-1 h-9 text-sm font-semibold"
      />
    </div>
  )
}

function FieldText({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="mt-1 h-9 text-sm" />
    </div>
  )
}

function FieldDate({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type="date" value={value || ''} onChange={e => onChange(e.target.value)} className="mt-1 h-9 text-sm" />
    </div>
  )
}

function TotalCell({ label, value, hint, over }: { label: string; value: string; hint?: string; over?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${over ? 'text-destructive' : ''}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  )
}

function InlineInput({
  value,
  onChange,
  type,
  placeholder,
  modified,
  className,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  modified?: boolean
  className?: string
  disabled?: boolean
}) {
  return (
    <div className="relative inline-flex items-center">
      <Input
        type={type}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`h-7 px-1.5 text-sm ${modified ? 'border-amber-500' : ''} ${className || ''}`}
      />
      {modified && (
        <span className="absolute -top-1 -right-1 text-amber-500 text-[10px]" title="Editado manualmente">*</span>
      )}
    </div>
  )
}

function InlineNumber({
  value,
  onChange,
  step,
  modified,
  className,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  modified?: boolean
  className?: string
  disabled?: boolean
}) {
  const [draft, setDraft] = useState<string>(value === 0 ? '' : String(value))
  // Sync external changes back into the draft
  useMemo(() => { setDraft(value === 0 ? '' : String(value)) }, [value])
  return (
    <div className="relative inline-flex items-center">
      <Input
        type="number"
        step={step}
        value={draft}
        disabled={disabled}
        onChange={e => {
          setDraft(e.target.value)
          const n = parseFloat(e.target.value)
          onChange(isFinite(n) ? n : 0)
        }}
        className={`h-7 px-1.5 text-sm ${modified ? 'border-amber-500' : ''} ${className || ''}`}
      />
      {modified && (
        <span className="absolute -top-1 -right-1 text-amber-500 text-[10px]" title="Editado manualmente">*</span>
      )}
    </div>
  )
}

function AlertBanner({ kind, children }: { kind: 'error' | 'warning' | 'info'; children: React.ReactNode }) {
  const colors = {
    error: 'bg-red-50 text-red-900 border-red-200',
    warning: 'bg-amber-50 text-amber-900 border-amber-200',
    info: 'bg-blue-50 text-blue-900 border-blue-200',
  }
  return (
    <div className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md border ${colors[kind]}`}>
      {children}
    </div>
  )
}

// Re-export so unused import warning doesn't trigger
void CheckCircle
