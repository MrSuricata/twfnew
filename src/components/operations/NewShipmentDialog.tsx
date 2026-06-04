import { useState } from 'react'
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
import { Plus } from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { DbShipment, Modality, Operator } from '@/lib/operationsTypes'
import { newDbShipment, operatorsForMode, MODALITY_LABELS, MODALITY_COLORS } from '@/lib/operationsTypes'

// ── Quick "new cargo" form ───────────────────────────────────────────────
// Operativos log a cargo in seconds: only the MODE is required; everything else
// is optional and filled in later inline on the grid. Saves to the unified
// `shipments` table (source='web'). FCL created here lives in the web (separate
// from the Google Sheet FCLs).

const MODES: Modality[] = ['lcl', 'air', 'land', 'fcl']

export default function NewShipmentDialog({
  open,
  onOpenChange,
  operators,
  onCreate,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  operators: Operator[]
  onCreate: (row: DbShipment) => void
}) {
  const [mode, setMode] = useState<Modality>('lcl')
  const [ref, setRef] = useState('')
  const [cliente, setCliente] = useState('')
  const [operatorId, setOperatorId] = useState('')
  const [origin, setOrigin] = useState('')
  const [destPort, setDestPort] = useState('')
  const [docNumber, setDocNumber] = useState('')
  const [eta, setEta] = useState('')

  const reset = () => {
    setMode('lcl'); setRef(''); setCliente(''); setOperatorId('')
    setOrigin(''); setDestPort(''); setDocNumber(''); setEta('')
  }

  const eligibleOps = operatorsForMode(operators, mode)

  const save = () => {
    const row = newDbShipment({
      mode,
      ref: ref.trim(),
      cliente: cliente.trim(),
      operator_id: operatorId || null,
      origin: origin.trim(),
      dest_port: destPort.trim(),
      doc_number: docNumber.trim(),
      eta: eta.trim(),
    })
    onCreate(row)
    toast.success(`Carga ${row.ref || MODALITY_LABELS[mode]} agregada — completá el resto en la grilla`)
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus size={20} /> Nueva carga</DialogTitle>
          <DialogDescription>
            Solo el <strong>modo</strong> es obligatorio. El resto lo completás después en la grilla.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Mode — required */}
          <div className="space-y-1.5">
            <Label>Modo *</Label>
            <div className="flex flex-wrap gap-2">
              {MODES.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 border text-sm transition-all ${
                    mode === m ? 'border-primary bg-primary/5 font-semibold' : 'border-border bg-card hover:bg-muted'
                  }`}
                >
                  <span className="w-2 h-2 rounded-sm" style={{ background: MODALITY_COLORS[m] }} />
                  {MODALITY_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ns-ref">Ref</Label>
              <Input id="ns-ref" value={ref} onChange={e => setRef(e.target.value)} placeholder="E198, A7990…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-cli">Cliente / Cnee</Label>
              <Input id="ns-cli" value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Cliente" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-op">Operativo</Label>
              <select
                id="ns-op"
                value={operatorId}
                onChange={e => setOperatorId(e.target.value)}
                className="w-full h-9 px-2 rounded-md border border-border bg-card text-sm"
              >
                <option value="">— sin asignar —</option>
                {eligibleOps.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-doc">BL / AWB / CRT</Label>
              <Input id="ns-doc" value={docNumber} onChange={e => setDocNumber(e.target.value)} placeholder="Documento" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-ori">Origen</Label>
              <Input id="ns-ori" value={origin} onChange={e => setOrigin(e.target.value)} placeholder="Shanghai…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-dst">Destino</Label>
              <Input id="ns-dst" value={destPort} onChange={e => setDestPort(e.target.value)} placeholder="Montevideo…" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="ns-eta">ETA</Label>
              <Input id="ns-eta" type="date" value={eta} onChange={e => setEta(e.target.value)} className="w-44" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }}>Cancelar</Button>
          <Button onClick={save} className="gap-1.5"><Plus size={16} /> Agregar carga</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
