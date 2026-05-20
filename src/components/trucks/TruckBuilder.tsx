import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import {
  TRUCK_STATUS_LABELS,
  computeTruckTotals,
  getTruckLimits,
} from '@/lib/truckTypes'
import {
  formatKg,
  formatM3,
  formatPkgs,
  newId,
  prefillFclFromShipment,
  getTruckHealthIssues,
} from '@/lib/truckUtils'
import AvailableLoadsPanel from './AvailableLoadsPanel'
import { exportTruckPdf } from '@/lib/truckExport'

interface TruckBuilderProps {
  truck: Truck
  trucks: Truck[]
  truckLoads: TruckLoad[]
  lclAir: LclAirShipment[]
  shipments: ParsedShipment[]
  onBack: () => void
  onUpdateTrucks: (trucks: Truck[]) => void
  onUpdateTruckLoads: (loads: TruckLoad[]) => void
  onDeleteTruckLoad: (id: string) => void
}

export default function TruckBuilder(props: TruckBuilderProps) {
  const { truck, trucks, truckLoads, lclAir, shipments, onBack, onUpdateTrucks, onUpdateTruckLoads, onDeleteTruckLoad } = props

  // Loads currently in this truck (sorted by position)
  const loads = useMemo(
    () => truckLoads
      .filter(l => l.truckId === truck.id)
      .sort((a, b) => a.position - b.position),
    [truckLoads, truck.id]
  )

  const totals = useMemo(() => computeTruckTotals(truck, loads), [truck, loads])
  const limits = getTruckLimits(truck.isSider)
  const healthIssues = useMemo(() => getTruckHealthIssues(truck, loads), [truck, loads])

  // ── Truck-level update helpers ──
  const updateTruck = (patch: Partial<Truck>) => {
    const updated = { ...truck, ...patch, updatedAt: Date.now() }
    onUpdateTrucks(trucks.map(t => t.id === truck.id ? updated : t))
  }

  const updateLoad = (loadId: string, patch: Partial<TruckLoad>, markOverrides: string[] = []) => {
    const next = truckLoads.map(l => {
      if (l.id !== loadId) return l
      const overrides = { ...(l.overrides || {}) }
      for (const k of markOverrides) overrides[k] = true
      return { ...l, ...patch, overrides }
    })
    onUpdateTruckLoads(next)
  }

  // ── Add from panel ──
  const addFcl = (s: ParsedShipment) => {
    const prefill = prefillFclFromShipment(s)
    const load: TruckLoad = {
      id: newId('load'),
      truckId: truck.id,
      sourceType: 'fcl',
      sourceRef: s.REF,
      client: prefill.client,
      fiscal: prefill.fiscal,
      kg: prefill.kg,
      m3: prefill.m3,
      pkgs: prefill.pkgs,
      description: prefill.description,
      mvdArrival: prefill.mvdArrival,
      desconsolDate: prefill.desconsolDate,
      overrides: {},
      position: loads.length,
    }
    onUpdateTruckLoads([...truckLoads, load])
    toast.success(`${s.REF} agregado al camión`)
  }

  const addLclAir = (s: LclAirShipment) => {
    const load: TruckLoad = {
      id: newId('load'),
      truckId: truck.id,
      sourceType: s.modality,
      sourceRef: s.ref,
      client: s.client,
      fiscal: s.fiscal,
      kg: s.kg,
      m3: s.m3,
      pkgs: s.pkgs,
      description: s.description,
      mvdArrival: s.etaMvd,
      desconsolDate: s.desconsolDate,
      overrides: {},
      position: loads.length,
    }
    onUpdateTruckLoads([...truckLoads, load])
    toast.success(`${s.ref} agregado al camión`)
  }

  // ── Re-sync FCL load from current planilla data ──
  const resyncFcl = (load: TruckLoad) => {
    const s = shipments.find(x => x.REF === load.sourceRef)
    if (!s) {
      toast.error(`${load.sourceRef} ya no está en la planilla`)
      return
    }
    const prefill = prefillFclFromShipment(s)
    updateLoad(load.id, {
      client: prefill.client,
      fiscal: prefill.fiscal,
      kg: prefill.kg,
      m3: prefill.m3,
      pkgs: prefill.pkgs,
      description: prefill.description,
      mvdArrival: prefill.mvdArrival,
      desconsolDate: prefill.desconsolDate,
    })
    // Clear all overrides — values now match planilla
    const next = truckLoads.map(l => l.id === load.id ? { ...l, overrides: {} } : l)
    onUpdateTruckLoads(next)
    toast.success(`${load.sourceRef} re-sincronizado desde planilla`)
  }

  const removeLoad = (loadId: string) => {
    onDeleteTruckLoad(loadId)
  }

  const handleExportPdf = async () => {
    try {
      await exportTruckPdf(truck, loads, totals)
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
        <h2 className="text-2xl font-bold">{truck.code}</h2>
        <Badge variant="outline">{TRUCK_STATUS_LABELS[truck.status]}</Badge>
        {truck.isSider && <Badge variant="outline">Sider</Badge>}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={loads.length === 0}>
            <FilePdf size={14} className="mr-1.5" />
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {(totals.overKg || totals.overM3 || totals.multifiscal || healthIssues.length > 0) && (
        <div className="space-y-2">
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
              {/* Status stepper */}
              <div className="flex items-center gap-2 flex-wrap">
                <Label className="text-xs text-muted-foreground">Estado:</Label>
                {(['planning', 'loaded', 'in_transit', 'delivered'] as TruckStatus[]).map(st => (
                  <Button
                    key={st}
                    size="sm"
                    variant={truck.status === st ? 'default' : 'outline'}
                    onClick={() => updateTruck({ status: st })}
                    className="h-7 text-xs"
                  >
                    {TRUCK_STATUS_LABELS[st]}
                  </Button>
                ))}
                <div className="ml-auto flex items-center gap-1.5">
                  <Switch
                    id="is-sider"
                    checked={truck.isSider}
                    onCheckedChange={(v) => updateTruck({ isSider: v })}
                  />
                  <Label htmlFor="is-sider" className="text-xs cursor-pointer">Sider</Label>
                </div>
              </div>

              <Separator />

              {/* Editable fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                <FieldText
                  label="Transporte"
                  value={truck.transport}
                  onChange={v => updateTruck({ transport: v })}
                  placeholder="Olaverry, PCS, Wildengold…"
                />
                <FieldText
                  label="Chofer"
                  value={truck.driver}
                  onChange={v => updateTruck({ driver: v })}
                />
                <FieldText
                  label="Patente"
                  value={truck.plate}
                  onChange={v => updateTruck({ plate: v })}
                />
                <FieldDate
                  label="Fecha de carga"
                  value={truck.loadDate}
                  onChange={v => updateTruck({ loadDate: v })}
                />
                <FieldDate
                  label="Fecha de salida"
                  value={truck.departureDate}
                  onChange={v => updateTruck({ departureDate: v })}
                />
                <FieldDate
                  label="Arribo a fiscal"
                  value={truck.arrivalDate}
                  onChange={v => updateTruck({ arrivalDate: v })}
                />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Notas</Label>
                <Textarea
                  rows={2}
                  value={truck.notes}
                  onChange={(e) => updateTruck({ notes: e.target.value })}
                  placeholder="Restricciones, orden de carga, observaciones…"
                  className="mt-1 text-sm"
                />
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
              {loads.length === 0 ? (
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
                        <th className="text-left px-3 py-2">ETA MVD</th>
                        <th className="text-left px-3 py-2">Desconsol.</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {loads.map(l => (
                        <LoadRow
                          key={l.id}
                          load={l}
                          onChange={(patch, fields) => updateLoad(l.id, patch, fields)}
                          onResync={() => resyncFcl(l)}
                          onRemove={() => removeLoad(l.id)}
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
        <Card className="lg:sticky lg:top-4 h-[calc(100vh-8rem)] flex flex-col">
          <AvailableLoadsPanel
            shipments={shipments}
            lclAir={lclAir}
            trucks={trucks}
            truckLoads={truckLoads}
            currentTruckId={truck.id}
            onAddFcl={addFcl}
            onAddLclAir={addLclAir}
          />
        </Card>
      </div>
    </div>
  )
}

// ── Row component ──

function LoadRow({
  load,
  onChange,
  onResync,
  onRemove,
}: {
  load: TruckLoad
  onChange: (patch: Partial<TruckLoad>, fields: string[]) => void
  onResync: () => void
  onRemove: () => void
}) {
  const ov = load.overrides || {}
  const Icon = load.sourceType === 'fcl' ? TruckIcon : load.sourceType === 'lcl' ? Boat : Airplane
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Icon size={12} className="text-primary shrink-0" weight="fill" />
          <span className="font-medium">{load.sourceRef}</span>
        </div>
        <div className="text-[10px] text-muted-foreground uppercase">{load.sourceType}</div>
      </td>
      <td className="px-3 py-2">
        <InlineInput
          value={load.client}
          onChange={v => onChange({ client: v }, ['client'])}
          modified={ov.client}
          placeholder="—"
          className="w-32"
        />
      </td>
      <td className="px-3 py-2">
        <InlineInput
          value={load.fiscal}
          onChange={v => onChange({ fiscal: v }, ['fiscal'])}
          modified={ov.fiscal}
          placeholder="—"
          className="w-32"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <InlineNumber
          value={load.kg}
          onChange={v => onChange({ kg: v }, ['kg'])}
          modified={ov.kg}
          className="w-20 text-right"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <InlineNumber
          value={load.m3}
          onChange={v => onChange({ m3: v }, ['m3'])}
          modified={ov.m3}
          step={0.1}
          className="w-16 text-right"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <InlineNumber
          value={load.pkgs}
          onChange={v => onChange({ pkgs: v }, ['pkgs'])}
          modified={ov.pkgs}
          className="w-16 text-right"
        />
      </td>
      <td className="px-3 py-2">
        <InlineInput
          type="date"
          value={load.mvdArrival}
          onChange={v => onChange({ mvdArrival: v }, ['mvdArrival'])}
          modified={ov.mvdArrival}
          className="w-32"
        />
      </td>
      <td className="px-3 py-2">
        <InlineInput
          type="date"
          value={load.desconsolDate}
          onChange={v => onChange({ desconsolDate: v }, ['desconsolDate'])}
          modified={ov.desconsolDate}
          className="w-32"
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1 justify-end">
          {load.sourceType === 'fcl' && (
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onResync} title="Re-sincronizar desde planilla">
              <ArrowsClockwise size={12} />
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={onRemove} title="Quitar del camión">
            <Trash size={12} />
          </Button>
        </div>
      </td>
    </tr>
  )
}

// ── Form atoms ──

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
}: {
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  modified?: boolean
  className?: string
}) {
  return (
    <div className="relative inline-flex items-center">
      <Input
        type={type}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
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
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  modified?: boolean
  className?: string
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
