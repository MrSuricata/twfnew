/**
 * Plan de carga del partner: las salidas ya coordinadas, agrupadas por día.
 *
 * Es el mismo recorte que el mail operativo de las 08:00 ("🚚 TRANSCAL — Plan
 * de Carga", agrupado por fecha de salida): el depósito y el transporte ya
 * leen ese formato todos los días, así que el panel lo repite en vez de
 * inventar otra vista.
 *
 * Sólo entra lo que tiene fecha de carga puesta. Lo que todavía se está
 * acomodando no se publica: mientras no hay fecha, la carga puede cambiar de
 * transporte, de depósito o de semana, y el partner no tiene por qué ver ese
 * ida y vuelta.
 *
 * Una fila POR CONTENEDOR, igual que el armador de camiones: el camión lleva
 * uno.
 */
import type { ParsedShipment, OperativasRecord } from './shipmentTypes'
import { parseLocalDate } from './shipmentTypes'

/** Horizonte del plan: dos semanas es lo que se planifica con unidad y chofer. */
export const SALIDAS_DIAS_ADELANTE = 14

/** Arriba de esto el camión va al límite de peso y conviene avisarlo. */
export const KG_ALERTA = 26_000

/** Bultos de más: la descarga deja de ser un rato y pasa a ser una jornada. */
export const PKGS_ALERTA = 1000

/** Días de gracia para avisar que se viene el vencimiento del libre. */
export const LIBRE_AVISO_DIAS = 4

/**
 * Mercadería que no se carga como una caja más: hay que saberlo antes de
 * mandar la unidad. Misma lista que el mail operativo.
 */
const PALABRAS_ESPECIALES = [
  'MÁQUINA', 'MAQUINA', 'CNC', 'TELAS', 'TELA',
  'CUBIERTAS', 'CÁMARAS', 'CAMARAS', 'IMO',
]

export interface SalidaProgramada {
  ref: string
  cliente: string
  cntr: string
  tipo: string
  /** Dónde carga el camión. */
  deposito: string
  /** Qué transporte viene a cargar (lo que le importa al depósito). */
  transporte: string
  /** TRASIEGO · CONTENEDOR · CARGA A PISO. */
  operativa: string
  horario: string
  descripcion: string
  /** Fiscal de destino. */
  fiscal: string
  /** Fecha de carga (ISO). */
  salida: string
  /** Llegada prevista al fiscal (ISO), si está. */
  etaFiscal: string
  /** Libre máximo de devolución (ISO) o texto tipo DEVUELTO. */
  libre: string
  pkgs: number
  kg: number
  m3: number
  // ── Marcas operativas, mismas reglas que el mail ──
  /** Pasa los 26 t. */
  pesada: boolean
  /** Pasa los 1000 bultos. */
  muchosBultos: boolean
  /** Mercadería que necesita trato especial. */
  especial: boolean
  /** El libre vence dentro de los próximos días. */
  libreProximo: boolean
  /** Llega a fiscal sábado, domingo o martes: se confirma, no se asume. */
  llegadaAtipica: boolean
  /** Embalaje de madera: dispara SENASA en frontera. */
  madera: boolean
  /** Carga peligrosa. */
  imo: boolean
  /** No se puede estibar encima. */
  noApilable: boolean
}

export interface DiaDeCarga {
  /** ISO del día. */
  fecha: string
  cargas: SalidaProgramada[]
  kgTotal: number
}

const MS_DIA = 86_400_000
const medianoche = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const txt = (v: unknown): string => String(v ?? '').trim()
const num = (v: unknown): number => Number(v) || 0
const siNo = (v: unknown): boolean => txt(v).toUpperCase().startsWith('SI')

/** Mercadería de la lista especial (máquinas, telas, cubiertas, IMO…). */
export function esCargaEspecial(descripcion: string): boolean {
  const d = txt(descripcion).toUpperCase()
  return d !== '' && PALABRAS_ESPECIALES.some(p => d.includes(p))
}

