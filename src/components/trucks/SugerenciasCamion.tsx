/**
 * "Sugerencias para armar camión": qué LCL con stock conviene subir juntas, por
 * (fiscal argentino, depósito uruguayo), con los motivos al lado (prioridad del
 * cliente, almacenaje por vencer, días esperando) y la previsión de lo que llega
 * en la semana. Un botón arma el camión como BORRADOR con esas cargas y abre el
 * armador: nada se publica solo.
 *
 * El depósito de salida va bien visible en cada propuesta (mismos colores que
 * el mail de Próximas salidas). Si la carga no tiene depósito cargado, entra al
 * del agente (CRAFT→PLANIR, SACO→TCP) marcado como SUPUESTO; sin agente ni
 * depósito, queda en la lista "sin depósito" hasta que alguien lo complete.
 *
 * Toda la lógica vive en src/lib/lclSugerencias.ts (pura, con tests). Acá solo
 * se dibuja. La creación del camión + cargas la hace App
 * (onCreateTruckWithLoads) en UNA ventana de escritura, respetando la FK.
 */
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Lightbulb, CaretDown, CaretRight, Truck as TruckIcon, Star, Timer, Warning } from '@phosphor-icons/react'
import type { DbShipment } from '@/lib/operationsTypes'
import type { Truck, TruckLoad } from '@/lib/truckTypes'
import { TRUCK_LIMITS } from '@/lib/truckTypes'
import { makeEmptyTruck, truckLoadDesdeDb, formatKg, formatM3 } from '@/lib/truckUtils'
import { hoyISO } from '@/lib/format'
import { esLclMontevideo } from '@/lib/lclEstados'
import ChipDeposito from './ChipDeposito'
import {
  candidatasLcl, candidatasSinDeposito, sugerirCamiones, previsionPorFiscal,
  ALMACENAJE_POR_VENCER_DIAS, LLENO_PCT, MEDIO_PCT,
  type Propuesta, type Sugerencia, type PrevisionFiscal, type Candidata,
} from '@/lib/lclSugerencias'
import { codigoNuevoCamion } from './nuevoCamion'

interface SugerenciasCamionProps {
  dbShipments: DbShipment[]
  trucks: Truck[]
  truckLoads: TruckLoad[]
  /** App.handleCreateTruckWithLoads: camión + cargas en una sola ventana de
   *  escritura (el camión se guarda ANTES que las cargas por la FK). */
  onCreateTruckWithLoads?: (truck: Truck, loads: TruckLoad[]) => Promise<boolean>
  onOpenBuilder: (id: string) => void
}

