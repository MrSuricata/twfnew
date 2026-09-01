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
import type { DbShipment, Modality } from '@/lib/operationsTypes'
import {
  newDbShipment, MODALITY_LABELS, MODALITY_COLORS,
  DEPOSITOS_UY, STATUS_OPTIONS,
} from '@/lib/operationsTypes'
import { parseCntr } from '@/lib/cntrUtils'
import { fmtDMY } from '@/lib/salidaCheck'
import { sugerirEtaFiscal, nombreDia } from '@/lib/transitoFiscal'
import { canonicalizeCliente, type CatalogClient } from '@/lib/clientCatalog'
import {
  camposDesdeDatosClave, buscarRefDuplicada, parseNum,
  type Apilable, type LclDatosClaveState,
} from '@/lib/lclAlta'
import { Section, Field, ComboField, SelectField, RefDuplicadaAviso } from './formAtoms'
import LclDatosClave from './LclDatosClave'

// ── Alta de carga GUIADA ─────────────────────────────────────────────────
// Obligatorios: Ref + Cliente + Modalidad (decisión tomada — no cambiar).
// Rediseño 14/07 (pedido Brian): los DATOS PRINCIPALES van siempre visibles
// (shipper, incoterm, país/puerto de origen, puerto de destino, país/zona de
// destino, destino final), todos con combos creables (datalist: sugiere los
// ya usados y acepta uno nuevo — "agregar si no existe"). Si falta alguno,
// el primer click en Guardar avisa qué falta y el segundo guarda igual
// (obligatorios duros siguen siendo solo Ref+Cliente+Modo).
// El resto de los campos queda colapsado bajo "Más campos".
//
// LCL (pedido Brian 01/09/2026): arriba del pliegue van SOLO los 12 datos que
// importan para una consolidada — Ref, Cliente, Fiscal, BL, Bultos, Kilos, M³,
// Nº stock, Madera, Apilable, IMO, Entrega en planta — en ese orden, con el
// componente compartido <LclDatosClave> (el mismo que usa el alta desde
// Camiones). Shipper/incoterm/ruta bajan a "Más campos". FCL/aéreo/terrestre
// conservan el layout de siempre.
//
// Guarda en la tabla unificada `shipments` (source='web') vía onCreate
// (App.handleCreateShipment → POST /api/data/shipments, whitelist SHIPMENT_COLS).
// Lo reusa también el armador de camiones (crear carga sin salir del armador).

const MODES: Modality[] = ['lcl', 'air', 'land', 'fcl']

// Tipos de operativa conocidos (mismo combo no restrictivo del ViabilityBlock).
const OPERATIVA_OPTIONS = ['TRASIEGO', 'CONTENEDOR', 'CARGA A PISO']

const PAIS_OPTIONS = [
  { value: '', label: '—' },
  { value: 'UY', label: 'Uruguay (descarga en MVD)' },
  { value: 'AR', label: 'Argentina (Buenos Aires directo)' },
  { value: 'CL', label: 'Chile (San Antonio/Valparaíso)' },
  { value: 'OTRO', label: 'Otro' },
]

// Incoterms estándar para el combo (creable: acepta otro valor).
const INCOTERMS = ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']

// Países de origen frecuentes — semilla del datalist; se mezclan con los ya
// usados en las cargas (prop knownPaisesOrigen).
const PAISES_ORIGEN_BASE = [
  'CHINA', 'INDIA', 'VIETNAM', 'TURQUIA', 'COREA DEL SUR', 'TAIWAN', 'JAPON',
  'BRASIL', 'ESTADOS UNIDOS', 'ALEMANIA', 'ITALIA', 'ESPAÑA',
]

// Los "datos principales" del alta (pedido 14/07): si falta alguno se avisa
// antes de guardar (soft — el segundo click guarda igual). NO aplica a LCL:
// ahí los datos que importan son los 12 clave y van arriba.
const PRINCIPALES: { key: keyof FormState; label: string }[] = [
  { key: 'shipper', label: 'Shipper' },
  { key: 'incoterm', label: 'Incoterm' },
  { key: 'paisOrigen', label: 'País de origen' },
  { key: 'origin', label: 'Puerto de origen' },
  { key: 'dischargePort', label: 'Puerto de destino' },
  { key: 'pais', label: 'País/zona de destino' },
]

