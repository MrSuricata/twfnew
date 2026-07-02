import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  EnvelopeSimple,
  Phone,
  WhatsappLogo,
  MagnifyingGlass,
  PaperPlaneTilt,
  Trash,
  Prohibit,
  CheckCircle,
  XCircle,
  Clock,
  Package,
  MapPin,
  Boat,
  Truck,
  Airplane,
  Plus,
  ChatCircleText,
  CaretDoubleLeft,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { copyToClipboard } from '@/lib/clipboard'
import type { QuoteFormData, QuoteStatus, QuoteNote } from '@/lib/quotationTypes'
import { getConvertedRef } from '@/lib/quotationTypes'
import { buildMailtoLink } from '@/lib/quoteTemplates'
import { downloadQuotesCsv } from '@/lib/quoteExport'
import { getBrand } from '@/lib/brand'
import { fmtHorasAtraso } from '@/lib/format'
import { DownloadSimple, ArrowsClockwise } from '@phosphor-icons/react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

interface QuotesManagementProps {
  quotes: QuoteFormData[]
  onUpdateQuotes: (quotes: QuoteFormData[]) => void
}

type FilterChip =
  | 'all'
  | 'pending'
  | 'overdue'
  | 'responded'
  | 'won'
  | 'lost'
  | 'spam'

const STATUS_LABELS: Record<QuoteStatus, string> = {
  pending: 'Pendiente',
  responded: 'Respondida',
  won: 'Ganada',
  lost: 'Perdida',
  spam: 'Spam',
}

const CARGO_TYPE_ICON: Record<string, typeof Boat> = {
  maritime: Boat,
  ocean: Boat,
  marítima: Boat,
  land: Truck,
  terrestre: Truck,
  air: Airplane,
  aérea: Airplane,
  multimodal: Package,
}

function getCargoIcon(cargoType: string) {
  const k = cargoType.toLowerCase()
  for (const [needle, Icon] of Object.entries(CARGO_TYPE_ICON)) {
    if (k.includes(needle)) return Icon
  }
  return Package
}

const ONE_DAY = 86_400_000