const SUGERENCIA_UI: Record<Sugerencia, { label: string; cls: string }> = {
  salir: { label: 'Sale', cls: 'bg-[var(--estado-ok-bg)] text-[var(--estado-ok-fg)] border-[var(--estado-ok-bd)]' },
  completar: { label: 'Completar', cls: 'bg-[var(--estado-hoy-bg)] text-[var(--estado-hoy-fg)] border-[var(--estado-hoy-bd)]' },
  esperar: { label: 'Esperar', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
}

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const diaCorto = (iso: string): string => {
  const [a, m, d] = iso.split('-').map(Number)
  const f = new Date(a, m - 1, d)
  return `${DIAS_CORTOS[f.getDay()]} ${String(d).padStart(2, '0')}`
}

const REF = (r: unknown): string => String(r ?? '').trim().toUpperCase()

function Barra({ label, valor, max, fmt }: { label: string; valor: number; max: number; fmt: (n: number) => string }) {
  const pct = max > 0 ? Math.min(1, valor / max) : 0
  const color = pct >= LLENO_PCT ? 'bg-green-500' : pct >= MEDIO_PCT ? 'bg-amber-500' : 'bg-slate-400'
  return (
    <div className="min-w-[9rem] flex-1">
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{fmt(valor)} / {fmt(max)}</span>
      </div>
      <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  )
}

export default function SugerenciasCamion({
  dbShipments, trucks, truckLoads, onCreateTruckWithLoads, onOpenBuilder,
}: SugerenciasCamionProps) {
  const [abierto, setAbierto] = useState(true)
  const [sider, setSider] = useState(false)
  const [armando, setArmando] = useState<string | null>(null)
  const hoy = hoyISO()

  // Una ref que ya está en un camión (borrador incluido: reserva la carga;
  // entregado incluido: ya viajó) no se vuelve a proponer. Una carga marcada
  // para QUITAR de un camión publicado ya no es de ese camión: vuelve a estar
  // disponible (mismo criterio que la bandeja de stock / registro LCL).
  const refsEnCamion = useMemo(() => {
    const out = new Set<string>()
    for (const l of truckLoads) {
      if (l.pending === 'remove') continue
      const r = REF(l.sourceRef)
      if (r) out.add(r)
    }
    return out
  }, [truckLoads])

  // Las que están reservadas en un BORRADOR: se dicen, no se esconden.
  const reservadasEnBorrador = useMemo(() => {
    const borradores = new Map(trucks.filter(t => t.draft).map(t => [t.id, t]))
    const out: { ref: string; truck: Truck }[] = []
    const vistas = new Set<string>()
    for (const l of truckLoads) {
      const t = borradores.get(l.truckId)
      if (!t) continue
      const r = REF(l.sourceRef)
      if (!r || vistas.has(r)) continue
      const s = dbShipments.find(x => REF(x.ref) === r)
      if (!s || !esLclMontevideo(s) || !String(s.stock || '').trim()) continue
      vistas.add(r)
      out.push({ ref: s.ref, truck: t })
    }
    return out
  }, [trucks, truckLoads, dbShipments])

  const limites = sider ? TRUCK_LIMITS.sider : TRUCK_LIMITS.standard
  const candidatas = useMemo(() => candidatasLcl(dbShipments, { hoy, refsEnCamion }), [dbShipments, hoy, refsEnCamion])
  const sinDeposito = useMemo(() => candidatasSinDeposito(candidatas), [candidatas])
  const propuestas = useMemo(() => sugerirCamiones(candidatas, { limites }), [candidatas, limites])
  const prevision = useMemo(() => previsionPorFiscal(dbShipments, { hoy, dias: 7, refsEnCamion }), [dbShipments, hoy, refsEnCamion])

  const armar = async (p: Propuesta<DbShipment>) => {
    if (armando) return
    if (!onCreateTruckWithLoads) {
      toast.error('No se puede armar el camión desde acá: falta la conexión con el guardado.')
      return
    }
    setArmando(p.id)
    try {
      const code = await codigoNuevoCamion(trucks)
      const truck: Truck = { ...makeEmptyTruck(code), isSider: sider }
      const loads = p.cargas.map((c, i) => truckLoadDesdeDb(truck.id, c.fuente, i, null))
      // App guarda camión → cargas en una sola ventana de escritura y avisa si
      // algo falló (revierte el optimista); acá solo se abre el armador si salió.
      const ok = await onCreateTruckWithLoads(truck, loads)
      if (!ok) return
      toast.success(`Borrador ${code} armado con ${loads.length} carga${loads.length === 1 ? '' : 's'} para ${p.fiscal} desde ${p.depositos.join(' + ')}`)
      onOpenBuilder(truck.id)
    } catch (err: any) {
      toast.error(`No se pudo armar el camión: ${err?.message || 'error desconocido'}`)
    } finally {
      setArmando(null)
    }
  }

  const nBases = propuestas.filter(p => !p.alternativa).length
  const resumen = propuestas.length === 0
    ? (candidatas.length === 0 ? 'Sin LCL con stock para proponer' : 'Hay LCL con stock pero ninguna entra en un camión')
    : `${nBases} propuesta${nBases === 1 ? '' : 's'} · ${candidatas.length} LCL con stock`

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setAbierto(o => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        {abierto ? <CaretDown size={14} /> : <CaretRight size={14} />}
        <Lightbulb size={16} weight="fill" className="text-amber-500" />
        <span className="text-sm font-semibold">Sugerencias para armar camión</span>
        <span className="text-xs text-muted-foreground">· {resumen}</span>
        {sinDeposito.length > 0 && (
          <span className="text-xs text-amber-700">· {sinDeposito.length} sin depósito</span>
        )}
      </button>

      {abierto && (
        <div className="space-y-4 border-t border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>Un camión por fiscal argentino y depósito uruguayo de salida. Orden: prioridad del cliente → almacenaje por vencer → más días esperando.</span>
            <div className="ml-auto flex items-center gap-2">
              <Switch id="sug-sider" checked={sider} onCheckedChange={setSider} />
              <Label htmlFor="sug-sider" className="text-xs">Sider ({formatKg(TRUCK_LIMITS.sider.kgMax)} kg · {formatM3(TRUCK_LIMITS.sider.m3Max)} m³)</Label>
            </div>
          </div>

          {propuestas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {candidatas.length === 0
                ? 'Cuando una LCL tenga stock cargado (pestaña Aguarda stock) aparece acá con su propuesta de camión.'
                : sinDeposito.length === candidatas.length
                  ? 'Las LCL con stock no tienen depósito cargado: completalo (o el agente) para que aparezca la propuesta.'
                  : `Con stock: ${candidatas.map(c => c.ref).join(', ')} — ninguna entra en el límite elegido.`}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {propuestas.map(p => (
                <PropuestaCard
                  key={p.id}
                  p={p}
                  limites={limites}
                  armando={armando === p.id}
                  bloqueado={!!armando}
                  onArmar={() => armar(p)}
                />
              ))}
            </div>
          )}

          {sinDeposito.length > 0 && <ListaSinDeposito cargas={sinDeposito} />}

          {reservadasEnBorrador.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {reservadasEnBorrador.length} con stock reservada{reservadasEnBorrador.length === 1 ? '' : 's'} en borrador:{' '}
              {reservadasEnBorrador.map((r, i) => (
                <span key={r.ref}>
                  {i > 0 && ', '}
                  {r.ref}{' '}
                  <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => onOpenBuilder(r.truck.id)}>
                    ({r.truck.code})
                  </button>
                </span>
              ))}
              . Publicalo o descartalo para que vuelvan a proponerse.
            </p>
          )}

          {prevision.length > 0 && <TablaPrevision prevision={prevision} />}
        </div>
      )}
    </div>
  )
}

