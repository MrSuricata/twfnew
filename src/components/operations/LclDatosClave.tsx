/**
 * Los 12 datos que importan al dar de alta una LCL, en el orden que pidió
 * Brian (01/09/2026): Ref, Cliente, Fiscal, BL, Bultos, Kilos, M³, Nº stock,
 * Madera, Apilable, IMO, Entrega en planta.
 *
 * Es UN solo componente para que el alta desde Operaciones (NewShipmentDialog)
 * y desde Camiones (LclAirManager) pidan lo mismo, en el mismo orden. Lo que
 * guarda cada lado sale de `camposDesdeDatosClave` (lib/lclAlta), también
 * compartido. Ref propia (texto libre) y obligatoria; Cliente obligatorio.
 */
import { useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { canonicalizeCliente, type CatalogClient } from '@/lib/clientCatalog'
import { FISCALES_BASE, type LclDatosClaveState } from '@/lib/lclAlta'
import { Field, ComboField, SelectField } from './formAtoms'

export interface LclDatosClaveProps {
  value: LclDatosClaveState
  onChange: (patch: Partial<LclDatosClaveState>) => void
  /** Catálogo de clientes: datalist + canonicalización al blur. */
  clientes?: CatalogClient[]
  knownFiscales?: string[]
  /** Pinta en rojo Ref/Cliente vacíos (se prende al intentar guardar). */
  showErrors?: boolean
  /** Contenido extra debajo de Ref: sugerida, aviso de duplicada, etc. */
  refExtra?: React.ReactNode
  refPlaceholder?: string
  /** Prefijo para ids de inputs/datalists (dos diálogos no chocan). */
  idPrefix?: string
}

export default function LclDatosClave({
  value: f, onChange, clientes = [], knownFiscales = [], showErrors = false,
  refExtra, refPlaceholder = 'LCL247, E163 A…', idPrefix = 'lcl',
}: LclDatosClaveProps) {
  const fiscales = useMemo(
    () => Array.from(new Set([...FISCALES_BASE, ...knownFiscales.map(s => s.trim().toUpperCase()).filter(Boolean)])).sort(),
    [knownFiscales],
  )
  const missingRef = !f.ref.trim()
  const missingCliente = !f.cliente.trim()

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
      {/* 1 · Ref propia, texto libre, obligatoria */}
      <div className="space-y-1 min-w-0">
        <Field
          id={`${idPrefix}-ref`}
          label="Ref"
          required
          value={f.ref}
          onChange={v => onChange({ ref: v })}
          placeholder={refPlaceholder}
          error={showErrors && missingRef ? 'Completá la referencia' : null}
        />
        {refExtra}
      </div>

      {/* 2 · Cliente */}
      <div className="space-y-1 min-w-0">
        <Label htmlFor={`${idPrefix}-cli`} className="text-xs text-muted-foreground">
          Cliente <span className="text-red-600">*</span>
        </Label>
        <Input
          id={`${idPrefix}-cli`}
          list={`${idPrefix}-cli-list`}
          value={f.cliente}
          onChange={e => onChange({ cliente: e.target.value })}
          onBlur={() => {
            const canon = canonicalizeCliente(f.cliente, clientes)
            if (canon !== f.cliente) onChange({ cliente: canon })
          }}
          placeholder="Cliente"
          aria-invalid={showErrors && missingCliente}
          className={`h-9 text-sm ${showErrors && missingCliente ? 'border-red-400' : ''}`}
        />
        <datalist id={`${idPrefix}-cli-list`}>
          {[...clientes].sort((a, b) => a.name.localeCompare(b.name, 'es')).map(c => (
            <option key={c.name} value={c.name} />
          ))}
        </datalist>
        {showErrors && missingCliente && <p className="text-xs text-red-600">Completá el cliente</p>}
      </div>

      {/* 3 · Fiscal (destino AR) */}
      <ComboField
        label="Fiscal (destino)"
        listId={`${idPrefix}-fiscal-list`}
        value={f.fiscal}
        options={fiscales}
        onChange={v => onChange({ fiscal: v })}
        placeholder="RAFAELA, CACEC, DFC…"
        catalogo
      />
      {/* 4 · BL */}
      <Field label="BL" value={f.docNumber} onChange={v => onChange({ docNumber: v })} placeholder="Nº de BL" />
      {/* 5 · Bultos · 6 · Kilos · 7 · M³ */}
      <Field label="Bultos" value={f.pkgs} onChange={v => onChange({ pkgs: v })} inputMode="decimal" placeholder="0" />
      <Field label="Kilos" value={f.kg} onChange={v => onChange({ kg: v })} inputMode="decimal" placeholder="0" />
      <Field label="M³" value={f.m3} onChange={v => onChange({ m3: v })} inputMode="decimal" placeholder="0" />
      {/* 8 · Nº stock: lo da el depósito al desconsolidar; vacío = todavía no */}
      <div className="space-y-1 min-w-0">
        <Field label="Nº stock" value={f.stock} onChange={v => onChange({ stock: v })} placeholder="vacío = el depósito no lo dio" />
        {f.stock.trim() && (
          <p className="text-[10px] text-muted-foreground leading-snug">
            Con stock la carga queda lista para camión; si no tiene fecha de desconsolidación, se estampa hoy.
          </p>
        )}
      </div>

      {/* 9 · Madera (tri-estado: toda carga nueva nace "a confirmar") */}
      <SelectField
        label="Madera"
        value={f.wood === null ? 'confirmar' : f.wood ? 'si' : 'no'}
        options={[
          { value: 'confirmar', label: 'A confirmar' },
          { value: 'si', label: 'Sí' },
          { value: 'no', label: 'No' },
        ]}
        onChange={v => onChange({ wood: v === 'confirmar' ? null : v === 'si' })}
        className={f.wood ? 'text-red-600 font-semibold' : f.wood === null ? 'text-amber-600 font-medium' : ''}
      />
      {/* 10 · Apilable (columna no_apilable invertida; "sin dato" no marca nada) */}
      <SelectField
        label="Apilable"
        value={f.apilable}
        options={[
          { value: 'sin_dato', label: 'Sin dato' },
          { value: 'si', label: 'Sí' },
          { value: 'no', label: 'No — va arriba de todo' },
        ]}
        onChange={v => onChange({ apilable: v as LclDatosClaveState['apilable'] })}
        className={f.apilable === 'no' ? 'text-amber-700 font-semibold' : ''}
      />
      {/* 11 · IMO · 12 · Entrega en planta */}
      <div className="col-span-2 flex flex-wrap gap-x-6 gap-y-2 items-center pt-1">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={f.imo}
            onChange={e => onChange({ imo: e.target.checked })}
            className="h-4 w-4 accent-primary"
          />
          IMO (mercancía peligrosa)
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none" title="Del fiscal va directo a la planta del cliente. Dos entregas en planta en el mismo camión se pisan.">
          <input
            type="checkbox"
            checked={f.entregaPlanta}
            onChange={e => onChange({ entregaPlanta: e.target.checked })}
            className="h-4 w-4 accent-primary"
          />
          🏭 Entrega en planta
        </label>
      </div>
    </div>
  )
}
