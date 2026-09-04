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
import { useMemo, useState, type ReactNode } from 'react'
import { Anchor, Boat, Camera, CheckCircle, EnvelopeSimple, Timer, Warehouse, Warning } from '@phosphor-icons/react'
import type { ParsedShipment, ShipmentAlert } from '@/lib/shipmentTypes'
import type { OperativeReport, OriginPhoto } from '@/lib/quotationTypes'
import {
  hoyCliente, alertasCliente, textoDias, RUTA_CHIP, TIPO_LABEL,
  type EstadoLlegadaDestino, type Ruta, type Tipo, novedadesCliente,
} from '@/lib/hoyCliente'
import { galeriaDeNovedad, indiceEnGaleria, tiraDeMiniaturas, type FuenteNovedad } from '@/lib/cargaCliente'
import { fmtDateDMY } from '@/lib/format'
import { useBrand } from '@/lib/brand'
import PanelCard, { RefsCarga, clasesTono, type TonoPanel } from './partner/PanelCard'
import TiraMiniaturas from './client/TiraMiniaturas'
import TarjetaInforme from './client/TarjetaInforme'
import VisorFotos from './VisorFotos'

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
  /** Nombre del cliente que está mirando: se usa para descartar la ref propia
   *  mal cargada (la que dice el nombre del cliente) — spec 04/09, D2. */
  nombreCliente?: string
  /** Fotos subidas (origen / Uruguay) e informes operativos del cliente.
   *  ENTERAS: las miniaturas vienen firmadas del server (`thumbnailUrl`) y
   *  antes se descartaban acá —el tipo solo pedía ref/tipo/fecha—, así que la
   *  card podía contar las fotos pero no mostrarlas. */
  fotos?: OriginPhoto[]
  informes?: OperativeReport[]
  /** Lleva a la carga en la lista de abajo (pestaña Mis cargas). */
  onVerCarga: (ref: string) => void
  /** Abre la FICHA de la carga (modal del cliente), en la pestaña que se pida.
   *  Es el destino de las filas de novedades: antes iban a la lista completa,
   *  que es lo que Brian llamó "rarísimo" (04/09). */
  onAbrirFicha?: (ref: string, pestana?: PestanaFicha) => void
  /** Una miniatura no cargó: la firma dura 8 h y probablemente venció. El
   *  portal vuelve a pedir las URLs (lib/firmasFotos). */
  onFirmasVencidas?: () => void
  onVerAlertas: () => void
}

/** Las pestañas de la ficha del cliente (ClientShipmentDialog). */
export type PestanaFicha = 'resumen' | 'fotos' | 'informes'

type Tono = 'info' | 'aviso' | 'error'
const MAX_FILAS = 6

