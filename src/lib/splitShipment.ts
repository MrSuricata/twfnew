// ─── División de una carga en partes A/B (pedido Brian 14/07/2026) ──────
// Una carga se divide cuando parte de la mercadería sigue un camino distinto:
//   · por CONTENEDORES ENTEROS (4 cntrs → 2 y 2, o 1 y 3), y/o
//   · COMPARTIENDO un contenedor (un cntr entero + PARTE de otro: ciertos
//     kilos/bultos/m³ se van a la parte B y el resto queda en A).
// Convención existente: sufijos "X A" / "X B" + origin_ref = ref madre (misma
// regla de la planilla). La parte A es la fila ORIGINAL (conserva historia,
// checks y pagos); la B es una fila nueva que hereda el viaje/documental.
// El renombre de la original a "X A" va por el flujo de PIN existente
// (rename_shipment_ref, cascada server-side) — acá solo se calcula el plan.
import type { DbShipment } from './operationsTypes'
import { newDbShipment } from './operationsTypes'
import type { OperativasRecord } from './shipmentTypes'
import { parseCntr } from './cntrUtils'

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return isFinite(n) ? n : 0
}
const normCntr = (c: string): string => c.trim().toUpperCase()

export interface SplitParcial {
  /** Contenedor COMPARTIDO: queda en A y parte de su contenido pasa a B. */
  cntr: string
  pkgsB: number
  kgB: number
  m3B: number
}

export interface SplitInput {
  original: DbShipment
  /** Ref nueva de la parte B (ej: "A8024 B"). */
  refB: string
  /** Contenedores que se van ENTEROS a B (normalizados o no). */
  cntrsB: string[]
  /** Contenedor compartido (opcional). No puede estar en cntrsB. */
  parcial?: SplitParcial | null
  /** Totales para B cuando la carga NO tiene detalle por contenedor
   *  (LCL / FCL sin operativas): kilos/bultos/m³ que se lleva B. */
  totalesB?: { pkgs: number; kg: number; m3: number } | null
}

export interface SplitPlan {
  /** PATCH sobre la fila original (la parte A) — sin la ref (esa va con PIN). */
  patchA: Record<string, unknown>
  /** Fila nueva de la parte B, lista para onCreateShipment. */
  rowB: DbShipment
  resumen: {
    a: { cntrs: string[]; pkgs: number; kg: number; m3: number }
    b: { cntrs: string[]; pkgs: number; kg: number; m3: number }
  }
}

/** Valida la entrada; devuelve el problema o null si está OK. */
export function validateSplit(input: SplitInput): string | null {
  const { original, refB, cntrsB, parcial, totalesB } = input
  if (!refB.trim()) return 'Poné la ref de la parte B'
  if (refB.trim().toUpperCase() === original.ref.trim().toUpperCase()) return 'La ref de B no puede ser igual a la original'
  const all = new Set(parseCntr(original.contenedor).map(normCntr))
  const setB = cntrsB.map(normCntr)
  for (const c of setB) if (!all.has(c)) return `El contenedor ${c} no es de esta carga`
  if (parcial) {
    const pc = normCntr(parcial.cntr)
    if (!all.has(pc)) return `El contenedor compartido ${pc} no es de esta carga`
    if (setB.includes(pc)) return 'El contenedor compartido no puede irse entero a B a la vez'
    if (num(parcial.pkgsB) <= 0 && num(parcial.kgB) <= 0 && num(parcial.m3B) <= 0) {
      return 'Poné cuántos bultos/kilos/m³ del contenedor compartido van a B'
    }
  }
  const sinCntrs = all.size === 0
  if (sinCntrs) {
    const t = totalesB
    if (!t || (num(t.pkgs) <= 0 && num(t.kg) <= 0 && num(t.m3) <= 0)) {
      return 'Poné qué se lleva la parte B (bultos, kilos o m³)'
    }
  } else if (setB.length === 0 && !parcial) {
    return 'Elegí al menos un contenedor para B (o compartí uno)'
  }
  return null
}

