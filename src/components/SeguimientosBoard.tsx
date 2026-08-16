// Cola de seguimientos — pestaña "Seguimientos" (pedido Brian 13/08/2026).
// El trabajo semanal de Nico: por cada carga en viaje, mirar dónde viene el
// buque, corregir la ETA acá (alimenta toda la app) y marcar el update como
// enviado. La cola muestra SOLO lo que toca hoy; el resto está "al día".
// Cada acción deja rastro en seguimientos_log (trazabilidad del buque).

import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle, PaperPlaneTilt, CaretDown, CaretRight, Boat, ClockCounterClockwise } from '@phosphor-icons/react'
import type { DbShipment } from '@/lib/operationsTypes'
import { colaSeguimientos, grupoDestino, ORDEN_GRUPOS, type CargaSeguimiento, type FilaSeguimiento } from '@/lib/seguimientos'
import { fetchSeguimientosLog, postSeguimientoLog } from '@/lib/dataClient'
import { fmtDateDMY } from '@/lib/format'

const hoyIso = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

interface LogRow {
  tipo: string
  fecha?: string
  eta_anterior?: string | null
  eta_nueva?: string | null
  buque?: string | null
  usuario?: string | null
  created_at?: string
}

interface Props {
  dbShipments: DbShipment[]
  onPatchShipment?: (id: string, fields: Record<string, unknown>) => void
  /** Abre la ficha completa (panel de Operaciones) para la ref. */
  onOpenDetail?: (ref: string) => void
}