function ListaSinDeposito({ cargas }: { cargas: Candidata<DbShipment>[] }) {
  return (
    <div className="rounded-lg border border-dashed border-amber-400 bg-amber-50/40 p-3 dark:bg-amber-500/5">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-400">
        <Warning size={13} weight="fill" />
        Sin depósito, completar antes de armar · {cargas.length}
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Tienen stock pero no dicen de qué depósito salen y el agente no lo sugiere. Cargá el depósito de desconsolidación (HOY LCL → Datos faltantes) y entran a su propuesta.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {cargas.map(c => (
          <span key={c.ref} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs">
            <span className="font-semibold">{c.ref}</span>
            <span className="text-muted-foreground truncate max-w-[10rem]">{c.cliente || '—'}</span>
            <span className="text-muted-foreground">→ {c.fiscal}</span>
            <span className="tabular-nums text-muted-foreground">{formatM3(c.m3)} m³</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function PropuestaCard({ p, limites, armando, bloqueado, onArmar }: {
  p: Propuesta<DbShipment>
  limites: { kgMax: number; m3Max: number }
  armando: boolean
  bloqueado: boolean
  onArmar: () => void
}) {
  const ui = SUGERENCIA_UI[p.sugerencia]
  // Qué depósitos de la propuesta entraron por supuesto (para punteado del chip).
  const supuestoPorDeposito = new Map<string, string | null>()
  for (const c of p.cargas) {
    if (c.depositoSupuesto && !supuestoPorDeposito.has(c.deposito)) supuestoPorDeposito.set(c.deposito, c.agenteDeposito)
  }
  const soloSupuesto = (d: string) => p.cargas.filter(c => c.deposito === d).every(c => c.depositoSupuesto)
  return (
    <div className={`rounded-lg border p-3 ${p.alternativa ? 'border-dashed bg-muted/30' : 'border-border'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold">{p.fiscal}</span>
        <span className="text-xs text-muted-foreground">desde</span>
        {p.depositos.map((d, i) => (
          <ChipDeposito
            key={d}
            deposito={d}
            extra={i > 0}
            supuesto={soloSupuesto(d)}
            agente={supuestoPorDeposito.get(d) ?? null}
          />
        ))}
        {p.alternativa && <span className="text-[11px] text-amber-800">una parada más</span>}
        <Badge className={`ml-auto border ${ui.cls}`}>{ui.label}</Badge>
      </div>

      <div className="mt-2 flex flex-wrap gap-3">
        <Barra label="m³" valor={p.m3} max={limites.m3Max} fmt={formatM3} />
        <Barra label="kg" valor={p.kg} max={limites.kgMax} fmt={formatKg} />
      </div>

      {p.motivos.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs">
          {p.motivos.map(m => <li key={m} className="text-foreground/90">• {m}</li>)}
        </ul>
      )}

      <div className="mt-2 divide-y divide-border rounded-md border text-xs">
        {p.cargas.map(c => (
          <div key={c.ref} className="flex flex-wrap items-center gap-2 px-2 py-1">
            <span className="font-semibold">{c.ref}</span>
            <span className="text-muted-foreground truncate max-w-[10rem]">{c.cliente || '—'}</span>
            {c.depositoSupuesto && (
              <span className="text-[10px] text-amber-800" title={`Depósito sin cargar: supuesto por agente ${c.agenteDeposito || ''}`}>
                depósito supuesto
              </span>
            )}
            <span className="ml-auto tabular-nums">{formatM3(c.m3)} m³ · {formatKg(c.kg)} kg</span>
            {c.prioridad && <span title="Prioridad del cliente"><Star size={12} weight="fill" className="text-amber-500" /></span>}
            {c.almacenaje && c.almacenaje.diasRestantes <= ALMACENAJE_POR_VENCER_DIAS && (
              <span title={`Almacenaje vence ${c.almacenaje.vence}`}>
                <Timer size={12} weight="fill" className={c.almacenaje.vencido ? 'text-red-600' : 'text-orange-600'} />
              </span>
            )}
            {c.imo && <span title="IMO"><Warning size={12} weight="fill" className="text-red-600" /></span>}
            {c.diasEsperando !== null && c.diasEsperando > 0 && (
              <span className="text-muted-foreground">{c.diasEsperando}d</span>
            )}
          </div>
        ))}
      </div>
      {p.noEntran.length > 0 && (
        <p className="mt-1 text-[11px] text-muted-foreground">No entran por kg/m³: {p.noEntran.join(', ')}</p>
      )}

      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={onArmar} disabled={bloqueado} className="gap-1.5">
          <TruckIcon size={14} weight="fill" />
          {armando ? 'Armando…' : 'Armar camión con estas'}
        </Button>
      </div>
    </div>
  )
}

function TablaPrevision({ prevision }: { prevision: PrevisionFiscal[] }) {
  const fechas = prevision[0]?.llegadas.map(l => l.fecha) ?? []
  const celda = (v: { total: number; porDeposito: Record<string, number> }) => {
    if (!v.total) return <span className="text-muted-foreground/50">—</span>
    const deps = Object.entries(v.porDeposito)
    return (
      <span title={deps.map(([d, m]) => `${d}: ${formatM3(m)} m³`).join(' · ')}>
        <span className="font-semibold tabular-nums">{formatM3(v.total)}</span>
        {deps.length > 1 && <span className="ml-0.5 text-[10px] text-muted-foreground">({deps.length} dep.)</span>}
      </span>
    )
  }
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold">Previsión por fiscal · m³ · próximos 7 días</h4>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-[11px] text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left">Fiscal</th>
              <th className="px-2 py-1.5 text-left">Depósitos</th>
              <th className="px-2 py-1.5 text-right">Con stock</th>
              <th className="px-2 py-1.5 text-right" title="Llegó y el depósito todavía no dio el stock">Sin stock</th>
              {fechas.map(f => <th key={f} className="px-2 py-1.5 text-right whitespace-nowrap">{diaCorto(f)}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {prevision.map(f => (
              <tr key={f.fiscal}>
                <td className="px-2 py-1.5 font-semibold">{f.fiscal}</td>
                <td className="px-2 py-1.5">
                  <span className="flex flex-wrap gap-1">
                    {f.depositos.map(d => <ChipDeposito key={d} deposito={d} />)}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right">{celda(f.conStock)}</td>
                <td className="px-2 py-1.5 text-right">{celda(f.sinStock)}</td>
                {f.llegadas.map(l => (
                  <td key={l.fecha} className="px-2 py-1.5 text-right">
                    {l.total ? <span className="text-blue-700">+{celda(l)}</span> : celda(l)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Lo que llega sale de la ETA a Montevideo, tenga stock o no: es previsión, no disponibilidad. Pasá el mouse para ver el desglose por depósito.
      </p>
    </div>
  )
}
