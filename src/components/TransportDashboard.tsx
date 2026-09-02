/**
 * HOY del transporte (TRANSCAL, CARRARA…): qué carga hoy con las alertas que
 * cambian cómo se trabaja, qué se le viene, qué cargas especiales tiene
 * asignadas y qué avisos mandó. Los datos son las operativas de su alcance que
 * ya manda el server (`partner-shipments`); la única escritura del partner es
 * proponer "SENASA solicitado", que el equipo confirma desde HOY admin.
 *
 * Lógica pura en src/lib/hoyTransporte.ts. Spec:
 * docs/superpowers/specs/2026-09-01-partner-hoy-avisos-design.md
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Truck, Sun, Lightning, Bell, CheckCircle, Clock, Warning, CaretDown, CaretRight } from '@phosphor-icons/react'
import AgendaCalendar from '@/components/agenda/AgendaCalendar'
import PartnerDashboardShell from '@/components/PartnerDashboardShell'
import ProximasSalidas from '@/components/ProximasSalidas'
import AvisoOperativo from '@/components/AvisoOperativo'
import ChipDeposito from '@/components/trucks/ChipDeposito'
import { Button } from '@/components/ui/button'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import { fmtDateDMY, fmtNum, hoyISO } from '@/lib/format'
import { formatKg, formatM3 } from '@/lib/truckUtils'
import { fetchPartnerAvisos, crearPartnerAviso } from '@/lib/dataClient'
import {
  avisoPendiente, senasaSolicitado, ultimoAviso, PARTNER_AVISO_LABEL,
  type PartnerAviso, type PartnerAvisoEstado,
} from '@/lib/partnerAvisos'
import {
  hoyCargan, cargasEspeciales, avisosRecientes, ALERTA_LABEL, ORDEN_ALERTAS,
  ESPECIALES_DIAS_ADELANTE, type CargaHoy, type AlertasCarga, type TipoAlerta,
} from '@/lib/hoyTransporte'

interface TransportDashboardProps {
  shipments: ParsedShipment[]
  transportName: string
  userName: string
  onLogout: () => void
  /** Vista previa desde el admin ("Ver como"): no se piden ni se mandan avisos
   *  (el token es de admin y escribir sería actuar por el partner). */
  preview?: boolean
}

// ── Piezas visuales ─────────────────────────────────────────────────────

/** Misma piel que el Plan de carga: card plegable con título y contador. */
function CardHoy({ icono, titulo, resumen, children, abiertaPorDefecto = true }: {
  icono: ReactNode
  titulo: string
  resumen?: ReactNode
  children: ReactNode
  abiertaPorDefecto?: boolean
}) {
  const [abierta, setAbierta] = useState(abiertaPorDefecto)
  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setAbierta(v => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        {abierta ? <CaretDown size={14} weight="bold" /> : <CaretRight size={14} weight="bold" />}
        {icono}
        <span className="font-semibold text-sm">{titulo}</span>
        {resumen && <span className="text-xs text-muted-foreground">{resumen}</span>}
      </button>
      {abierta && <div className="border-t border-border">{children}</div>}
    </section>
  )
}

const CLASE_ALERTA: Record<TipoAlerta, string> = {
  imo: 'bg-red-100 text-red-800 border-red-300',
  oog: 'bg-violet-100 text-violet-800 border-violet-300',
  madera: 'bg-amber-100 text-amber-900 border-amber-300',
  noApilable: 'bg-orange-100 text-orange-800 border-orange-300',
}

/** Alerta GRANDE: ícono + texto, visible sin hover. Es lo que el chofer y el
 *  que arma la unidad tienen que ver de un vistazo. */
