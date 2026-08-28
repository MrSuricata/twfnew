import type { ParsedShipment } from './shipmentTypes'
import type { ClientAccount } from './quotationTypes'

/**
 * Check if a CLIENTE value matches any pattern token.
 * Patterns can be comma-separated (e.g. "PERETTI,ACME").
 *
 * Matching is case-insensitive and word-boundary based — a token only matches
 * when it is flanked by non-alphanumeric chars or string edges, so "PERETTI"
 * does NOT match inside "PERETTIANI". This mirrors the server-side
 * `matchesClientePattern` in api/_lib/csvParser.ts, keeping admin counts and
 * impersonated views consistent with what the client actually sees.
 */
export function matchesPattern(cliente: string, pattern: string): boolean {
  if (!cliente || !pattern) return false
  const clienteUpper = cliente.toUpperCase()
  const patterns = pattern
    .toUpperCase()
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
  if (patterns.length === 0) return false
  return patterns.some(p => {
    const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`)
    return re.test(clienteUpper)
  })
}

/**
 * Count how many shipments match a given client pattern.
 * Returns 0 for empty pattern.
 */
export function getMatchCount(shipments: ParsedShipment[], pattern: string): number {
  if (!pattern) return 0
  return shipments.filter(s => matchesPattern(s.CLIENTE, pattern)).length
}

/**
 * Cliente del catálogo por email de contacto. El email NO es clave única:
 * casi todo el catálogo lo tiene vacío, y un `find(c => c.email === '')`
 * devolvía el primer cliente sin email para CUALQUIER sesión sin email
 * (impersonate firmaba con email vacío → "Bienvenido CENA HNOS", 28/08).
 * Sin email no hay match — el llamador cae al nombre que viaja en el token.
 */
export function findClientByEmail(
  clients: ClientAccount[] | undefined,
  email: string | undefined,
): ClientAccount | undefined {
  const e = (email || '').trim().toLowerCase()
  if (!e) return undefined
  return clients?.find(c => (c.email || '').trim().toLowerCase() === e)
}
