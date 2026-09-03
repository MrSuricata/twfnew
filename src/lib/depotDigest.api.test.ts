/**
 * EL CANDADO CONTRA LA DIVERGENCIA SILENCIOSA.
 *
 * `api/_lib/depotDigest.ts` (el JSON del mail diario a los depósitos) es una
 * COPIA de las reglas de `src/lib/hoyDeposito.ts` (lo que el depósito ve al
 * entrar al portal). Se copia y no se importa porque api/ compila con
 * `moduleResolution: NodeNext` y src/ importa sin extensión: en cuanto api/
 * toca hoyDeposito.ts se cae el typecheck de las serverless.
 *
 * La flecha al revés sí se puede —src/ compila con `moduleResolution: bundler`—
 * y por eso este test vive acá: corre los MISMOS casos contra las dos
 * implementaciones y falla si una devuelve una fila que la otra no, o con otro
 * plazo / severidad / motivo / estado.
 *
 * Ya pasó una vez: el endpoint se escribió con la regla vieja ("el vacío entra
 * apenas el contenedor sale de la terminal"), la regla cambió en el portal
 * (PR #353: la operativa tiene que estar HECHA, y sin LIBRE el plazo es null y
 * no 9999) y el mail iba a listar contenedores que el portal ya no mostraba.
 * Si el mail y la pantalla no coinciden, el depósito deja de creerle a los dos.
 *
 * Si este test se pone rojo: NO lo ajustes. Copiá la regla de hoyDeposito.ts
 * (la fuente de verdad) a depotDigest.ts.
 */
import { describe, it, expect } from 'vitest'
import {
  retirosProximos,
  libresPorVencer,
  estadoRetiro,
  estadoDevolucion,
  severidadLibre,
  ETIQUETA_RETIRO,
  ETIQUETA_DEVOLUCION,
  RETIROS_DIAS_ATRAS,
  RETIROS_DIAS_ADELANTE,
  LIBRE_DIAS_AVISO,
} from './hoyDeposito'
import type { CargaPartner } from './hoyDeposito'
import type { PartnerAviso } from './partnerAvisos'
import {
  buildDepotDigest,
  estadoRetiro as estadoRetiroApi,
  estadoDevolucion as estadoDevolucionApi,
  severidadLibre as severidadLibreApi,
  ETIQUETA_RETIRO as ETIQUETA_RETIRO_API,
  ETIQUETA_DEVOLUCION as ETIQUETA_DEVOLUCION_API,
  RETIROS_DIAS_ATRAS as RETIROS_DIAS_ATRAS_API,
  RETIROS_DIAS_ADELANTE as RETIROS_DIAS_ADELANTE_API,
  LIBRE_DIAS_AVISO as LIBRE_DIAS_AVISO_API,
} from '../../api/_lib/depotDigest'
import type { CargaDepotDigest, UsuarioDeposito } from '../../api/_lib/depotDigest'

const HOY = '2026-09-03'
const DEPO = 'PLANIR'

const planir: UsuarioDeposito[] = [
  { email: 'leo@planir.com.uy', name: 'Leo', filter_value: DEPO, active: true, role: 'depot' },
]

/**
 * Una carga como la que sale de `partnerShipmentsVisibles`: los dos lados leen
 * exactamente los mismos campos, así que el fixture es UNO solo y se le pone el
 * tipo de cada lado al pasarlo.
 */
type Op = Record<string, unknown>
type Cab = Record<string, unknown>

const carga = (ref: string, ops: Op[], cab: Cab = {}) => ({
  REF: ref, CLIENTE: 'BICI PERETTI S.A.', ETA: '2026-09-02', TERMINAL: 'MONTECON', LIBRE_HASTA: '',
  LIBERADA: true, TERMINAL_PAGADA: true, DEVOLUCION_PAGADA: true,
  ...cab,
  operativas: ops.map(o => ({
    DEPOSITO: DEPO, OPERATIVA: 'TRASIEGO', CNTR_OP: '', TIPO: '20DRY', LIBRE: '', DEV: '',
    DESCRIPCION: '', ETA_OP: '', SALIDA: '', DESCARGA: '', PKGS: 0, KG: 0, M3: 0, ...o,
  })),
})

const aviso = (a: Partial<PartnerAviso>): PartnerAviso => ({
  id: 'x', tipo: 'retire', ref: 'A1', cntr: '', partnerRole: 'depot', partnerFilter: DEPO,
  partnerEmail: 'leo@planir.com.uy', partnerName: 'Leo', dato: {}, estado: 'pendiente',
  motivoRechazo: null, createdAt: '2026-09-03T10:00:00Z', resolvedAt: null, resolvedBy: null,
  ...a,
})

