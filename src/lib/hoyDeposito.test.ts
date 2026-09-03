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
import type { ParsedShipment } from './shipmentTypes'
import type { PartnerAviso } from './partnerAvisos'

const HOY = '2026-09-01' // martes

const op = (o: Partial<OperativaPartner>): OperativaPartner => ({
  REF: 'A1', TLX: '', DEPOSITO: 'PLANIR', ETA_OP: '', SALIDA: '', ETA_FISC: '', LIBRE: '',
  OPERATIVA: 'TRASIEGO', CNTR_OP: '', PKGS: 0, KG: 0, M3: 0, DESCRIPCION: '', FISCAL: '',
  DESCARGA: '', DEV: '', CLIENTE_OP: '', TIPO: '', WOOD: '', TRANSPORTE: '', HORARIO: '',
  ...o,
})

const carga = (ref: string, ops: Partial<OperativaPartner>[], cab: Partial<ParsedShipment> = {}): ParsedShipment => ({
  REF: ref, CLIENTE: 'BICI PERETTI S.A.', ETA: '2026-08-31', TERMINAL: 'MONTECON', LIBRE_HASTA: '',
  ...cab,
  operativas: ops.map(o => op({ REF: ref, ...o })),
} as unknown as ParsedShipment)

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

describe('libresPorVencer — vacíos que hay que devolver', () => {
  it('entran TODOS los pendientes, ordenados por vencimiento, con la severidad de HOY admin', () => {
    // Brian 03/09: antes solo entraban los que vencían dentro de 5 días y el
    // depósito se enteraba tarde. Ahora el vacío aparece desde que está en el
    // predio, venza cuando venza.
    const filas = libresPorVencer([
      carga('V', [{ LIBRE: '2026-08-30' }]),
      carga('H', [{ LIBRE: HOY }]),
      carga('U', [{ LIBRE: '2026-09-03' }]),
      carga('P', [{ LIBRE: '2026-09-06' }]),
      carga('LEJOS', [{ LIBRE: '2026-09-07' }]),
    ], HOY, 'PLANIR', [])
    expect(filas.map(f => [f.ref, f.severidad, f.dias])).toEqual([
      ['V', 'vencido', -2],
      ['H', 'hoy', 0],
      ['U', 'urgente', 2],
      ['P', 'proximo', 5],
      ['LEJOS', 'proximo', 6],
    ])
  })

  it('DEVUELTO en LIBRE = ya se devolvió: no entra', () => {
    expect(libresPorVencer([carga('D', [{ LIBRE: 'DEVUELTO' }])], HOY, 'PLANIR', [])).toEqual([])
  })

  it('sin LIBRE o con texto sin fecha entra igual, al final: el vacío existe', () => {
    const filas = libresPorVencer([
      carga('CONFECHA', [{ LIBRE: '2026-09-03' }]),
      carga('TEXTO', [{ LIBRE: 'CONFIRMAR' }]),
      carga('SIN', [{ LIBRE: '' }]),
    ], HOY, 'PLANIR', [])
    expect(filas.map(f => f.ref)).toEqual(['CONFECHA', 'SIN', 'TEXTO'])
    expect(filas.filter(f => f.ref !== 'CONFECHA').every(f => f.libre === '')).toBe(true)
  })

  it('con fecha de devolución confirmada por la naviera (DEV_FECHA) tampoco entra', () => {
    expect(libresPorVencer([carga('D', [{ LIBRE: '2026-08-20', DEV_FECHA: '2026-08-25' }])], HOY, 'PLANIR', [])).toEqual([])
  })

  it('si la operativa no trae LIBRE usa el de la carga', () => {
    const filas = libresPorVencer([carga('A', [{ LIBRE: '' }], { LIBRE_HASTA: '2026-09-02' })], HOY, 'PLANIR', [])
    expect(filas.map(f => f.libre)).toEqual(['2026-09-02'])
  })

  it('excluye otro depósito y LCL; con aviso "devolví" confirmado desaparece', () => {
    expect(libresPorVencer([
      carga('G', [{ LIBRE: HOY, DEPOSITO: 'GODILCO' }]),
      carga('L', [{ LIBRE: HOY, MODE: 'lcl' }]),
      carga('C', [{ LIBRE: HOY, CNTR_OP: 'X1' }]),
    ], HOY, 'PLANIR', [aviso({ tipo: 'devolvi', ref: 'C', cntr: 'X1', estado: 'confirmado' })])).toEqual([])
  })

  it('si el contenedor todavía no llegó al depósito (turno o ETA futura) no pide devolver el vacío', () => {
    expect(libresPorVencer([
      carga('TURNO', [{ LIBRE: '2026-09-04', TURNO_RETIRO: '2026-09-03' }]),
      // La ETA que manda es la de la CARGA (ETA_OP es una copia congelada).
      carga('ETA', [{ LIBRE: '2026-09-05', ETA_OP: '2026-08-20' }], { ETA: '2026-09-03' }),
      carga('CAB', [{ LIBRE: '2026-09-05' }], { ETA: '2026-09-02' }),
    ], HOY, 'PLANIR', [])).toEqual([])
  })

  it('retirado hoy (turno = hoy) sí entra: ya está en el predio', () => {
    const filas = libresPorVencer([carga('HOY', [{ LIBRE: '2026-09-04', TURNO_RETIRO: HOY }])], HOY, 'PLANIR', [])
    expect(filas.map(f => f.ref)).toEqual(['HOY'])
  })

  it('CONTENEDOR directo no pasa por el predio: no entra ni con LIBRE vencido', () => {
    expect(libresPorVencer([
      carga('DIR', [{ LIBRE: '2026-08-20', OPERATIVA: 'CONTENEDOR' }]),
    ], HOY, 'PLANIR', [])).toEqual([])
  })

  it('ordena: vencidos primero (el más vencido arriba), después los que vencen antes', () => {
    const filas = libresPorVencer([
      carga('P', [{ LIBRE: '2026-09-05' }]),
      carga('V1', [{ LIBRE: '2026-08-31' }]),
      carga('V5', [{ LIBRE: '2026-08-27' }]),
      carga('H', [{ LIBRE: HOY }]),
    ], HOY, 'PLANIR', [])
    expect(filas.map(f => f.ref)).toEqual(['V5', 'V1', 'H', 'P'])
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
