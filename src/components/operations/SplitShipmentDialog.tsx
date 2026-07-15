// ─── Dividir una carga en A/B ────────────────────────────────────────────
// Reparte los contenedores entre las dos partes (2/2, 1/3…) y opcionalmente
// COMPARTE uno (un contenedor entero + parte de otro: kilos/bultos/m³). Para
// cargas sin detalle por contenedor (LCL) se tipea directo qué se lleva B.
// La original queda como parte A (conserva checks y pagos) y se renombra con
// el PIN por el flujo existente; B es una fila nueva con el mismo viaje.
import { useMemo, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ArrowsSplit } from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { DbShipment, UnifiedOperation } from '@/lib/operationsTypes'
import { parseCntr } from '@/lib/cntrUtils'
import { planSplit, validateSplit, type SplitInput } from '@/lib/splitShipment'
import { fmtNum } from '@/lib/format'

interface SplitShipmentDialogProps {
  /** Carga a dividir (null = diálogo cerrado). */
  op: UnifiedOperation | null
  /** Fila DB de esa carga (para heredar todos los campos en la parte B). */
  dbShipment: DbShipment | null
  onClose: () => void
  onCreate?: (row: DbShipment) => boolean | void
  onPatch?: (id: string, fields: Record<string, unknown>) => void
  onRenameRef?: (op: UnifiedOperation, newRef: string, pin: string) => Promise<void>
}

const parseMonto = (s: string): number => {
  const n = parseFloat((s || '').trim().replace(/\./g, m => m).replace(',', '.'))
  return isFinite(n) && n > 0 ? n : 0
}

