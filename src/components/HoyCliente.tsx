/**
 * HOY del cliente — las cards de arriba de "Mis Cargas".
 *
 * Misma lógica que HOY depósito/transporte: cards en el orden de las preguntas
 * que se hace el cliente, contador en el título, filas cortas que entran en un
 * celular, card vacía = no se muestra. Toda la lógica vive en lib/hoyCliente.ts
 * (pura, testeada); acá solo se pinta.
 *
 * Orden (spec aprobada por Brian 02/09): Llegan a destino → En Montevideo,
 * esperando salida → Llegan a Montevideo → Embarcadas → Atención (solo si hay).
 * Los selectores de ruta/tipo viven en el portal (filtran cards Y lista); acá
 * solo se marcan ruta y tipo en la fila cuando el cliente ve mezcla.
 *
 * Spec: docs/superpowers/specs/2026-09-02-portal-cliente-hoy-design.md
 */
import { useMemo, type ReactNode, type CSSProperties } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Anchor, Boat, CheckCircle, EnvelopeSimple, Timer, Warehouse, Warning } from '@phosphor-icons/react'
import type { ParsedShipment, ShipmentAlert } from '@/lib/shipmentTypes'
import {
  hoyCliente, alertasCliente, textoDias, RUTA_CHIP, TIPO_LABEL,
  type RefsCliente, type EstadoLlegadaDestino, type Ruta, type Tipo,
} from '@/lib/hoyCliente'
import { fmtDateDMY } from '@/lib/format'
import { useBrand } from '@/lib/brand'

interface HoyClienteProps {
  /** Cargas activas del cliente, YA filtradas por ruta/tipo (sin el buscador de la lista). */
  shipments: ParsedShipment[]
  /** Alertas visibles (no descartadas); acá se filtran a critical/warning y se traducen. */
  alerts: ShipmentAlert[]
  /** Hoy en ISO local (YYYY-MM-DD). */
  hoyISO: string
  /** El cliente tiene cargas de más de una ruta y está viendo todas: marcar la ruta en la fila. */
  mostrarRuta?: boolean
  /** Ídem tipo (FCL / LCL). */
  mostrarTipo?: boolean
  /** Abre la carga en la lista (pestaña Mis cargas, fila desplegada). */
  onVerCarga: (ref: string) => void
  onVerAlertas: () => void
}

type Tono = 'info' | 'aviso' | 'error'
const MAX_FILAS = 6

function CardHoy({ med, tono, icon, titulo, subtitulo, count, children, onVerMas }: {
  med: boolean
  tono: Tono
  icon: ReactNode
  titulo: string
  subtitulo: string
  count: number
  children: ReactNode
  onVerMas?: () => void
}) {
  const card = tono === 'error'
    ? (med ? 'overflow-hidden bg-med-error/[0.06] border-2 border-med-error/40' : 'accent-top overflow-hidden bg-red-500/[0.04] border-red-500/25')
    : tono === 'aviso'
      ? (med ? 'overflow-hidden bg-med-aviso-tinte border-2 border-med-aviso-borde' : 'accent-top overflow-hidden bg-amber-500/[0.04] border-amber-500/25')
      : (med ? 'overflow-hidden bg-med-info-tinte border-2 border-med-info-borde' : 'accent-top overflow-hidden bg-sky-500/[0.04] border-sky-500/25')
  const bar = tono === 'error' ? 'rgb(239 68 68)' : tono === 'aviso' ? 'rgb(245 158 11)' : 'rgb(14 165 233)'
  const iconBox = tono === 'error'
    ? (med ? 'p-1.5 bg-med-error/10 rounded-md text-med-error' : 'p-1.5 bg-red-500/10 rounded-md text-red-600')
    : tono === 'aviso'
      ? (med ? 'p-1.5 bg-med-aviso/10 rounded-md text-med-aviso' : 'p-1.5 bg-amber-500/10 rounded-md text-amber-600')
      : (med ? 'p-1.5 bg-med-violeta/10 rounded-md text-med-violeta' : 'p-1.5 bg-sky-500/10 rounded-md text-sky-600')
  const title = tono === 'error'
    ? (med ? 'titulo-med text-[17px] text-med-error' : 'text-sm font-semibold uppercase tracking-wide text-red-700')
    : tono === 'aviso'
      ? (med ? 'titulo-med text-[17px] text-med-aviso-texto' : 'text-sm font-semibold uppercase tracking-wide text-amber-700')
      : (med ? 'titulo-med text-[17px] text-med-violeta' : 'text-sm font-semibold uppercase tracking-wide text-sky-700')
  const badge = tono === 'error'
    ? (med ? 'bg-med-error text-white' : 'bg-red-500 text-white')
    : tono === 'aviso'
      ? (med ? 'bg-med-aviso text-white' : 'bg-amber-500 text-white')
      : (med ? 'bg-med-violeta text-med-celeste' : 'bg-sky-500 text-white')
  return (
    <Card className={card} style={{ ['--bar-color' as string]: bar } as CSSProperties}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2.5 mb-1">
          <div className={iconBox}>{icon}</div>
          <h2 className={title}>{titulo}</h2>
          <span className={`ml-auto inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full text-xs font-bold ${badge}`}>{count}</span>
        </div>
        <p className="text-xs text-muted-foreground mb-2.5">{subtitulo}</p>
        <div className="space-y-1">{children}</div>
        {count > MAX_FILAS && (
          <button type="button" onClick={onVerMas} className="mt-2 text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground">
            y {count - MAX_FILAS} más en la lista de abajo
          </button>
        )}
      </CardContent>
    </Card>
  )
}

