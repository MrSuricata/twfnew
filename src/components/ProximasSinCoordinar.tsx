/**
 * "Se vienen" — las cargas del partner que todavía no tienen fecha de carga.
 *
 * El calendario solo dibuja lo coordinado; esto es lo que está por caer y
 * necesita camión. Para un transporte es la lista con la que reserva unidad y
 * chofer, y hasta hoy no la tenía en ningún lado.
 */
import { useMemo, useState } from 'react'
import { CalendarPlus, CaretDown, CaretRight } from '@phosphor-icons/react'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import { proximasSinCoordinar } from '@/lib/partnerProximas'
import { formatKg, formatM3 } from '@/lib/truckUtils'
import { fmtDateDMY } from '@/lib/format'

export default function ProximasSinCoordinar({ shipments }: { shipments: ParsedShipment[] }) {
  const [abierto, setAbierto] = useState(true)
  const filas = useMemo(() => proximasSinCoordinar(shipments, new Date()), [shipments])

  if (filas.length === 0) return null

  const llegadas = filas.filter(f => f.diasAEta < 0).length

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setAbierto(v => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        {abierto ? <CaretDown size={14} weight="bold" /> : <CaretRight size={14} weight="bold" />}
        <CalendarPlus size={18} weight="duotone" className="text-primary" />
        <span className="font-semibold text-sm">Se vienen · {filas.length}</span>
        <span className="text-xs text-muted-foreground">
          sin fecha de carga
          {llegadas > 0 && <> · <strong className="text-orange-700">{llegadas} ya llegaron</strong></>}
        </span>
      </button>

      {abierto && (
        <div className="border-t border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Ref</th>
                <th className="text-left px-3 py-2">Cliente</th>
                <th className="text-left px-3 py-2">Contenedor</th>
                <th className="text-left px-3 py-2">Carga en</th>
                <th className="text-left px-3 py-2">Destino</th>
                <th className="text-right px-3 py-2">Kg</th>
                <th className="text-right px-3 py-2">m³</th>
                <th className="text-left px-3 py-2">Llega</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map((f, i) => (
                <tr key={`${f.ref}-${f.cntr}-${i}`} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-semibold whitespace-nowrap">
                    {f.ref}
                    {f.madera && (
                      <span
                        title="Lleva madera — SENASA en frontera"
                        className="ml-1.5 text-[10px] font-bold text-amber-700"
                      >
                        🪵
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{f.cliente || '—'}</td>
                  <td className="px-3 py-2 text-xs font-mono whitespace-nowrap">
                    {f.cntr || '—'}
                    {f.tipo && <span className="ml-1 text-muted-foreground">{f.tipo}</span>}
                  </td>
                  <td className="px-3 py-2">{f.deposito || <span className="text-muted-foreground">a definir</span>}</td>
                  <td className="px-3 py-2">{f.fiscal || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f.kg ? formatKg(f.kg) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f.m3 ? formatM3(f.m3) : '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    {fmtDateDMY(f.eta)}
                    <span className={f.diasAEta < 0 ? 'ml-1 font-semibold text-orange-700' : 'ml-1 text-muted-foreground'}>
                      {f.diasAEta < 0
                        ? `· llegó hace ${-f.diasAEta}d`
                        : f.diasAEta === 0 ? '· hoy' : `· en ${f.diasAEta}d`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border">
            Todavía no tienen fecha de carga asignada. Cuando se coordinen aparecen en el calendario de abajo.
          </p>
        </div>
      )}
    </section>
  )
}
