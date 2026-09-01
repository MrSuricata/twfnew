/**
 * Los datos clave de una LCL, en el orden que pidió Brian (01/09/2026): Ref,
 * Cliente, Fiscal, BL, Bultos, Kilos, M³, Nº stock, Madera, Apilable, IMO,
 * Entrega en planta, Llegada a Montevideo, Depósito de desconsolidación.
 *
 * Es UN solo componente para que el alta desde Operaciones (NewShipmentDialog),
 * el alta y la edición desde Camiones (LclAirManager) pidan lo mismo, en el
 * mismo orden. La LISTA (orden, etiquetas, control) sale de lib/datosClave —
 * acá solo se recorre y se dibuja el control que corresponde a cada dato. Lo
 * que guarda cada lado sale de `camposDesdeDatosClave` (lib/lclAlta), también
 * compartido. Ref propia (texto libre) y obligatoria; Cliente obligatorio.
 */
import { useMemo, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { canonicalizeCliente, type CatalogClient } from '@/lib/clientCatalog'
import { DEPOSITOS_UY } from '@/lib/operationsTypes'
import { FISCALES_BASE, LCL_DATOS_CLAVE_ORDEN, type LclDatosClaveState } from '@/lib/lclAlta'
import { datoClave } from '@/lib/datosClave'
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
  refExtra?: ReactNode
  refPlaceholder?: string
  /** Prefijo para ids de inputs/datalists (dos diálogos no chocan). */
  idPrefix?: string
  /** Edición de una carga existente: la ref no se toca acá (tiene su flujo con PIN). */
  refReadOnly?: boolean
}

const hint = (col: string): string | undefined => datoClave('lcl', col)?.hint

