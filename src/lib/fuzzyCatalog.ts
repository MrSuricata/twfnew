// ─── Catálogo con protección anti-typo (pedido Brian 15/07/2026) ─────────
// Puertos, países y shippers son datos FIJOS: "SNA ANTONIO" no es un puerto
// nuevo, es SAN ANTONIO mal tipeado. Al salir del campo se busca el valor
// canónico entre los conocidos: match exacto (normalizado, sin acentos) o
// a distancia de tipeo ≤2 → se corrige avisando (con Deshacer). Si no se
// parece a ninguno, es un valor genuinamente NUEVO y queda como catálogo.

/** MAYÚSCULAS, sin acentos, espacios colapsados. */
export function normalizeCat(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

/** Distancia de Levenshtein clásica (iterativa, O(n·m)). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,                                    // borrar
        cur[j - 1] + 1,                                 // insertar
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),  // sustituir
      )
    }
    prev = cur
  }
  return prev[b.length]
}

/** MAYÚSCULAS conservando acentos (para guardar valores nuevos sin
 *  desfigurarlos: "córdoba nueva" → "CÓRDOBA NUEVA"). */
export function upperCat(s: string): string {
  return String(s || '').replace(/\s+/g, ' ').trim().toUpperCase()
}

/** Nombres distintos del MISMO lugar — el match y las sugerencias los unifican
 *  al canónico. Brian 16/07: APM y MPS son la misma terminal de devolución
 *  (canónico MPS, el mayoritario en los datos: 50 vs 13). */
export const DEV_ALIASES: Record<string, string> = { APM: 'MPS' }

export interface MatchCanonico {
  canon: string
  /** true = era el mismo valor (solo cambió mayúsculas/acentos/espacios). */
  exacto: boolean
}

/**
 * Busca el canónico de `valor` entre `conocidos`:
 *  1. igual normalizado → exacto (corrige mayúsculas/acentos);
 *  2. a distancia de tipeo ≤ 1 (cortos) / ≤ 2 (5+ letras) → typo detectado;
 *  3. nada cerca → null (valor genuinamente nuevo).
 * Devuelve el valor conocido TAL CUAL está en el catálogo (conserva acentos).
 * `aliases` (normalizado → canónico) se aplica antes del match: "APM" con
 * DEV_ALIASES matchea como MPS y cuenta como corrección (exacto=false).
 */
export function matchCanonico(valor: string, conocidos: string[], aliases?: Record<string, string>): MatchCanonico | null {
  let v = normalizeCat(valor)
  if (!v) return null
  const aliased = aliases?.[v]
  if (aliased) v = normalizeCat(aliased)
  let mejor: { canon: string; dist: number } | null = null
  for (const c of conocidos) {
    const n = normalizeCat(c)
    if (!n) continue
    if (n === v) return { canon: c.trim(), exacto: !aliased }
    const maxDist = v.length <= 4 ? 1 : 2
    // Poda barata: si el largo difiere más que la tolerancia, ni calcular.
    if (Math.abs(n.length - v.length) > maxDist) continue
    const d = levenshtein(v, n)
    if (d <= maxDist && (!mejor || d < mejor.dist)) mejor = { canon: c.trim(), dist: d }
  }
  if (mejor) return { canon: mejor.canon, exacto: false }
  // Alias sin entrada en el catálogo (aún sin cargas con el canónico): igual
  // se corrige al canónico del alias.
  if (aliased) return { canon: upperCat(aliased), exacto: false }
  return null
}

/** Lista de sugerencias canonicalizada: MAYÚSCULAS, sin vacíos, alias
 *  unificados al canónico, únicos y ordenados. */
export function canonicalizarLista(vals: Iterable<string | null | undefined>, aliases?: Record<string, string>): string[] {
  const set = new Set<string>()
  for (const v of vals) {
    const u = upperCat(String(v ?? ''))
    if (!u) continue
    set.add(aliases?.[normalizeCat(u)] ?? u)
  }
  return Array.from(set).sort()
}
