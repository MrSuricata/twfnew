/**
 * Cargas de ejemplo para ver los portales de depósito, transporte y cliente
 * SIN entrar con una cuenta real. Solo se usa en la ruta /ui, que existe
 * únicamente en desarrollo (ver App.tsx): sirve para trabajar el diseño de
 * esas pantallas, que de otro modo hay que mirar a ciegas.
 *
 * Datos inventados: ninguna referencia, cliente ni contenedor es real.
 */
import type { ParsedShipment, OperativasRecord } from './shipmentTypes'

const hoy = (): Date => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
const dia = (n: number): string => {
  const d = hoy()
  d.setDate(d.getDate() + n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const op = (o: Partial<OperativasRecord>): OperativasRecord => ({
  REF: '', TLX: 'SI', DEPOSITO: 'GODILCO', ETA_OP: '', SALIDA: '', ETA_FISC: '', LIBRE: '',
  OPERATIVA: 'TRASIEGO', CNTR_OP: '', PKGS: 0, KG: 0, M3: 0, DESCRIPCION: '', FISCAL: '',
  DESCARGA: '', DEV: '', CLIENTE_OP: '', TIPO: '40HC', WOOD: '', TRANSPORTE: 'TRANSCAL',
  HORARIO: '', LUGAR_SALIDA: '',
  ...o,
} as OperativasRecord)

const carga = (
  ref: string,
  cliente: string,
  eta: string,
  ops: OperativasRecord[],
  extra: Partial<ParsedShipment> = {},
): ParsedShipment => ({
  REF: ref, CLIENTE: cliente, CLIENT_REF: '', ETD: dia(-35), ETA: eta,
  CNTR: ops.map(o => o.CNTR_OP).filter(Boolean).join(', '), N: ops.length,
  MBL: 'DEMO' + ref, LINEA: 'MAERSK', BUQUE: 'DEMO VESSEL ' + ref.slice(-1),
  TERMINAL: 'TCP', LIBRE_HASTA: '', PAIS: 'UY', POL: 'SHANGHAI', POD: 'MONTEVIDEO',
  MODE: 'fcl', containers: [], calculatedN: ops.length, calculatedLibreHasta: '',
  // Los numéricos que el server SIEMPRE manda (rowToClientShipment los pone en
  // 0: al cliente no le viajan montos). Sin ellos la ficha de la carga rompía
  // en /ui — el bloque de costos los lee aunque la pestaña esté oculta.
  FT: 0, C_TERMINAL: 0, C_DEV: 0, LOCALES: 0, FLETE: 0, FORMA_DE_PAGO: 'al arribo', VTO: '',
  CR: false, BL: false, AD: false, AT: false, SEGUIMIENTO: '', TIPO: ops[0]?.TIPO || 'FCL',
  // Los booleanos que decide el equipo y mira el depósito (Brian 03/09):
  // si puede retirar y si puede devolver el vacío.
  LIBERADA: true, TERMINAL_PAGADA: true, DEVOLUCION_PAGADA: true,
  operativas: ops.map(o => ({ ...o, REF: ref })),
  ...extra,
} as unknown as ParsedShipment)

/** Cargas de ejemplo con operativas completas: alcanzan para que las cards de
 *  depósito y transporte tengan algo en cada sección. */
export function demoPartnerShipments(): ParsedShipment[] {
  return [
    // Sale hoy de GODILCO con TRANSCAL — madera (SENASA) y no apilable
    carga('D9001', 'DEMO ALPHA S.A.', dia(-6), [
      op({
        CNTR_OP: 'DEMO1000001', DEPOSITO: 'GODILCO', TRANSPORTE: 'TRANSCAL',
        SALIDA: dia(0), ETA_FISC: dia(2), FISCAL: 'ZP RAFAELA', LIBRE: dia(3),
        PKGS: 420, KG: 8400, M3: 42, DESCRIPCION: 'MOTOPARTES', WOOD: 'SI',
        NO_APILABLE: 'SI', LUGAR_SALIDA: 'GODILCO', DEV: 'STL',
      } as Partial<OperativasRecord>),
    ], { CLIENT_REF: '1410' } as Partial<ParsedShipment>),
    // Retiro próximo desde TCP hacia GODILCO, libre venciendo
    carga('D9002', 'DEMO BETA SRL', dia(1), [
      op({
        CNTR_OP: 'DEMO1000002', DEPOSITO: 'GODILCO', TRANSPORTE: 'CARRARA',
        FISCAL: 'CACEC', LIBRE: dia(2), PKGS: 180, KG: 3200, M3: 26,
        DESCRIPCION: 'REPUESTOS AGRÍCOLAS',
      }),
      // La ref propia MAL cargada: dice el nombre del cliente que está mirando.
      // El portal la descarta y muestra la nuestra (spec 04/09, D2).
    ], { TERMINAL: 'TCP', TERMINAL_PAGADA: false, CLIENT_REF: 'DEMO ALPHA S.A.' } as Partial<ParsedShipment>),
    // Ya en depósito, libre VENCIDO (el rojo de la card)
    carga('D9003', 'DEMO GAMMA S.A.', dia(-12), [
      op({
        CNTR_OP: 'DEMO1000003', DEPOSITO: 'GODILCO', TRANSPORTE: 'TRANSCAL',
        SALIDA: dia(-3), ETA_FISC: dia(-1),
        FISCAL: 'TERRAMAR', LIBRE: dia(-2), PKGS: 96, KG: 12500, M3: 58,
        DESCRIPCION: 'MAQUINARIA', LUGAR_SALIDA: 'GODILCO', DEV: 'STL',
      }),
    ], { DEVOLUCION_PAGADA: false } as Partial<ParsedShipment>),
    // Carga IMO que sale en 3 días — PLANIR / CARRARA
    carga('D9004', 'DEMO DELTA S.A.', dia(-4), [
      op({
        CNTR_OP: 'DEMO1000004', DEPOSITO: 'PLANIR', TRANSPORTE: 'CARRARA',
        SALIDA: dia(3), ETA_FISC: dia(5), FISCAL: 'ZOFRACOR', LIBRE: dia(9),
        PKGS: 12, KG: 15800, M3: 64, DESCRIPCION: 'PRODUCTO QUÍMICO', IMO: 'SI',
        LUGAR_SALIDA: 'PLANIR',
      } as Partial<OperativasRecord>),
    ]),
    // Dos contenedores, uno sale mañana y el otro la semana que viene
    carga('D9005', 'DEMO EPSILON S.A.', dia(-2), [
      op({
        CNTR_OP: 'DEMO1000005', DEPOSITO: 'GODILCO', TRANSPORTE: 'TRANSCAL',
        SALIDA: dia(1), ETA_FISC: dia(3), FISCAL: 'CACEC', LIBRE: dia(6),
        PKGS: 640, KG: 9100, M3: 44, DESCRIPCION: 'CUBIERTAS',
      }),
      op({
        CNTR_OP: 'DEMO1000006', DEPOSITO: 'GODILCO', TRANSPORTE: 'TRANSCAL',
        SALIDA: dia(6), ETA_FISC: dia(8), FISCAL: 'CACEC', LIBRE: dia(10),
        PKGS: 610, KG: 8900, M3: 43, DESCRIPCION: 'CUBIERTAS',
      }),
    ]),
    // LCL para desconsolidar en PLANIR (card del depósito)
    carga('D9006', 'DEMO ZETA SRL', dia(-3), [
      op({
        CNTR_OP: '', DEPOSITO: 'PLANIR', TRANSPORTE: '', OPERATIVA: 'CARGA A PISO',
        FISCAL: 'CACEC', PKGS: 34, KG: 1200, M3: 6, DESCRIPCION: 'INSUMOS',
        LUGAR_SALIDA: 'PLANIR',
      }),
    ], { MODE: 'lcl', N: 0, CNTR: '' } as Partial<ParsedShipment>),
    // Dos contenedores ya trasegados: dos líneas de devolución independientes
    // (Brian 03/09). Una por vencimiento, la otra porque nos falta un dato.
    carga('D9008', 'DEMO IOTA S.A.', dia(-9), [
      op({
        CNTR_OP: 'DEMO1000008', DEPOSITO: 'GODILCO', TRANSPORTE: 'TRANSCAL',
        SALIDA: dia(-2), ETA_FISC: dia(0), FISCAL: 'CACEC', LIBRE: dia(1),
        PKGS: 88, KG: 6100, M3: 31, DESCRIPCION: 'ELECTRODOMÉSTICOS', DEV: 'MPS',
        LUGAR_SALIDA: 'GODILCO',
      }),
      op({
        CNTR_OP: 'DEMO1000009', DEPOSITO: 'GODILCO', TRANSPORTE: 'TRANSCAL',
        SALIDA: dia(-2), ETA_FISC: dia(0), FISCAL: 'CACEC', LIBRE: '',
        PKGS: 92, KG: 6400, M3: 33, DESCRIPCION: 'ELECTRODOMÉSTICOS', DEV: '',
        LUGAR_SALIDA: 'GODILCO',
      }),
    ]),
    // Ref con el formato de la planilla (A####) y ref propia del cliente: en el
    // portal se ve "1433" grande y "9010" chico — nunca "A9010" ni "TWF 9010".
    carga('A9010', 'DEMO ALPHA S.A.', dia(2), [
      op({
        CNTR_OP: 'DEMO1000010', DEPOSITO: 'GODILCO', TRANSPORTE: 'TRANSCAL',
        FISCAL: 'CACEC', PKGS: 300, KG: 7200, M3: 40, DESCRIPCION: 'BICICLETAS',
      }),
    ], { CLIENT_REF: '1433', TERMINAL: 'TCP' } as Partial<ParsedShipment>),
    // Llega la semana que viene: alimenta "próximos 14 días"
    carga('D9007', 'DEMO ETA S.A.', dia(7), [
      op({
        CNTR_OP: 'DEMO1000007', DEPOSITO: 'PLANIR', TRANSPORTE: 'CARRARA',
        SALIDA: dia(9), ETA_FISC: dia(11), FISCAL: 'TORTONE', PKGS: 210, KG: 5400,
        M3: 38, DESCRIPCION: 'HERRAMIENTAS', WOOD: 'SI',
      }),
    ], { TERMINAL: 'MONTECON', LIBERADA: false } as Partial<ParsedShipment>),
  ]
}
