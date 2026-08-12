import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Plus, Trash, PencilSimple, Check, X as XIcon } from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { Operator, Modality } from '@/lib/operationsTypes'
import { MODALITY_LABELS } from '@/lib/operationsTypes'

interface OperatorsManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  operators: Operator[]
  onUpdateOperators: (operators: Operator[]) => void
  onDeleteOperator: (id: string) => void
}

const ALL_MODES: Modality[] = ['fcl', 'lcl', 'air', 'land']
const PALETTE = ['#1e40af', '#2563eb', '#3b82f6', '#0ea5e9', '#8b5cf6', '#a855f7', '#7c3aed', '#9333ea', '#f59e0b', '#16a34a']

function newId() {
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export default function OperatorsManager({ open, onOpenChange, operators, onUpdateOperators, onDeleteOperator }: OperatorsManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Operator | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Operator | null>(null)

  const startNew = () => {
    const d: Operator = { id: newId(), name: '', modes: [], color: PALETTE[operators.length % PALETTE.length], active: true, createdAt: Date.now() }
    setDraft(d); setEditingId(d.id)
  }
  const startEdit = (op: Operator) => { setDraft({ ...op }); setEditingId(op.id) }
  const cancel = () => { setDraft(null); setEditingId(null) }

  const save = () => {
    if (!draft) return
    if (!draft.name.trim()) { toast.error('El nombre es obligatorio'); return }
    const exists = operators.some(o => o.id === draft.id)
    const next = exists ? operators.map(o => o.id === draft.id ? draft : o) : [...operators, draft]
    onUpdateOperators(next)
    toast.success(exists ? 'Operativo actualizado' : `${draft.name} agregado`)
    cancel()
  }

  const toggleMode = (m: Modality) => {
    if (!draft) return
    setDraft(prev => prev ? { ...prev, modes: prev.modes.includes(m) ? prev.modes.filter(x => x !== m) : [...prev.modes, m] } : prev)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) cancel(); onOpenChange(o) }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Operativos</DialogTitle>
        </DialogHeader>

        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">Asigná qué modos atiende cada operativo. Aparecen en el dropdown de cada carga según su modo.</p>
          <Button size="sm" onClick={startNew} disabled={!!editingId}>
            <Plus size={14} className="mr-1.5" /> Nuevo
          </Button>
        </div>

        <div className="border rounded-lg divide-y max-h-[55vh] overflow-y-auto">
          {/* New-row editor at top if creating a brand-new one not yet in list */}
          {draft && !operators.some(o => o.id === draft.id) && (
            <EditorRow draft={draft} setDraft={setDraft} toggleMode={toggleMode} onSave={save} onCancel={cancel} />
          )}

          {operators.length === 0 && !draft && (
            <div className="p-6 text-center text-sm text-muted-foreground">No hay operativos. Agregá el primero.</div>
          )}

          {operators.map(op => (
            editingId === op.id && draft ? (
              <EditorRow key={op.id} draft={draft} setDraft={setDraft} toggleMode={toggleMode} onSave={save} onCancel={cancel} />
            ) : (
              <div key={op.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ background: op.color || '#64748b' }}>
                  {op.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="font-medium flex-1">{op.name}{!op.active && <span className="ml-2 text-xs text-muted-foreground">(inactivo)</span>}</span>
                <div className="flex gap-1">
                  {op.modes.length === 0
                    ? <span className="text-xs text-muted-foreground">todos los modos</span>
                    : op.modes.map(m => <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{MODALITY_LABELS[m]}</span>)}
                </div>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(op)} disabled={!!editingId}><PencilSimple size={14} /></Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" onClick={() => setPendingDelete(op)} disabled={!!editingId}><Trash size={14} /></Button>
              </div>
            )
          ))}
        </div>
      </DialogContent>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar a {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Las cargas que tenían a {pendingDelete?.name} asignado quedan sin operativo. No se borra ninguna carga.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (pendingDelete) { onDeleteOperator(pendingDelete.id); toast.success(`${pendingDelete.name} eliminado`); setPendingDelete(null) } }}
              className="bg-destructive hover:bg-destructive/90"
            >Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}

function EditorRow({
  draft, setDraft, toggleMode, onSave, onCancel,
}: {
  draft: Operator
  setDraft: (fn: (prev: Operator | null) => Operator | null) => void
  toggleMode: (m: Modality) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5">
      <span className="w-6 h-6 rounded-full shrink-0" style={{ background: draft.color || '#64748b' }} />
      <Input
        autoFocus
        value={draft.name}
        onChange={e => setDraft(prev => prev ? { ...prev, name: e.target.value } : prev)}
        onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
        placeholder="Nombre"
        className="h-8 w-40"
      />
      <div className="flex gap-1 flex-1">
        {ALL_MODES.map(m => (
          <button
            key={m}
            type="button"
            onClick={() => toggleMode(m)}
            className={`text-[10px] px-2 py-1 rounded border transition-colors ${draft.modes.includes(m) ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'}`}
          >
            {MODALITY_LABELS[m]}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input type="checkbox" checked={draft.active} onChange={e => setDraft(prev => prev ? { ...prev, active: e.target.checked } : prev)} className="accent-primary" />
        activo
      </label>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600" onClick={onSave}><Check size={16} weight="bold" /></Button>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onCancel}><XIcon size={16} /></Button>
    </div>
  )
}
