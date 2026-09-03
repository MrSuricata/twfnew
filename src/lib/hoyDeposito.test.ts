import { describe, it, expect } from 'vitest'
import {
  operativasDeHoy,
  retirosProximos,
  libresPorVencer,
  lclADesconsolidar,
  estadoAvisoDe,
  RETIROS_DIAS_ATRAS,
  RETIROS_DIAS_ADELANTE,
  LIBRE_DIAS_AVISO,
  estadoRetiro, ETIQUETA_RETIRO,
  estadoDevolucion, ETIQUETA_DEVOLUCION,
} from './hoyDeposito'
import type { OperativaPartner } from './hoyDeposito'
import type { CargaPartner } from './hoyDeposito'
import type { PartnerAviso } from './partnerAvisos'

const HOY = '2026-09-01' // martes

const op = (o: Partial<OperativaPartner>): OperativaPartner => ({
  REF: 'A1', TLX: '', DEPOSITO: 'PLANIR', ETA_OP: '', SALIDA: '', ETA_FISC: '', LIBRE: '',
  OPERATIVA: 'TRASIEGO', CNTR_OP: '', PKGS: 0, KG: 0, M3: 0, DESCRIPCION: '', FISCAL: '',
  DESCARGA: '', DEV: '', CLIENTE_OP: '', TIPO: '', WOOD: '', TRANSPORTE: '', HORARIO: '',
  ...o,
})

/** Los booleanos que decide el equipo (liberación de la naviera, terminal paga,
 *  devolución paga) viajan al partner pero no están en ParsedShipment. */
type CabPartner = Partial<CargaPartner> & { LIBERADA?: boolean; TERMINAL_PAGADA?: boolean; DEVOLUCION_PAGADA?: boolean }

const carga = (ref: string, ops: Partial<OperativaPartner>[], cab: CabPartner = {}): CargaPartner => ({
  REF: ref, CLIENTE: 'BICI PERETTI S.A.', ETA: '2026-08-31', TERMINAL: 'MONTECON', LIBRE_HASTA: '',
  ...cab,
  operativas: ops.map(o => op({ REF: ref, ...o })),
} as unknown as CargaPartner)

const aviso = (a: Partial<PartnerAviso>): PartnerAviso => ({
  id: 'x', tipo: 'retire', ref: 'A1', cntr: '', partnerRole: 'depot', partnerFilter: 'PLANIR',
  partnerEmail: 'p@planir.uy', partnerName: 'Leo', dato: {}, estado: 'pendiente', motivoRechazo: null,
  createdAt: '2026-09-01T10:00:00Z', resolvedAt: null, resolvedBy: null,
  ...a,
})

describe('operativasDeHoy — lo que se mueve hoy en mi depósito', () => {
  it('entra la carga con SALIDA = hoy, con el transporte que viene y las alertas', () => {
    const filas = operativasDeHoy([
      carga('A7996', [{ SALIDA: HOY, TRANSPORTE: 'TRANSCAL', WOOD: 'SI', IMO: 'SI', OOG: 'SI', NO_APILABLE: 'SI', CNTR_OP: 'MRKU1' }]),
    ], HOY, 'PLANIR')
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      ref: 'A7996', cntr: 'MRKU1', transporte: 'TRANSCAL', motivo: 'carga',
      madera: true, imo: true, oog: true, noApilable: true,
    })
  })

  it('entra el retiro de hoy (turno de Montecon) aunque no cargue hoy', () => {
    const filas = operativasDeHoy([
      carga('A8001', [{ TURNO_RETIRO: HOY, SALIDA: '2026-09-04' }]),
    ], HOY, 'PLANIR')
    expect(filas.map(f => f.motivo)).toEqual(['retiro'])
  })

  it('si carga y retira el mismo día, una sola fila con motivo "ambos"', () => {
    const filas = operativasDeHoy([carga('A8002', [{ SALIDA: HOY, TURNO_RETIRO: HOY }])], HOY, 'PLANIR')
    expect(filas).toHaveLength(1)
    expect(filas[0].motivo).toBe('ambos')
  })

  it('sin turno, el retiro de un TRASIEGO se estima por la ETA del buque', () => {
    const filas = operativasDeHoy([carga('A8003', [{ OPERATIVA: 'TRASIEGO' }], { ETA: HOY })], HOY, 'PLANIR')
    expect(filas.map(f => f.motivo)).toEqual(['retiro'])
  })

  it('un CONTENEDOR directo (no pasa por depósito) NO se cuenta como retiro mío', () => {
    expect(operativasDeHoy([carga('A8004', [{ OPERATIVA: 'CONTENEDOR' }], { ETA: HOY })], HOY, 'PLANIR')).toEqual([])
  })

  it('ya retirado (RETIRADO con fecha) no vuelve a aparecer como retiro', () => {
    expect(operativasDeHoy([carga('A8005', [{ TURNO_RETIRO: HOY, RETIRADO: '2026-08-31' }])], HOY, 'PLANIR')).toEqual([])
  })

  it('lo de otro depósito y lo de otro día no entran', () => {
    expect(operativasDeHoy([
      carga('A1', [{ SALIDA: HOY, DEPOSITO: 'GODILCO' }]),
      carga('A2', [{ SALIDA: '2026-09-02' }]),
    ], HOY, 'PLANIR')).toEqual([])
  })

  it('TLX pendiente se marca (vacío o NO), con TLX ok no', () => {
    const filas = operativasDeHoy([
      carga('A1', [{ SALIDA: HOY, TLX: '' }]),
      carga('A2', [{ SALIDA: HOY, TLX: 'OK' }]),
    ], HOY, 'PLANIR')
    expect(filas.map(f => f.tlxPendiente)).toEqual([true, false])
  })
})

