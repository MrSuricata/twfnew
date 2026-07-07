import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { LockSimple, CheckCircle, ArrowCounterClockwise } from '@phosphor-icons/react'
import type { UnifiedOperation } from '@/lib/operationsTypes'
import { DEPOSITOS_UY } from '@/lib/operationsTypes'
import { fmtDateDMY } from '@/lib/format'
import { isLibreDevuelto, libreDevueltoToggle, LIBRE_DEVUELTO } from '@/lib/libreDevuelto'

const NUM_FMT = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 })

// Tipos de operativa de la carga (combo editable, no restrictivo).
const OPERATIVA_OPTIONS = ['TRASIEGO', 'CONTENEDOR', 'CARGA A PISO']

// Terminales habituales de devolución del vacío (combo sugerido, no restrictivo).
const DEV_OPTIONS = ['TCP', 'MONTECON', 'STL', 'PLP']

// Bloque destacado arriba del panel: los datos que se miran para decidir si una
// carga es viable, en cuadros grandes + toggles. Editable solo para filas DB
// (LCL/aéreo/terrestre); FCL muestra los valores con candadito (hasta el flip).
export default function ViabilityBlock({
  op,
  editable,
  knownDepositos,
  knownTransportes = [],
  onCommit,
}: {
  op: UnifiedOperation
  editable: boolean
  knownDepositos: string[]
  knownTransportes?: string[]
  onCommit: (key: keyof UnifiedOperation, v: unknown) => void
}) {
  const depositoOptions = Array.from(new Set([...DEPOSITOS_UY, ...knownDepositos])).filter(Boolean)

  // Botón rápido "Devuelto" (regla del repo: 'DEVUELTO' vive en LIBRE y
  // reemplaza la fecha — así la carga sale de las alertas de LIBRE). Va por el
  // MISMO commit que editar LIBRE a mano: onCommit('libre', …) → el panel
  // propaga a la columna + TODOS los contenedores vía buildPerContainerPatch.
  // El toast permite deshacer restaurando el valor EXACTO anterior (capturado
  // ANTES de pisar). Con LIBRE ya DEVUELTO, el botón pasa a "Deshacer devuelto"
  // y limpia a '' (sin toast: el cambio se ve al instante).
  const libreDevuelto = isLibreDevuelto(op.libre)
  const toggleDevuelto = () => {
    if (!editable) return
    const { next, prev } = libreDevueltoToggle(op.libre)
    onCommit('libre', next)
    if (next === LIBRE_DEVUELTO) {
      toast.success('Contenedor devuelto', {
        action: { label: 'Deshacer', onClick: () => onCommit('libre', prev) },
      })
    }
  }

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
        {/* FCL: Peso/Volumen/Bultos = SUMA de los contenedores (read-only). Se
            editan por contenedor en "Salidas y arribos por contenedor". LCL/aéreo
            (sin desglose por contenedor) siguen editables directo. */}
        <StatBox label="Peso" value={op.kg} unit="kg" kind="number" editable={editable && op.mode !== 'fcl'} sumHint={op.mode === 'fcl'} onCommit={v => onCommit('kg', v)} />
        <StatBox label="Volumen" value={op.m3} unit="m³" kind="number" editable={editable && op.mode !== 'fcl'} sumHint={op.mode === 'fcl'} onCommit={v => onCommit('m3', v)} />
        <StatBox label="Bultos" value={op.pkgs} kind="number" editable={editable && op.mode !== 'fcl'} sumHint={op.mode === 'fcl'} onCommit={v => onCommit('pkgs', v)} />
        <StatBox label="Fiscal (destino)" value={op.fiscal} kind="text" editable={editable} onCommit={v => onCommit('fiscal', v)} />
        <StatBox label="Depósito UY" value={op.deposito} kind="combo" options={depositoOptions} editable={editable} onCommit={v => onCommit('deposito', v)} />
        {/* Transporte es dato de la CARGA (nivel-carga, como Depósito): editarlo
            propaga a TODOS los contenedores + la columna (buildPerContainerPatch
            en el commit del panel). Sugiere los ya usados; display en MAYÚSCULAS. */}
        <StatBox label="Transporte" value={op.transporte} kind="combo" options={knownTransportes} upper editable={editable} onCommit={v => onCommit('transporte', v)} />
        {/* Operativa y LIBRE son datos de la CARGA (no de un contenedor suelto):
            editarlos acá propaga a TODOS los contenedores + la columna (vía
            buildPerContainerPatch en el commit del panel). Antes LIBRE se editaba
            por contenedor y "no persistía" al abrir otro. */}
        <StatBox label="Operativa" value={op.operativa} kind="combo" options={OPERATIVA_OPTIONS} editable={editable} onCommit={v => onCommit('operativa', v)} />
        <StatBox label="Desconsolidación" value={op.desconsol} kind="date" editable={editable} onCommit={v => onCommit('desconsol', v)} />
        <StatBox
          label="Libre (máx. devolución)"
          value={op.libre}
          kind="date"
          editable={editable}
          valueClass={libreDevuelto ? 'text-emerald-600' : ''}
          footer={
            <button
              type="button"
              onClick={toggleDevuelto}
              disabled={!editable}
              title={!editable ? 'Solo lectura (viene de la planilla)' : libreDevuelto ? 'Quitar la marca DEVUELTO (LIBRE queda vacío)' : 'Marcar contenedor devuelto (LIBRE = DEVUELTO)'}
              className="mt-1.5 inline-flex items-center gap-1 h-7 px-2 rounded-md border border-input bg-background text-[11px] font-medium text-muted-foreground transition-colors enabled:hover:bg-muted enabled:hover:text-foreground disabled:opacity-50"
            >
              {libreDevuelto ? <ArrowCounterClockwise size={12} /> : <CheckCircle size={12} />}
              {libreDevuelto ? 'Deshacer devuelto' : 'Devuelto'}
            </button>
          }
          onCommit={v => onCommit('libre', v)}
        />
        {/* Devuelve en: terminal donde se devuelve el vacío (DEV) — al lado del
            LIBRE porque se leen juntos (hasta cuándo y dónde devolver). Nivel-carga:
            propaga a todos los contenedores (dev está en OP_ARRAY_FIELD_BY_COL). */}
        <StatBox label="Devuelve en" value={op.dev} kind="combo" options={DEV_OPTIONS} upper editable={editable} onCommit={v => onCommit('dev', v)} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {/* Semáforo del dueño (03/07): rojo = respuesta que exige atención
            operativa · verde = estado tranquilo. Solo se tiñe el botón
            SELECCIONADO; el otro queda outline neutro. */}
        {/* Apilable es la NEGACIÓN de noApilable: togglear Apilable invierte noApilable */}
        <Toggle label="Apilable" on={!op.noApilable} colors={{ si: 'green', no: 'red' }} editable={editable} onToggle={() => onCommit('noApilable', !op.noApilable)} />
        {/* Madera Sí dispara SENASA → rojo. Tri-estado con punto intermedio:
            Sí · ¿? (a confirmar, ámbar) · No — null en la columna = sin confirmar. */}
        <TriToggle label="Madera" value={op.wood} editable={editable} onSet={v => onCommit('wood', v)} />
        <Toggle label="Entrega en planta" on={op.entregaPlanta} colors={{ si: 'red', no: 'green' }} editable={editable} onToggle={() => onCommit('entregaPlanta', !op.entregaPlanta)} />
        {/* tlx es string 'SI'|'' en el modelo; el commit envía boolean (col telex) */}
        <Toggle label="Telex" on={op.tlx === 'SI'} colors={{ si: 'green', no: 'red' }} editable={editable} onToggle={() => onCommit('tlx', op.tlx !== 'SI')} />
        <Toggle label="IMO" on={op.imo} colors={{ si: 'red', no: 'green' }} editable={editable} onToggle={() => onCommit('imo', !op.imo)} />
      </div>
    </section>
  )
}

