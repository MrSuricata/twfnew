// ─── Alertas Web Push por tipo (helpers puros) ────────────────────────
// Computa las 4 alertas configurables leyendo FILAS DE LA DB (post-flip la
// web es master). Cada tipo se envía como notificación SEPARADA con líneas
// de detalle, en 2 slots de cron (límite Hobby: máx 2 crons):
//
//   slot "manana" (cron 10:00 UTC = 07:00 UY):
//     · libre    — LIBRE vence hoy o en los próximos 3 días (vencidos NO)
//     · fiscal   — ETA_FISC = hoy
//   slot "tarde" (cron 19:00 UTC = 16:00 UY — 16 y 17 van juntas por el límite):
//     · frontera — SALIDA hace 1–2 días sin llegar a fiscal (misma derivación
//                  que la pestaña HOY — src/lib/todayFilters.ts)
//     · salidas  — SALIDA = hoy
//
// Todas las fechas de la app son strings ISO 'YYYY-MM-DD' → las comparaciones
// son de strings/días UTC puros, sin objetos Date locales (el server corre en
// UTC; "hoy" se resuelve en America/Montevideo con montevideoTodayIso()).
// ─────────────────────────────────────────────────────────────────────

/** Fila mínima de `shipments` que necesitan las alertas. */
export interface PushShipmentRow {
  ref?: string | null
  cliente?: string | null
  mode?: string | null
  archived?: boolean | null
  /** LIBRE a nivel carga: fecha ISO, 'DEVUELTO' o texto libre (solo ISO alerta). */
  libre?: string | null
  salida?: string | null
  eta_fiscal?: string | null
  /** CNTR a nivel carga (rollup) — fallback cuando la operativa no trae CNTR_OP. */
  contenedor?: string | null
  deposito?: string | null
  transporte?: string | null
  /** Array por contenedor (jsonb, claves MAYÚSCULAS: SALIDA/ETA_FISC/CNTR_OP/
   *  DEPOSITO/LUGAR_SALIDA/TRANSPORTE). */
  operativas?: Array<Record<string, unknown>> | null
}

export type PushAlertKind = 'libre' | 'salidas' | 'fiscal' | 'frontera'
export type PushSlot = 'manana' | 'tarde'

/** Alerta lista para enviar: título con emoji+count y cuerpo con detalle. */
export interface PushSlotAlert {
  kind: PushAlertKind
  count: number
  title: string
  body: string
}

/** Metadata por tipo: título, columna de preferencia en push_subscriptions y
 *  horario "humano" (el que ve el equipo en el popover de la campana). */
export const PUSH_ALERT_META: Record<
  PushAlertKind,
  { title: (n: number) => string; prefColumn: string; hora: string }
> = {
  libre: { title: n => `🔴 Libres por vencer (${n})`, prefColumn: 'alert_libre', hora: '07:00' },
  fiscal: { title: n => `🏭 Llegan hoy a fiscal (${n})`, prefColumn: 'alert_fiscal', hora: '07:00' },
  frontera: { title: n => `🛃 Hoy en frontera (${n})`, prefColumn: 'alert_frontera', hora: '16:00' },
  salidas: { title: n => `🚚 Salen hoy (${n})`, prefColumn: 'alert_salidas', hora: '17:00' },
}

/** Qué tipos manda cada slot, en el orden en que se notifican. */
export const PUSH_SLOT_KINDS: Record<PushSlot, PushAlertKind[]> = {
  manana: ['libre', 'fiscal'],
  tarde: ['frontera', 'salidas'],
}

/** Máximo de líneas de detalle por notificación (después va "…y N más"). */
export const MAX_PUSH_LINES = 6

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 86_400_000
// Ventana de "en frontera" — igual que todayFilters.ts (SALIDA hace 1 o 2 días).
const BORDER_DAYS_MIN = 1
const BORDER_DAYS_MAX = 2
// Ventana de "días libres": vence hoy o en los próximos N días (vencidos NO).
const LIBRE_DAYS_AHEAD = 3

