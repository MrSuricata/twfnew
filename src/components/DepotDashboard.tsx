/**
 * HOY del depósito (PLANIR, GODILCO, TCP…). Seis cards, en este orden:
 * operativas de hoy · retiros próximos · LIBRE por vencer · LCL a
 * desconsolidar · plan de carga 14 días · mis avisos. Abajo, el calendario.
 *
 * El depósito PROPONE ("Retiré", "Devolví el vacío", "Desconsolidé, stock Nº")
 * y el equipo confirma desde HOY admin: acá no se escribe nada en la operación,
 * solo se crea un aviso en `partner_avisos`. La fila muestra "esperando
 * confirmación" mientras está pendiente y desaparece cuando la confirman.
 *
 * Toda la lógica es de `lib/hoyDeposito.ts` (testeada); este archivo pinta.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  Warehouse, Anchor, ArrowUUpLeft, Package, ChatCircleDots,
  CheckCircle, Clock, XCircle, ArrowsLeftRight,
} from '@phosphor-icons/react'
import AgendaCalendar from '@/components/agenda/AgendaCalendar'
import PartnerDashboardShell from '@/components/PartnerDashboardShell'
import ProximasSalidas from '@/components/ProximasSalidas'
import AvisoOperativo from '@/components/AvisoOperativo'
import PanelCard, { PanelFila, FilaTitulo, FilaDatos, Ref, Chip as ChipPanel, Dato, type TonoPanel } from './partner/PanelCard'
import ChipTransporte from './trucks/ChipTransporte'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import { fetchPartnerAvisos, crearPartnerAviso, cancelarPartnerAviso } from '@/lib/dataClient'
import {
  PARTNER_AVISO_LABEL, stockValido, puedeCancelarAviso,
  type PartnerAviso, type NuevoPartnerAviso,
} from '@/lib/partnerAvisos'
import {
  operativasDeHoy, retirosProximos, libresPorVencer, lclADesconsolidar,
  RETIROS_DIAS_ATRAS, RETIROS_DIAS_ADELANTE, LIBRE_DIAS_AVISO,
  type OperativaHoy, type RetiroProximo, type LibrePorVencer, type LclSinStock, type SeveridadLibre,
} from '@/lib/hoyDeposito'
import { fmtDateDMY, fmtNum, hoyISO } from '@/lib/format'
import { formatKg, formatM3 } from '@/lib/truckUtils'
import { colorDeposito } from '@/lib/depositoColor'
import { ETIQUETA_RETIRO, DETALLE_RETIRO, ETIQUETA_DEVOLUCION, DETALLE_DEVOLUCION } from '@/lib/hoyDeposito'

interface DepotDashboardProps {
  shipments: ParsedShipment[]
  depotName: string
  userName: string
  onLogout: () => void
  /** Vista previa desde el admin ("Ver como"): no se piden ni se mandan avisos
   *  (el token es de admin y escribir sería actuar por el partner). */
  preview?: boolean
}

// ── Piezas chicas ─────────────────────────────────────────────────────

/** Alerta grande: cambia cómo se trabaja la carga, tiene que verse de lejos. */
function AlertaGrande({ texto, titulo, clase }: { texto: string; titulo: string; clase: string }) {
  return (
    <span title={titulo} className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-bold whitespace-nowrap ${clase}`}>
      {texto}
    </span>
  )
}

function AlertasCarga({ madera, imo, oog, noApilable }: { madera: boolean; imo: boolean; oog: boolean; noApilable: boolean }) {
  if (!madera && !imo && !oog && !noApilable) return null
  return (
    <span className="inline-flex flex-wrap gap-1">
      {madera && <AlertaGrande texto="🪵 Madera" titulo="Embalaje de madera — SENASA en frontera" clase="bg-amber-50 text-amber-900 border-amber-300" />}
      {imo && <AlertaGrande texto="☣ IMO" titulo="Carga peligrosa" clase="bg-red-50 text-red-800 border-red-300" />}
      {oog && <AlertaGrande texto="📐 OOG" titulo="Sobredimensionada (out of gauge)" clase="bg-violet-50 text-violet-800 border-violet-300" />}
      {noApilable && <AlertaGrande texto="⛔ No apilable" titulo="No se puede estibar nada encima" clase="bg-slate-100 text-slate-800 border-slate-400" />}
    </span>
  )
}

function Chip({ children, clase = 'bg-slate-100 text-slate-700 border-slate-300', titulo }: { children: ReactNode; clase?: string; titulo?: string }) {
  return (
    <span title={titulo} className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${clase}`}>
      {children}
    </span>
  )
}

