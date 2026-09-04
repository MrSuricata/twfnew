/**
 * El informe operativo, como TARJETA DE DOCUMENTO (spec 04/09, D3).
 *
 * Ícono de PDF grande, título, fecha y un botón "Abrir". **Sin miniatura de
 * la primera página**: renderizar un PDF necesita servidor y Vercel está en
 * 12 de 12 funciones. Se dice así en el diseño y no se promete en la UI.
 *
 * Vivía adentro de la ficha del cliente (paso 3). Se saca acá porque el aviso
 * de HOY muestra el mismo documento, y el botón "Abrir" tiene una historia
 * que no conviene tener escrita dos veces (ver `urlDeArchivo` y el comentario
 * del `window.open`).
 *
 * Dos tamaños:
 *  · normal   — la grilla de la pestaña Informes.
 *  · compacta — adentro de la fila de "Novedades de tus cargas".
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { FilePdf } from '@phosphor-icons/react'
import { useBrand } from '@/lib/brand'
import { fetchReportFile } from '@/lib/dataClient'
import { fechaDeSubida } from '@/lib/cargaCliente'
import type { OperativeReport } from '@/lib/quotationTypes'

/** El base64 que devuelve el server, como archivo que el navegador puede
 *  abrir en una pestaña. Un `data:` URL directo lo bloquean los navegadores. */
export function urlDeArchivo(dataUrl: string): string {
  if (/^https?:/i.test(dataUrl)) return dataUrl
  const [cabecera, base64] = dataUrl.split(',')
  const tipo = /:(.*?);/.exec(cabecera)?.[1] || 'application/pdf'
  const bin = atob(base64 || '')
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: tipo }))
}

export default function TarjetaInforme({ informe, compacta }: {
  informe: OperativeReport
  /** Adentro de una fila de HOY: mismo documento, menos alto. */
  compacta?: boolean
}) {
  const [abriendo, setAbriendo] = useState(false)
  const med = useBrand().id === 'med'
  // El violeta del manual bajo Mediterránea (spec D3: "ícono PDF grande en
  // violeta"); TWF conserva el rojo de documento de siempre.
  const caja = med ? 'bg-med-lila text-med-violeta' : 'bg-red-50 text-red-600'

  const abrir = async () => {
    setAbriendo(true)
    try {
      const data = informe.fileData || await fetchReportFile(informe.id)
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
        a.download = informe.fileName || 'informe.pdf'
        a.rel = 'noopener'
        a.click()
      }
      if (!/^https?:/i.test(data)) setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      toast.error('No pudimos abrir el informe. Escribinos y te lo mandamos por mail.')
    } finally {
      setAbriendo(false)
    }
  }

  const boton = (
    <button
      type="button"
      onClick={() => void abrir()}
      disabled={abriendo}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-bold hover:opacity-90 disabled:opacity-60 ${
        med ? 'bg-med-violeta text-white' : 'bg-accent text-accent-foreground'
      }`}
    >
      <FilePdf size={14} weight="fill" />
      {abriendo ? 'Abriendo…' : 'Abrir'}
    </button>
  )

  if (compacta) {
    return (
      <div className={`rounded-lg border flex items-center gap-3 px-3 py-2 ${med ? 'border-med-borde bg-white' : 'border-border bg-background/60'}`}>
        <span className={`shrink-0 rounded-lg p-2 ${caja}`}>
          <FilePdf size={24} weight="fill" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold leading-tight truncate">{informe.title || 'Informe operativo'}</span>
          <span className="block text-xs text-muted-foreground tabular-nums">
            PDF · {fechaDeSubida(informe.createdAt)}
            {informe.containerNumber ? <span className="font-mono"> · {informe.containerNumber}</span> : null}
          </span>
        </span>
        {boton}
      </div>
    )
  }

  return (
    <article className="rounded-xl border-2 border-border bg-card p-4 flex items-start gap-3">
      {/* Ícono grande, no miniatura: renderizar la primera página del PDF
          necesita servidor (Vercel está en 12/12 funciones). */}
      <span className={`shrink-0 rounded-lg p-2.5 ${caja}`}>
        <FilePdf size={32} weight="fill" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-bold leading-tight break-words">{informe.title || 'Informe operativo'}</h3>
        <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
          PDF · {fechaDeSubida(informe.createdAt)}
          {informe.containerNumber ? <span className="font-mono"> · {informe.containerNumber}</span> : null}
        </p>
        <div className="mt-3">{boton}</div>
      </div>
    </article>
  )
}
