/**
 * Lo que se le viene al transporte y todavía no tiene fecha de carga.
 *
 * El panel del partner es un calendario, y el calendario dibuja eventos a
 * partir de la SALIDA. Una carga asignada que aún no se coordinó no tiene
 * salida, así que no genera evento y el transporte no la ve en ningún lado
 * (medido para TRANSCAL el 01/09: 17 de sus cargas vivas eran invisibles).
 *
 * Para un transporte, "qué se me viene" es la pregunta central: es lo que le
 * permite reservar camión y chofer. Esta lista responde eso.
 *
 * Una fila POR CONTENEDOR, igual que el armador: el camión lleva uno.
 */
import type { ParsedShipment, OperativasRecord } from './shipmentTypes'
import { parseLocalDate } from './shipmentTypes'

/** Una llegada más vieja que esto ya es historia, no trabajo por coordinar. */
export const PROXIMAS_DIAS_ATRAS = 21

export interface CargaProxima {
  ref: string
  cliente: string
  cntr: string
  /** Depósito donde va a cargar. */
  deposito: string
  /** Fiscal de destino. */
  fiscal: string
  tipo: string
  buque: string
  /** Llegada a puerto. */
  eta: string
  /** Días hasta la llegada; negativo = ya llegó y sigue sin coordinar. */
  diasAEta: number
  kg: number
  m3: number
  pkgs: number
  descripcion: string
  /** Dispara SENASA en frontera: el chofer tiene que saberlo antes de salir. */
  madera: boolean
}

const MS_DIA = 86_400_000
const medianoche = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const txt = (v: unknown): string => String(v ?? '').trim()
const num = (v: unknown): number => Number(v) || 0

/**
 * Cargas del partner con llegada prevista (o recién llegadas) a las que
 * todavía no se les puso fecha de carga.
 *
 * `shipments` ya viene filtrado por el server con SOLO las operativas del
 * partner, así que acá no hay que volver a filtrar por transporte.
 */
export function proximasSinCoordinar(shipments: ParsedShipment[], hoy: Date): CargaProxima[] {
  const h = medianoche(hoy).getTime()
  const out: CargaProxima[] = []

  for (const s of shipments) {
    const etaCarga = txt((s as unknown as Record<string, unknown>).ETA)
    for (const op of (s.operativas || []) as OperativasRecord[]) {
      // Ya coordinada o ya entregada: el calendario la muestra, o terminó.
      if (txt(op.SALIDA) || txt(op.ETA_FISC)) continue

      const etaTxt = txt(op.ETA_OP) || etaCarga
      const eta = parseLocalDate(etaTxt)
      if (!eta) continue                       // sin ETA no hay nada que prever

      const dias = Math.round((medianoche(eta).getTime() - h) / MS_DIA)
      if (dias < -PROXIMAS_DIAS_ATRAS) continue  // llegada vieja = historia

      out.push({
        ref: txt(op.REF) || txt((s as unknown as Record<string, unknown>).REF),
        cliente: txt(op.CLIENTE_OP) || txt((s as unknown as Record<string, unknown>).CLIENTE),
        cntr: txt(op.CNTR_OP),
        deposito: txt(op.DEPOSITO),
        fiscal: txt(op.FISCAL),
        tipo: txt(op.TIPO),
        buque: txt((s as unknown as Record<string, unknown>).BUQUE),
        eta: etaTxt,
        diasAEta: dias,
        kg: num(op.KG),
        m3: num(op.M3),
        pkgs: num(op.PKGS),
        descripcion: txt(op.DESCRIPCION),
        madera: txt(op.WOOD).toUpperCase().startsWith('SI'),
      })
    }
  }

  // Lo que ya llegó primero (es lo que aprieta), después por llegada próxima.
  return out.sort((a, b) => a.diasAEta - b.diasAEta)
}
