import { useMemo, useState } from 'react'
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
import { Plus, CaretDown } from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { DbShipment, Modality, Operator } from '@/lib/operationsTypes'
import {
  newDbShipment, operatorsForMode, MODALITY_LABELS, MODALITY_COLORS,
  DEPOSITOS_UY, STATUS_OPTIONS,
} from '@/lib/operationsTypes'
import { parseCntr } from '@/lib/cntrUtils'
import { canonicalizeCliente, type CatalogClient } from '@/lib/clientCatalog'

// ── Alta de carga COMPLETA ───────────────────────────────────────────────
// Obligatorios: Ref + Cliente + Modalidad (decisión tomada — no cambiar).
// El resto son TODOS los campos editables de una carga (los mismos que edita
// el panel de detalle), agrupados en las mismas secciones visuales del panel
// (Datos clave / Fechas / Ruta / Documental / Carga / Operativa) y colapsados
// bajo "Más campos" para que el alta rápida de 3 campos siga siendo rápida.
// Guarda en la tabla unificada `shipments` (source='web') vía onCreate
// (App.handleCreateShipment → POST /api/data/shipments, whitelist SHIPMENT_COLS).
// Lo reusa también el armador de camiones (crear carga sin salir del armador).

const MODES: Modality[] = ['lcl', 'air', 'land', 'fcl']

// Tipos de operativa conocidos (mismo combo no restrictivo del ViabilityBlock).
const OPERATIVA_OPTIONS = ['TRASIEGO', 'CONTENEDOR', 'CARGA A PISO']

const PAIS_OPTIONS = [
  { value: '', label: '—' },
  { value: 'UY', label: 'Uruguay' },
  { value: 'AR', label: 'Argentina' },
  { value: 'CL', label: 'Chile' },
  { value: 'OTRO', label: 'Otro' },
]

interface FormState {
  ref: string
  cliente: string
  operatorId: string
  // Datos clave
  deposito: string
  operativa: string
  libre: string
  fiscal: string
  desconsol: string
  // Fechas
  etd: string
  eta: string
  salida: string
  etaFisc: string
  seguimiento: string
  // Ruta
  origin: string
  dischargePort: string
  destPort: string
  pais: string
  // Documental
  docNumber: string
  buque: string
  linea: string
  shipper: string
  agente: string
  incoterm: string
  clientRef: string
  // Carga
  contenedor: string
  tipo: string
  pkgs: string
  kg: string
  m3: string
  descripcion: string
  // Operativa
  transporte: string
  despacho: string
  dev: string
  terminal: string
  descarga: string
  status: string
  // Indicadores
  telex: boolean
  noApilable: boolean
  /** Madera tri-estado: null = a confirmar (default de toda carga nueva). */
  wood: boolean | null
  entregaPlanta: boolean
  seguro: boolean
  certi: boolean
  impresa: boolean
  imo: boolean
  oog: boolean
}

const EMPTY_FORM: FormState = {
  ref: '', cliente: '', operatorId: '',
  deposito: '', operativa: '', libre: '', fiscal: '', desconsol: '',
  etd: '', eta: '', salida: '', etaFisc: '', seguimiento: '',
  origin: '', dischargePort: '', destPort: '', pais: '',
  docNumber: '', buque: '', linea: '', shipper: '', agente: '', incoterm: '', clientRef: '',
  contenedor: '', tipo: '', pkgs: '', kg: '', m3: '', descripcion: '',
  transporte: '', despacho: '', dev: '', terminal: '', descarga: '', status: 'en_origen',
  telex: false, noApilable: false, wood: null, entregaPlanta: false,
  seguro: false, certi: false, impresa: false, imo: false, oog: false,
}

const parseNum = (s: string): number => {
  const n = parseFloat((s || '').replace(',', '.'))
  return isFinite(n) ? n : 0
}