interface FormState {
  ref: string
  cliente: string
  // Datos clave
  deposito: string
  operativa: string
  libre: string
  fiscal: string
  desconsol: string
  /** LCL: nº de stock del depósito (vacío = todavía no lo dieron). */
  stock: string
  // Fechas
  etd: string
  eta: string
  salida: string
  etaFisc: string
  seguimiento: string
  // Ruta
  origin: string
  paisOrigen: string
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
  /** LCL: apilable en positivo (sin dato / sí / no) → no_apilable invertido. */
  apilable: Apilable
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
  ref: '', cliente: '',
  deposito: '', operativa: '', libre: '', fiscal: '', desconsol: '', stock: '',
  etd: '', eta: '', salida: '', etaFisc: '', seguimiento: '',
  origin: '', paisOrigen: '', dischargePort: '', destPort: '', pais: '',
  docNumber: '', buque: '', linea: '', shipper: '', agente: '', incoterm: '', clientRef: '',
  contenedor: '', tipo: '', pkgs: '', kg: '', m3: '', descripcion: '',
  transporte: '', despacho: '', dev: '', terminal: '', descarga: '', status: 'en_origen',
  telex: false, noApilable: false, apilable: 'sin_dato', wood: null, entregaPlanta: false,
  seguro: false, certi: false, impresa: false, imo: false, oog: false,
}

// Claves del form que en LCL ya se muestran arriba (datos clave): no se
// repiten en "Más campos" ni cuentan como "opcionales completados".
const LCL_CLAVE_KEYS = new Set<keyof FormState>([
  'ref', 'cliente', 'fiscal', 'docNumber', 'pkgs', 'kg', 'm3', 'stock',
  'wood', 'apilable', 'imo', 'entregaPlanta',
])