describe('retirosProximos — contenedores que retiro de la terminal', () => {
  it('TRASIEGO a mi depósito con ETA en ventana entra, con terminal, ETA, turno y LIBRE', () => {
    const filas = retirosProximos([
      carga('A8010', [{ OPERATIVA: 'TRASIEGO', CNTR_OP: 'MSKU1', LIBRE: '2026-09-10', TURNO_RETIRO: '2026-09-03' }], { ETA: '2026-09-02', TERMINAL: 'MONTECON' }),
    ], HOY, 'PLANIR', [])
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ ref: 'A8010', cntr: 'MSKU1', terminal: 'MONTECON', eta: '2026-09-02', turno: '2026-09-03', libre: '2026-09-10', dias: 2 })
  })

  it('CARGA A PISO también es un retiro hacia el depósito', () => {
    const filas = retirosProximos([carga('A8011', [{ OPERATIVA: 'CARGA A PISO' }], { ETA: HOY })], HOY, 'PLANIR', [])
    expect(filas).toHaveLength(1)
  })

  it('CONTENEDOR directo no pasa por mi depósito: no entra', () => {
    expect(retirosProximos([carga('A8012', [{ OPERATIVA: 'CONTENEDOR' }], { ETA: HOY })], HOY, 'PLANIR', [])).toEqual([])
  })

  it('respeta la ventana hoy-2 … hoy+7 (con el turno de Montecon si lo hay, si no la ETA)', () => {
    const dentroAtras = `2026-08-${30 - RETIROS_DIAS_ATRAS + 2}` // hoy-2 = 30/08
    const fueraAtras = '2026-08-29'
    const dentroAdelante = `2026-09-0${1 + RETIROS_DIAS_ADELANTE}` // hoy+7 = 08/09
    const fueraAdelante = '2026-09-09'
    const filas = retirosProximos([
      carga('DA', [{}], { ETA: dentroAtras }),
      carga('FA', [{}], { ETA: fueraAtras }),
      carga('DD', [{}], { ETA: dentroAdelante }),
      carga('FD', [{}], { ETA: fueraAdelante }),
      carga('TURNO', [{ TURNO_RETIRO: HOY }], { ETA: '2026-08-15' }), // ETA vieja pero turno hoy → entra
    ], HOY, 'PLANIR', [])
    expect(filas.map(f => f.ref).sort()).toEqual(['DA', 'DD', 'TURNO'])
  })

  it('excluye ya retirados, ya devueltos y LCL', () => {
    const filas = retirosProximos([
      carga('RET', [{ RETIRADO: '2026-08-31' }], { ETA: HOY }),
      carga('DEV', [{ LIBRE: 'DEVUELTO' }], { ETA: HOY }),
      carga('LCL', [{ MODE: 'lcl' }], { ETA: HOY }),
      carga('OK', [{}], { ETA: HOY }),
    ], HOY, 'PLANIR', [])
    expect(filas.map(f => f.ref)).toEqual(['OK'])
  })

  it('con aviso "retiré" pendiente la fila queda esperando confirmación; confirmado, desaparece', () => {
    const cargas = [carga('A8020', [{ CNTR_OP: 'MRKU2' }], { ETA: HOY })]
    const pend = retirosProximos(cargas, HOY, 'PLANIR', [aviso({ tipo: 'retire', ref: 'A8020', cntr: 'MRKU2', estado: 'pendiente' })])
    expect(pend[0].aviso?.estado).toBe('pendiente')
    const conf = retirosProximos(cargas, HOY, 'PLANIR', [aviso({ tipo: 'retire', ref: 'A8020', cntr: 'MRKU2', estado: 'confirmado' })])
    expect(conf).toEqual([])
  })

  it('un aviso rechazado deja la fila con el motivo para volver a intentar', () => {
    const filas = retirosProximos([carga('A8021', [{ CNTR_OP: 'C1' }], { ETA: HOY })], HOY, 'PLANIR',
      [aviso({ tipo: 'retire', ref: 'A8021', cntr: 'C1', estado: 'rechazado', motivoRechazo: 'Todavía está en la terminal' })])
    expect(filas[0].aviso).toMatchObject({ estado: 'rechazado', motivoRechazo: 'Todavía está en la terminal' })
  })

  it('ordena por fecha de retiro: lo más cercano primero', () => {
    const filas = retirosProximos([
      carga('B', [{}], { ETA: '2026-09-05' }),
      carga('A', [{}], { ETA: '2026-09-02' }),
      carga('C', [{ TURNO_RETIRO: '2026-08-31' }], { ETA: '2026-09-06' }),
    ], HOY, 'PLANIR', [])
    expect(filas.map(f => f.ref)).toEqual(['C', 'A', 'B'])
  })
})

