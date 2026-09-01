/**
 * HOY para el equipo LCL (Marcos, Agustín, Agustina, Cata): las consolidadas
 * que vienen por Montevideo, en cinco cards. Todo derivado en el momento de
 * leer (hoyLcl.ts); acá no se guarda ningún estado.
 *
 * La regla que instala: el camión se arma con lo que está en la app; carga que
 * no está (o está incompleta) no viaja. Por eso lo que falta cargar es una card
 * más del HOY, no una pantalla aparte.
 *
 * Misma piel que TodayDashboard (cards accent-top, pill de conteo, variantes
 * Med por useBrand) para que el cambio de área no se sienta como otra app.
 */
import { useMemo, type ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Anchor, Package, Warehouse, Truck as TruckIcon, ListChecks, Warning, Star, Pause, CaretRight, Coffee,
} from '@phosphor-icons/react'
import type { DbShipment } from '@/lib/operationsTypes'
import type { Truck, TruckLoad } from '@/lib/truckTypes'
import { TRUCK_LIMITS, TRUCK_STATUS_COLORS } from '@/lib/truckTypes'
import {
  refsPorCamion, lclActivas, blDe, llegadasProximas, aguardanStock, listasParaCamion,
  camionesLcl, datosFaltantes, fechaISO,
  type LclRow, type ListaItem,
} from '@/lib/hoyLcl'
import BandejaStock from './trucks/BandejaStock'
import { useBrand } from '@/lib/brand'
import { fmtDateDMY } from '@/lib/format'
import { formatKg, formatM3 } from '@/lib/truckUtils'

interface HoyLclProps {
  dbShipments: DbShipment[]
  trucks?: Truck[]
  truckLoads?: TruckLoad[]
  isDataLoading?: boolean
  onPatchShipment?: (id: string, fields: Record<string, unknown>) => void
  /** Abre la ficha completa de la carga (clave = id de la fila en shipments). */
  onOpenDetail?: (key: string) => void
  onOpenTab?: (tab: string) => void
}

const DIAS_VENTANA = 7

/** "mié 2 sep" en minúsculas, sin puntos ni comas del locale. */
function diaCorto(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d)
    .toLocaleDateString('es-UY', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/[.,]/g, '')
}

