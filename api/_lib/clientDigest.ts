// ── Digest de cargas para clientes (spec 2026-08-27) ─────────────────────
// Arma el JSON que consume el workflow n8n "MED - Aviso Clientes": por cada
// cliente con digest_active, sus cargas ACTIVAS vía Montevideo con el shape
// seguro del portal + un estado derivado server-side.
// Seguridad: reusa esCargaDeClienteActiva / rowToClientShipment (los montos
// no viajan de la DB; CLIENTE va vacío — refs compartidas no filtran nombres).

import { matchesClientePattern } from './csvParser.js'
import { esCargaDeClienteActiva, rowToClientShipment } from './clientShipments.js'

const txt = (v: unknown): string => String(v ?? '').trim()
const num = (v: unknown): number => {
  const n = Number(v)
  return isFinite(n) ? n : 0
}

export interface EstadoDigest { code: string; label: string; emoji: string; orden: number; fecha: string }
export interface CargaDigest {
  REF: string; CLIENT_REF: string; CNTR: string; BUQUE: string
  ETA: string; SALIDA: string; ETA_FISC: string; FISCAL: string
  DESCRIPCION: string; PKGS: number; KG: number; M3: number
  estado: EstadoDigest
}
export interface ClienteDigest {
  name: string; displayName: string; emails: string; sinEmail: boolean; cargas: CargaDigest[]
}

const MESES: Record<string, number> = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11 }