/** Una fila clickeable; `extra` va afuera del botón (un link no puede vivir
 *  adentro de un button). */
function Fila({ med, onClick, children, extra }: { med: boolean; onClick: () => void; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className={`rounded-lg border flex items-stretch ${med ? 'border-med-info-borde bg-white' : 'border-border/60 bg-background/50'}`}>
      <button
        type="button"
        onClick={onClick}
        className={`flex-1 min-w-0 text-left px-2.5 py-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg transition-colors ${med ? 'hover:bg-med-pastel/40' : 'hover:bg-muted/40'}`}
      >
        {children}
      </button>
      {extra && <div className="flex items-center pr-2.5 shrink-0">{extra}</div>}
    </div>
  )
}

function Refs({ med, refs }: { med: boolean; refs: RefsCliente }) {
  return (
    <>
      <span className={med ? 'ref-med text-sm' : 'font-bold text-sm'}>{refs.principal}</span>
      {refs.secundaria && <span className="text-[11px] text-muted-foreground" title="Nuestra referencia">{refs.secundaria}</span>}
    </>
  )
}

/** Marcas de ruta y tipo: solo cuando el cliente ve mezcla (props del portal). */
function Marcas({ ruta, tipo, mostrarRuta, mostrarTipo }: { ruta: Ruta; tipo: Tipo; mostrarRuta?: boolean; mostrarTipo?: boolean }) {
  if (!mostrarRuta && !mostrarTipo) return null
  return (
    <>
      {mostrarTipo && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-border text-muted-foreground">{TIPO_LABEL[tipo]}</span>}
      {mostrarRuta && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{RUTA_CHIP[ruta]}</span>}
    </>
  )
}

const Desc = ({ texto }: { texto: string }) =>
  texto ? <span className="text-xs text-muted-foreground truncate max-w-[180px]" title={texto}>{texto}</span> : null

const Cntr = ({ cntr, camion }: { cntr: string; camion?: string }) =>
  cntr
    ? <span className="font-mono text-[11px] text-muted-foreground">{cntr}</span>
    : camion
      ? <span className="font-mono text-[11px] text-muted-foreground">Camión {camion}</span>
      : null

function ChipEstadoDestino({ med, estado, salida }: { med: boolean; estado: EstadoLlegadaDestino; salida: string }) {
  if (estado === 'en_frontera') {
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">EN CAMINO</span>
  }
  if (estado === 'sale_hoy') {
    return <span className={med ? 'text-[10px] font-bold px-1.5 py-0.5 rounded bg-med-violeta text-white' : 'text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-600 text-white'}>SALE HOY</span>
  }
  if (estado === 'llega') {
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">LLEGA AL PUERTO</span>
  }
  return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">Sale el {fmtDateDMY(salida)}</span>
}

const Derecha = ({ label, valor, detalle }: { label: string; valor: string; detalle?: string }) => (
  <span className="ml-auto text-right whitespace-nowrap">
    <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
    <span className="block text-sm font-bold tabular-nums">{valor}{detalle ? <span className="font-normal text-muted-foreground"> · {detalle}</span> : null}</span>
  </span>
)

export default function HoyCliente({ shipments, alerts, hoyISO, mostrarRuta, mostrarTipo, onVerCarga, onVerAlertas }: HoyClienteProps) {
  const brand = useBrand()
  const med = brand.id === 'med'
  const hoy = useMemo(() => hoyCliente(shipments, hoyISO), [shipments, hoyISO])
  const atencion = useMemo(() => alertasCliente(alerts, shipments), [alerts, shipments])
  const nada = hoy.destino.length === 0 && hoy.esperando.length === 0 && hoy.montevideo.length === 0 && hoy.embarques.length === 0
  const mailSalida = (refPrincipal: string) =>
    `mailto:${brand.contact.email}?subject=${encodeURIComponent(`Salida ${refPrincipal}`)}&body=${encodeURIComponent(`Hola, quiero coordinar la salida de la carga ${refPrincipal}. La necesito para el día: `)}`
  // Ruta solo donde se mezclan rutas (destino y embarcadas); en las cards que
  // son solo Montevideo la marca "vía Montevideo" es ruido (revisión 02/09).
  const marcasMixtas = { mostrarRuta, mostrarTipo }
  const marcasSoloTipo = { mostrarRuta: false, mostrarTipo }
  const esperandoEnPuerto = hoy.esperando.length > 0 && hoy.esperando.every(f => f.enPuerto)

  return (
    <div className="space-y-4 mb-8">
      {hoy.destino.length > 0 && (
        <CardHoy
          med={med} tono="info" icon={<Warehouse size={18} weight="fill" />}
          titulo="Llegan a destino"
          subtitulo="Lo que llega a tu depósito fiscal, o al puerto de destino, en los próximos días."
          count={hoy.destino.length}
          onVerMas={() => onVerCarga(hoy.destino[MAX_FILAS].ref)}
        >
          {hoy.destino.slice(0, MAX_FILAS).map(f => (
            <Fila key={`${f.ref}|${f.cntr}|${f.camion}`} med={med} onClick={() => onVerCarga(f.ref)}>
              <Refs med={med} refs={f.refs} />
              <Marcas ruta={f.ruta} tipo={f.tipo} {...marcasMixtas} />
              <Desc texto={f.descripcion} />
              <Cntr cntr={f.cntr} camion={f.camion} />
              <ChipEstadoDestino med={med} estado={f.estado} salida={f.salida} />
              {f.fiscal && <span className="text-[11px] text-muted-foreground">→ {f.fiscal}</span>}
              {f.fecha
                ? <Derecha label={f.estado === 'llega' ? 'Llega a destino' : 'Llega'} valor={fmtDateDMY(f.fecha)} detalle={textoDias(f.dias)} />
                : <Derecha label="Llegada" valor="A confirmar" />}
            </Fila>
          ))}
        </CardHoy>
      )}

      {hoy.esperando.length > 0 && (
        <CardHoy
          med={med} tono="aviso" icon={<Timer size={18} weight="fill" />}
          titulo={esperandoEnPuerto ? 'En puerto, esperando salida' : 'En Montevideo, esperando salida'}
          subtitulo="Ya llegaron y todavía no tienen fecha de salida hacia destino. Desde cada fila podés pedirla por mail."
          count={hoy.esperando.length}
          onVerMas={() => onVerCarga(hoy.esperando[MAX_FILAS].ref)}
        >
          {hoy.esperando.slice(0, MAX_FILAS).map(f => (
            <Fila
              key={`${f.ref}|${f.cntr}`} med={med} onClick={() => onVerCarga(f.ref)}
              extra={(
                <a
                  href={mailSalida(f.refs.principal)}
                  title="Pedir la salida por mail"
                  className={med ? 'inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-med-violeta/40 text-[11px] font-semibold text-med-violeta hover:bg-med-violeta/10' : 'inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-amber-500/50 text-[11px] font-semibold text-amber-700 hover:bg-amber-500/10'}
                >
                  <EnvelopeSimple size={13} weight="fill" /> Pedir salida
                </a>
              )}
            >
              <Refs med={med} refs={f.refs} />
              <Marcas ruta={f.ruta} tipo={f.tipo} {...(esperandoEnPuerto ? marcasSoloTipo : marcasMixtas)} />
              <Desc texto={f.descripcion} />
              <Cntr cntr={f.cntr} />
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">En {f.lugar}</span>
              <Derecha label="Llegó" valor={fmtDateDMY(f.desde)} detalle={`hace ${f.dias}d`} />
            </Fila>
          ))}
        </CardHoy>
      )}

      {hoy.montevideo.length > 0 && (
        <CardHoy
          med={med} tono="info" icon={<Anchor size={18} weight="fill" />}
          titulo="Llegan a Montevideo"
          subtitulo="Buques que arriban en las próximas dos semanas y qué pasa con tu carga al llegar."
          count={hoy.montevideo.length}
          onVerMas={() => onVerCarga(hoy.montevideo[MAX_FILAS].ref)}
        >
          {hoy.montevideo.slice(0, MAX_FILAS).map(f => (
            <Fila key={f.ref} med={med} onClick={() => onVerCarga(f.ref)}>
              <Refs med={med} refs={f.refs} />
              <Marcas ruta={f.ruta} tipo={f.tipo} {...marcasSoloTipo} />
              <Desc texto={f.descripcion} />
              {f.buque && <span className="text-[11px] text-muted-foreground truncate max-w-[160px]">{f.buque}</span>}
              {f.cntrs > 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{f.cntrs} CNTR</span>}
              {f.pasoSiguiente && <span className="text-[11px] text-muted-foreground">→ {f.pasoSiguiente}</span>}
              <Derecha label="Llega a Montevideo" valor={fmtDateDMY(f.eta)} detalle={textoDias(f.dias)} />
            </Fila>
          ))}
        </CardHoy>
      )}

      {hoy.embarques.length > 0 && (
        <CardHoy
          med={med} tono="info" icon={<Boat size={18} weight="fill" />}
          titulo="Embarcadas"
          subtitulo="Zarparon en la última semana o zarpan en la próxima."
          count={hoy.embarques.length}
          onVerMas={() => onVerCarga(hoy.embarques[MAX_FILAS].ref)}
        >
          {hoy.embarques.slice(0, MAX_FILAS).map(f => (
            <Fila key={f.ref} med={med} onClick={() => onVerCarga(f.ref)}>
              <Refs med={med} refs={f.refs} />
              <Marcas ruta={f.ruta} tipo={f.tipo} {...marcasMixtas} />
              <Desc texto={f.descripcion} />
              {f.buque && <span className="text-[11px] text-muted-foreground truncate max-w-[160px]">{f.buque}</span>}
              {f.eta && <span className="text-[11px] text-muted-foreground">{f.ruta === 'UY' ? 'Llega a Montevideo' : 'Llega a destino'} {fmtDateDMY(f.eta)}</span>}
              <Derecha label={f.zarpo ? 'Zarpó' : 'Zarpa'} valor={fmtDateDMY(f.etd)} detalle={textoDias(f.dias)} />
            </Fila>
          ))}
        </CardHoy>
      )}

      {atencion.length > 0 && (
        <CardHoy
          med={med} tono="error" icon={<Warning size={18} weight="fill" />}
          titulo="Atención"
          subtitulo="Avisos sobre tus cargas que conviene mirar hoy."
          count={atencion.length}
          onVerMas={onVerAlertas}
        >
          {atencion.slice(0, MAX_FILAS).map(a => (
            <Fila key={a.id} med={med} onClick={() => onVerCarga(a.ref)}>
              <Refs med={med} refs={a.refs} />
              <span className="text-sm font-semibold">{a.titulo}</span>
              <span className="text-xs text-muted-foreground truncate max-w-[420px]" title={a.detalle}>{a.detalle}</span>
            </Fila>
          ))}
        </CardHoy>
      )}

      {nada && atencion.length === 0 && shipments.length > 0 && (
        <div className={med ? 'flex items-center gap-2.5 rounded-lg border border-med-ok/25 bg-med-ok-suave px-4 py-2.5' : 'flex items-center gap-2.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.05] px-4 py-2.5'}>
          <CheckCircle size={18} weight="fill" className={med ? 'text-med-ok shrink-0' : 'text-emerald-600 shrink-0'} />
          <p className={med ? 'text-sm text-med-ok' : 'text-sm text-emerald-700'}>Sin movimientos en los próximos días.</p>
        </div>
      )}
    </div>
  )
}