export default function NewShipmentDialog({
  open,
  onOpenChange,
  onCreate,
  suggestedRef = '',
  clientes = [],
  knownShippers = [],
  knownPaisesOrigen = [],
  knownOrigenes = [],
  knownDescargas = [],
  knownFiscales = [],
  cargasExistentes = [],
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Devuelve false si el alta se abortó (ej: REF duplicada y el usuario canceló). */
  onCreate: (row: DbShipment) => boolean | void
  /** Próxima ref FCL libre (máx A#### + 1) — se ofrece al elegir modo FCL. */
  suggestedRef?: string
  /** Catálogo de clientes: alimenta el datalist del campo Cliente y la
   *  canonicalización al blur (alias tipeado → nombre canónico). Texto libre
   *  sigue permitido. */
  clientes?: CatalogClient[]
  /** Sugerencias derivadas de las cargas existentes (datalist creables). */
  knownShippers?: string[]
  knownPaisesOrigen?: string[]
  knownOrigenes?: string[]
  knownDescargas?: string[]
  knownFiscales?: string[]
  /** Cargas ya existentes: aviso inline de ref repetida (activa) en LCL. */
  cargasExistentes?: { ref: string; archived?: boolean; cliente?: string }[]
}) {
  // Modalidad SIN default: es obligatoria y el operativo la elige a conciencia.
  const [mode, setMode] = useState<Modality | null>(null)
  const [f, setF] = useState<FormState>(EMPTY_FORM)
  const [moreOpen, setMoreOpen] = useState(false)
  // Se prende al intentar guardar con obligatorios vacíos → errores inline.
  const [showErrors, setShowErrors] = useState(false)
  // Soft-check de los datos principales: el 1er Guardar con faltantes solo
  // avisa; el 2do guarda igual (nunca bloquea — a veces el dato aún no existe).
  const [softWarned, setSoftWarned] = useState(false)

  const esLcl = mode === 'lcl'

  const paisesOrigenOptions = useMemo(
    () => Array.from(new Set([...PAISES_ORIGEN_BASE, ...knownPaisesOrigen])).sort(),
    [knownPaisesOrigen],
  )

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setF(prev => ({ ...prev, [key]: value }))
  const setMany = (patch: Partial<FormState>) => setF(prev => ({ ...prev, ...patch }))

  const reset = () => {
    setMode(null)
    setF(EMPTY_FORM)
    setMoreOpen(false)
    setShowErrors(false)
    setSoftWarned(false)
  }

  const pickMode = (m: Modality) => {
    setMode(m)
    // FCL nace con destino UY (mismo default de newDbShipment) — editable en Ruta.
    if (m === 'fcl' && !f.pais) set('pais', 'UY')
  }

  // Cuántos campos opcionales ya tienen algo (hint en el toggle colapsado).
  // OJO: wood es boolean | null (null = "a confirmar", el default del alta) —
  // null NO cuenta como cargado y NO se puede trimear (crasheaba el tab entero:
  // este memo corre aunque el diálogo esté cerrado).
  const filledCount = useMemo(() => {
    const skip = new Set<keyof FormState>(['ref', 'cliente', 'status'])
    if (esLcl) for (const k of LCL_CLAVE_KEYS) skip.add(k)
    return (Object.entries(f) as [keyof FormState, string | boolean | null][]).filter(([k, v]) => {
      if (skip.has(k)) return false
      if (v === null || v === undefined) return false
      if (k === 'apilable') return v !== 'sin_dato'
      return typeof v === 'boolean' ? v : String(v).trim() !== ''
    }).length
  }, [f, esLcl])

  const missingRef = !f.ref.trim()
  const missingCliente = !f.cliente.trim()
  const missingMode = mode === null
  const faltanPrincipales = esLcl ? [] : PRINCIPALES.filter(p => !String(f[p.key] ?? '').trim())

  // LCL: otra carga ACTIVA con la misma ref → aviso inline (no bloquea: el
  // alta sigue y App.handleCreateShipment vuelve a confirmar).
  const duplicada = useMemo(
    () => (esLcl ? buscarRefDuplicada(f.ref, cargasExistentes) : null),
    [esLcl, f.ref, cargasExistentes],
  )

  // Vista de los 12 datos clave LCL (subconjunto del form, mismos nombres).
  const datosClave: LclDatosClaveState = {
    ref: f.ref, cliente: f.cliente, fiscal: f.fiscal, docNumber: f.docNumber,
    pkgs: f.pkgs, kg: f.kg, m3: f.m3, stock: f.stock,
    wood: f.wood, apilable: f.apilable, imo: f.imo, entregaPlanta: f.entregaPlanta,
  }

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
    // Datos principales incompletos → avisar UNA vez; el 2do click guarda igual.
    if (faltanPrincipales.length > 0 && !softWarned) {
      setSoftWarned(true)
      toast.warning(`Datos principales sin completar: ${faltanPrincipales.map(p => p.label).join(', ')}`, {
        description: 'Podés guardar igual y completarlos después en la grilla.',
      })
      return
    }
    const m = mode as Modality
    // Salida cargada con el fiscal vacío → ofrecer la llegada normal del
    // tránsito (salida+2, finde → lunes), como en la ficha y el quick-edit.
    // Leer f directo (setState es async: set('etaFisc',…) no llegaría a este
    // mismo tick) y resolver en una variable local que va al row.
    let etaFiscFinal = f.etaFisc.trim()
    const salidaTrim = f.salida.trim()
    if (salidaTrim && !etaFiscFinal) {
      const sugerida = sugerirEtaFiscal(salidaTrim)
      if (sugerida) {
        const ok = window.confirm(
          `🚛 La salida queda el ${nombreDia(salidaTrim)} ${fmtDMY(salidaTrim)}.\n\n` +
          `¿Llevar la llegada a fiscal al ${nombreDia(sugerida)} ${fmtDMY(sugerida)}? (ahora: sin fecha)`
        )
        // Persistir también en el form: si el alta se aborta (REF duplicada y
        // el usuario cancela), el diálogo queda abierto — sin esto el próximo
        // click re-preguntaría y el campo ETA fiscal mostraría vacío.
        if (ok) { etaFiscFinal = sugerida; set('etaFisc', sugerida) }
      }
    }
    // LCL: los 12 datos clave se traducen con la MISMA función que el alta
    // desde Camiones (stock → desconsol_date=hoy si venía vacía, apilable →
    // no_apilable, etc.). Se aplican al final para que manden.
    const hoyISO = new Date().toISOString().slice(0, 10)
    const clave = m === 'lcl' ? camposDesdeDatosClave(datosClave, hoyISO, f.desconsol) : {}
    const row = newDbShipment({
      mode: m,
      ref: f.ref.trim(),
      cliente: f.cliente.trim(),
      client_ref: f.clientRef.trim(),
      shipper: f.shipper.trim(),
      agente: f.agente.trim(),
      incoterm: f.incoterm.trim(),
      doc_number: f.docNumber.trim(),
      buque: f.buque.trim(),
      linea: f.linea.trim(),
      origin: f.origin.trim(),
      origin_country: f.paisOrigen.trim(),
      discharge_port: f.dischargePort.trim(),
      dest_port: f.destPort.trim(),
      // País vacío → queda el default de newDbShipment (FCL nace 'UY').
      ...(f.pais ? { dest_country: f.pais } : {}),
      etd: f.etd.trim(),
      eta: f.eta.trim(),
      salida: f.salida.trim(),
      eta_fiscal: etaFiscFinal,
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
      ...clave,
    })
    // false = abortado (REF duplicada y canceló) → el diálogo queda abierto.
    if (onCreate(row) === false) return
    reset()
    onOpenChange(false)
  }

  // Indicadores según modalidad (IMO solo FCL/LCL, OOG solo FCL).
  // Madera NO va acá: es tri-estado (Sí/No/a confirmar) y tiene su selector propio.
  // En LCL, No apilable / Entrega en planta / IMO ya están arriba (datos clave).
  const flags: [string, keyof FormState][] = [
    ['Telex', 'telex'],
    ...(!esLcl ? [['No apilable', 'noApilable'] as [string, keyof FormState]] : []),
    ...(!esLcl ? [['Entrega en planta', 'entregaPlanta'] as [string, keyof FormState]] : []),
    ['Seguro', 'seguro'],
    ['Certificada', 'certi'],
    ['Impreso', 'impresa'],
    ...(mode === 'fcl' ? [['IMO', 'imo'] as [string, keyof FormState]] : []),
    ...(mode === 'fcl' ? [['Sobredimensionada (OOG)', 'oog'] as [string, keyof FormState]] : []),
  ]

  // Bloque "datos principales" (shipper/incoterm/ruta): arriba en FCL/aéreo/
  // terrestre; en LCL baja a "Más campos".
  const principalesFields = (
    <>
      <ComboField label="Shipper" value={f.shipper} options={knownShippers} onChange={v => set('shipper', v)} placeholder="Elegí o escribí uno nuevo…" catalogo />
      <ComboField label="Incoterm" value={f.incoterm} options={INCOTERMS} onChange={v => set('incoterm', v.toUpperCase())} placeholder="FOB, EXW…" catalogo />
      <ComboField label="País de origen" value={f.paisOrigen} options={paisesOrigenOptions} onChange={v => set('paisOrigen', v)} placeholder="CHINA…" catalogo />
      <ComboField label="Puerto de origen (POL)" value={f.origin} options={knownOrigenes} onChange={v => set('origin', v)} placeholder="SHANGHAI, NINGBO…" catalogo />
      <ComboField label="Puerto de destino (POD)" value={f.dischargePort} options={knownDescargas} onChange={v => set('dischargePort', v)} placeholder="MONTEVIDEO…" catalogo />
      <div className="space-y-1 min-w-0">
        <SelectField label="País / zona de destino" value={f.pais} options={PAIS_OPTIONS} onChange={v => set('pais', v)} />
        <p className="text-[10px] text-muted-foreground leading-snug">
          Es la zona del puerto de descarga: una carga a Argentina vía Montevideo va como <strong>Uruguay</strong>.
        </p>
      </div>
      <Field label="Destino final" value={f.destPort} onChange={v => set('destPort', v)} placeholder="CÓRDOBA, SAN FRANCISCO…" />
    </>
  )

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus size={20} /> Nueva carga</DialogTitle>
          <DialogDescription>
            {esLcl ? (
              <>
                <span className="text-red-600 font-semibold">*</span> Ref (la tuya) y cliente son obligatorios.
                Estos son los datos que importan para una consolidada; el resto va en “Más campos” o después en la grilla.
              </>
            ) : (
              <>
                <span className="text-red-600 font-semibold">*</span> Ref, cliente y modalidad son obligatorios.
                Los demás datos principales conviene cargarlos ahora (si no existe el shipper o el puerto, escribilo y queda creado);
                el resto va en “Más campos” o después en la grilla.
              </>
            )}
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

          {esLcl ? (
            /* ── LCL: los 12 datos clave, en el orden de Brian, y nada más arriba ── */
            <LclDatosClave
              idPrefix="ns-lcl"
              value={datosClave}
              onChange={patch => setMany(patch as Partial<FormState>)}
              clientes={clientes}
              knownFiscales={knownFiscales}
              showErrors={showErrors}
              refExtra={duplicada ? (
                <RefDuplicadaAviso ref_={f.ref} cliente={duplicada.cliente} onUsar={v => set('ref', v)} />
              ) : null}
            />
          ) : (
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
              {/* ── Datos principales (pedido 14/07): siempre visibles, combos
                  creables — el datalist sugiere lo ya usado y acepta un valor
                  nuevo (así se "agrega" un shipper/puerto que no existe). ── */}
              {principalesFields}
            </div>
          )}

          {softWarned && faltanPrincipales.length > 0 && (
            <p className="text-xs text-[var(--warn-suave-fg)] bg-[var(--warn-suave-bg)] border border-[var(--warn-suave-bd)] rounded-xl px-3 py-2">
              Sin completar: {faltanPrincipales.map(p => p.label).join(', ')}. Tocá <strong>Guardar igual</strong> para crear la carga así.
            </p>
          )}

          {/* ── Más campos (opcionales, colapsables) ── */}
          <button
            type="button"
            onClick={() => setMoreOpen(v => !v)}
            className="w-full flex items-center justify-center gap-1.5 rounded-full border border-dashed border-[var(--borde-punteado)] py-2 text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          >
            <CaretDown size={12} className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
            {moreOpen ? 'Ocultar campos opcionales' : 'Más campos (todos opcionales)'}
            {!moreOpen && filledCount > 0 && <span className="text-primary font-medium">· {filledCount} completados</span>}
          </button>

          {moreOpen && (
            <div className="space-y-4">
              {/* LCL: shipper/incoterm/ruta viven acá (arriba van los datos clave) */}
              {esLcl && (
                <Section title="Shipper y ruta">
                  {principalesFields}
                </Section>
              )}

              {/* Datos clave */}
              <Section title={esLcl ? 'Depósito y operativa' : 'Datos clave'}>
                <ComboField label="Depósito UY" value={f.deposito} options={DEPOSITOS_UY} onChange={v => set('deposito', v)} placeholder="GODILCO, PLANIR…" catalogo />
                <ComboField label="Operativa" value={f.operativa} options={OPERATIVA_OPTIONS} onChange={v => set('operativa', v)} placeholder="TRASIEGO…" catalogo />
                <Field label="Libre (máx. devolución)" type="date" value={f.libre} onChange={v => set('libre', v)} />
                {!esLcl && <Field label="Fiscal (destino)" value={f.fiscal} onChange={v => set('fiscal', v)} placeholder="LOGIFRONT, FISCALIA…" />}
                <Field label="Desconsolidación" type="date" value={f.desconsol} onChange={v => set('desconsol', v)} />
              </Section>

              {/* Fechas */}
              <Section title="Fechas">
                <Field label="ETD" type="date" value={f.etd} onChange={v => set('etd', v)} />
                <Field label={esLcl ? 'ETA MVD' : 'ETA'} type="date" value={f.eta} onChange={v => set('eta', v)} />
                <Field label="Salida" type="date" value={f.salida} onChange={v => set('salida', v)} />
                <Field label="ETA fiscal" type="date" value={f.etaFisc} onChange={v => set('etaFisc', v)} />
                <Field label="Seguimiento" type="date" value={f.seguimiento} onChange={v => set('seguimiento', v)} />
              </Section>

              {/* Documental (ruta y shipper/incoterm subieron a Datos principales) */}
              <Section title="Documental">
                {!esLcl && <Field label="Booking / BL / AWB / CRT" value={f.docNumber} onChange={v => set('docNumber', v)} placeholder="Documento" />}
                <Field label="Buque" value={f.buque} onChange={v => set('buque', v)} />
                <Field label="Línea" value={f.linea} onChange={v => set('linea', v)} placeholder="MAERSK, COSCO…" />
                <Field label="Ref cliente" value={f.clientRef} onChange={v => set('clientRef', v)} />
                <Field label="Agente" value={f.agente} onChange={v => set('agente', v)} />
              </Section>

              {/* Carga */}
              <Section title="Carga">
                {!esLcl && <Field label="Contenedor(es)" value={f.contenedor} onChange={v => set('contenedor', v)} placeholder="MSKU1234567, TCLU7654321…" wide />}
                <Field label="Tipo" value={f.tipo} onChange={v => set('tipo', v)} placeholder={esLcl ? 'PALLETS, CAJAS…' : '40HC, 20DRY…'} />
                {!esLcl && (
                  <>
                    <Field label="Bultos" value={f.pkgs} onChange={v => set('pkgs', v)} inputMode="decimal" placeholder="0" />
                    <Field label="Kg" value={f.kg} onChange={v => set('kg', v)} inputMode="decimal" placeholder="0" />
                    <Field label="M³" value={f.m3} onChange={v => set('m3', v)} inputMode="decimal" placeholder="0" />
                  </>
                )}
                <Field label="Descripción" value={f.descripcion} onChange={v => set('descripcion', v)} placeholder="Mercadería…" wide />
                <div className="col-span-2 space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Indicadores</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
                    {/* Madera: tri-estado — toda carga nueva nace "A confirmar" (null),
                        no "No": false diría confirmado sin que nadie lo haya chequeado.
                        En LCL ya está arriba, en los datos clave. */}
                    {!esLcl && (
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
                    )}
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
                <Field label="Descarga (lugar post-fiscal)" value={f.descarga} onChange={v => set('descarga', v)} placeholder="RÍO SEGUNDO, planta…" />
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
          <Button onClick={save} className="gap-1.5">
            <Plus size={16} /> {softWarned && faltanPrincipales.length > 0 ? 'Guardar igual' : 'Agregar carga'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