/** El libre vence entre hoy y los próximos LIBRE_AVISO_DIAS días. */
export function libreProximoAVencer(libre: string, hoy: Date): boolean {
  const f = parseLocalDate(txt(libre))
  if (!f) return false
  const dias = Math.round((medianoche(f).getTime() - medianoche(hoy).getTime()) / MS_DIA)
  return dias >= 0 && dias <= LIBRE_AVISO_DIAS
}

/**
 * Llegada atípica a fiscal: sábado y martes se hacen sólo si el cliente lo
 * pidió (o si el lunes es feriado), y un domingo casi siempre es una fecha mal
 * cargada. Se marca para confirmar, no se bloquea.
 */
export function llegadaAtipicaAFiscal(etaFiscal: string): boolean {
  const f = parseLocalDate(txt(etaFiscal))
  if (!f) return false
  const dow = f.getDay()
  return dow === 6 || dow === 0 || dow === 2
}

/**
 * Salidas coordinadas de hoy en adelante, agrupadas por día de carga.
 *
 * `shipments` ya viene filtrado por el server con SOLO las operativas del
 * partner, así que acá no hay que volver a filtrar por depósito ni transporte.
 */
export function salidasProgramadas(
  shipments: ParsedShipment[],
  hoy: Date,
  diasAdelante: number = SALIDAS_DIAS_ADELANTE,
): DiaDeCarga[] {
  const h = medianoche(hoy).getTime()
  const porDia = new Map<string, SalidaProgramada[]>()

  for (const s of shipments) {
    const cab = s as unknown as Record<string, unknown>
    for (const op of (s.operativas || []) as OperativasRecord[]) {
      const salidaTxt = txt(op.SALIDA)
      const salida = parseLocalDate(salidaTxt)
      if (!salida) continue                       // sin fecha de carga no es un plan

      const dias = Math.round((medianoche(salida).getTime() - h) / MS_DIA)
      if (dias < 0 || dias > diasAdelante) continue

      const fecha = salidaTxt.slice(0, 10)
      const descripcion = txt(op.DESCRIPCION)
      const etaFiscal = txt(op.ETA_FISC)
      const libre = txt(op.LIBRE)

      const fila: SalidaProgramada = {
        ref: txt(op.REF) || txt(cab.REF),
        cliente: txt(op.CLIENTE_OP) || txt(cab.CLIENTE),
        cntr: txt(op.CNTR_OP),
        tipo: txt(op.TIPO),
        deposito: txt(op.LUGAR_SALIDA) || txt(op.DEPOSITO),
        transporte: txt(op.TRANSPORTE),
        operativa: txt(op.OPERATIVA),
        horario: txt(op.HORARIO),
        descripcion,
        fiscal: txt(op.FISCAL),
        salida: fecha,
        etaFiscal,
        libre,
        pkgs: num(op.PKGS),
        kg: num(op.KG),
        m3: num(op.M3),
        pesada: num(op.KG) > KG_ALERTA,
        muchosBultos: num(op.PKGS) > PKGS_ALERTA,
        especial: esCargaEspecial(descripcion),
        libreProximo: libreProximoAVencer(libre, hoy),
        llegadaAtipica: llegadaAtipicaAFiscal(etaFiscal),
        madera: siNo(op.WOOD),
        imo: siNo(op.IMO),
        noApilable: siNo(op.NO_APILABLE),
      }

      const lista = porDia.get(fecha)
      if (lista) lista.push(fila)
      else porDia.set(fecha, [fila])
    }
  }

  return [...porDia.keys()].sort().map(fecha => {
    const cargas = porDia.get(fecha)!
    // Dentro del día, primero por depósito: el camión hace una parada por vez.
    cargas.sort((a, b) => a.deposito.localeCompare(b.deposito) || a.ref.localeCompare(b.ref))
    return { fecha, cargas, kgTotal: cargas.reduce((t, c) => t + c.kg, 0) }
  })
}

/** Cuántas cargas hay en total en el plan. */
export function totalCargas(dias: DiaDeCarga[]): number {
  return dias.reduce((t, d) => t + d.cargas.length, 0)
}