export default function NewShipmentDialog({
  open,
  onOpenChange,
  operators,
  onCreate,
  suggestedRef = '',
  clientes = [],
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  operators: Operator[]
  /** Devuelve false si el alta se abortó (ej: REF duplicada y el usuario canceló). */
  onCreate: (row: DbShipment) => boolean | void
  /** Próxima ref FCL libre (máx A#### + 1) — se ofrece al elegir modo FCL. */
  suggestedRef?: string
  /** Catálogo de clientes: alimenta el datalist del campo Cliente y la
   *  canonicalización al blur (alias tipeado → nombre canónico). Texto libre
   *  sigue permitido. */
  clientes?: CatalogClient[]
}) {
  // Modalidad SIN default: es obligatoria y el operativo la elige a conciencia.
  const [mode, setMode] = useState<Modality | null>(null)
  const [f, setF] = useState<FormState>(EMPTY_FORM)
  const [moreOpen, setMoreOpen] = useState(false)
  // Se prende al intentar guardar con obligatorios vacíos → errores inline.
  const [showErrors, setShowErrors] = useState(false)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setF(prev => ({ ...prev, [key]: value }))

  const reset = () => {
    setMode(null)
    setF(EMPTY_FORM)
    setMoreOpen(false)
    setShowErrors(false)
  }

  const pickMode = (m: Modality) => {
    setMode(m)
    // FCL nace con destino UY (mismo default de newDbShipment) — editable en Ruta.
    if (m === 'fcl' && !f.pais) set('pais', 'UY')
    // Si el operativo elegido no atiende la nueva modalidad, se limpia.
    if (f.operatorId && !operatorsForMode(operators, m).some(o => o.id === f.operatorId)) {
      set('operatorId', '')
    }
  }

  // Sin modalidad elegida todavía → todos los operativos activos.
  const eligibleOps = mode ? operatorsForMode(operators, mode) : operators.filter(o => o.active)

  // Cuántos campos opcionales ya tienen algo (hint en el toggle colapsado).
  // OJO: wood es boolean | null (null = "a confirmar", el default del alta) —
  // null NO cuenta como cargado y NO se puede trimear (crasheaba el tab entero:
  // este memo corre aunque el diálogo esté cerrado).
  const filledCount = useMemo(() => {
    const skip = new Set(['ref', 'cliente', 'operatorId', 'status'])
    return (Object.entries(f) as [keyof FormState, string | boolean | null][]).filter(([k, v]) => {
      if (skip.has(k)) return false
      if (v === null || v === undefined) return false
      return typeof v === 'boolean' ? v : String(v).trim() !== ''
    }).length
  }, [f])

  const missingRef = !f.ref.trim()
  const missingCliente = !f.cliente.trim()
  const missingMode = mode === null

  const save = () => {
    if (missingMode || missingRef || missingCliente) {
      setShowErrors(true)
      const faltan = [
        missingMode ? 'Modalidad' : null,
        missingRef ? 'Ref' : null,
        missingCliente ? 'Cliente' : null,
      ].filter(Boolean).join(', ')
      toast.error(`Faltan campos obligatorios: ${faltan}`)
      return
    }
    const m = mode as Modality
    const row = newDbShipment({
      mode: m,
      ref: f.ref.trim(),
      cliente: f.cliente.trim(),
      operator_id: f.operatorId || null,
      client_ref: f.clientRef.trim(),
      shipper: f.shipper.trim(),
      agente: f.agente.trim(),
      incoterm: f.incoterm.trim(),
      doc_number: f.docNumber.trim(),
      buque: f.buque.trim(),
      linea: f.linea.trim(),
      origin: f.origin.trim(),
      discharge_port: f.dischargePort.trim(),
      dest_port: f.destPort.trim(),
      // País vacío → queda el default de newDbShipment (FCL nace 'UY').
      ...(f.pais ? { dest_country: f.pais } : {}),
      etd: f.etd.trim(),
      eta: f.eta.trim(),
      salida: f.salida.trim(),
      eta_fiscal: f.etaFisc.trim(),
      seguimiento: f.seguimiento.trim(),
      deposito: f.deposito.trim(),
      operativa: f.operativa.trim(),
      libre: f.libre.trim(),
      fiscal: f.fiscal.trim(),
      desconsol_date: f.desconsol.trim(),
      contenedor: f.contenedor.trim(),
      tipo: f.tipo.trim(),
      // N contenedores derivado de la lista tipeada (solo FCL usa la columna).
      n_cntr: m === 'fcl' ? parseCntr(f.contenedor).length : 0,
      pkgs: parseNum(f.pkgs),
      kg: parseNum(f.kg),
      m3: parseNum(f.m3),
      observacion: f.descripcion.trim(),
      transporte: f.transporte.trim(),
      despacho: f.despacho.trim(),
      dev: f.dev.trim(),
      terminal: f.terminal.trim(),
      descarga: f.descarga.trim(),
      // FCL: el estado se DERIVA de las fechas (derive-on-read) — la columna
      // queda en el baseline y no se elige a mano.
      status: m === 'fcl' ? 'en_origen' : f.status,
      telex: f.telex,
      no_apilable: f.noApilable,
      wood: f.wood,
      entrega_planta: f.entregaPlanta,
      seguro: f.seguro,
      certi: f.certi,
      impresa: f.impresa,
      // IMO: FCL y LCL · OOG: solo FCL (misma regla del panel).
      imo: m === 'fcl' || m === 'lcl' ? f.imo : false,
      oog: m === 'fcl' ? f.oog : false,
    })
    // false = abortado (REF duplicada y canceló) → el diálogo queda abierto.
    if (onCreate(row) === false) return
    reset()
    onOpenChange(false)
  }

  // Indicadores según modalidad (IMO solo FCL/LCL, OOG solo FCL).
  // Madera NO va acá: es tri-estado (Sí/No/a confirmar) y tiene su selector propio.
  const flags: [string, keyof FormState][] = [
    ['Telex', 'telex'],
    ['No apilable', 'noApilable'],
    ['Entrega en planta', 'entregaPlanta'],
    ['Seguro', 'seguro'],
    ['Certificada', 'certi'],
    ['Impreso', 'impresa'],
    ...(mode === 'fcl' || mode === 'lcl' ? [['IMO', 'imo'] as [string, keyof FormState]] : []),
    ...(mode === 'fcl' ? [['Sobredimensionada (OOG)', 'oog'] as [string, keyof FormState]] : []),
  ]

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus size={20} /> Nueva carga</DialogTitle>
          <DialogDescription>
            <span className="text-red-600 font-semibold">*</span> Ref, cliente y modalidad son obligatorios.
            El resto lo podés cargar ahora en “Más campos” o después en la grilla.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* ── Obligatorios ── */}
          <div className="space-y-1.5">
            <Label>Modalidad <span className="text-red-600">*</span></Label>
            <div className="flex flex-wrap gap-2">
              {MODES.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => pickMode(m)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 border text-sm transition-all ${
                    mode === m
                      ? 'border-primary bg-primary/5 font-semibold'
                      : `${showErrors && missingMode ? 'border-red-400' : 'border-border'} bg-card hover:bg-muted`
                  }`}
                >
                  <span className="w-2 h-2 rounded-sm" style={{ background: MODALITY_COLORS[m] }} />
                  {MODALITY_LABELS[m]}
                </button>
              ))}
            </div>
            {showErrors && missingMode && <p className="text-xs text-red-600">Elegí la modalidad de la carga</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ns-ref">Ref <span className="text-red-600">*</span></Label>
              <Input
                id="ns-ref"
                value={f.ref}
                onChange={e => set('ref', e.target.value)}
                placeholder={mode === 'fcl' && suggestedRef ? suggestedRef : 'E198, A7990…'}
                aria-invalid={showErrors && missingRef}
                className={showErrors && missingRef ? 'border-red-400' : undefined}
              />
              {showErrors && missingRef && <p className="text-xs text-red-600">Completá la referencia</p>}
              {mode === 'fcl' && suggestedRef && f.ref.trim() === '' && (
                <button
                  type="button"
                  onClick={() => set('ref', suggestedRef)}
                  className="text-xs text-primary hover:underline"
                  title="Siguiente número libre detectado entre todas las cargas (FCL y aéreas comparten la numeración A)"
                >
                  Sugerida: <strong>{suggestedRef}</strong> — click para usar
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-cli">Cliente / Cnee <span className="text-red-600">*</span></Label>
              {/* Datalist con los nombres canónicos del catálogo. Texto libre
                  permitido; si lo tipeado matchea un alias conocido, al blur se
                  reemplaza por el nombre canónico (unificación de clientes). */}
              <Input
                id="ns-cli"
                list="ns-cli-list"
                value={f.cliente}
                onChange={e => set('cliente', e.target.value)}
                onBlur={() => {
                  const canon = canonicalizeCliente(f.cliente, clientes)
                  if (canon !== f.cliente) set('cliente', canon)
                }}
                placeholder="Cliente"
                aria-invalid={showErrors && missingCliente}
                className={showErrors && missingCliente ? 'border-red-400' : undefined}
              />
              <datalist id="ns-cli-list">
                {[...clientes].sort((a, b) => a.name.localeCompare(b.name, 'es')).map(c => (
                  <option key={c.name} value={c.name} />
                ))}
              </datalist>
              {showErrors && missingCliente && <p className="text-xs text-red-600">Completá el cliente</p>}
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="ns-op">Operativo</Label>
              <select
                id="ns-op"
                value={f.operatorId}
                onChange={e => set('operatorId', e.target.value)}
                className="w-full h-9 px-2 rounded-md border border-border bg-card text-sm"
              >
                <option value="">— sin asignar —</option>
                {eligibleOps.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          </div>

          {/* ── Más campos (opcionales, colapsables) ── */}
          <button
            type="button"
            onClick={() => setMoreOpen(v => !v)}
            className="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed py-2 text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          >
            <CaretDown size={12} className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
            {moreOpen ? 'Ocultar campos opcionales' : 'Más campos (todos opcionales)'}
            {!moreOpen && filledCount > 0 && <span className="text-primary font-medium">· {filledCount} completados</span>}
          </button>

          {moreOpen && (
            <div className="space-y-4">
              {/* Datos clave */}
              <Section title="Datos clave">
                <ComboField label="Depósito UY" value={f.deposito} options={DEPOSITOS_UY} onChange={v => set('deposito', v)} placeholder="GODILCO, PLANIR…" />
                <ComboField label="Operativa" value={f.operativa} options={OPERATIVA_OPTIONS} onChange={v => set('operativa', v)} placeholder="TRASIEGO…" />
                <Field label="Libre (máx. devolución)" type="date" value={f.libre} onChange={v => set('libre', v)} />
                <Field label="Fiscal (destino)" value={f.fiscal} onChange={v => set('fiscal', v)} placeholder="LOGIFRONT, FISCALIA…" />
                <Field label="Desconsolidación" type="date" value={f.desconsol} onChange={v => set('desconsol', v)} />
              </Section>

              {/* Fechas */}
              <Section title="Fechas">
                <Field label="ETD" type="date" value={f.etd} onChange={v => set('etd', v)} />
                <Field label="ETA" type="date" value={f.eta} onChange={v => set('eta', v)} />
                <Field label="Salida" type="date" value={f.salida} onChange={v => set('salida', v)} />
                <Field label="ETA fiscal" type="date" value={f.etaFisc} onChange={v => set('etaFisc', v)} />
                <Field label="Seguimiento" type="date" value={f.seguimiento} onChange={v => set('seguimiento', v)} />
              </Section>

              {/* Ruta */}
              <Section title="Ruta">
                <Field label="Origen (POL)" value={f.origin} onChange={v => set('origin', v)} placeholder="SHANGHAI…" />
                <Field label="Pto. descarga (POD)" value={f.dischargePort} onChange={v => set('dischargePort', v)} placeholder="MONTEVIDEO…" />
                <Field label="Destino" value={f.destPort} onChange={v => set('destPort', v)} />
                <SelectField label="País destino" value={f.pais} options={PAIS_OPTIONS} onChange={v => set('pais', v)} />
              </Section>

              {/* Documental */}
              <Section title="Documental">
                <Field label="Booking / BL / AWB / CRT" value={f.docNumber} onChange={v => set('docNumber', v)} placeholder="Documento" />
                <Field label="Buque" value={f.buque} onChange={v => set('buque', v)} />
                <Field label="Línea" value={f.linea} onChange={v => set('linea', v)} placeholder="MAERSK, COSCO…" />
                <Field label="Ref cliente" value={f.clientRef} onChange={v => set('clientRef', v)} />
                <Field label="Shipper" value={f.shipper} onChange={v => set('shipper', v)} />
                <Field label="Agente" value={f.agente} onChange={v => set('agente', v)} />
                <Field label="Incoterm" value={f.incoterm} onChange={v => set('incoterm', v)} placeholder="FOB, EXW…" />
              </Section>

              {/* Carga */}
              <Section title="Carga">
                <Field label="Contenedor(es)" value={f.contenedor} onChange={v => set('contenedor', v)} placeholder="MSKU1234567, TCLU7654321…" wide />
                <Field label="Tipo" value={f.tipo} onChange={v => set('tipo', v)} placeholder="40HC, 20DRY…" />
                <Field label="Bultos" value={f.pkgs} onChange={v => set('pkgs', v)} inputMode="decimal" placeholder="0" />
                <Field label="Kg" value={f.kg} onChange={v => set('kg', v)} inputMode="decimal" placeholder="0" />
                <Field label="M³" value={f.m3} onChange={v => set('m3', v)} inputMode="decimal" placeholder="0" />
                <Field label="Descripción" value={f.descripcion} onChange={v => set('descripcion', v)} placeholder="Mercadería…" wide />
                <div className="col-span-2 space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Indicadores</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
                    {/* Madera: tri-estado — toda carga nueva nace "A confirmar" (null),
                        no "No": false diría confirmado sin que nadie lo haya chequeado. */}
                    <label className="flex items-center gap-2 text-sm select-none">
                      Madera
                      <select
                        value={f.wood === null ? 'confirmar' : f.wood ? 'si' : 'no'}
                        onChange={e => set('wood', (e.target.value === 'confirmar' ? null : e.target.value === 'si') as FormState['wood'])}
                        className={`h-7 rounded-md border border-input px-1.5 text-xs ${f.wood ? 'text-red-600 font-semibold' : f.wood === null ? 'text-amber-600 font-medium' : 'text-foreground'}`}
                      >
                        <option value="confirmar">A confirmar</option>
                        <option value="si">Sí</option>
                        <option value="no">No</option>
                      </select>
                    </label>
                    {flags.map(([label, key]) => (
                      <label key={key} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={f[key] as boolean}
                          onChange={e => set(key, e.target.checked as FormState[typeof key])}
                          className="h-4 w-4 accent-primary"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </Section>

              {/* Operativa */}
              <Section title="Operativa">
                <Field label="Transporte" value={f.transporte} onChange={v => set('transporte', v)} placeholder="Olaverry, PCS…" />
                <Field label="Despacho" value={f.despacho} onChange={v => set('despacho', v)} />
                <Field label="DEV (terminal devolución)" value={f.dev} onChange={v => set('dev', v)} placeholder="STL, TCP…" />
                <Field label="Terminal" value={f.terminal} onChange={v => set('terminal', v)} placeholder="TCP, MONTECON…" />
                <Field label="Descarga" type="date" value={f.descarga} onChange={v => set('descarga', v)} />
                {mode !== 'fcl' && (
                  <SelectField label="Estado" value={f.status} options={STATUS_OPTIONS} onChange={v => set('status', v)} />
                )}
              </Section>
              {mode === 'fcl' && (
                <p className="text-[11px] text-muted-foreground">
                  El estado de las FCL se deriva solo de las fechas (ETD/ETA/salida/arribo) — no se elige a mano.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }}>Cancelar</Button>
          <Button onClick={save} className="gap-1.5"><Plus size={16} /> Agregar carga</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Atoms ────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 pb-1 border-b">{title}</h4>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">{children}</div>
    </section>
  )
}

function Field({
  label, value, onChange, type, placeholder, inputMode, wide,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  inputMode?: 'decimal'
  wide?: boolean
}) {
  return (
    <div className={`space-y-1 min-w-0 ${wide ? 'col-span-2' : ''}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="h-9 text-sm"
      />
    </div>
  )
}

// Input con datalist (acepta valores nuevos, sugiere los conocidos).
function ComboField({
  label, value, options, onChange, placeholder,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
  placeholder?: string
}) {
  const listId = `ns-list-${label.replace(/\W+/g, '-')}`
  return (
    <div className="space-y-1 min-w-0">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input list={listId} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="h-9 text-sm" />
      <datalist id={listId}>
        {options.map(o => <option key={o} value={o} />)}
      </datalist>
    </div>
  )
}

function SelectField({
  label, value, options, onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1 min-w-0">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full h-9 px-2 rounded-md border border-border bg-card text-sm"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
