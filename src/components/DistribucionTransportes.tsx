import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Truck, FloppyDisk, ArrowCounterClockwise, Info, Lightbulb } from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import {
  calcularDistribucion,
  rangoVentana,
  sugerirReparto,
  SIN_ASIGNAR,
  type CuotaTransporte,
  type Modo,
  type Rango,
  type Ventana,
} from '@/lib/distribucionTransportes'
import { fetchTransporteCuotas, saveTransporteCuotas } from '@/lib/dataClient'
import { invalidarCuotas } from '@/hooks/useTransporteCuotas'

const CORTES: { v: Ventana; label: string }[] = [
  { v: 'semana', label: 'Semana' },
  { v: 'mes', label: 'Mes' },
  { v: '90d', label: '90 días' },
]

/** Desvío tolerado antes de marcar la barra en rojo. */
const TOLERANCIA_PP = 7

const fmtCorto = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

const aInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 'YYYY-MM-DD' → Date local (new Date(str) lo interpreta UTC y corre un día). */
function deInput(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return isNaN(d.getTime()) ? null : d
}

interface Props {
  shipments: ParsedShipment[]
}

export default function DistribucionTransportes({ shipments }: Props) {
  const [cuotas, setCuotas] = useState<CuotaTransporte[]>([])
  const [guardadas, setGuardadas] = useState<CuotaTransporte[]>([])
  const [modo, setModo] = useState<Modo>('despachado')
  const [corte, setCorte] = useState<Ventana>('90d')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)

  const hoy = useMemo(() => new Date(), [])
  const [desde, setDesde] = useState(() => aInput(rangoVentana('semana', new Date(), 'prevision').desde))
  const [hasta, setHasta] = useState(() => aInput(rangoVentana('semana', new Date(), 'prevision').hasta))

  useEffect(() => {
    fetchTransporteCuotas()
      .then(c => { setCuotas(c); setGuardadas(c) })
      .catch(() => toast.error('No se pudieron cargar las cuotas'))
      .finally(() => setCargando(false))
  }, [])

  // Al pasar a previsión, 90 días es un horizonte poco útil para repartir:
  // arranca en la semana, que es la unidad con la que se arma el trabajo.
  function cambiarModo(m: Modo) {
    setModo(m)
    const v: Ventana = m === 'prevision' && corte === '90d' ? 'semana' : corte
    setCorte(v)
    aplicarVentana(v, m)
  }

  // En previsión el rango es SIEMPRE editable: los botones de ventana solo
  // rellenan las fechas, que después se ajustan a mano. Antes la semana era fija
  // (lunes a domingo) y no había forma de correrla.
  function aplicarVentana(v: Ventana, m: Modo = modo) {
    const r = rangoVentana(v, hoy, m)
    setDesde(aInput(r.desde))
    setHasta(aInput(r.hasta))
  }

  const rangoElegido: Rango | null = useMemo(() => {
    const d = deInput(desde), h = deInput(hasta)
    return d && h && d <= h ? { desde: d, hasta: h } : null
  }, [desde, hasta])

  const dist = useMemo(() => {
    // Previsión trabaja siempre con el rango de los inputs; despachado con la ventana.
    const sel = modo === 'prevision' ? (rangoElegido ?? rangoVentana(corte, hoy, modo)) : corte
    return calcularDistribucion(shipments, cuotas, sel, hoy, modo)
  }, [shipments, cuotas, corte, rangoElegido, hoy, modo])

  // Reparto sugerido de los que no tienen transporte, medido sobre ESTE período:
  // la base son los ya asignados (total menos los sin asignar), así al sumarlos
  // las barras llegan justo al total mostrado.
  const reparto = useMemo(() => {
    if (modo !== 'prevision' || !dist.sinAsignar) return []
    return sugerirReparto(dist.sinAsignar, { ...dist, total: dist.total - dist.sinAsignar }, cuotas)
  }, [modo, dist, cuotas])

  const sugeridoPor = useMemo(
    () => new Map(reparto.map(r => [r.transporte, r.cantidad])),
    [reparto],
  )

  const suma = cuotas.filter(c => c.activo).reduce((a, c) => a + c.porcentaje, 0)
  const sucio = JSON.stringify(cuotas) !== JSON.stringify(guardadas)
  const maxPct = Math.max(...dist.filas.map(f => Math.max(f.porcentaje, f.objetivo ?? 0)), 10) * 1.08

  const setPorcentaje = (transporte: string, v: number) =>
    setCuotas(cs => cs.map(c => c.transporte === transporte ? { ...c, porcentaje: v } : c))

  async function guardar() {
    setGuardando(true)
    try {
      await saveTransporteCuotas(cuotas)
      setGuardadas(cuotas)
      // El chip de sugerencia en la ficha de la carga lee del caché.
      invalidarCuotas()
      toast.success('Objetivos guardados')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) {
    return <div className="p-6 text-sm text-muted-foreground">Cargando cuotas…</div>
  }

  const esPrevision = modo === 'prevision'

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                <Truck size={18} weight="fill" className="text-primary" />
                {esPrevision ? 'Previsión de reparto' : 'Distribución de cargas'}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {esPrevision ? 'Salidas y arribos' : 'Contenedores despachados'} por Montevideo,
                sin RDM · {fmtCorto(dist.desde)} al {fmtCorto(dist.hasta)} · {dist.total} contenedores
                {esPrevision && dist.total > 0 && (
                  <> · {dist.agendados} con fecha, {dist.pendientes} por coordinar</>
                )}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex gap-1">
                <Button size="sm" variant={!esPrevision ? 'default' : 'outline'}
                  onClick={() => cambiarModo('despachado')}>Despachado</Button>
                <Button size="sm" variant={esPrevision ? 'default' : 'outline'}
                  onClick={() => cambiarModo('prevision')}>Previsión</Button>
              </div>
              <div className="flex gap-1">
                {CORTES.map(({ v, label }) => (
                  <Button key={v} size="sm" variant={corte === v ? 'secondary' : 'ghost'}
                    className="h-7 px-2 text-xs"
                    onClick={() => { setCorte(v); aplicarVentana(v) }}>{label}</Button>
                ))}
              </div>
            </div>
          </div>

          {/* En previsión las fechas están siempre a la vista y se editan: los
              botones de arriba solo las rellenan. */}
          {esPrevision && (
            <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b">
              <span className="text-xs text-muted-foreground">Del</span>
              <Input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                className="h-8 w-[150px] text-xs" aria-label="Fecha desde" />
              <span className="text-xs text-muted-foreground">al</span>
              <Input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                className="h-8 w-[150px] text-xs" aria-label="Fecha hasta" />
              {!rangoElegido && (
                <span className="text-xs text-destructive">La fecha final tiene que ser posterior</span>
              )}
            </div>
          )}

          {esPrevision && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground mb-3">
              <Info size={14} className="mt-0.5 shrink-0" />
              Incluye lo agendado y lo que llega sin salida coordinada todavía. Los porcentajes son
              de este período, no del cumplimiento general — la cuota se mide sobre los 90 días
              despachados.
            </p>
          )}

          {dist.total === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              {esPrevision
                ? 'No hay salidas agendadas en este período.'
                : 'No hay salidas despachadas en este período.'}
            </p>
          ) : (
            <div className="space-y-2">
              {dist.filas.map(f => {
                const desviado = f.enCuota && Math.abs(f.porcentaje - (f.objetivo ?? 0)) > TOLERANCIA_PP
                // Cuánto le tocaría de los que no tienen transporte, y cómo
                // quedaría su barra si se repartieran así.
                const sug = sugeridoPor.get(f.transporte) || 0
                const esSinAsignar = f.transporte === SIN_ASIGNAR
                const pctProyectado = dist.total
                  ? ((f.contenedores + sug) / dist.total) * 100
                  : 0
                return (
                  <div key={f.transporte} className="grid grid-cols-[100px_1fr_104px] items-center gap-3">
                    <span className={`text-xs text-right truncate ${f.enCuota ? 'font-medium' : 'text-muted-foreground'}`}>
                      {f.transporte}
                    </span>
                    <div className="relative h-6 rounded bg-muted/40 border overflow-hidden">
                      {/* Tramo tenue = lo que sumaría el reparto sugerido. */}
                      {sug > 0 && (
                        <div
                          className="absolute inset-y-0 left-0 bg-primary/25"
                          style={{ width: `${Math.min(100, (pctProyectado / maxPct) * 100)}%` }}
                          title={`Quedaría en ${Math.round(pctProyectado)}% con ${sug} más`}
                        />
                      )}
                      <div
                        className={`absolute inset-y-0 left-0 ${
                          esSinAsignar ? 'bg-amber-500/60'
                            : !f.enCuota ? 'bg-muted-foreground/40'
                            : desviado ? 'bg-destructive/70' : 'bg-primary/70'
                        }`}
                        style={{ width: `${Math.min(100, (f.porcentaje / maxPct) * 100)}%` }}
                      />
                      {f.objetivo !== null && (
                        <div
                          className="absolute -inset-y-0.5 w-0.5 bg-foreground"
                          style={{ left: `${Math.min(100, (f.objetivo / maxPct) * 100)}%` }}
                          title={`Objetivo ${f.objetivo}%`}
                        />
                      )}
                    </div>
                    <div className="text-xs text-right tabular-nums leading-tight">
                      <span className="font-semibold">{f.contenedores}</span>
                      {sug > 0 && <span className="text-primary font-medium"> +{sug}</span>}{' '}
                      <span className="text-muted-foreground">{Math.round(f.porcentaje)}%</span>
                      {f.diferencia !== null && (
                        <div className={f.diferencia > 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}>
                          {f.diferencia > 0 ? `faltan ${f.diferencia}` : f.diferencia < 0 ? `sobran ${-f.diferencia}` : 'en meta'}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {esPrevision && dist.sinAsignar > 0 && (
            <div className="mt-4 pt-3 border-t">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Lightbulb size={16} weight="fill" className="text-amber-500" />
                {dist.sinAsignar} contenedor{dist.sinAsignar > 1 ? 'es' : ''} sin transporte
              </p>
              {reparto.some(r => r.cantidad > 0) && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  Repartidos según la cuota quedarían así:{' '}
                  <span className="text-foreground">
                    {reparto.filter(r => r.cantidad > 0)
                      .map(r => `${r.transporte} ${r.cantidad}`).join(' · ')}
                  </span>
                  {' '}— es la parte tenue de cada barra.
                </p>
              )}
            </div>
          )}

          {dist.rdm.length > 0 && (
            <p className="text-xs text-muted-foreground mt-4 pt-3 border-t">
              <span className="font-medium">RDM (fuera de cuota):</span>{' '}
              {dist.rdm.map(r => `${r.transporte} ${r.contenedores}`).join(' · ')}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Objetivos</h3>
            <span className={`text-xs ${suma === 100 ? 'text-muted-foreground' : 'text-destructive'}`}>
              suma {suma}%{suma !== 100 && ' — debería dar 100'}
            </span>
          </div>

          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {cuotas.filter(c => c.activo).map(c => (
              <div key={c.transporte} className="flex items-center gap-3">
                <span className="text-xs w-[86px] shrink-0 truncate">{c.transporte}</span>
                <Slider
                  value={[c.porcentaje]}
                  onValueChange={([v]) => setPorcentaje(c.transporte, v)}
                  min={0}
                  max={80}
                  step={1}
                  className="flex-1"
                  aria-label={`Objetivo de ${c.transporte}`}
                />
                <span className="text-xs w-9 text-right tabular-nums font-medium">{c.porcentaje}%</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 mt-4">
            <Button size="sm" onClick={guardar} disabled={!sucio || guardando}>
              <FloppyDisk size={15} className="mr-1.5" />
              {guardando ? 'Guardando…' : 'Guardar objetivos'}
            </Button>
            {sucio && (
              <Button size="sm" variant="ghost" onClick={() => setCuotas(guardadas)} disabled={guardando}>
                <ArrowCounterClockwise size={15} className="mr-1.5" />
                Descartar
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground mt-3">
            Los objetivos son una guía para repartir: siempre podés elegir el transporte que quieras.
            RDM sale por Olaverry o Siroco y no entra en la cuenta.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
