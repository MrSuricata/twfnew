/**
 * Card "Avisos de partners" — arriba de todo en HOY FCL (TodayDashboard) y en
 * HOY LCL (HoyLcl). El depósito o el transporte PROPONE ("retiré", "devolví",
 * "desconsolidé, stock Nº", "SENASA solicitado") y acá el equipo confirma o
 * rechaza. Nada toca la operación hasta el OK: confirmar llama al PATCH del
 * contrato, que ejecuta la acción que ya existe (marcar retirado en Montecon,
 * LIBRE=DEVUELTO, stock + desconsol_date, o nada para SENASA).
 *
 * Datos: fetchPartnerAvisos() al montar + cada 60 s + después de cada acción.
 * Si no hay pendientes la card NO se renderiza (cero ruido). Si la API todavía
 * no expone `partner-avisos` (404), fetchPartnerAvisos devuelve [] y la card
 * queda oculta sin toast: mergear esta PR antes que la API no rompe HOY. Los resueltos de
 * las últimas 24 h quedan plegados abajo para que se vea el rastro.
 *
 * Misma piel que las cards de HOY (accent-top, pill de conteo, variante Med por
 * useBrand). Lógica pura en src/lib/avisosPartners.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Bell, Check, X, CaretDown, CaretRight, CircleNotch, Warehouse, Truck as TruckIcon } from '@phosphor-icons/react'
import { useBrand } from '@/lib/brand'
import { fetchPartnerAvisos, resolverPartnerAviso } from '@/lib/dataClient'
import type { PartnerAviso } from '@/lib/partnerAvisos'
import {
  avisosDeArea, construirModoPorRef, separarAvisos, haceCuanto, textoDato, quienPartner,
  resumenResuelto, etiquetaAviso, type AreaHoy,
} from '@/lib/avisosPartners'

/** Cada cuánto se refresca la lista sin que nadie toque nada. */
export const AVISOS_REFRESH_MS = 60_000

interface AvisosPartnersCardProps {
  /** Qué HOY es: filtra con AREA_POR_TIPO (senasa se ubica por el modo de la ref). */
  area: AreaHoy
  /** Filas de shipments (ref + mode) para ubicar los avisos `senasa`. Si una
   *  ref no está, el aviso se muestra en ambas áreas antes que perderse. */
  shipmentsModo?: { ref: string; mode: string }[]
  /** Se llama DESPUÉS de confirmar/rechazar con éxito: la pantalla refresca
   *  lo suyo (shipments, agenda Montecon…). El aviso resuelto viaja para que
   *  cada HOY decida qué recargar. */
  onResuelto?: (aviso: PartnerAviso) => void | Promise<unknown>
}

