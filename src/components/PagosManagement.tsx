import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  CurrencyDollar,
  MagnifyingGlass,
  CheckCircle,
  ArrowCounterClockwise,
  PencilSimple,
  DownloadSimple,
  Warning,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { DbShipment } from '@/lib/operationsTypes'
import {
  buildPagoItems,
  corteHasta,
  kpisPagos,
  deriveFormaPago,
  normalizeFormaPago,
  RUBRO_LABELS,
  FORMA_PAGO_LABELS,
  PAGO_RUBROS,
  MONTO_KEYS,
  PAGO_AT_KEYS,
  type PagoItem,
  type PagoRubro,
  type FormaPago,
  type KpiBucket,
} from '@/lib/pagosVencimientos'
import { fmtMoneyUY } from '@/lib/fichaFacturacionPdf'
import { fmtDateDMY } from '@/lib/format'
import { exportToCSV } from '@/lib/exportUtils'
import { getBrand } from '@/lib/brand'

// ─── Pagos por carga ─────────────────────────────────────────────────
// Vencimientos DERIVADOS (nunca guardados) de ETA + forma de pago efectiva
// + terminal — ver pagosVencimientos.ts. Montos: null = sin datos · 0 = ya
// pagado (convención SG) · >0 = pendiente salvo "Pagado" estampado.

interface PagosManagementProps {
  dbShipments?: DbShipment[]
  onPatchShipment?: (id: string, fields: Record<string, unknown>) => void
}

type SubTab = 'pendientes' | 'pagados' | 'sin_datos'

/** "1.234,56" / "1234.56" → número. Coma = decimal (es-UY); sin coma, el punto decide. */
function parseMontoUY(s: string): number {
  const t = (s || '').trim().replace(/\s/g, '')
  if (!t) return 0
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = parseFloat(norm)
  return Number.isFinite(n) ? n : 0
}

const montoToInput = (n: number | null): string => (n === null ? '' : String(n).replace('.', ','))

