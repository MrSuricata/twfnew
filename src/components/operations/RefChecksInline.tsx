// ─── Checks documentarios inline (panel de detalle, pedido Brian 16/07) ───
// Los 4 checks (BL entregado · Carta entregada · Docs transporte · Docs
// depósito) clickeables desde la ficha de la carga, abajo de LIBRE y
// "Devuelve en" (slot del ViabilityBlock). Escriben por el MISMO camino que
// la pestaña Checks (saveRefCheckSteps → tabla ref_checks, merge por paso,
// `by` estampado por el server) — marcar acá completa allá y viceversa.
// Solo lectura+toggle de los 4 documentarios; los avisos por contenedor
// siguen en HOY.
import { useEffect, useState } from 'react'
import { CheckCircle, Circle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { fetchRefChecks, saveRefCheckSteps } from '@/lib/dataClient'
import { getAdminName } from '@/lib/authClient'
import { fmtDateDMY } from '@/lib/format'
import {
  normalizeRef,
  stepsForOperativa,
  type CheckStepKey,
  type RefCheckSteps,
} from '@/lib/checksTypes'

function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function RefChecksInline({ refKey, operativa }: { refKey: string; operativa: string }) {
  // null = cargando. Fetch propio al abrir/cambiar de carga (mismo endpoint
  // que la pestaña Checks; el estado NO vive en App).
  const [steps, setSteps] = useState<RefCheckSteps | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let alive = true
    setSteps(null)
    setError(false)
    fetchRefChecks()
      .then(rows => {
        if (!alive) return
        setSteps(rows.find(r => normalizeRef(r.ref) === normalizeRef(refKey))?.steps || {})
      })
      .catch(() => { if (alive) { setError(true); setSteps({}) } })
    return () => { alive = false }
  }, [refKey])

  const defs = stepsForOperativa(operativa)

  const toggle = (key: CheckStepKey, label: string) => {
    if (steps === null || error) return
    const cur = steps[key]
    const next = cur?.done
      ? { done: false as const }
      : { done: true as const, date: todayIso(), by: getAdminName() }
    const prev = steps
    setSteps({ ...steps, [key]: next })
    saveRefCheckSteps(refKey, { [key]: next })
      .then(merged => setSteps(merged))
      .catch(err => {
        setSteps(prev)
        toast.error(`No se pudo guardar "${label}": ${(err as Error)?.message || 'sin detalles'}`)
      })
  }

  return (
    <div className="mb-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
        Checks documentarios {error ? '— no se pudieron cargar' : ''}
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {defs.map(def => {
          const st = steps?.[def.key]
          const done = !!st?.done
          return (
            <button
              key={def.key}
              type="button"
              disabled={steps === null || error}
              onClick={() => toggle(def.key, def.label)}
              title={done
                ? `${def.label} — hecho${st?.date ? ` el ${fmtDateDMY(st.date)}` : ''}${st?.by ? ` por ${String(st.by).split('@')[0]}` : ''} · clic para desmarcar`
                : `${def.label} — pendiente · clic para marcar`}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs transition-colors disabled:opacity-50 ${
                done
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
              }`}
            >
              {done
                ? <CheckCircle size={15} weight="fill" className="shrink-0 text-emerald-500" />
                : <Circle size={15} className="shrink-0 text-muted-foreground/50" />}
              <span className="min-w-0 flex-1 truncate">{def.label}</span>
              {done && st?.date && <span className="shrink-0 text-[10px] tabular-nums">{fmtDateDMY(st.date)}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
