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
/** Lo que el portal necesita saber del camión que lleva una LCL: las fechas
 *  (salida de Montevideo, llegada al fiscal) y el destino de ESA carga. */
export interface CamionDeCarga {
  /** Código C### saneado: cualquier otra cosa (los codes libres "A7887 + A7849 -
   *  YEMEN" llevan refs y clientes ajenos) viaja como ''. */
  code: string
  departure_date: string
  arrival_date: string
  load_date: string
  /** El equipo lo marcó entregado (los importados no tienen fecha de llegada). */
  entregado: boolean
  /** fiscal de la fila de truck_loads (gana sobre la carga). */
  fiscal: string
}

/** Cargas → su camión publicado (source_ref = shipments.ref). Si una carga
 *  viajó en más de un camión (raro), gana el más reciente por fecha de carga. */
export function camionesPorRef(
  loads: { source_ref?: unknown; truck_id?: unknown; fiscal?: unknown; pending?: unknown }[],
  trucks: { id?: unknown; code?: unknown; departure_date?: unknown; arrival_date?: unknown; load_date?: unknown; draft?: unknown; status?: unknown }[],
): Map<string, CamionDeCarga> {
  const porId = new Map<string, (typeof trucks)[number]>()
  for (const t of trucks || []) if (!t.draft) porId.set(txt(t.id), t)
  const out = new Map<string, CamionDeCarga>()
  for (const l of loads || []) {
    if (txt(l.pending) === 'add') continue // todavía no confirmado en el camión
    const t = porId.get(txt(l.truck_id))
    if (!t) continue
    const ref = txt(l.source_ref).toUpperCase()
    const codeCrudo = txt(t.code).toUpperCase()
    const cam: CamionDeCarga = {
      code: /^C\d+$/.test(codeCrudo) ? codeCrudo : '',
      departure_date: txt(t.departure_date).slice(0, 10), arrival_date: txt(t.arrival_date).slice(0, 10),
      load_date: txt(t.load_date).slice(0, 10), entregado: txt(t.status).toLowerCase() === 'delivered',
      fiscal: txt(l.fiscal),
    }
    const previo = out.get(ref)
    if (!previo || (cam.load_date || cam.departure_date) > (previo.load_date || previo.departure_date)) out.set(ref, cam)
  }
  return out
}

/**
 * Fila de la DB → shape ParsedShipment que el portal ya consume.
 * Espejo servidor de dbFclToParsedShipment (src/lib/operationsTypes) con la
 * whitelist puesta: financieros en cero, CLIENTE/CLIENTE_OP vacíos.
 *
 * `camion`: para las LCL, la salida y la llegada a destino viven en el camión
 * consolidado (trucks), no en la carga. Se arma UNA operativa sintética
 * "CONSOLIDADO" con esas fechas, así el portal deriva estado y cards con la
 * misma lógica que un contenedor (derive-on-read, nada copiado a shipments).
 */
export function rowToClientShipment(d: Row, camion?: CamionDeCarga | null): Record<string, unknown> {
  const esLcl = txt(d.mode).toLowerCase() === 'lcl'
  if (esLcl && camion) {
    return {
      ...rowToClientShipmentBase(d),
      operativas: [{
        REF: txt(d.ref), TLX: d.telex ? 'SI' : '', DEPOSITO: txt(d.deposito), ETA_OP: '',
        SALIDA: camion.departure_date, ETA_FISC: camion.arrival_date, LIBRE: '',
        OPERATIVA: 'CONSOLIDADO', CNTR_OP: '', CAMION: camion.code, ENTREGADO: camion.entregado,
        PKGS: num(d.pkgs), KG: num(d.kg), M3: num(d.m3),
        // La descripción de truck_loads son instrucciones internas al camión
        // ("NO APILABLE", "SIN BL"): al cliente le va la de su carga.
        DESCRIPCION: txt(d.observacion),
        FISCAL: camion.fiscal || txt(d.fiscal), DESCARGA: '', DEV: '',
        CLIENTE_OP: '', TIPO: 'LCL', WOOD: d.wood ? 'SI' : '', TRANSPORTE: '', HORARIO: '',
        LUGAR_SALIDA: txt(d.deposito),
      }],
    }
  }
  return rowToClientShipmentBase(d)
}

function rowToClientShipmentBase(d: Row): Record<string, unknown> {
  const esLcl = txt(d.mode).toLowerCase() === 'lcl'
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
    // LCL: SIEMPRE una operativa (aunque no tenga nada cargado) — si no, una LCL
    // arribada sin depósito no existe para "esperando salida" (revisión 02/09).
    : ((d.salida || d.eta_fiscal || d.libre || d.operativa || d.deposito || d.descarga || d.dev || esLcl)
        ? [{
            REF: txt(d.ref), TLX: d.telex ? 'SI' : '', DEPOSITO: txt(d.deposito), ETA_OP: '',
            SALIDA: txt(d.salida), ETA_FISC: txt(d.eta_fiscal), LIBRE: txt(d.libre),
            OPERATIVA: txt(d.operativa), CNTR_OP: txt(d.contenedor),
            PKGS: num(d.pkgs), KG: num(d.kg), M3: num(d.m3), DESCRIPCION: txt(d.observacion),
            FISCAL: txt(d.fiscal), DESCARGA: txt(d.descarga), DEV: txt(d.dev),
            CLIENTE_OP: '', TIPO: txt(d.tipo), WOOD: d.wood ? 'SI' : '',
            TRANSPORTE: txt(d.transporte), HORARIO: '',
            // LCL sin camión todavía: está en el depósito de desconsolidación.
            LUGAR_SALIDA: esLcl ? txt(d.deposito) : '',
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
    // Modalidad (fcl / lcl / air): el portal filtra y etiqueta por tipo (Brian 02/09).
    MODE: txt(d.mode).toLowerCase() || 'fcl',
    SEGUIMIENTO: txt(d.seguimiento), TIPO: txt(d.tipo),
    containers: [], calculatedN: num(d.n_cntr), calculatedLibreHasta: txt(d.libre),
    operativas: ops,
  }
}
