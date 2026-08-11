import { describe, it, expect } from 'vitest'
import { sugerirPorHistorico, fiscalSugerido } from './sugerenciaHistorica'

const reg = (pares: [string, string][]) =>
  pares.map(([cliente, valor]) => ({ cliente, valor }))

describe('sugerirPorHistorico', () => {
  it('sugiere el valor que el cliente usa siempre', () => {
    const s = sugerirPorHistorico('VMG S.A.', reg([
      ['VMG S.A.', 'RAFAELA'], ['VMG S.A.', 'RAFAELA'], ['VMG S.A.', 'RAFAELA'],
    ]))
    expect(s).toEqual({ valor: 'RAFAELA', muestras: 3, dominancia: 100 })
  })

  it('no sugiere nada cuando el cliente está repartido', () => {
    // 3 de 6 no alcanza el 80%: sugerir acá sería inventar.
    expect(sugerirPorHistorico('EYITO', reg([
      ['EYITO', 'CACEC'], ['EYITO', 'CACEC'], ['EYITO', 'CACEC'],
      ['EYITO', 'ZONA FRANCA'], ['EYITO', 'ZONA FRANCA'], ['EYITO', 'ZF 88101'],
    ]))).toBeNull()
  })

  it('no sugiere con menos de 3 casos: un dato no es un patrón', () => {
    expect(sugerirPorHistorico('NUEVO', reg([
      ['NUEVO', 'CACEC'], ['NUEVO', 'CACEC'],
    ]))).toBeNull()
  })

  it('sugiere con dominancia justa en el umbral (80%)', () => {
    const s = sugerirPorHistorico('X', reg([
      ['X', 'MARE'], ['X', 'MARE'], ['X', 'MARE'], ['X', 'MARE'], ['X', 'OTRO'],
    ]))
    expect(s?.valor).toBe('MARE')
    expect(s?.dominancia).toBe(80)
  })

  it('ignora los placeholders: no son un destino', () => {
    expect(sugerirPorHistorico('X', reg([
      ['X', 'CONFIRMAR'], ['X', '#N/A'], ['X', '-'], ['X', ''], ['X', 'N/A'], ['X', 'TBD'],
    ]))).toBeNull()
  })

  it('los placeholders no cuentan para el total', () => {
    // 3 reales todas iguales + ruido → sugiere igual, con muestras = 3.
    const s = sugerirPorHistorico('X', reg([
      ['X', 'MARE'], ['X', 'MARE'], ['X', 'MARE'], ['X', 'CONFIRMAR'], ['X', ''],
    ]))
    expect(s).toEqual({ valor: 'MARE', muestras: 3, dominancia: 100 })
  })

  it('solo mira las cargas de ese cliente', () => {
    const s = sugerirPorHistorico('VMG', reg([
      ['VMG', 'RAFAELA'], ['VMG', 'RAFAELA'], ['VMG', 'RAFAELA'],
      ['OTRO CLIENTE', 'MARE'], ['OTRO CLIENTE', 'MARE'], ['OTRO CLIENTE', 'MARE'],
    ]))
    expect(s?.valor).toBe('RAFAELA')
  })

  it('cliente sin historial → null', () => {
    expect(sugerirPorHistorico('DESCONOCIDO', reg([['VMG', 'RAFAELA']]))).toBeNull()
  })

  it('cliente vacío → null (no arriesga con cualquier cosa)', () => {
    expect(sugerirPorHistorico('', reg([['', 'MARE'], ['', 'MARE'], ['', 'MARE']]))).toBeNull()
  })

  it('compara el cliente sin distinguir mayúsculas ni espacios', () => {
    const s = sugerirPorHistorico(' vmg s.a. ', reg([
      ['VMG S.A.', 'RAFAELA'], ['VMG S.A.', 'RAFAELA'], ['VMG S.A.', 'RAFAELA'],
    ]))
    expect(s?.valor).toBe('RAFAELA')
  })

  it('devuelve el valor tal cual está escrito, sin normalizar', () => {
    // 'ZP RAFAELA' y 'RAFAELA' son destinos distintos: no se fusionan.
    const s = sugerirPorHistorico('X', reg([
      ['X', 'ZP RAFAELA'], ['X', 'ZP RAFAELA'], ['X', 'ZP RAFAELA'],
    ]))
    expect(s?.valor).toBe('ZP RAFAELA')
  })

  it('los umbrales se pueden ajustar', () => {
    const datos = reg([['X', 'A'], ['X', 'A'], ['X', 'B']])
    expect(sugerirPorHistorico('X', datos)).toBeNull()
    expect(sugerirPorHistorico('X', datos, { minMuestras: 3, minDominancia: 60 })?.valor).toBe('A')
  })
})

describe('fiscalSugerido', () => {
  const ops = [
    { cliente: 'CENA HNOS SRL', fiscal: 'MARE' },
    { cliente: 'CENA HNOS SRL', fiscal: 'MARE' },
    { cliente: 'CENA HNOS SRL', fiscal: 'MARE' },
    { cliente: 'TOMASELLI', fiscal: 'CACEC' },
    { cliente: 'TOMASELLI', fiscal: 'CÓRDOBA' },
    { cliente: 'TOMASELLI', fiscal: 'ZF 88101' },
  ]

  it('sugiere el fiscal habitual del cliente', () => {
    expect(fiscalSugerido('CENA HNOS SRL', ops)?.valor).toBe('MARE')
  })

  it('no sugiere para un cliente que varía', () => {
    expect(fiscalSugerido('TOMASELLI', ops)).toBeNull()
  })

  it('tolera operaciones sin fiscal cargado', () => {
    expect(fiscalSugerido('X', [{ cliente: 'X' }, { cliente: 'X', fiscal: undefined }])).toBeNull()
  })
})
