import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Receipt,
  MagnifyingGlass,
  CheckCircle,
  ArrowCounterClockwise,
  Prohibit,
  Clock,
  Warning,
  Truck as TruckIcon,
  Plus,
  X,
  FilePdf,
  FloppyDisk,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import type { Truck, TruckLoad } from '@/lib/truckTypes'
import type { DbShipment, Modality } from '@/lib/operationsTypes'
import { MODALITY_LABELS, MODALITY_COLORS } from '@/lib/operationsTypes'
import type { BillableItem, BillingLineItem, BillingRecord } from '@/lib/billingTypes'
import {
  AGING_THRESHOLD_DAYS,
  buildBillableItems,
  daysSince,
  hasFichaData,
  indexBilling,
  isInvoicedThisMonth,
} from '@/lib/billingTypes'
import { openFichaFacturacionPrint, fmtMoneyUY } from '@/lib/fichaFacturacionPdf'
import { fmtDateDMY } from '@/lib/format'

// ─── Facturación universal ───────────────────────────────────────────
// TODA carga (FCL planilla + LCL/aéreo/terrestre/FCL web) entra acá cuando
// llega a su punto final — derive-on-read, sin triggers: ninguna se pierde.

interface BillingManagementProps {
  shipments: ParsedShipment[]
  dbShipments?: DbShipment[]
  trucks?: Truck[]
  truckLoads?: TruckLoad[]
  billing: BillingRecord[]
  onUpdateBilling?: (row: BillingRecord) => void
  onClearBilling?: (ref: string) => void
}

type SubTab = 'pendientes' | 'facturadas' | 'no_aplica'

const INVOICED_BY = 'admin'

// ── Ficha de compra/venta: renglones en edición (monto como texto es-UY) ──
interface FichaLineDraft {
  concepto: string
  montoStr: string
}

/** "1.234,56" / "1234.56" → número. Coma = decimal (es-UY); sin coma, el punto decide. */
function parseMontoUY(s: string): number {
  const t = (s || '').trim().replace(/\s/g, '')
  if (!t) return 0
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = parseFloat(norm)
  return Number.isFinite(n) ? n : 0
}

const montoToInput = (n: number): string => (n === 0 ? '' : String(n).replace('.', ','))

const EMPTY_DRAFT: FichaLineDraft = { concepto: '', montoStr: '' }

const toDrafts = (lines?: BillingLineItem[]): FichaLineDraft[] =>
  lines && lines.length > 0
    ? lines.map(l => ({ concepto: l.concepto, montoStr: montoToInput(l.monto) }))
    : [{ ...EMPTY_DRAFT }]

/** Drafts → renglones persistibles (descarta filas totalmente vacías). */
const collectLines = (drafts: FichaLineDraft[]): BillingLineItem[] =>
  drafts
    .map(d => ({ concepto: d.concepto.trim(), monto: parseMontoUY(d.montoStr) }))
    .filter(l => l.concepto !== '' || l.monto !== 0)

const sumDrafts = (drafts: FichaLineDraft[]): number =>
  drafts.reduce((acc, d) => acc + parseMontoUY(d.montoStr), 0)