function Medidas({ pkgs, kg, m3 }: { pkgs: number; kg: number; m3: number }) {
  const partes: string[] = []
  if (pkgs) partes.push(`${fmtNum(pkgs)} blt`)
  if (kg) partes.push(`${formatKg(kg)} kg`)
  if (m3) partes.push(`${formatM3(m3)} m³`)
  if (!partes.length) return null
  return <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{partes.join(' · ')}</span>
}

/** Estado del aviso ya mandado sobre esa fila: esperando o rechazado con motivo.
 *  Mientras está pendiente va al lado un "Deshacer" discreto (Brian 03/09: "que
 *  el depósito pueda deshacer una acción si se equivoca"). Confirmado ya no:
 *  esa acción se aplicó sobre la carga y la corrige el equipo. */
function EstadoAviso({ aviso, onDeshacer, deshaciendo = false }: {
  aviso: PartnerAviso
  onDeshacer?: (a: PartnerAviso) => void
  deshaciendo?: boolean
}) {
  if (aviso.estado === 'pendiente') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800" title={`Avisado el ${fmtDateDMY(aviso.createdAt.slice(0, 10))} — el equipo todavía no lo confirmó`}>
          <Clock size={13} weight="fill" /> Esperando confirmación
        </span>
        {onDeshacer && (
          <button
            type="button"
            className={btnDeshacer}
            disabled={deshaciendo}
            onClick={() => onDeshacer(aviso)}
            title="Lo mandaste por error: se da de baja. El equipo ve que hubo un aviso y que lo cancelaste."
          >
            {deshaciendo ? 'Deshaciendo…' : 'Deshacer'}
          </button>
        )}
      </span>
    )
  }
  if (aviso.estado === 'rechazado') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800" title="El equipo no confirmó este aviso. Podés volver a mandarlo.">
        <XCircle size={13} weight="fill" /> No confirmado{aviso.motivoRechazo ? `: ${aviso.motivoRechazo}` : ''}
      </span>
    )
  }
  return null
}

/** Cada card con su color, para que se distingan de un vistazo (Brian 02/09). */
function Seccion({ icono, titulo, subtitulo, cantidad, tono = 'neutro', children }: {
  icono: ReactNode
  titulo: string
  subtitulo?: string
  cantidad: number
  tono?: TonoPanel
  children: ReactNode
}) {
  return (
    <PanelCard
      tono={cantidad === 0 ? 'neutro' : tono}
      icono={icono}
      titulo={titulo}
      subtitulo={subtitulo}
      contador={cantidad}
    >
      {children}
    </PanelCard>
  )
}

function Vacio({ texto }: { texto: string }) {
  return <p className="px-4 py-4 text-sm text-muted-foreground">{texto}</p>
}

const btnPrimario = 'h-8 px-3 rounded-full bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-50'
const btnBorde = 'h-8 px-3 rounded-full border border-primary/40 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors disabled:opacity-50'
const btnGris = 'h-8 px-2 rounded-full border border-border text-xs text-muted-foreground hover:bg-muted transition-colors'
/** Deshacer: discreto a propósito — es la salida de emergencia, no una acción del día. */
const btnDeshacer = 'text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50 disabled:no-underline'
const inputChico = 'h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50'

const claseSeveridad: Record<SeveridadLibre, { fila: string; badge: string }> = {
  vencido: { fila: 'border-red-300 bg-red-50/60', badge: 'bg-red-600 text-white' },
  hoy: { fila: 'border-orange-300 bg-orange-50/60', badge: 'bg-orange-500 text-white' },
  urgente: { fila: 'border-amber-300 bg-amber-50/50', badge: 'bg-amber-400 text-amber-950' },
  proximo: { fila: 'border-border bg-background/50', badge: 'bg-slate-200 text-slate-800' },
  // Sin fecha de LIBRE no hay plazo: se pinta en celeste (dato faltante), nunca
  // con los colores de vencimiento.
  sin_dato: { fila: 'border-sky-300 bg-sky-50/60', badge: 'bg-sky-600 text-white' },
}