describe('RETIRADO y TURNO_RETIRO — la API los estampa a nivel CARGA', () => {
  // Nacen en `montecon_agenda`, que se lleva por REF: `partnerShipmentsVisibles`
  // los pone arriba, en la carga. Si el HOY del depósito los leyera solo en la
  // operativa, el dato le llegaría siempre vacío.

  it('el equipo marcó RETIRADO desde admin: la carga sale de los retiros del depósito', () => {
    const filas = retirosProximos([
      carga('A8121', [{ OPERATIVA: 'TRASIEGO' }], { ETA: HOY, RETIRADO: '2026-08-31T14:00:00Z' }),
    ], HOY, 'PLANIR', [])
    expect(filas).toEqual([])
  })

  it('marcado a nivel operativa saca la fila igual (el camino de antes sigue valiendo)', () => {
    const filas = retirosProximos([
      carga('A8122', [{ OPERATIVA: 'TRASIEGO', RETIRADO: '2026-08-31' }], { ETA: HOY }),
    ], HOY, 'PLANIR', [])
    expect(filas).toEqual([])
  })

  it('marcado a nivel carga tampoco figura como retiro del día en las operativas de hoy', () => {
    expect(operativasDeHoy([
      carga('A8123', [{ OPERATIVA: 'TRASIEGO' }], { ETA: HOY, RETIRADO: '2026-08-31T14:00:00Z' }),
    ], HOY, 'PLANIR')).toEqual([])
  })

  it('el turno de Montecon a nivel carga manda sobre la ETA para la fecha de retiro', () => {
    // Con la ETA sola (15/08) la fila quedaba fuera de la ventana hoy-2…hoy+7:
    // el turno del 03/09 es el que la trae al HOY del depósito.
    const filas = retirosProximos([
      carga('A8124', [{ OPERATIVA: 'TRASIEGO' }], { ETA: '2026-08-15', TURNO_RETIRO: '2026-09-03' }),
    ], HOY, 'PLANIR', [])
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ ref: 'A8124', turno: '2026-09-03', fecha: '2026-09-03', dias: 2 })
  })
})