/** Fecha en los formatos que trae la data (ISO, dd/mm/yyyy, dd-mmm) → 'yyyy-mm-dd' o null. */
export function parseFechaDigest(input: unknown): string | null {
  const s = txt(input)
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})-([a-záéíóú]{3})/i)
  if (m) {
    const clave = m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 3)
    const mes = MESES[clave]
    if (mes !== undefined) return `${new Date().getFullYear()}-${String(mes + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

/** REF para el cliente: sin la A inicial (regla de emails con clientes). */
export function refSinA(ref: unknown): string {
  return txt(ref).replace(/^A(?=\d)/, '')
}

/** Vía Montevideo = país de la operación UY (CL = San Antonio/Valpo, AR = BsAs — quedan afuera). */
export function esViaMontevideo(row: { dest_country?: string | null }): boolean {
  return txt(row.dest_country).toUpperCase() === 'UY'
}

/** Espejo de effectiveClientePattern en api/auth/admin-login.ts — mantener en sync. */
export function effectiveClientePattern(client: { name?: string; aliases?: string | null; cliente_pattern?: string | null }): string {
  const stored = (client.cliente_pattern || '').trim()
  if (stored) return stored
  const parts = [String(client.name || '').replace(/,/g, ' '), ...String(client.aliases || '').split(',')]
    .map(p => p.replace(/\s+/g, ' ').trim().toUpperCase())
    .filter(p => p.length >= 4)
  return Array.from(new Set(parts)).join(',')
}

/** Destinatarios del digest: digest_emails, si no el email principal del cliente. */
export function emailsDigest(client: { digest_emails?: string | null; email?: string | null }): string {
  return txt(client.digest_emails) || txt(client.email)
}

const reached = (d: unknown, hoyISO: string): boolean => {
  const n = parseFechaDigest(d)
  return !!n && n <= hoyISO
}

interface ParsedDigestOp { SALIDA?: string; ETA_FISC?: string; FISCAL?: string; DESCRIPCION?: string; PKGS?: unknown; KG?: unknown; M3?: unknown }
interface ParsedDigestShipment { ETA?: string; operativas?: ParsedDigestOp[] }

/**
 * Estado de una carga PARA EL CLIENTE. Espejo SIMPLIFICADO del subset de
 * getShipmentStatus (src/lib/shipmentTypes.ts) que el digest necesita —
 * mantener en sync si cambian las reglas de estado del portal.
 * `parsed` es la salida de rowToClientShipment (shape ParsedShipment).
 */
export function deriveEstadoDigest(parsed: ParsedDigestShipment, hoyISO: string): EstadoDigest {
  const ops = parsed.operativas || []
  const eta = parseFechaDigest(parsed.ETA)
  if (!eta || eta > hoyISO) {
    return { code: 'en_transito', label: 'En viaje a Montevideo', emoji: '🚢', orden: 1, fecha: eta || '' }
  }
  const allFiscal = ops.length > 0 && ops.every(o => reached(o.SALIDA, hoyISO) && reached(o.ETA_FISC, hoyISO))
  if (allFiscal) {
    return { code: 'llego_fiscal', label: 'En depósito fiscal', emoji: '📦', orden: 5, fecha: parseFechaDigest(ops.find(o => o.ETA_FISC)?.ETA_FISC) || '' }
  }
  const allSalieron = ops.length > 0 && ops.every(o => reached(o.SALIDA, hoyISO))
  if (allSalieron) {
    const hoySale = ops.some(o => parseFechaDigest(o.SALIDA) === hoyISO)
    if (hoySale) return { code: 'salio_montevideo', label: 'Cargando — sale hoy', emoji: '🚛', orden: 3, fecha: hoyISO }
    return { code: 'en_frontera', label: 'En viaje al depósito fiscal', emoji: '🛃', orden: 4, fecha: parseFechaDigest(ops.find(o => o.SALIDA)?.SALIDA) || '' }
  }
  const salidasFuturas = ops
    .map(o => parseFechaDigest(o.SALIDA))
    .filter((d): d is string => !!d && d > hoyISO)
    .sort()
  if (salidasFuturas.length > 0) {
    return { code: 'salida_programada', label: 'Salida programada', emoji: '🚛', orden: 3, fecha: salidasFuturas[0] }
  }
  return { code: 'en_puerto', label: 'Arribada a Montevideo', emoji: '⚓', orden: 2, fecha: eta }
}

type Row = Record<string, unknown>

/** Núcleo del endpoint: clientes digest_active + filas de shipments → digest listo para n8n. */
export function buildClientDigest(
  clients: Row[],
  shipmentRows: Row[],
  hoyISO: string,
): { generatedAt: string; clients: ClienteDigest[] } {
  const out: ClienteDigest[] = []
  for (const c of clients) {
    const pattern = effectiveClientePattern(c as { name?: string; aliases?: string | null; cliente_pattern?: string | null })
    const emails = emailsDigest(c as { digest_emails?: string | null; email?: string | null })
    const cargas: CargaDigest[] = []
    for (const row of shipmentRows) {
      if (!pattern || !matchesClientePattern(txt(row.cliente), pattern)) continue
      if (!esCargaDeClienteActiva(row as { archived?: boolean; source?: string; eta?: string; eta_fiscal?: string }, hoyISO)) continue
      if (!esViaMontevideo(row as { dest_country?: string })) continue
      const parsed = rowToClientShipment(row) as Row & ParsedDigestShipment
      const estado = deriveEstadoDigest(parsed, hoyISO)
      const ops = parsed.operativas || []
      cargas.push({
        REF: refSinA(parsed.REF), CLIENT_REF: txt(parsed.CLIENT_REF),
        CNTR: txt(parsed.CNTR), BUQUE: txt(parsed.BUQUE),
        ETA: txt(parsed.ETA), SALIDA: txt(ops.find(o => o.SALIDA)?.SALIDA),
        ETA_FISC: txt(ops.find(o => o.ETA_FISC)?.ETA_FISC), FISCAL: txt(ops.find(o => o.FISCAL)?.FISCAL),
        DESCRIPCION: txt(ops.find(o => o.DESCRIPCION)?.DESCRIPCION),
        // pkgs/kg/m3 viven en cada operativa (rowToClientShipment no los sube al nivel carga)
        PKGS: ops.reduce((a, o) => a + num(o.PKGS), 0),
        KG: ops.reduce((a, o) => a + num(o.KG), 0),
        M3: ops.reduce((a, o) => a + num(o.M3), 0),
        estado,
      })
    }
    cargas.sort((a, b) => (a.estado.orden - b.estado.orden) || a.ETA.localeCompare(b.ETA))
    out.push({
      name: txt(c.name),
      displayName: txt(c.company) || txt(c.name),
      emails,
      sinEmail: !emails,
      cargas,
    })
  }
  return { generatedAt: new Date().toISOString(), clients: out }
}
