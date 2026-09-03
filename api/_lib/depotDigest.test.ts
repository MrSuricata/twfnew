// Contrato del mail diario a los depósitos. Lo que se fija acá es lo mismo que
// fija `src/lib/hoyDeposito.test.ts` para el portal: el recordatorio no puede
// pedir algo distinto de lo que el depósito ve en pantalla. La comparación
// cabeza a cabeza entre las dos implementaciones vive en
// `src/lib/depotDigest.api.test.ts`.
import { describe, it, expect } from 'vitest'
import {
  buildDepotDigest,
  agruparDepositos,
  estadoRetiro,
  estadoDevolucion,
  RETIROS_DIAS_ADELANTE,
  LIBRE_DIAS_AVISO,
} from './depotDigest.js'
import type { OperativaDepotDigest, CargaDepotDigest, UsuarioDeposito } from './depotDigest.js'
import type { PartnerAviso } from '../../src/lib/partnerAvisos.js'

const HOY = '2026-09-03'

const op = (o: Partial<OperativaDepotDigest> = {}): OperativaDepotDigest => ({
  DEPOSITO: 'PLANIR', OPERATIVA: 'TRASIEGO', CNTR_OP: '', TIPO: '20DRY', LIBRE: '', DEV: '',
  DESCRIPCION: '', ETA_OP: '', SALIDA: '', DESCARGA: '', PKGS: 0, KG: 0, M3: 0,
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

/**
 * El caso normal de un VACÍO: trasiego ya hecho (hay contenedor vacío de
 * verdad) y la terminal de devolución cargada. Cada test rompe una cosa.
 */
const vacio = (
  ref: string,
  o: Partial<OperativaDepotDigest> = {},
  cab: Partial<CargaDepotDigest> = {},
) => carga(ref, [{ SALIDA: '2026-09-01', DEV: 'STL', ...o }], cab)

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
      totales: { retiro: 0, devolucion: 0, devolucionVencidos: 0, devolucionFaltaDato: 0, total: 0 },
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

// ── Vacíos pendientes de devolver ──────────────────────────────────────
// Las reglas cambiaron en main (PR #353) DESPUÉS de escribirse este endpoint:
// antes bastaba con que el contenedor hubiera salido de la terminal y todo
// vacío entraba en la lista. Los tests de abajo fijan las reglas nuevas, que
// son las que ve el depósito en el portal.

describe('regla 1 — el vacío existe solo si la operativa ya se hizo', () => {
  it('sin SALIDA ni DESCARGA no hay vacío, por más que el LIBRE esté vencido', () => {
    // El contenedor llega al depósito LLENO: no hay nada para llevar a la
    // terminal, y el mail no puede pedir una acción imposible.
    expect(digest([
      carga('SIN_OPERATIVA', [{ LIBRE: '2026-08-25', DEV: 'STL' }], { ETA: '2026-08-20' }),
    ])[0].pendientesDevolucion).toEqual([])
  })

  it('haberlo retirado de la terminal NO alcanza: llega al depósito lleno', () => {
    expect(digest([
      carga('RETIRADO', [{ LIBRE: '2026-09-04', DEV: 'STL', TURNO_RETIRO: '2026-09-01' }],
        { RETIRADO: '2026-09-01T14:00:00Z' }),
    ])[0].pendientesDevolucion).toEqual([])
  })

  it('con la operativa programada para mañana tampoco: todavía no se hizo', () => {
    expect(digest([vacio('MANANA', { SALIDA: '2026-09-04', LIBRE: '2026-09-05' })])[0].pendientesDevolucion)
      .toEqual([])
  })

  it('el trasiego de HOY ya cuenta: el vacío existe desde el día de la operativa', () => {
    const [dep] = digest([vacio('A8121', { SALIDA: HOY, LIBRE: '2026-09-05' })])
    expect(dep.pendientesDevolucion.map(d => d.ref)).toEqual(['A8121'])
  })

  it('CARGA A PISO: manda la DESCARGA, aunque la SALIDA sea semanas después', () => {
    // Se desconsolida y la mercadería queda en el predio: el vacío ya está libre.
    const [dep] = digest([vacio('PISO', {
      OPERATIVA: 'CARGA A PISO', DESCARGA: '2026-09-01', SALIDA: '2026-09-28', LIBRE: '2026-09-05',
    })])
    expect(dep.pendientesDevolucion.map(d => d.ref)).toEqual(['PISO'])
  })

  it('CONTENEDOR directo no pasa por el predio: no entra ni con el LIBRE vencido', () => {
    expect(digest([vacio('DIR', { OPERATIVA: 'CONTENEDOR', LIBRE: '2026-08-25' })])[0].pendientesDevolucion)
      .toEqual([])
  })
})

describe('regla 2 — o el LIBRE aprieta, o falta un dato nuestro', () => {
  it('con el LIBRE lejos y todos los datos completos NO se manda: no hay nada que hacer hoy', () => {
    expect(digest([vacio('LEJOS', { LIBRE: '2026-09-20' })])[0].pendientesDevolucion).toEqual([])
  })

  it('con el LIBRE por vencer entra, con la severidad del portal', () => {
    const [dep] = digest([
      vacio('V', { LIBRE: '2026-09-01' }),
      vacio('H', { LIBRE: HOY }),
      vacio('U', { LIBRE: '2026-09-05' }),
      vacio('P', { LIBRE: '2026-09-08' }), // justo en el umbral (5 días)
    ])
    expect(dep.pendientesDevolucion.map(d => [d.ref, d.severidad, d.dias, d.motivo])).toEqual([
      ['V', 'vencido', -2, 'vencimiento'],
      ['H', 'hoy', 0, 'vencimiento'],
      ['U', 'urgente', 2, 'vencimiento'],
      ['P', 'proximo', LIBRE_DIAS_AVISO, 'vencimiento'],
    ])
    expect(dep.totales).toMatchObject({ devolucion: 4, devolucionVencidos: 1, devolucionFaltaDato: 0 })
  })

  it('con el LIBRE lejos pero SIN terminal de devolución sí entra, marcado como dato faltante', () => {
    // No es un vencimiento del depósito: es lo que nos obliga a NOSOTROS a
    // completar el DEV, y el mail lo tiene que decir distinto.
    const [dep] = digest([vacio('SIN_DEV', { LIBRE: '2026-09-22', DEV: '' })])
    expect(dep.pendientesDevolucion).toHaveLength(1)
    expect(dep.pendientesDevolucion[0]).toMatchObject({
      ref: 'SIN_DEV', motivo: 'falta_dato', faltaDev: true, faltaLibre: false,
      dias: 19, severidad: 'proximo', estado: 'falta_terminal', dev: '',
    })
    expect(dep.totales).toMatchObject({ devolucion: 1, devolucionFaltaDato: 1 })
  })

  it('primero lo que corre contra el reloj; las alertas de dato faltante, al final', () => {
    const [dep] = digest([
      vacio('FALTA_DEV', { LIBRE: '2026-09-22', DEV: '' }),
      vacio('P', { LIBRE: '2026-09-07' }),
      vacio('V1', { LIBRE: '2026-09-02' }),
      vacio('V5', { LIBRE: '2026-08-29' }),
      vacio('H', { LIBRE: HOY }),
      vacio('SIN_LIBRE', { LIBRE: '' }),
    ])
    expect(dep.pendientesDevolucion.map(d => d.ref))
      .toEqual(['V5', 'V1', 'H', 'P', 'FALTA_DEV', 'SIN_LIBRE'])
  })

  it('si la operativa no trae LIBRE usa el de la carga', () => {
    const [dep] = digest([vacio('A', { LIBRE: '' }, { LIBRE_HASTA: '2026-09-04' })])
    expect(dep.pendientesDevolucion.map(d => [d.libre, d.motivo])).toEqual([['2026-09-04', 'vencimiento']])
  })
})

describe('regla 3 — sin fecha de LIBRE el mail dice "sin fecha", nunca un número', () => {
  it('sin LIBRE cargado: dias null, severidad sin_dato y motivo falta_dato', () => {
    const [dep] = digest([
      vacio('SIN', { LIBRE: '' }),
      vacio('TEXTO', { LIBRE: 'CONFIRMAR' }),
    ])
    expect(dep.pendientesDevolucion.map(d => [d.ref, d.dias, d.severidad, d.motivo, d.libre, d.faltaLibre]))
      .toEqual([
        ['SIN', null, 'sin_dato', 'falta_dato', '', true],
        ['TEXTO', null, 'sin_dato', 'falta_dato', '', true],
      ])
  })

  it('del JSON no sale ningún plazo inventado: se acabó el "vence en 9999d"', () => {
    // El 9999 era la constante de relleno que se usaba para ordenar y terminaba
    // impresa en el mail como si fuera un vencimiento real.
    const [dep] = digest([vacio('SIN', { LIBRE: '' }), vacio('OK', { LIBRE: '2026-09-04' })])
    expect(JSON.stringify(dep)).not.toContain('9999')
    expect(dep.pendientesDevolucion.every(d => d.dias === null || Math.abs(d.dias) < 400)).toBe(true)
  })

  it('un vacío DEVUELTO no aparece', () => {
    expect(digest([vacio('A8121', { LIBRE: 'DEVUELTO' })])[0].pendientesDevolucion).toEqual([])
    expect(digest([vacio('A8122', {}, { LIBRE_HASTA: 'DEVUELTO' })])[0].pendientesDevolucion).toEqual([])
  })

  it('con fecha de devolución confirmada por la naviera (DEV_FECHA) tampoco entra', () => {
    expect(digest([vacio('A8123', { LIBRE: '2026-08-25', DEV_FECHA: '2026-08-30' })])[0].pendientesDevolucion)
      .toEqual([])
  })
})

describe('regla 4 — todo por contenedor: dos contenedores, dos líneas', () => {
  it('una carga con dos contenedores da dos filas de retiro, cada una con lo suyo', () => {
    const [dep] = digest([
      carga('A8200', [
        { CNTR_OP: 'MSKU1', TIPO: '40HC' },
        { CNTR_OP: 'MSKU2', TIPO: '20DV', TURNO_RETIRO: '2026-09-05' },
      ], { ETA: '2026-09-02' }),
    ])
    expect(dep.pendientesRetiro.map(f => [f.cntr, f.tipo, f.fecha, f.dias])).toEqual([
      ['MSKU1', '40HC', '2026-09-02', -1],
      ['MSKU2', '20DV', '2026-09-05', 2],
    ])
  })

  it('una carga con dos contenedores da dos devoluciones, con su motivo y su estado cada una', () => {
    const [dep] = digest([
      carga('A8202', [
        // Los dos ya trasegados: uno con el LIBRE encima, el otro con el LIBRE
        // lejos pero sin terminal de devolución asignada.
        { CNTR_OP: 'C1', SALIDA: '2026-09-01', LIBRE: '2026-09-04', DEV: 'STL' },
        { CNTR_OP: 'C2', SALIDA: '2026-09-01', LIBRE: '2026-09-22', DEV: '' },
      ]),
    ])
    expect(dep.pendientesDevolucion.map(d => [d.cntr, d.motivo, d.severidad, d.estado])).toEqual([
      ['C1', 'vencimiento', 'urgente', 'listo'],
      ['C2', 'falta_dato', 'proximo', 'falta_terminal'],
    ])
  })

  it('si solo uno de los dos ya se trasegó, solo ese pide devolución', () => {
    const [dep] = digest([
      carga('A8204', [
        { CNTR_OP: 'HECHO', SALIDA: '2026-09-01', LIBRE: '2026-09-04', DEV: 'STL' },
        { CNTR_OP: 'PENDIENTE', SALIDA: '2026-09-12', LIBRE: '2026-09-04', DEV: 'STL' },
      ]),
    ])
    expect(dep.pendientesDevolucion.map(d => d.cntr)).toEqual(['HECHO'])
  })

  it('avisar la devolución de un contenedor no saca al otro de la lista', () => {
    const cargas = [carga('A8203', [
      { CNTR_OP: 'C1', SALIDA: '2026-09-01', LIBRE: '2026-09-04', DEV: 'STL' },
      { CNTR_OP: 'C2', SALIDA: '2026-09-01', LIBRE: '2026-09-04', DEV: 'STL' },
    ])]
    const [dep] = digest(cargas, [aviso({ tipo: 'devolvi', ref: 'A8203', cntr: 'C1', estado: 'confirmado' })])
    expect(dep.pendientesDevolucion.map(d => d.cntr)).toEqual(['C2'])
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
    const [dep] = digest([vacio('A8121', { DEV: '' }, { DEVOLUCION_PAGADA: true })])
    expect(dep.pendientesDevolucion[0]).toMatchObject({
      estado: 'falta_terminal', etiqueta: 'Falta terminal de devolución',
    })
  })

  it('con la terminal asignada pero la devolución sin pagar, falta el pago', () => {
    const [dep] = digest([vacio('A8121', { DEV: 'TCP', LIBRE: '2026-09-04' }, { DEVOLUCION_PAGADA: false })])
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
      [vacio('A8121', { CNTR_OP: 'MRKU1234567', LIBRE: '2026-09-04' })],
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
    const [dep] = digest([vacio('A8121', { CNTR_OP: 'MRKU1234567', LIBRE: '2026-09-05', DEV: 'TCP' })])
    const claves = [
      ...Object.keys(dep.pendientesRetiro[0]),
      ...Object.keys(dep.pendientesDevolucion[0]),
    ].join(' ').toUpperCase()
    for (const prohibida of ['MONTO', 'FLETE', 'LOCALES', 'PAGO_', 'VTO', 'FORMA']) {
      expect(claves).not.toContain(prohibida)
    }
  })
})