describe('libresPorVencer — vacíos que hay que devolver', () => {
  // REGLA (Brian 03/09, mirando el portal de GODILCO): un vacío aparece SOLO si
  // la operativa ya se hizo —el contenedor está vacío de verdad— y además o el
  // LIBRE aprieta, o nos falta un dato (fecha de libre / terminal de devolución).
  // `vacio()` arma el caso normal: trasiego ya hecho y todos los datos cargados.
  const vacio = (ref: string, o: Partial<OperativaPartner> = {}, cab: CabPartner = {}) =>
    carga(ref, [{ SALIDA: '2026-08-30', DEV: 'STL', ...o }], { DEVOLUCION_PAGADA: true, ...cab })

  describe('regla 1 — solo si la operativa YA se hizo', () => {
    it('sin SALIDA ni DESCARGA no hay vacío, por más que el LIBRE esté vencido', () => {
      expect(libresPorVencer([
        carga('SIN_OPERATIVA', [{ LIBRE: '2026-08-20', DEV: 'STL' }], { ETA: '2026-08-10' }),
      ], HOY, 'PLANIR', [])).toEqual([])
    })

    it('haberlo retirado de la terminal NO alcanza: llega al depósito lleno', () => {
      // Este era el error en pantalla: el portal recomendaba devolver un
      // contenedor que todavía tenía la mercadería adentro.
      expect(libresPorVencer([
        carga('RETIRADO', [{ LIBRE: '2026-09-02', DEV: 'STL', TURNO_RETIRO: '2026-08-31' }], { RETIRADO: '2026-08-31T14:00:00Z' }),
      ], HOY, 'PLANIR', [])).toEqual([])
    })

    it('con la operativa programada para mañana tampoco: todavía no se hizo', () => {
      expect(libresPorVencer([vacio('MANANA', { SALIDA: '2026-09-02', LIBRE: '2026-09-03' })], HOY, 'PLANIR', [])).toEqual([])
    })

    it('el trasiego de HOY ya cuenta: el vacío existe desde el día de la operativa', () => {
      const filas = libresPorVencer([vacio('A8121', { SALIDA: HOY, LIBRE: '2026-09-03' })], HOY, 'PLANIR', [])
      expect(filas.map(f => f.ref)).toEqual(['A8121'])
    })

    it('CARGA A PISO: manda la DESCARGA, aunque la SALIDA sea semanas después', () => {
      // Se desconsolida y la carga queda en el predio: el vacío ya está libre.
      const filas = libresPorVencer([
        vacio('PISO', { OPERATIVA: 'CARGA A PISO', DESCARGA: '2026-08-29', SALIDA: '2026-09-25', LIBRE: '2026-09-03' }),
      ], HOY, 'PLANIR', [])
      expect(filas.map(f => f.ref)).toEqual(['PISO'])
    })

    it('CONTENEDOR directo no pasa por el predio: no entra ni con LIBRE vencido', () => {
      expect(libresPorVencer([
        vacio('DIR', { LIBRE: '2026-08-20', OPERATIVA: 'CONTENEDOR' }),
      ], HOY, 'PLANIR', [])).toEqual([])
    })
  })

  describe('regla 2 — o el LIBRE aprieta, o falta un dato nuestro', () => {
    it('con el LIBRE lejos y todos los datos completos NO aparece: no hay nada que hacer hoy', () => {
      expect(libresPorVencer([vacio('LEJOS', { LIBRE: '2026-09-07' })], HOY, 'PLANIR', [])).toEqual([])
    })

    it('con el LIBRE por vencer aparece, con la severidad de HOY admin', () => {
      const filas = libresPorVencer([
        vacio('V', { LIBRE: '2026-08-30' }),
        vacio('H', { LIBRE: HOY }),
        vacio('U', { LIBRE: '2026-09-03' }),
        vacio('P', { LIBRE: '2026-09-06' }), // justo en el umbral (5 días)
      ], HOY, 'PLANIR', [])
      expect(filas.map(f => [f.ref, f.severidad, f.dias, f.motivo])).toEqual([
        ['V', 'vencido', -2, 'vencimiento'],
        ['H', 'hoy', 0, 'vencimiento'],
        ['U', 'urgente', 2, 'vencimiento'],
        ['P', 'proximo', LIBRE_DIAS_AVISO, 'vencimiento'],
      ])
    })

    it('con el LIBRE lejos pero SIN terminal de devolución sí aparece, como dato faltante', () => {
      // No es un vencimiento: es lo que nos obliga a NOSOTROS a completar el DEV.
      const filas = libresPorVencer([vacio('SIN_DEV', { LIBRE: '2026-09-20', DEV: '' })], HOY, 'PLANIR', [])
      expect(filas).toHaveLength(1)
      expect(filas[0]).toMatchObject({
        ref: 'SIN_DEV', motivo: 'falta_dato', faltaDev: true, faltaLibre: false,
        dias: 19, severidad: 'proximo', estado: 'falta_terminal', dev: '',
      })
    })

    it('sin fecha de LIBRE aparece como dato faltante, y NUNCA con un plazo inventado', () => {
      // El "vence en 9999d" que se veía en pantalla era la constante que se usaba
      // para ordenar: ahora sin fecha es `dias: null` y la UI lo dice con palabras.
      const filas = libresPorVencer([
        vacio('SIN', { LIBRE: '' }),
        vacio('TEXTO', { LIBRE: 'CONFIRMAR' }),
      ], HOY, 'PLANIR', [])
      expect(filas.map(f => [f.ref, f.dias, f.severidad, f.motivo, f.libre, f.faltaLibre])).toEqual([
        ['SIN', null, 'sin_dato', 'falta_dato', '', true],
        ['TEXTO', null, 'sin_dato', 'falta_dato', '', true],
      ])
      expect(filas.every(f => f.dias === null || f.dias < 400)).toBe(true)
    })

    it('si la operativa no trae LIBRE usa el de la carga', () => {
      const filas = libresPorVencer([vacio('A', { LIBRE: '' }, { LIBRE_HASTA: '2026-09-02' })], HOY, 'PLANIR', [])
      expect(filas.map(f => [f.libre, f.motivo])).toEqual([['2026-09-02', 'vencimiento']])
    })

    it('primero lo que corre contra el reloj; las alertas de dato faltante, al final', () => {
      const filas = libresPorVencer([
        vacio('FALTA_DEV', { LIBRE: '2026-09-20', DEV: '' }),
        vacio('P', { LIBRE: '2026-09-05' }),
        vacio('V1', { LIBRE: '2026-08-31' }),
        vacio('V5', { LIBRE: '2026-08-27' }),
        vacio('H', { LIBRE: HOY }),
        vacio('SIN_LIBRE', { LIBRE: '' }),
      ], HOY, 'PLANIR', [])
      expect(filas.map(f => f.ref)).toEqual(['V5', 'V1', 'H', 'P', 'FALTA_DEV', 'SIN_LIBRE'])
    })
  })

  describe('ya devuelto o ya avisado', () => {
    it('DEVUELTO en LIBRE = ya se devolvió: no entra', () => {
      expect(libresPorVencer([vacio('D', { LIBRE: 'DEVUELTO' })], HOY, 'PLANIR', [])).toEqual([])
    })

    it('con fecha de devolución confirmada por la naviera (DEV_FECHA) tampoco entra', () => {
      expect(libresPorVencer([vacio('D', { LIBRE: '2026-08-20', DEV_FECHA: '2026-08-25' })], HOY, 'PLANIR', [])).toEqual([])
    })

    it('excluye otro depósito y LCL; con aviso "devolví" confirmado desaparece', () => {
      expect(libresPorVencer([
        vacio('G', { LIBRE: HOY, DEPOSITO: 'GODILCO' }),
        vacio('L', { LIBRE: HOY, MODE: 'lcl' }),
        vacio('C', { LIBRE: HOY, CNTR_OP: 'X1' }),
      ], HOY, 'PLANIR', [aviso({ tipo: 'devolvi', ref: 'C', cntr: 'X1', estado: 'confirmado' })])).toEqual([])
    })
  })
})

