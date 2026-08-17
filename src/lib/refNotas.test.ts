import { describe, it, expect } from 'vitest'
import { ultimaNotaPorRef, fmtCuando, esDeHoy, type NotaRef } from './refNotas'

const HOY = new Date(2026, 7, 17, 14, 0) // lunes 17/08/2026 14:00

describe('ultimaNotaPorRef', () => {
  it('con filas más-nueva-primero, se queda con la primera por ref', () => {
    const rows: NotaRef[] = [
      { ref: 'A1', texto: 'nueva', created_at: '2026-08-17T13:00:00Z' },
      { ref: 'a1', texto: 'vieja', created_at: '2026-08-16T13:00:00Z' },
      { ref: 'A2', texto: 'otra', created_at: '2026-08-15T13:00:00Z' },
    ]
    const m = ultimaNotaPorRef(rows)
    expect(m.get('A1')?.texto).toBe('nueva')
    expect(m.get('A2')?.texto).toBe('otra')
  })
})

describe('fmtCuando / esDeHoy — el estado del reclamo se ve de un vistazo', () => {
  it('hoy, ayer y fecha vieja', () => {
    const hoy1130 = new Date(2026, 7, 17, 11, 30).toISOString()
    const ayer = new Date(2026, 7, 16, 15, 40).toISOString()
    const viejo = new Date(2026, 7, 3, 9, 5).toISOString()
    expect(fmtCuando(hoy1130, HOY)).toBe('hoy 11:30')
    expect(esDeHoy(hoy1130, HOY)).toBe(true)
    expect(fmtCuando(ayer, HOY)).toBe('ayer 15:40')
    expect(esDeHoy(ayer, HOY)).toBe(false)
    expect(fmtCuando(viejo, HOY)).toBe('03/08 09:05')
  })

  it('sin timestamp o roto → vacío, sin explotar', () => {
    expect(fmtCuando('', HOY)).toBe('')
    expect(fmtCuando('basura', HOY)).toBe('')
    expect(esDeHoy(undefined, HOY)).toBe(false)
  })
})