export default function SplitShipmentDialog({ op, dbShipment, onClose, onCreate, onPatch, onRenameRef }: SplitShipmentDialogProps) {
  const cntrs = useMemo(() => (dbShipment ? parseCntr(dbShipment.contenedor) : []), [dbShipment])
  const [refA, setRefA] = useState('')
  const [refB, setRefB] = useState('')
  const [pin, setPin] = useState('')
  const [lado, setLado] = useState<Record<string, 'A' | 'B'>>({})
  // Contenedores COMPARTIDOS (pueden ser varios): cntr → cuánto se lleva B.
  const [shareds, setShareds] = useState<Record<string, { pkgs: string; kg: string; m3: string }>>({})
  const [tPkgs, setTPkgs] = useState('')
  const [tKg, setTKg] = useState('')
  const [tM3, setTM3] = useState('')
  const [busy, setBusy] = useState(false)

  // Prefill al abrir (op cambia de null a la carga).
  useEffect(() => {
    if (!op) return
    setRefA(`${op.ref} A`)
    setRefB(`${op.ref} B`)
    setPin('')
    setLado({})
    setShareds({})
    setTPkgs(''); setTKg(''); setTM3('')
  }, [op])

  const input: SplitInput | null = useMemo(() => {
    if (!dbShipment) return null
    const cntrsB = cntrs.filter(c => lado[c] === 'B' && !shareds[c])
    const parciales = Object.entries(shareds).map(([cntr, v]) => ({
      cntr, pkgsB: parseMonto(v.pkgs), kgB: parseMonto(v.kg), m3B: parseMonto(v.m3),
    }))
    return {
      original: dbShipment,
      refB: refB.trim(),
      cntrsB,
      parciales: parciales.length > 0 ? parciales : null,
      totalesB: cntrs.length === 0
        ? { pkgs: parseMonto(tPkgs), kg: parseMonto(tKg), m3: parseMonto(tM3) }
        : null,
    }
  }, [dbShipment, cntrs, lado, refB, shareds, tPkgs, tKg, tM3])

  const problema = input ? validateSplit(input) : 'Sin carga'
  const preview = useMemo(() => {
    if (!input || problema) return null
    try { return planSplit(input).resumen } catch { return null }
  }, [input, problema])

  const confirmar = async () => {
    if (!op || !dbShipment || !input || busy) return
    const err = validateSplit(input)
    if (err) { toast.error(err); return }
    setBusy(true)
    try {
      const plan = planSplit(input)
      // 1. Crear la parte B (si la ref está duplicada y el usuario cancela, se aborta todo).
      if (onCreate?.(plan.rowB) === false) return
      // 2. Ajustar la original (contenedores/kilos/bultos que quedan en A).
      onPatch?.(dbShipment.id, plan.patchA)
      // 3. Renombrar la original a "X A" (PIN + cascada server-side).
      const nuevaRefA = refA.trim()
      if (nuevaRefA && nuevaRefA !== op.ref && onRenameRef) {
        try {
          await onRenameRef(op, nuevaRefA, pin)
        } catch (e) {
          toast.error(
            `La parte B quedó creada y la carga ajustada, pero NO se pudo renombrar la original a ${nuevaRefA}: ` +
            `${(e as Error)?.message || 'PIN incorrecto'}. Renombrala desde el panel (lápiz junto a la REF).`,
          )
          onClose()
          return
        }
      }
      toast.success(`Carga dividida: ${nuevaRefA || op.ref} y ${refB.trim()}`)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!op} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowsSplit size={20} /> Dividir {op?.ref} en A / B
          </DialogTitle>
          <DialogDescription>
            La parte A es esta misma carga (conserva checks y pagos); la B se crea nueva con el mismo viaje.
          </DialogDescription>
        </DialogHeader>

        {op && dbShipment && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Ref parte A (la original)</Label>
                <Input value={refA} onChange={e => setRefA(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Ref parte B (nueva)</Label>
                <Input value={refB} onChange={e => setRefB(e.target.value)} className="h-9" />
              </div>
            </div>

            {cntrs.length > 0 ? (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">¿Qué contenedor va a cada parte?</Label>
                <div className="rounded-md border divide-y">
                  {cntrs.map(c => {
                    const compartido = !!shareds[c]
                    const side = compartido ? 'COMP' : (lado[c] ?? 'A')
                    return (
                      <div key={c} className="flex items-center gap-2 px-2.5 py-1.5">
                        <span className="font-mono text-xs flex-1">{c}</span>
                        {(['A', 'B'] as const).map(s => (
                          <button
                            key={s}
                            type="button"
                            disabled={compartido}
                            onClick={() => setLado(prev => ({ ...prev, [c]: s }))}
                            className={`rounded px-2.5 py-0.5 text-xs border ${
                              side === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border'
                            } ${compartido ? 'opacity-40' : ''}`}
                          >
                            {s}
                          </button>
                        ))}
                        <button
                          type="button"
                          title="Compartir: parte del contenido de este contenedor se va a B (podés compartir varios)"
                          onClick={() => {
                            setShareds(prev => {
                              const next = { ...prev }
                              if (next[c]) delete next[c]
                              else next[c] = { pkgs: '', kg: '', m3: '' }
                              return next
                            })
                            setLado(prev => ({ ...prev, [c]: 'A' }))
                          }}
                          className={`rounded px-2 py-0.5 text-xs border ${
                            compartido ? 'bg-amber-100 border-amber-400 text-amber-900 font-medium' : 'bg-card border-dashed border-border text-muted-foreground'
                          }`}
                        >
                          compartir
                        </button>
                      </div>
                    )
                  })}
                </div>
                {Object.keys(shareds).map(c => (
                  <div key={c} className="rounded-md border border-amber-200 bg-amber-50/60 p-2.5 space-y-1.5">
                    <p className="text-xs text-amber-800">
                      Del <span className="font-mono">{c}</span>, ¿cuánto se lleva la parte B? (el resto queda en A)
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <Input inputMode="decimal" placeholder="Bultos" value={shareds[c].pkgs} onChange={e => setShareds(prev => ({ ...prev, [c]: { ...prev[c], pkgs: e.target.value } }))} className="h-8 text-sm" />
                      <Input inputMode="decimal" placeholder="Kg" value={shareds[c].kg} onChange={e => setShareds(prev => ({ ...prev, [c]: { ...prev[c], kg: e.target.value } }))} className="h-8 text-sm" />
                      <Input inputMode="decimal" placeholder="M³" value={shareds[c].m3} onChange={e => setShareds(prev => ({ ...prev, [c]: { ...prev[c], m3: e.target.value } }))} className="h-8 text-sm" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  ¿Qué se lleva la parte B? (la carga tiene {fmtNum(op.pkgs)} bultos · {fmtNum(Math.round(op.kg))} kg · {op.m3} m³)
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  <Input inputMode="decimal" placeholder="Bultos" value={tPkgs} onChange={e => setTPkgs(e.target.value)} className="h-8 text-sm" />
                  <Input inputMode="decimal" placeholder="Kg" value={tKg} onChange={e => setTKg(e.target.value)} className="h-8 text-sm" />
                  <Input inputMode="decimal" placeholder="M³" value={tM3} onChange={e => setTM3(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
            )}

            {preview && (
              <div className="rounded-md border bg-muted/30 p-2.5 text-xs space-y-1">
                <p><strong>{refA.trim() || `${op.ref} A`}</strong>: {preview.a.cntrs.length ? `${preview.a.cntrs.length} cntr · ` : ''}{fmtNum(preview.a.pkgs)} bultos · {fmtNum(Math.round(preview.a.kg))} kg · {preview.a.m3} m³</p>
                <p><strong>{refB.trim()}</strong>: {preview.b.cntrs.length ? `${preview.b.cntrs.length} cntr · ` : ''}{fmtNum(preview.b.pkgs)} bultos · {fmtNum(Math.round(preview.b.kg))} kg · {preview.b.m3} m³</p>
              </div>
            )}
            {!preview && problema && <p className="text-xs text-amber-700">{problema}</p>}

            <div className="flex items-end justify-between gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">PIN (para renombrar la original)</Label>
                <Input value={pin} onChange={e => setPin(e.target.value)} type="password" placeholder="PIN" className="h-9 w-24" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Cancelar</Button>
                <Button onClick={confirmar} disabled={!!problema || busy} className="gap-1.5">
                  <ArrowsSplit size={16} /> {busy ? 'Dividiendo…' : 'Dividir carga'}
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Los checks documentarios y los montos de pago quedan en la parte A — cargale a B lo suyo después si corresponde.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