describe('todo por contenedor — dos contenedores, dos líneas independientes (Brian 03/09)', () => {
  // "Todos los retiros y devoluciones tienen que manejarse POR CONTENEDOR: si
  // una operativa tiene dos contenedores, son dos líneas independientes de
  // retiro y de devolución."

  it('una carga con dos contenedores da dos filas de retiro, cada una con lo suyo', () => {
    const filas = retirosProximos([
      carga('A8200', [
        { CNTR_OP: 'MSKU1', TIPO: '40HC', LIBRE: '2026-09-10' },
        { CNTR_OP: 'MSKU2', TIPO: '20DV', LIBRE: '2026-09-12', TURNO_RETIRO: '2026-09-04' },
      ], { ETA: '2026-09-02' }),
    ], HOY, 'PLANIR', [])
    expect(filas.map(f => [f.ref, f.cntr, f.tipo, f.fecha, f.dias])).toEqual([
      ['A8200', 'MSKU1', '40HC', '2026-09-02', 1],
      ['A8200', 'MSKU2', '20DV', '2026-09-04', 3],
    ])
  })

  it('avisar el retiro de un contenedor no saca al otro de la lista', () => {
    const cargas = [carga('A8201', [{ CNTR_OP: 'C1' }, { CNTR_OP: 'C2' }], { ETA: HOY })]
    const filas = retirosProximos(cargas, HOY, 'PLANIR', [
      aviso({ tipo: 'retire', ref: 'A8201', cntr: 'C1', estado: 'confirmado' }),
    ])
    expect(filas.map(f => f.cntr)).toEqual(['C2'])
  })

  it('una carga con dos contenedores da dos filas de devolución, con su estado cada una', () => {
    const filas = libresPorVencer([
      carga('A8202', [
        // Uno ya trasegado y con el libre encima; el otro trasegado también,
        // con el libre lejos pero sin terminal de devolución.
        { CNTR_OP: 'C1', SALIDA: '2026-08-30', LIBRE: '2026-09-02', DEV: 'STL' },
        { CNTR_OP: 'C2', SALIDA: '2026-08-30', LIBRE: '2026-09-20', DEV: '' },
      ], { DEVOLUCION_PAGADA: true }),
    ], HOY, 'PLANIR', [])
    expect(filas.map(f => [f.cntr, f.motivo, f.severidad, f.estado])).toEqual([
      ['C1', 'vencimiento', 'urgente', 'listo'],
      ['C2', 'falta_dato', 'proximo', 'falta_terminal'],
    ])
  })

  it('avisar la devolución de un contenedor no saca al otro', () => {
    const cargas = [carga('A8203', [
      { CNTR_OP: 'C1', SALIDA: '2026-08-30', LIBRE: '2026-09-02', DEV: 'STL' },
      { CNTR_OP: 'C2', SALIDA: '2026-08-30', LIBRE: '2026-09-02', DEV: 'STL' },
    ])]
    const filas = libresPorVencer(cargas, HOY, 'PLANIR', [
      aviso({ tipo: 'devolvi', ref: 'A8203', cntr: 'C1', estado: 'confirmado' }),
    ])
    expect(filas.map(f => f.cntr)).toEqual(['C2'])
  })

  it('si solo uno de los dos ya se trasegó, solo ese pide devolución', () => {
    const filas = libresPorVencer([
      carga('A8204', [
        { CNTR_OP: 'HECHO', SALIDA: '2026-08-30', LIBRE: '2026-09-02', DEV: 'STL' },
        { CNTR_OP: 'PENDIENTE', SALIDA: '2026-09-10', LIBRE: '2026-09-02', DEV: 'STL' },
      ]),
    ], HOY, 'PLANIR', [])
    expect(filas.map(f => f.cntr)).toEqual(['HECHO'])
  })
})