/** Lo que tiene que coincidir en un retiro: qué contenedor, cuándo y si se puede. */
const claveRetiro = (f: { ref: string; cntr: string; fecha: string; dias: number; eta: string; turno: string; libre: string; estado: string }) =>
  [f.ref, f.cntr, f.fecha, f.dias, f.eta, f.turno, f.libre, f.estado].join('|')

/** Lo que tiene que coincidir en una devolución: qué vacío, con qué plazo, por
 *  qué está en la lista y si se puede devolver. */
const claveDevolucion = (f: { ref: string; cntr: string; libre: string; dias: number | null; severidad: string; motivo: string; faltaLibre: boolean; faltaDev: boolean; dev: string; estado: string }) =>
  [f.ref, f.cntr, f.libre, f.dias, f.severidad, f.motivo, f.faltaLibre, f.faltaDev, f.dev, f.estado].join('|')

/** Corre el mismo caso por los dos caminos y devuelve las dos listas de claves. */
function ambos(cargas: ReturnType<typeof carga>[], avisos: PartnerAviso[] = []) {
  const portal = {
    retiro: retirosProximos(cargas as unknown as CargaPartner[], HOY, DEPO, avisos).map(claveRetiro),
    devolucion: libresPorVencer(cargas as unknown as CargaPartner[], HOY, DEPO, avisos).map(claveDevolucion),
  }
  const [dep] = buildDepotDigest(planir, cargas as unknown as CargaDepotDigest[], avisos, HOY).depositos
  const mail = {
    retiro: dep.pendientesRetiro.map(claveRetiro),
    devolucion: dep.pendientesDevolucion.map(claveDevolucion),
  }
  return { portal, mail }
}