export default function LclDatosClave({
  value: f, onChange, clientes = [], knownFiscales = [], showErrors = false,
  refExtra, refPlaceholder, idPrefix = 'lcl', refReadOnly = false,
}: LclDatosClaveProps) {
  const fiscales = useMemo(
    () => Array.from(new Set([...FISCALES_BASE, ...knownFiscales.map(s => s.trim().toUpperCase()).filter(Boolean)])).sort(),
    [knownFiscales],
  )
  const missingRef = !f.ref.trim()
  const missingCliente = !f.cliente.trim()

  // Un control por dato clave, en el orden de la lista única. Las dos tildes
  // (IMO, planta) se juntan en una fila al final de su posición.
  const controles: ReactNode[] = []
  let tildes: ReactNode[] = []
  const volcarTildes = () => {
    if (tildes.length === 0) return
    controles.push(
      <div key="tildes" className="col-span-2 flex flex-wrap gap-x-6 gap-y-2 items-center pt-1">{tildes}</div>,
    )
    tildes = []
  }

  for (const d of LCL_DATOS_CLAVE_ORDEN) {
    if (d.col !== 'imo' && d.col !== 'entrega_planta') volcarTildes()
    switch (d.col) {
      case 'ref':
        controles.push(
          <div key={d.col} className="space-y-1 min-w-0">
            {refReadOnly ? (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{d.label}</Label>
                <div className="h-9 flex items-center px-3 rounded-md border border-border bg-muted/40 text-sm font-semibold">{f.ref}</div>
              </div>
            ) : (
              <Field
                id={`${idPrefix}-ref`}
                label={d.label}
                required
                value={f.ref}
                onChange={v => onChange({ ref: v })}
                placeholder={refPlaceholder ?? hint('ref')}
                error={showErrors && missingRef ? 'Completá la referencia' : null}
              />
            )}
            {refExtra}
          </div>,
        )
        break
      case 'cliente':
        controles.push(
          <div key={d.col} className="space-y-1 min-w-0">
            <Label htmlFor={`${idPrefix}-cli`} className="text-xs text-muted-foreground">
              {d.label} <span className="text-red-600">*</span>
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
              placeholder={d.label}
              aria-invalid={showErrors && missingCliente}
              className={`h-9 text-sm ${showErrors && missingCliente ? 'border-red-400' : ''}`}
            />
            <datalist id={`${idPrefix}-cli-list`}>
              {[...clientes].sort((a, b) => a.name.localeCompare(b.name, 'es')).map(c => (
                <option key={c.name} value={c.name} />
              ))}
            </datalist>
            {showErrors && missingCliente && <p className="text-xs text-red-600">Completá el cliente</p>}
          </div>,
        )
        break
      case 'fiscal':
        controles.push(
          <ComboField
            key={d.col}
            label={`${d.label} (destino)`}
            listId={`${idPrefix}-fiscal-list`}
            value={f.fiscal}
            options={fiscales}
            onChange={v => onChange({ fiscal: v })}
            placeholder={hint('fiscal')}
            catalogo
          />,
        )
        break
      case 'doc_number':
        controles.push(<Field key={d.col} label={d.label} value={f.docNumber} onChange={v => onChange({ docNumber: v })} placeholder={hint('doc_number')} />)
        break
      case 'pkgs':
        controles.push(<Field key={d.col} label={d.label} value={f.pkgs} onChange={v => onChange({ pkgs: v })} inputMode="decimal" placeholder="0" />)
        break
      case 'kg':
        controles.push(<Field key={d.col} label={d.label} value={f.kg} onChange={v => onChange({ kg: v })} inputMode="decimal" placeholder="0" />)
        break
      case 'm3':
        controles.push(<Field key={d.col} label={d.label} value={f.m3} onChange={v => onChange({ m3: v })} inputMode="decimal" placeholder="0" />)
        break
      case 'stock':
        controles.push(
          <div key={d.col} className="space-y-1 min-w-0">
            <Field label={d.label} value={f.stock} onChange={v => onChange({ stock: v })} placeholder={hint('stock')} />
            {f.stock.trim() && (
              <p className="text-[10px] text-muted-foreground leading-snug">
                Con stock la carga queda lista para camión; si no tiene fecha de desconsolidación, se estampa hoy.
              </p>
            )}
          </div>,
        )
        break
      case 'wood':
        controles.push(
          <SelectField
            key={d.col}
            label={d.label}
            value={f.wood === null ? 'confirmar' : f.wood ? 'si' : 'no'}
            options={[
              { value: 'confirmar', label: 'A confirmar' },
              { value: 'si', label: 'Sí' },
              { value: 'no', label: 'No' },
            ]}
            onChange={v => onChange({ wood: v === 'confirmar' ? null : v === 'si' })}
            className={f.wood ? 'text-red-600 font-semibold' : f.wood === null ? 'text-amber-600 font-medium' : ''}
          />,
        )
        break
      case 'no_apilable':
        controles.push(
          <div key={d.col} className="space-y-1 min-w-0">
            <SelectField
              label={d.label}
              value={f.apilable}
              options={[
                { value: 'sin_dato', label: 'Sí / sin dato' },
                { value: 'no', label: 'No — va arriba de todo' },
              ]}
              onChange={v => onChange({ apilable: v as LclDatosClaveState['apilable'] })}
              className={f.apilable === 'no' ? 'text-amber-700 font-semibold' : ''}
            />
            <p className="text-[10px] text-muted-foreground leading-snug">Solo se guarda si NO es apilable.</p>
          </div>,
        )
        break
      case 'imo':
        tildes.push(
          <label key={d.col} className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={f.imo}
              onChange={e => onChange({ imo: e.target.checked })}
              className="h-4 w-4 accent-primary"
            />
            {d.label} (mercancía peligrosa)
          </label>,
        )
        break
      case 'entrega_planta':
        tildes.push(
          <label key={d.col} className="flex items-center gap-2 text-sm cursor-pointer select-none" title="Del fiscal va directo a la planta del cliente. Dos entregas en planta en el mismo camión se pisan.">
            <input
              type="checkbox"
              checked={f.entregaPlanta}
              onChange={e => onChange({ entregaPlanta: e.target.checked })}
              className="h-4 w-4 accent-primary"
            />
            🏭 {d.label}
          </label>,
        )
        break
      case 'eta':
        controles.push(<Field key={d.col} label={d.label} type="date" value={f.eta} onChange={v => onChange({ eta: v })} />)
        break
      case 'deposito':
        controles.push(
          <ComboField
            key={d.col}
            label={d.label}
            listId={`${idPrefix}-dep-list`}
            value={f.deposito}
            options={DEPOSITOS_UY}
            onChange={v => onChange({ deposito: v })}
            placeholder={hint('deposito')}
            catalogo
          />,
        )
        break
      default:
        break
    }
  }
  volcarTildes()

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
      {controles}
    </div>
  )
}
