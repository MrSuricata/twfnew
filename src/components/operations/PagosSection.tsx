// ─── Sección Pagos del panel de detalle (pedido Brian 16/07) ─────────────
// Los 4 rubros (devolución/terminal/locales/flete) editables desde la ficha
// de la carga — sin tener que ir a la pestaña Pagos. Misma semántica que allá:
// monto null = sin datos · 0 = ya pagado (convención SG) · >0 = pendiente
// salvo "Pagado" estampado. Vencimientos DERIVADOS de ETA + forma de pago
// efectiva + terminal (pagosVencimientos — nunca se guardan).
// Solo FCL editables fuera de Chile (mismo universo que la pestaña Pagos).
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { CheckCircle, ArrowCounterClockwise } from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { DbShipment } from '@/lib/operationsTypes'
import {
  PAGO_RUBROS,
  RUBRO_LABELS,
  MONTO_KEYS,
  PAGO_AT_KEYS,
  PAGO_BY_KEYS,
  FORMA_PAGO_LABELS,
  formaPagoEfectiva,
  normalizeFormaPago,
  deriveFormaPago,
  venceRubro,
  empresaRubro,
  parseMontoUY,
  montoToInput,
  type PagoRubro,
  type FormaPago,
} from '@/lib/pagosVencimientos'
import { fmtDateDMY } from '@/lib/format'
import { fmtMoneyUY } from '@/lib/fichaFacturacionPdf'