/** Cada caso es una carga con un nombre que dice qué está probando. */
const CASOS: { nombre: string; cargas: ReturnType<typeof carga>[]; avisos?: PartnerAviso[] }[] = [
  // ── Regla 1: la operativa tiene que estar hecha ──────────────────────
  { nombre: 'sin SALIDA ni DESCARGA: no hay vacío aunque el LIBRE esté vencido',
    cargas: [carga('SIN_OP', [{ LIBRE: '2026-08-25', DEV: 'STL' }], { ETA: '2026-08-20' })] },
  { nombre: 'retirado de la terminal no alcanza: llega al depósito lleno',
    cargas: [carga('RET', [{ LIBRE: '2026-09-04', DEV: 'STL', TURNO_RETIRO: '2026-09-01' }], { RETIRADO: '2026-09-01T14:00:00Z' })] },
  { nombre: 'trasiego programado para mañana: todavía no se hizo',
    cargas: [carga('MANANA', [{ SALIDA: '2026-09-04', LIBRE: '2026-09-05', DEV: 'STL' }])] },
  { nombre: 'trasiego de HOY: el vacío ya existe',
    cargas: [carga('HOY', [{ SALIDA: HOY, LIBRE: '2026-09-05', DEV: 'STL' }])] },
  { nombre: 'CARGA A PISO: manda la DESCARGA aunque la SALIDA sea en semanas',
    cargas: [carga('PISO', [{ OPERATIVA: 'CARGA A PISO', DESCARGA: '2026-09-01', SALIDA: '2026-09-28', LIBRE: '2026-09-05', DEV: 'STL' }])] },

  // ── Regla 2: o el LIBRE aprieta, o falta un dato nuestro ─────────────
  { nombre: 'LIBRE lejos y todo completo: no hay nada que hacer hoy',
    cargas: [carga('LEJOS', [{ SALIDA: '2026-09-01', LIBRE: '2026-09-20', DEV: 'STL' }])] },
  { nombre: 'las cuatro severidades del LIBRE, en orden',
    cargas: [
      carga('V', [{ SALIDA: '2026-09-01', LIBRE: '2026-09-01', DEV: 'STL' }]),
      carga('H', [{ SALIDA: '2026-09-01', LIBRE: HOY, DEV: 'STL' }]),
      carga('U', [{ SALIDA: '2026-09-01', LIBRE: '2026-09-05', DEV: 'STL' }]),
      carga('P', [{ SALIDA: '2026-09-01', LIBRE: '2026-09-08', DEV: 'STL' }]),
    ] },
  { nombre: 'el borde del umbral: al quinto día entra, al sexto no',
    cargas: [
      carga('BORDE_DENTRO', [{ SALIDA: '2026-09-01', LIBRE: '2026-09-08', DEV: 'STL' }]),
      carga('BORDE_FUERA', [{ SALIDA: '2026-09-01', LIBRE: '2026-09-09', DEV: 'STL' }]),
    ] },
  { nombre: 'LIBRE lejos pero sin terminal de devolución: alerta de dato faltante',
    cargas: [carga('SIN_DEV', [{ SALIDA: '2026-09-01', LIBRE: '2026-09-22', DEV: '' }])] },
  { nombre: 'LIBRE de la carga como respaldo del de la operativa',
    cargas: [carga('CAB', [{ SALIDA: '2026-09-01', LIBRE: '', DEV: 'STL' }], { LIBRE_HASTA: '2026-09-04' })] },
  { nombre: 'orden: vencimientos primero, dato faltante al final',
    cargas: [
      carga('FALTA_DEV', [{ SALIDA: '2026-09-01', LIBRE: '2026-09-22', DEV: '' }]),
      carga('P', [{ SALIDA: '2026-09-01', LIBRE: '2026-09-07', DEV: 'STL' }]),
      carga('V1', [{ SALIDA: '2026-09-01', LIBRE: '2026-09-02', DEV: 'STL' }]),
      carga('V5', [{ SALIDA: '2026-09-01', LIBRE: '2026-08-29', DEV: 'STL' }]),
      carga('SIN_LIBRE', [{ SALIDA: '2026-09-01', LIBRE: '', DEV: 'STL' }]),
    ] },

  // ── Regla 3: sin LIBRE, plazo null (nunca un número de relleno) ──────
  { nombre: 'sin fecha de LIBRE y con texto que no es fecha',
    cargas: [
      carga('SIN', [{ SALIDA: '2026-09-01', LIBRE: '', DEV: 'STL' }]),
      carga('TEXTO', [{ SALIDA: '2026-09-01', LIBRE: 'CONFIRMAR', DEV: 'STL' }]),
    ] },

  // ── Regla 4: una fila por contenedor ─────────────────────────────────
  { nombre: 'dos contenedores, dos retiros y dos devoluciones independientes',
    cargas: [carga('A8202', [
      { CNTR_OP: 'C1', SALIDA: '2026-09-01', LIBRE: '2026-09-04', DEV: 'STL', TIPO: '40HC' },
      { CNTR_OP: 'C2', SALIDA: '2026-09-01', LIBRE: '2026-09-22', DEV: '', TIPO: '20DV', TURNO_RETIRO: '2026-09-05' },
    ])] },
  { nombre: 'solo el contenedor ya trasegado pide devolución',
    cargas: [carga('A8204', [
      { CNTR_OP: 'HECHO', SALIDA: '2026-09-01', LIBRE: '2026-09-04', DEV: 'STL' },
      { CNTR_OP: 'PENDIENTE', SALIDA: '2026-09-12', LIBRE: '2026-09-04', DEV: 'STL' },
    ])] },

  // ── Pertenencia, ventana de retiros y estados ────────────────────────
  { nombre: 'CONTENEDOR directo: no pasa por el depósito',
    cargas: [carga('DIR', [{ OPERATIVA: 'CONTENEDOR', SALIDA: '2026-09-01', LIBRE: '2026-08-25', DEV: 'STL' }])] },
  { nombre: 'otro depósito y LCL quedan afuera',
    cargas: [
      carga('OTRO', [{ DEPOSITO: 'GODILCO', SALIDA: '2026-09-01', LIBRE: HOY, DEV: 'STL' }]),
      carga('LCL', [{ MODE: 'lcl', SALIDA: '2026-09-01', LIBRE: HOY, DEV: 'STL' }]),
    ] },
  { nombre: 'ventana de retiros: los bordes de hoy-2 y hoy+7',
    cargas: [
      carga('DENTRO_ATRAS', [{}], { ETA: '2026-09-01' }),
      carga('FUERA_ATRAS', [{}], { ETA: '2026-08-31' }),
      carga('DENTRO_ADELANTE', [{}], { ETA: '2026-09-10' }),
      carga('FUERA_ADELANTE', [{}], { ETA: '2026-09-11' }),
    ] },
  { nombre: 'ya devuelto: DEVUELTO en LIBRE, en la carga, o con DEV_FECHA',
    cargas: [
      carga('D1', [{ SALIDA: '2026-09-01', LIBRE: 'DEVUELTO', DEV: 'STL' }]),
      carga('D2', [{ SALIDA: '2026-09-01', LIBRE: '', DEV: 'STL' }], { LIBRE_HASTA: 'DEVUELTO' }),
      carga('D3', [{ SALIDA: '2026-09-01', LIBRE: '2026-08-25', DEV: 'STL', DEV_FECHA: '2026-08-30' }]),
    ] },
  { nombre: 'liberación y pago: las cuatro combinaciones de estado',
    cargas: [
      carga('LL', [{ SALIDA: '2026-09-01', LIBRE: HOY, DEV: 'STL' }], { LIBERADA: true, TERMINAL_PAGADA: true, DEVOLUCION_PAGADA: true }),
      carga('LN', [{ SALIDA: '2026-09-01', LIBRE: HOY, DEV: 'STL' }], { LIBERADA: true, TERMINAL_PAGADA: false, DEVOLUCION_PAGADA: false }),
      carga('NL', [{ SALIDA: '2026-09-01', LIBRE: HOY, DEV: '' }], { LIBERADA: false, TERMINAL_PAGADA: true, DEVOLUCION_PAGADA: true }),
      carga('NN', [{ SALIDA: '2026-09-01', LIBRE: HOY, DEV: '' }], { LIBERADA: false, TERMINAL_PAGADA: false, DEVOLUCION_PAGADA: false }),
    ] },

  // ── Avisos del depósito ──────────────────────────────────────────────
  { nombre: 'aviso confirmado por contenedor: saca esa fila y solo esa',
    cargas: [carga('A8203', [
      { CNTR_OP: 'C1', SALIDA: '2026-09-01', LIBRE: '2026-09-04', DEV: 'STL' },
      { CNTR_OP: 'C2', SALIDA: '2026-09-01', LIBRE: '2026-09-04', DEV: 'STL' },
    ])],
    avisos: [
      aviso({ tipo: 'devolvi', ref: 'A8203', cntr: 'C1', estado: 'confirmado' }),
      aviso({ tipo: 'retire', ref: 'A8203', cntr: 'C2', estado: 'confirmado' }),
    ] },
  { nombre: 'aviso de la ref entera vale para el contenedor sin aviso propio',
    cargas: [carga('A8205', [{ CNTR_OP: 'C1', SALIDA: '2026-09-01', LIBRE: '2026-09-04', DEV: 'STL' }])],
    avisos: [aviso({ tipo: 'devolvi', ref: 'A8205', cntr: '', estado: 'confirmado' })] },
]

