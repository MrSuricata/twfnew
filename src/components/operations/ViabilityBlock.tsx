import { useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { LockSimple, CheckCircle, ArrowCounterClockwise, ClockCounterClockwise, Scales } from '@phosphor-icons/react'
import type { UnifiedOperation } from '@/lib/operationsTypes'
import { DEPOSITOS_UY } from '@/lib/operationsTypes'
import { matchCanonico, upperCat, DEV_ALIASES, canonicalizarLista } from '@/lib/fuzzyCatalog'
import { fmtDateDMY } from '@/lib/format'
import { isLibreDevuelto, libreDevueltoToggle, LIBRE_DEVUELTO } from '@/lib/libreDevuelto'
import { hasTelex } from '@/lib/telexCheck'
import type { Sugerencia } from '@/lib/sugerenciaHistorica'
import type { Recomendacion } from '@/lib/distribucionTransportes'

const NUM_FMT = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 })

// Tipos de operativa de la carga (combo editable, no restrictivo).
const OPERATIVA_OPTIONS = ['TRASIEGO', 'CONTENEDOR', 'CARGA A PISO']

// Terminales habituales de devolución del vacío (combo sugerido, no restrictivo).
const DEV_OPTIONS = ['TCP', 'MONTECON', 'STL', 'PLP']

// Terminales de ARRIBO del buque en MVD (adónde llega el contenedor — define
// además el vencimiento del pago de terminal: MONTECON = ETA − 5 días).
const TERMINAL_OPTIONS = ['TCP', 'MONTECON']