/** Fecha de HOY en hora local (toISOString es UTC y a la noche ya es "mañana" en UY). */
function todayISO(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

interface MontosDraft {
  devolucion: string
  terminal: string
  locales: string
  flete: string
  formaPago: '' | FormaPago
}

export default function PagosManagement({ dbShipments = [], onPatchShipment }: PagosManagementProps) {
  const hoy = useMemo(() => todayISO(), [])
  const [subTab, setSubTab] = useState<SubTab>('pendientes')
  const [search, setSearch] = useState('')
  const [rubroFilter, setRubroFilter] = useState<'all' | PagoRubro>('all')
  const [lineaFilter, setLineaFilter] = useState('all')
  const [terminalFilter, setTerminalFilter] = useState('all')
  const [fechaCorte, setFechaCorte] = useState(hoy)
  const [soloCorte, setSoloCorte] = useState(false)
  // Editor de montos (dialog): carga abierta + drafts de los 4 rubros + forma de pago.
  const [editS, setEditS] = useState<DbShipment | null>(null)
  const [draft, setDraft] = useState<MontosDraft>({ devolucion: '', terminal: '', locales: '', flete: '', formaPago: '' })

  const { items, sinDatos } = useMemo(() => buildPagoItems(dbShipments, hoy), [dbShipments, hoy])
  const kpis = useMemo(() => kpisPagos(items), [items])
  const corte = useMemo(() => corteHasta(items, fechaCorte), [items, fechaCorte])

  const pendientes = useMemo(() => items.filter(i => i.estado === 'pendiente'), [items])
  const pagados = useMemo(
    () => items.filter(i => i.estado === 'pagado' && i.pagadoAt)
      .sort((a, b) => String(b.pagadoAt).localeCompare(String(a.pagadoAt))),
    [items],
  )

  const lineas = useMemo(
    () => Array.from(new Set(pendientes.map(i => i.linea.trim().toUpperCase()).filter(Boolean))).sort(),
    [pendientes],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase()
    return pendientes.filter(i => {
      if (rubroFilter !== 'all' && i.rubro !== rubroFilter) return false
      if (lineaFilter !== 'all' && i.linea.trim().toUpperCase() !== lineaFilter) return false
      if (terminalFilter !== 'all' && i.terminal.trim().toUpperCase() !== terminalFilter) return false
      if (soloCorte && !(i.vence !== null && i.vence <= fechaCorte)) return false
      if (q && !i.ref.toUpperCase().includes(q) && !i.cliente.toUpperCase().includes(q)) return false
      return true
    })
  }, [pendientes, rubroFilter, lineaFilter, terminalFilter, soloCorte, fechaCorte, search])

  const byId = useMemo(() => {
    const m = new Map<string, DbShipment>()
    for (const s of dbShipments) m.set(s.id, s)
    return m
  }, [dbShipments])

  const marcarPagado = (it: PagoItem) => {
    if (!onPatchShipment) return
    const key = PAGO_AT_KEYS[it.rubro]
    onPatchShipment(it.id, { [key]: new Date().toISOString() })
    toast.success(`${RUBRO_LABELS[it.rubro]} de ${it.ref} marcado como pagado`, {
      action: { label: 'Deshacer', onClick: () => onPatchShipment(it.id, { [key]: null }) },
    })
  }

  const deshacerPago = (it: PagoItem) => {
    if (!onPatchShipment) return
    onPatchShipment(it.id, { [PAGO_AT_KEYS[it.rubro]]: null })
    toast.success(`${RUBRO_LABELS[it.rubro]} de ${it.ref} vuelve a pendiente`)
  }

  const openEditor = (s: DbShipment) => {
    setDraft({
      devolucion: montoToInput(s.monto_devolucion ?? null),
      terminal: montoToInput(s.monto_terminal ?? null),
      locales: montoToInput(s.monto_locales ?? null),
      flete: montoToInput(s.monto_flete ?? null),
      formaPago: normalizeFormaPago(s.forma_pago) ?? '',
    })
    setEditS(s)
  }

  const saveEditor = () => {
    if (!editS || !onPatchShipment) { setEditS(null); return }
    const fields: Record<string, unknown> = {}
    for (const rubro of PAGO_RUBROS) {
      const str = draft[rubro].trim()
      const nuevo = str === '' ? null : parseMontoUY(str)
      const orig = editS[MONTO_KEYS[rubro]] ?? null
      if (nuevo !== (orig === null ? null : Number(orig))) fields[MONTO_KEYS[rubro]] = nuevo
    }
    const origFp = normalizeFormaPago(editS.forma_pago) ?? ''
    if (draft.formaPago !== origFp) fields.forma_pago = draft.formaPago || null
    if (Object.keys(fields).length > 0) {
      onPatchShipment(editS.id, fields)
      toast.success(`Datos de pago de ${editS.ref} guardados`)
    }
    setEditS(null)
  }

  const exportCorte = () => {
    if (corte.items.length === 0) {
      toast.info('Nada vence hasta esa fecha — no hay nada para exportar')
      return
    }
    exportToCSV(
      corte.items.map(i => ({
        Ref: i.ref,
        Cliente: i.cliente,
        Naviera: i.linea,
        Rubro: RUBRO_LABELS[i.rubro],
        'Monto USD': i.monto,
        Vence: i.vence ? fmtDateDMY(i.vence) : 'sin ETA',
        Dias: i.dias ?? '',
        'Forma de pago': FORMA_PAGO_LABELS[i.formaPago],
        Terminal: i.terminal,
      })),
      `pagos-${getBrand().id}-hasta-${fechaCorte}.csv`,
    )
    toast.success(`CSV exportado: ${corte.items.length} pago${corte.items.length === 1 ? '' : 's'} hasta el ${fmtDateDMY(fechaCorte)}`)
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Vencido" bucket={kpis.vencido} tone="red" />
        <KpiCard label="Vence hoy" bucket={kpis.hoy} tone="amber" />
        <KpiCard label="Esta semana" bucket={kpis.semana} tone="sky" />
        <KpiCard label="Total pendiente" bucket={kpis.pendiente} tone="slate" />
      </div>
      {kpis.sinFecha.count > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <Warning size={14} weight="fill" />
          {kpis.sinFecha.count} pago{kpis.sinFecha.count === 1 ? '' : 's'} sin ETA por USD {fmtMoneyUY(kpis.sinFecha.total)} — no computan en el corte por fecha.
        </div>
      )}

      {/* Selector estrella: ¿cuánto tengo que pagar hasta el…? */}
      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardContent className="p-4 flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex items-center gap-2">
            <CurrencyDollar size={20} weight="fill" className="text-primary" />
            <span className="text-sm font-medium">¿Cuánto tengo que pagar hasta el</span>
            <Input
              type="date"
              value={fechaCorte}
              onChange={e => setFechaCorte(e.target.value || hoy)}
              className="h-9 w-[150px]"
              aria-label="Fecha de corte"
            />
            <span className="text-sm font-medium">?</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums">USD {fmtMoneyUY(corte.total)}</span>
            <span className="text-xs text-muted-foreground">
              {corte.items.length} pago{corte.items.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {PAGO_RUBROS.filter(r => corte.porRubro[r] > 0).map(r => (
              <span key={r} className="rounded-full border bg-card px-2 py-0.5 tabular-nums">
                {RUBRO_LABELS[r]}: USD {fmtMoneyUY(corte.porRubro[r])}
              </span>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
              <input type="checkbox" checked={soloCorte} onChange={e => setSoloCorte(e.target.checked)} />
              Ver solo el corte
            </label>
            <Button variant="outline" size="sm" onClick={exportCorte}>
              <DownloadSimple size={16} className="mr-1.5" />
              Exportar CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2">
        <SubTabChip label="Pendientes" count={pendientes.length} tone="amber" active={subTab === 'pendientes'} onClick={() => setSubTab('pendientes')} />
        <SubTabChip label="Pagados" count={pagados.length} tone="green" active={subTab === 'pagados'} onClick={() => setSubTab('pagados')} />
        <SubTabChip label="Sin datos de pago" count={sinDatos.length} tone="muted" active={subTab === 'sin_datos'} onClick={() => setSubTab('sin_datos')} />
      </div>

      {subTab === 'pendientes' && (
        <>
          {/* Filtros */}
          <div className="flex items-center gap-2 flex-wrap">
            {([['all', 'Todos'], ...PAGO_RUBROS.map(r => [r, RUBRO_LABELS[r]])] as ['all' | PagoRubro, string][]).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setRubroFilter(id)}
                className={`rounded-lg px-2.5 py-1.5 border text-xs transition-all hover:shadow-sm ${
                  rubroFilter === id ? 'bg-primary/5 border-primary/40 font-medium' : 'bg-card border-border'
                }`}
              >
                {label}
              </button>
            ))}
            <select
              value={lineaFilter}
              onChange={e => setLineaFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-xs"
              aria-label="Filtrar por naviera"
            >
              <option value="all">Naviera: todas</option>
              {lineas.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <select
              value={terminalFilter}
              onChange={e => setTerminalFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-xs"
              aria-label="Filtrar por terminal"
            >
              <option value="all">Terminal: todas</option>
              <option value="TCP">TCP</option>
              <option value="MONTECON">MONTECON</option>
            </select>
            <div className="relative max-w-md flex-1 min-w-[200px]">
              <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar REF o cliente…"
                className="pl-9 h-9"
              />
            </div>
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto max-h-[65vh] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  {pendientes.length === 0 ? '🎉 No hay pagos pendientes' : soloCorte ? 'Nada vence hasta esa fecha' : 'Sin resultados con estos filtros'}
                </div>
              ) : (
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="sticky top-0 z-10 bg-muted text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Ref</th>
                      <th className="px-3 py-2 text-left">Cliente</th>
                      <th className="px-3 py-2 text-left">Naviera</th>
                      <th className="px-3 py-2 text-left">Rubro</th>
                      <th className="px-3 py-2 text-right">Monto USD</th>
                      <th className="px-3 py-2 text-left">Vence</th>
                      <th className="px-3 py-2 text-left">Días</th>
                      <th className="px-3 py-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map(it => (
                      <tr key={`${it.id}-${it.rubro}`} className="hover:bg-muted/40 transition-colors">
                        <td className="px-3 py-2 font-medium whitespace-nowrap">{it.ref}</td>
                        <td className="px-3 py-2 max-w-[220px] truncate" title={it.cliente}>{it.cliente || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {it.linea || '—'}
                          <span className="ml-1.5 text-[10px] text-muted-foreground" title={it.formaPagoOverride ? 'Forma de pago fijada en la carga' : 'Forma de pago derivada de la naviera'}>
                            {FORMA_PAGO_LABELS[it.formaPago]}{it.formaPagoOverride ? ' ✏️' : ''}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{RUBRO_LABELS[it.rubro]}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoneyUY(it.monto)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{it.vence ? fmtDateDMY(it.vence) : <span className="text-muted-foreground">sin ETA</span>}</td>
                        <td className="px-3 py-2 whitespace-nowrap"><DiasChip dias={it.dias} /></td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" onClick={() => { const s = byId.get(it.id); if (s) openEditor(s) }} title="Editar montos">
                            <PencilSimple size={15} />
                          </Button>
                          <Button variant="outline" size="sm" className="h-7" onClick={() => marcarPagado(it)}>
                            <CheckCircle size={15} className="mr-1 text-green-600" weight="fill" />
                            Pagado
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {subTab === 'pagados' && (
        <Card>
          <CardContent className="p-0 overflow-x-auto max-h-[65vh] overflow-y-auto">
            {pagados.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                Todavía no marcaste pagos en la web. Los montos en 0 del arranque cuentan como pagados pero no se listan acá.
              </div>
            ) : (
              <table className="w-full min-w-[640px] text-sm">
                <thead className="sticky top-0 z-10 bg-muted text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Ref</th>
                    <th className="px-3 py-2 text-left">Cliente</th>
                    <th className="px-3 py-2 text-left">Rubro</th>
                    <th className="px-3 py-2 text-right">Monto USD</th>
                    <th className="px-3 py-2 text-left">Pagado el</th>
                    <th className="px-3 py-2 text-left">Por</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pagados.map(it => (
                    <tr key={`${it.id}-${it.rubro}`} className="hover:bg-muted/40 transition-colors">
                      <td className="px-3 py-2 font-medium whitespace-nowrap">{it.ref}</td>
                      <td className="px-3 py-2 max-w-[220px] truncate" title={it.cliente}>{it.cliente || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{RUBRO_LABELS[it.rubro]}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoneyUY(it.monto)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDateDMY(String(it.pagadoAt).slice(0, 10))}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{it.pagadoBy || '—'}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" className="h-7" onClick={() => deshacerPago(it)}>
                          <ArrowCounterClockwise size={15} className="mr-1" />
                          Deshacer
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {subTab === 'sin_datos' && (
        <Card>
          <CardContent className="p-0 overflow-x-auto max-h-[65vh] overflow-y-auto">
            {sinDatos.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                🎉 Todas las cargas vigentes tienen datos de pago.
              </div>
            ) : (
              <table className="w-full min-w-[560px] text-sm">
                <thead className="sticky top-0 z-10 bg-muted text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Ref</th>
                    <th className="px-3 py-2 text-left">Cliente</th>
                    <th className="px-3 py-2 text-left">Naviera</th>
                    <th className="px-3 py-2 text-left">ETA MVD</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sinDatos.map(s => (
                    <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-3 py-2 font-medium whitespace-nowrap">{s.ref}</td>
                      <td className="px-3 py-2 max-w-[240px] truncate" title={s.cliente}>{s.cliente || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{s.linea || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDateDMY(s.eta)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <Button variant="outline" size="sm" className="h-7" onClick={() => openEditor(s)}>
                          <PencilSimple size={15} className="mr-1" />
                          Cargar montos
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Editor de montos */}
      <Dialog open={!!editS} onOpenChange={open => !open && setEditS(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CurrencyDollar size={20} weight="fill" className="text-primary" />
              Datos de pago — {editS?.ref}
            </DialogTitle>
          </DialogHeader>
          {editS && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Vacío = sin dato · <strong>0 = ya pagado</strong> · mayor a 0 = pendiente. El vencimiento se calcula solo con la ETA, la naviera y la terminal.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {PAGO_RUBROS.map(rubro => (
                  <div key={rubro} className="space-y-1">
                    <Label htmlFor={`monto-${rubro}`} className="text-xs">{RUBRO_LABELS[rubro]} (USD)</Label>
                    <Input
                      id={`monto-${rubro}`}
                      inputMode="decimal"
                      placeholder="—"
                      value={draft[rubro]}
                      onChange={e => setDraft(d => ({ ...d, [rubro]: e.target.value }))}
                      className="h-9"
                    />
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <Label htmlFor="forma-pago" className="text-xs">Forma de pago</Label>
                <select
                  id="forma-pago"
                  value={draft.formaPago}
                  onChange={e => setDraft(d => ({ ...d, formaPago: e.target.value as MontosDraft['formaPago'] }))}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">Derivada de la naviera: {FORMA_PAGO_LABELS[deriveFormaPago(editS.linea)]}</option>
                  <option value="programado">Programado</option>
                  <option value="cuenta corriente">C. corriente</option>
                  <option value="al arribo">Al arribo</option>
                </select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditS(null)}>Cancelar</Button>
            <Button onClick={saveEditor}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function KpiCard({ label, bucket, tone }: { label: string; bucket: KpiBucket; tone: 'red' | 'amber' | 'sky' | 'slate' }) {
  const tones = {
    red: 'border-red-200 bg-red-50/60 text-red-700',
    amber: 'border-amber-200 bg-amber-50/60 text-amber-700',
    sky: 'border-sky-200 bg-sky-50/60 text-sky-700',
    slate: 'border-slate-200 bg-slate-50/70 text-slate-700',
  }
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <div className="text-[11px] uppercase tracking-wide">{label}</div>
      <div className="text-xl font-bold tabular-nums text-foreground">USD {fmtMoneyUY(bucket.total)}</div>
      <div className="text-xs text-muted-foreground tabular-nums">{bucket.count} pago{bucket.count === 1 ? '' : 's'}</div>
    </div>
  )
}

function DiasChip({ dias }: { dias: number | null }) {
  if (dias === null) return <span className="text-xs text-muted-foreground">—</span>
  if (dias < 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 border border-red-200 px-2 py-0.5 text-xs font-medium">
        vencido hace {Math.abs(dias)} d
      </span>
    )
  }
  if (dias === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 border border-red-200 px-2 py-0.5 text-xs font-medium">
        HOY
      </span>
    )
  }
  if (dias <= 7) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 text-xs font-medium">
        en {dias} d
      </span>
    )
  }
  return <span className="text-xs text-muted-foreground tabular-nums">en {dias} d</span>
}

function SubTabChip({
  label,
  count,
  tone,
  active,
  onClick,
}: {
  label: string
  count: number
  tone: 'amber' | 'green' | 'muted'
  active: boolean
  onClick: () => void
}) {
  const tones = {
    amber: { active: 'bg-amber-100 border-amber-300 text-amber-900', num: 'text-amber-700' },
    green: { active: 'bg-green-100 border-green-300 text-green-900', num: 'text-green-700' },
    muted: { active: 'bg-muted border-muted-foreground/30 text-foreground', num: 'text-muted-foreground' },
  }
  const t = tones[tone]
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 border transition-all hover:shadow-sm cursor-pointer ${
        active ? t.active : 'bg-card border-border'
      }`}
    >
      <span className={`text-lg font-bold tabular-nums ${active ? t.num : count === 0 ? 'text-muted-foreground/50' : t.num}`}>
        {count}
      </span>
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
    </button>
  )
}
