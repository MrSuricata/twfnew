import type { ParsedShipment } from './shipmentTypes'
import type { ClientAccount } from './quotationTypes'

/** Para comparar nombres de empresa: mayúsculas, sin puntos ni comas, un solo
 *  espacio. "VMG S.A." · "VMG S.A" · "vmg sa" → "VMG SA". */
function normalizarNombre(v: string): string {
  return v.toUpperCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Espejo EXACTO de `matchesClientePattern` (api/_lib/csvParser.ts): los
 * contadores del admin y la vista impersonada tienen que dar lo mismo que ve
 * el cliente.
 *
 * ¿El CLIENTE de una carga pertenece a este cliente del catálogo?
 *
 * El patrón es una lista separada por comas. Cada token puede ser:
 *  · **contiene** (default): "PERETTI" matchea "BICI PERETTI S.A." pero no
 *    "PERETTIANI" — el token va acotado por caracteres no alfanuméricos.
 *  · **exacto**, con `=` adelante: "=VMG SA" matchea "VMG SA", "VMG S.A." y
 *    (se ignoran puntos, comas y espacios de más) pero NO
 *    "EQUIPO ORIGINAL VMG SA", que es otro cliente (Brian 02/09/2026).
 *    Es la forma de scopear un cliente cuyo nombre está contenido en el de
 *    otro: sin esto, VMG veía las cargas de Equipo Original VMG.
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
    if (p.startsWith('=')) return normalizarNombre(p.slice(1)) === normalizarNombre(cliente)
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