export function planSplit(input: SplitInput): SplitPlan {
  const { original, refB, parcial, totalesB } = input
  const cntrsAll = parseCntr(original.contenedor).map(normCntr)
  const setB = new Set(input.cntrsB.map(normCntr))
  const shared = parcial ? normCntr(parcial.cntr) : null

  const cntrsA = cntrsAll.filter(c => !setB.has(c))              // el compartido queda en A…
  const cntrsB = [...cntrsAll.filter(c => setB.has(c)), ...(shared ? [shared] : [])]  // …y también viaja en B

  const ops = (original.operativas || []) as OperativasRecord[]
  let opsA: OperativasRecord[] | null = null
  let opsB: OperativasRecord[] | null = null
  let pkgsA: number, kgA: number, m3A: number, pkgsB: number, kgB: number, m3B: number

  if (ops.length > 0) {
    // Con detalle por contenedor: repartir registros y ajustar el compartido.
    opsA = []
    opsB = []
    for (const o of ops) {
      const c = normCntr(o.CNTR_OP || '')
      if (setB.has(c)) {
        opsB.push({ ...o, REF: refB })
      } else if (shared && c === shared) {
        const p = parcial as SplitParcial
        opsA.push({
          ...o,
          PKGS: Math.max(0, num(o.PKGS) - num(p.pkgsB)),
          KG: Math.max(0, num(o.KG) - num(p.kgB)),
          M3: Math.max(0, num(o.M3) - num(p.m3B)),
        })
        opsB.push({ ...o, REF: refB, PKGS: num(p.pkgsB), KG: num(p.kgB), M3: num(p.m3B) })
      } else {
        opsA.push(o)
      }
    }
    const sum = (rows: OperativasRecord[], k: 'PKGS' | 'KG' | 'M3') => rows.reduce((a, r) => a + num(r[k]), 0)
    pkgsA = sum(opsA, 'PKGS'); kgA = sum(opsA, 'KG'); m3A = sum(opsA, 'M3')
    pkgsB = sum(opsB, 'PKGS'); kgB = sum(opsB, 'KG'); m3B = sum(opsB, 'M3')
  } else {
    // Sin detalle por contenedor: B se lleva lo tipeado y A el resto (nunca <0).
    const t = totalesB || { pkgs: 0, kg: 0, m3: 0 }
    // Si hay parcial pero no operativas, el parcial también es "lo tipeado".
    const extra = parcial ? { pkgs: num(parcial.pkgsB), kg: num(parcial.kgB), m3: num(parcial.m3B) } : { pkgs: 0, kg: 0, m3: 0 }
    pkgsB = num(t.pkgs) + extra.pkgs
    kgB = num(t.kg) + extra.kg
    m3B = num(t.m3) + extra.m3
    pkgsA = Math.max(0, num(original.pkgs) - pkgsB)
    kgA = Math.max(0, num(original.kg) - kgB)
    m3A = Math.max(0, num(original.m3) - m3B)
  }

  const baseRef = (original.origin_ref || original.ref).trim()

  const rowB = newDbShipment({
    mode: original.mode,
    ref: refB.trim(),
    origin_ref: baseRef,
    cliente: original.cliente,
    shipper: original.shipper,
    agente: original.agente,
    incoterm: original.incoterm,
    client_ref: original.client_ref,
    doc_number: original.doc_number,
    buque: original.buque,
    linea: original.linea,
    origin: original.origin,
    origin_country: original.origin_country || '',
    discharge_port: original.discharge_port,
    dest_port: original.dest_port,
    dest_country: original.dest_country,
    fiscal: original.fiscal,
    etd: original.etd,
    eta: original.eta,
    seguimiento: original.seguimiento,
    deposito: original.deposito,
    operativa: original.operativa,
    libre: original.libre,
    transporte: original.transporte,
    despacho: original.despacho,
    terminal: original.terminal,
    dev: original.dev,
    tipo: original.tipo,
    observacion: original.observacion,
    status: original.status,
    telex: original.telex,
    seguro: original.seguro,
    certi: original.certi,
    wood: original.wood,
    no_apilable: original.no_apilable,
    oog: original.oog,
    imo: original.imo,
    contenedor: cntrsB.join(', '),
    n_cntr: cntrsB.length,
    pkgs: pkgsB,
    kg: kgB,
    m3: m3B,
    ...(opsB && opsB.length > 0 ? { operativas: opsB } : {}),
  })

  const patchA: Record<string, unknown> = {
    origin_ref: baseRef,
    contenedor: cntrsA.join(', '),
    n_cntr: cntrsA.length,
    pkgs: pkgsA,
    kg: kgA,
    m3: m3A,
    ...(opsA ? { operativas: opsA } : {}),
  }

  return {
    patchA,
    rowB,
    resumen: {
      a: { cntrs: cntrsA, pkgs: pkgsA, kg: kgA, m3: m3A },
      b: { cntrs: cntrsB, pkgs: pkgsB, kg: kgB, m3: m3B },
    },
  }
}