// Cuadro grande editable: número / texto / fecha / combo (datalist).
// upper: display en MAYÚSCULAS (patrón transportista de TrucksList) y el valor
// se normaliza a mayúsculas al guardar.
// valueClass: clases extra del valor (ej: LIBRE='DEVUELTO' teñido emerald).
// footer: contenido extra abajo del valor (ej: botón "Devuelto") — se oculta
// mientras se edita para no disparar acciones con un draft a medio guardar.
function StatBox({
  label, value, unit, kind, options, editable, sumHint, upper, valueClass, footer, onCommit,
}: {
  label: string
  value: string | number
  unit?: string
  kind: 'number' | 'text' | 'date' | 'combo'
  options?: string[]
  editable: boolean
  sumHint?: boolean
  upper?: boolean
  valueClass?: string
  footer?: ReactNode
  onCommit: (v: unknown) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  // Fechas: se muestran dd/MM/yyyy (display only); el editor type=date sigue
  // trabajando con el valor ISO crudo. Textos como "DEVUELTO" pasan tal cual.
  const display = kind === 'number'
    ? (Number(value) ? NUM_FMT.format(Number(value)) : '—')
    : kind === 'date'
      ? (fmtDateDMY(String(value ?? '')) || '—')
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
    const v = upper ? draft.trim().toUpperCase() : draft.trim()
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
            className={`h-8 text-sm px-1.5 ${upper ? 'uppercase' : ''}`}
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
          title={editable ? 'Hacé clic para editar' : sumHint ? 'Total = suma de los contenedores (editá cada uno abajo, en “Salidas y arribos por contenedor”)' : 'Solo lectura (viene de la planilla)'}
        >
          <span className={`text-[22px] font-medium ${display === '—' ? 'text-muted-foreground' : ''} ${upper ? 'uppercase' : ''} ${valueClass || ''}`}>{display}</span>
          {unit && display !== '—' && <span className="text-xs text-muted-foreground ml-1">{unit}</span>}
        </button>
      )}
      {!editing && footer}
    </div>
  )
}

