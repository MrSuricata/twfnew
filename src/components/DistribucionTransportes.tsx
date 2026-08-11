import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Truck, FloppyDisk, ArrowCounterClockwise, Info } from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import {
  calcularDistribucion,
  type CuotaTransporte,
  type Ventana,
} from '@/lib/distribucionTransportes'
import { fetchTransporteCuotas, saveTransporteCuotas } from '@/lib/dataClient'

const VENTANAS: { v: Ventana; label: string }[] = [
  { v: '90d', label: '90 días' },
  { v: 'mes', label: 'Mes' },
  { v: 'semana', label: 'Semana' },
]

/** Desvío tolerado antes de marcar la barra en rojo. */
const TOLERANCIA_PP = 7

const fmtFecha = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

interface Props {
  shipments: ParsedShipment[]
}

export default function DistribucionTransportes({ shipments }: Props) {
  const [cuotas, setCuotas] = useState<CuotaTransporte[]>([])
  const [guardadas, setGuardadas] = useState<CuotaTransporte[]>([])
  const [ventana, setVentana] = useState<Ventana>('90d')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    fetchTransporteCuotas()
      .then(c => { setCuotas(c); setGuardadas(c) })
      .catch(() => toast.error('No se pudieron cargar las cuotas'))
      .finally(() => setCargando(false))
  }, [])

  const hoy = useMemo(() => new Date(), [])
  const dist = useMemo(
    () => calcularDistribucion(shipments, cuotas, ventana, hoy),
    [shipments, cuotas, ventana, hoy],
  )

  const suma = cuotas.filter(c => c.activo).reduce((a, c) => a + c.porcentaje, 0)
  const sucio = JSON.stringify(cuotas) !== JSON.stringify(guardadas)
  const maxPct = Math.max(
    ...dist.filas.map(f => Math.max(f.porcentaje, f.objetivo ?? 0)), 10,
  ) * 1.08

  const setPorcentaje = (transporte: string, v: number) =>
    setCuotas(cs => cs.map(c => c.transporte === transporte ? { ...c, porcentaje: v } : c))

  async function guardar() {
    setGuardando(true)
    try {
      await saveTransporteCuotas(cuotas)
      setGuardadas(cuotas)
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

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                <Truck size={18} weight="fill" className="text-primary" />
                Distribución de cargas
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Contenedores despachados por Montevideo, sin RDM ·{' '}
                {fmtFecha(dist.desde)} al {fmtFecha(dist.hasta)} · {dist.total} contenedores
              </p>
            </div>
            <div className="flex gap-1">
              {VENTANAS.map(({ v, label }) => (
                <Button
                  key={v}
                  size="sm"
                  variant={ventana === v ? 'default' : 'outline'}
                  onClick={() => setVentana(v)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {ventana !== '90d' && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground mb-3">
              <Info size={14} className="mt-0.5 shrink-0" />
              Con pocas cargas el porcentaje se mueve mucho: esta vista sirve para ver a quién
              le estás dando trabajo, no para medir el cumplimiento de la cuota.
            </p>
          )}

          {dist.total === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No hay salidas despachadas en este período.
            </p>
          ) : (
            <div className="space-y-2">
              {dist.filas.map(f => {
                const desviado = f.enCuota && Math.abs(f.porcentaje - (f.objetivo ?? 0)) > TOLERANCIA_PP
                return (
                  <div key={f.transporte} className="grid grid-cols-[100px_1fr_92px] items-center gap-3">
                    <span className={`text-xs text-right truncate ${f.enCuota ? 'font-medium' : 'text-muted-foreground'}`}>
                      {f.transporte}
                    </span>
                    <div className="relative h-6 rounded bg-muted/40 border overflow-hidden">
                      <div
                        className={`absolute inset-y-0 left-0 ${
                          !f.enCuota ? 'bg-muted-foreground/40' : desviado ? 'bg-destructive/70' : 'bg-primary/70'
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
                      <span className="font-semibold">{f.contenedores}</span>{' '}
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
