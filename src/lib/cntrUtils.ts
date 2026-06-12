// Contenedores de una operación: el modelo guarda UN string ("CSNU7743374,
// FFAU3573668"). Estos helpers son la única vía de parse/serialización para
// que el editor de fichas del panel haga round-trip sin sorpresas.

export function parseCntr(cntr: string): string[] {
  return String(cntr || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

export function serializeCntr(list: string[]): string {
  return list.join(', ')
}

/** MAYÚSCULAS y sin espacios internos. Devuelve null si queda vacío. */
export function normalizeCntr(raw: string): string | null {
  const c = String(raw || '').toUpperCase().replace(/\s+/g, '')
  return c || null
}

/** Formato ISO 6346 superficial: 4 letras + 7 dígitos. Lo no-estándar se
 *  acepta igual (la planilla trae valores irregulares) — esto es solo aviso. */
export function isStandardCntr(c: string): boolean {
  return /^[A-Z]{4}\d{7}$/.test(c)
}
