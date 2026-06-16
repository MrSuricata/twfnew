import { describe, it, expect } from 'vitest'
import { getShipmentStatus } from './shipmentTypes'

const base = (ops: any[]) => ({ REF: 'A1', ETA: '2020-01-01', operativas: ops } as any)

describe('getShipmentStatus — En [lugar]', () => {
  it('arribado + LUGAR_SALIDA marcado + sin SALIDA → En [lugar]', () => {
    const s = getShipmentStatus(base([{ SALIDA: '', ETA_FISC: '', LUGAR_SALIDA: 'GODILCO' }]))
    expect(s.label).toBe('En GODILCO')
    expect(s.code).toBe('en_puerto')
  })
  it('directo desde terminal (TCP) sin SALIDA → En TCP', () => {
    const s = getShipmentStatus(base([{ SALIDA: '', LUGAR_SALIDA: 'TCP' }]))
    expect(s.label).toBe('En TCP')
  })
  it('con SALIDA alcanzada → NO usa LUGAR_SALIDA (sigue a frontera)', () => {
    const s = getShipmentStatus(base([{ SALIDA: '2020-02-01', LUGAR_SALIDA: 'GODILCO' }]))
    expect(s.label).toBe('En Frontera')
  })
  it('mezcla: uno en depósito, otro ya salió → parcial', () => {
    const s = getShipmentStatus(base([
      { SALIDA: '2020-02-01', LUGAR_SALIDA: 'GODILCO' },
      { SALIDA: '', LUGAR_SALIDA: 'GODILCO' },
    ]))
    expect(s.label).toBe('Parcialmente en Frontera')
  })
})