/** Fecha de HOY en hora local (toISOString es UTC — a la noche ya es "mañana" en UY). */
function todayISO(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function PagosSection({
  dbRow,
  editable,
  onPatch,
}: {
  /** Fila cruda de shipments (los montos/pago_*_at viven ahí, no en UnifiedOperation). */
  dbRow: DbShipment
  editable: boolean
  onPatch: (id: string, fields: Record<string, unknown>) => void
}) {
  const hoy = todayISO()
  const fp = formaPagoEfectiva(dbRow)
  const fpExplicita = normalizeFormaPago(dbRow.forma_pago) ?? ''

  // Draft del monto en edición (un rubro a la vez, patrón StatBox).
  const [editing, setEditing] = useState<PagoRubro | null>(null)
  const [draft, setDraft] = useState('')
  useEffect(() => { setEditing(null) }, [dbRow.id])

  const startEdit = (rubro: PagoRubro) => {
    if (!editable) return
    setDraft(montoToInput((dbRow[MONTO_KEYS[rubro]] as number | null) ?? null))
    setEditing(rubro)
  }
  const saveEdit = (rubro: PagoRubro) => {
    setEditing(null)
    const str = draft.trim()
    const nuevo = str === '' ? null : parseMontoUY(str)
    const orig = (dbRow[MONTO_KEYS[rubro]] as number | null) ?? null
    if (nuevo !== (orig === null ? null : Number(orig))) {
      onPatch(dbRow.id, { [MONTO_KEYS[rubro]]: nuevo })
    }
  }

  const marcarPagado = (rubro: PagoRubro) => {
    const key = PAGO_AT_KEYS[rubro]
    onPatch(dbRow.id, { [key]: new Date().toISOString() })
    toast.success(`${RUBRO_LABELS[rubro]} de ${dbRow.ref} marcado como pagado`, {
      action: { label: 'Deshacer', onClick: () => onPatch(dbRow.id, { [key]: null }) },
    })
  }

  return (
    <section className="rounded-lg border border-teal-200 bg-teal-50/60 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-[10px] uppercase tracking-wide font-semibold text-teal-700">Pagos</h4>
        {/* Forma de pago: '' = derivada de la naviera; elegir una la fija en la carga. */}
        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          Forma de pago
          <select
            value={fpExplicita}
            disabled={!editable}
            onChange={e => onPatch(dbRow.id, { forma_pago: (e.target.value || null) as FormaPago | null })}
            className="h-6 rounded border border-input bg-background px-1.5 text-[11px] disabled:opacity-50"
          >
            <option value="">{`Según naviera (${FORMA_PAGO_LABELS[deriveFormaPago(dbRow.linea)]})`}</option>
            {(Object.keys(FORMA_PAGO_LABELS) as FormaPago[]).map(v => (
              <option key={v} value={v}>{FORMA_PAGO_LABELS[v]}{fp.overridden && fp.value === v ? ' ✏️' : ''}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-md border border-teal-200/80 bg-background divide-y divide-border/60">
        {PAGO_RUBROS.map(rubro => {
          const monto = (dbRow[MONTO_KEYS[rubro]] as number | null) ?? null
          const pagadoAt = (dbRow[PAGO_AT_KEYS[rubro]] as string | null) || null
          const pagadoBy = (dbRow[PAGO_BY_KEYS[rubro]] as string | null) || ''
          const vence = venceRubro(rubro, dbRow.eta, fp.value, dbRow.terminal)
          const empresa = empresaRubro(rubro, dbRow)
          const pagado = !!pagadoAt || monto === 0
          const vencido = !pagado && monto !== null && monto > 0 && vence !== null && vence < hoy
          return (
            <div key={rubro} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
              <span className="w-[74px] shrink-0 font-medium">{RUBRO_LABELS[rubro]}</span>
              <span className="flex-1 min-w-0 truncate text-muted-foreground" title={empresa}>{empresa || '—'}</span>
              {editing === rubro ? (
                <Input
                  autoFocus
                  inputMode="decimal"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onBlur={() => saveEdit(rubro)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveEdit(rubro)
                    if (e.key === 'Escape') setEditing(null)
                  }}
                  className="h-7 w-24 text-right text-xs tabular-nums"
                  placeholder="USD"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => startEdit(rubro)}
                  disabled={!editable}
                  title={editable ? 'Hacé clic para cargar/editar el monto (vacío = sin datos)' : 'Solo lectura'}
                  className={`w-24 shrink-0 text-right tabular-nums rounded px-1 py-0.5 ${editable ? 'hover:bg-muted cursor-text' : ''} ${monto === null ? 'text-muted-foreground' : 'font-medium'}`}
                >
                  {monto === null ? 'sin datos' : fmtMoneyUY(monto)}
                </button>
              )}
              <span className={`w-[104px] shrink-0 whitespace-nowrap ${vencido ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
                {monto === null ? '' : pagado ? '' : vence ? `vence ${fmtDateDMY(vence)}` : 'sin ETA'}
              </span>
              <span className="w-[92px] shrink-0 text-right">
                {monto === null ? null : pagado ? (
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="rounded-full bg-emerald-100 px-2 py-px text-[10px] font-semibold text-emerald-800"
                      title={pagadoAt ? `Pagado el ${fmtDateDMY(pagadoAt.slice(0, 10))}${pagadoBy ? ` por ${pagadoBy.split('@')[0]}` : ''}` : 'Monto 0 = ya pagado (convención de la planilla)'}
                    >
                      Pagado
                    </span>
                    {pagadoAt && editable && (
                      <button
                        type="button"
                        onClick={() => onPatch(dbRow.id, { [PAGO_AT_KEYS[rubro]]: null })}
                        title="Deshacer: vuelve a pendiente"
                        className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                      >
                        <ArrowCounterClockwise size={12} />
                      </button>
                    )}
                  </span>
                ) : editable ? (
                  <button
                    type="button"
                    onClick={() => marcarPagado(rubro)}
                    className="inline-flex items-center gap-1 rounded border border-input bg-background px-1.5 py-0.5 text-[10px] font-medium hover:bg-muted"
                  >
                    <CheckCircle size={12} weight="fill" className="text-green-600" /> Pagado
                  </button>
                ) : (
                  <span className="text-[10px] text-muted-foreground">pendiente</span>
                )}
              </span>
            </div>
          )
        })}
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        Vencimientos derivados de ETA + forma de pago + terminal — lo mismo que ves en la pestaña Pagos.
      </p>
    </section>
  )
}