function CardHoy({ tono, icon, titulo, subtitulo, count, children, onVerMas }: {
  med: boolean
  tono: Tono
  icon: ReactNode
  titulo: string
  subtitulo: string
  count: number
  children: ReactNode
  onVerMas?: () => void
}) {
  // Misma piel que depósito y transporte (partner/PanelCard): color por card,
  // título grande y contador en pill — Brian 02/09.
  return (
    <PanelCard
      tono={tono === 'error' ? 'alerta' : tono}
      icono={icon}
      titulo={titulo}
      subtitulo={subtitulo}
      contador={count}
    >
      {children}
      {count > MAX_FILAS && (
        <button type="button" onClick={onVerMas} className="w-full px-4 py-2.5 text-left text-sm underline underline-offset-2 text-muted-foreground hover:text-foreground">
          y {count - MAX_FILAS} más en la lista de abajo
        </button>
      )}
    </PanelCard>
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

/**
 * Una fila de "Novedades": arriba el aviso, abajo LO QUE SE VINO A VER (las
 * miniaturas, o el documento). No es un solo botón como las otras filas:
 * adentro hay botones —cada miniatura, "Abrir" del informe— y un botón dentro
 * de otro botón no es HTML válido.
 *
 * La barra de color a la izquierda es el "golpe de color" que pidió Brian:
 * sale del tono de la card (piel común), no de un hex suelto.
 */
function FilaNovedad({ med, tono, cabecera, children }: {
  med: boolean
  tono: TonoPanel
  cabecera: ReactNode
  children?: ReactNode
}) {
  const t = clasesTono(tono, med)
  return (
    <div className={`rounded-lg border flex items-stretch overflow-hidden ${med ? 'border-med-info-borde bg-white' : 'border-border/60 bg-background/50'}`}>
      <span aria-hidden className={`w-1.5 shrink-0 ${t.barra}`} />
      <div className="min-w-0 flex-1 px-2.5 py-2">
        {cabecera}
        {children && <div className="mt-2">{children}</div>}
      </div>
    </div>
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

export default function HoyCliente({ shipments, alerts, hoyISO, nombreCliente = '', mostrarRuta, mostrarTipo, fotos = [], informes = [], onVerCarga, onAbrirFicha, onFirmasVencidas, onVerAlertas }: HoyClienteProps) {
  const brand = useBrand()
  const med = brand.id === 'med'
  // El visor de fotos: se abre DESDE la miniatura del aviso, sin pasar por la
  // lista ni por la ficha (spec 04/09, D3). Recorre EXACTAMENTE lo que anunció
  // la fila —esa carga, ese lugar, esa ventana—, arrancando en la foto que se
  // tocó. Antes abría la galería de toda la carga: la fila decía "6 fotos en
  // depósito GODILCO", el botón "Ver las otras 2 fotos de 6…", y el visor
  // abría en "1 / 8" con dos fotos de origen de hace tres semanas al final.
  // Por eso guarda la FUENTE de la fila y no una ref suelta: con la ref no
  // alcanza para volver a armar la misma lista cuando llegan firmas nuevas.
  const [visor, setVisor] = useState<{ fuente: FuenteNovedad; indice: number } | null>(null)
  const galeriaVisor = useMemo(
    () => (visor ? galeriaDeNovedad(fotos, visor.fuente) : []),
    [visor, fotos],
  )
  const abrirVisor = (fuente: FuenteNovedad, galeria: OriginPhoto[], foto: OriginPhoto) => {
    setVisor({ fuente, indice: indiceEnGaleria(galeria, foto.id) })
  }
  // La fila lleva a la FICHA (si el portal la ofrece); si no, a la lista.
  const irACarga = (ref: string, pestana: PestanaFicha) =>
    (onAbrirFicha ? onAbrirFicha(ref, pestana) : onVerCarga(ref))
  const hoy = useMemo(() => hoyCliente(shipments, hoyISO, nombreCliente), [shipments, hoyISO, nombreCliente])
  const atencion = useMemo(() => alertasCliente(alerts, shipments, nombreCliente), [alerts, shipments, nombreCliente])
  // Fotos e informes subidos esta semana: es lo que el cliente pregunta por
  // teléfono ("¿ya cargaron?", "¿hay fotos?") — Brian 03/09.
  const novedades = useMemo(
    () => novedadesCliente(shipments, fotos, informes, hoyISO, undefined, nombreCliente),
    [shipments, fotos, informes, hoyISO, nombreCliente],
  )
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
              <RefsCarga refs={f.refs} />
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

      {novedades.length > 0 && (
        <CardHoy
          med={med} tono="info" icon={<Camera size={18} weight="fill" />}
          titulo="Novedades de tus cargas"
          subtitulo="Fotos e informes que subimos esta semana. Tocá una foto para verla en grande."
          count={novedades.length}
          onVerMas={() => onVerCarga(novedades[MAX_FILAS].ref)}
        >
          {novedades.slice(0, MAX_FILAS).map(n => {
            // Las fotos de ESTA fila: las que la fila contó para armar su
            // texto (esa carga, ese lugar, esa ventana). No se vuelven a
            // elegir acá; si no, el texto dice "1 foto" y la tira dibuja 4.
            const galeria = n.lugarFoto ? galeriaDeNovedad(fotos, n) : []
            const tira = n.lugarFoto ? tiraDeMiniaturas(galeria) : null
            const informe = n.informeId ? informes.find(r => r.id === n.informeId) : undefined
            const texto = n.clase === 'fotos'
              ? `${n.cantidad} foto${n.cantidad === 1 ? '' : 's'} ${n.lugar}`
              : n.lugar
            return (
              <FilaNovedad
                key={`${n.ref}|${n.clase}|${n.lugar}`}
                med={med}
                tono="info"
                cabecera={(
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <button
                      type="button"
                      onClick={() => irACarga(n.ref, n.clase === 'informe' ? 'informes' : 'fotos')}
                      title="Ver la ficha de esta carga"
                      className={`min-w-0 text-left rounded flex flex-wrap items-center gap-x-2.5 gap-y-1 -mx-1 px-1 py-0.5 transition-colors ${med ? 'hover:bg-med-pastel/40' : 'hover:bg-muted/40'}`}
                    >
                      <RefsCarga refs={n.refs} />
                      <Marcas ruta={n.ruta} tipo={n.tipo} {...marcasMixtas} />
                      <span className="text-sm">{texto}</span>
                    </button>
                    {n.cargandoAhora && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                        CARGANDO AHORA
                      </span>
                    )}
                    <Derecha
                      label={n.clase === 'fotos' ? 'Fotos' : 'Informe'}
                      valor={fmtDateDMY(n.fecha)}
                      detalle={n.dias === 0 ? 'hoy' : n.dias === 1 ? 'ayer' : `hace ${n.dias}d`}
                    />
                  </div>
                )}
              >
                {tira && (
                  <TiraMiniaturas
                    visibles={tira.visibles}
                    mas={tira.mas}
                    siguiente={tira.siguiente}
                    etiqueta={texto}
                    onAbrir={f => abrirVisor(n, galeria, f)}
                    onRota={onFirmasVencidas}
                  />
                )}
                {/* El informe, como tarjeta de documento: ícono grande, título,
                    fecha y "Abrir". SIN miniatura de la primera página —eso
                    necesita servidor y Vercel está en 12/12 funciones—, así que
                    tampoco se promete. */}
                {informe && <TarjetaInforme informe={informe} compacta />}
              </FilaNovedad>
            )
          })}
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
              <RefsCarga refs={f.refs} />
              <Marcas ruta={f.ruta} tipo={f.tipo} {...(esperandoEnPuerto ? marcasSoloTipo : marcasMixtas)} />
              <Desc texto={f.descripcion} />
              <Cntr cntr={f.cntr} />
              <span
                title={f.retirado ? `Retirada de la terminal el ${fmtDateDMY(f.retirado)}` : undefined}
                className={f.retirado
                  ? 'text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800'
                  : 'text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800'}
              >
                En {f.lugar}{f.retirado ? ` desde ${fmtDateDMY(f.retirado)}` : ''}
              </span>
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
              <RefsCarga refs={f.refs} />
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
              <RefsCarga refs={f.refs} />
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
              <RefsCarga refs={a.refs} />
              <span className="text-sm font-semibold">{a.titulo}</span>
              <span className="text-xs text-muted-foreground truncate max-w-[420px]" title={a.detalle}>{a.detalle}</span>
            </Fila>
          ))}
        </CardHoy>
      )}

      {/* El visor: pantalla completa, con las flechas para recorrer TODAS las
          fotos de esa carga. Se abre desde una miniatura del aviso. */}
      {visor && galeriaVisor.length > 0 && (
        <VisorFotos
          fotos={galeriaVisor}
          indice={visor.indice}
          onIndice={i => setVisor(v => (v ? { ...v, indice: i } : v))}
          onCerrar={() => setVisor(null)}
        />
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