// Bloque destacado arriba del panel: los datos que se miran para decidir si una
// carga es viable, en cuadros grandes + toggles. Editable solo para filas DB
// (LCL/aéreo/terrestre); FCL muestra los valores con candadito (hasta el flip).
export default function ViabilityBlock({
  op,
  editable,
  knownDepositos,
  knownTransportes = [],
  knownFiscales = [],
  knownDevs = [],
  knownLugaresDescarga = [],
  knownTerminales = [],
  fiscalSugerido,
  fiscalesRecientes = [],
  transporteSugerido,
  checksSlot,
  onCommit,
}: {
  op: UnifiedOperation
  editable: boolean
  knownDepositos: string[]
  knownTransportes?: string[]
  /** Fiscales de destino ya usados en las cargas → combo (antes texto libre). */
  knownFiscales?: string[]
  /** Terminales de devolución ya usadas → se suman a DEV_OPTIONS (alias APM=MPS unificado). */
  knownDevs?: string[]
  /** Lugares de descarga del camión (post-fiscal) ya usados → combo Descarga. */
  knownLugaresDescarga?: string[]
  /** Terminales de arribo ya usadas → se suman a TCP/MONTECON en el combo. */
  knownTerminales?: string[]
  /** Fiscal habitual de este cliente según el historial. Solo se ofrece como
   *  atajo si el campo está vacío — nunca pisa un valor ya cargado. */
  fiscalSugerido?: Sugerencia | null
  /** Últimos fiscales del cliente, del más reciente al más viejo. Se muestran
   *  cuando NO hay uno dominante: informan sin decidir por el operador. */
  fiscalesRecientes?: string[]
  /** Transporte sugerido por cuota de reparto. Atajo con el campo vacío. */
  transporteSugerido?: Recomendacion | null
  /** Checks documentarios inline (RefChecksInline) — se renderiza abajo de
   *  LIBRE/"Devuelve en", antes de los toggles (pedido Brian 16/07). */
  checksSlot?: ReactNode
  onCommit: (key: keyof UnifiedOperation, v: unknown) => void
}) {
  // La sugerencia es un atajo para completar, no una corrección: si el fiscal
  // ya tiene valor no se muestra, para no invitar a pisar lo que alguien cargó.
  const mostrarSugerenciaFiscal = editable && !!fiscalSugerido &&
    !String(op.fiscal ?? '').trim() &&
    fiscalSugerido.valor.toUpperCase() !== String(op.fiscal ?? '').trim().toUpperCase()

  const mostrarRecientesFiscal = editable && !fiscalSugerido &&
    !String(op.fiscal ?? '').trim() && fiscalesRecientes.length > 0

  const mostrarSugerenciaTransporte = editable && !!transporteSugerido?.transporte &&
    !String(op.transporte ?? '').trim()

  const depositoOptions = canonicalizarLista([...DEPOSITOS_UY, ...knownDepositos])
  const devOptions = canonicalizarLista([...DEV_OPTIONS, ...knownDevs], DEV_ALIASES)
  const terminalOptions = canonicalizarLista([...TERMINAL_OPTIONS, ...knownTerminales])

  // Botón rápido "Devuelto" (regla del repo: 'DEVUELTO' vive en LIBRE y
  // reemplaza la fecha — así la carga sale de las alertas de LIBRE). Va por el
  // MISMO commit que editar LIBRE a mano: onCommit('libre', …) → el panel
  // propaga a la columna + TODOS los contenedores vía buildPerContainerPatch.
  // El toast permite deshacer restaurando el valor EXACTO anterior (capturado
  // ANTES de pisar). Con LIBRE ya DEVUELTO, el botón pasa a "Deshacer devuelto"
  // y limpia a '' (sin toast: el cambio se ve al instante).
  const libreDevuelto = isLibreDevuelto(op.libre)
  // ¿Los contenedores tienen terminales de devolución DISTINTAS? Editar el
  // cuadro "Devuelve en" propaga UN valor a todos (nivel-carga) — avisar antes.
  const devsDistintos = Array.from(new Set(
    (op.operativas ?? []).map(r => (r.DEV || '').trim().toUpperCase()).filter(Boolean),
  ))
  const devVaria = devsDistintos.length > 1
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

      {/* Bultos/Peso/Volumen en UNA fila (pedido 16/07) — FCL: son la SUMA de
          los contenedores (read-only; se editan por contenedor abajo). LCL/aéreo
          (sin desglose) siguen editables directo. */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <StatBox label="Bultos" value={op.pkgs} kind="number" editable={editable && op.mode !== 'fcl'} sumHint={op.mode === 'fcl'} onCommit={v => onCommit('pkgs', v)} />
        <StatBox label="Peso" value={op.kg} unit="kg" kind="number" editable={editable && op.mode !== 'fcl'} sumHint={op.mode === 'fcl'} onCommit={v => onCommit('kg', v)} />
        <StatBox label="Volumen" value={op.m3} unit="m³" kind="number" editable={editable && op.mode !== 'fcl'} sumHint={op.mode === 'fcl'} onCommit={v => onCommit('m3', v)} />
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {/* Fiscal ahora es combo con catálogo (pedido 16/07): sugiere los ya
            usados y corrige typos al guardar — "para no escribir cualquier cosa". */}
        <StatBox
          label="Fiscal (destino)"
          value={op.fiscal}
          kind="combo"
          options={knownFiscales}
          catalogo
          editable={editable}
          /* Atajo, no invento: solo aparece si el cliente repite el mismo fiscal
             (>=3 cargas y >=80%). Un click lo aplica; siempre se puede cambiar. */
          footer={mostrarSugerenciaFiscal ? (
            <button
              type="button"
              onClick={() => onCommit('fiscal', fiscalSugerido!.valor)}
              title={`${fiscalSugerido!.dominancia}% de las ${fiscalSugerido!.muestras} cargas de este cliente fueron a ${fiscalSugerido!.valor}`}
              className="mt-1.5 inline-flex items-center gap-1 h-7 px-2 rounded-md border border-input bg-background text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ClockCounterClockwise size={12} />
              Usar {fiscalSugerido!.valor}
            </button>
          ) : mostrarRecientesFiscal ? (
            /* El cliente usa varios fiscales: no se sugiere ninguno, pero se
               muestran los últimos para no tener que ir a buscarlos. */
            <div className="mt-1.5 flex flex-wrap items-center gap-1"
              title="Este cliente no usa siempre el mismo destino — estos son los últimos, del más reciente al más viejo">
              <ClockCounterClockwise size={12} className="text-muted-foreground shrink-0" />
              {fiscalesRecientes.slice(0, 4).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onCommit('fiscal', v)}
                  title={`Usar ${v}`}
                  className="inline-flex items-center h-6 px-1.5 rounded border border-input bg-background text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {v}
                </button>
              ))}
            </div>
          ) : undefined}
          onCommit={v => onCommit('fiscal', v)}
        />
        {/* Descarga: dónde descarga el CAMIÓN después del fiscal (ej: fiscal en
            CACEC, descarga en RÍO SEGUNDO) — lo leen los mails de Previsión de
            n8n. Nivel-carga: propaga a todos los contenedores (descarga está en
            OP_ARRAY_FIELD_BY_COL). */}
        <StatBox label="Descarga (post-fiscal)" value={op.descarga} kind="combo" options={knownLugaresDescarga} upper catalogo editable={editable} onCommit={v => onCommit('descarga', v)} />
        <StatBox label="Depósito UY" value={op.deposito} kind="combo" options={depositoOptions} catalogo editable={editable} onCommit={v => onCommit('deposito', v)} />
        {/* Transporte es dato de la CARGA (nivel-carga, como Depósito): editarlo
            propaga a TODOS los contenedores + la columna (buildPerContainerPatch
            en el commit del panel). Sugiere los ya usados; display en MAYÚSCULAS. */}
        <StatBox
          label="Transporte"
          value={op.transporte}
          kind="combo"
          options={knownTransportes}
          upper
          catalogo
          editable={editable}
          /* Atajo por cuota: sugiere el transporte que más atrás viene respecto
             de su objetivo. Solo con el campo vacío; la elección es del operador. */
          footer={mostrarSugerenciaTransporte ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1" title={transporteSugerido!.motivo}>
              <button
                type="button"
                onClick={() => onCommit('transporte', transporteSugerido!.transporte)}
                className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-input bg-background text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Scales size={12} />
                Usar {transporteSugerido!.transporte}
              </button>
              {transporteSugerido!.opciones.slice(1, 3).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onCommit('transporte', t)}
                  title={`Usar ${t}`}
                  className="inline-flex items-center h-6 px-1.5 rounded border border-input bg-background text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {t}
                </button>
              ))}
            </div>
          ) : undefined}
          onCommit={v => onCommit('transporte', v)}
        />
        {/* Operativa y LIBRE son datos de la CARGA (no de un contenedor suelto):
            editarlos acá propaga a TODOS los contenedores + la columna (vía
            buildPerContainerPatch en el commit del panel). Antes LIBRE se editaba
            por contenedor y "no persistía" al abrir otro. */}
        <StatBox label="Operativa" value={op.operativa} kind="combo" options={OPERATIVA_OPTIONS} catalogo editable={editable} onCommit={v => onCommit('operativa', v)} />
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
        <StatBox
          label="Devuelve en"
          value={op.dev}
          kind="combo"
          options={devOptions}
          aliases={DEV_ALIASES}
          upper
          catalogo
          editable={editable}
          footer={devVaria ? (
            <p className="mt-1 text-[10px] leading-tight text-amber-600" title={`Devoluciones por contenedor: ${devsDistintos.join(', ')}`}>
              ⚠ Contenedores con devolución distinta ({devsDistintos.join(', ')}) — editar acá las unifica
            </p>
          ) : undefined}
          onCommit={v => onCommit('dev', v)}
        />
        {/* Terminal de ARRIBO en MVD (TCP/MONTECON) — adónde llega el buque.
            Faltaba en la ficha (reclamo Brian 17/07, caso A7971): existía en el
            modelo y la grilla pero no había dónde cargarla. Define también el
            vencimiento del pago de terminal (MONTECON = ETA − 5). */}
        {/* Terminal (llegada) se mudó a la fila rápida de la ficha (Brian 22/08). */}
      </div>

      {/* Checks documentarios — abajo de LIBRE/"Devuelve en" (pedido 16/07). */}
      {checksSlot}

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
        <Toggle label="Telex" on={hasTelex(op.tlx)} colors={{ si: 'green', no: 'red' }} editable={editable} onToggle={() => onCommit('tlx', !hasTelex(op.tlx))} />
        <Toggle label="IMO" on={op.imo} colors={{ si: 'red', no: 'green' }} editable={editable} onToggle={() => onCommit('imo', !op.imo)} />
      </div>
    </section>
  )
}