export default function AvisosPartnersCard({ area, shipmentsModo = [], onResuelto }: AvisosPartnersCardProps) {
  const med = useBrand().id === 'med'
  const [avisos, setAvisos] = useState<PartnerAviso[]>([])
  const [cargado, setCargado] = useState(false)
  // id del aviso que se está resolviendo (deshabilita SUS botones, no todos).
  const [enCurso, setEnCurso] = useState<string | null>(null)
  const [rechazando, setRechazando] = useState<PartnerAviso | null>(null)
  const [motivo, setMotivo] = useState('')
  const [verRecientes, setVerRecientes] = useState(false)
  // Para no repetir el toast de error en cada tick del polling: solo avisamos
  // cuando la lectura pasa de andar a fallar.
  const ultimoFallo = useRef(false)
  // "hace X min" se recalcula con cada refresco (ahora vive en estado).
  const [ahora, setAhora] = useState(() => new Date())

  const refrescar = useCallback(async (silencioso = false) => {
    try {
      const rows = await fetchPartnerAvisos()
      setAvisos(rows)
      setAhora(new Date())
      ultimoFallo.current = false
    } catch (err) {
      if (!silencioso || !ultimoFallo.current) {
        toast.error('No se pudieron cargar los avisos de partners', { description: (err as Error)?.message || 'sin detalles' })
      }
      ultimoFallo.current = true
    } finally {
      setCargado(true)
    }
  }, [])

  useEffect(() => {
    void refrescar()
    const timer = setInterval(() => { void refrescar(true) }, AVISOS_REFRESH_MS)
    return () => clearInterval(timer)
  }, [refrescar])

  const modoPorRef = useMemo(() => construirModoPorRef(shipmentsModo), [shipmentsModo])
  const { pendientes, recientes } = useMemo(
    () => separarAvisos(avisosDeArea(avisos, area, modoPorRef), ahora),
    [avisos, area, modoPorRef, ahora],
  )

  const resolver = useCallback(async (a: PartnerAviso, accion: 'confirmar' | 'rechazar', motivoTxt?: string) => {
    if (enCurso) return
    setEnCurso(a.id)
    try {
      const resuelto = await resolverPartnerAviso(a.id, accion, motivoTxt)
      // Sacamos la fila al instante; el refresco trae el estado final del server.
      setAvisos(prev => prev.map(x => (x.id === a.id ? resuelto : x)))
      const objeto = a.cntr ? `${a.cntr} · ${a.ref}` : a.ref
      if (accion === 'confirmar') {
        toast.success(`${quienPartner(a)}: ${etiquetaAviso(a.tipo).toLowerCase()} — confirmado`, { description: objeto })
      } else {
        toast.success(`${quienPartner(a)}: aviso rechazado — el partner ve el motivo`, { description: objeto })
      }
      setRechazando(null)
      setMotivo('')
      await refrescar(true)
      try { await onResuelto?.(resuelto) } catch (err) {
        toast.error('El aviso quedó resuelto, pero no se pudo refrescar la pantalla', { description: (err as Error)?.message || 'recargá con el botón de actualizar' })
      }
    } catch (err) {
      toast.error(accion === 'confirmar' ? 'No se pudo confirmar el aviso' : 'No se pudo rechazar el aviso', { description: (err as Error)?.message || 'sin detalles' })
    } finally {
      setEnCurso(null)
    }
  }, [enCurso, onResuelto, refrescar])

  const confirmarRechazo = () => {
    const m = motivo.trim()
    if (!rechazando) return
    if (!m) { toast.error('Escribí el motivo del rechazo: el partner lo va a ver'); return }
    void resolver(rechazando, 'rechazar', m)
  }

  // Sin pendientes → nada (aunque haya recientes: el rastro se ve mientras hay
  // algo que atender; si no, la card sería ruido).
  if (!cargado || pendientes.length === 0) return null

  return (
    <>
      <Card
        className={med ? 'overflow-hidden bg-med-aviso-tinte border-2 border-med-aviso-borde' : 'accent-top overflow-hidden bg-amber-500/[0.04] border-amber-500/25'}
        style={{ ['--bar-color' as any]: 'rgb(245 158 11)' }}
        data-testid="avisos-partners-card"
      >
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-wrap items-center gap-2.5 mb-1">
            <div className={med ? 'p-1.5 rounded-md bg-med-aviso/10 text-med-aviso-texto' : 'p-1.5 rounded-md bg-amber-500/10 text-amber-600'}>
              <Bell size={18} weight="fill" className="pulse-soft" />
            </div>
            <h2 className={med ? 'titulo-med text-[17px] text-med-aviso-texto' : 'text-sm font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300'}>
              Avisos de partners
            </h2>
            <span className={`ml-auto inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full text-xs font-bold tabular-nums ${med ? 'bg-med-violeta text-med-celeste' : 'bg-amber-500 text-white'}`}>
              {pendientes.length}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-2.5">
            El depósito o el transporte avisa; nada cambia en la carga hasta que alguien del equipo da OK. Rechazar pide motivo y el partner lo ve.
          </p>

          <div className="divide-y divide-border/60">
            {pendientes.map(a => {
              const ocupado = enCurso === a.id
              const dato = textoDato(a)
              return (
                <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2" data-testid="aviso-pendiente">
                  <span className={`inline-flex items-center gap-1 text-xs font-bold ${med ? 'text-med-violeta' : 'text-foreground'}`} title={a.partnerName || a.partnerEmail}>
                    {a.partnerRole === 'transport' ? <TruckIcon size={14} weight="fill" /> : <Warehouse size={14} weight="fill" />}
                    {quienPartner(a)}
                  </span>
                  <span className="text-sm">{etiquetaAviso(a.tipo)}</span>
                  <span className="ref-med text-sm font-semibold">{a.ref}</span>
                  {a.cntr && <span className="text-xs font-mono text-muted-foreground">{a.cntr}</span>}
                  {dato && <Badge variant="outline" className="text-[10px] tabular-nums">{dato}</Badge>}
                  <span className="text-[11px] text-muted-foreground" title={new Date(a.createdAt).toLocaleString('es-UY')}>
                    {haceCuanto(a.createdAt, ahora)}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    <Button
                      size="sm"
                      className={`h-7 text-xs ${med ? 'bg-med-violeta text-white hover:bg-med-violeta/90' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                      disabled={ocupado}
                      onClick={() => { void resolver(a, 'confirmar') }}
                    >
                      {ocupado ? <CircleNotch size={14} className="animate-spin" /> : <Check size={14} weight="bold" />}
                      <span className="ml-1">OK</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={ocupado}
                      onClick={() => { setRechazando(a); setMotivo('') }}
                    >
                      <X size={14} weight="bold" />
                      <span className="ml-1">Rechazar</span>
                    </Button>
                  </span>
                </div>
              )
            })}
          </div>

          {recientes.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border/60">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => setVerRecientes(v => !v)}
                aria-expanded={verRecientes}
              >
                {verRecientes ? <CaretDown size={12} /> : <CaretRight size={12} />}
                {recientes.length} resuelto{recientes.length === 1 ? '' : 's'} en las últimas 24 h
              </button>
              {verRecientes && (
                <ul className="mt-1.5 space-y-1">
                  {recientes.map(a => (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      {a.estado === 'confirmado'
                        ? <Check size={12} weight="bold" className="text-emerald-600 shrink-0" />
                        : <X size={12} weight="bold" className="text-destructive shrink-0" />}
                      <span>{resumenResuelto(a)}</span>
                      {a.resolvedAt && <span className="text-[10px]">{haceCuanto(a.resolvedAt, ahora)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rechazar: el motivo es obligatorio porque el partner lo lee en "Mis avisos". */}
      <Dialog open={!!rechazando} onOpenChange={open => { if (!open && !enCurso) { setRechazando(null); setMotivo('') } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rechazar el aviso</DialogTitle>
            <DialogDescription>
              {rechazando && (
                <>
                  {quienPartner(rechazando)} — {etiquetaAviso(rechazando.tipo).toLowerCase()} · <b>{rechazando.ref}</b>
                  {rechazando.cntr ? <> · <span className="font-mono">{rechazando.cntr}</span></> : null}
                  {textoDato(rechazando) ? <> · {textoDato(rechazando)}</> : null}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="motivo-rechazo" className="text-xs font-medium">Motivo (el partner lo va a ver)</label>
            <Textarea
              id="motivo-rechazo"
              autoFocus
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Ej.: el contenedor sigue en la terminal; el stock no coincide con el remito…"
              maxLength={300}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={!!enCurso} onClick={() => { setRechazando(null); setMotivo('') }}>Cancelar</Button>
            <Button variant="destructive" disabled={!!enCurso || !motivo.trim()} onClick={confirmarRechazo}>
              {enCurso ? <CircleNotch size={14} className="animate-spin mr-1" /> : <X size={14} weight="bold" className="mr-1" />}
              Rechazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