export default function SeguimientosBoard({ dbShipments, onPatchShipment, onOpenDetail }: Props) {
  // 'hoy' con clave por DÍA: si la pestaña queda abierta de una noche para la
  // otra, la cola se recomputa con la fecha nueva en el próximo render (sin
  // esto, el useMemo congelaba el día del primer montaje).
  const hoyKey = new Date().toDateString()
  const hoy = useMemo(() => new Date(), [hoyKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ref con la lista viva: los Deshacer de los toasts la leen al momento del
  // click (una closure vieja pisaría ediciones posteriores de la misma fila).
  const dbShipmentsRef = useRef(dbShipments)
  dbShipmentsRef.current = dbShipments

  const cargas: CargaSeguimiento[] = useMemo(() =>
    (dbShipments || []).map(s => ({
      dbId: s.id, ref: s.ref, cliente: s.cliente, buque: s.buque, etd: s.etd, eta: s.eta,
      seguimiento: s.seguimiento, pais: s.dest_country, mode: s.mode, archived: s.archived,
    })), [dbShipments])

  const cola = useMemo(() => colaSeguimientos(cargas, hoy), [cargas, hoy])

  // Agrupar por destino para mandar los updates en tandas.
  const grupos = useMemo(() => {
    const m = new Map<string, FilaSeguimiento[]>()
    for (const f of cola.pendientes) {
      const g = grupoDestino(f.carga.pais)
      m.set(g, [...(m.get(g) || []), f])
    }
    return ORDEN_GRUPOS.filter(g => m.has(g)).map(g => ({ nombre: g, filas: m.get(g)! }))
  }, [cola.pendientes])

  // Historial expandible por ref (fetch perezoso, cache en memoria del tab).
  const [abierto, setAbierto] = useState<string | null>(null)
  const [historial, setHistorial] = useState<Record<string, LogRow[] | 'cargando'>>({})
  const toggleHistorial = (ref: string) => {
    if (abierto === ref) { setAbierto(null); return }
    setAbierto(ref)
    if (!historial[ref]) {
      setHistorial(h => ({ ...h, [ref]: 'cargando' }))
      fetchSeguimientosLog(ref)
        .then(rows => setHistorial(h => ({ ...h, [ref]: rows as unknown as LogRow[] })))
        .catch(() => setHistorial(h => ({ ...h, [ref]: [] })))
    }
  }

  const invalidarHistorial = (ref: string) =>
    setHistorial(h => { const n = { ...h }; delete n[ref]; return n })

  // ── Acciones ──────────────────────────────────────────────────────────
  // El historial es best-effort (el dato real vive en la carga): si el POST
  // del log falla se avisa por consola, nunca se bloquea el trabajo. Las ETAs
  // van truncadas a 40 (hay texto legacy largo que el server rechazaría).
  const logSeguimiento = (row: Parameters<typeof postSeguimientoLog>[0]) => {
    postSeguimientoLog({
      ...row,
      etaAnterior: (row.etaAnterior || '').slice(0, 40) || undefined,
      etaNueva: (row.etaNueva || '').slice(0, 40) || undefined,
    }).catch(err => console.warn('seguimientos_log:', err))
  }

  /** La carga COMO ESTÁ AHORA (no la closure del toast). */
  const cargaViva = (dbId: string) => dbShipmentsRef.current.find(s => s.id === dbId)

  // Borrador del input de ETA por carga: se comitea en blur/Enter.
  const [etaDrafts, setEtaDrafts] = useState<Record<string, string>>({})
  const commitEta = (c: CargaSeguimiento) => {
    if (!c.dbId) return
    const draft = etaDrafts[c.dbId]
    if (draft === undefined) return
    setEtaDrafts(d => { const n = { ...d }; delete n[c.dbId!]; return n })
    if (draft) cambiarEta(c.dbId, c.ref, draft)
  }

  const cambiarEta = (dbId: string, ref: string, nueva: string) => {
    const viva = cargaViva(dbId)
    if (!viva || !onPatchShipment || !nueva) return
    const anterior = (viva.eta || '').trim()
    if (nueva === anterior) return
    // Año absurdo = tipeo a medias o error: no pisar la ETA real de la carga
    // (alimenta STATUS, Pagos y el portal del cliente).
    const anio = Number(nueva.slice(0, 4))
    if (anio < 2015 || anio > 2100) { toast.error(`Fecha inválida: ${nueva}`); return }
    onPatchShipment(dbId, { eta: nueva })
    logSeguimiento({ ref, tipo: 'eta', fecha: hoyIso(), etaAnterior: anterior, etaNueva: nueva, buque: viva.buque || '' })
    invalidarHistorial(ref)
    toast.success(`${ref} — ETA ${anterior ? `${fmtDateDMY(anterior)} → ` : ''}${fmtDateDMY(nueva)}`, {
      action: anterior ? { label: 'Deshacer', onClick: () => cambiarEta(dbId, ref, anterior) } : undefined,
    })
  }

  const marcarEnviado = (f: FilaSeguimiento) => {
    const c = f.carga
    if (!c.dbId || !onPatchShipment) return
    const dbId = c.dbId
    const anterior = c.seguimiento || ''
    const fecha = hoyIso()
    onPatchShipment(dbId, { seguimiento: fecha })
    logSeguimiento({ ref: c.ref, tipo: 'enviado', fecha, etaNueva: c.eta || '', buque: c.buque || '' })
    invalidarHistorial(c.ref)
    toast.success(`${c.ref} — seguimiento enviado ${fmtDateDMY(fecha)}`, {
      description: 'Vuelve a la cola en 7 días.',
      action: {
        label: 'Deshacer',
        onClick: () => {
          onPatchShipment(dbId, { seguimiento: anterior })
          // Compensar el historial: el update quedó registrado pero no salió.
          logSeguimiento({ ref: c.ref, tipo: 'deshecho', fecha: hoyIso() })
          invalidarHistorial(c.ref)
        },
      },
    })
  }

  // ── Render ────────────────────────────────────────────────────────────

  const editable = !!onPatchShipment

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Seguimientos</h1>
        <p className="text-sm text-muted-foreground">
          {cola.pendientes.length > 0
            ? <><b className="text-foreground">{cola.pendientes.length} para enviar</b> · {cola.alDia} al día</>
            : <>{cola.alDia} cargas en viaje</>}
        </p>
      </div>

      {cola.pendientes.length === 0 && (
        <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.05] px-4 py-2.5">
          <CheckCircle size={18} weight="fill" className="text-emerald-600 shrink-0" />
          <p className="text-sm text-emerald-700">
            <b>¡Felicitaciones!</b> Todos los seguimientos están al día — ninguna carga en viaje lleva 7 días sin update.
          </p>
        </div>
      )}

      {grupos.map(g => (
        <Card key={g.nombre} className="overflow-hidden">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <Boat size={16} weight="fill" className="text-primary/70" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g.nombre}</h2>
              <span className="text-xs text-muted-foreground">({g.filas.length})</span>
            </div>
            <div className="divide-y divide-border/60">
              {g.filas.map(f => {
                const c = f.carga
                const hist = historial[c.ref]
                const etaIso = ISO_RE.test((c.eta || '').trim()) ? (c.eta || '').trim() : ''
                return (
                  <div key={c.ref} className="py-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                        f.dias === null ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-600'
                      }`}>
                        {f.dias === null ? 'NUNCA' : `HACE ${f.dias}D`}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenDetail?.(c.dbId || c.ref)}
                        className="font-mono text-sm font-semibold hover:underline shrink-0"
                        title="Abrir ficha"
                      >
                        {c.ref}
                      </button>
                      <span className="text-sm text-foreground/85 truncate min-w-0 flex-1 basis-40">
                        {c.cliente || '—'}
                        {c.buque && <span className="hidden md:inline text-xs text-muted-foreground ml-2">{c.buque}</span>}
                        {c.mode === 'lcl' && <span className="ml-2 text-[10px] font-bold text-sky-600">LCL</span>}
                      </span>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                        ETA
                        {/* CONTROLADO con borrador y commit en blur/Enter: un onChange
                            que patchea directo dispara con años a medias al tipear
                            ('0002-…') y el remount por key hace perder el foco. */}
                        <input
                          type="date"
                          value={c.dbId ? (etaDrafts[c.dbId] ?? etaIso) : etaIso}
                          disabled={!editable || !c.dbId}
                          onChange={e => c.dbId && setEtaDrafts(d => ({ ...d, [c.dbId!]: e.target.value }))}
                          onBlur={() => commitEta(c)}
                          onKeyDown={e => { if (e.key === 'Enter') commitEta(c) }}
                          className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => toggleHistorial(c.ref)}
                        className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors shrink-0"
                        title="Historial del buque"
                        aria-label={`Historial de ${c.ref}`}
                      >
                        <ClockCounterClockwise size={16} />
                        {abierto === c.ref ? <CaretDown size={10} className="inline ml-0.5" /> : <CaretRight size={10} className="inline ml-0.5" />}
                      </button>
                      <button
                        type="button"
                        disabled={!editable || !c.dbId}
                        onClick={() => marcarEnviado(f)}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
                      >
                        <PaperPlaneTilt size={14} weight="fill" /> Enviado hoy
                      </button>
                    </div>
                    {abierto === c.ref && (
                      <div className="mt-2 ml-1 pl-3 border-l-2 border-border text-xs text-muted-foreground space-y-1">
                        {hist === 'cargando' && <p>Cargando historial…</p>}
                        {Array.isArray(hist) && hist.length === 0 && <p>Sin historial todavía — arranca con el primer update.</p>}
                        {Array.isArray(hist) && hist.map((r, i) => (
                          <p key={i}>
                            <span className="font-medium text-foreground/70">{fmtDateDMY(r.fecha || (r.created_at || '').slice(0, 10))}</span>
                            {' — '}
                            {r.tipo === 'enviado' && <>update enviado{r.eta_nueva ? ` (ETA era ${fmtDateDMY(r.eta_nueva)})` : ''}</>}
                            {r.tipo === 'deshecho' && <>envío deshecho — el update anterior no salió</>}
                            {r.tipo === 'eta' && <>ETA {r.eta_anterior ? fmtDateDMY(r.eta_anterior) : 'sin fecha'} → {fmtDateDMY(r.eta_nueva || '')}</>}
                            {r.usuario ? ` · ${r.usuario}` : ''}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
