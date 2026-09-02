/**
 * Alta rápida de un cliente desde el formulario de una carga.
 *
 * Brian (02/09/2026): "que no se tipee libre, que se pueda seleccionar del
 * catálogo o lista y si no crear nuevo cliente".
 *
 * El catálogo es la fuente del nombre: si el cliente no está, se crea acá
 * mismo (nombre + patrón del portal derivado) y la carga queda con el nombre
 * canónico. Así no se repiten "VMG SA" / "VMG S.A." / "VMG SOCIEDAD ANONIMA"
 * como tres clientes distintos, que es lo que dejaba a VMG sin ver sus LCL.
 */
import type { ClientAccount } from './quotationTypes'
import { fetchClients, saveClients } from './dataClient'
import { normalizeClienteKey, deriveClientePattern } from './clientCatalog'

/** Id legible y estable: "BICI PERETTI S.A." → "cl-bici-peretti-sa". */
export function idDeCliente(nombre: string, existentes: { id?: string }[] = []): string {
  const slug = normalizeClienteKey(nombre)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'cliente'
  const base = `cl-${slug}`
  const usados = new Set(existentes.map(c => String(c.id || '')))
  if (!usados.has(base)) return base
  for (let i = 2; i < 50; i++) if (!usados.has(`${base}-${i}`)) return `${base}-${i}`
  return `${base}-${Date.now()}`
}

/** El cliente del catálogo que ya representa a este nombre, si existe. */
export function clienteExistente(nombre: string, clients: ClientAccount[]): ClientAccount | undefined {
  const key = normalizeClienteKey(nombre)
  if (!key) return undefined
  return (clients || []).find(c => {
    if (normalizeClienteKey(c.name || '') === key) return true
    return String(c.aliases || '')
      .split(',')
      .map(a => a.trim())
      .filter(Boolean)
      .some(a => normalizeClienteKey(a) === key)
  })
}

export interface AltaClienteResultado {
  cliente: ClientAccount
  /** false = ya estaba en el catálogo (se devuelve el que estaba). */
  creado: boolean
}

/**
 * Crea el cliente en el catálogo (o devuelve el que ya estaba, comparando por
 * clave normalizada: "VMG S.A." no se duplica con "VMG SA"). Relee el catálogo
 * del server antes de guardar para no pisar altas de otro usuario: `saveClients`
 * manda el array completo.
 */
export async function crearClienteEnCatalogo(nombreCrudo: string): Promise<AltaClienteResultado> {
  const nombre = String(nombreCrudo || '').trim()
  if (!nombre) throw new Error('El nombre del cliente no puede estar vacío')

  const actuales = await fetchClients()
  const yaEsta = clienteExistente(nombre, actuales)
  if (yaEsta) return { cliente: yaEsta, creado: false }

  const cliente: ClientAccount = {
    id: idDeCliente(nombre, actuales),
    email: '',
    name: nombre,
    company: nombre,
    createdAt: Date.now(),
    clientePattern: deriveClientePattern(nombre),
    // Explícitos: el lote viaja junto con los clientes que ya tienen estos
    // campos, y una fila sin ellos caía en NOT NULL (02/09/2026).
    digestActive: false,
    digestEmails: '',
  }
  await saveClients([...actuales, cliente])
  return { cliente, creado: true }
}
