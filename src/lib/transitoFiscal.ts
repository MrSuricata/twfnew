// ─── Tránsito Montevideo → depósito fiscal ──────────────────────────────
// Regla de Brian (13/08/2026): el viaje normal es salida + 2 días — sale un
// día, al siguiente hace frontera y a la mañana del tercero llega a fiscal.
// El fin de semana no se trabaja en fiscal, así que si el +2 cae sábado o
// domingo, lo normal es que llegue el LUNES.
//
//   sale lunes     → miércoles      sale jueves  → lunes (sábado solo a pedido)
//   sale martes    → jueves         sale viernes → lunes
//   sale miércoles → viernes
//
// Llegadas ATÍPICAS que hay que marcar (no bloquear — son válidas, pero
// significan algo): SÁBADO = el cliente lo pidió expresamente · MARTES = el
// cliente lo pidió o el lunes es feriado. Se marcan sin importar el motivo.

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

function parseISO(s: string | null | undefined): Date | null {
  const t = String(s || '').trim()
  if (!ISO_RE.test(t)) return null
  const [y, m, d] = t.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return isNaN(dt.getTime()) ? null : dt
}

const toISO = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** Nombre del día de una fecha ISO ('' si no parsea) — para armar mensajes. */
export function nombreDia(iso: string | null | undefined): string {
  const d = parseISO(iso)
  return d ? DIAS[d.getDay()] : ''
}

/**
 * Llegada a fiscal NORMAL para una salida de Montevideo: salida + 2 días,
 * y si cae en fin de semana corre al lunes. null si la salida no es una
 * fecha ISO (nunca inventar sobre texto libre).
 */
export function sugerirEtaFiscal(salidaISO: string | null | undefined): string | null {
  const d = parseISO(salidaISO)
  if (!d) return null
  d.setDate(d.getDate() + 2)
  const dow = d.getDay()
  if (dow === 6) d.setDate(d.getDate() + 2)      // sábado → lunes
  else if (dow === 0) d.setDate(d.getDate() + 1) // domingo → lunes
  return toISO(d)
}

export interface LlegadaAtipica {
  tipo: 'sabado' | 'domingo' | 'martes'
  /** Texto corto para el chip/tooltip. */
  motivo: string
}

/**
 * Una llegada a fiscal que hay que MARCAR. No es un error: es información —
 * sábado y martes pasan solo por pedido del cliente o feriado, y conviene
 * verlo sin tener que acordarse.
 */
export function llegadaFiscalAtipica(etaFiscISO: string | null | undefined): LlegadaAtipica | null {
  const d = parseISO(etaFiscISO)
  if (!d) return null
  const dow = d.getDay()
  if (dow === 6) return { tipo: 'sabado', motivo: 'Llega SÁBADO a fiscal — solo si el cliente lo pidió' }
  if (dow === 0) return { tipo: 'domingo', motivo: 'Llega DOMINGO a fiscal — verificar la fecha' }
  if (dow === 2) return { tipo: 'martes', motivo: 'Llega MARTES — el cliente lo pidió o el lunes es feriado' }
  return null
}
