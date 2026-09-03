import { describe, it, expect } from 'vitest'
import {
  buildDepotDigest,
  agruparDepositos,
  estadoRetiro,
  estadoDevolucion,
  RETIROS_DIAS_ADELANTE,
} from './depotDigest.js'
import type { OperativaDepotDigest, CargaDepotDigest, UsuarioDeposito } from './depotDigest.js'
import type { PartnerAviso } from '../../src/lib/partnerAvisos.js'

const HOY = '2026-09-03'

const op = (o: Partial<OperativaDepotDigest> = {}): OperativaDepotDigest => ({
  DEPOSITO: 'PLANIR', OPERATIVA: 'TRASIEGO', CNTR_OP: '', TIPO: '20DRY', LIBRE: '', DEV: '',
  DESCRIPCION: '', ETA_OP: '', SALIDA: '', PKGS: 0, KG: 0, M3: 0,
  ...o,
})

/** Por defecto la carga llegó ayer y está toda paga: cada test rompe lo suyo. */
const carga = (
  ref: string,
  ops: Partial<OperativaDepotDigest>[],
  cab: Partial<CargaDepotDigest> = {},
): CargaDepotDigest => ({
  REF: ref, CLIENTE: 'BICI PERETTI S.A.', ETA: '2026-09-02', TERMINAL: 'MONTECON', LIBRE_HASTA: '',
  LIBERADA: true, TERMINAL_PAGADA: true, DEVOLUCION_PAGADA: true,
  ...cab,
  operativas: ops.map(o => op(o)),
})

const planir: UsuarioDeposito[] = [
  { email: 'leo@planir.com.uy', name: 'Leo', filter_value: 'PLANIR', active: true, role: 'depot' },
]

const aviso = (a: Partial<PartnerAviso>): PartnerAviso => ({
  id: 'x', tipo: 'retire', ref: 'A8121', cntr: '', partnerRole: 'depot', partnerFilter: 'PLANIR',
  partnerEmail: 'leo@planir.com.uy', partnerName: 'Leo', dato: {}, estado: 'pendiente',
  motivoRechazo: null, createdAt: '2026-09-03T10:00:00Z', resolvedAt: null, resolvedBy: null,
  ...a,
})

const digest = (
  shipments: CargaDepotDigest[],
  avisos: PartnerAviso[] = [],
  users: UsuarioDeposito[] = planir,
) => buildDepotDigest(users, shipments, avisos, HOY).depositos

describe('agruparDepositos — a quién le llega el mail', () => {
  it('todas las casillas activas del mismo depósito reciben el mismo digest', () => {
    expect(agruparDepositos([
      { email: 'Ana@godilco.com.uy', filter_value: 'GODILCO', active: true, role: 'depot' },
      { email: 'juana@godilco.com.uy', filter_value: 'GODILCO', active: true, role: 'depot' },
    ])).toEqual([{ nombre: 'GODILCO', emails: 'ana@godilco.com.uy,juana@godilco.com.uy' }])
  })

  it('un acceso dado de baja no recibe el recordatorio', () => {
    expect(agruparDepositos([
      { email: 'ex@planir.com.uy', filter_value: 'PLANIR', active: false, role: 'depot' },
    ])).toEqual([])
  })

  it('un depósito sin ninguna casilla queda marcado sinEmail, no desaparece', () => {
    const deps = digest([], [], [{ email: '', filter_value: 'PLANIR', active: true, role: 'depot' }])
    expect(deps[0]).toMatchObject({ nombre: 'PLANIR', emails: '', sinEmail: true })
  })
})

