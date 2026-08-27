// ── Cargas para el PORTAL DE CLIENTES ────────────────────────────────────
//
// Fuente: la tabla `shipments` (la web es master desde el flip del 16/06) —
// NUNCA la planilla: quedó export-only y el endpoint viejo que la leía le
// mostraba al cliente cargas muertas y le escondía las nuevas (Brian 26/08).
//
// Principios de seguridad (defensa en profundidad):
//  1. El SELECT es una WHITELIST de columnas: los montos, pagos, forma de
//     pago, notas internas y auditoría ni siquiera viajan de la DB al handler.
//  2. El filtro por cliente (matchesClientePattern) corre en el SERVER con el
//     pattern del JWT — jamás se le manda al navegador nada de otro cliente.
//  3. Solo cargas ACTIVAS: el residuo (cascarones sin ETA, cargas viejas) no
//     existe para el cliente.
//  4. El shape que sale es ParsedShipment-compatible (el portal ya lo consume)
//     con los campos financieros en cero/vacío y CLIENTE/CLIENTE_OP vacíos
//     (una ref compartida A/B no puede filtrar el nombre del otro cliente).

/** Columnas que el portal necesita — y NINGUNA más. */
export const CLIENT_SHIPMENT_COLS = [
  'id', 'ref', 'client_ref', 'cliente', 'mode', 'archived', 'source',
  'etd', 'eta', 'buque', 'linea', 'terminal', 'doc_number', 'contenedor', 'n_cntr',
  'pkgs', 'kg', 'm3', 'observacion', 'tipo',
  'origin', 'discharge_port', 'dest_country', 'dest_port',
  'libre', 'salida', 'eta_fiscal', 'fiscal', 'deposito', 'operativa', 'descarga', 'dev',
  'transporte', 'telex', 'wood', 'seguimiento', 'operativas',
].join(',')

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const txt = (v: unknown): string => String(v ?? '').trim()

const diasDesde = (iso: string, hoyISO: string): number | null => {
  const s = txt(iso).slice(0, 10)
  if (!ISO_RE.test(s) || !ISO_RE.test(hoyISO)) return null
  return Math.round((Date.parse(hoyISO + 'T00:00:00Z') - Date.parse(s + 'T00:00:00Z')) / 86400000)
}

/** ETA no más vieja que esto = la carga sigue siendo "del presente". */
export const CLIENTE_ETA_MAX_DIAS = 60
/** Entregada (fiscal pasado) hace más de esto → ya no se muestra. */
export const CLIENTE_ENTREGADA_DIAS = 10

/**
 * ¿Esta carga se le muestra al cliente? Activas y recientes, sin residuo:
 *  - archivadas y espejo de la planilla: nunca;
 *  - sin ETA parseable: nunca (un cascarón sin fechas no informa nada);
 *  - ETA más vieja de 60 días: nunca (regla "vigente" de toda la app);
 *  - ya entregada (llegada al fiscal hace más de 10 días): tampoco — se
 *    muestra unos días como confirmación y después sale sola.
 */
export function esCargaDeClienteActiva(
  s: { archived?: boolean | null; source?: string | null; eta?: string | null; eta_fiscal?: string | null },
  hoyISO: string,
): boolean {
  if (s.archived) return false
  if (txt(s.source) === 'sheet') return false
  const etaDias = diasDesde(txt(s.eta), hoyISO)
  if (etaDias === null || etaDias > CLIENTE_ETA_MAX_DIAS) return false
  const fiscalDias = diasDesde(txt(s.eta_fiscal), hoyISO)
  if (fiscalDias !== null && fiscalDias > CLIENTE_ENTREGADA_DIAS) return false
  return true
}

type Row = Record<string, unknown>

const num = (v: unknown): number => {
  const n = Number(v)
  return isFinite(n) ? n : 0
}

/**
 * Fila de la DB → shape ParsedShipment que el portal ya consume.
 * Espejo servidor de dbFclToParsedShipment (src/lib/operationsTypes) con la
 * whitelist puesta: financieros en cero, CLIENTE/CLIENTE_OP vacíos.
 */
export function rowToClientShipment(d: Row): Record<string, unknown> {
  const ops = Array.isArray(d.operativas) && (d.operativas as Row[]).length
    ? (d.operativas as Row[]).map(o => ({
        REF: txt(d.ref), TLX: txt(o.TLX) || (d.telex ? 'SI' : ''),
        DEPOSITO: txt(o.DEPOSITO) || txt(d.deposito), ETA_OP: txt(o.ETA_OP),
        SALIDA: txt(o.SALIDA), ETA_FISC: txt(o.ETA_FISC), LIBRE: txt(o.LIBRE) || txt(d.libre),
        OPERATIVA: txt(o.OPERATIVA) || txt(d.operativa), CNTR_OP: txt(o.CNTR_OP),
        PKGS: num(o.PKGS), KG: num(o.KG), M3: num(o.M3), DESCRIPCION: txt(o.DESCRIPCION) || txt(d.observacion),
        FISCAL: txt(o.FISCAL) || txt(d.fiscal), DESCARGA: txt(o.DESCARGA), DEV: txt(o.DEV),
        CLIENTE_OP: '', TIPO: txt(o.TIPO) || txt(d.tipo),
        WOOD: txt(o.WOOD), TRANSPORTE: txt(o.TRANSPORTE) || txt(d.transporte), HORARIO: '',
        LUGAR_SALIDA: txt(o.LUGAR_SALIDA),
      }))
    : ((d.salida || d.eta_fiscal || d.libre || d.operativa || d.deposito || d.descarga || d.dev)
        ? [{
            REF: txt(d.ref), TLX: d.telex ? 'SI' : '', DEPOSITO: txt(d.deposito), ETA_OP: '',
            SALIDA: txt(d.salida), ETA_FISC: txt(d.eta_fiscal), LIBRE: txt(d.libre),
            OPERATIVA: txt(d.operativa), CNTR_OP: txt(d.contenedor),
            PKGS: num(d.pkgs), KG: num(d.kg), M3: num(d.m3), DESCRIPCION: txt(d.observacion),
            FISCAL: txt(d.fiscal), DESCARGA: txt(d.descarga), DEV: txt(d.dev),
            CLIENTE_OP: '', TIPO: txt(d.tipo), WOOD: d.wood ? 'SI' : '',
            TRANSPORTE: txt(d.transporte), HORARIO: '',
          }]
        : [])

  return {
    REF: txt(d.ref),
    CLIENT_REF: txt(d.client_ref),   // la ref PROPIA del cliente (1410…)
    CLIENTE: '',                      // no viaja: el portal ya sabe quién es
    ETD: txt(d.etd), ETA: txt(d.eta),
    FT: 0, LIBRE_HASTA: txt(d.libre),
    CNTR: txt(d.contenedor), N: num(d.n_cntr),
    MBL: txt(d.doc_number), LINEA: txt(d.linea), BUQUE: txt(d.buque), TERMINAL: txt(d.terminal),
    C_TERMINAL: 0, C_DEV: 0, LOCALES: 0, FLETE: 0, FORMA_DE_PAGO: 'al arribo', VTO: '',
    CR: false, BL: false, AD: false, AT: false,
    POL: txt(d.origin), POD: txt(d.discharge_port),
    PAIS: txt(d.dest_country) || 'OTRO',
    SEGUIMIENTO: txt(d.seguimiento), TIPO: txt(d.tipo),
    containers: [], calculatedN: num(d.n_cntr), calculatedLibreHasta: txt(d.libre),
    operativas: ops,
  }
}
