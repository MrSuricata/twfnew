// Formatters de display compartidos (es-UY). Solo presentación — nunca tocan datos guardados.

/** Fecha ISO (yyyy-MM-dd) → dd/MM/yyyy para display. Cualquier otro string se devuelve tal cual. */
export function fmtDateDMY(iso?: string): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return iso
  return `${m[3]}/${m[2]}/${m[1]}`
}

/** Formato numérico uruguayo (punto de miles, coma decimal). */
export const nfUY = new Intl.NumberFormat('es-UY')

/** Número → string con separador de miles es-UY. */
export function fmtNum(n: number): string {
  return nfUY.format(n)
}

/** Horas de atraso → "+Nh" si es menos de 48 h, si no "+Nd" (días redondeados). */
export function fmtHorasAtraso(horas: number): string {
  if (horas < 48) return `+${Math.round(horas)}h`
  return `+${Math.round(horas / 24)}d`
}

/** Date → YYYY-MM-DD en hora LOCAL (misma regla que truckUtils.toIsoDate). */
export function fechaISOLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * HOY como YYYY-MM-DD en hora LOCAL. Es el único helper para "la fecha de hoy"
 * en pantallas y estampas (desconsol_date, filtros de bandeja): con
 * `new Date().toISOString()` (UTC) después de las 21:00 en Uruguay ya era
 * mañana y la bandeja de stock estampaba una fecha que no había llegado.
 */
export function hoyISO(): string {
  return fechaISOLocal(new Date())
}
