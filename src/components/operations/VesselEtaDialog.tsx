// ─── "ETA por buque" (Operaciones) ───────────────────────────────────────
// Corrige la ETA de un VIAJE entero de una: agrupa las cargas activas por
// buque + cercanía de ETA (vesselGroups: mismo buque en enero y en mayo son
// DOS viajes — el histórico no se toca), deja marcar/desmarcar cargas y aplica
// la nueva ETA a las seleccionadas vía onPatch (buildEtaShiftPatch: columna
// eta + ETA_OP propagada al array, todo lo demás intacto). Deshacer restaura
// las ETAs previas exactas de cada carga.

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Boat, CaretDown, CaretRight, MagnifyingGlass } from '@phosphor-icons/react'
import type { UnifiedOperation } from '@/lib/operationsTypes'
import { groupByVoyage, buildEtaShiftPatch, type VoyageGroup } from '@/lib/vesselGroups'
import { fmtDateDMY } from '@/lib/format'

const MS_PER_DAY = 86_400_000
/** Un viaje se considera "vigente" si su ETA más tardía no pasó hace más de 14 días. */
const VIGENTE_GRACE_DAYS = 14

interface VesselEtaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Cargas candidatas (el caller pasa SOLO las editables: source db, no read-only, activas). */
  ops: UnifiedOperation[]
  /** handlePatchShipment de App (optimista + revert). */
  onPatch: (id: string, fields: Record<string, unknown>) => void
}

/** Clave estable de un grupo para el estado de expansión/selección. */
const groupKey = (g: VoyageGroup<UnifiedOperation>) => `${g.buque}|${g.etaMin}`

export default function VesselEtaDialog({ open, onOpenChange, ops, onPatch }: VesselEtaDialogProps) {
  const [search, setSearch] = useState('')
  const [soloVigentes, setSoloVigentes] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  // Selección por grupo: set de uids EXCLUIDOS (default = todas seleccionadas).
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [newEta, setNewEta] = useState('')

  const groups = useMemo(() => groupByVoyage(ops), [ops])

  const visible = useMemo(() => {
    const cutoff = Date.now() - VIGENTE_GRACE_DAYS * MS_PER_DAY
    const q = search.trim().toUpperCase()
    return groups.filter(g => {
      if (q && !g.buque.includes(q)) return false
      if (soloVigentes && !g.sinEta) {
        const d = new Date(`${g.etaMax}T00:00:00`)
        if (isFinite(d.getTime()) && d.getTime() < cutoff) return false
      }
      return true
    })
  }, [groups, search, soloVigentes])

  const toggleExpand = (key: string) => {
    setExpanded(cur => (cur === key ? null : key))
    setExcluded(new Set()) // al cambiar de viaje, arrancar con todas marcadas
    setNewEta('')
  }

  const toggleOp = (uid: string) => {
    setExcluded(cur => {
      const next = new Set(cur)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }

  const applyToGroup = (g: VoyageGroup<UnifiedOperation>) => {
    const selected = g.ops.filter(o => !excluded.has(o.uid) && o.dbId)
    if (!newEta || selected.length === 0) return
    // Snapshot para Deshacer: la ETA y el array previos de CADA carga.
    const prev = selected.map(o => ({
      dbId: o.dbId!,
      patch: o.operativas && o.operativas.length > 0
        ? { eta: o.eta, operativas: o.operativas }
        : { eta: o.eta },
    }))
    for (const o of selected) onPatch(o.dbId!, buildEtaShiftPatch(o, newEta))
    toast.success(`ETA ${fmtDateDMY(newEta)} aplicada a ${selected.length} carga${selected.length === 1 ? '' : 's'} — ${g.buque}`, {
      action: {
        label: 'Deshacer',
        onClick: () => { for (const p of prev) onPatch(p.dbId, p.patch) },
      },
      duration: 8000,
    })
    setNewEta('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boat size={20} weight="fill" className="text-primary" /> ETA por buque
          </DialogTitle>
          <DialogDescription>
            Elegí el viaje, revisá qué cargas entran y aplicá la nueva ETA a todas de una.
            El mismo buque en fechas lejanas cuenta como viajes separados — el histórico no se toca.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar buque…"
              className="h-9 pl-8"
              aria-label="Buscar buque"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none shrink-0">
            <Switch checked={soloVigentes} onCheckedChange={setSoloVigentes} aria-label="Solo viajes vigentes" />
            Solo vigentes
          </label>
        </div>

        {visible.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            {groups.length === 0
              ? 'No hay cargas activas con buque asignado.'
              : search.trim()
                ? `Ningún buque coincide con «${search.trim()}».`
                : 'No hay viajes vigentes — activá «Solo vigentes» en off para ver el histórico.'}
          </div>
        ) : (
          <div className="max-h-[46vh] overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {visible.map(g => {
              const key = groupKey(g)
              const isOpen = expanded === key
              const selectedCount = g.ops.filter(o => !excluded.has(o.uid)).length
              return (
                <div key={key}>
                  <button
                    type="button"
                    onClick={() => toggleExpand(key)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
                  >
                    {isOpen ? <CaretDown size={13} className="text-muted-foreground shrink-0" /> : <CaretRight size={13} className="text-muted-foreground shrink-0" />}
                    <span className="text-sm font-semibold truncate flex-1 min-w-0">{g.buque}</span>
                    <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                      {g.sinEta
                        ? 'sin ETA'
                        : g.etaMin === g.etaMax
                          ? `ETA ${fmtDateDMY(g.etaMin)}`
                          : `ETA ${fmtDateDMY(g.etaMin)} – ${fmtDateDMY(g.etaMax)}`}
                    </span>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-px text-[10px] font-bold tabular-nums">
                      {g.ops.length}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-3 pb-3 space-y-2 bg-muted/20">
                      <div className="rounded-md border border-border/60 bg-background divide-y divide-border/60 max-h-44 overflow-y-auto">
                        {g.ops.map(o => (
                          <label key={o.uid} className="flex items-center gap-2.5 px-2.5 py-1.5 text-sm cursor-pointer hover:bg-muted/30">
                            <input
                              type="checkbox"
                              checked={!excluded.has(o.uid)}
                              onChange={() => toggleOp(o.uid)}
                              className="accent-primary h-3.5 w-3.5 shrink-0"
                              aria-label={`Incluir ${o.ref}`}
                            />
                            <span className="font-mono text-xs font-semibold shrink-0 min-w-[60px]">{o.ref}</span>
                            <span className="text-xs text-foreground/80 truncate flex-1 min-w-0">{o.cliente || '—'}</span>
                            <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                              {fmtDateDMY(o.eta) || o.eta || 'sin ETA'}
                            </span>
                          </label>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          value={newEta}
                          onChange={e => setNewEta(e.target.value)}
                          aria-label="Nueva ETA del viaje"
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <button
                          type="button"
                          disabled={!newEta || selectedCount === 0}
                          onClick={() => applyToGroup(g)}
                          className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
                        >
                          Aplicar a {selectedCount} carga{selectedCount === 1 ? '' : 's'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
