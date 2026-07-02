// Progreso de viaje dependiente del tiempo para el tracking público.
// Interpola cuánto avanzó la navegación entre ETD y ETA (fechas ISO estrictas,
// igual criterio que parseLocalDate: nada de new Date(string) permisivo).

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export interface VoyageProgress {
  /** 0..1 — fracción del viaje transcurrida a hoy (clampeada) */
  pct: number
  /** días que faltan hasta la ETA (0 si ya llegó o llega hoy) */
  daysLeft: number
}

/**
 * Devuelve el avance temporal del viaje ETD→ETA, o null si no se puede
 * calcular (fechas faltantes, formato no-ISO, o ETA anterior/igual a ETD).
 */
export function voyageProgress(etd?: string, eta?: string, now: Date = new Date()): VoyageProgress | null {
  if (!etd || !eta || !ISO_DATE.test(etd) || !ISO_DATE.test(eta)) return null
  const start = new Date(`${etd}T00:00:00`).getTime()
  const end = new Date(`${eta}T00:00:00`).getTime()
  const total = end - start
  if (!Number.isFinite(total) || total <= 0) return null
  const pct = Math.min(1, Math.max(0, (now.getTime() - start) / total))
  const daysLeft = Math.max(0, Math.ceil((end - now.getTime()) / 86_400_000))
  return { pct, daysLeft }
}

/** Leyenda humana del avance: "En navegación: 62% del viaje · faltan ~13 días" */
export function voyageCaption(v: VoyageProgress): string {
  const pct = Math.round(v.pct * 100)
  if (v.daysLeft === 0) return `En navegación: ${pct}% del viaje · llegando (ETA hoy)`
  const dias = v.daysLeft === 1 ? '1 día' : `${v.daysLeft} días`
  return `En navegación: ${pct}% del viaje · faltan ~${dias}`
}
