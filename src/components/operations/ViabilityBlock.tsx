import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { LockSimple } from '@phosphor-icons/react'
import type { UnifiedOperation } from '@/lib/operationsTypes'
import { DEPOSITOS_UY } from '@/lib/operationsTypes'

const NUM_FMT = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 })

// Bloque destacado arriba del panel: los datos que se miran para decidir si una
// carga es viable, en cuadros grandes + toggles. Editable solo para filas DB
// (LCL/aéreo/terrestre); FCL muestra los valores con candadito (hasta el flip).
export default function ViabilityBlock({
  op,
  editable,
  knownDepositos,
  onCommit,
}: {
  op: UnifiedOperation
  editable: boolean
  knownDepositos: string[]
  onCommit: (key: keyof UnifiedOperation, v: unknown) => void
}) {
  const depositoOptions = Array.from(new Set([...DEPOSITOS_UY, ...knownDepositos])).filter(Boolean)
  return (
    <section className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Datos clave de la carga</span>
        {!editable && (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <LockSimple size={11} /> de la planilla
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <StatBox label="Peso" value={op.kg} unit="kg" kind="number" editable={editable} onCommit={v => onCommit('kg', v)} />
        <StatBox label="Volumen" value={op.m3} unit="m³" kind="number" editable={editable} onCommit={v => onCommit('m3', v)} />
        <StatBox label="Bultos" value={op.pkgs} kind="number" editable={editable} onCommit={v => onCommit('pkgs', v)} />
        <StatBox label="Fiscal (destino)" value={op.fiscal} kind="text" editable={editable} onCommit={v => onCommit('fiscal', v)} />
        <StatBox label="Depósito UY" value={op.deposito} kind="combo" options={depositoOptions} editable={editable} onCommit={v => onCommit('deposito', v)} />
        <StatBox label="Desconsolidación" value={op.desconsol} kind="date" editable={editable} onCommit={v => onCommit('desconsol', v)} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {/* Apilable es la NEGACIÓN de noApilable: togglear Apilable invierte noApilable */}
        <Toggle label="Apilable" on={!op.noApilable} editable={editable} onToggle={() => onCommit('noApilable', !op.noApilable)} />
        <Toggle label="Madera" on={op.wood} editable={editable} onToggle={() => onCommit('wood', !op.wood)} />
        <Toggle label="Entrega en planta" on={op.entregaPlanta} editable={editable} onToggle={() => onCommit('entregaPlanta', !op.entregaPlanta)} />
        {/* tlx es string 'SI'|'' en el modelo; el commit envía boolean (col telex) */}
        <Toggle label="Telex" on={op.tlx === 'SI'} editable={editable} onToggle={() => onCommit('tlx', op.tlx !== 'SI')} />
        <Toggle label="IMO" on={op.imo} editable={editable} onToggle={() => onCommit('imo', !op.imo)} />
      </div>
    </section>
  )
}

// Cuadro grande editable: número / texto / fecha / combo (datalist).
function StatBox({
  label, value, unit, kind, options, editable, onCommit,
}: {
  label: string
  value: string | number
  unit?: string
  kind: 'number' | 'text' | 'date' | 'combo'
  options?: string[]
  editable: boolean
  onCommit: (v: unknown) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const display = kind === 'number'
    ? (Number(value) ? NUM_FMT.format(Number(value)) : '—')
    : (String(value ?? '') || '—')

  const start = () => {
    if (!editable) return
    setDraft(String(value ?? ''))
    setEditing(true)
  }
  const save = () => {
    setEditing(false)
    if (kind === 'number') {
      if (draft.trim() === '') { if (Number(value)) onCommit(null); return }
      const n = parseFloat(draft.replace(',', '.'))
      if (!isFinite(n)) return
      if (String(value ?? '') !== String(n)) onCommit(n)
      return
    }
    const v = draft.trim()
    if (String(value ?? '') !== String(v)) onCommit(v)
  }

  const listId = `dep-${label}`
  return (
    <div className="rounded-lg border bg-background p-2.5 min-w-0">
      <div className="text-[11px] text-muted-foreground leading-none mb-1">{label}</div>
      {editing ? (
        <>
          <Input
            autoFocus
            list={kind === 'combo' ? listId : undefined}
            type={kind === 'date' ? 'date' : 'text'}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onFocus={e => e.target.select()}
            onBlur={save}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
            inputMode={kind === 'number' ? 'decimal' : undefined}
            className="h-8 text-sm px-1.5"
          />
          {kind === 'combo' && (
            <datalist id={listId}>
              {(options || []).map(o => <option key={o} value={o} />)}
            </datalist>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={!editable}
          className={`text-left w-full leading-tight ${editable ? 'cursor-text hover:opacity-70' : 'cursor-default'}`}
          title={editable ? 'Click para editar' : 'Solo lectura (viene de la planilla)'}
        >
          <span className={`text-[22px] font-medium ${display === '—' ? 'text-muted-foreground' : ''}`}>{display}</span>
          {unit && display !== '—' && <span className="text-xs text-muted-foreground ml-1">{unit}</span>}
        </button>
      )}
    </div>
  )
}

// Toggle grande Sí/No: el seleccionado en azul institucional (texto blanco).
function Toggle({
  label, on, editable, onToggle,
}: {
  label: string
  on: boolean
  editable: boolean
  onToggle: () => void
}) {
  const seg = (active: boolean) => {
    const base = 'flex-1 h-9 text-sm rounded-md border transition-colors'
    if (active) return `${base} bg-[#1e3a8a] border-[#1e3a8a] text-white font-medium`
    return `${base} bg-background border-border text-muted-foreground ${editable ? 'hover:bg-muted' : ''}`
  }
  return (
    <div>
      <div className="text-[11px] text-muted-foreground text-center mb-1 truncate" title={label}>{label}</div>
      <div className="flex gap-1">
        <button type="button" disabled={!editable || on} onClick={() => { if (!on) onToggle() }} className={seg(on)}>Sí</button>
        <button type="button" disabled={!editable || !on} onClick={() => { if (on) onToggle() }} className={seg(!on)}>No</button>
      </div>
    </div>
  )
}
