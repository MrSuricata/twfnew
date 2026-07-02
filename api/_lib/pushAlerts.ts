// ─── Resumen diario para Web Push (helpers puros) ────────────────────
// Computa las alertas del día leyendo FILAS DE LA DB (post-flip la web es
// master): LIBRE vencido/vence hoy + salidas + en frontera + llegando a
// fiscal (por contenedor, misma derivación que la pestaña HOY —
// src/lib/todayFilters.ts, copia server-side) + camiones que salen hoy.
//
// Todas las fechas de la app son strings ISO 'YYYY-MM-DD' → las comparaciones
// son de strings/días UTC puros, sin objetos Date locales (el server corre en
// UTC; "hoy" se resuelve en America/Montevideo con montevideoTodayIso()).
// ─────────────────────────────────────────────────────────────────────

/** Fila mínima de `shipments` que necesita el resumen. */
export interface PushShipmentRow {
  ref?: string | null
  cliente?: string | null
  mode?: string | null
  archived?: boolean | null
  /** LIBRE a nivel carga: fecha ISO, 'DEVUELTO' o texto libre (solo ISO alerta). */
  libre?: string | null
  salida?: string | null
  eta_fiscal?: string | null
  /** Array por contenedor (jsonb, claves MAYÚSCULAS: SALIDA/ETA_FISC en ISO). */
  operativas?: Array<Record<string, unknown>> | null
}

/** Fila mínima de `trucks`. */
export interface PushTruckRow {
  code?: string | null
  draft?: boolean | null
  departure_date?: string | null
}

export interface PushCounts {
  libreVencidos: number
  libreHoy: number
  /** Contenedores con SALIDA = hoy (por operativa, no por carga). */
  salidas: number
  /** Contenedores en frontera (SALIDA hace 1–2 días, sin llegar a fiscal). */
  frontera: number
  /** Contenedores con ETA_FISC = hoy. */
  fiscal: number
  /** Camiones publicados con salida hoy. */
  camiones: number
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 86_400_000
// Ventana de "en frontera" — igual que todayFilters.ts (SALIDA hace 1 o 2 días).
const BORDER_DAYS_MIN = 1
const BORDER_DAYS_MAX = 2

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

interface EffectiveOp {
  salida: string
  etaFisc: string
}

/** Operativas efectivas de una carga: el array por contenedor si existe
 *  (una carga con 2 contenedores saliendo = 2, igual que HOY); si no, una
 *  operativa sintética desde las columnas rollup (legacy/colapsado) — mismo
 *  fallback que dbFclToParsedShipment en operationsTypes.ts. */
function effectiveOps(row: PushShipmentRow): EffectiveOp[] {
  if (Array.isArray(row.operativas) && row.operativas.length > 0) {
    return row.operativas.map(o => ({
      salida: String((o as { SALIDA?: unknown }).SALIDA || ''),
      etaFisc: String((o as { ETA_FISC?: unknown }).ETA_FISC || ''),
    }))
  }
  if (row.salida || row.eta_fiscal) {
    return [{ salida: row.salida || '', etaFisc: row.eta_fiscal || '' }]
  }
  return []
}

/** Cuenta las alertas del día. Misma derivación que la pestaña HOY:
 *  - Solo cargas FCL activas (no archivadas) — los consolidados se cubren
 *    por el lado de camiones.
 *  - LIBRE a nivel carga: solo fechas ISO estrictas ('DEVUELTO'/texto libre
 *    se ignoran — no son fecha). Vencido = ya pasó · hoy = vence hoy.
 *  - Salidas / frontera / fiscal: POR CONTENEDOR (array operativas).
 *  - Camiones: departure_date = hoy y no borrador. */
export function computePushCounts(
  shipments: PushShipmentRow[],
  trucks: PushTruckRow[],
  todayIso: string
): PushCounts {
  const counts: PushCounts = { libreVencidos: 0, libreHoy: 0, salidas: 0, frontera: 0, fiscal: 0, camiones: 0 }

  for (const s of shipments) {
    if (s.archived === true) continue
    if ((s.mode || '') !== 'fcl') continue

    // LIBRE (nivel carga, como todayFilters.libreAlerts)
    const libre = (s.libre || '').trim()
    if (libre && isIso(libre)) {
      const days = daysSinceIso(libre, todayIso)
      if (days > 0) counts.libreVencidos++
      else if (days === 0) counts.libreHoy++
    }

    // Movimientos por contenedor (como salientesHoy/enFronteraHoy/llegandoFiscalHoy)
    for (const op of effectiveOps(s)) {
      const salida = op.salida.trim()
      const etaFisc = op.etaFisc.trim()
      const salidaValida = !!salida && isIso(salida)
      const fiscValida = !!etaFisc && isIso(etaFisc)

      if (salidaValida && salida === todayIso) counts.salidas++

      if (fiscValida && etaFisc === todayIso) counts.fiscal++

      // En frontera: salió hace 1–2 días y todavía no llegó a fiscal
      // (ETA_FISC vacía, hoy… no: si es HOY cuenta en "fiscal", acá se excluye;
      // si ya pasó, tampoco cuenta — misma regla que enFronteraHoy).
      if (salidaValida) {
        const days = daysSinceIso(salida, todayIso)
        if (days >= BORDER_DAYS_MIN && days <= BORDER_DAYS_MAX) {
          const yaLlego = fiscValida && daysSinceIso(etaFisc, todayIso) > 0
          const llegaHoy = fiscValida && etaFisc === todayIso
          if (!yaLlego && !llegaHoy) counts.frontera++
        }
      }
    }
  }

  for (const t of trucks) {
    if (t.draft === true) continue
    const dep = (t.departure_date || '').trim()
    if (dep && isIso(dep) && dep === todayIso) counts.camiones++
  }

  return counts
}

/** Body de la notificación — categorías en 0 se omiten; todo en 0 → null (no
 *  se envía nada). Ej: "🔴 2 LIBRE vencidos · 🟠 1 vence hoy · 🚚 4 salidas ·
 *  🛃 2 en frontera · 🏭 3 llegan a fiscal · 2 camiones" */
export function buildPushBody(c: PushCounts): string | null {
  const parts: string[] = []
  if (c.libreVencidos > 0) parts.push(`🔴 ${c.libreVencidos} LIBRE vencido${c.libreVencidos === 1 ? '' : 's'}`)
  if (c.libreHoy > 0) parts.push(`🟠 ${c.libreHoy} vence${c.libreHoy === 1 ? '' : 'n'} hoy`)
  if (c.salidas > 0) parts.push(`🚚 ${c.salidas} salida${c.salidas === 1 ? '' : 's'}`)
  if (c.frontera > 0) parts.push(`🛃 ${c.frontera} en frontera`)
  if (c.fiscal > 0) parts.push(`🏭 ${c.fiscal} llega${c.fiscal === 1 ? '' : 'n'} a fiscal`)
  if (c.camiones > 0) parts.push(`${c.camiones} cami${c.camiones === 1 ? 'ón' : 'ones'}`)
  return parts.length > 0 ? parts.join(' · ') : null
}
