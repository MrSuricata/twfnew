import { describe, it, expect } from 'vitest'
import {
  esCargaDeClienteActiva, rowToClientShipment, CLIENT_SHIPMENT_COLS, camionesPorRef,
  CLIENTE_ETA_MAX_DIAS, CLIENTE_ENTREGADA_DIAS,
} from '../../api/_lib/clientShipments'

// El portal de clientes es la superficie MÁS expuesta de la app: estos tests
// fijan el contrato de seguridad (qué viaja y qué JAMÁS puede viajar).

const HOY = '2026-08-26'

describe('esCargaDeClienteActiva — qué ve el cliente', () => {
  const base = { archived: false, source: 'fcl', eta: '2026-09-05', eta_fiscal: '' }

  it('activa normal: se muestra', () => {
    expect(esCargaDeClienteActiva(base, HOY)).toBe(true)
  })

  it('archivadas y espejo de la planilla: jamás', () => {
    expect(esCargaDeClienteActiva({ ...base, archived: true }, HOY)).toBe(false)
    expect(esCargaDeClienteActiva({ ...base, source: 'sheet' }, HOY)).toBe(false)
  })

  it('sin ETA parseable (cascarón) no es información: afuera', () => {
    expect(esCargaDeClienteActiva({ ...base, eta: '' }, HOY)).toBe(false)
    expect(esCargaDeClienteActiva({ ...base, eta: 'CONFIRMAR' }, HOY)).toBe(false)
  })

  it('el límite de vigencia es exactamente CLIENTE_ETA_MAX_DIAS días', () => {
    expect(CLIENTE_ETA_MAX_DIAS).toBe(60)
    expect(esCargaDeClienteActiva({ ...base, eta: '2026-06-27' }, HOY)).toBe(true)   // hace 60 → entra
    expect(esCargaDeClienteActiva({ ...base, eta: '2026-06-26' }, HOY)).toBe(false)  // hace 61 → afuera
  })

  it('entregada hace poco se muestra como confirmación; vieja sale sola', () => {
    expect(CLIENTE_ENTREGADA_DIAS).toBe(10)
    expect(esCargaDeClienteActiva({ ...base, eta: '2026-08-01', eta_fiscal: '2026-08-18' }, HOY)).toBe(true)  // hace 8
    expect(esCargaDeClienteActiva({ ...base, eta: '2026-08-01', eta_fiscal: '2026-08-15' }, HOY)).toBe(false) // hace 11
  })
})

describe('rowToClientShipment — el contrato de la whitelist', () => {
  // Fila "hostil": trae TODO lo sensible. Nada de esto puede salir.
  const fila = {
    ref: 'A8045', client_ref: '1417', cliente: 'CHIAPERO Y ASOC. S.R.L.',
    eta: '2026-09-06', etd: '2026-07-06', buque: 'SAN LORENZO MAERSK 630W',
    linea: 'HAPAG', terminal: 'TCP', doc_number: 'HLCU123', contenedor: 'FANU1858496',
    pkgs: 463, kg: 4484, m3: 20, observacion: 'MOTOPARTES', fiscal: 'RAFAELA',
    salida: '2026-09-08', eta_fiscal: '2026-09-10', libre: '2026-09-20',
    deposito: 'GODILCO', operativa: 'TRASIEGO', transporte: 'RIGATOSSO',
    monto_flete: 8400, monto_locales: 900, pago_flete_at: '2026-08-01', pago_flete_monto: 8300,
    forma_pago: 'programado', agente: 'CRAFT', notes: 'nota interna secreta',
    operativas: [{ CNTR_OP: 'FANU1858496', SALIDA: '2026-09-08', CLIENTE_OP: 'OTRO CLIENTE SRL', PKGS: 463 }],
  }

  it('los campos operativos del cliente SÍ viajan (incluida SU ref propia)', () => {
    const v = rowToClientShipment(fila) as any
    expect(v.REF).toBe('A8045')
    expect(v.CLIENT_REF).toBe('1417')
    expect(v.ETA).toBe('2026-09-06')
    expect(v.BUQUE).toBe('SAN LORENZO MAERSK 630W')
    expect(v.CNTR).toBe('FANU1858496')
    expect(v.operativas[0].SALIDA).toBe('2026-09-08')
    expect(v.operativas[0].DESCRIPCION).toBe('MOTOPARTES')
    expect(v.operativas[0].FISCAL).toBe('RAFAELA')
  })

  it('JAMÁS viaja plata, agente, notas internas ni nombres de clientes', () => {
    const v = rowToClientShipment(fila) as any
    const json = JSON.stringify(v)
    expect(v.FLETE).toBe(0)
    expect(v.LOCALES).toBe(0)
    expect(v.C_TERMINAL).toBe(0)
    expect(v.C_DEV).toBe(0)
    expect(v.VTO).toBe('')
    expect(v.CLIENTE).toBe('')
    expect(v.operativas[0].CLIENTE_OP).toBe('')
    expect(json).not.toContain('8400')
    expect(json).not.toContain('8300')
    expect(json).not.toContain('CRAFT')
    expect(json).not.toContain('secreta')
    expect(json).not.toContain('OTRO CLIENTE')
    expect(json.toLowerCase()).not.toContain('monto')
    expect(json.toLowerCase()).not.toContain('pago_')
  })

  it('el SELECT del endpoint ni siquiera pide columnas de plata', () => {
    expect(CLIENT_SHIPMENT_COLS).not.toMatch(/monto|pago|forma_pago|agente|notes|costo/)
  })

  it('sin array por contenedor arma la operativa sintética desde las columnas', () => {
    const v = rowToClientShipment({ ...fila, operativas: [] }) as any
    expect(v.operativas).toHaveLength(1)
    expect(v.operativas[0].SALIDA).toBe('2026-09-08')
    expect(v.operativas[0].CLIENTE_OP).toBe('')
  })
})

