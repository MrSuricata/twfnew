/**
 * La ficha de UNA carga, como la ve el cliente (spec 04/09, D5).
 *
 * Brian, sobre el modal viejo: "este modal también horrible, revisar todo".
 * Era `ShipmentDetailsDialog` con `clientView`: cuatro pestañas, dos
 * vocabularios de estado, "0 contenedor(es)", "Libre Hasta" a la vista y una
 * línea de tiempo con el primer hito `reached: true` fijo — decía "En
 * Tránsito ✓" en cargas que todavía no habían zarpado.
 *
 * Este modal es PROPIO y no toca aquel: `ShipmentDetailsDialog` lo comparten
 * la Agenda, el Tracking y HOY del admin, y romperlo son tres pantallas del
 * equipo caídas.
 *
 * Tres pestañas, la piel común (`partner/PanelCard`):
 *  · Resumen  — línea de tiempo derivada de `estadoCliente`, datos y
 *               contenedores contados de la lista real.
 *  · Fotos    — galería por lugar (origen / Montevideo) y día.
 *  · Informes — tarjeta de documento con botón "Abrir". SIN miniatura del
 *               PDF: renderizarla necesita servidor y Vercel está en 12/12
 *               funciones. Se dice así, no se promete.
 *
 * Sin "Libre": es dato nuestro. Las referencias, con la regla única de D2.
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { Boat, Camera, CheckCircle, Circle, FilePdf, Package } from '@phosphor-icons/react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import PanelCard, { Chip, Dato, PanelFila, FilaTitulo, FilaDatos } from '@/components/partner/PanelCard'
import type { TonoPanel } from '@/components/partner/PanelCard'
import OriginPhotoGallery from '@/components/OriginPhotoGallery'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import type { OperativeReport, OriginPhoto } from '@/lib/quotationTypes'
import { fetchReportFile } from '@/lib/dataClient'
import { refsCliente } from '@/lib/refsCliente'
import { estadoCliente, etiquetaEstado } from '@/lib/hoyCliente'
import {
  lineaTiempoCliente, datosFicha, contenedoresDeCarga, agruparFotosPorLugar,
  informesDeCarga, textoContenedores, fechaDeSubida, type PasoLinea,
} from '@/lib/cargaCliente'
import type { EstadoCliente } from '@/lib/hoyCliente'

/** El color de la card sigue al estado: gris antes de zarpar, celeste en
 *  viaje, verde cuando llegó. Mismos tonos que el resto del portal. */
const TONO_ESTADO: Record<EstadoCliente, TonoPanel> = {
  por_embarcar: 'neutro',
  embarcada: 'info',
  en_montevideo: 'info',
  en_camino: 'info',
  en_deposito: 'ok',
  entregada: 'ok',
}

// ── Pestaña Resumen ───────────────────────────────────────────────────────

/** La línea de tiempo. Cada paso sale de `estadoCliente`: lo alcanzado está
 *  alcanzado de verdad, no por estar primero en la lista. */
