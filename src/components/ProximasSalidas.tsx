/**
 * "Plan de carga" — las salidas coordinadas de las próximas dos semanas,
 * agrupadas por día, en el mismo formato que el mail operativo de la mañana.
 *
 * El calendario de abajo sirve para ubicarse en la semana; esto sirve para
 * planificar: se lee de corrido, día por día, que es como se reparten las
 * unidades y los choferes.
 */
import { Fragment, useMemo, useState } from 'react'
import { ClipboardText, CaretDown, CaretRight } from '@phosphor-icons/react'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import { salidasProgramadas, totalCargas, SALIDAS_DIAS_ADELANTE, type SalidaProgramada } from '@/lib/partnerSalidas'
import { formatKg, formatM3 } from '@/lib/truckUtils'
import { fmtNum } from '@/lib/format'

/**
 * Los mismos colores de depósito que usa el mail: quien lee los dos ve la
 * misma señal en el mismo lugar.
 */
const COLOR_DEPOSITO: Record<string, string> = {
  TCP: 'bg-red-100 text-red-800 border-red-300',
  MONTECON: 'bg-blue-100 text-blue-800 border-blue-300',
  GODILCO: 'bg-amber-100 text-amber-800 border-amber-300',
  PLANIR: 'bg-green-100 text-green-800 border-green-300',
}
const colorDeposito = (d: string) =>
  COLOR_DEPOSITO[d.toUpperCase()] || 'bg-slate-100 text-slate-700 border-slate-300'

const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "MARTES 1 SEP" — el encabezado de día, como en el mail. */
function tituloDia(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  const f = new Date(a, m - 1, d)
  return `${DIAS[f.getDay()]} ${d} ${MESES[m - 1].toUpperCase()}`
}

/** Fecha corta para las columnas: "3 sep". */
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  if (!a || !m || !d) return iso
  return `${d} ${MESES[m - 1]}`
}

const Marca = ({ texto, titulo, clase }: { texto: string; titulo: string; clase: string }) => (
  <span title={titulo} className={`ml-1 text-[10px] font-bold ${clase}`}>{texto}</span>
)

function Celda({ c, esDeposito }: { c: SalidaProgramada; esDeposito: boolean }) {
  // El depósito ya sabe dónde carga: lo que necesita saber es quién viene.
  const primera = esDeposito ? c.transporte : c.deposito
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${
      esDeposito ? 'bg-slate-100 text-slate-700 border-slate-300' : colorDeposito(primera)
    }`}>
      {primera || '—'}
    </span>
  )
}

interface Props {
  shipments: ParsedShipment[]
  /** 'depot' muestra qué transporte viene; 'transport' muestra dónde carga. */
  rol: 'depot' | 'transport'
}

export default function ProximasSalidas({ shipments, rol }: Props) {
  const [abierto, setAbierto] = useState(true)
  const dias = useMemo(() => salidasProgramadas(shipments, new Date()), [shipments])
  const esDeposito = rol === 'depot'

  if (dias.length === 0) return null

  const total = totalCargas(dias)

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setAbierto(v => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        {abierto ? <CaretDown size={14} weight="bold" /> : <CaretRight size={14} weight="bold" />}
        <ClipboardText size={18} weight="duotone" className="text-primary" />
        <span className="font-semibold text-sm">
          Plan de carga · {total} {total === 1 ? 'carga' : 'cargas'}
        </span>
        <span className="text-xs text-muted-foreground">
          próximos {SALIDAS_DIAS_ADELANTE} días · en {dias.length} {dias.length === 1 ? 'jornada' : 'jornadas'}
        </span>
      </button>

      {abierto && (
        <div className="border-t border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">{esDeposito ? 'Transporte' : 'Carga en'}</th>
                <th className="text-left px-3 py-2">Ref</th>
                <th className="text-left px-3 py-2">Cliente</th>
                <th className="text-left px-3 py-2">Contenedor</th>
                <th className="text-left px-3 py-2">Op</th>
                <th className="text-left px-3 py-2">Mercadería</th>
                <th className="text-right px-3 py-2">Bultos</th>
                <th className="text-right px-3 py-2">Kg</th>
                <th className="text-right px-3 py-2">m³</th>
                <th className="text-left px-3 py-2">Destino</th>
                <th className="text-left px-3 py-2">Llega</th>
                <th className="text-left px-3 py-2">Libre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dias.map(dia => (
                <Fragment key={dia.fecha}>
                  <tr className="bg-primary/[0.06]">
                    <td colSpan={12} className="px-3 py-2 text-xs font-bold border-t-2 border-primary/25">
                      {tituloDia(dia.fecha)}
                      <span className="ml-2 font-semibold text-muted-foreground">
                        {dia.cargas.length} {dia.cargas.length === 1 ? 'carga' : 'cargas'}
                        {dia.kgTotal > 0 && <> · {formatKg(dia.kgTotal)} kg</>}
                      </span>
                    </td>
                  </tr>
                  {dia.cargas.map((c, i) => (
                    <tr key={`${dia.fecha}-${c.ref}-${c.cntr}-${i}`} className="hover:bg-muted/30">
                      <td className="px-3 py-2"><Celda c={c} esDeposito={esDeposito} /></td>
                      <td className="px-3 py-2 font-semibold whitespace-nowrap">
                        {c.ref}
                        {c.madera && <Marca texto="🪵" titulo="Embalaje de madera — SENASA en frontera" clase="" />}
                        {c.imo && <Marca texto="IMO" titulo="Carga peligrosa" clase="text-red-600" />}
                        {c.noApilable && <Marca texto="↥" titulo="No apilable" clase="text-violet-600" />}
                      </td>
                      <td className="px-3 py-2">{c.cliente || '—'}</td>
                      <td className="px-3 py-2 text-xs font-mono whitespace-nowrap">
                        {c.cntr || '—'}
                        {c.tipo && <span className="ml-1 text-muted-foreground">{c.tipo}</span>}
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{c.operativa || '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        {c.descripcion
                          ? <span className={c.especial ? 'font-semibold text-violet-700' : ''}>
                              {c.especial && '⚡ '}{c.descripcion}
                            </span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${c.muchosBultos ? 'font-semibold text-amber-700' : ''}`}>
                        {c.pkgs ? fmtNum(c.pkgs) : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${c.pesada ? 'font-semibold text-red-600' : ''}`}>
                        {c.kg ? formatKg(c.kg) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.m3 ? formatM3(c.m3) : '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{c.fiscal || '—'}</td>
                      <td className={`px-3 py-2 text-xs whitespace-nowrap ${c.llegadaAtipica ? 'font-semibold text-amber-700' : ''}`}>
                        {c.etaFiscal
                          ? <>{c.llegadaAtipica && '📌 '}{fechaCorta(c.etaFiscal)}</>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className={`px-3 py-2 text-xs whitespace-nowrap ${c.libreProximo ? 'font-semibold text-red-600' : ''}`}>
                        {c.libre
                          ? <>{c.libreProximo && '🔔 '}{/^\d{4}-/.test(c.libre) ? fechaCorta(c.libre) : c.libre}</>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border">
            <span className="font-semibold text-red-600">Kg en rojo</span>: más de 26 t ·{' '}
            <span className="font-semibold text-amber-700">bultos en ámbar</span>: más de 1000 ·{' '}
            ⚡ mercadería especial · 🔔 devolución próxima · 📌 llegada a fiscal en día atípico ·{' '}
            🪵 madera (SENASA) · IMO carga peligrosa · ↥ no apilable
          </p>
        </div>
      )}
    </section>
  )
}