describe('pendientes de retirar de la terminal', () => {
  it('un depósito sin nada pendiente igual entra en el digest, con los totales en cero', () => {
    const deps = digest([])
    expect(deps).toHaveLength(1)
    expect(deps[0]).toMatchObject({
      nombre: 'PLANIR',
      pendientesRetiro: [], pendientesDevolucion: [],
      totales: { retiro: 0, devolucion: 0, devolucionVencidos: 0, total: 0 },
    })
  })

  it('el contenedor que hay que ir a buscar aparece con su ETA, su contenedor y su cliente', () => {
    const [dep] = digest([carga('A8121', [{ CNTR_OP: 'MRKU1234567', LIBRE: '2026-09-10' }])])
    expect(dep.pendientesRetiro).toHaveLength(1)
    expect(dep.pendientesRetiro[0]).toMatchObject({
      ref: 'A8121', cliente: 'BICI PERETTI S.A.', cntr: 'MRKU1234567', tipo: '20DRY',
      terminal: 'MONTECON', eta: '2026-09-02', fecha: '2026-09-02', dias: -1,
      libre: '2026-09-10', estado: 'listo', etiqueta: 'LISTO PARA RETIRAR',
    })
    expect(dep.totales.retiro).toBe(1)
  })

  it('una carga ya retirada no aparece en pendientes de retiro', () => {
    // El equipo lo marcó desde admin: la API lo estampa a nivel CARGA.
    expect(digest([carga('A8121', [{}], { RETIRADO: '2026-09-02' })])[0].pendientesRetiro).toEqual([])
    // Y si el dato viene bajado a la operativa, vale igual.
    expect(digest([carga('A8121', [{ RETIRADO: '2026-09-02' }])])[0].pendientesRetiro).toEqual([])
  })

  it('el turno de Montecon manda sobre la ETA del buque para saber cuándo se retira', () => {
    const [dep] = digest([carga('A8121', [{ TURNO_RETIRO: '2026-09-05' }], { ETA: '2026-09-02' })])
    expect(dep.pendientesRetiro[0]).toMatchObject({ turno: '2026-09-05', fecha: '2026-09-05', dias: 2 })
  })

  it('un CONTENEDOR directo no pasa por el depósito: no es un retiro suyo', () => {
    expect(digest([carga('A8121', [{ OPERATIVA: 'CONTENEDOR' }])])[0].pendientesRetiro).toEqual([])
  })

  it('lo que llega más allá de la semana todavía no se recuerda', () => {
    const lejos = new Date(Date.parse(HOY + 'T00:00:00Z') + (RETIROS_DIAS_ADELANTE + 1) * 86_400_000)
      .toISOString().slice(0, 10)
    expect(digest([carga('A8121', [{}], { ETA: lejos })])[0].pendientesRetiro).toEqual([])
  })

  it('lo de otro depósito no se le manda a este', () => {
    expect(digest([carga('A8121', [{ DEPOSITO: 'GODILCO' }])])[0].pendientesRetiro).toEqual([])
  })
})

describe('pendientes de devolver el vacío', () => {
  it('el vacío que está en el predio se recuerda desde el día del trasiego, con o sin LIBRE cargado', () => {
    const [dep] = digest([carga('A8121', [{ CNTR_OP: 'MRKU1234567' }])])
    expect(dep.pendientesDevolucion).toHaveLength(1)
    expect(dep.pendientesDevolucion[0]).toMatchObject({ ref: 'A8121', libre: '', dias: null })
  })

  it('un vacío DEVUELTO no aparece', () => {
    expect(digest([carga('A8121', [{ LIBRE: 'DEVUELTO' }])])[0].pendientesDevolucion).toEqual([])
    expect(digest([carga('A8121', [{}], { LIBRE_HASTA: 'DEVUELTO' })])[0].pendientesDevolucion).toEqual([])
  })

  it('un contenedor que todavía no llegó no puede tener el vacío pendiente de devolución', () => {
    expect(digest([carga('A8121', [{}], { ETA: '2026-09-10' })])[0].pendientesDevolucion).toEqual([])
  })

  it('el LIBRE vencido se cuenta aparte: es lo que empieza a costar plata', () => {
    const [dep] = digest([
      carga('A8121', [{ LIBRE: '2026-09-01', CNTR_OP: 'A' }]),
      carga('A8122', [{ LIBRE: '2026-09-08', CNTR_OP: 'B' }]),
    ])
    expect(dep.pendientesDevolucion.map(d => d.severidad)).toEqual(['vencido', 'proximo'])
    expect(dep.totales).toMatchObject({ devolucion: 2, devolucionVencidos: 1 })
  })
})

