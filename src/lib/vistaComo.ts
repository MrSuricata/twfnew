/**
 * "Ver como" — el admin mira la web con los ojos de un depósito, un transporte
 * o un cliente, sin salir de su sesión ni pedirle la clave a nadie.
 *
 * Brian (02/09/2026): "quiero ver la web como transporte, como depósito y como
 * cliente en cada caso, para poder ver fácil lo que quiero cambiar".
 *
 * Es una VISTA PREVIA, no un impersonate: no se firma ningún token nuevo, no
 * se toca la sesión y las acciones que escriben quedan deshabilitadas. Las
 * cargas se filtran acá con el MISMO criterio que usa el server para cada rol
 * (api/data/[entity].ts, rama partner-shipments), así lo que se ve es lo que
 * ve el partner de verdad.
 *
 * Puro y testeable: entra la lista de cargas del admin, sale la del rol.
 */
import type { ParsedShipment, OperativasRecord } from './shipmentTypes'

export type RolVista = 'depot' | 'transport' | 'client'

export interface VistaComo {
  rol: RolVista
  /** Depósito, transporte o email del cliente. */
  valor: string
  /** Lo que se muestra en la barra: "PLANIR", "TRANSCAL", "BICI PERETTI S.A.". */
  nombre: string
}

export const ROL_VISTA_LABEL: Record<RolVista, string> = {
  depot: 'Depósito',
  transport: 'Transporte',
  client: 'Cliente',
}

const txt = (v: unknown): string => String(v ?? '').trim()
const up = (v: unknown): string => txt(v).toUpperCase()
const ops = (s: ParsedShipment): OperativasRecord[] => (s.operativas || []).filter(Boolean)
/** Las archivadas no se le muestran a nadie. `archived` no está en el tipo
 *  (viene de la fila de la DB), por eso la lectura es defensiva. */
const viva = (s: ParsedShipment): boolean => !!s && !(s as { archived?: boolean }).archived

/** El transporte de una operativa puede venir compartido ("MARITIMA / URUGUAY"):
 *  el server parte por / , y +, y compara exacto. Mismo criterio acá. */
export function transportesDeOperativa(op: { TRANSPORTE?: unknown }): string[] {
  return up(op.TRANSPORTE).split(/[/,+]/).map(t => t.trim()).filter(Boolean)
}

/** ¿Esta operativa es de este depósito? (espejo del server). */
const esDelDeposito = (op: OperativasRecord, deposito: string): boolean =>
  up(op.DEPOSITO) === up(deposito)

/** ¿Esta operativa es de este transporte? (espejo del server). */
const esDelTransporte = (op: OperativasRecord, transporte: string): boolean =>
  transportesDeOperativa(op).includes(up(transporte))

/**
 * Las cargas de un partner: solo las que tienen alguna operativa suya, y de
 * cada carga solo esas operativas (una carga repartida entre dos depósitos no
 * le muestra a uno los contenedores del otro — igual que el server).
 */
export function cargasDePartner(
  shipments: ParsedShipment[],
  rol: 'depot' | 'transport',
  valor: string,
): ParsedShipment[] {
  const filtro = rol === 'depot' ? esDelDeposito : esDelTransporte
  const out: ParsedShipment[] = []
  for (const s of shipments || []) {
    if (!viva(s)) continue
    const suyas = ops(s).filter(op => filtro(op, valor))
    if (suyas.length === 0) continue
    out.push({ ...s, operativas: suyas })
  }
  return out
}

/** Opciones del selector: los depósitos que aparecen en las cargas vivas. */
export function depositosEnCargas(shipments: ParsedShipment[]): string[] {
  const set = new Set<string>()
  for (const s of shipments || []) {
    if (!viva(s)) continue
    for (const op of ops(s)) {
      const d = up(op.DEPOSITO)
      if (d) set.add(d)
    }
  }
  return [...set].sort()
}

/** Ídem transportes, ya separados cuando vienen compartidos. */
export function transportesEnCargas(shipments: ParsedShipment[]): string[] {
  const set = new Set<string>()
  for (const s of shipments || []) {
    if (!viva(s)) continue
    for (const op of ops(s)) for (const t of transportesDeOperativa(op)) set.add(t)
  }
  return [...set].sort()
}

/** Cuántas cargas vería cada opción — para no entrar a una vista vacía. */
export function contarPorOpcion(
  shipments: ParsedShipment[],
  rol: 'depot' | 'transport',
  opciones: string[],
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const o of opciones) out[o] = cargasDePartner(shipments, rol, o).length
  return out
}