/** Fecha de HOY (YYYY-MM-DD) en America/Montevideo, sin importar la TZ del server. */
export function montevideoTodayIso(now: Date = new Date()): string {
  // en-CA formatea como YYYY-MM-DD directamente.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Montevideo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function isIso(s: string): boolean {
  return ISO_RE.test(s.trim())
}

/** Días entre dos fechas ISO (todayIso - dateIso). Positivo = ya pasó. */
function daysSinceIso(dateIso: string, todayIso: string): number {
  const [y1, m1, d1] = dateIso.trim().split('-').map(Number)
  const [y2, m2, d2] = todayIso.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / MS_PER_DAY)
}

/** '2026-07-05' → '05/07' (para las líneas de detalle). */
function fmtDdMm(iso: string): string {
  const [, m, d] = iso.trim().split('-')
  return `${d}/${m}`
}

/** Cargas que alertan: FCL activas (los consolidados van por camiones, que no
 *  tienen alerta push — las 4 alertas son de contenedores). */
function activeFcl(shipments: PushShipmentRow[]): PushShipmentRow[] {
  return shipments.filter(s => s.archived !== true && (s.mode || '') === 'fcl')
}

interface EffectiveOp {
  salida: string
  etaFisc: string
  cntr: string
  deposito: string
  lugarSalida: string
  transporte: string
}

const str = (v: unknown): string => (v == null ? '' : String(v)).trim()

/** Operativas efectivas de una carga: el array por contenedor si existe
 *  (una carga con 2 contenedores saliendo = 2 líneas, igual que HOY); si no,
 *  una operativa sintética desde las columnas rollup (legacy/colapsado) —
 *  mismos fallbacks por campo que dbFclToParsedShipment en operationsTypes.ts. */
function effectiveOps(row: PushShipmentRow): EffectiveOp[] {
  if (Array.isArray(row.operativas) && row.operativas.length > 0) {
    return row.operativas.map(o => ({
      salida: str(o.SALIDA),
      etaFisc: str(o.ETA_FISC),
      cntr: str(o.CNTR_OP),
      deposito: str(o.DEPOSITO) || str(row.deposito),
      lugarSalida: str(o.LUGAR_SALIDA),
      transporte: str(o.TRANSPORTE) || str(row.transporte),
    }))
  }
  if (row.salida || row.eta_fiscal) {
    return [{
      salida: str(row.salida),
      etaFisc: str(row.eta_fiscal),
      cntr: str(row.contenedor),
      deposito: str(row.deposito),
      lugarSalida: '',
      transporte: str(row.transporte),
    }]
  }
  return []
}

/** `CNTR · ref · resto` — con '—' en los huecos. */
function line(cntr: string, ref: string | null | undefined, resto: string): string {
  return `${cntr || '—'} · ${str(ref) || '—'} · ${resto}`
}

// ─── Cómputo por tipo (líneas de detalle completas, sin capear) ───────

/** "Días libres": LIBRE vence HOY o en los próximos 3 días (hoy ≤ LIBRE ≤ hoy+3).
 *  Los YA VENCIDOS no van (solo próximos vencimientos). LIBRE es nivel carga y
 *  solo ISO estricto ('DEVUELTO'/texto libre se ignoran — no son fecha).
 *  Línea: `CNTR · ref · vence dd/mm`, ordenadas del vencimiento más próximo. */
export function computeLibreLines(shipments: PushShipmentRow[], todayIso: string): string[] {
  const matches: Array<{ libre: string; ref: string; cntr: string }> = []
  for (const s of activeFcl(shipments)) {
    const libre = str(s.libre)
    if (!libre || !isIso(libre)) continue
    const days = daysSinceIso(libre, todayIso)
    if (days > 0 || days < -LIBRE_DAYS_AHEAD) continue // vencido o más allá de hoy+3
    matches.push({ libre, ref: str(s.ref), cntr: str(s.contenedor) })
  }
  matches.sort((a, b) => a.libre.localeCompare(b.libre) || a.ref.localeCompare(b.ref))
  return matches.map(m => line(m.cntr, m.ref, `vence ${fmtDdMm(m.libre)}`))
}

