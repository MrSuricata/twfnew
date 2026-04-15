import type { ParsedShipment } from './shipmentTypes'

/**
 * Check if a CLIENTE value matches any pattern token.
 * Patterns can be comma-separated (e.g. "PERETTI,ACME").
 * Matching is case-insensitive substring match.
 */
export function matchesPattern(cliente: string, pattern: string): boolean {
  if (!cliente || !pattern) return false
  const clienteUpper = cliente.toUpperCase()
  return pattern
    .toUpperCase()
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
    .some(p => clienteUpper.includes(p))
}

/**
 * Count how many shipments match a given client pattern.
 * Returns 0 for empty pattern.
 */
export function getMatchCount(shipments: ParsedShipment[], pattern: string): number {
  if (!pattern) return 0
  return shipments.filter(s => matchesPattern(s.CLIENTE, pattern)).length
}
