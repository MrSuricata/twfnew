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
  Receipt,
  MagnifyingGlass,
  CheckCircle,
  ArrowCounterClockwise,
  Prohibit,
  Clock,
  Warning,
  Truck as TruckIcon,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import type { Truck, TruckLoad } from '@/lib/truckTypes'
import type { DbShipment } from '@/lib/operationsTypes'
import { MODALITY_LABELS, MODALITY_COLORS } from '@/lib/operationsTypes'
import type { BillableItem, BillingRecord } from '@/lib/billingTypes'
import {
  AGING_THRESHOLD_DAYS,
  buildBillableItems,
  daysSince,
  indexBilling,
  isInvoicedThisMonth,
} from '@/lib/billingTypes'

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

export default function BillingManagement({ shipments, dbShipments = [], trucks = [], truckLoads = [], billing, onUpdateBilling, onClearBilling }: BillingManagementProps) {
  const [subTab, setSubTab] = useState<SubTab>('pendientes')
  const [search, setSearch] = useState('')
  const [invoiceDialog, setInvoiceDialog] = useState<BillableItem | null>(null)
  const [invoiceNumber, setInvoiceNumber] = useState('')

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

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return activeList
    return activeList.filter(s => {
      const inv = billingMap.get(s.ref)?.invoiceNumber || ''
      const blob = `${s.ref} ${s.cliente} ${inv}`.toLowerCase()
      return blob.includes(q)
    })
  }, [activeList, search, billingMap])

  // ── Actions (por ref — vale para cualquier modalidad) ──
  const markFacturada = (item: BillableItem, invNumber: string) => {
    if (!onUpdateBilling) return
    onUpdateBilling({
      ref: item.ref,
      status: 'facturada',
      invoiceNumber: invNumber.trim(),
      invoicedAt: new Date().toISOString(),
      invoicedBy: INVOICED_BY,
      updatedAt: new Date().toISOString(),
    })
    toast.success(`${item.ref} marcada como facturada`)
  }

  const undoFacturada = (item: BillableItem) => {
    // Removing the overlay returns it to the derived "pendiente" state.
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
    })
    toast.success(`${item.ref} marcada como "no aplica"`)
  }

  const restore = (item: BillableItem) => {
    if (onClearBilling) {
      onClearBilling(item.ref)
      toast.success(`${item.ref} restaurada`)
    }
  }

  const openInvoiceDialog = (item: BillableItem) => {
    setInvoiceNumber('')
    setInvoiceDialog(item)
  }

  const confirmInvoice = () => {
    if (invoiceDialog) markFacturada(invoiceDialog, invoiceNumber)
    setInvoiceDialog(null)
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

      {/* Search */}
      <div className="relative max-w-md">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar REF, cliente, nº factura…"
          className="pl-9 h-9"
        />
      </div>

      {/* List */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {subTab === 'pendientes'
                ? '🎉 No hay cargas pendientes de facturar'
                : subTab === 'facturadas'
                ? 'Sin cargas facturadas todavía'
                : 'Ninguna carga marcada como "no aplica"'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Ref</th>
                  <th className="text-left px-3 py-2">Tipo</th>
                  <th className="text-left px-3 py-2">Cliente</th>
                  <th className="text-left px-3 py-2">Llegada</th>
                  {subTab === 'pendientes' && <th className="text-left px-3 py-2">Aging</th>}
                  {subTab === 'facturadas' && <th className="text-left px-3 py-2">Nº Factura</th>}
                  {subTab === 'facturadas' && <th className="text-left px-3 py-2">Facturada</th>}
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((item, i) => (
                  <BillingRow
                    key={`${item.mode}-${item.ref}-${i}`}
                    item={item}
                    record={billingMap.get(item.ref)}
                    subTab={subTab}
                    onInvoice={() => openInvoiceDialog(item)}
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

      {/* Invoice number dialog */}
      <Dialog open={!!invoiceDialog} onOpenChange={(open) => !open && setInvoiceDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Facturar {invoiceDialog?.ref}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Nº de factura (opcional)</Label>
            <Input
              value={invoiceNumber}
              onChange={e => setInvoiceNumber(e.target.value)}
              placeholder="Ej: A-0012345"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') confirmInvoice() }}
            />
            <p className="text-xs text-muted-foreground">
              Podés dejarlo vacío y completarlo después. La carga queda marcada como facturada igual.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceDialog(null)}>Cancelar</Button>
            <Button onClick={confirmInvoice}>
              <CheckCircle size={16} className="mr-1.5" weight="fill" />
              Marcar facturada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Row ──

function BillingRow({
  item,
  record,
  subTab,
  onInvoice,
  onUndo,
  onNoAplica,
  onRestore,
}: {
  item: BillableItem
  record?: BillingRecord
  subTab: SubTab
  onInvoice: () => void
  onUndo: () => void
  onNoAplica: () => void
  onRestore: () => void
}) {
  const days = daysSince(item.arrival)
  const aged = days >= AGING_THRESHOLD_DAYS

  return (
    <tr className="hover:bg-muted/30">
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
              <Button size="sm" className="h-7" onClick={onInvoice}>
                <CheckCircle size={14} className="mr-1" weight="fill" />
                Facturada
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={onNoAplica} title="No se factura">
                <Prohibit size={14} />
              </Button>
            </>
          )}
          {subTab === 'facturadas' && (
            <Button size="sm" variant="outline" className="h-7" onClick={onUndo}>
              <ArrowCounterClockwise size={14} className="mr-1" />
              Deshacer
            </Button>
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
