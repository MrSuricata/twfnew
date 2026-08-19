// Mi rendimiento — página PERSONAL, no linkeada desde ningún lado.
// Se entra escribiendo /mirendimiento y muestra SIEMPRE los datos del usuario
// logueado: si entra otro del equipo, ve los suyos, no los de Brian. Por eso
// no está en la barra de pestañas (pedido de Brian 18/08: "que tenga que
// ponerlo yo para verlo").
//
// Responde, operativa por operativa: ¿fui al depósito? ¿hay fotos de la carga?
// ¿avisé el traslado del contenedor? ¿avisé la salida? ¿hice el informe?
// El denominador sale de las CARGAS (las operativas que pasaron por depósito
// en el período), así el número no se infla marcando de más.
//
// OJO con dos reglas que corrigió Brian (18/08):
//  · las FOTOS no prueban la visita — las manda el depósito;
//  · el INFORME se mide sobre las VISITAS, no sobre el total: sale de haber ido.

import { useState, useMemo, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Warehouse, Camera, ArrowsLeftRight, PaperPlaneTilt, FileText, Copy, CheckCircle, Warning } from '@phosphor-icons/react'
import type { DbShipment } from '@/lib/operationsTypes'
import type { OperativeReport, OriginPhoto } from '@/lib/quotationTypes'
import {
  buildRendimiento, depositosVisitados, textoParte, esAutorPropio, resumenMensual, ultimosMeses,
  type FilaRendimiento, type MesRendimiento,
} from '@/lib/miRendimiento'
import { fetchRefChecks, saveRefCheckSteps, saveRefCheckCntrs } from '@/lib/dataClient'
import {
  normalizeRef, mergeChecksSteps, isAvisoStep, avisoForCntr,
  type CheckStepKey, type RefCheckSteps,
} from '@/lib/checksTypes'
import { getAdminName, getAdminUser } from '@/lib/authClient'
import { fmtDateDMY } from '@/lib/format'

/** Lunes de la semana de `d`, en ISO local. */
function lunesDe(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dia = (x.getDay() + 6) % 7 // 0 = lunes
  x.setDate(x.getDate() - dia)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`
}
function sumarDias(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const x = new Date(y, m - 1, d + n)
  const p = (v: number) => String(v).padStart(2, '0')
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`
}
function hoyIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

interface Props {
  dbShipments: DbShipment[]
  reports?: OperativeReport[]
  originPhotos?: OriginPhoto[]
  onOpenDetail?: (ref: string) => void
}