describe('el mail del depósito dice LO MISMO que su portal', () => {
  for (const caso of CASOS) {
    it(caso.nombre, () => {
      const { portal, mail } = ambos(caso.cargas, caso.avisos)
      expect(mail.retiro).toEqual(portal.retiro)
      expect(mail.devolucion).toEqual(portal.devolucion)
    })
  }

  it('todos los casos juntos también coinciden (mismo orden incluido)', () => {
    const { portal, mail } = ambos(
      CASOS.flatMap(c => c.cargas),
      CASOS.flatMap(c => c.avisos || []),
    )
    expect(mail.retiro).toEqual(portal.retiro)
    expect(mail.devolucion).toEqual(portal.devolucion)
    // Si los dos devuelven vacío el test no prueba nada: la batería tiene que
    // estar moviendo filas de verdad.
    expect(portal.retiro.length).toBeGreaterThan(5)
    expect(portal.devolucion.length).toBeGreaterThan(5)
  })
})

describe('las constantes y los textos copiados son idénticos', () => {
  it('las ventanas y el umbral de LIBRE', () => {
    expect(RETIROS_DIAS_ATRAS_API).toBe(RETIROS_DIAS_ATRAS)
    expect(RETIROS_DIAS_ADELANTE_API).toBe(RETIROS_DIAS_ADELANTE)
    expect(LIBRE_DIAS_AVISO_API).toBe(LIBRE_DIAS_AVISO)
  })

  it('las etiquetas: el mail y la pantalla usan la misma frase', () => {
    expect(ETIQUETA_RETIRO_API).toEqual(ETIQUETA_RETIRO)
    expect(ETIQUETA_DEVOLUCION_API).toEqual(ETIQUETA_DEVOLUCION)
  })

  it('estadoRetiro y estadoDevolucion, en todo su espacio de entrada', () => {
    for (const a of [true, false]) {
      for (const b of [true, false]) {
        expect(estadoRetiroApi(a, b)).toBe(estadoRetiro(a, b))
        expect(estadoDevolucionApi(a, b ? 'STL' : '')).toBe(estadoDevolucion(a, b ? 'STL' : ''))
      }
    }
  })

  it('severidadLibre, de -10 a +20 días', () => {
    for (let d = -10; d <= 20; d++) expect(severidadLibreApi(d)).toBe(severidadLibre(d))
  })
})