export default function BillingManagement({ shipments, dbShipments = [], trucks = [], truckLoads = [], billing, onUpdateBilling, onClearBilling }: BillingManagementProps) {
  const [subTab, setSubTab] = useState<SubTab>('pendientes')
  const [search, setSearch] = useState('')
  // Ficha de facturación (dialog): ítem abierto + renglones en edición.
  const [fichaItem, setFichaItem] = useState<BillableItem | null>(null)
  const [fichaGastos, setFichaGastos] = useState<FichaLineDraft[]>([])
  const [fichaVentas, setFichaVentas] = useState<FichaLineDraft[]>([])
  const [fichaInvoice, setFichaInvoice] = useState('')
  // Filtro por tipo de carga (FCL / LCL / aéreo / terrestre).
  const [modeFilter, setModeFilter] = useState<'all' | Modality>('all')
  // Orden por columna: 1er click ▼ (mayor→menor, ej: últimas arribadas), 2do ▲, 3ro limpia.
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  const toggleSort = (key: string) => setSort(prev =>
    !prev || prev.key !== key ? { key, dir: 'desc' } : prev.dir === 'desc' ? { key, dir: 'asc' } : null
  )

  const billingMap = useMemo(() => indexBilling(billing), [billing])

  // Universal: cada carga que llegó a su punto final, con su estado derivado.
  const buckets = useMemo(() => {
    const all = buildBillableItems(shipments, dbShipments, trucks, truckLoads, billingMap)
    const pendientes: BillableItem[] = []
    const facturadas: BillableItem[] = []
    const noAplica: BillableItem[] = []
    for (const { item, state } of all) {
      if (state === 'pendiente') pendientes.push(item)
      else if (state === 'facturada') facturadas.push(item)
      else noAplica.push(item)
    }
    // Pendientes: la más vieja arriba (aging)
    pendientes.sort((a, b) => daysSince(b.arrival) - daysSince(a.arrival))
    // Facturadas: la más reciente arriba
    facturadas.sort((a, b) => {
      const ra = billingMap.get(a.ref)?.invoicedAt || ''
      const rb = billingMap.get(b.ref)?.invoicedAt || ''
      return rb.localeCompare(ra)
    })
    return { pendientes, facturadas, noAplica }
  }, [shipments, dbShipments, trucks, truckLoads, billingMap])

  // Facturadas this month only (for the count + default view)
  const facturadasMonth = useMemo(
    () => buckets.facturadas.filter(s => isInvoicedThisMonth(billingMap.get(s.ref)?.invoicedAt || null)),
    [buckets.facturadas, billingMap]
  )

  const activeList = subTab === 'pendientes'
    ? buckets.pendientes
    : subTab === 'facturadas'
    ? buckets.facturadas
    : buckets.noAplica

  // Conteo por tipo dentro de la sub-pestaña activa (para los chips).
  const modeCounts = useMemo(() => {
    const c: Record<string, number> = { all: activeList.length, fcl: 0, lcl: 0, air: 0, land: 0 }
    for (const s of activeList) c[s.mode] = (c[s.mode] || 0) + 1
    return c
  }, [activeList])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return activeList.filter(s => {
      if (modeFilter !== 'all' && s.mode !== modeFilter) return false
      if (q) {
        const inv = billingMap.get(s.ref)?.invoiceNumber || ''
        const blob = `${s.ref} ${s.cliente} ${inv}`.toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
  }, [activeList, modeFilter, search, billingMap])

  const sorted = useMemo(() => {
    if (!sort) return filtered
    const sign = sort.dir === 'asc' ? 1 : -1
    const val = (it: BillableItem): number | string => {
      switch (sort.key) {
        case 'ref': return it.ref
        case 'tipo': return it.mode
        case 'cliente': return it.cliente
        case 'arrival': return it.arrival ? it.arrival.getTime() : 0
        case 'aging': return daysSince(it.arrival)
        case 'factura': return billingMap.get(it.ref)?.invoiceNumber || ''
        case 'facturada': return billingMap.get(it.ref)?.invoicedAt || ''
        default: return ''
      }
    }
    return [...filtered].sort((a, b) => {
      const va = val(a), vb = val(b)
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es')
      return c * sign
    })
  }, [filtered, sort, billingMap])

  const Th = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <th
      className="text-left px-3 py-2 cursor-pointer select-none hover:text-foreground"
      onClick={() => toggleSort(k)}
      title="Click para ordenar"
    >
      {children}{sort?.key === k ? (sort.dir === 'desc' ? ' ▼' : ' ▲') : ''}
    </th>
  )

  // ── Actions (por ref — vale para cualquier modalidad) ──
  // La ficha viaja con la fila: al marcar facturada/no_aplica se preserva lo
  // que haya (o lo recién editado); nunca se pisa una ficha con arrays vacíos
  // salvo que el usuario la haya vaciado a propósito en el dialog.
  const fichaFieldsOf = (rec: BillingRecord | undefined): Pick<BillingRecord, 'gastos' | 'ventas'> | Record<string, never> =>
    hasFichaData(rec) ? { gastos: rec?.gastos || [], ventas: rec?.ventas || [] } : {}

  const markFacturada = (item: BillableItem, invNumber: string, ficha?: Pick<BillingRecord, 'gastos' | 'ventas'>) => {
    if (!onUpdateBilling) return
    onUpdateBilling({
      ref: item.ref,
      status: 'facturada',
      invoiceNumber: invNumber.trim(),
      invoicedAt: new Date().toISOString(),
      invoicedBy: INVOICED_BY,
      updatedAt: new Date().toISOString(),
      ...(ficha ?? fichaFieldsOf(billingMap.get(item.ref))),
    })
    toast.success(`${item.ref} marcada como facturada`)
  }

  const undoFacturada = (item: BillableItem) => {
    const rec = billingMap.get(item.ref)
    if (hasFichaData(rec)) {
      // Hay ficha cargada: NO borrar la fila (se perderían los renglones).
      // Bajar a status 'pendiente' — semánticamente idéntico a la ausencia de
      // fila (derive-on-read) pero conserva gastos/ventas.
      if (!onUpdateBilling) return
      onUpdateBilling({
        ref: item.ref,
        status: 'pendiente',
        invoiceNumber: '',
        invoicedAt: null,
        invoicedBy: '',
        updatedAt: new Date().toISOString(),
        gastos: rec?.gastos || [],
        ventas: rec?.ventas || [],
      })
      toast.success(`${item.ref} vuelta a pendiente`)
      return
    }
    // Sin ficha: quitar el overlay vuelve al estado derivado, como siempre.
    if (onClearBilling) {
      onClearBilling(item.ref)
      toast.success(`${item.ref} vuelta a pendiente`)
    }
  }

  const markNoAplica = (item: BillableItem) => {
    if (!onUpdateBilling) return
    onUpdateBilling({
      ref: item.ref,
      status: 'no_aplica',
      invoiceNumber: '',
      invoicedAt: null,
      invoicedBy: '',
      updatedAt: new Date().toISOString(),
      ...fichaFieldsOf(billingMap.get(item.ref)),
    })
    toast.success(`${item.ref} marcada como "no aplica"`)
  }

  const restore = (item: BillableItem) => {
    const rec = billingMap.get(item.ref)
    if (hasFichaData(rec)) {
      // Igual que en undoFacturada: conservar la ficha al restaurar.
      if (!onUpdateBilling) return
      onUpdateBilling({
        ref: item.ref,
        status: 'pendiente',
        invoiceNumber: '',
        invoicedAt: null,
        invoicedBy: '',
        updatedAt: new Date().toISOString(),
        gastos: rec?.gastos || [],
        ventas: rec?.ventas || [],
      })
      toast.success(`${item.ref} restaurada`)
      return
    }
    if (onClearBilling) {
      onClearBilling(item.ref)
      toast.success(`${item.ref} restaurada`)
    }
  }

  // ── Ficha de compra/venta (dialog) ──
  const openFicha = (item: BillableItem) => {
    const rec = billingMap.get(item.ref)
    setFichaGastos(toDrafts(rec?.gastos))
    setFichaVentas(toDrafts(rec?.ventas))
    setFichaInvoice(rec?.invoiceNumber || '')
    setFichaItem(item)
  }

  const fichaRec = fichaItem ? billingMap.get(fichaItem.ref) : undefined
  const fichaEsFacturada = fichaRec?.status === 'facturada'
  const fichaResultado = sumDrafts(fichaVentas) - sumDrafts(fichaGastos)

  /** Upsert de la ficha SIN tocar el estado: una carga pendiente sigue
   *  pendiente (fila con status 'pendiente' = ausencia de fila para la
   *  derivación); una facturada/no_aplica conserva su estado y su factura. */
  const guardarFicha = () => {
    if (!fichaItem || !onUpdateBilling) return
    const rec = billingMap.get(fichaItem.ref)
    const status = rec?.status === 'facturada' || rec?.status === 'no_aplica' ? rec.status : 'pendiente'
    onUpdateBilling({
      ref: fichaItem.ref,
      status,
      invoiceNumber: rec?.invoiceNumber || '',
      invoicedAt: rec?.invoicedAt || null,
      invoicedBy: rec?.invoicedBy || '',
      updatedAt: new Date().toISOString(),
      gastos: collectLines(fichaGastos),
      ventas: collectLines(fichaVentas),
    })
    toast.success(`Ficha de ${fichaItem.ref} guardada`)
  }

  /** Cierre desde la ficha: guarda renglones + marca facturada en un solo upsert. */
  const facturarDesdeFicha = () => {
    if (!fichaItem) return
    markFacturada(fichaItem, fichaInvoice, {
      gastos: collectLines(fichaGastos),
      ventas: collectLines(fichaVentas),
    })
    setFichaItem(null)
  }

  /** Abre la ficha como HTML imprimible (el usuario guarda como PDF desde el diálogo). */
  const exportarFichaPdf = () => {
    if (!fichaItem) return
    try {
      openFichaFacturacionPrint(
        {
          ref: fichaItem.ref,
          cliente: fichaItem.cliente,
          cntr: fichaItem.cntr,
          modeLabel: MODALITY_LABELS[fichaItem.mode],
          eta: fichaItem.eta,
          arrival: fichaItem.arrival,
          transporte: fichaItem.transporte,
          deposito: fichaItem.deposito,
          truckCode: fichaItem.truckCode,
          invoiceNumber: fichaEsFacturada ? fichaRec?.invoiceNumber : undefined,
          invoicedAt: fichaEsFacturada ? fichaRec?.invoicedAt : undefined,
        },
        collectLines(fichaGastos),
        collectLines(fichaVentas),
      )
      toast.success('Vista de impresión abierta — guardá como PDF')
    } catch {
      toast.error('No se pudo abrir la vista de impresión (¿popup bloqueado?)')
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt size={24} weight="fill" className="text-primary" />
            Facturación
          </h2>
          <p className="text-sm text-muted-foreground">
            Todas las modalidades: FCL · LCL · aéreo · terrestre. Una carga entra sola a Pendientes al llegar a fiscal / entregarse.
          </p>
        </div>
      </div>

      {/* Sub-tab chips */}
      <div className="flex flex-wrap gap-2">
        <SubTabChip
          label="Pendientes"
          count={buckets.pendientes.length}
          tone="amber"
          active={subTab === 'pendientes'}
          onClick={() => setSubTab('pendientes')}
        />
        <SubTabChip
          label="Facturadas (este mes)"
          count={facturadasMonth.length}
          tone="green"
          active={subTab === 'facturadas'}
          onClick={() => setSubTab('facturadas')}
        />
        <SubTabChip
          label="No aplica"
          count={buckets.noAplica.length}
          tone="muted"
          active={subTab === 'no_aplica'}
          onClick={() => setSubTab('no_aplica')}
        />
      </div>

      {/* Filtro por tipo de carga + búsqueda */}
      <div className="flex items-center gap-2 flex-wrap">
        {([['all', 'Todas'], ['fcl', 'FCL'], ['lcl', 'LCL'], ['air', 'Aéreo'], ['land', 'Terrestre']] as ['all' | Modality, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setModeFilter(id)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 border text-xs transition-all hover:shadow-sm ${
              modeFilter === id ? 'bg-primary/5 border-primary/40 font-medium' : 'bg-card border-border'
            }`}
          >
            {id !== 'all' && <span className="w-2 h-2 rounded-sm" style={{ background: MODALITY_COLORS[id as Modality] }} />}
            {label}
            <span className="text-[10px] text-muted-foreground tabular-nums">{modeCounts[id] ?? 0}</span>
          </button>
        ))}
        <div className="relative max-w-md flex-1 min-w-[200px]">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar REF, cliente, nº factura…"
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* List */}
      <Card>
        <CardContent className="p-0 overflow-x-auto max-h-[70vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {subTab === 'pendientes'
                ? '🎉 No hay cargas pendientes de facturar'
                : subTab === 'facturadas'
                ? 'Sin cargas facturadas todavía'
                : 'Ninguna carga marcada como "no aplica"'}
            </div>
          ) : (
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 z-10 bg-muted text-xs uppercase text-muted-foreground">
                <tr>
                  <Th k="ref">Ref</Th>
                  <Th k="tipo">Tipo</Th>
                  <Th k="cliente">Cliente</Th>
                  <Th k="arrival">Llegada</Th>
                  {subTab === 'pendientes' && <Th k="aging">Días pend.</Th>}
                  {subTab === 'facturadas' && <Th k="factura">Nº Factura</Th>}
                  {subTab === 'facturadas' && <Th k="facturada">Facturada</Th>}
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((item, i) => (
                  <BillingRow
                    key={`${item.mode}-${item.ref}-${i}`}
                    item={item}
                    record={billingMap.get(item.ref)}
                    subTab={subTab}
                    onFicha={() => openFicha(item)}
                    onUndo={() => undoFacturada(item)}
                    onNoAplica={() => markNoAplica(item)}
                    onRestore={() => restore(item)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Ficha de facturación — gastos (compra) vs venta + cierre facturada */}
      <Dialog open={!!fichaItem} onOpenChange={(open) => !open && setFichaItem(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt size={20} weight="fill" className="text-primary" />
              Ficha de facturación — {fichaItem?.ref}
            </DialogTitle>
          </DialogHeader>

          {fichaItem && (
            <div className="space-y-4">
              {/* Cabecera: datos de la carga */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 rounded-lg border bg-muted/30 p-3">
                <FichaDato label="Cliente" value={fichaItem.cliente || '—'} className="col-span-2" />
                <FichaDato label="Modalidad" value={MODALITY_LABELS[fichaItem.mode]} />
                <FichaDato label="CNTR" value={fichaItem.cntr || '—'} />
                <FichaDato label="ETA MVD" value={fichaItem.eta ? fmtDateDMY(fichaItem.eta) : '—'} />
                <FichaDato label="Llegada a fiscal" value={fichaItem.arrival ? fmtDate(fichaItem.arrival) : '—'} />
                <FichaDato label="Transporte" value={fichaItem.transporte || '—'} />
                <FichaDato label="Depósito" value={fichaItem.deposito || '—'} />
                {fichaItem.truckCode && <FichaDato label="Camión" value={fichaItem.truckCode} />}
                {fichaEsFacturada && (
                  <FichaDato
                    label="Factura"
                    value={`${fichaRec?.invoiceNumber || 's/nº'}${fichaRec?.invoicedAt ? ` · ${fmtDate(new Date(fichaRec.invoicedAt))}` : ''}`}
                  />
                )}
              </div>

              {/* Dos columnas: GASTOS (compra) | VENTA — apiladas en mobile */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FichaColumn title="Gastos (compra)" rows={fichaGastos} onChange={setFichaGastos} />
                <FichaColumn title="Venta" rows={fichaVentas} onChange={setFichaVentas} />
              </div>

              {/* Resultado: VENTA − GASTOS */}
              <div
                className={`rounded-lg border p-3 flex items-center justify-between gap-4 ${
                  fichaResultado >= 0 ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
                }`}
              >
                <span className={`text-sm font-medium ${fichaResultado >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                  Resultado (venta − gastos)
                </span>
                <span className={`text-2xl font-bold tabular-nums ${fichaResultado >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  USD {fmtMoneyUY(fichaResultado)}
                </span>
              </div>

              {/* Cierre: marcar facturada (solo si todavía no lo está) */}
              {!fichaEsFacturada && (
                <div className="rounded-lg border p-3 flex flex-col sm:flex-row sm:items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">Nº de factura (opcional)</Label>
                    <Input
                      value={fichaInvoice}
                      onChange={e => setFichaInvoice(e.target.value)}
                      placeholder="Ej: A-0012345"
                      className="h-9"
                      onKeyDown={e => { if (e.key === 'Enter') facturarDesdeFicha() }}
                    />
                  </div>
                  <Button onClick={facturarDesdeFicha} className="h-9">
                    <CheckCircle size={16} className="mr-1.5" weight="fill" />
                    Marcar facturada
                  </Button>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setFichaItem(null)}>Cerrar</Button>
            <Button variant="outline" onClick={exportarFichaPdf}>
              <FilePdf size={16} className="mr-1.5" />
              Exportar PDF
            </Button>
            <Button variant="outline" onClick={guardarFicha}>
              <FloppyDisk size={16} className="mr-1.5" />
              Guardar ficha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Ficha: dato de cabecera ──

function FichaDato({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium truncate" title={value}>{value}</div>
    </div>
  )
}

// ── Ficha: columna de renglones (concepto | monto USD | quitar) ──

function FichaColumn({
  title,
  rows,
  onChange,
}: {
  title: string
  rows: FichaLineDraft[]
  onChange: (rows: FichaLineDraft[]) => void
}) {
  const subtotal = sumDrafts(rows)
  const setRow = (i: number, patch: Partial<FichaLineDraft>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const removeRow = (i: number) => {
    const next = rows.filter((_, j) => j !== i)
    onChange(next.length > 0 ? next : [{ ...EMPTY_DRAFT }])
  }

  return (
    <div className="rounded-lg border flex flex-col">
      <div className="px-3 py-2 border-b bg-muted/50 text-xs font-semibold uppercase tracking-wide">
        {title}
      </div>
      <div className="p-3 space-y-2 flex-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={r.concepto}
              onChange={e => setRow(i, { concepto: e.target.value })}
              placeholder="Concepto"
              className="h-9 flex-1 min-w-0"
            />
            <Input
              value={r.montoStr}
              onChange={e => setRow(i, { montoStr: e.target.value })}
              placeholder="0,00"
              inputMode="decimal"
              className="h-9 w-24 text-right tabular-nums"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-9 w-8 p-0 text-muted-foreground shrink-0"
              onClick={() => removeRow(i)}
              aria-label="Quitar renglón"
            >
              <X size={14} />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="h-8 w-full text-xs"
          onClick={() => onChange([...rows, { ...EMPTY_DRAFT }])}
        >
          <Plus size={14} className="mr-1" />
          Agregar renglón
        </Button>
      </div>
      <div className="px-3 py-2 border-t flex items-center justify-between text-sm bg-muted/20">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="font-semibold tabular-nums">USD {fmtMoneyUY(subtotal)}</span>
      </div>
    </div>
  )
}

// ── Row ──

function BillingRow({
  item,
  record,
  subTab,
  onFicha,
  onUndo,
  onNoAplica,
  onRestore,
}: {
  item: BillableItem
  record?: BillingRecord
  subTab: SubTab
  onFicha: () => void
  onUndo: () => void
  onNoAplica: () => void
  onRestore: () => void
}) {
  const days = daysSince(item.arrival)
  const aged = days >= AGING_THRESHOLD_DAYS

  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="px-3 py-2 font-medium">{item.ref}</td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-1.5">
          <Badge variant="outline" className="h-5 text-[9px]" style={{ color: MODALITY_COLORS[item.mode], borderColor: MODALITY_COLORS[item.mode] }}>
            {MODALITY_LABELS[item.mode]}
          </Badge>
          {item.truckCode && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground" title={`Llegó consolidada en el camión ${item.truckCode}`}>
              <TruckIcon size={11} weight="fill" className="text-primary" />
              {item.truckCode}
            </span>
          )}
        </span>
      </td>
      <td className="px-3 py-2">{item.cliente || '—'}</td>
      <td className="px-3 py-2 text-muted-foreground">{item.arrival ? fmtDate(item.arrival) : '—'}</td>

      {subTab === 'pendientes' && (
        <td className="px-3 py-2">
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${aged ? 'text-destructive' : 'text-muted-foreground'}`}>
            {aged ? <Warning size={12} weight="fill" /> : <Clock size={12} />}
            {days}d pendiente
          </span>
        </td>
      )}

      {subTab === 'facturadas' && (
        <td className="px-3 py-2 text-xs">{record?.invoiceNumber || <span className="text-muted-foreground">—</span>}</td>
      )}
      {subTab === 'facturadas' && (
        <td className="px-3 py-2 text-xs text-muted-foreground">
          {record?.invoicedAt ? fmtDate(new Date(record.invoicedAt)) : '—'}
        </td>
      )}

      <td className="px-3 py-2">
        <div className="flex items-center gap-1 justify-end">
          {subTab === 'pendientes' && (
            <>
              <Button size="sm" className="h-7" onClick={onFicha}>
                <Receipt size={14} className="mr-1" weight="fill" />
                Facturar
                {hasFichaData(record) && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-primary-foreground/70" title="Tiene ficha cargada" />}
              </Button>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={onNoAplica}>
                      <Prohibit size={14} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">No aplica facturación</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
          {subTab === 'facturadas' && (
            <>
              <Button size="sm" variant="outline" className="h-7" onClick={onFicha}>
                <Receipt size={14} className="mr-1" />
                Ver ficha
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={onUndo}>
                <ArrowCounterClockwise size={14} className="mr-1" />
                Deshacer
              </Button>
            </>
          )}
          {subTab === 'no_aplica' && (
            <Button size="sm" variant="outline" className="h-7" onClick={onRestore}>
              <ArrowCounterClockwise size={14} className="mr-1" />
              Restaurar
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
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

function fmtDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0')
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}/${m}/${d.getFullYear()}`
}
