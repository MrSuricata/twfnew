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
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Anchor, Package, Warehouse, Truck as TruckIcon, ListChecks, Star, Pause, CaretRight, Coffee, Check,
} from '@phosphor-icons/react'
import type { DbShipment } from '@/lib/operationsTypes'
import { DEPOSITOS_UY } from '@/lib/operationsTypes'
import type { Truck, TruckLoad } from '@/lib/truckTypes'
import { TRUCK_LIMITS, TRUCK_STATUS_COLORS } from '@/lib/truckTypes'
import {
  refsPorCamion, lclActivas, blDe, llegadasProximas, aguardanStock, listasParaCamion,
  camionesLcl, datosFaltantes, patchFaltanteLcl, CAMPO_FALTANTE_LABEL, DIAS_CAMION_RECIENTE,
  type LclRow, type ListaItem, type FaltantesPorCarga, type CampoFaltanteLcl,
  filtrarPorCampoFaltante,
} from '@/lib/hoyLcl'
import { FISCALES_BASE } from '@/lib/lclAlta'
import type { DatoClave } from '@/lib/datosClave'
import BandejaStock from './trucks/BandejaStock'
import ChipDeposito from './trucks/ChipDeposito'
import { useBrand } from '@/lib/brand'
import { saludoPersonal } from '@/lib/saludo'
import { getAdminName } from '@/lib/authClient'
import { fmtDateDMY, hoyISO as hoyLocal } from '@/lib/format'
import { formatKg, formatM3 } from '@/lib/truckUtils'
import AvisosPartnersCard from './AvisosPartnersCard'