function AlertaGrande({ tipo }: { tipo: TipoAlerta }) {
  const a = ALERTA_LABEL[tipo]
  return (
    <span
      title={a.ayuda}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-bold ${CLASE_ALERTA[tipo]}`}
    >
      <span aria-hidden>{a.icono}</span>
      {a.texto}
    </span>
  )
}

function AlertaTlx() {
  return (
    <span
      title="Retiro de terminal y la naviera todavía no liberó el telex: sin telex no se puede retirar el contenedor. Consultá antes de mandar la unidad."
      className="inline-flex items-center gap-1.5 rounded-md border border-red-400 bg-white px-2.5 py-1 text-sm font-bold text-red-700"
    >
      <Warning size={16} weight="fill" />
      TLX pendiente
    </span>
  )
}

/** Botón SENASA con sus tres estados: pedir · esperando confirmación · ✓. */
function BotonSenasa({ carga, avisos, enviando, onSolicitar }: {
  carga: CargaHoy
  avisos: PartnerAviso[]
  enviando: boolean
  onSolicitar: (c: CargaHoy) => void
}) {
  if (senasaSolicitado(avisos, carga.ref, carga.cntr)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-green-300 bg-green-100 px-2.5 py-1 text-sm font-bold text-green-800">
        <CheckCircle size={16} weight="fill" />
        SENASA solicitado
      </span>
    )
  }
  const pendiente = avisoPendiente(avisos, 'senasa', carga.ref, carga.cntr)
  if (pendiente) {
    return (
      <span
        title={`Avisado el ${fmtDateDMY(pendiente.dato?.fecha) || fmtDateDMY(pendiente.createdAt.slice(0, 10))}. El equipo lo confirma desde HOY.`}
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-amber-400 bg-amber-50 px-2.5 py-1 text-sm font-semibold text-amber-800"
      >
        <Clock size={16} weight="fill" />
        SENASA · esperando confirmación
      </span>
    )
  }
  const ultimo = ultimoAviso(avisos, 'senasa', carga.ref, carga.cntr)
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <Button size="sm" className="h-8 font-bold" disabled={enviando} onClick={() => onSolicitar(carga)}>
        {enviando ? 'Avisando…' : 'SENASA solicitado'}
      </Button>
      {ultimo?.estado === 'rechazado' && (
        <span className="text-[11px] text-red-700">
          Último aviso rechazado{ultimo.motivoRechazo ? `: ${ultimo.motivoRechazo}` : ''}. Podés volver a avisar.
        </span>
      )}
    </span>
  )
}

function ListaAlertas({ alertas, children }: { alertas: AlertasCarga; children?: ReactNode }) {
  const activas = ORDEN_ALERTAS.filter(t => alertas[t])
  if (activas.length === 0 && !alertas.tlxPendiente && !children) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {activas.map(t => <AlertaGrande key={t} tipo={t} />)}
      {alertas.tlxPendiente && <AlertaTlx />}
      {children}
    </div>
  )
}

const ESTADO_AVISO: Record<PartnerAvisoEstado, { texto: string; clase: string; icono: ReactNode }> = {
  pendiente: { texto: 'Esperando confirmación', clase: 'bg-amber-50 text-amber-800 border-amber-300', icono: <Clock size={14} weight="fill" /> },
  confirmado: { texto: 'Confirmado', clase: 'bg-green-100 text-green-800 border-green-300', icono: <CheckCircle size={14} weight="fill" /> },
  rechazado: { texto: 'Rechazado', clase: 'bg-red-100 text-red-800 border-red-300', icono: <Warning size={14} weight="fill" /> },
}

const fechaCorta = (iso: string): string => (iso ? fmtDateDMY(iso.slice(0, 10)) : '')

// ── Panel ───────────────────────────────────────────────────────────────

export default function TransportDashboard({ shipments, transportName, userName, onLogout, preview = false }: TransportDashboardProps) {
  const hoy = hoyISO()
  const [avisos, setAvisos] = useState<PartnerAviso[]>([])
  const [avisosError, setAvisosError] = useState<string | null>(null)
  const [avisosCargados, setAvisosCargados] = useState(false)
  const [enviando, setEnviando] = useState<string | null>(null)

  // Los avisos se piden desde el propio panel (App.tsx sólo trae las cargas).
  // Si la API no responde, se avisa dentro de la card: un hipo no puede tapar
  // el resto del HOY con toasts.
  const cargarAvisos = useCallback(async () => {
    try {
      setAvisos(await fetchPartnerAvisos())
      setAvisosError(null)
    } catch (err) {
      setAvisosError((err as Error)?.message || 'sin detalles')
    } finally {
      setAvisosCargados(true)
    }
  }, [])
  useEffect(() => { if (!preview) void cargarAvisos() }, [cargarAvisos, preview])

  const deHoy = useMemo(() => hoyCargan(shipments, hoy), [shipments, hoy])
  const especiales = useMemo(() => cargasEspeciales(shipments, hoy), [shipments, hoy])
  const misAvisos = useMemo(() => avisosRecientes(avisos, hoy), [avisos, hoy])
  const totalEspeciales = useMemo(() => new Set(especiales.flatMap(g => g.cargas.map(c => `${c.ref}|${c.cntr}`))).size, [especiales])

  const solicitarSenasa = async (c: CargaHoy) => {
    if (preview) {
      toast.info('Vista previa', { description: 'Acá el transporte avisa que pidió SENASA y el equipo lo confirma desde HOY.' })
      return
    }
    const clave = `${c.ref}|${c.cntr}`
    setEnviando(clave)
    try {
      const aviso = await crearPartnerAviso({ tipo: 'senasa', ref: c.ref, cntr: c.cntr, dato: { fecha: hoy } })
      setAvisos(prev => [aviso, ...prev.filter(a => a.id !== aviso.id)])
      toast.success(`SENASA solicitado · ${c.ref}${c.cntr ? ` · ${c.cntr}` : ''}`, {
        description: 'Queda esperando la confirmación del equipo.',
      })
      void cargarAvisos()
    } catch (err) {
      toast.error('No se pudo avisar SENASA', { description: (err as Error)?.message || 'sin detalles' })
    } finally {
      setEnviando(null)
    }
  }

  return (
    <PartnerDashboardShell
      icon={<Truck size={24} className="text-primary" weight="duotone" />}
      title={transportName}
      userName={userName}
      onLogout={onLogout}
    >
      <div className="space-y-4">
        {/* Un paro o un paso cerrado le cambia el día al transporte igual que
            al cliente: el aviso del Diario va arriba de todo. */}
        <AvisoOperativo />

        {/* 1 · Hoy cargan */}
        <CardHoy
          icono={<Sun size={18} weight="duotone" className="text-primary" />}
          titulo={`Hoy cargan · ${deHoy.length}`}
          resumen={fmtDateDMY(hoy)}
        >
          {deHoy.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Hoy no cargás ninguna.</p>
          ) : (
            <ul className="divide-y divide-border">
              {deHoy.map(c => (
                <li key={`${c.ref}|${c.cntr}`} className="px-4 py-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-bold text-base">{c.ref}</span>
                    <span className="text-sm font-medium">{c.cliente || '—'}</span>
                    {c.cntr && (
                      <span className="font-mono text-sm">
                        {c.cntr}{c.tipo && <span className="ml-1 text-muted-foreground">{c.tipo}</span>}
                      </span>
                    )}
                    <ChipDeposito deposito={c.deposito || '—'} />
                    {c.operativa && <span className="text-xs text-muted-foreground">{c.operativa}</span>}
                    {c.horario && <span className="text-xs font-semibold">{c.horario}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>Fiscal: <span className="font-medium text-foreground">{c.fiscal || '—'}</span></span>
                    <span className="tabular-nums">
                      {c.pkgs ? `${fmtNum(c.pkgs)} bultos` : '— bultos'} · {c.kg ? `${formatKg(c.kg)} kg` : '— kg'} · {c.m3 ? `${formatM3(c.m3)} m³` : '— m³'}
                    </span>
                    {c.etaFiscal && <span>Llega {fmtDateDMY(c.etaFiscal)}</span>}
                    {c.descripcion && <span className="text-foreground">{c.descripcion}</span>}
                  </div>
                  <ListaAlertas alertas={c.alertas}>
                    {c.alertas.madera && (
                      <BotonSenasa carga={c} avisos={avisos} enviando={enviando === `${c.ref}|${c.cntr}`} onSolicitar={solicitarSenasa} />
                    )}
                  </ListaAlertas>
                </li>
              ))}
            </ul>
          )}
        </CardHoy>

        {/* 2 · Próximos 14 días (el plan de carga que ya tenían, + marca OOG) */}
        <ProximasSalidas shipments={shipments} rol="transport" />

        {/* 3 · Cargas especiales asignadas */}
        <CardHoy
          icono={<Lightning size={18} weight="duotone" className="text-violet-600" />}
          titulo={`Cargas especiales asignadas · ${totalEspeciales}`}
          resumen={`próximos ${ESPECIALES_DIAS_ADELANTE} días o sin fecha · para conseguir unidad y permisos con tiempo`}
        >
          {especiales.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No tenés cargas especiales asignadas.</p>
          ) : (
            <div className="divide-y divide-border">
              {especiales.map(g => (
                <div key={g.tipo} className="px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertaGrande tipo={g.tipo} />
                    <span className="text-xs text-muted-foreground">{g.cargas.length} {g.cargas.length === 1 ? 'carga' : 'cargas'}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="text-left py-1 pr-3">Ref</th>
                          <th className="text-left py-1 pr-3">Cliente</th>
                          <th className="text-left py-1 pr-3">Contenedor</th>
                          <th className="text-left py-1 pr-3">Carga</th>
                          <th className="text-left py-1 pr-3">ETA MVD</th>
                          <th className="text-left py-1 pr-3">Fiscal</th>
                          <th className="text-left py-1">Mercadería</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {g.cargas.map(c => (
                          <tr key={`${c.ref}|${c.cntr}`}>
                            <td className="py-1.5 pr-3 font-semibold whitespace-nowrap">{c.ref}</td>
                            <td className="py-1.5 pr-3">{c.cliente || '—'}</td>
                            <td className="py-1.5 pr-3 font-mono text-xs whitespace-nowrap">
                              {c.cntr || '—'}{c.tipo && <span className="ml-1 text-muted-foreground">{c.tipo}</span>}
                            </td>
                            <td className="py-1.5 pr-3 whitespace-nowrap">
                              {c.salida
                                ? <span className="font-semibold">{fmtDateDMY(c.salida)}</span>
                                : <span className="text-muted-foreground italic">sin fecha</span>}
                            </td>
                            <td className="py-1.5 pr-3 whitespace-nowrap">{c.eta ? fmtDateDMY(c.eta) : '—'}</td>
                            <td className="py-1.5 pr-3 whitespace-nowrap">{c.fiscal || '—'}</td>
                            <td className="py-1.5 text-xs">{c.descripcion || <span className="text-muted-foreground">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardHoy>

        {/* 4 · Mis avisos */}
        <CardHoy
          icono={<Bell size={18} weight="duotone" className="text-primary" />}
          titulo={`Mis avisos · ${misAvisos.length}`}
          resumen="últimos 30 días"
        >
          {avisosError ? (
            <p className="px-4 py-6 text-sm text-red-700">
              No se pudieron cargar tus avisos ({avisosError}).{' '}
              <button className="underline font-semibold" onClick={() => void cargarAvisos()}>Reintentar</button>
            </p>
          ) : !avisosCargados ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Cargando…</p>
          ) : misAvisos.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Todavía no mandaste ningún aviso.</p>
          ) : (
            <ul className="divide-y divide-border">
              {misAvisos.map(a => {
                const e = ESTADO_AVISO[a.estado]
                return (
                  <li key={a.id} className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${e.clase}`}>
                      {e.icono}{e.texto}
                    </span>
                    <span className="font-semibold">{a.ref}</span>
                    {a.cntr && <span className="font-mono text-xs">{a.cntr}</span>}
                    <span>{PARTNER_AVISO_LABEL[a.tipo]}</span>
                    <span className="text-xs text-muted-foreground">
                      {fechaCorta(a.dato?.fecha || a.createdAt)}
                      {a.resolvedAt && a.resolvedBy && ` · ${a.estado === 'confirmado' ? 'confirmó' : 'rechazó'} ${a.resolvedBy} el ${fechaCorta(a.resolvedAt)}`}
                    </span>
                    {a.estado === 'rechazado' && a.motivoRechazo && (
                      <span className="basis-full text-xs text-red-700">Motivo: {a.motivoRechazo}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </CardHoy>

        <AgendaCalendar shipments={shipments} transportFilter={transportName} partnerView={true} />
      </div>
    </PartnerDashboardShell>
  )
}