/** "Salen hoy": operativas con SALIDA = hoy (por contenedor).
 *  Línea: `CNTR · ref · [lugar de salida]` — LUGAR_SALIDA si existe y difiere
 *  del depósito (la carga sale de otro lado), si no DEPOSITO; '—' si no hay. */
export function computeSalidaLines(shipments: PushShipmentRow[], todayIso: string): string[] {
  const out: string[] = []
  for (const s of activeFcl(shipments)) {
    for (const op of effectiveOps(s)) {
      if (!isIso(op.salida) || op.salida !== todayIso) continue
      const lugar = op.lugarSalida || op.deposito || '—'
      out.push(line(op.cntr, s.ref, lugar))
    }
  }
  return out.sort((a, b) => a.localeCompare(b))
}

/** "Llegan hoy a fiscal": operativas con ETA_FISC = hoy (por contenedor).
 *  Línea: `CNTR · ref · [transporte]` ('—' si vacío). */
export function computeFiscalLines(shipments: PushShipmentRow[], todayIso: string): string[] {
  const out: string[] = []
  for (const s of activeFcl(shipments)) {
    for (const op of effectiveOps(s)) {
      if (!isIso(op.etaFisc) || op.etaFisc !== todayIso) continue
      out.push(line(op.cntr, s.ref, op.transporte || '—'))
    }
  }
  return out.sort((a, b) => a.localeCompare(b))
}

/** "Hoy en frontera": SALIDA hace 1–2 días y sin llegar a fiscal — misma
 *  derivación que enFronteraHoy de src/lib/todayFilters.ts (si ETA_FISC ya
 *  pasó no está en frontera; si es HOY cuenta en "fiscal", acá se excluye).
 *  Línea: `CNTR · ref · [transporte]`. */
export function computeFronteraLines(shipments: PushShipmentRow[], todayIso: string): string[] {
  const out: string[] = []
  for (const s of activeFcl(shipments)) {
    for (const op of effectiveOps(s)) {
      if (!isIso(op.salida)) continue
      const days = daysSinceIso(op.salida, todayIso)
      if (days < BORDER_DAYS_MIN || days > BORDER_DAYS_MAX) continue
      const fiscValida = !!op.etaFisc && isIso(op.etaFisc)
      if (fiscValida && daysSinceIso(op.etaFisc, todayIso) >= 0) continue // ya llegó o llega hoy
      out.push(line(op.cntr, s.ref, op.transporte || '—'))
    }
  }
  return out.sort((a, b) => a.localeCompare(b))
}

// ─── Armado del cuerpo y del slot ─────────────────────────────────────

/** Junta las líneas capeadas a `max` + "…y N más". [] → null (no se envía). */
export function buildAlertBody(lines: string[], max: number = MAX_PUSH_LINES): string | null {
  if (lines.length === 0) return null
  if (lines.length <= max) return lines.join('\n')
  return [...lines.slice(0, max), `…y ${lines.length - max} más`].join('\n')
}

const KIND_COMPUTE: Record<PushAlertKind, (s: PushShipmentRow[], t: string) => string[]> = {
  libre: computeLibreLines,
  salidas: computeSalidaLines,
  fiscal: computeFiscalLines,
  frontera: computeFronteraLines,
}

/** Alertas de un slot listas para enviar (solo tipos con matches — cada una
 *  es una notificación SEPARADA con su título y detalle). */
export function computeSlotAlerts(
  slot: PushSlot,
  shipments: PushShipmentRow[],
  todayIso: string
): PushSlotAlert[] {
  const alerts: PushSlotAlert[] = []
  for (const kind of PUSH_SLOT_KINDS[slot]) {
    const lines = KIND_COMPUTE[kind](shipments, todayIso)
    const body = buildAlertBody(lines)
    if (!body) continue
    alerts.push({ kind, count: lines.length, title: PUSH_ALERT_META[kind].title(lines.length), body })
  }
  return alerts
}
