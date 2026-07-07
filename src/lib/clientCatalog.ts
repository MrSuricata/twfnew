// ── Catálogo de clientes: normalización y canonicalización ──────────────
// El campo `cliente` de las cargas fue texto libre durante años → ~430
// variantes ("BALSAMO", "BALSAMO S.A", "BALSAMO SA"...). El catálogo `clients`
// guarda UN nombre canónico por cliente + `aliases` (otras formas en que
// aparece escrito, separadas por coma). Estos helpers unifican:
//   normalizeClienteKey → clave de agrupación (sin acentos/puntuación/sufijos)
//   canonicalizeCliente → reemplaza lo tipeado por el nombre canónico si matchea
//   deriveClientePattern → patrón de portal derivado de nombre+aliases
// ⚠️ La misma lógica de derivación del patrón vive en api/auth/admin-login.ts
// (effectiveClientePattern) — mantener en sync.

/** Forma mínima del catálogo que necesitan los helpers (ClientAccount la cumple). */
export interface CatalogClient {
  name: string
  aliases?: string | null
}

// Sufijos de forma societaria al FINAL del nombre. Los puntos/comas se borran
// antes SIN insertar espacio ("S.R.L." → "SRL", "SR.L." → "SRL", "S.A.S" →
// "SAS"), así que acá quedan compactos — con espacios internos opcionales por
// si el origen ya los traía separados. El orden importa: variantes largas
// primero para que "S A" no se coma la S de "S A S".
const LEGAL_SUFFIX_RE = /\s+(S ?A ?I ?C ?F?|S ?A ?S|S ?R ?L|LTDA|CIF|S ?A)$/

/**
 * Clave de agrupación de un nombre de cliente: MAYÚSCULAS, sin acentos, sin
 * puntuación (colapsa espacios), "&" = "Y", y sin sufijos legales al final
 * (S.A. / SA / S.R.L. / SRL / S.A.S. / SAS / SAIC(F) / LTDA / CIF — pueden
 * venir encadenados: "HNOS. SA CIF"). Si al quitar sufijos no queda nada
 * (ej: el nombre ES "S.A."), conserva la forma sin puntuación.
 */
export function normalizeClienteKey(s: string): string {
  let k = (s || '').toUpperCase()
  k = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  // Puntos, comas y apóstrofes se BORRAN sin dejar espacio (siglas: "D.O.M."
  // → "DOM", "S.A." → "SA"); el resto de la puntuación separa palabras.
  k = k.replace(/[.,'’]/g, '')
  k = k.replace(/&/g, ' Y ')
  k = k.replace(/[^A-Z0-9]+/g, ' ').trim()
  const beforeSuffix = k
  let prev = ''
  while (prev !== k) {
    prev = k
    k = k.replace(LEGAL_SUFFIX_RE, '')
  }
  k = k.trim()
  return k || beforeSuffix
}

/**
 * Si `raw` coincide (por clave normalizada) con el nombre canónico o algún
 * alias de un cliente del catálogo, devuelve el nombre canónico. Si no
 * matchea nada, devuelve `raw` con trim (el texto libre sigue permitido).
 */
export function canonicalizeCliente(raw: string, clients: CatalogClient[]): string {
  const t = (raw || '').trim()
  if (!t) return t
  const key = normalizeClienteKey(t)
  if (!key) return t
  for (const c of clients || []) {
    const name = (c.name || '').trim()
    if (!name) continue
    if (normalizeClienteKey(name) === key) return name
    const aliases = String(c.aliases || '')
      .split(',')
      .map(a => a.trim())
      .filter(Boolean)
    if (aliases.some(a => normalizeClienteKey(a) === key)) return name
  }
  return t
}

/**
 * Patrón de portal (cliente_pattern) derivado de nombre + aliases: cada entrada
 * ≥4 caracteres (matchesClientePattern descarta tokens más cortos), en
 * MAYÚSCULAS, sin duplicados, unidas por coma. Puede devolver '' si nada
 * alcanza el mínimo.
 */
export function deriveClientePattern(name: string, aliases?: string | null): string {
  // Una coma DENTRO del nombre partiría el token en dos al matchear (el patrón
  // separa por coma) → se reemplaza por espacio.
  const parts = [String(name || '').replace(/,/g, ' '), ...String(aliases || '').split(',')]
    .map(p => p.replace(/\s+/g, ' ').trim().toUpperCase())
    .filter(p => p.length >= 4)
  return Array.from(new Set(parts)).join(',')
}
