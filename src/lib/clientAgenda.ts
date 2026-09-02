/**
 * La AGENDA del cliente — sus movimientos derivados de las cargas activas.
 *
 * Brian (26/08): "que el cliente pueda ver estados, ver su semana, ver el mes
 * de cargas, ver últimas llegadas y cuándo van a salir y llegar sus próximas".
 *
 * Deriva TODO de los ParsedShipment que el portal ya recibe del server (solo
 * activas, whitelist puesta) — cero llamadas extra, cero datos nuevos:
 *   · llegada_mvd      → la ETA de la carga (llega el buque a Montevideo)
 *   · salida           → SALIDA por contenedor (sale hacia su depósito)
 *   · llegada_deposito → ETA_FISC por contenedor (llega a su depósito destino)
 *
 * Pura y testeable.
 */
import type { ParsedShipment } from './shipmentTypes'
import { porUruguay } from './hoyCliente'

/** llegada_mvd = el buque llega a Montevideo (vía UY) · llegada_destino = el
 *  buque llega al puerto de destino (Chile, Buenos Aires directo…) · salida =
 *  sale hacia el fiscal · llegada_deposito = llega al fiscal. */
export type TipoEvento = 'llegada_mvd' | 'llegada_destino' | 'salida' | 'llegada_deposito'

export interface EventoCliente {
  tipo: TipoEvento
  /** ISO YYYY-MM-DD */
  fecha: string
  ref: string
  /** La referencia PROPIA del cliente ('' si no está cargada). */
  clientRef: string
  cntr: string
  buque: string
  /** fecha − hoy en días: negativo = ya pasó · 0 = hoy · positivo = viene. */
  dias: number
}

export interface AgendaCliente {
  /** Hoy y los próximos 7 días, en orden. */
  estaSemana: EventoCliente[]
  /** Todos los del MES calendario de hoy (pasados y futuros). */
  esteMes: EventoCliente[]
  /** Llegadas a Montevideo de los últimos 14 días, la más nueva primero. */
  ultimasLlegadas: EventoCliente[]
  /** Todo lo que viene (hoy inclusive), en orden — salidas y llegadas. */
  proximos: EventoCliente[]
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}/
const txt = (v: unknown): string => String(v ?? '').trim()

/** Cómo se le nombra una carga AL CLIENTE: su referencia propia si está
 *  cargada, sino la nuestra SIN la A (regla de los mails con clientes).
 *  Una sola referencia visible — mostrar las dos juntas confunde (Brian 27/08). */
export function refParaCliente(s: { REF?: unknown; CLIENT_REF?: unknown } | null | undefined): string {
  const propia = txt(s?.CLIENT_REF)
  if (propia) return propia
  return txt(s?.REF).replace(/^A(?=\d)/, '')
}

const isoDia = (v: unknown): string | null => {
  const s = txt(v).slice(0, 10)
  return ISO_RE.test(s) ? s : null
}

const diffDias = (hoyISO: string, fecha: string): number =>
  Math.round((Date.parse(fecha + 'T00:00:00Z') - Date.parse(hoyISO + 'T00:00:00Z')) / 86400000)

/** Todos los eventos de las cargas del cliente, deduplicados y fechados. */
export function eventosCliente(shipments: ParsedShipment[], hoyISO: string): EventoCliente[] {
  const out: EventoCliente[] = []
  const vistos = new Set<string>()
  const push = (tipo: TipoEvento, fecha: string | null, s: ParsedShipment, cntr: string) => {
    if (!fecha) return
    const clave = `${tipo}|${s.REF}|${cntr}|${fecha}`
    if (vistos.has(clave)) return
    vistos.add(clave)
    out.push({
      tipo, fecha,
      ref: txt(s.REF),
      clientRef: txt((s as { CLIENT_REF?: string }).CLIENT_REF),
      cntr,
      buque: txt(s.BUQUE),
      dias: diffDias(hoyISO, fecha),
    })
  }

  for (const s of shipments || []) {
    push(porUruguay(s) ? 'llegada_mvd' : 'llegada_destino', isoDia(s.ETA), s, txt(s.CNTR))
    for (const op of s.operativas || []) {
      const cntr = txt(op.CNTR_OP)
      push('salida', isoDia(op.SALIDA), s, cntr)
      push('llegada_deposito', isoDia(op.ETA_FISC), s, cntr)
    }
  }

  out.sort((a, b) => (a.fecha !== b.fecha ? (a.fecha < b.fecha ? -1 : 1) : a.ref.localeCompare(b.ref)))
  return out
}

/** La agenda armada: semana, mes, últimas llegadas y próximos. */
export function agendaCliente(shipments: ParsedShipment[], hoyISO: string): AgendaCliente {
  const eventos = eventosCliente(shipments, hoyISO)
  const mes = hoyISO.slice(0, 7)
  return {
    estaSemana: eventos.filter(e => e.dias >= 0 && e.dias <= 7),
    esteMes: eventos.filter(e => e.fecha.slice(0, 7) === mes),
    ultimasLlegadas: eventos
      .filter(e => e.tipo === 'llegada_mvd' && e.dias < 0 && e.dias >= -14)
      .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    proximos: eventos.filter(e => e.dias >= 0),
  }
}

export const EVENTO_LABELS: Record<TipoEvento, string> = {
  llegada_mvd: 'Llega a Montevideo',
  llegada_destino: 'Llega a destino',
  salida: 'Sale hacia destino',
  llegada_deposito: 'Llega a destino',
}