describe('lclADesconsolidar — LCL que llegaron y no tienen stock', () => {
  it('LCL de mi depósito con ETA pasada (o de hoy) y sin stock entra, con los días esperando', () => {
    const filas = lclADesconsolidar([
      carga('LCL201', [{ MODE: 'lcl', STOCK: '', PKGS: 12, KG: 800, M3: 3.5 }], { ETA: '2026-08-28' }),
      carga('LCL202', [{ MODE: 'lcl' }], { ETA: HOY }),
    ], HOY, 'PLANIR', [])
    expect(filas.map(f => [f.ref, f.diasDesdeEta])).toEqual([['LCL201', 4], ['LCL202', 0]])
    expect(filas[0]).toMatchObject({ pkgs: 12, kg: 800, m3: 3.5 })
  })

  it('con stock, ETA futura, sin ETA, otro depósito o FCL: no entra', () => {
    expect(lclADesconsolidar([
      carga('S', [{ MODE: 'lcl', STOCK: '45012' }], { ETA: '2026-08-28' }),
      carga('F', [{ MODE: 'lcl' }], { ETA: '2026-09-02' }),
      carga('N', [{ MODE: 'lcl' }], { ETA: '' }),
      carga('G', [{ MODE: 'lcl', DEPOSITO: 'GODILCO' }], { ETA: '2026-08-28' }),
      carga('A', [{ MODE: 'fcl' }], { ETA: '2026-08-28' }),
      carga('SIN_MODE', [{}], { ETA: '2026-08-28' }),
    ], HOY, 'PLANIR', [])).toEqual([])
  })

  it('la ETA de la operativa (ETA de la LCL) manda sobre la de la cabecera', () => {
    const filas = lclADesconsolidar([carga('L', [{ MODE: 'lcl', ETA: '2026-08-30' }], { ETA: '2026-09-05' })], HOY, 'PLANIR', [])
    expect(filas.map(f => f.eta)).toEqual(['2026-08-30'])
  })

  it('aviso "desconsolidé" pendiente queda esperando; confirmado desaparece', () => {
    const cargas = [carga('LCL210', [{ MODE: 'lcl' }], { ETA: '2026-08-28' })]
    const pend = lclADesconsolidar(cargas, HOY, 'PLANIR', [aviso({ tipo: 'desconsolide', ref: 'LCL210', cntr: '', estado: 'pendiente', dato: { stock: '45012' } })])
    expect(pend[0].aviso?.estado).toBe('pendiente')
    expect(pend[0].aviso?.dato.stock).toBe('45012')
    expect(lclADesconsolidar(cargas, HOY, 'PLANIR', [aviso({ tipo: 'desconsolide', ref: 'LCL210', estado: 'confirmado' })])).toEqual([])
  })
})

