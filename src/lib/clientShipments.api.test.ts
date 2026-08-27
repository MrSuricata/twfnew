import { describe, it, expect } from 'vitest'
import {
  esCargaDeClienteActiva, rowToClientShipment, CLIENT_SHIPMENT_COLS,
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