export default function MiRendimientoPanel({ dbShipments, reports = [], originPhotos = [], onOpenDetail }: Props) {
  // Período: semana actual por defecto; se puede mover semana a semana.
  const [offset, setOffset] = useState(0)
  const desde = useMemo(() => sumarDias(lunesDe(new Date()), offset * 7), [offset])
  const hasta = useMemo(() => sumarDias(desde, 6), [desde])
  const esSemanaActual = offset === 0

  const [checksByRef, setChecksByRef] = useState<Map<string, RefCheckSteps>>(new Map())
  const refrescar = useCallback(async () => {
    try {
      const rows = await fetchRefChecks()
      setChecksByRef(new Map(rows.map(r => [normalizeRef(r.ref), r.steps || {}])))
    } catch (err) {
      console.warn('[rendimiento] no se pudieron cargar los checks:', err)
    }
  }, [])
  useEffect(() => { refrescar() }, [refrescar])

  // Cómo me llamo en los datos: el server estampa la identidad de LOGIN
  // (getAdminUser), pero algunas rutas viejas guardaron el nombre visible —
  // van las dos para que el filtro no se coma trabajo propio.
  const identidades = useMemo(() => [getAdminUser(), getAdminName()].filter(Boolean), [])

  // Las fotos son de UN contenedor: se indexan por `REF|CNTR`. Las viejas, de
  // antes de que se etiquetaran, no tienen contenedor: van aparte y cuentan
  // para todos los contenedores de esa ref, que es lo único que se puede
  // afirmar sin inventar.
  const { fotosPorCntr, refsConFotosSinCntr } = useMemo(() => {
    const porCntr = new Set<string>()
    const sinCntr = new Set<string>()
    for (const p of originPhotos) {
      if (String(p.photoType || '') !== 'uruguay' || !p.shipmentRef) continue
      if (!esAutorPropio(p.createdBy, identidades)) continue
      const ref = normalizeRef(p.shipmentRef)
      const cntr = String(p.containerNumber || '').trim().toUpperCase()
      if (cntr) porCntr.add(`${ref}|${cntr}`)
      else sinCntr.add(ref)
    }
    return { fotosPorCntr: porCntr, refsConFotosSinCntr: sinCntr }
  }, [originPhotos, identidades])

  // El informe es de UN contenedor (desde que se puede elegir al subirlo). Los
  // viejos no lo tienen: cuentan para todos los de la ref, igual que las fotos.
  const { informesPorCntr, refsConInformeSinCntr } = useMemo(() => {
    const porCntr = new Set<string>()
    const sinCntr = new Set<string>()
    for (const r of reports) {
      if (!r.shipmentRef || !esAutorPropio(r.createdBy, identidades)) continue
      const ref = normalizeRef(r.shipmentRef)
      const cntr = String(r.containerNumber || '').trim().toUpperCase()
      if (cntr) porCntr.add(`${ref}|${cntr}`)
      else sinCntr.add(ref)
    }
    return { informesPorCntr: porCntr, refsConInformeSinCntr: sinCntr }
  }, [reports, identidades])

  // Lo que define QUÉ se cuenta, una sola vez: la semana y el resumen mensual
  // salen de acá, así los dos números nunca se pueden contradecir.
  const comun = useMemo(() => ({
    cargas: (dbShipments || []).map(s => ({
      ref: s.ref, cliente: s.cliente, deposito: s.deposito, operativa: s.operativa,
      cntr: s.contenedor, eta: s.eta, salida: s.salida, pais: s.dest_country,
      mode: s.mode, archived: s.archived,
      // Fechas por contenedor: cada uno sale su propio día.
      operativas: (s.operativas || []).map(o => ({
        cntr: String(o.CNTR_OP || ''), salida: o.SALIDA, eta: o.ETA_OP,
      })),
    })),
    checksByRef, fotosPorCntr, refsConFotosSinCntr, informesPorCntr, refsConInformeSinCntr, identidades,
  }), [dbShipments, checksByRef, fotosPorCntr, refsConFotosSinCntr, informesPorCntr, refsConInformeSinCntr, identidades])

  const resumen = useMemo(
    () => buildRendimiento({ ...comun, desde, hasta }),
    [comun, desde, hasta],
  )

  // Dashboard: los últimos 6 meses cerrados, del mes de la semana que se está
  // mirando hacia atrás (moverse de semana también mueve el histórico).
  const meses = useMemo(
    () => resumenMensual({ ...comun, meses: ultimosMeses(desde.slice(0, 7), 6) }),
    [comun, desde],
  )

  const depositos = useMemo(() => depositosVisitados(resumen), [resumen])

  /**
   * Marca/desmarca un paso. Optimista con revert, como el resto de la app.
   *
   * OJO con los pasos-aviso (traslado/salida): viven POR CONTENEDOR en
   * `step.cntrs` y HOY los marca de a uno. Escribirlos a nivel ref borraría ese
   * mapa — o sea, se perdería lo que otro marcó en HOY. Por eso van siempre por
   * `saveRefCheckCntrs`, sembrando el mapa completo desde el estado actual:
   * los contenedores ya avisados conservan su fecha y su autor.
   */
  const toggle = async (ref: string, key: CheckStepKey, activo: boolean, cntrs: string[], cntrFila: string) => {
    const norm = normalizeRef(ref)
    const previo = checksByRef.get(norm) || {}
    const marcar = !activo
    const ctx = { date: hoyIso(), by: getAdminName() }

    const porContenedor = isAvisoStep(key) && cntrs.length > 0
    let optimista: RefCheckSteps
    let guardar: () => Promise<RefCheckSteps>

    if (porContenedor) {
      const step = previo[key]
      const mapa: Record<string, { done: boolean; date?: string; by?: string }> = {}
      for (const c of cntrs) {
        const eff = avisoForCntr(step, c)
        if (c !== cntrFila) {
          // Los OTROS contenedores se re-siembran tal cual estaban: escribir el
          // mapa completo es obligatorio (si no se borra lo que no va), pero
          // tocar uno no puede arrastrar a los demás — cada contenedor sale en
          // su propio camión y se marca por separado (Brian 18/08).
          mapa[c] = eff ? { done: true, date: eff.date, by: eff.by } : { done: false }
          continue
        }
        // El de la fila: al marcar conserva fecha y autor si ya estaba.
        mapa[c] = marcar
          ? (eff ? { done: true, date: eff.date, by: eff.by } : { done: true, ...ctx })
          : { done: false }
      }
      optimista = mergeChecksSteps(previo, { [key]: { done: marcar, cntrs: mapa } })
      guardar = () => saveRefCheckCntrs(ref, key, mapa)
    } else {
      const patch: RefCheckSteps = { [key]: marcar ? { done: true, ...ctx } : { done: false } }
      optimista = mergeChecksSteps(previo, patch)
      guardar = () => saveRefCheckSteps(ref, patch)
    }

    setChecksByRef(m => new Map(m).set(norm, optimista))
    try {
      // El server manda: estampa `by` del token y conserva el autor original.
      const guardado = await guardar()
      setChecksByRef(m => new Map(m).set(norm, guardado))
    } catch (err) {
      console.warn('[rendimiento] no se pudo guardar:', err)
      setChecksByRef(m => new Map(m).set(norm, previo))
      toast.error('No se pudo guardar — probá de nuevo')
    }
  }

  const copiarParte = () => {
    const texto = textoParte(resumen, desde, hasta)
    if (!navigator.clipboard?.writeText) { toast.error('El portapapeles no está disponible'); return }
    navigator.clipboard.writeText(texto)
      .then(() => toast.success('Parte copiado', { description: 'Incluye lo hecho y lo que falta.' }))
      .catch(() => toast.error('No se pudo copiar'))
  }

  const pct = (n: number) => resumen.total > 0 ? Math.round((n / resumen.total) * 100) : 0

  return (
    <div className="space-y-5">
      {/* ── Encabezado + período ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mi rendimiento</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tus operativas por depósito — {fmtDateDMY(desde)} al {fmtDateDMY(hasta)}
            {esSemanaActual && <span className="ml-1.5 text-xs">(semana actual)</span>}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setOffset(o => o - 1)}
            className="h-8 px-3 rounded-md border border-border text-xs font-semibold hover:bg-muted transition-colors"
          >
            ← Semana anterior
          </button>
          <button
            type="button"
            disabled={esSemanaActual}
            onClick={() => setOffset(o => Math.min(0, o + 1))}
            className="h-8 px-3 rounded-md border border-border text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-40"
          >
            Siguiente →
          </button>
          <button
            type="button"
            onClick={copiarParte}
            className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
            title="Copia el parte de la semana, con lo hecho y lo pendiente"
          >
            <Copy size={13} weight="bold" /> Copiar parte
          </button>
        </div>
      </div>

      {/* ── Resumen ── */}
      {resumen.total === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center text-muted-foreground">
            <Warehouse size={34} weight="duotone" className="mx-auto mb-3 opacity-60" />
            <p className="font-semibold text-foreground">Sin operativas por depósito en esta semana</p>
            <p className="text-sm mt-1">Se cuentan los trasiegos y cargas a piso por Uruguay.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
            <Metrica icon={<Warehouse size={16} weight="fill" />} label="Fui al depósito" n={resumen.visitas} total={resumen.total} pct={pct(resumen.visitas)} />
            <Metrica icon={<Camera size={16} weight="fill" />} label="Fotos de la carga" n={resumen.fotos} total={resumen.total} pct={pct(resumen.fotos)}
              nota="propias o del depósito" />
            <Metrica icon={<ArrowsLeftRight size={16} weight="fill" />} label="Avisé traslado" n={resumen.traslados} total={resumen.total} pct={pct(resumen.traslados)} />
            <Metrica icon={<PaperPlaneTilt size={16} weight="fill" />} label="Avisé salida" n={resumen.salidas} total={resumen.total} pct={pct(resumen.salidas)} />
            {/* El informe sale de haber ido: el denominador son las visitas. */}
            <Metrica icon={<FileText size={16} weight="fill" />} label="Informe de las que fui"
              n={resumen.informesDeVisitadas} total={resumen.visitas}
              pct={resumen.visitas > 0 ? Math.round((resumen.informesDeVisitadas / resumen.visitas) * 100) : 0}
              nota={resumen.visitas === 0 ? 'sin visitas esta semana' : resumen.visitasSinInforme > 0 ? `falta${resumen.visitasSinInforme > 1 ? 'n' : ''} ${resumen.visitasSinInforme}` : undefined} />
          </div>

          {depositos.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Depósitos:</span>
              {depositos.map(d => (
                <span key={d.deposito} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted font-semibold">
                  {d.deposito} <span className="text-muted-foreground">{d.refs.length}</span>
                </span>
              ))}
            </div>
          )}

          {/* ── Detalle operativa por operativa ── */}
          <Card>
            <CardContent className="pt-5 pb-3">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Operativa por operativa
                </h2>
                <span className="flex items-center gap-3">
                  {/* Las llegadas sin salida coordinada se muestran pero NO
                      cuentan: son trabajo por venir, no trabajo sin hacer. */}
                  {resumen.pendientesDeCoordinar > 0 && (
                    <span
                      className="text-xs text-muted-foreground"
                      title="Llegaron pero todavía no tienen salida coordinada: se muestran en gris y no entran en los totales"
                    >
                      {resumen.pendientesDeCoordinar} sin salida coordinada (no cuentan)
                    </span>
                  )}
                  {resumen.sinNada > 0 && (
                    <span className="text-xs text-amber-700 dark:text-amber-400 font-semibold">
                      {resumen.sinNada} sin ninguna señal
                    </span>
                  )}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                      <th className="text-left font-semibold pb-2 pr-2">Ref</th>
                      <th className="text-left font-semibold pb-2 pr-2">Cliente</th>
                      <th className="text-left font-semibold pb-2 pr-2">Contenedor</th>
                      <th className="text-left font-semibold pb-2 pr-2 hidden sm:table-cell">Depósito</th>
                      <th className="text-left font-semibold pb-2 pr-2 hidden md:table-cell">Fecha</th>
                      <th className="text-center font-semibold pb-2 px-1">Fui</th>
                      <th className="text-center font-semibold pb-2 px-1" title="Fotos de Uruguay (pueden ser del depósito) o dentro del informe">Fotos</th>
                      <th className="text-center font-semibold pb-2 px-1">Traslado</th>
                      <th className="text-center font-semibold pb-2 px-1">Salida</th>
                      <th className="text-center font-semibold pb-2 px-1">Informe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.filas.map(f => (
                      <Fila key={`${f.ref}|${f.cntr}`} f={f} onToggle={toggle} onOpenDetail={onOpenDetail} />
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">
                <b>Fotos</b> e <b>Informe</b> se derivan solos de lo que hay subido a la carga — no se tildan.
                Las fotos <b>no cuentan como visita</b>: puede mandarlas el depósito. Y si hay informe,
                cuenta como fotos, porque van adentro. El informe se mide sobre las operativas a las
                que fuiste, no sobre el total.
                Lo que marcó otra persona con su usuario no cuenta acá; lo de la época del
                usuario compartido sí, porque no se puede atribuir a nadie.
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Cómo viene, mes a mes ── */}
      <MesesPanel meses={meses} />
    </div>
  )
}

/** Resumen mes a mes: la foto larga, para no discutir sobre una sola semana. */
function MesesPanel({ meses }: { meses: MesRendimiento[] }) {
  const conDatos = meses.filter(m => m.total > 0)
  if (conDatos.length === 0) return null
  const nombre = (mes: string) => {
    const [y, m] = mes.split('-').map(Number)
    const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']
    return `${MESES[m - 1] || mes} ${String(y).slice(2)}`
  }
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Cómo viene, mes a mes
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                <th className="text-left font-semibold pb-2 pr-2">Mes</th>
                <th className="text-right font-semibold pb-2 px-2">Operativas</th>
                <th className="text-right font-semibold pb-2 px-2">Fui</th>
                <th className="text-right font-semibold pb-2 px-2">Traslado</th>
                <th className="text-right font-semibold pb-2 px-2">Salida</th>
                <th className="text-right font-semibold pb-2 px-2" title="Informes sobre las operativas a las que fuiste">Informe</th>
                <th className="text-right font-semibold pb-2 pl-2">Fotos</th>
              </tr>
            </thead>
            <tbody>
              {conDatos.map(m => (
                <tr key={m.mes} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-2 font-medium whitespace-nowrap">{nombre(m.mes)}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{m.total}</td>
                  <CeldaMes n={m.visitas} total={m.total} />
                  <CeldaMes n={m.traslados} total={m.total} />
                  <CeldaMes n={m.salidas} total={m.total} />
                  {/* Denominador = visitas, igual que la tarjeta de arriba. */}
                  <CeldaMes n={m.informesDeVisitadas} total={m.visitas} />
                  <CeldaMes n={m.fotos} total={m.total} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          Se cuentan los trasiegos y cargas a piso por Uruguay de cada mes, por fecha de salida
          (o de llegada si todavía no salió). <b>Informe</b> va sobre las operativas a las que fuiste.
        </p>
      </CardContent>
    </Card>
  )
}

function CeldaMes({ n, total }: { n: number; total: number }) {
  const pct = total > 0 ? Math.round((n / total) * 100) : 0
  const tono = total === 0 ? 'text-muted-foreground'
    : pct >= 80 ? 'text-emerald-600 dark:text-emerald-400'
    : pct >= 50 ? 'text-amber-600 dark:text-amber-400'
    : 'text-destructive'
  return (
    <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">
      <span className={`font-semibold ${tono}`}>{n}</span>
      <span className="text-muted-foreground text-xs">/{total}</span>
    </td>
  )
}

function Metrica({ icon, label, n, total, pct, nota }: {
  icon: React.ReactNode; label: string; n: number; total: number; pct: number; nota?: string
}) {
  const tono = pct >= 80 ? 'text-emerald-600 dark:text-emerald-400'
    : pct >= 50 ? 'text-amber-600 dark:text-amber-400'
    : 'text-destructive'
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
          {icon}
          <span className="text-[11px] font-semibold uppercase tracking-wide leading-tight">{label}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className={`text-2xl font-bold tabular-nums ${tono}`}>{n}</span>
          <span className="text-sm text-muted-foreground">/ {total}</span>
        </div>
        {nota && <p className="text-[10px] text-muted-foreground mt-0.5">{nota}</p>}
      </CardContent>
    </Card>
  )
}

function Fila({ f, onToggle, onOpenDetail }: {
  f: FilaRendimiento
  onToggle: (ref: string, key: CheckStepKey, activo: boolean, cntrs: string[], cntrFila: string) => void
  onOpenDetail?: (ref: string) => void
}) {
  // Ya no hay "parcial": la fila ES un contenedor. El detalle sobra.
  return (
    <tr className="border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors">
      <td className="py-2 pr-2">
        <button
          type="button"
          onClick={() => onOpenDetail?.(f.ref)}
          className="font-mono text-sm font-semibold hover:underline"
        >
          {f.ref}
        </button>
      </td>
      <td className="py-2 pr-2 text-foreground/85 truncate max-w-[160px]">{f.cliente}</td>
      <td className="py-2 pr-2 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
        {f.cntr || <span className="italic">sin cntr</span>}
      </td>
      <td className="py-2 pr-2 text-muted-foreground hidden sm:table-cell">{f.deposito}</td>
      {/* La fecha puede ser la SALIDA o, si todavía no está coordinada, la
          LLEGADA. Mostrarlas iguales hacía leer "sale hoy" una carga que
          recién llegaba (Brian 18/08, A7958). */}
      <td className="py-2 pr-2 text-muted-foreground tabular-nums hidden md:table-cell">
        {f.fecha ? (
          <span
            className={f.fechaEs === 'llegada' ? 'italic text-muted-foreground/70' : ''}
            title={f.fechaEs === 'llegada'
              ? 'Llegada: esta carga todavía no tiene salida coordinada'
              : 'Salida del depósito'}
          >
            {fmtDateDMY(f.fecha)}
            <span className="ml-1 text-[10px] uppercase tracking-wide">
              {f.fechaEs === 'llegada' ? 'lleg.' : 'sal.'}
            </span>
          </span>
        ) : '—'}
      </td>
      <td className="py-2 px-1 text-center">
        {/* El tilde NUNCA se bloquea. Antes se deshabilitaba cuando la carga
            tenía fotos ("confirmada por las fotos"), pero desde la corrección
            del modelo las fotos NO prueban la visita —pueden ser del depósito—
            y la visita es solo este tilde. Quedaron contradiciéndose: la carga
            con fotos no se podía marcar Y contaba como "no fuiste" para
            siempre (caso A8025, Brian 18/08). */}
        <Tilde activo={f.visita} onClick={() => onToggle(f.ref, 'visita_deposito', f.visita, f.cntrs, f.cntr)}
          titulo={f.visita ? 'Fuiste al depósito — click para desmarcar' : 'Marcar que fuiste al depósito'} />
      </td>
      <td className="py-2 px-1 text-center">
        <Derivado activo={f.fotos} titulo={
          f.fotosSubidas ? 'Hay fotos de Uruguay en la galeria'
            : f.fotos ? 'Van dentro del informe operativo'
            : 'Sin fotos ni informe'
        } />
      </td>
      <td className="py-2 px-1 text-center">
        <Tilde activo={f.avisoTraslado}
          onClick={() => onToggle(f.ref, 'aviso_traslado', f.avisoTraslado, f.cntrs, f.cntr)}
          titulo={f.avisoTraslado
            ? 'Traslado avisado — click para desmarcar'
            : 'Marcar que avisaste el traslado al cliente'} />
      </td>
      <td className="py-2 px-1 text-center">
        <Tilde activo={f.avisoSalida}
          onClick={() => onToggle(f.ref, 'aviso_salida', f.avisoSalida, f.cntrs, f.cntr)}
          titulo={f.avisoSalida
            ? 'Salida avisada — click para desmarcar'
            : 'Marcar que avisaste la salida'} />
      </td>
      <td className="py-2 px-1 text-center">
        {f.informeSinVisita ? (
          <span title="Hay informe pero la visita no está marcada — o falta el tilde, o el informe no corresponde"
            className="w-6 h-6 rounded-full inline-flex items-center justify-center bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
            <Warning size={15} weight="fill" />
          </span>
        ) : (
          <Derivado activo={f.informe} titulo={f.informe ? 'Informe operativo subido' : f.visita ? 'Fuiste pero falta el informe' : 'Sin informe (no fuiste)'} />
        )}
      </td>
    </tr>
  )
}

/** Señal que se marca a mano. `parcial` = avisado en algunos contenedores pero
 *  no en todos: se pinta ámbar para que no se lea como hecho. */
function Tilde({ activo, onClick, titulo, parcial }: {
  activo: boolean; onClick: () => void; titulo: string; parcial?: boolean
}) {
  const tono = activo
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
    : parcial
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 hover:bg-amber-200'
      : 'bg-muted text-muted-foreground/40 hover:bg-primary/10 hover:text-primary'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      title={titulo}
      className={`w-6 h-6 rounded-full inline-flex items-center justify-center transition-colors cursor-pointer ${tono}`}
    >
      <CheckCircle size={15} weight={activo || parcial ? 'fill' : 'regular'} />
    </button>
  )
}

/** Señal derivada de un hecho (fotos / informe): no se puede tildar. */
function Derivado({ activo, titulo }: { activo: boolean; titulo: string }) {
  return (
    <span
      title={titulo}
      className={`w-6 h-6 rounded-full inline-flex items-center justify-center ${
        activo ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300' : 'bg-muted text-muted-foreground/30'
      }`}
    >
      <CheckCircle size={15} weight={activo ? 'fill' : 'regular'} />
    </span>
  )
}