describe('el estado dice si se puede salir o qué falta', () => {
  it('sin el pago de la terminal el retiro no está listo, y la fila lo explica', () => {
    const [dep] = digest([carga('A8121', [{}], { LIBERADA: true, TERMINAL_PAGADA: false })])
    expect(dep.pendientesRetiro[0]).toMatchObject({
      estado: 'falta_pago', etiqueta: 'Falta pago de terminal',
    })
  })

  it('sin liberación de la naviera tampoco, aunque la terminal esté paga', () => {
    const [dep] = digest([carga('A8121', [{}], { LIBERADA: false, TERMINAL_PAGADA: true })])
    expect(dep.pendientesRetiro[0].estado).toBe('falta_liberacion')
  })

  it('sin terminal de devolución asignada el vacío no se puede devolver', () => {
    const [dep] = digest([carga('A8121', [{ DEV: '' }], { DEVOLUCION_PAGADA: true })])
    expect(dep.pendientesDevolucion[0]).toMatchObject({
      estado: 'falta_terminal', etiqueta: 'Falta terminal de devolución',
    })
  })

  it('con la terminal asignada pero la devolución sin pagar, falta el pago', () => {
    const [dep] = digest([carga('A8121', [{ DEV: 'TCP' }], { DEVOLUCION_PAGADA: false })])
    expect(dep.pendientesDevolucion[0]).toMatchObject({ estado: 'falta_pago', dev: 'TCP' })
  })

  it('las dos condiciones son necesarias, ninguna alcanza sola', () => {
    expect(estadoRetiro(true, true)).toBe('listo')
    expect(estadoRetiro(false, false)).toBe('faltan_ambos')
    expect(estadoDevolucion(true, 'TCP')).toBe('listo')
    expect(estadoDevolucion(false, '')).toBe('faltan_ambos')
  })
})

describe('avisos del depósito', () => {
  it('un aviso confirmado saca la fila: el equipo ya ejecutó la acción', () => {
    const deps = digest(
      [carga('A8121', [{ CNTR_OP: 'MRKU1234567' }])],
      [aviso({ tipo: 'retire', ref: 'A8121', cntr: 'MRKU1234567', estado: 'confirmado' })],
    )
    expect(deps[0].pendientesRetiro).toEqual([])
  })

  it('un aviso pendiente deja la fila, pero marcada: no hay que volver a cargarlo', () => {
    const deps = digest(
      [carga('A8121', [{ CNTR_OP: 'MRKU1234567' }])],
      [aviso({ tipo: 'devolvi', ref: 'A8121', cntr: '', estado: 'pendiente' })],
    )
    expect(deps[0].pendientesDevolucion[0]).toMatchObject({ avisoPendiente: true })
  })

  it('el aviso de otro depósito no tapa la fila propia', () => {
    const deps = digest(
      [carga('A8121', [{ CNTR_OP: 'MRKU1234567' }])],
      [aviso({ tipo: 'retire', ref: 'A8121', cntr: 'MRKU1234567', estado: 'confirmado', partnerFilter: 'GODILCO' })],
    )
    expect(deps[0].pendientesRetiro).toHaveLength(1)
  })
})

describe('seguridad: al depósito no le viaja la plata', () => {
  it('las filas no llevan montos ni fechas de pago, solo el estado derivado', () => {
    const [dep] = digest([carga('A8121', [{ CNTR_OP: 'MRKU1234567', LIBRE: '2026-09-10', DEV: 'TCP' }])])
    const claves = [
      ...Object.keys(dep.pendientesRetiro[0]),
      ...Object.keys(dep.pendientesDevolucion[0]),
    ].join(' ').toUpperCase()
    for (const prohibida of ['MONTO', 'FLETE', 'LOCALES', 'PAGO_', 'VTO', 'FORMA']) {
      expect(claves).not.toContain(prohibida)
    }
  })
})