interface HoyLclProps {
  dbShipments: DbShipment[]
  trucks?: Truck[]
  truckLoads?: TruckLoad[]
  isDataLoading?: boolean
  /** PATCH real de `shipments` (App.handlePatchShipment). Obligatorio: la
   *  bandeja de stock y los datos faltantes guardan desde acá. */
  onPatchShipment: (id: string, fields: Record<string, unknown>) => void
  /** Abre la ficha completa de la carga (clave = id de la fila en shipments). */
  onOpenDetail?: (key: string) => void
  onOpenTab?: (tab: string) => void
  /** Recarga TODO desde la DB (App.loadDataFromDB). La card de avisos de
   *  partners lo llama al confirmar "desconsolidé": el stock queda en
   *  `shipments` y la LCL tiene que pasar a "con stock" sin F5. */
  onReloadFromDB?: () => Promise<void>
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
  onPatchShipment, onOpenDetail, onOpenTab, onReloadFromDB,
}: HoyLclProps) {
  const med = useBrand().id === 'med'
  // Para ubicar los avisos `senasa` por el modo de la ref (ver avisosDeArea).
  const shipmentsModo = useMemo(() => dbShipments.map(s => ({ ref: s.ref, mode: s.mode })), [dbShipments])
  // La ref de un aviso de partner abre el panel de la carga (Brian 03/09:
  // "apretar donde dice A8050 y que se abra el modal, linkeado"). Acá la clave
  // del overlay es el id de la fila: la ref sola solo resuelve FCL.
  const abrirCargaPorRef = useCallback((ref: string) => {
    const buscada = String(ref || '').trim().toUpperCase()
    const fila = dbShipments.find(s => String(s.ref || '').trim().toUpperCase() === buscada)
    onOpenDetail?.(fila?.id || ref)
  }, [dbShipments, onOpenDetail])
  // Fecha LOCAL (misma que la bandeja de stock): con UTC, de noche "hoy" ya era mañana.
  const hoyISO = hoyLocal()

  const porCamion = useMemo(() => refsPorCamion(trucks, truckLoads), [trucks, truckLoads])
  const activas = useMemo(() => lclActivas(dbShipments, porCamion.despachadas), [dbShipments, porCamion])
  const llegadas = useMemo(() => llegadasProximas(activas, hoyISO, DIAS_VENTANA), [activas, hoyISO])
  const esperandoStock = useMemo(() => aguardanStock(activas, hoyISO, porCamion.enCamion), [activas, hoyISO, porCamion])
  const listas = useMemo(() => listasParaCamion(activas, hoyISO, porCamion.enCamion), [activas, hoyISO, porCamion])
  const camiones = useMemo(() => camionesLcl(trucks, truckLoads, new Date()), [trucks, truckLoads])
  const faltantes = useMemo(() => datosFaltantes(activas, hoyISO, DIAS_VENTANA), [activas, hoyISO])
  // Qué dato faltante se está mirando ('fiscal', 'kg'…). null = todos.
  const [soloFalta, setSoloFalta] = useState<string | null>(null)
  const faltantesVisibles = useMemo(
    () => filtrarPorCampoFaltante(faltantes.porCarga, soloFalta),
    [faltantes.porCarga, soloFalta],
  )
  // El fiscal es el que más duele: sin él la carga no entra a ninguna
  // sugerencia de camión (Brian 03/09). Se avisa aparte, con el motivo.
  const sinFiscal = faltantes.porCampo.find(g => g.campo === 'fiscal')?.rows.length ?? 0
  // Fiscales ya usados → datalist del input inline (misma semilla que el alta).
  const knownFiscales = useMemo(
    () => Array.from(new Set([...FISCALES_BASE, ...dbShipments.map(s => String(s.fiscal || '').trim().toUpperCase()).filter(Boolean)])).sort(),
    [dbShipments],
  )

  // Qué carga de "Datos faltantes" está desplegada (una a la vez).
  const [faltanteAbierta, setFaltanteAbierta] = useState<string | null>(null)

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
          <p className="text-sm text-muted-foreground mb-0.5">{saludoPersonal(getAdminName())}</p>
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

      {/* ── Avisos de partners (desconsolide + senasa de refs LCL) ── */}
      <AvisosPartnersCard
        area="lcl"
        shipmentsModo={shipmentsModo}
        onResuelto={onReloadFromDB}
        onAbrirCarga={onOpenDetail ? abrirCargaPorRef : undefined}
      />

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
          dbShipments={activas}
          refsEnCamion={porCamion.enCamion}
          onPatch={onPatchShipment}
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
                        {d.deposito
                          ? <ChipDeposito deposito={d.deposito} supuesto={d.supuesto} className="text-[10px] h-5" />
                          : <span className="font-semibold uppercase">sin depósito</span>}
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
        subtitle={`Publicados con alguna consolidada, hasta que llegan a fiscal (los que salieron hace más de ${DIAS_CAMION_RECIENTE} días ya no son de hoy). La ocupación es sobre el límite del tipo de camión.`}
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
        subtitle="Bultos, kilos, m³, fiscal, madera, llegada a Montevideo y depósito de desconsolidación: tocá la carga y completalo acá mismo. Primero las que ya llegaron o llegan esta semana. IMO y entrega en planta se marcan con la tilde."
        count={faltantes.total}
        badges={faltantes.porCampo.map(g => ({
          text: `${g.rows.length} ${g.label.toLowerCase()}`,
          tone: 'warn' as const,
          activo: soloFalta === g.campo,
          onClick: () => setSoloFalta(prev => (prev === g.campo ? null : g.campo)),
        }))}
        empty="Todas las LCL activas tienen bultos, kilos, m³, fiscal, madera confirmada, llegada a Montevideo y depósito."
      >
        <div className="space-y-1">
          {sinFiscal > 0 && (
            <div className={med
              ? 'mb-2 rounded-md border border-med-aviso-borde bg-med-aviso-tinte px-3 py-2 text-xs text-med-aviso-texto'
              : 'mb-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800'}>
              <b>Por favor completá los fiscales.</b>{' '}
              {sinFiscal === 1 ? 'Hay 1 carga sin destino fiscal' : `Hay ${sinFiscal} cargas sin destino fiscal`}: sin ese dato no entran a las sugerencias de camión ni a la previsión por destino.{' '}
              <button
                type="button"
                onClick={() => setSoloFalta(prev => (prev === 'fiscal' ? null : 'fiscal'))}
                className="font-semibold underline underline-offset-2"
              >
                {soloFalta === 'fiscal' ? 'Ver todas las faltantes' : 'Ver solo esas'}
              </button>
            </div>
          )}
          {soloFalta && (
            <div className="mb-1 text-[11px] text-muted-foreground">
              Mostrando {faltantesVisibles.length} de {faltantes.porCarga.length} ·{' '}
              <button type="button" onClick={() => setSoloFalta(null)} className="underline underline-offset-2">quitar filtro</button>
            </div>
          )}
          {faltantesVisibles.map((fc, i) => {
            const primeraNoUrgente = !fc.urgente && (i === 0 || faltantesVisibles[i - 1].urgente)
            return (
              <div key={fc.row.id}>
                {primeraNoUrgente && faltantes.urgentes > 0 && (
                  <div className="mt-2 mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Llegan más adelante</div>
                )}
                <FilaFaltante
                  fc={fc}
                  dbRow={dbShipments.find(s => s.id === fc.row.id)}
                  expanded={faltanteAbierta === fc.row.id}
                  onToggle={() => setFaltanteAbierta(prev => (prev === fc.row.id ? null : fc.row.id))}
                  onPatchShipment={onPatchShipment}
                  onOpenDetail={onOpenDetail}
                  knownFiscales={knownFiscales}
                  med={med}
                />
              </div>
            )
          })}
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
  badges?: { text: string; tone: 'warn' | 'destructive'; onClick?: () => void; activo?: boolean }[]
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
          {badges.map(b => {
            const clase = b.tone === 'destructive'
              ? (med ? 'text-med-error bg-med-error/10 border-med-error/30' : 'text-red-700 bg-red-500/10 border-red-500/30')
              : (med ? 'text-med-aviso-texto bg-med-aviso/10 border-med-aviso/30' : 'text-amber-700 bg-amber-500/10 border-amber-500/30')
            const base = `inline-flex items-center text-xs font-bold border rounded-full px-2 py-0.5 ${clase}`
            // Con onClick el contador filtra la lista: "147 sin destino fiscal"
            // deja de ser un número y pasa a ser la forma de ir a completarlos.
            return b.onClick
              ? (
                <button
                  key={b.text}
                  type="button"
                  onClick={b.onClick}
                  aria-pressed={!!b.activo}
                  title={b.activo ? 'Quitar el filtro' : `Ver solo las de "${b.text}"`}
                  className={`${base} transition-shadow hover:opacity-80 ${b.activo ? 'ring-2 ring-offset-1 ring-current' : ''}`}
                >
                  {b.text}{b.activo ? ' ✕' : ''}
                </button>
              )
              : <span key={b.text} className={base}>{b.text}</span>
          })}
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

/**
 * Una carga incompleta: la fila se despliega con UN input por dato faltante
 * (mismo patrón que "Llegan con datos incompletos" de HOY FCL: borrador local,
 * commit en blur/Enter, nunca onChange→PATCH). Los completados quedan como
 * chip ✓ mientras la fila siga abierta para que nada se mueva bajo el foco.
 * Madera se elige con dos botones (Sí / No), el depósito sugerido por el
 * agente se acepta con un click, e IMO / entrega en planta son tildes que
 * escriben al toque (false es un valor: no se reclaman).
 */
function FilaFaltante({ fc, dbRow, expanded, onToggle, onPatchShipment, onOpenDetail, knownFiscales, med }: {
  fc: FaltantesPorCarga
  dbRow?: DbShipment
  expanded: boolean
  onToggle: () => void
  onPatchShipment: (id: string, fields: Record<string, unknown>) => void
  onOpenDetail?: (key: string) => void
  knownFiscales: string[]
  med: boolean
}) {
  // Snapshot de los faltantes al ABRIR: input si sigue faltando, chip ✓ si ya
  // se completó (si desaparecieran al instante, el layout se corre bajo el
  // puntero). Solo importa el instante de abrir — el snapshot es a propósito.
  const [camposPanel, setCamposPanel] = useState<DatoClave[] | null>(null)
  useEffect(() => {
    if (expanded) setCamposPanel(prev => prev ?? fc.faltan)
    else setCamposPanel(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])
  const row = dbRow ?? (fc.row as DbShipment)

  const diasLabel = fc.diasAEta === null
    ? 'sin llegada'
    : fc.diasAEta < 0 ? `llegó hace ${-fc.diasAEta}d` : fc.diasAEta === 0 ? 'llega hoy' : `llega en ${fc.diasAEta}d`

  const patch = (fields: Record<string, unknown>, etiqueta: string, valor: string) => {
    const previos = Object.fromEntries(Object.keys(fields).map(k => [k, (row as unknown as Record<string, unknown>)[k]]))
    onPatchShipment(row.id, fields)
    toast.success(`${etiqueta} guardado · ${row.ref}`, {
      description: valor,
      action: { label: 'Deshacer', onClick: () => onPatchShipment(row.id, previos) },
    })
  }

  const filaCls = med
    ? `rounded-lg border border-med-info-borde bg-white ${expanded ? '' : 'hover:bg-med-pastel/40'}`
    : `rounded-lg border border-border/60 ${expanded ? 'bg-destructive/[0.04]' : 'bg-background/50 hover:bg-muted/60'}`

  return (
    <div className={filaCls}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-2 text-left"
      >
        <CaretRight size={12} weight="bold" className={`shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <span className="ref-med text-sm font-semibold">{row.ref}</span>
        <span className="text-xs truncate max-w-[12rem]" title={row.cliente || ''}>{row.cliente || <i className="text-muted-foreground">sin cliente</i>}</span>
        <span className="text-xs text-amber-700 dark:text-amber-400 truncate">
          faltan: {fc.faltan.map(d => d.label.toLowerCase()).join(', ')}
        </span>
        <span className={`ml-auto text-[11px] font-semibold tabular-nums ${fc.urgente ? (med ? 'text-med-error' : 'text-destructive') : 'text-muted-foreground'}`}>{diasLabel}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pl-8">
          <div className="flex flex-wrap items-end gap-2">
            {(camposPanel ?? fc.faltan).map(d => {
              const sigueFaltando = fc.faltan.some(x => x.key === d.key)
              if (!sigueFaltando) {
                const v = (row as unknown as Record<string, unknown>)[d.key]
                const texto = d.key === 'wood' ? (v === true ? 'Sí' : 'No') : String(v ?? '')
                return (
                  <span key={d.key} className="inline-flex items-center gap-1 h-9 rounded border border-emerald-500/30 bg-emerald-500/[0.07] px-2 text-sm text-emerald-700 dark:text-emerald-400">
                    <Check size={13} weight="bold" />
                    <span className="text-[11px] uppercase tracking-wide opacity-70">{d.label}</span>
                    <span className="font-medium truncate max-w-[160px]">{texto || '✓'}</span>
                  </span>
                )
              }
              if (d.key === 'wood') {
                return (
                  <div key={d.key} className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">{d.label}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-9 px-3" onClick={() => patch({ wood: true }, d.label, 'Sí — SENASA')}>Sí</Button>
                      <Button size="sm" variant="outline" className="h-9 px-3" onClick={() => patch({ wood: false }, d.label, 'No')}>No</Button>
                    </div>
                  </div>
                )
              }
              return (
                <div key={d.key} className="flex flex-col gap-1">
                  <InputFaltante
                    campo={d.key as CampoFaltanteLcl}
                    dato={d}
                    row={row}
                    knownFiscales={knownFiscales}
                    onCommit={(fields, valor) => patch(fields, d.label, valor)}
                  />
                  {d.key === 'deposito' && fc.depositoSugerido && (
                    <button
                      type="button"
                      onClick={() => patch({ deposito: fc.depositoSugerido!.deposito }, d.label, `${fc.depositoSugerido!.deposito} (agente ${fc.depositoSugerido!.agente})`)}
                      className="inline-flex items-center gap-1.5 self-start rounded-md border border-dashed border-border px-2 py-1 text-[11px] hover:bg-muted"
                      title="Regla: las que vienen con CRAFT normalmente desconsolidan en PLANIR; las de SACO, en TCP. Se guarda solo si hacés click."
                    >
                      Sugerido:
                      <ChipDeposito deposito={fc.depositoSugerido.deposito} className="text-[10px] h-5" />
                      <span className="text-muted-foreground">(agente {fc.depositoSugerido.agente})</span>
                    </button>
                  )}
                </div>
              )
            })}

            {/* Tildes: no se reclaman, se editan */}
            <div className="flex flex-col gap-0.5 ml-2">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">Marcas</span>
              <div className="flex h-9 items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!row.imo}
                    onChange={e => patch({ imo: e.target.checked }, 'IMO', e.target.checked ? 'Sí' : 'No')}
                    className="h-4 w-4 accent-primary"
                  />
                  IMO
                </label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" title="Del fiscal va directo a la planta del cliente. Dos entregas en planta en el mismo camión se pisan.">
                  <input
                    type="checkbox"
                    checked={!!row.entrega_planta}
                    onChange={e => patch({ entrega_planta: e.target.checked }, 'Entrega en planta', e.target.checked ? 'Sí' : 'No')}
                    className="h-4 w-4 accent-primary"
                  />
                  🏭 Entrega en planta
                </label>
              </div>
            </div>
          </div>
          {onOpenDetail && (
            <button
              type="button"
              onClick={() => onOpenDetail(row.id)}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Abrir ficha completa →
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Un input por dato faltante: borrador local, commit en blur/Enter, Escape limpia. */
function InputFaltante({ campo, dato, row, knownFiscales, onCommit }: {
  campo: CampoFaltanteLcl
  dato: DatoClave
  row: DbShipment
  knownFiscales: string[]
  onCommit: (fields: Record<string, unknown>, valor: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [invalido, setInvalido] = useState(false)
  const commit = () => {
    const texto = draft.trim()
    if (!texto) return
    const r = patchFaltanteLcl(campo, texto)
    if (!r.ok) { setInvalido(true); toast.error(`${dato.label}: ${r.error}`, { description: String(row.ref) }); return }
    setInvalido(false)
    onCommit(r.patch, String(Object.values(r.patch)[0] ?? texto))
  }
  const base = 'h-9 rounded border bg-background px-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring'
  const borde = invalido ? 'border-red-400' : 'border-input'
  const esNumero = dato.control === 'numero'
  const esFecha = dato.control === 'fecha'
  const listId = dato.control === 'combo' ? `dl-faltante-lcl-${campo}-${row.id}` : undefined
  const sugerencias = campo === 'fiscal' ? knownFiscales : campo === 'deposito' ? DEPOSITOS_UY : []
  return (
    <label className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">{CAMPO_FALTANTE_LABEL[campo] ?? dato.label}</span>
      <input
        type={esFecha ? 'date' : 'text'}
        inputMode={esNumero ? 'decimal' : undefined}
        value={draft}
        placeholder={dato.hint ?? (esNumero ? dato.label.toLowerCase() : undefined)}
        list={listId}
        onChange={e => { setDraft(e.target.value); if (invalido) setInvalido(false) }}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          else if (e.key === 'Escape') { setDraft(''); setInvalido(false) }
        }}
        className={`${base} ${borde} ${esNumero ? 'w-24' : esFecha ? 'w-36' : 'w-44'}`}
      />
      {listId && (
        <datalist id={listId}>
          {sugerencias.map(v => <option key={v} value={v} />)}
        </datalist>
      )}
    </label>
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
