// Bitácora de gestiones por carga — línea compartida entre la tarjeta
// "Llegan sin liberar" de HOY y la pestaña Checks (Brian 17/08): "reclamado
// por wpp al cliente" con quién y cuándo. La última nota ES el estado; si no
// es de hoy, la fecha va en ámbar (hay que volver a reclamar). Append-only.

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ChatCircleDots, PaperPlaneRight } from '@phosphor-icons/react'
import { fetchRefNotas, postRefNota } from '@/lib/dataClient'
import { ultimaNotaPorRef, fmtCuando, esDeHoy, type NotaRef } from '@/lib/refNotas'
import { normalizeRef } from '@/lib/checksTypes'
import { getAdminName } from '@/lib/authClient'

/** Estado compartido: última nota por ref + agregar (optimista). El fetch es
 *  UNO solo por montaje del tab (las últimas 500 notas cubren de sobra). */
export function useRefNotas() {
  const [notas, setNotas] = useState<Map<string, NotaRef>>(new Map())

  useEffect(() => {
    let vivo = true
    fetchRefNotas()
      .then(rows => { if (vivo) setNotas(ultimaNotaPorRef(rows as unknown as NotaRef[])) })
      .catch(err => console.warn('ref_notas:', err))
    return () => { vivo = false }
  }, [])

  const agregar = useCallback((ref: string, texto: string) => {
    const t = texto.trim()
    if (!t) return
    // Optimista: la nota aparece ya, con el usuario local y la hora de acá;
    // el server la persiste con su propio timestamp (fuente de verdad).
    const optimista: NotaRef = { ref, texto: t, usuario: getAdminName(), created_at: new Date().toISOString() }
    setNotas(prev => { const n = new Map(prev); n.set(normalizeRef(ref), optimista); return n })
    postRefNota(ref, t).catch(err => {
      toast.error(`No se pudo guardar la nota de ${ref}: ${(err as Error)?.message || 'sin detalles'}`)
    })
  }, [])

  return { notas, agregar }
}

/** "quién" corto: parte antes de la @ si es un email. */
const quien = (u: string | null | undefined): string => String(u || '').split('@')[0]

export function RefNotaLine({ refCarga, nota, onAgregar }: {
  refCarga: string
  nota?: NotaRef
  onAgregar: (ref: string, texto: string) => void
}) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')
  const hoy = new Date()
  const deHoy = esDeHoy(nota?.created_at, hoy)

  const guardar = () => {
    const t = texto.trim()
    if (!t) { setEditando(false); return }
    onAgregar(refCarga, t)
    setTexto('')
    setEditando(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-2.5 text-xs">
      <ChatCircleDots size={14} className={nota ? (deHoy ? 'text-emerald-600' : 'text-amber-500') : 'text-muted-foreground/50'} />
      {nota ? (
        <span className="min-w-0 truncate text-foreground/75" title={`${nota.texto} — ${fmtCuando(nota.created_at, hoy)}${nota.usuario ? ` · ${quien(nota.usuario)}` : ''}`}>
          {nota.texto}
          <span className={`ml-1.5 font-medium ${deHoy ? 'text-emerald-600' : 'text-amber-600'}`}>
            {fmtCuando(nota.created_at, hoy)}
          </span>
          {nota.usuario && <span className="ml-1 text-muted-foreground">· {quien(nota.usuario)}</span>}
        </span>
      ) : (
        <span className="text-muted-foreground/70">sin gestiones anotadas</span>
      )}
      {editando ? (
        <span className="flex items-center gap-1 flex-1 min-w-[180px]">
          <input
            autoFocus
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') guardar()
              if (e.key === 'Escape') { setTexto(''); setEditando(false) }
            }}
            onBlur={guardar}
            maxLength={300}
            placeholder="reclamado por wpp al cliente…"
            aria-label={`Nota de gestión para ${refCarga}`}
            className="h-7 flex-1 min-w-0 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={guardar} aria-label="Guardar nota" className="p-1 rounded text-primary hover:bg-primary/10">
            <PaperPlaneRight size={14} weight="fill" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="text-primary/80 hover:text-primary hover:underline shrink-0"
        >
          + nota
        </button>
      )}
    </div>
  )
}