export function LineaTiempo({ pasos }: { pasos: PasoLinea[] }) {
  return (
    <ol className="relative">
      {pasos.map((p, i) => (
        <li key={p.estado} className="flex items-start gap-3 pb-4 last:pb-0 relative">
          {i < pasos.length - 1 && (
            <span
              aria-hidden
              className={`absolute left-[11px] top-6 bottom-0 w-0.5 ${pasos[i + 1].alcanzado ? 'bg-emerald-500' : 'bg-border'}`}
            />
          )}
          <span className="shrink-0 mt-0.5">
            {p.alcanzado
              ? <CheckCircle size={24} weight="fill" className={p.actual ? 'text-emerald-600' : 'text-emerald-500/70'} />
              : <Circle size={24} weight="bold" className="text-muted-foreground/40" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block text-sm ${p.actual ? 'font-bold text-foreground' : p.alcanzado ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
              {p.label}
              {p.actual && <span className="ml-2 text-[11px] font-bold uppercase tracking-wide text-emerald-700">Ahora</span>}
            </span>
            <span className="block text-xs text-muted-foreground tabular-nums">
              {[p.fecha, p.detalle].filter(Boolean).join(' · ') || '—'}
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}

function Resumen({ shipment, hoyISO }: { shipment: ParsedShipment; hoyISO: string }) {
  const pasos = lineaTiempoCliente(shipment, hoyISO)
  const datos = datosFicha(shipment)
  const contenedores = contenedoresDeCarga(shipment, hoyISO)
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Dónde está tu carga</h3>
        <LineaTiempo pasos={pasos} />
      </section>

      <section>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Datos de la carga</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {datos.map(d => (
            <span key={d.label} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5">
              <Dato label={d.label} fuerte>{d.valor}</Dato>
            </span>
          ))}
        </div>
      </section>

      {contenedores.length > 0 && (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
            {textoContenedores(shipment)}
          </h3>
          <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
            {contenedores.map((c, i) => (
              <PanelFila key={`${c.numero}-${i}`}>
                <FilaTitulo>
                  <span className="font-mono text-sm font-bold">{c.numero}</span>
                  {c.tipo && <Chip>{c.tipo}</Chip>}
                  <Chip clase={`${c.claseEstado} border-transparent`}>{c.etiqueta}</Chip>
                </FilaTitulo>
                <FilaDatos>
                  <Dato label="Sale de Montevideo" fuerte>{c.salida || 'A coordinar'}</Dato>
                  <Dato label="Llega a destino" fuerte>{c.llegada || 'A confirmar'}</Dato>
                </FilaDatos>
              </PanelFila>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ── Pestaña Fotos ─────────────────────────────────────────────────────────

function Fotos({ fotos, ref_ }: { fotos: OriginPhoto[]; ref_: string }) {
  const grupos = agruparFotosPorLugar(fotos, ref_)
  if (grupos.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Camera size={44} weight="thin" className="mx-auto mb-3 opacity-50" />
        <p className="text-sm font-medium">Todavía no hay fotos de esta carga</p>
        <p className="text-xs mt-1">Cuando saquemos fotos en origen o en Montevideo, aparecen acá.</p>
      </div>
    )
  }
  return (
    <div className="space-y-6">
      {grupos.map(g => (
        <section key={g.clave}>
          <h3 className="flex items-center gap-2 text-sm font-bold mb-2">
            <Camera size={16} weight="fill" className="text-muted-foreground" />
            {g.titulo}
            {g.fecha && <span className="text-xs font-normal text-muted-foreground tabular-nums">· {g.fecha}</span>}
            <span className="text-xs font-normal text-muted-foreground">
              · {g.fotos.length} foto{g.fotos.length === 1 ? '' : 's'}
            </span>
          </h3>
          <OriginPhotoGallery photos={g.fotos} isAdmin={false} />
        </section>
      ))}
    </div>
  )
}

// ── Pestaña Informes ──────────────────────────────────────────────────────

/** El base64 que devuelve el server, como archivo que el navegador puede
 *  abrir en una pestaña. Un `data:` URL directo lo bloquean los navegadores. */
function urlDeArchivo(dataUrl: string): string {
  if (/^https?:/i.test(dataUrl)) return dataUrl
  const [cabecera, base64] = dataUrl.split(',')
  const tipo = /:(.*?);/.exec(cabecera)?.[1] || 'application/pdf'
  const bin = atob(base64 || '')
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: tipo }))
}

function Informes({ informes, ref_ }: { informes: OperativeReport[]; ref_: string }) {
  const [abriendo, setAbriendo] = useState<string | null>(null)
  const lista = informesDeCarga(informes, ref_)

  const abrir = async (r: OperativeReport) => {
    setAbriendo(r.id)
    try {
      const data = r.fileData || await fetchReportFile(r.id)
      if (!data) { toast.error('No pudimos traer el informe. Probá de nuevo en un rato.'); return }
      const url = urlDeArchivo(data)
      // OJO con 'noopener' en el tercer argumento: por spec hace que
      // window.open devuelva null SIEMPRE, haya abierto la pestaña o no. Con
      // eso, el fallback se disparaba siempre y el cliente se llevaba la
      // pestaña Y una descarga en cada click. La protección va por rel.
      const ventana = window.open(url, '_blank')
      if (ventana) {
        ventana.opener = null
      } else {
        // Bloqueador de pop-ups: se descarga, que es lo que el cliente
        // quería igual.
        const a = document.createElement('a')
        a.href = url
        a.download = r.fileName || 'informe.pdf'
        a.rel = 'noopener'
        a.click()
      }
      if (!/^https?:/i.test(data)) setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      toast.error('No pudimos abrir el informe. Escribinos y te lo mandamos por mail.')
    } finally {
      setAbriendo(null)
    }
  }

  if (lista.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FilePdf size={44} weight="thin" className="mx-auto mb-3 opacity-50" />
        <p className="text-sm font-medium">Todavía no hay informes de esta carga</p>
        <p className="text-xs mt-1">Publicamos el informe operativo cuando se hace el trasiego o la desconsolidación.</p>
      </div>
    )
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {lista.map(r => (
        <article key={r.id} className="rounded-xl border-2 border-border bg-card p-4 flex items-start gap-3">
          {/* Ícono grande, no miniatura: renderizar la primera página del PDF
              necesita servidor (Vercel está en 12/12 funciones). */}
          <span className="shrink-0 rounded-lg bg-red-50 text-red-600 p-2.5">
            <FilePdf size={32} weight="fill" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold leading-tight break-words">{r.title || 'Informe operativo'}</h3>
            <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
              {fechaDeSubida(r.createdAt)}
              {r.containerNumber ? <span className="font-mono"> · {r.containerNumber}</span> : null}
            </p>
            <button
              type="button"
              onClick={() => void abrir(r)}
              disabled={abriendo === r.id}
              className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-accent text-accent-foreground text-xs font-bold hover:opacity-90 disabled:opacity-60"
            >
              <FilePdf size={14} weight="fill" />
              {abriendo === r.id ? 'Abriendo…' : 'Abrir'}
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}

// ── El modal ──────────────────────────────────────────────────────────────

export default function ClientShipmentDialog({
  shipment, open, onOpenChange, hoyISO, nombreCliente = '', fotos = [], informes = [],
}: {
  shipment: ParsedShipment
  open: boolean
  onOpenChange: (abierto: boolean) => void
  /** Hoy en ISO local: lo pasa el portal (lib/format), no se calcula acá. */
  hoyISO: string
  nombreCliente?: string
  fotos?: OriginPhoto[]
  informes?: OperativeReport[]
}) {
  const refs = refsCliente(shipment, nombreCliente)
  const estado = estadoCliente(shipment, hoyISO)
  const ref_ = String(shipment.REF || '')
  const cuantasFotos = agruparFotosPorLugar(fotos, ref_).reduce((t, g) => t + g.fotos.length, 0)
  const cuantosInformes = informesDeCarga(informes, ref_).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* La cáscara va transparente: la superficie visible es la PanelCard de
          adentro (piel común), que ya trae borde de color, radio y recorte. */}
      {/* `sm:max-w-3xl` y no solo `max-w-3xl`: la cáscara de shadcn trae
          `sm:max-w-lg`, que en pantalla grande le gana a la clase sin variante
          y dejaba la ficha en 512px con los datos apretados. */}
      <DialogContent className="max-w-3xl sm:max-w-3xl w-[calc(100%-2rem)] max-h-[92vh] p-0 gap-0 border-0 bg-transparent shadow-none overflow-hidden">
        {/* Radix necesita su propio título/descripción para anunciar el
            diálogo; el encabezado a la vista lo pinta PanelCard. */}
        <DialogTitle className="sr-only">Carga {refs.principal}</DialogTitle>
        <DialogDescription className="sr-only">
          Dónde está la carga, sus datos, las fotos y los informes.
        </DialogDescription>

        <PanelCard
          tono={TONO_ESTADO[estado]}
          icono={<Package size={20} weight="fill" />}
          titulo={refs.principal}
          subtitulo={
            <span className="flex flex-wrap items-center gap-x-2">
              {refs.secundaria && <span className="tabular-nums">Nuestra referencia {refs.secundaria}</span>}
              {refs.secundaria && shipment.BUQUE && <span aria-hidden>·</span>}
              {shipment.BUQUE && <span>{shipment.BUQUE}</span>}
            </span>
          }
          extras={
            <>
              <Chip clase="bg-white/70 border-transparent text-foreground">{etiquetaEstado(shipment, estado)}</Chip>
              {/* Hueco para la X de cerrar del diálogo (top-4 right-4). */}
              <span aria-hidden className="w-4" />
            </>
          }
        >
          <Tabs defaultValue="resumen" className="gap-0">
            <TabsList className="tabs-list-underline px-2">
              <TabsTrigger value="resumen" className="tab-underline">
                <Boat size={18} className="mr-2" />
                Resumen
              </TabsTrigger>
              <TabsTrigger value="fotos" className="tab-underline">
                <Camera size={18} className="mr-2" />
                Fotos
                {cuantasFotos > 0 && (
                  <span className="ml-1.5 text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-accent text-accent-foreground tabular-nums">
                    {cuantasFotos}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="informes" className="tab-underline">
                <FilePdf size={18} className="mr-2" />
                Informes
                {cuantosInformes > 0 && (
                  <span className="ml-1.5 text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-accent text-accent-foreground tabular-nums">
                    {cuantosInformes}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
            <div className="max-h-[62vh] overflow-y-auto px-4 py-5 bg-card">
              <TabsContent value="resumen" className="mt-0">
                <Resumen shipment={shipment} hoyISO={hoyISO} />
              </TabsContent>
              <TabsContent value="fotos" className="mt-0">
                <Fotos fotos={fotos} ref_={ref_} />
              </TabsContent>
              <TabsContent value="informes" className="mt-0">
                <Informes informes={informes} ref_={ref_} />
              </TabsContent>
            </div>
          </Tabs>
        </PanelCard>
      </DialogContent>
    </Dialog>
  )
}