export default function HoyLcl({
  dbShipments, trucks = [], truckLoads = [], isDataLoading = false,
  onPatchShipment, onOpenDetail, onOpenTab,
}: HoyLclProps) {
  const med = useBrand().id === 'med'
  const hoyISO = fechaISO(new Date())

  const porCamion = useMemo(() => refsPorCamion(trucks, truckLoads), [trucks, truckLoads])
  const activas = useMemo(() => lclActivas(dbShipments, porCamion.despachadas), [dbShipments, porCamion])
  const llegadas = useMemo(() => llegadasProximas(activas, hoyISO, DIAS_VENTANA), [activas, hoyISO])
  const esperandoStock = useMemo(() => aguardanStock(activas, hoyISO, porCamion.enCamion), [activas, hoyISO, porCamion])
  const listas = useMemo(() => listasParaCamion(activas, hoyISO, porCamion.enCamion), [activas, hoyISO, porCamion])
  const camiones = useMemo(() => camionesLcl(trucks, truckLoads, new Date()), [trucks, truckLoads])
  const faltantes = useMemo(() => datosFaltantes(activas), [activas])

  const llegadasTotal = llegadas.reduce((n, d) => n + d.total, 0)
  const listasTotal = listas.reduce((n, g) => n + g.cargas + g.standBy, 0)
  const listasM3 = listas.reduce((n, g) => n + g.m3, 0)

  const todayLabel = new Date().toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '')
  const sinNada = activas.length === 0 && camiones.length === 0

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            <span className={med ? 'titulo-med text-med-violeta' : 'text-muted-foreground/70 font-semibold'}>Hoy LCL</span>
            <span className="text-muted-foreground/50 font-normal mx-2">·</span>
            <span className={med ? 'text-lg font-normal text-med-gris' : ''}>{todayLabel}</span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <Chip label={`${activas.length} LCL activa${activas.length === 1 ? '' : 's'} por Montevideo`} tone="muted" />
            {listasTotal > 0 && <Chip label={`${formatM3(listasM3)} m³ listos para camión`} tone="ok" />}
            {esperandoStock.length > 0 && <Chip label={`${esperandoStock.length} sin stock`} tone="warn" />}
            {faltantes.total > 0 && <Chip label={`${faltantes.total} con datos faltantes`} tone="destructive" />}
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            El camión se arma con lo que está acá. Carga que no está, o está incompleta, no viaja.
          </p>
        </div>
      </div>

      {isDataLoading && sinNada && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <p className="text-lg font-semibold text-foreground">Cargando consolidadas…</p>
            <p className="text-sm mt-1">Trayendo las LCL y los camiones.</p>
          </CardContent>
        </Card>
      )}

      {!isDataLoading && sinNada && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Coffee size={36} weight="duotone" className="mb-3 opacity-60" />
            <p className="text-lg font-semibold text-foreground">Sin LCL activas por Montevideo</p>
            <p className="text-sm mt-1">Cuando el equipo dé de alta una consolidada, aparece acá con lo que le falte.</p>
            {onOpenTab && (
              <Button variant="outline" size="sm" className="mt-4" onClick={() => onOpenTab('trucks')}>
                Ir al registro LCL <CaretRight size={14} className="ml-1" />
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 1. Llegan a Montevideo ───────────────────────── */}
      <CardLcl
        icon={<Anchor size={18} weight="fill" />}
        tone="info"
        title={`Llegan a Montevideo · hoy y próximos ${DIAS_VENTANA} días`}
        subtitle="Por día de arribo y destino fiscal. Las que llegan sin fiscal o sin BL ya vienen marcadas: completalas antes de que estén en el puerto."
        count={llegadasTotal}
        badges={llegadas.reduce((n, d) => n + d.incompletas, 0) > 0 ? [{ text: `${llegadas.reduce((n, d) => n + d.incompletas, 0)} incompletas`, tone: 'warn' }] : []}
        empty="No llega ninguna LCL en la semana. Si esperás alguna y no está, dala de alta."
      >
        <div className="space-y-3">
          {llegadas.map(dia => (
            <div key={dia.fecha}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`text-xs font-bold uppercase tracking-wide ${dia.esHoy ? (med ? 'text-med-violeta' : 'text-sky-700') : 'text-muted-foreground'}`}>
                  {dia.esHoy ? 'HOY' : diaCorto(dia.fecha)}
                </span>
                <span className="text-[11px] text-muted-foreground">{fmtDateDMY(dia.fecha)} · {dia.total} carga{dia.total === 1 ? '' : 's'}</span>
              </div>
              <div className="space-y-1.5">
                {dia.grupos.map(g => (
                  <div key={g.fiscal ?? '__sin'} className={med ? 'rounded-lg border border-med-info-borde bg-white px-3 py-2' : 'rounded-lg border border-border/60 bg-background/50 px-3 py-2'}>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs mb-1">
                      <span className="font-semibold">{g.fiscal ?? 'SIN FISCAL'}</span>
                      <span className="text-muted-foreground">{formatM3(g.m3)} m³ · {formatKg(g.kg)} kg · {g.cargas.length} carga{g.cargas.length === 1 ? '' : 's'}</span>
                    </div>
                    <div className="divide-y divide-border/50">
                      {g.cargas.map(c => (
                        <FilaCarga key={c.row.id} row={c.row} onOpenDetail={onOpenDetail}>
                          {c.sinFiscal && <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 dark:text-amber-400">sin fiscal</Badge>}
                          {c.sinBL && <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 dark:text-amber-400">sin BL</Badge>}
                        </FilaCarga>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardLcl>

      {/* ── 2. Aguardan stock ────────────────────────────── */}
      <CardLcl
        icon={<Package size={18} weight="fill" />}
        tone="warn"
        title="Aguardan stock"
        subtitle="Llegaron y el depósito todavía no dio el stock. Tipeá el número y Enter: al cargarlo quedan listas para camión y arranca el reloj de almacenaje."
        count={esperandoStock.length}
        badges={esperandoStock.filter(x => x.diasDesdeEta > 7).length > 0 ? [{ text: `${esperandoStock.filter(x => x.diasDesdeEta > 7).length} hace más de 7 días`, tone: 'destructive' }] : []}
        empty="Nada esperando stock. Cuando llegue una LCL sin stock, aparece acá."
      >
        <BandejaStock
          embebida
          dbShipments={activas as DbShipment[]}
          refsEnCamion={porCamion.enCamion}
          onPatch={(id, fields) => onPatchShipment?.(id, fields)}
        />
      </CardLcl>

      {/* ── 3. Con stock, listas para camión ─────────────── */}
      <CardLcl
        icon={<Warehouse size={18} weight="fill" />}
        tone="ok"
        title="Con stock, listas para camión"
        subtitle="Por destino fiscal y depósito de carga. Prioridad va primero; stand by queda a la vista pero fuera del total. Un camión standard lleva hasta 62 m³ / 26.500 kg (sider 80 m³ / 24.500 kg)."
        count={listasTotal}
        badges={[
          ...(listas.some(g => g.almacenajeApura) ? [{ text: 'almacenaje apura', tone: 'destructive' as const }] : []),
          ...(listas.some(g => g.prioridad) ? [{ text: 'hay prioridad', tone: 'warn' as const }] : []),
        ]}
        empty="Ninguna carga con stock esperando camión. Las que tienen stock y ya están en un camión se ven abajo."
      >
        <div className="space-y-3">
          {listas.map(g => {
            const supera = g.m3 > TRUCK_LIMITS.standard.m3Max || g.kg > TRUCK_LIMITS.standard.kgMax
            return (
              <div key={g.fiscal ?? '__sin'} className={med ? 'rounded-lg border border-med-info-borde bg-white px-3 py-2.5' : 'rounded-lg border border-border/60 bg-background/50 px-3 py-2.5'}>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mb-1.5">
                  <span className="font-semibold text-sm">{g.fiscal ?? 'SIN FISCAL'}</span>
                  {g.prioridad && <Badge className="text-[10px] bg-amber-500 text-white hover:bg-amber-500"><Star size={10} weight="fill" className="mr-1" />prioridad</Badge>}
                  {g.almacenajeApura && <Badge variant="destructive" className="text-[10px]">almacenaje apura</Badge>}
                  <span className="ml-auto text-xs tabular-nums">
                    <b>{formatM3(g.m3)} m³</b> · {formatKg(g.kg)} kg · {g.cargas} carga{g.cargas === 1 ? '' : 's'}
                    {g.standBy > 0 && <span className="text-muted-foreground"> · {g.standBy} stand by</span>}
                  </span>
                </div>
                {supera && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mb-1.5">
                    Supera un camión standard: son al menos dos, o un sider si es volumen.
                  </p>
                )}
                <div className="space-y-1.5">
                  {g.depositos.map(d => (
                    <div key={d.deposito ?? '__sin'}>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-0.5">
                        <span className="font-semibold uppercase">{d.deposito ?? 'sin depósito'}</span>
                        <span>{formatM3(d.m3)} m³ · {formatKg(d.kg)} kg</span>
                        {g.depositos.length > 1 && d !== g.depositos[0] && <span className="italic">una parada más</span>}
                      </div>
                      <div className="divide-y divide-border/50">
                        {d.items.map(it => (
                          <FilaCarga key={it.row.id} row={it.row} onOpenDetail={onOpenDetail} apagada={it.marca === 'stand_by'}>
                            <RelojesLista it={it} />
                          </FilaCarga>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </CardLcl>

      {/* ── 4. Camiones LCL ──────────────────────────────── */}
      <CardLcl
        icon={<TruckIcon size={18} weight="fill" />}
        tone="neutral"
        title="Camiones LCL"
        subtitle="Publicados con alguna consolidada, hasta que llegan a fiscal. La ocupación es sobre el límite del tipo de camión."
        count={camiones.length}
        empty="Ningún camión con carga LCL en curso."
        action={onOpenTab ? { label: 'Armar camión', onClick: () => onOpenTab('trucks') } : undefined}
      >
        <div className="space-y-2">
          {camiones.map(c => {
            const otros = c.loads.length - c.lclRefs.length
            return (
              <div key={c.truck.id} className={med ? 'rounded-lg border border-med-info-borde bg-white px-3 py-2.5' : 'rounded-lg border border-border/60 bg-background/50 px-3 py-2.5'}>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <button type="button" className="font-semibold text-sm hover:underline" onClick={() => onOpenTab?.('trucks')}>
                    🚛 {c.truck.code}
                  </button>
                  <Badge variant="outline" className={`text-[10px] ${TRUCK_STATUS_COLORS[c.info.status] || ''} ${c.info.hoy ? 'font-bold' : ''}`}>{c.info.label}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {c.truck.transport || 'Sin transporte'}
                    {c.truck.isSider ? ' · sider' : ''}
                    {c.totals.fiscals.length > 0 ? ` · → ${c.totals.fiscals.join(' + ')}` : ''}
                  </span>
                  <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                    {c.truck.loadDate ? `carga ${fmtDateDMY(c.truck.loadDate)}` : 'sin fecha de carga'}
                    {c.truck.departureDate ? ` · sale ${fmtDateDMY(c.truck.departureDate)}` : ''}
                  </span>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <Ocupacion label="m³" valor={c.totals.m3} pct={c.totals.m3Pct} over={c.totals.overM3} fmt={formatM3} />
                  <Ocupacion label="kg" valor={c.totals.kg} pct={c.totals.kgPct} over={c.totals.overKg} fmt={formatKg} />
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 truncate" title={c.lclRefs.join(', ')}>
                  LCL: {c.lclRefs.join(', ')}
                  {otros > 0 ? ` · +${otros} carga${otros === 1 ? '' : 's'} no LCL` : ''}
                  {c.totals.multifiscal ? ' · multifiscal' : ''}
                </p>
              </div>
            )
          })}
        </div>
      </CardLcl>

      {/* ── 5. Datos faltantes ───────────────────────────── */}
      <CardLcl
        icon={<ListChecks size={18} weight="fill" />}
        tone={faltantes.total > 0 ? 'destructive' : 'neutral'}
        title="Datos faltantes"
        subtitle="LCL activas a las que les falta algo para viajar. Tocá la referencia para completar en su ficha."
        count={faltantes.total}
        empty="Todas las LCL activas tienen cliente, ETA, fiscal, BL, kilos y m³."
      >
        <div className="space-y-2.5">
          {faltantes.porCampo.map(g => (
            <div key={g.campo}>
              <div className="flex items-center gap-2 text-xs mb-1">
                <Warning size={13} weight="fill" className={med ? 'text-med-error' : 'text-destructive'} />
                <span className="font-semibold">{g.label}</span>
                <span className="text-muted-foreground">· {g.rows.length}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.rows.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onOpenDetail?.(r.id)}
                    title={`Completar ${g.label.toLowerCase()} de ${r.ref}`}
                    className={med
                      ? 'inline-flex items-center gap-1 rounded-md border border-med-info-borde bg-white px-2 py-1 text-xs hover:bg-med-pastel'
                      : 'inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted'}
                  >
                    <span className="font-semibold">{r.ref}</span>
                    {r.cliente ? <span className="text-muted-foreground truncate max-w-[10rem]">{r.cliente}</span> : null}
                    <CaretRight size={11} className="text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardLcl>
    </div>
  )
}

// ─── Piezas ──────────────────────────────────────────────────────────────

type Tone = 'info' | 'warn' | 'ok' | 'destructive' | 'neutral'

const TONO: Record<Tone, { bar: string; card: string; cardMed: string; icon: string; iconMed: string; pill: string; pillMed: string }> = {
  info:        { bar: 'rgb(14 165 233)',    card: 'bg-sky-500/[0.04] border-sky-500/25',       cardMed: 'bg-med-info-tinte border-2 border-med-info-borde',   icon: 'bg-sky-500/10 text-sky-600',     iconMed: 'bg-med-violeta/10 text-med-violeta', pill: 'bg-sky-500 text-white',    pillMed: 'bg-med-violeta text-med-celeste' },
  warn:        { bar: 'rgb(245 158 11)',    card: 'bg-amber-500/[0.04] border-amber-500/25',   cardMed: 'bg-med-aviso-tinte border-2 border-med-aviso-borde', icon: 'bg-amber-500/10 text-amber-600', iconMed: 'bg-med-aviso/10 text-med-aviso-texto', pill: 'bg-amber-500 text-white', pillMed: 'bg-med-violeta text-med-celeste' },
  ok:          { bar: 'rgb(16 185 129)',    card: 'bg-emerald-500/[0.04] border-emerald-500/25', cardMed: 'bg-med-info-tinte border-2 border-med-info-borde', icon: 'bg-emerald-500/10 text-emerald-600', iconMed: 'bg-med-violeta/10 text-med-violeta', pill: 'bg-emerald-500 text-white', pillMed: 'bg-med-violeta text-med-celeste' },
  destructive: { bar: 'var(--destructive)', card: 'bg-destructive/[0.04] border-destructive/25', cardMed: 'bg-med-aviso-tinte border-2 border-med-aviso-borde', icon: 'bg-destructive/10 text-destructive', iconMed: 'bg-med-error/10 text-med-error', pill: 'bg-destructive text-white', pillMed: 'bg-med-error text-white' },
  neutral:     { bar: 'var(--muted-foreground)', card: '',                                    cardMed: 'border-2 border-med-info-borde',                    icon: 'bg-muted text-foreground',       iconMed: 'bg-med-violeta/10 text-med-violeta', pill: 'bg-muted text-foreground', pillMed: 'bg-med-violeta text-med-celeste' },
}

function CardLcl({ icon, tone, title, subtitle, count, badges = [], empty, action, children }: {
  icon: ReactNode
  tone: Tone
  title: string
  subtitle: string
  count: number
  badges?: { text: string; tone: 'warn' | 'destructive' }[]
  empty: string
  action?: { label: string; onClick: () => void }
  children: ReactNode
}) {
  const med = useBrand().id === 'med'
  const t = TONO[tone]
  return (
    <Card
      className={med ? `overflow-hidden ${t.cardMed}` : `accent-top overflow-hidden ${t.card}`}
      style={{ ['--bar-color' as any]: t.bar }}
    >
      <CardContent className="pt-5 pb-4">
        <div className="flex flex-wrap items-center gap-2.5 mb-1">
          <div className={`p-1.5 rounded-md ${med ? t.iconMed : t.icon}`}>{icon}</div>
          <h2 className={med ? 'titulo-med text-[17px] text-med-violeta' : 'text-sm font-semibold uppercase tracking-wide'}>
            {title}
          </h2>
          {badges.map(b => (
            <span
              key={b.text}
              className={b.tone === 'destructive'
                ? (med ? 'inline-flex items-center text-xs font-bold text-med-error bg-med-error/10 border border-med-error/30 rounded-full px-2 py-0.5' : 'inline-flex items-center text-xs font-bold text-red-700 bg-red-500/10 border border-red-500/30 rounded-full px-2 py-0.5')
                : (med ? 'inline-flex items-center text-xs font-bold text-med-aviso-texto bg-med-aviso/10 border border-med-aviso/30 rounded-full px-2 py-0.5' : 'inline-flex items-center text-xs font-bold text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-0.5')}
            >
              {b.text}
            </span>
          ))}
          <div className="ml-auto flex items-center gap-2">
            {action && (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={action.onClick}>
                {action.label} <CaretRight size={12} className="ml-1" />
              </Button>
            )}
            <span className={`inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full text-xs font-bold tabular-nums ${med ? t.pillMed : t.pill}`}>
              {count}
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-2.5">{subtitle}</p>
        {count === 0
          ? <div className="py-6 text-center text-xs text-muted-foreground italic">{empty}</div>
          : children}
      </CardContent>
    </Card>
  )
}

function Chip({ label, tone }: { label: string; tone: 'muted' | 'ok' | 'warn' | 'destructive' }) {
  const cls = tone === 'destructive'
    ? 'bg-destructive/10 text-destructive border-destructive/30'
    : tone === 'warn'
      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
      : tone === 'ok'
        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
        : 'bg-muted text-muted-foreground border-border'
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
}

/** Una carga en una fila: ref (abre la ficha) · cliente · m³ · kg · BL + lo que
 *  cada card quiera sumar a la derecha. */
function FilaCarga({ row, onOpenDetail, apagada = false, children }: {
  row: LclRow
  onOpenDetail?: (key: string) => void
  apagada?: boolean
  children?: ReactNode
}) {
  const bl = blDe(row)
  return (
    <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 py-1.5 ${apagada ? 'opacity-60' : ''}`}>
      <button type="button" onClick={() => onOpenDetail?.(row.id)} className="ref-med text-sm font-semibold hover:underline">
        {row.ref}
      </button>
      <span className="text-xs truncate max-w-[12rem]" title={row.cliente || ''}>{row.cliente || <i className="text-muted-foreground">sin cliente</i>}</span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatM3(Number(row.m3) || 0)} m³ · {formatKg(Number(row.kg) || 0)} kg{row.pkgs ? ` · ${row.pkgs} blt` : ''}
      </span>
      <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[10rem]" title={bl}>{bl || '—'}</span>
      {row.wood === true && <Badge variant="outline" className="text-[10px]">madera</Badge>}
      {row.imo && <Badge variant="outline" className="text-[10px] border-red-400 text-red-700">IMO</Badge>}
      <span className="ml-auto flex flex-wrap items-center gap-1.5">{children}</span>
    </div>
  )
}

/** Los relojes de una candidata: días esperando, almacenaje y la marca del cliente. */
function RelojesLista({ it }: { it: ListaItem }) {
  const alm = it.almacenaje
  return (
    <>
      {it.marca === 'prioridad' && (
        <Badge className="text-[10px] bg-amber-500 text-white hover:bg-amber-500" title={it.row.marca_motivo || ''}>
          <Star size={10} weight="fill" className="mr-1" />prioridad{it.row.marca_motivo ? `: ${it.row.marca_motivo}` : ''}
        </Badge>
      )}
      {it.marca === 'stand_by' && (
        <Badge variant="outline" className="text-[10px]" title={it.row.marca_motivo || ''}>
          <Pause size={10} weight="fill" className="mr-1" />stand by{it.row.marca_motivo ? `: ${it.row.marca_motivo}` : ''}
        </Badge>
      )}
      {it.diasEsperando !== null && (
        <span className={`text-[11px] tabular-nums ${it.diasEsperando > 7 ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
          esperando {it.diasEsperando}d
        </span>
      )}
      {alm && (
        <span className={`text-[11px] tabular-nums ${alm.vencido ? 'font-bold text-destructive' : alm.diasRestantes <= 5 ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
          {alm.vencido
            ? `almacenaje vencido hace ${Math.abs(alm.diasRestantes)}d`
            : `almacenaje vence ${fmtDateDMY(alm.vence)}${alm.diasRestantes <= 5 ? ` (${alm.diasRestantes}d)` : ''}`}
        </span>
      )}
      {!alm && it.diasEsperando === null && (
        <span className="text-[11px] text-muted-foreground italic">sin fecha de stock</span>
      )}
    </>
  )
}

function Ocupacion({ label, valor, pct, over, fmt }: { label: string; valor: number; pct: number; over: boolean; fmt: (n: number) => string }) {
  const p = Math.min(100, Math.round(pct * 100))
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] tabular-nums">
        <span className="text-muted-foreground">{label}</span>
        <span className={over ? 'font-bold text-destructive' : ''}>{fmt(valor)} · {Math.round(pct * 100)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-0.5">
        <div className={`h-full rounded-full ${over ? 'bg-destructive' : p >= 85 ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${p}%` }} />
      </div>
    </div>
  )
}