describe('estadoAvisoDe — el último aviso de esa carga/contenedor', () => {
  it('sin avisos devuelve undefined; el más nuevo manda', () => {
    expect(estadoAvisoDe([], 'retire', 'A1', 'C1')).toBeUndefined()
    const a = estadoAvisoDe([
      aviso({ id: 'viejo', tipo: 'retire', ref: 'A1', cntr: 'C1', estado: 'rechazado', createdAt: '2026-08-30T10:00:00Z' }),
      aviso({ id: 'nuevo', tipo: 'retire', ref: 'A1', cntr: 'C1', estado: 'pendiente', createdAt: '2026-09-01T10:00:00Z' }),
    ], 'retire', 'A1', 'C1')
    expect(a?.id).toBe('nuevo')
  })

  it('un aviso sin contenedor (cntr vacío) vale para la ref entera', () => {
    const a = estadoAvisoDe([aviso({ tipo: 'devolvi', ref: 'A1', cntr: '', estado: 'pendiente' })], 'devolvi', 'A1', 'MRKU1')
    expect(a?.estado).toBe('pendiente')
  })
})

describe('estadoRetiro — dos condiciones, no una (Brian 03/09)', () => {
  it('listo solo con liberación Y terminal paga', () => {
    expect(estadoRetiro(true, true)).toBe('listo')
  })
  it('liberada pero sin pagar la terminal NO es listo: el depósito va y no se lo dan', () => {
    expect(estadoRetiro(true, false)).toBe('falta_pago')
  })
  it('paga pero sin liberar tampoco', () => {
    expect(estadoRetiro(false, true)).toBe('falta_liberacion')
  })
  it('sin nada, dice que faltan las dos', () => {
    expect(estadoRetiro(false, false)).toBe('faltan_ambos')
  })
  it('cada estado tiene su etiqueta y solo una habilita', () => {
    expect(ETIQUETA_RETIRO.listo).toBe('LISTO PARA RETIRAR')
    const otras = ['falta_liberacion', 'falta_pago', 'faltan_ambos'] as const
    for (const e of otras) expect(ETIQUETA_RETIRO[e]).toMatch(/^Falta/)
  })
})

describe('estadoDevolucion — dos condiciones para llevar el vacío (Brian 03/09)', () => {
  it('listo solo con la devolución paga Y terminal asignada', () => {
    expect(estadoDevolucion(true, 'STL')).toBe('listo')
  })
  it('paga pero sin terminal: el depósito no sabe a dónde llevarlo', () => {
    expect(estadoDevolucion(true, '')).toBe('falta_terminal')
    expect(estadoDevolucion(true, '   ')).toBe('falta_terminal')
  })
  it('con terminal pero sin pagar: no se lo reciben', () => {
    expect(estadoDevolucion(false, 'MPS')).toBe('falta_pago')
  })
  it('sin nada, dice que faltan las dos', () => {
    expect(estadoDevolucion(false, '')).toBe('faltan_ambos')
  })
  it('solo una etiqueta habilita', () => {
    expect(ETIQUETA_DEVOLUCION.listo).toBe('LISTO PARA DEVOLVER')
    for (const e of ['falta_pago', 'falta_terminal', 'faltan_ambos'] as const) {
      expect(ETIQUETA_DEVOLUCION[e]).toMatch(/^Falta/)
    }
  })
})