// Cuadro grande editable: número / texto / fecha / combo.
// El combo abre una lista propia (antes era un <datalist>, que obliga a
// tipear para que el navegador muestre algo): al entrar en edición se ven
// TODAS las opciones, se filtran a medida que se escribe, se navegan con
// flechas y lo que no está en el catálogo se da de alta con «+ Agregar».
// upper: display en MAYÚSCULAS (patrón transportista de TrucksList) y el valor
// se normaliza a mayúsculas al guardar.
// valueClass: clases extra del valor (ej: LIBRE='DEVUELTO' teñido emerald).
// footer: contenido extra abajo del valor (ej: botón "Devuelto") — se oculta
// mientras se edita para no disparar acciones con un draft a medio guardar.
function StatBox({
  label, value, unit, kind, options, editable, sumHint, upper, catalogo, aliases, valueClass, footer, onCommit,
}: {
  label: string
  value: string | number
  unit?: string
  kind: 'number' | 'text' | 'date' | 'combo'
  options?: string[]
  editable: boolean
  sumHint?: boolean
  upper?: boolean
  /** Combo con catálogo: al guardar corrige typos contra las opciones
   *  ("sna antonio" → SAN ANTONIO, con aviso y "Era otro") y normaliza a
   *  MAYÚSCULAS los valores genuinamente nuevos. */
  catalogo?: boolean
  /** Alias del catálogo (normalizado → canónico), ej: APM → MPS. */
  aliases?: Record<string, string>
  valueClass?: string
  footer?: ReactNode
  onCommit: (v: unknown) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  // true cuando la edición arrancó tipeando una letra (type-to-edit): el foco
  // va al final del seed en vez de seleccionar todo (si no, la 2ª tecla lo pisa).
  const seededRef = useRef(false)
  // Opción resaltada de la lista del combo (-1 = ninguna; se navega con flechas).
  const [resaltada, setResaltada] = useState(-1)

  // Fechas: se muestran dd/MM/yyyy (display only); el editor type=date sigue
  // trabajando con el valor ISO crudo. Textos como "DEVUELTO" pasan tal cual.
  const display = kind === 'number'
    ? (Number(value) ? NUM_FMT.format(Number(value)) : '—')
    : kind === 'date'
      ? (fmtDateDMY(String(value ?? '')) || '—')
      : (String(value ?? '') || '—')

  const start = (seed?: string) => {
    if (!editable) return
    seededRef.current = seed !== undefined
    setDraft(seed !== undefined ? seed : String(value ?? ''))
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
    // Combo con catálogo: corregir typos contra las opciones conocidas antes
    // de guardar (mismo criterio que el alta de carga — fuzzyCatalog).
    if (kind === 'combo' && catalogo) {
      const typed = draft.trim()
      if (typed === '') { if (String(value ?? '') !== '') onCommit(''); return }
      const m = matchCanonico(typed, options || [], aliases)
      const final = m ? m.canon : upperCat(typed)
      if (String(value ?? '') === final) return
      onCommit(final)
      if (m && !m.exacto) {
        toast.info(`«${typed}» → ${m.canon}`, {
          description: `${label}: corregido al valor ya conocido.`,
          action: { label: 'Era otro', onClick: () => onCommit(upperCat(typed)) },
        })
      } else if (!m && (options || []).length > 0) {
        // Con catálogo vacío no se avisa "es nuevo" por cada valor inicial.
        toast.info(`«${final}» es nuevo — queda en las opciones de ${label}`)
      }
      return
    }
    const v = upper ? draft.trim().toUpperCase() : draft.trim()
    if (String(value ?? '') !== String(v)) onCommit(v)
  }
  // Al guardar con Enter (o cancelar con Escape) el input se desmonta y el foco
  // caía al body → se cortaba la cadena de Tab. Devolverlo al cuadro. (Con Tab
  // no hace falta: el blur guarda y el foco ya saltó solo al siguiente cuadro.)
  const refocus = () => requestAnimationFrame(() => boxRef.current?.querySelector('button')?.focus())

  // Opciones que quedan al filtrar por lo tipeado. Con el campo vacío se ven
  // TODAS: el pedido era poder elegir sin tener que teclear (Brian 12/08).
  const sugeridas = kind === 'combo'
    ? (options || []).filter(o => !draft.trim() || o.toUpperCase().includes(draft.trim().toUpperCase()))
    : []
  // Lo tipeado no está en el catálogo → se puede dar de alta desde acá mismo.
  const esNuevo = kind === 'combo' && !!draft.trim() &&
    !(options || []).some(o => o.toUpperCase() === draft.trim().toUpperCase())

  /** Elegir una opción de la lista: guarda directo, sin pasar por el fuzzy. */
  const elegir = (v: string) => {
    setEditing(false)
    setResaltada(-1)
    if (String(value ?? '') !== v) onCommit(v)
    refocus()
  }

  return (
    <div ref={boxRef} className="rounded-lg border bg-background p-2.5 min-w-0 relative">
      <div className="text-[11px] text-muted-foreground leading-none mb-1">{label}</div>
      {editing ? (
        <>
          <Input
            autoFocus
            type={kind === 'date' ? 'date' : 'text'}
            value={draft}
            onChange={e => { setDraft(e.target.value); setResaltada(-1) }}
            onFocus={e => {
              const el = e.target as HTMLInputElement
              if (seededRef.current) { try { el.setSelectionRange(el.value.length, el.value.length) } catch { /* type=date no soporta selección */ } }
              else el.select()
            }}
            /* El blur guarda, salvo que venga de clickear una opción: ahí el
               onMouseDown ya lo evitó y manda `elegir`. */
            onBlur={save}
            onKeyDown={e => {
              if (kind === 'combo' && sugeridas.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault(); setResaltada(i => (i + 1) % sugeridas.length); return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault(); setResaltada(i => (i <= 0 ? sugeridas.length : i) - 1); return
                }
                if (e.key === 'Enter' && resaltada >= 0) {
                  e.preventDefault(); elegir(sugeridas[resaltada]); return
                }
              }
              if (e.key === 'Enter') { save(); refocus() }
              if (e.key === 'Escape') { setEditing(false); setResaltada(-1); refocus() }
            }}
            inputMode={kind === 'number' ? 'decimal' : undefined}
            className={`h-8 text-sm px-1.5 ${upper ? 'uppercase' : ''}`}
          />
          {kind === 'combo' && (sugeridas.length > 0 || esNuevo) && (
            <div
              role="listbox"
              aria-label={`Opciones de ${label}`}
              className="absolute left-2 right-2 top-full z-30 mt-1 max-h-56 overflow-auto rounded-md border bg-popover shadow-lg py-1"
            >
              {sugeridas.map((o, i) => (
                <button
                  key={o}
                  type="button"
                  role="option"
                  aria-selected={i === resaltada}
                  /* preventDefault: sin esto el blur del input dispara save()
                     antes de que llegue el click y la opción no se aplica. */
                  onMouseDown={e => { e.preventDefault(); elegir(o) }}
                  onMouseEnter={() => setResaltada(i)}
                  className={`w-full text-left px-2.5 py-1.5 text-xs transition-colors ${
                    i === resaltada ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                  }`}
                >
                  {o}
                </button>
              ))}
              {esNuevo && (
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); elegir(upperCat(draft.trim())) }}
                  className="w-full text-left px-2.5 py-1.5 text-xs border-t text-primary hover:bg-muted"
                >
                  + Agregar «{upper ? draft.trim().toUpperCase() : draft.trim()}»
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => start()}
          onKeyDown={e => {
            // Type-to-edit: tipear una letra/número abre la edición con ese
            // carácter ya puesto (las fechas se abren con Enter — el editor
            // type=date no acepta un seed suelto).
            if (!editable || kind === 'date') return
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
              e.preventDefault()
              start(e.key)
            }
          }}
          disabled={!editable}
          className={`text-left w-full leading-tight rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 ${editable ? 'cursor-text hover:opacity-70' : 'cursor-default'}`}
          title={editable ? 'Hacé clic o Enter para editar · Tab guarda y salta al siguiente' : sumHint ? 'Total = suma de los contenedores (editá cada uno abajo, en “Salidas y arribos por contenedor”)' : 'Solo lectura (viene de la planilla)'}
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
    const base = 'flex-1 h-9 text-sm rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1'
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
    const base = `${flex} h-9 text-sm rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1`
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
