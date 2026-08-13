import { describe, it, expect } from 'vitest'
import { sugerirEtaFiscal, llegadaFiscalAtipica } from './transitoFiscal'

// Referencias de agosto 2026: 17=lunes 18=martes 19=miércoles 20=jueves
// 21=viernes 22=sábado 23=domingo 24=lunes 25=martes

describe('sugerirEtaFiscal — regla de Brian (13/08/2026)', () => {
  it('sale lunes → martes frontera → miércoles fiscal', () => {
    expect(sugerirEtaFiscal('2026-08-17')).toBe('2026-08-19')
  })

  it('sale martes → llega jueves', () => {
    expect(sugerirEtaFiscal('2026-08-18')).toBe('2026-08-20')
  })

  it('sale miércoles → llega viernes', () => {
    expect(sugerirEtaFiscal('2026-08-19')).toBe('2026-08-21')
  })

  it('sale jueves → lo normal es LUNES (el sábado es solo a pedido)', () => {
    expect(sugerirEtaFiscal('2026-08-20')).toBe('2026-08-24')
  })

  it('sale viernes → llega lunes', () => {
    expect(sugerirEtaFiscal('2026-08-21')).toBe('2026-08-24')
  })

  it('sale sábado → lunes (el +2 cae lunes, no hay salto)', () => {
    expect(sugerirEtaFiscal('2026-08-22')).toBe('2026-08-24')
  })

  it('fecha inválida o vacía → null (nunca inventar)', () => {
    expect(sugerirEtaFiscal('')).toBeNull()
    expect(sugerirEtaFiscal('COORDINADO')).toBeNull()
    expect(sugerirEtaFiscal('21/08/2026')).toBeNull()
  })
})

describe('llegadaFiscalAtipica — llegadas para marcar', () => {
  it('sábado → atípica: solo pasa si el cliente lo pidió', () => {
    const a = llegadaFiscalAtipica('2026-08-22')
    expect(a?.tipo).toBe('sabado')
    expect(a?.motivo).toMatch(/cliente/i)
  })

  it('martes → atípica: el cliente lo pidió o el lunes es feriado', () => {
    const a = llegadaFiscalAtipica('2026-08-25')
    expect(a?.tipo).toBe('martes')
    expect(a?.motivo).toMatch(/feriado|cliente/i)
  })

  it('miércoles / jueves / viernes / lunes → normales', () => {
    for (const d of ['2026-08-19', '2026-08-20', '2026-08-21', '2026-08-24']) {
      expect(llegadaFiscalAtipica(d)).toBeNull()
    }
  })

  it('domingo → también se marca (nadie recibe en fiscal un domingo)', () => {
    expect(llegadaFiscalAtipica('2026-08-23')?.tipo).toBe('domingo')
  })

  it('sin fecha → null', () => {
    expect(llegadaFiscalAtipica('')).toBeNull()
    expect(llegadaFiscalAtipica('CONFIRMAR')).toBeNull()
  })
})