function timeAgo(ts: number) {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'recién'
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)}m`
  if (diff < ONE_DAY) return `hace ${Math.floor(diff / 3_600_000)}h`
  if (diff < 7 * ONE_DAY) return `hace ${Math.floor(diff / ONE_DAY)}d`
  return new Date(ts).toLocaleDateString('es-UY', { day: '2-digit', month: 'short' })
}

function fmtFullDate(ts: number) {
  return new Date(ts).toLocaleString('es-UY', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function QuotesManagement({ quotes, onUpdateQuotes }: QuotesManagementProps) {
  const [filter, setFilter] = useState<FilterChip>('all')
  const [searchText, setSearchText] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newNote, setNewNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [showListMobile, setShowListMobile] = useState(true)
  // "Convertir en operación" dialog state
  const [convertOpen, setConvertOpen] = useState(false)
  const [convertRef, setConvertRef] = useState('')

  // Sort newest first
  const sorted = useMemo(
    () => [...quotes].sort((a, b) => b.timestamp - a.timestamp),
    [quotes]
  )

  // Stats counts
  const stats = useMemo(() => {
    const now = Date.now()
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const overdue = quotes.filter(
      q => q.status === 'pending' && now - q.timestamp > ONE_DAY
    ).length
    const wonThisMonth = quotes.filter(
      q => q.status === 'won' && q.timestamp >= monthStart.getTime()
    ).length
    const total = quotes.length
    const won = quotes.filter(q => q.status === 'won').length
    const closed = quotes.filter(q => q.status === 'won' || q.status === 'lost').length
    const conversion = closed > 0 ? Math.round((won / closed) * 100) : 0
    return {
      total,
      pending: quotes.filter(q => q.status === 'pending').length,
      overdue,
      responded: quotes.filter(q => q.status === 'responded').length,
      wonThisMonth,
      conversion,
    }
  }, [quotes])

  // Filtered list
  const filtered = useMemo(() => {
    let list = sorted
    const now = Date.now()
    switch (filter) {
      case 'pending':
        list = list.filter(q => q.status === 'pending')
        break
      case 'overdue':
        list = list.filter(q => q.status === 'pending' && now - q.timestamp > ONE_DAY)
        break
      case 'responded':
        list = list.filter(q => q.status === 'responded')
        break
      case 'won':
        list = list.filter(q => q.status === 'won')
        break
      case 'lost':
        list = list.filter(q => q.status === 'lost')
        break
      case 'spam':
        list = list.filter(q => q.status === 'spam')
        break
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase()
      list = list.filter(item =>
        item.name?.toLowerCase().includes(q) ||
        item.email?.toLowerCase().includes(q) ||
        item.phone?.toLowerCase().includes(q) ||
        item.origin?.toLowerCase().includes(q) ||
        item.destination?.toLowerCase().includes(q) ||
        item.details?.toLowerCase().includes(q) ||
        item.cargoType?.toLowerCase().includes(q)
      )
    }
    return list
  }, [sorted, filter, searchText])

  // Auto-select first item when list changes and nothing is selected
  useEffect(() => {
    if (!selectedId && filtered.length > 0) {
      setSelectedId(filtered[0].id)
    }
    if (selectedId && !filtered.some(q => q.id === selectedId)) {
      setSelectedId(filtered[0]?.id || null)
    }
  }, [filtered, selectedId])

  const selected = filtered.find(q => q.id === selectedId) || null

  const updateQuote = (id: string, patch: Partial<QuoteFormData>) => {
    onUpdateQuotes(quotes.map(q => (q.id === id ? { ...q, ...patch } : q)))
  }

  const handleStatusChange = (id: string, status: QuoteStatus) => {
    updateQuote(id, { status })
    toast.success(`Estado actualizado: ${STATUS_LABELS[status]}`)
  }

  const handleAddNote = () => {
    if (!selected || !newNote.trim()) return
    const note: QuoteNote = {
      id: `n-${Date.now()}`,
      text: newNote.trim(),
      createdAt: Date.now(),
      createdBy: 'admin',
    }
    updateQuote(selected.id, { notes: [...(selected.notes || []), note] })
    setNewNote('')
    toast.success('Nota agregada')
  }

  const handleDelete = (id: string) => {
    onUpdateQuotes(quotes.filter(q => q.id !== id))
    setConfirmDelete(null)
    setSelectedId(null)
    toast.success('Cotización eliminada')
  }

  const handleReplyEmail = (q: QuoteFormData) => {
    // Open mail client with pre-filled subject + body in client's language.
    // Template lives in src/lib/quoteTemplates.ts.
    window.location.href = buildMailtoLink(q)
    if (q.status === 'pending') {
      updateQuote(q.id, { status: 'responded' })
    }
  }

  const handleExportCsv = () => {
    const list = filtered.length > 0 ? filtered : quotes
    if (list.length === 0) {
      toast.error('No hay cotizaciones para exportar')
      return
    }
    const filterTag = filter === 'all' ? '' : `-${filter}`
    const date = new Date().toISOString().slice(0, 10)
    downloadQuotesCsv(list, `cotizaciones-${getBrand().id}${filterTag}-${date}.csv`)
    toast.success(`Exportadas ${list.length} cotizaciones`)
  }

  const openConvertDialog = (q: QuoteFormData) => {
    // Suggest a REF based on the highest A-number across recent quotes that
    // were already converted. Falls back to A0001 if none.
    let maxN = 0
    quotes.forEach(item => {
      const r = getConvertedRef(item.notes) || ''
      const m = r.match(/^A(\d{3,5})/i)
      if (m) {
        const n = parseInt(m[1], 10)
        if (n > maxN) maxN = n
      }
    })
    const suggested = `A${String(maxN + 1).padStart(4, '0')}`
    setConvertRef(suggested)
    setConvertOpen(true)
  }

  const handleConvertConfirm = () => {
    if (!selected) return
    const ref = convertRef.trim().toUpperCase()
    if (!ref) {
      toast.error('Ingresá un REF válido')
      return
    }
    const note: QuoteNote = {
      id: `n-${Date.now()}`,
      text: ref,
      createdAt: Date.now(),
      createdBy: 'admin',
      kind: 'conversion',
    }
    updateQuote(selected.id, {
      status: 'won',
      notes: [...(selected.notes || []), note],
    })
    setConvertOpen(false)
    toast.success(`Cotización convertida en operación ${ref}`)
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cotizaciones</h2>
          <p className="text-sm text-muted-foreground">
            {stats.total.toLocaleString('es-UY')} cotizaciones recibidas
            {stats.overdue > 0 && (
              <span className="ml-2 text-destructive font-medium">
                · {stats.overdue} sin responder &gt;24h
              </span>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          className="gap-1.5 h-9"
          disabled={quotes.length === 0}
          title="Descargar la lista filtrada como CSV"
        >
          <DownloadSimple size={16} weight="bold" />
          Exportar
        </Button>
      </div>

      {/* ── Stats chips ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <StatChip
          label="Total"
          value={stats.total}
          isActive={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        <StatChip
          label="Pendientes"
          value={stats.pending}
          tone="warning"
          isActive={filter === 'pending'}
          onClick={() => setFilter('pending')}
        />
        <StatChip
          label="Atrasadas"
          value={stats.overdue}
          tone="destructive"
          isActive={filter === 'overdue'}
          onClick={() => setFilter('overdue')}
          icon={<Clock size={14} weight="bold" />}
        />
        <StatChip
          label="Respondidas"
          value={stats.responded}
          tone="info"
          isActive={filter === 'responded'}
          onClick={() => setFilter('responded')}
        />
        <StatChip
          label="Ganadas (mes)"
          value={stats.wonThisMonth}
          tone="success"
          isActive={filter === 'won'}
          onClick={() => setFilter('won')}
        />
        <StatChip
          label="Conversión"
          value={`${stats.conversion}%`}
          tone="neutral"
          subtle
        />
      </div>

      {/* ── Search + extra filters ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Buscar nombre, email, origen, destino, detalle…"
            className="pl-9 h-9"
          />
        </div>
        <button
          type="button"
          onClick={() => setFilter('lost')}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            filter === 'lost'
              ? 'border-muted-foreground/40 bg-muted text-foreground'
              : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
          }`}
        >
          Perdidas
        </button>
        <button
          type="button"
          onClick={() => setFilter('spam')}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            filter === 'spam'
              ? 'border-muted-foreground/40 bg-muted text-foreground'
              : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
          }`}
        >
          Spam
        </button>
      </div>

      {/* ── Split layout ── */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <ChatCircleText size={48} className="mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No hay cotizaciones {filter !== 'all' ? 'con este filtro' : ''}</h3>
            <p className="text-sm text-muted-foreground">
              {filter === 'all'
                ? 'Las cotizaciones que lleguen por el formulario público van a aparecer acá.'
                : 'Probá cambiar el filtro o limpiar la búsqueda.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 min-h-[400px] md:h-[calc(100vh-300px)]">
          {/* List (left) */}
          <div className={`md:col-span-5 ${selected && !showListMobile ? 'hidden md:block' : ''}`}>
            <Card className="h-full">
              <CardContent className="p-0">
                <div className="px-3 py-2 border-b text-[11px] uppercase tracking-wider text-muted-foreground">
                  {filtered.length} {filtered.length === 1 ? 'cotización' : 'cotizaciones'}
                </div>
                <div className="divide-y divide-border max-h-[calc(100vh-340px)] overflow-y-auto">
                  {filtered.map(q => (
                    <QuoteListItem
                      key={q.id}
                      quote={q}
                      isSelected={q.id === selectedId}
                      onClick={() => {
                        setSelectedId(q.id)
                        setShowListMobile(false)
                      }}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detail (right) */}
          <div className={`md:col-span-7 ${!selected || showListMobile ? 'hidden md:block' : ''}`}>
            {selected ? (
              <QuoteDetail
                quote={selected}
                onStatusChange={s => handleStatusChange(selected.id, s)}
                onReply={() => handleReplyEmail(selected)}
                onDelete={() => setConfirmDelete(selected.id)}
                onConvert={() => openConvertDialog(selected)}
                newNote={newNote}
                setNewNote={setNewNote}
                onAddNote={handleAddNote}
                onBackMobile={() => setShowListMobile(true)}
              />
            ) : (
              <Card className="h-full">
                <CardContent className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <ChatCircleText size={48} className="mb-3 opacity-40" />
                  <p>Seleccioná una cotización para ver el detalle</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Convert to operation */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Convertir en operación</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Asigná un REF a esta cotización ganada. Se registra como nota
              de conversión (audit trail) y la cotización queda marcada como
              "Ganada" si todavía no lo está.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="convert-ref">REF de la operación</Label>
              <Input
                id="convert-ref"
                value={convertRef}
                onChange={e => setConvertRef(e.target.value)}
                placeholder="Ej: A7700"
                className="font-mono"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Esto NO crea la operación en la planilla — eso lo hacés vos
                en el Excel/Sheets como siempre. Esta acción solo deja el
                vínculo en la cotización para historial y reportes.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConvertConfirm}
              className="bg-accent text-accent-foreground hover:bg-accent/90 gap-1.5"
            >
              <ArrowsClockwise size={14} />
              Convertir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={open => { if (!open) setConfirmDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cotización?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es permanente. Si en cambio querés ocultarla, marcala como "Spam" o "Perdida".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─────────────────────── Sub-components ───────────────────────

interface StatChipProps {
  label: string
  value: number | string
  tone?: 'neutral' | 'destructive' | 'warning' | 'info' | 'success'
  isActive?: boolean
  subtle?: boolean
  icon?: React.ReactNode
  onClick?: () => void
}

function StatChip({ label, value, tone = 'neutral', isActive, subtle, icon, onClick }: StatChipProps) {
  const isAlert = (tone === 'destructive' || tone === 'warning') && typeof value === 'number' && value > 0
  const numClass = {
    neutral: 'text-foreground',
    destructive: isAlert ? 'text-destructive' : 'text-muted-foreground/60',
    warning: isAlert ? 'text-orange-600' : 'text-muted-foreground/60',
    info: 'text-blue-600',
    success: 'text-green-600',
  }[tone]
  const bgClass = {
    neutral: 'bg-card border-border',
    destructive: isAlert ? 'bg-destructive/[0.04] border-destructive/30' : 'bg-card border-border',
    warning: isAlert ? 'bg-orange-50 border-orange-200' : 'bg-card border-border',
    info: 'bg-card border-border',
    success: 'bg-card border-border',
  }[tone]
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      onClick={onClick}
      className={`rounded-lg px-3 py-2.5 text-left border transition-all ${bgClass} ${
        onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''
      } ${isActive ? 'ring-2 ring-accent ring-offset-1 shadow-sm' : ''} ${subtle ? 'opacity-90' : ''}`}
    >
      <div className={`text-xl font-bold leading-tight tabular-nums flex items-center gap-1.5 ${numClass}`}>
        {icon}
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div>
    </Wrapper>
  )
}

function statusBadgeClasses(s: QuoteStatus) {
  switch (s) {
    case 'pending': return 'bg-orange-100 text-orange-800 border-orange-200'
    case 'responded': return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'won': return 'bg-green-100 text-green-800 border-green-200'
    case 'lost': return 'bg-muted text-muted-foreground border-border'
    case 'spam': return 'bg-destructive/10 text-destructive border-destructive/30'
  }
}

interface QuoteListItemProps {
  quote: QuoteFormData
  isSelected: boolean
  onClick: () => void
}

function QuoteListItem({ quote, isSelected, onClick }: QuoteListItemProps) {
  const Icon = getCargoIcon(quote.cargoType)
  const isOverdue = quote.status === 'pending' && Date.now() - quote.timestamp > ONE_DAY
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-3 hover:bg-muted/50 transition-colors ${
        isSelected ? 'bg-accent/5 border-l-2 border-l-accent -ml-[2px]' : ''
      }`}
    >
      <div className="flex items-start gap-2 mb-1">
        <div className="shrink-0 mt-0.5">
          {quote.status === 'pending' ? (
            <span className={`block w-2 h-2 rounded-full ${isOverdue ? 'bg-destructive' : 'bg-orange-500'}`} />
          ) : (
            <Icon size={14} weight="duotone" className="text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className={`font-semibold text-sm truncate ${quote.status === 'pending' ? '' : 'text-muted-foreground'}`}>
              {quote.name || quote.email}
            </span>
            <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
              {timeAgo(quote.timestamp)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {quote.cargoType} · {quote.origin || '?'} → {quote.destination || '?'}
          </div>
          {quote.details && (
            <div className="text-xs text-muted-foreground/80 truncate mt-0.5 italic">
              "{quote.details}"
            </div>
          )}
          <div className="flex items-center gap-1 mt-1.5">
            <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${statusBadgeClasses(quote.status)}`}>
              {STATUS_LABELS[quote.status]}
            </Badge>
            {isOverdue && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-destructive/10 text-destructive border-destructive/30">
                <Clock size={10} className="mr-0.5" />
                {fmtHorasAtraso((Date.now() - quote.timestamp) / 3_600_000)}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

interface QuoteDetailProps {
  quote: QuoteFormData
  onStatusChange: (s: QuoteStatus) => void
  onReply: () => void
  onDelete: () => void
  onConvert: () => void
  newNote: string
  setNewNote: (v: string) => void
  onAddNote: () => void
  onBackMobile: () => void
}

function QuoteDetail({ quote, onStatusChange, onReply, onDelete, onConvert, newNote, setNewNote, onAddNote, onBackMobile }: QuoteDetailProps) {
  const Icon = getCargoIcon(quote.cargoType)
  const convertedRef = getConvertedRef(quote.notes)
  return (
    <Card className="h-full overflow-y-auto">
      <CardContent className="p-5 space-y-5">
        {/* Mobile back */}
        <button
          type="button"
          onClick={onBackMobile}
          className="md:hidden inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <CaretDoubleLeft size={14} /> Volver al listado
        </button>

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Icon size={20} weight="duotone" className="text-accent" />
              <h3 className="text-lg font-bold truncate">{quote.name || '(sin nombre)'}</h3>
            </div>
            <Badge variant="outline" className={`text-[10px] h-5 ${statusBadgeClasses(quote.status)}`}>
              {STATUS_LABELS[quote.status]}
            </Badge>
            {convertedRef && (
              <Badge variant="outline" className="text-[10px] h-5 ml-1 bg-green-50 text-green-700 border-green-200 font-mono">
                → {convertedRef}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground ml-2">
              · {fmtFullDate(quote.timestamp)}
            </span>
          </div>
        </div>

        {/* Contact chips */}
        <div className="flex flex-wrap gap-1.5">
          {quote.email && (
            <button
              type="button"
              onClick={() => copyToClipboard(quote.email, 'email')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted hover:bg-muted/70 transition-colors text-xs"
            >
              <EnvelopeSimple size={14} />
              <span className="truncate max-w-[200px]">{quote.email}</span>
            </button>
          )}
          {quote.phone && (
            <>
              <button
                type="button"
                onClick={() => copyToClipboard(quote.phone, 'teléfono')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted hover:bg-muted/70 transition-colors text-xs"
              >
                <Phone size={14} />
                {quote.phone}
              </button>
              <a
                href={`https://wa.me/${quote.phone.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-50 text-green-700 hover:bg-green-100 transition-colors text-xs border border-green-200"
              >
                <WhatsappLogo size={14} weight="fill" />
                WhatsApp
              </a>
            </>
          )}
          {quote.language && quote.language !== 'es' && (
            <span className="inline-flex items-center px-2 py-1 rounded-md bg-muted text-[10px] uppercase font-semibold text-muted-foreground tabular-nums">
              {quote.language}
            </span>
          )}
        </div>

        {/* Cargo info */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          <InfoCard icon={<Package size={14} />} label="Tipo de carga" value={quote.cargoType} />
          <InfoCard icon={<MapPin size={14} className="text-blue-600" />} label="Origen" value={quote.origin || '—'} />
          <InfoCard icon={<MapPin size={14} className="text-orange-600" />} label="Destino" value={quote.destination || '—'} />
        </div>

        {/* Details (full message) */}
        {quote.details && (
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Detalle del mensaje</div>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{quote.details}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 items-center pt-2 border-t">
          <Button
            size="sm"
            onClick={onReply}
            className="bg-accent text-accent-foreground hover:bg-accent/90 gap-1.5 h-8"
          >
            <PaperPlaneTilt size={14} />
            Responder
          </Button>

          <Select value={quote.status} onValueChange={v => onStatusChange(v as QuoteStatus)}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pendiente</SelectItem>
              <SelectItem value="responded">Respondida</SelectItem>
              <SelectItem value="won">Ganada</SelectItem>
              <SelectItem value="lost">Perdida</SelectItem>
              <SelectItem value="spam">Spam</SelectItem>
            </SelectContent>
          </Select>

          {quote.status !== 'won' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onStatusChange('won')}
              className="h-8 gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
            >
              <CheckCircle size={14} />
              Ganada
            </Button>
          )}
          {quote.status !== 'lost' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onStatusChange('lost')}
              className="h-8 gap-1.5"
            >
              <XCircle size={14} />
              Perdida
            </Button>
          )}
          {quote.status !== 'spam' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onStatusChange('spam')}
              className="h-8 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/5"
            >
              <Prohibit size={14} />
              Spam
            </Button>
          )}
          {!convertedRef && quote.status !== 'lost' && quote.status !== 'spam' && (
            <Button
              size="sm"
              variant="outline"
              onClick={onConvert}
              className="h-8 gap-1.5 border-accent/40 text-accent hover:bg-accent/5"
              title="Asignar un REF de operación a esta cotización ganada"
            >
              <ArrowsClockwise size={14} />
              Convertir en operación
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            className="h-8 ml-auto text-muted-foreground hover:text-destructive"
          >
            <Trash size={14} />
          </Button>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            Notas internas ({quote.notes?.length || 0})
          </div>
          {(quote.notes || []).length > 0 && (
            <div className="space-y-1.5">
              {(quote.notes || []).slice().reverse().map(n => (
                <div key={n.id} className="rounded-md border-l-2 border-l-accent bg-accent/[0.03] px-3 py-2">
                  <div className="text-xs whitespace-pre-wrap">{n.text}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {n.createdBy} · {fmtFullDate(n.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-start">
            <Textarea
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              placeholder="Agregar una nota interna…"
              className="min-h-[60px] text-sm flex-1"
            />
            <Button
              size="sm"
              onClick={onAddNote}
              disabled={!newNote.trim()}
              className="bg-accent text-accent-foreground hover:bg-accent/90 h-8 mt-1 gap-1"
            >
              <Plus size={14} />
              Nota
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium truncate capitalize" title={value}>{value}</div>
    </div>
  )
}
