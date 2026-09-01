/**
 * Átomos de formulario del alta de carga. Vivían adentro de NewShipmentDialog;
 * salieron a un módulo propio para que el bloque "datos clave LCL" (que se
 * abre desde Operaciones Y desde Camiones) use exactamente los mismos.
 */
import { useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { matchCanonico, upperCat } from '@/lib/fuzzyCatalog'

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 pb-1 border-b">{title}</h4>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">{children}</div>
    </section>
  )
}

export function Field({
  label, value, onChange, type, placeholder, inputMode, wide, required, error, id,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  inputMode?: 'decimal'
  wide?: boolean
  /** Muestra el asterisco rojo. */
  required?: boolean
  /** Mensaje de error inline (pinta el borde rojo). */
  error?: string | null
  id?: string
}) {
  return (
    <div className={`space-y-1 min-w-0 ${wide ? 'col-span-2' : ''}`}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}{required && <span className="text-red-600"> *</span>}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        aria-invalid={!!error}
        className={`h-9 text-sm ${error ? 'border-red-400' : ''}`}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

// Input con datalist (acepta valores nuevos, sugiere los conocidos).
// Con `catalogo`: al salir del campo corrige typos contra los conocidos
// ("SNA ANTONIO" → SAN ANTONIO, con aviso y "Era otro" para deshacer) y si
// el valor es genuinamente nuevo lo normaliza a MAYÚSCULAS y avisa que se
// agrega al catálogo. Los datos fijos (puertos, países, shippers) no
// deberían nacer dos veces con dos grafías.
export function ComboField({
  label, value, options, onChange, placeholder, catalogo, listId: listIdProp,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
  placeholder?: string
  catalogo?: boolean
  /** Id del datalist (por defecto se deriva del label). */
  listId?: string
}) {
  const listId = listIdProp || `ns-list-${label.replace(/\W+/g, '-')}`
  const avisado = useRef('')
  const handleBlur = () => {
    if (!catalogo) return
    const v = value.trim()
    if (!v) return
    const m = matchCanonico(v, options)
    if (m) {
      if (m.canon !== v) onChange(m.canon)
      if (!m.exacto && avisado.current !== m.canon) {
        avisado.current = m.canon
        toast.info(`«${v}» → ${m.canon}`, {
          description: 'Corregido al valor ya conocido del catálogo.',
          action: { label: 'Era otro', onClick: () => onChange(upperCat(v)) },
        })
      }
    } else {
      const canon = upperCat(v)
      if (canon !== v) onChange(canon)
      if (avisado.current !== canon) {
        avisado.current = canon
        toast.info(`«${canon}» es nuevo — queda agregado al catálogo`)
      }
    }
  }
  return (
    <div className="space-y-1 min-w-0">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input list={listId} value={value} onChange={e => onChange(e.target.value)} onBlur={handleBlur} placeholder={placeholder} className="h-9 text-sm" />
      <datalist id={listId}>
        {options.map(o => <option key={o} value={o} />)}
      </datalist>
    </div>
  )
}

export function SelectField({
  label, value, options, onChange, className,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  className?: string
}) {
  return (
    <div className="space-y-1 min-w-0">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full h-9 px-2 rounded-md border border-border bg-card text-sm ${className || ''}`}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
