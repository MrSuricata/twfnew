// Sección de salidas y arribos por contenedor (Panel detalle de operación FCL).
// Se monta entre ViabilityBlock y la sección "Contenedores".
// Editable solo cuando la operación es una fila DB (FCL horneada) no read-only.

import type { UnifiedOperation } from '@/lib/operationsTypes'
import type { OperativasRecord } from '@/lib/shipmentTypes'
import { getShipmentStatus } from '@/lib/shipmentTypes'
import { parseCntr } from '@/lib/cntrUtils'

const LUGAR_OPTIONS = [
  { value: '', label: '— en terminal —' },
  { value: 'TCP', label: 'TCP' },
  { value: 'MONTECON', label: 'MONTECON' },
  { value: 'GODILCO', label: 'GODILCO' },
  { value: 'PLANIR', label: 'PLANIR' },
]

/** Micro-status para un contenedor individual derivado de su OperativasRecord. */
function microStatus(op: UnifiedOperation, record: OperativasRecord): string {
  const mini = {
    REF: op.ref,
    CLIENTE: op.cliente || '',
    ETA: op.eta,
    ETD: op.etd,
    FT: 0,
    LIBRE_HASTA: '',
    CNTR: record.CNTR_OP || '',
    N: 1,
    MBL: '',
    LINEA: '',
    BUQUE: '',
    TERMINAL: '',
    C_TERMINAL: 0,
    C_DEV: 0,
    LOCALES: 0,
    FLETE: 0,
    FORMA_DE_PAGO: 'al arribo' as const,
    VTO: '',
    CR: false,
    BL: false,
    AD: false,
    AT: false,
    POL: '',
    POD: '',
    PAIS: 'OTRO' as const,
    SEGUIMIENTO: '',
    TIPO: '',
    containers: [],
    calculatedN: 1,
    calculatedLibreHasta: '',
    operativas: [record],
  }
  return getShipmentStatus(mini).label
}

export default function ContainerDatesSection({
  op,
  editable,
  onCommitOperativas,
}: {
  op: UnifiedOperation
  editable: boolean
  onCommitOperativas: (next: OperativasRecord[]) => void
}) {
  const cntrs = parseCntr(op.cntr)
  // Si no hay contenedores, no hay nada que mostrar.
  if (cntrs.length === 0) return null

  // Solo relevante para FCL (o DB rows con modo fcl).
  if (op.mode !== 'fcl') return null

  const existing = op.operativas || []

  /** Devuelve el OperativasRecord para el índice i, o un registro vacío. */
  const recordFor = (i: number): OperativasRecord => {
    const found = existing[i]
    if (found) return found
    return {
      REF: op.ref,
      TLX: '',
      DEPOSITO: op.deposito || '',
      ETA_OP: op.eta || '',
      SALIDA: '',
      ETA_FISC: '',
      LIBRE: op.libre || '',
      OPERATIVA: op.operativa || '',
      CNTR_OP: cntrs[i] || '',
      PKGS: 0,
      KG: 0,
      M3: 0,
      DESCRIPCION: '',
      FISCAL: op.fiscal || '',
      DESCARGA: '',
      DEV: '',
      CLIENTE_OP: op.cliente || '',
      TIPO: op.tipo || '',
      WOOD: op.wood ? 'SI' : '',
      TRANSPORTE: op.transporte || '',
      HORARIO: '',
      LUGAR_SALIDA: '',
    }
  }

  /** Construye el array completo actualizado cuando se edita un campo de un contenedor. */
  const buildNext = (
    idx: number,
    patch: Partial<Pick<OperativasRecord, 'SALIDA' | 'ETA_FISC' | 'LUGAR_SALIDA'>>
  ): OperativasRecord[] => {
    return cntrs.map((_, i) => {
      const base = recordFor(i)
      if (i === idx) return { ...base, ...patch }
      return base
    })
  }

  const handleChange = (
    idx: number,
    field: 'SALIDA' | 'ETA_FISC' | 'LUGAR_SALIDA',
    value: string
  ) => {
    onCommitOperativas(buildNext(idx, { [field]: value }))
  }

  return (
    <section className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Salidas y arribos por contenedor ({cntrs.length})
        </span>
      </div>

      <div className="space-y-3">
        {cntrs.map((cntr, i) => {
          const rec = recordFor(i)
          const status = microStatus(op, rec)

          return (
            <div
              key={`${cntr}-${i}`}
              className="grid grid-cols-[auto_1fr_1fr_1fr_auto] items-center gap-x-2 gap-y-1 rounded-md border bg-background px-2.5 py-2"
            >
              {/* Código contenedor */}
              <span className="text-[12px] font-mono font-medium text-foreground min-w-[110px] truncate" title={cntr}>
                {cntr}
              </span>

              {/* Salida MVD */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground leading-none">Salida MVD</span>
                {editable ? (
                  <input
                    type="date"
                    value={rec.SALIDA || ''}
                    onChange={e => handleChange(i, 'SALIDA', e.target.value)}
                    className="h-7 rounded border border-input bg-background px-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                ) : (
                  <span className={`text-[13px] font-medium ${rec.SALIDA ? '' : 'text-muted-foreground'}`}>
                    {rec.SALIDA || '—'}
                  </span>
                )}
              </div>

              {/* Arribo fiscal */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground leading-none">Arribo fiscal</span>
                {editable ? (
                  <input
                    type="date"
                    value={rec.ETA_FISC || ''}
                    onChange={e => handleChange(i, 'ETA_FISC', e.target.value)}
                    className="h-7 rounded border border-input bg-background px-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                ) : (
                  <span className={`text-[13px] font-medium ${rec.ETA_FISC ? '' : 'text-muted-foreground'}`}>
                    {rec.ETA_FISC || '—'}
                  </span>
                )}
              </div>

              {/* Lugar de salida */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground leading-none">Lugar</span>
                {editable ? (
                  <select
                    value={rec.LUGAR_SALIDA || ''}
                    onChange={e => handleChange(i, 'LUGAR_SALIDA', e.target.value)}
                    className="h-7 rounded border border-input bg-background px-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {LUGAR_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : (
                  <span className={`text-[13px] font-medium ${rec.LUGAR_SALIDA ? '' : 'text-muted-foreground'}`}>
                    {rec.LUGAR_SALIDA || '—'}
                  </span>
                )}
              </div>

              {/* Micro-status */}
              <span className="text-[11px] text-muted-foreground text-right whitespace-nowrap min-w-[80px]" title="Estado derivado">
                {status}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