describe('rowToClientShipment — modalidad y LCL en camión (Brian 02/09)', () => {
  const lcl = {
    ref: 'E234', client_ref: '', cliente: 'CHIAPERO Y ASOC. S.R.L.', mode: 'lcl',
    eta: '2026-08-20', etd: '2026-07-10', buque: 'MSC LAURA', deposito: 'PLANIR', fiscal: 'CACEC',
    observacion: 'REPUESTOS', pkgs: 12, kg: 800, m3: 3.2, dest_country: 'UY',
    operativas: null, salida: '', eta_fiscal: '',
  }
  const camion = { code: 'C463', departure_date: '2026-09-01', arrival_date: '2026-09-03', load_date: '2026-09-01', entregado: false, fiscal: 'ZF RAFAELA' }

  it('MODE viaja en minúscula (fcl por defecto)', () => {
    expect((rowToClientShipment({ ref: 'A1', mode: 'FCL' }) as any).MODE).toBe('fcl')
    expect((rowToClientShipment({ ref: 'E1', mode: 'lcl' }) as any).MODE).toBe('lcl')
    expect((rowToClientShipment({ ref: 'A2' }) as any).MODE).toBe('fcl')
  })

  it('una LCL con camión arma la operativa CONSOLIDADO con las fechas del camión y el fiscal de la fila; la descripción es la de la carga', () => {
    const v = rowToClientShipment(lcl, camion) as any
    expect(v.operativas).toHaveLength(1)
    expect(v.operativas[0]).toMatchObject({
      OPERATIVA: 'CONSOLIDADO', SALIDA: '2026-09-01', ETA_FISC: '2026-09-03', CAMION: 'C463', ENTREGADO: false,
      FISCAL: 'ZF RAFAELA', DESCRIPCION: 'REPUESTOS', DEPOSITO: 'PLANIR', LUGAR_SALIDA: 'PLANIR', CNTR_OP: '',
    })
    expect(v.operativas[0].TRANSPORTE).toBe('')
  })

  it('camión marcado entregado sin fecha de llegada → ENTREGADO viaja para que el portal lo dé por llegado', () => {
    const v = rowToClientShipment(lcl, { ...camion, arrival_date: '', entregado: true }) as any
    expect(v.operativas[0]).toMatchObject({ ETA_FISC: '', ENTREGADO: true })
  })

  it('el código del camión solo viaja si es C###: un code libre con refs y clientes ajenos se blanquea', () => {
    const loads = [{ source_ref: 'E234', truck_id: 't9', fiscal: '', pending: null }]
    const trucks = [{ id: 't9', code: 'A7887 + A7849 - YEMEN', departure_date: '2026-08-20', arrival_date: '', load_date: '2026-08-20', draft: false, status: 'delivered' }]
    const m = camionesPorRef(loads, trucks)
    expect(m.get('E234')).toMatchObject({ code: '', entregado: true })
    const json = JSON.stringify(rowToClientShipment(lcl, m.get('E234')))
    expect(json).not.toContain('YEMEN')
    expect(json).not.toContain('A7887')
  })

  it('una LCL sin nada cargado igual tiene su operativa (para que "esperando salida" la vea)', () => {
    const v = rowToClientShipment({ ref: 'E999', mode: 'lcl', eta: '2026-08-20' }, null) as any
    expect(v.operativas).toHaveLength(1)
    expect(v.operativas[0]).toMatchObject({ SALIDA: '', ETA_FISC: '', LUGAR_SALIDA: '' })
    const fcl = rowToClientShipment({ ref: 'A999', mode: 'fcl', eta: '2026-08-20' }, null) as any
    expect(fcl.operativas).toEqual([])
  })

  it('una LCL sin camión: operativa sin fechas, ubicada en su depósito de desconsolidación', () => {
    const v = rowToClientShipment(lcl, null) as any
    expect(v.operativas).toHaveLength(1)
    expect(v.operativas[0]).toMatchObject({ SALIDA: '', ETA_FISC: '', DEPOSITO: 'PLANIR', LUGAR_SALIDA: 'PLANIR', FISCAL: 'CACEC' })
    expect(v.MODE).toBe('lcl')
  })

  it('camionesPorRef: ignora borradores y cargas pendientes de confirmar; ante dos camiones gana el más reciente', () => {
    const loads = [
      { source_ref: 'E234', truck_id: 't1', fiscal: 'CACEC', pending: null },
      { source_ref: 'E234', truck_id: 't2', fiscal: 'CACEC', pending: null },
      { source_ref: 'E235', truck_id: 't3', fiscal: '', pending: 'add' },
      { source_ref: 'E236', truck_id: 't4', fiscal: '', pending: null },
    ]
    const trucks = [
      { id: 't1', code: 'C450', departure_date: '2026-07-28', arrival_date: '2026-07-30', load_date: '2026-07-28', draft: false },
      { id: 't2', code: 'C462', departure_date: '2026-08-28', arrival_date: '', load_date: '2026-08-28', draft: false },
      { id: 't3', code: 'C463', departure_date: '2026-09-01', arrival_date: '', load_date: '2026-09-01', draft: false },
      { id: 't4', code: 'C999', departure_date: '', arrival_date: '', load_date: '', draft: true },
    ]
    const m = camionesPorRef(loads, trucks)
    expect(m.get('E234')?.code).toBe('C462')
    expect(m.has('E235')).toBe(false)
    expect(m.has('E236')).toBe(false)
  })
})