// Toggle grande Sí/No con semáforo operativo: cada respuesta tiene su color al
// quedar seleccionada (verde = tranquilo · rojo = exige atención: SENASA, entrega
// especial, sin telex…). Tono 600 con texto blanco (pedido del dueño, por
// contraste); el botón NO seleccionado queda outline neutro como siempre.
type ToggleColors = { si: 'green' | 'red'; no: 'green' | 'red' }
const TOGGLE_ON: Record<'green' | 'red', string> = {
  green: 'bg-emerald-600 border-emerald-600 text-white font-medium',
  red: 'bg-red-600 border-red-600 text-white font-medium',
}

function Toggle({
  label, on, colors, editable, onToggle,
}: {
  label: string
  on: boolean
  colors: ToggleColors
  editable: boolean
  onToggle: () => void
}) {
  const seg = (active: boolean, color: 'green' | 'red') => {
    const base = 'flex-1 h-9 text-sm rounded-md border transition-colors'
    if (active) return `${base} ${TOGGLE_ON[color]}`
    return `${base} bg-background border-border text-muted-foreground ${editable ? 'hover:bg-muted' : ''}`
  }
  return (
    <div>
      <div className="text-[11px] text-muted-foreground text-center mb-1 truncate" title={label}>{label}</div>
      <div className="flex gap-1">
        <button type="button" disabled={!editable || on} onClick={() => { if (!on) onToggle() }} className={seg(on, colors.si)}>Sí</button>
        <button type="button" disabled={!editable || !on} onClick={() => { if (on) onToggle() }} className={seg(!on, colors.no)}>No</button>
      </div>
    </div>
  )
}

// Toggle TRI-estado (Madera): Sí (rojo: dispara SENASA) · punto intermedio "¿?"
// (ámbar: falta confirmar con el shipper) · No (verde). value=null = a confirmar.
// Mismo look del Toggle binario, con el segmento del medio más angosto.
const TOGGLE_ON_AMBER = 'bg-amber-500 border-amber-500 text-white font-medium'

function TriToggle({
  label, value, editable, onSet,
}: {
  label: string
  value: boolean | null
  editable: boolean
  onSet: (v: boolean | null) => void
}) {
  const seg = (active: boolean, onCls: string, flex = 'flex-1') => {
    const base = `${flex} h-9 text-sm rounded-md border transition-colors`
    if (active) return `${base} ${onCls}`
    return `${base} bg-background border-border text-muted-foreground ${editable ? 'hover:bg-muted' : ''}`
  }
  return (
    <div>
      <div className="text-[11px] text-muted-foreground text-center mb-1 truncate" title={label}>{label}</div>
      <div className="flex gap-1">
        <button type="button" disabled={!editable || value === true} onClick={() => onSet(true)} className={seg(value === true, TOGGLE_ON.red)}>Sí</button>
        <button
          type="button"
          disabled={!editable || value === null}
          onClick={() => onSet(null)}
          title="A confirmar — todavía no se sabe si lleva madera"
          aria-label={`${label}: a confirmar`}
          className={seg(value === null, TOGGLE_ON_AMBER, 'w-9 shrink-0')}
        >
          ¿?
        </button>
        <button type="button" disabled={!editable || value === false} onClick={() => onSet(false)} className={seg(value === false, TOGGLE_ON.green)}>No</button>
      </div>
    </div>
  )
}