/** Fondo de las filas que están por un dato que falta, no por un vencimiento. */
const TINTE_FALTA_DATO = 'border-sky-300 bg-sky-50/60'

/**
 * El texto del badge de la fila. Sin fecha de LIBRE se dice exactamente eso:
 * antes se mostraba el 9999 que la lógica usaba para ordenar y la fila decía
 * "vence en 9999d" (Brian 03/09).
 */
function textoLibre(l: LibrePorVencer): string {
  if (l.dias === null) return 'sin fecha de libre'
  if (l.dias < 0) return `vencido hace ${-l.dias}d`
  if (l.dias === 0) return 'vence HOY'
  return `vence en ${l.dias}d`
}

/** Qué dato nos falta, en la frase que el depósito puede reenviar. */
function textoFaltaDato(l: LibrePorVencer): string {
  if (l.faltaLibre && l.faltaDev) return 'Nos falta cargar la fecha de libre y la terminal de devolución.'
  if (l.faltaLibre) return 'Nos falta cargar la fecha de libre de este contenedor.'
  return 'Nos falta asignar la terminal donde se devuelve el vacío.'
}

// ── Panel ─────────────────────────────────────────────────────────────

export default function DepotDashboard({ shipments, depotName, userName, onLogout, preview = false }: DepotDashboardProps) {
  const hoy = hoyISO()
  const [avisos, setAvisos] = useState<PartnerAviso[]>([])
  const [avisosError, setAvisosError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState<Set<string>>(new Set())
  /** Borradores inline: fecha de devolución por fila y Nº de stock por LCL. */
  const [fechaDevolvi, setFechaDevolvi] = useState<Record<string, string>>({})
  const [stockDraft, setStockDraft] = useState<Record<string, string>>({})

  const cargarAvisos = useCallback(async () => {
    try {
      setAvisos(await fetchPartnerAvisos())
      setAvisosError(null)
    } catch (err) {
      setAvisosError((err as Error)?.message || 'No se pudieron cargar tus avisos')
    }
  }, [])

  useEffect(() => { if (!preview) cargarAvisos() }, [cargarAvisos, preview])

  const hoyOps = useMemo(() => operativasDeHoy(shipments, hoy, depotName), [shipments, hoy, depotName])
  const retiros = useMemo(() => retirosProximos(shipments, hoy, depotName, avisos), [shipments, hoy, depotName, avisos])
  const libres = useMemo(() => libresPorVencer(shipments, hoy, depotName, avisos), [shipments, hoy, depotName, avisos])
  const lcls = useMemo(() => lclADesconsolidar(shipments, hoy, depotName, avisos), [shipments, hoy, depotName, avisos])
  const misAvisos = useMemo(() => [...avisos].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [avisos])
  const libresVencidos = libres.filter(l => l.severidad === 'vencido').length
  const libresSinDato = libres.filter(l => l.motivo === 'falta_dato').length
  // Se dice la regla, no "todos los contenedores": acá solo entran los vacíos
  // con la operativa ya hecha, y por vencimiento o por dato faltante (Brian 03/09).
  const subtituloVacios = [
    `solo con la operativa ya hecha · libre a ${LIBRE_DIAS_AVISO} días o menos, o con datos faltantes`,
    libresVencidos ? `${libresVencidos} con LIBRE vencido` : '',
    libresSinDato ? `${libresSinDato} esperando un dato nuestro` : '',
  ].filter(Boolean).join(' · ')

  const clave = (ref: string, cntr: string) => `${ref}|${cntr}`

  /** Crea el aviso y lo refleja al instante; después se resincroniza con el server. */
  const mandarAviso = async (input: NuevoPartnerAviso, ok: string) => {
    if (preview) {
      toast.info('Vista previa', { description: 'Acá el depósito manda el aviso y el equipo lo confirma desde HOY.' })
      return false
    }
    const k = `${input.tipo}|${clave(input.ref, input.cntr || '')}`
    if (enviando.has(k)) return
    setEnviando(prev => new Set(prev).add(k))
    try {
      const aviso = await crearPartnerAviso(input)
      setAvisos(prev => [aviso, ...prev.filter(a => a.id !== aviso.id)])
      toast.success(ok, { description: 'El equipo lo confirma desde su HOY. Lo ves en "Mis avisos".' })
      cargarAvisos()
      return true
    } catch (err) {
      toast.error('No se pudo mandar el aviso', { description: (err as Error)?.message || 'Probá de nuevo en un momento.' })
      return false
    } finally {
      setEnviando(prev => { const n = new Set(prev); n.delete(k); return n })
    }
  }

  const retire = (r: RetiroProximo) =>
    mandarAviso({ tipo: 'retire', ref: r.ref, cntr: r.cntr, dato: { fecha: hoy } }, `${r.ref} — avisaste que retiraste ${r.cntr || 'el contenedor'}`)

  const devolvi = async (l: LibrePorVencer) => {
    const k = clave(l.ref, l.cntr)
    const fecha = fechaDevolvi[k] ?? hoy
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { toast.error('Elegí la fecha en que devolviste el vacío'); return }
    if (fecha > hoy) { toast.error('La fecha de devolución no puede ser futura'); return }
    const ok = await mandarAviso({ tipo: 'devolvi', ref: l.ref, cntr: l.cntr, dato: { fecha } }, `${l.ref} — avisaste que devolviste ${l.cntr || 'el vacío'} el ${fmtDateDMY(fecha)}`)
    if (ok) setFechaDevolvi(prev => { const n = { ...prev }; delete n[k]; return n })
  }

  const desconsolide = async (c: LclSinStock) => {
    const stock = (stockDraft[c.ref] || '').trim()
    if (!stockValido(stock)) { toast.error('El Nº de stock tiene que ser de 3 a 7 dígitos'); return }
    const ok = await mandarAviso({ tipo: 'desconsolide', ref: c.ref, cntr: '', dato: { stock, fecha: hoy } }, `${c.ref} — avisaste la desconsolidación, stock Nº ${stock}`)
    if (ok) setStockDraft(prev => { const n = { ...prev }; delete n[c.ref]; return n })
  }

  const ocupado = (tipo: string, ref: string, cntr: string) => enviando.has(`${tipo}|${clave(ref, cntr)}`)

  // Deshacer un aviso mandado por error (Brian 03/09). Solo aparece mientras
  // está PENDIENTE: si el equipo ya lo confirmó, la acción se aplicó sobre la
  // carga (p. ej. LIBRE = DEVUELTO) y deshacerla acá dejaría los datos
  // inconsistentes — eso lo corrige el equipo. El server revalida los dos
  // candados (propio + pendiente): esto solo evita el viaje al pedo.
  const [deshaciendo, setDeshaciendo] = useState<string | null>(null)
  const quienSoy = useMemo(() => ({ rol: 'depot', alcance: depotName }), [depotName])
  const puedoDeshacer = (a: PartnerAviso | undefined) => !!a && !preview && puedeCancelarAviso(a, quienSoy).puede

  const deshacerAviso = async (a: PartnerAviso) => {
    if (deshaciendo) return
    const que = `${PARTNER_AVISO_LABEL[a.tipo].toLowerCase()} · ${a.ref}${a.cntr ? ` · ${a.cntr}` : ''}`
    if (!window.confirm(`¿Deshacer el aviso "${que}"? El equipo va a ver que lo cancelaste.`)) return
    setDeshaciendo(a.id)
    try {
      const cancelado = await cancelarPartnerAviso(a.id)
      setAvisos(prev => prev.map(x => (x.id === cancelado.id ? cancelado : x)))
      toast.success('Aviso deshecho', { description: 'Podés volver a avisar cuando corresponda.' })
      cargarAvisos()
    } catch (err) {
      // El 409 del server ("el equipo ya lo confirmó") viaja con su mensaje:
      // se muestra tal cual, es la explicación que le sirve al depósito.
      toast.error('No se pudo deshacer el aviso', { description: (err as Error)?.message || 'Probá de nuevo en un momento.' })
      cargarAvisos()
    } finally {
      setDeshaciendo(null)
    }
  }

  return (
    <PartnerDashboardShell
      icon={<Warehouse size={24} className="text-primary" weight="duotone" />}
      title={depotName}
      userName={userName}
      onLogout={onLogout}
    >
      <div className="space-y-4">
        <AvisoOperativo />

        {/* 1 · Operativas de hoy */}
        <Seccion icono={<ArrowsLeftRight size={22} weight="duotone" />} titulo="Operativas de hoy" subtitulo={fmtDateDMY(hoy)} cantidad={hoyOps.length} tono="ok">
          {hoyOps.length === 0 ? <Vacio texto="Hoy no tenés cargas ni retiros programados." /> : (
            <ul className="divide-y divide-border">
              {hoyOps.map((o, i) => <FilaOperativaHoy key={`${o.ref}-${o.cntr}-${i}`} o={o} />)}
            </ul>
          )}
        </Seccion>

        {/* 2 · Retiros próximos */}
        <Seccion
          icono={<Anchor size={22} weight="duotone" />}
          titulo="Retiros próximos"
          subtitulo={`de la terminal a tu depósito · en verde, las que ya podés ir a buscar · desde hace ${RETIROS_DIAS_ATRAS} días hasta ${RETIROS_DIAS_ADELANTE} adelante`}
          cantidad={retiros.length}
          tono="info"
        >
          {retiros.length === 0 ? <Vacio texto="No hay contenedores para retirar en estos días." /> : (
            <ul className="divide-y divide-border">
              {retiros.map((r, i) => (
                <li key={`${r.ref}-${r.cntr}-${i}`}>
                  <PanelFila
                    tinte={r.estado === 'listo' ? 'bg-emerald-50/70' : undefined}
                    accion={r.aviso?.estado === 'pendiente'
                      ? <EstadoAviso aviso={r.aviso} onDeshacer={puedoDeshacer(r.aviso) ? deshacerAviso : undefined} deshaciendo={deshaciendo === r.aviso.id} />
                      : (
                        <>
                          {r.aviso && <EstadoAviso aviso={r.aviso} />}
                          <button
                            type="button"
                            className={btnPrimario}
                            disabled={ocupado('retire', r.ref, r.cntr)}
                            onClick={() => retire(r)}
                            title="El contenedor ya salió de la terminal hacia tu depósito. El equipo lo confirma."
                          >
                            Retiré
                          </button>
                        </>
                      )}
                  >
                    <FilaTitulo>
                      <Ref>{r.ref}</Ref>
                      {/* Lo primero que mira el depósito: ¿puedo ir a buscarlo?
                          Liberación de la naviera + terminal paga (Brian 03/09). */}
                      <ChipPanel
                        title={DETALLE_RETIRO[r.estado]}
                        clase={r.estado === 'listo'
                          ? 'bg-emerald-600 text-white border-emerald-700'
                          : 'bg-amber-100 text-amber-900 border-amber-400'}
                      >
                        {ETIQUETA_RETIRO[r.estado]}
                      </ChipPanel>
                      {r.terminal && <ChipPanel clase={colorDeposito(r.terminal)} title="Terminal de la que se retira">{r.terminal}</ChipPanel>}
                      <span className="text-sm text-foreground/80 truncate max-w-full sm:max-w-[220px]" title={r.cliente}>{r.cliente || '—'}</span>
                      <span className="font-mono text-sm whitespace-nowrap">{r.cntr || '—'}{r.tipo && <span className="ml-1 text-muted-foreground">{r.tipo}</span>}</span>
                      <ChipPanel title="Operativa">{r.operativa}</ChipPanel>
                    </FilaTitulo>
                    <FilaDatos>
                      <Dato label="Llega" fuerte>
                        {r.eta ? fmtDateDMY(r.eta) : '—'}
                        <span className="font-normal text-muted-foreground"> · {r.dias === 0 ? 'hoy' : r.dias > 0 ? `en ${r.dias}d` : `hace ${-r.dias}d`}</span>
                      </Dato>
                      {r.turno && <Dato label="Turno" fuerte>{fmtDateDMY(r.turno)}</Dato>}
                      {r.libre && <Dato label="Libre" fuerte>{/^\d{4}-/.test(r.libre) ? fmtDateDMY(r.libre) : r.libre}</Dato>}
                      <Medidas pkgs={r.pkgs} kg={r.kg} m3={r.m3} />
                    </FilaDatos>
                  </PanelFila>
                </li>
              ))}
            </ul>
          )}
        </Seccion>

        {/* 3 · LIBRE por vencer / vencidos */}
        <Seccion
          icono={<ArrowUUpLeft size={22} weight="duotone" />}
          titulo="Vacíos a devolver"
          subtitulo={subtituloVacios}
          cantidad={libres.length}
          tono="alerta"
        >
          {libres.length === 0 ? <Vacio texto="Ningún vacío con el libre por vencer ni con datos faltantes. Todo al día." /> : (
            <ul>
              {libres.map((l, i) => {
                const sev = claseSeveridad[l.severidad]
                const faltaDato = l.motivo === 'falta_dato'
                const k = clave(l.ref, l.cntr)
                const editando = fechaDevolvi[k] !== undefined
                return (
                  <li key={`${l.ref}-${l.cntr}-${i}`}>
                    <PanelFila
                      tinte={faltaDato ? TINTE_FALTA_DATO : sev.fila}
                      accion={(
                      <>
                      {l.aviso?.estado === 'pendiente'
                        ? <EstadoAviso aviso={l.aviso} onDeshacer={puedoDeshacer(l.aviso) ? deshacerAviso : undefined} deshaciendo={deshaciendo === l.aviso.id} />
                        : editando
                          ? (
                            <>
                              <input
                                type="date"
                                autoFocus
                                max={hoy}
                                value={fechaDevolvi[k]}
                                onChange={e => setFechaDevolvi(prev => ({ ...prev, [k]: e.target.value }))}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') devolvi(l)
                                  if (e.key === 'Escape') setFechaDevolvi(prev => { const n = { ...prev }; delete n[k]; return n })
                                }}
                                title="¿Qué día devolviste el vacío?"
                                className={inputChico}
                              />
                              <button type="button" className={btnPrimario} disabled={ocupado('devolvi', l.ref, l.cntr)} onClick={() => devolvi(l)}>
                                Avisar
                              </button>
                              <button type="button" aria-label="Cancelar" className={btnGris} onClick={() => setFechaDevolvi(prev => { const n = { ...prev }; delete n[k]; return n })}>
                                ✕
                              </button>
                            </>
                          )
                          : (
                            <>
                              {l.aviso && <EstadoAviso aviso={l.aviso} />}
                              <button
                                type="button"
                                className={btnBorde}
                                onClick={() => setFechaDevolvi(prev => ({ ...prev, [k]: hoy }))}
                                title="Ya devolviste el contenedor vacío a la terminal. El equipo lo confirma."
                              >
                                Devolví el vacío
                              </button>
                            </>
                          )}
                      </>
                      )}
                    >
                      <FilaTitulo>
                        <Ref>{l.ref}</Ref>
                        {/* ¿Se puede devolver ya? Pago de la devolución +
                            terminal asignada (Brian 03/09). */}
                        <ChipPanel
                          title={DETALLE_DEVOLUCION[l.estado]}
                          clase={l.estado === 'listo'
                            ? 'bg-emerald-600 text-white border-emerald-700'
                            : 'bg-amber-100 text-amber-900 border-amber-400'}
                        >
                          {ETIQUETA_DEVOLUCION[l.estado]}
                        </ChipPanel>
                        <span className="font-mono text-sm whitespace-nowrap">{l.cntr || '—'}{l.tipo && <span className="ml-1 text-muted-foreground">{l.tipo}</span>}</span>
                        <span className="text-sm text-foreground/80 truncate max-w-full sm:max-w-[220px]" title={l.cliente}>{l.cliente || '—'}</span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${sev.badge}`}>
                          {textoLibre(l)}
                        </span>
                        {/* No es un vencimiento: está en la lista porque falta un
                            dato NUESTRO (libre o terminal de devolución). */}
                        {faltaDato && (
                          <ChipPanel title={textoFaltaDato(l)} clase="bg-sky-100 text-sky-900 border-sky-400">
                            NOS FALTA UN DATO
                          </ChipPanel>
                        )}
                      </FilaTitulo>
                      <FilaDatos>
                        <Dato label="Libre" fuerte>
                          {l.libre ? fmtDateDMY(l.libre) : <span className="text-sky-700">sin fecha</span>}
                        </Dato>
                        <Dato label="Devolver en" fuerte>
                          {l.dev || <span className="text-sky-700">sin terminal</span>}
                        </Dato>
                      </FilaDatos>
                    </PanelFila>
                  </li>
                )
              })}
            </ul>
          )}
        </Seccion>

        {/* 4 · LCL a desconsolidar */}
        <Seccion icono={<Package size={22} weight="duotone" />} titulo="LCL a desconsolidar" subtitulo="llegaron y todavía no tienen Nº de stock" cantidad={lcls.length} tono="aviso">
          {lcls.length === 0 ? <Vacio texto="No hay LCL esperando desconsolidación en tu depósito." /> : (
            <ul className="divide-y divide-border">
              {lcls.map(c => (
                <li key={c.ref} className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="font-semibold text-sm whitespace-nowrap">{c.ref}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-[180px]" title={c.cliente}>{c.cliente || '—'}</span>
                  <span className="text-xs whitespace-nowrap">
                    Llegó <b>{fmtDateDMY(c.eta)}</b>
                    <span className={`ml-1 ${c.diasDesdeEta >= 3 ? 'font-semibold text-amber-700' : 'text-muted-foreground'}`}>
                      · {c.diasDesdeEta === 0 ? 'hoy' : `hace ${c.diasDesdeEta}d`}
                    </span>
                  </span>
                  {c.descripcion && <span className="text-xs truncate max-w-[240px]" title={c.descripcion}>{c.descripcion}</span>}
                  <Medidas pkgs={c.pkgs} kg={c.kg} m3={c.m3} />
                  {c.fiscal && <span className="text-xs text-muted-foreground whitespace-nowrap">→ {c.fiscal}</span>}
                  <span className="ml-auto flex items-center gap-2">
                    {c.aviso?.estado === 'pendiente'
                      ? (
                        <>
                          {c.aviso.dato.stock && <span className="text-xs text-muted-foreground">stock Nº <b className="text-foreground">{c.aviso.dato.stock}</b></span>}
                          <EstadoAviso aviso={c.aviso} onDeshacer={puedoDeshacer(c.aviso) ? deshacerAviso : undefined} deshaciendo={deshaciendo === c.aviso.id} />
                        </>
                      )
                      : (
                        <>
                          {c.aviso && <EstadoAviso aviso={c.aviso} />}
                          <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                            Stock Nº
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="\d{3,7}"
                              placeholder="45012"
                              value={stockDraft[c.ref] || ''}
                              onChange={e => setStockDraft(prev => ({ ...prev, [c.ref]: e.target.value.replace(/\D/g, '').slice(0, 7) }))}
                              onKeyDown={e => { if (e.key === 'Enter') desconsolide(c) }}
                              aria-invalid={!!stockDraft[c.ref] && !stockValido(stockDraft[c.ref])}
                              className={`${inputChico} w-24 font-mono`}
                            />
                          </label>
                          <button
                            type="button"
                            className={btnPrimario}
                            disabled={!stockValido(stockDraft[c.ref]) || ocupado('desconsolide', c.ref, '')}
                            onClick={() => desconsolide(c)}
                            title="Desconsolidaste la LCL y le diste Nº de stock. El equipo lo confirma."
                          >
                            Desconsolidé
                          </button>
                        </>
                      )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Seccion>

        {/* 5 · Próximos 14 días (plan de carga, formato del mail) */}
        <ProximasSalidas shipments={shipments} rol="depot" />

        {/* 6 · Mis avisos */}
        <Seccion icono={<ChatCircleDots size={22} weight="duotone" />} titulo="Mis avisos" subtitulo="lo que avisaste y qué dijo el equipo · últimos 30 días" cantidad={misAvisos.length}>
          {avisosError && <p className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-200">{avisosError} · <button type="button" className="underline" onClick={cargarAvisos}>reintentar</button></p>}
          {misAvisos.length === 0 ? <Vacio texto="Todavía no mandaste ningún aviso. Cuando retires, devuelvas o desconsolides, avisá desde las cards de arriba." /> : (
            <ul className="divide-y divide-border">
              {misAvisos.map(a => <FilaAviso key={a.id} a={a} onDeshacer={puedoDeshacer(a) ? deshacerAviso : undefined} deshaciendo={deshaciendo === a.id} />)}
            </ul>
          )}
        </Seccion>

        <AgendaCalendar shipments={shipments} depotFilter={depotName} partnerView={true} />
      </div>
    </PartnerDashboardShell>
  )
}

// ── Filas ─────────────────────────────────────────────────────────────

function FilaOperativaHoy({ o }: { o: OperativaHoy }) {
  return (
    <li>
      <PanelFila
        accion={(
          <span className="flex flex-wrap items-center gap-1.5">
            <AlertasCarga madera={o.madera} imo={o.imo} oog={o.oog} noApilable={o.noApilable} />
            {o.tlxPendiente && o.motivo !== 'carga' && <AlertaGrande texto="TLX pendiente" titulo="Telex release todavía no liberado" clase="bg-orange-50 text-orange-800 border-orange-300" />}
          </span>
        )}
      >
        <FilaTitulo>
          <ChipPanel clase={o.motivo === 'carga' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : o.motivo === 'retiro' ? 'bg-sky-100 text-sky-800 border-sky-300' : 'bg-violet-100 text-violet-800 border-violet-300'}>
            {o.motivo === 'carga' ? 'CARGA CAMIÓN' : o.motivo === 'retiro' ? 'LLEGA DE TERMINAL' : 'LLEGA Y CARGA'}
          </ChipPanel>
          <Ref>{o.ref}</Ref>
          <span className="text-sm text-foreground/80 truncate max-w-full sm:max-w-[220px]" title={o.cliente}>{o.cliente || '—'}</span>
          <span className="font-mono text-sm whitespace-nowrap">{o.cntr || '—'}{o.tipo && <span className="ml-1 text-muted-foreground">{o.tipo}</span>}</span>
          {o.operativa && <ChipPanel title="Operativa">{o.operativa}</ChipPanel>}
        </FilaTitulo>
        <FilaDatos>
          {o.motivo !== 'retiro' && (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <ChipTransporte transporte={o.transporte} />
              {o.horario && <span>· {o.horario}</span>}
            </span>
          )}
          {o.fiscal && o.motivo !== 'retiro' && <Dato label="Va a">{o.fiscal}</Dato>}
          <Medidas pkgs={o.pkgs} kg={o.kg} m3={o.m3} />
          {o.descripcion && <span className="truncate max-w-[260px]" title={o.descripcion}>{o.descripcion}</span>}
        </FilaDatos>
      </PanelFila>
    </li>
  )
}

function FilaAviso({ a, onDeshacer, deshaciendo = false }: {
  a: PartnerAviso
  onDeshacer?: (a: PartnerAviso) => void
  deshaciendo?: boolean
}) {
  const estado = a.estado === 'confirmado'
    ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white"><CheckCircle size={13} weight="fill" /> Confirmado{a.resolvedBy ? ` por ${a.resolvedBy}` : ''}</span>
    : a.estado === 'rechazado'
      ? <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white"><XCircle size={13} weight="fill" /> No confirmado{a.resolvedBy ? ` por ${a.resolvedBy}` : ''}</span>
      : a.estado === 'cancelado'
        // Lo deshizo el propio depósito: queda a la vista para que se entienda
        // por qué el equipo ya no lo tiene que atender.
        ? <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground"><ArrowUUpLeft size={13} weight="fill" /> Deshecho por vos</span>
        : (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"><Clock size={13} weight="fill" /> Esperando confirmación</span>
            {onDeshacer && (
              <button type="button" className={btnDeshacer} disabled={deshaciendo} onClick={() => onDeshacer(a)} title="Lo mandaste por error: se da de baja.">
                {deshaciendo ? 'Deshaciendo…' : 'Deshacer'}
              </button>
            )}
          </span>
        )
  const dato = a.tipo === 'desconsolide'
    ? `stock Nº ${a.dato?.stock || '—'}${a.dato?.fecha ? ` · ${fmtDateDMY(a.dato.fecha)}` : ''}`
    : a.dato?.fecha ? fmtDateDMY(a.dato.fecha) : ''
  return (
    <li className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="text-xs text-muted-foreground whitespace-nowrap" title={a.createdAt}>{fmtDateDMY(a.createdAt.slice(0, 10))}</span>
      <span className="font-semibold text-sm whitespace-nowrap">{a.ref}</span>
      {a.cntr && <span className="font-mono text-xs">{a.cntr}</span>}
      <span className="text-sm">{PARTNER_AVISO_LABEL[a.tipo]}</span>
      {dato && <span className="text-xs text-muted-foreground">{dato}</span>}
      <span className="ml-auto flex flex-wrap items-center gap-2 justify-end">
        {a.estado === 'rechazado' && a.motivoRechazo && (
          <span className="text-xs text-red-800 max-w-[320px]" title={a.motivoRechazo}>Motivo: {a.motivoRechazo}</span>
        )}
        {estado}
      </span>
    </li>
  )
}
