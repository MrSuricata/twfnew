import { describe, it, expect } from 'vitest'
import {
  sugerirPorHistorico, fiscalSugerido, claveFiscal, ultimosValores, fiscalesRecientes,
} from './sugerenciaHistorica'

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

  it('devuelve la variante que el equipo escribe más seguido', () => {
    const s = sugerirPorHistorico('X', reg([
      ['X', 'RAFAELA'], ['X', 'RAFAELA'], ['X', 'ZP RAFAELA'],
    ]))
    expect(s?.valor).toBe('RAFAELA')
    expect(s?.dominancia).toBe(100)   // las tres son el mismo destino
  })

  it('si la variante con prefijo es la habitual, es la que se ofrece', () => {
    const s = sugerirPorHistorico('X', reg([
      ['X', 'ZP RAFAELA'], ['X', 'ZP RAFAELA'], ['X', 'RAFAELA'],
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

describe('claveFiscal — variantes del mismo destino', () => {
  it('el prefijo de zona no cambia el destino (confirmado por Brian)', () => {
    expect(claveFiscal('ZP RAFAELA')).toBe('RAFAELA')
    expect(claveFiscal('ZF RAFAELA')).toBe('RAFAELA')
    expect(claveFiscal('RAFAELA')).toBe('RAFAELA')
  })

  it('ignora los acentos', () => {
    expect(claveFiscal('CÓRDOBA')).toBe(claveFiscal('CORDOBA'))
  })

  it('lo que sigue al guión es info extra, no otro destino', () => {
    expect(claveFiscal('RAFAELA - DEV ROSARIO')).toBe('RAFAELA')
    expect(claveFiscal('ZP RAFAELA - DEV TPR')).toBe('RAFAELA')
    expect(claveFiscal('CACEC - DEV CACEC')).toBe('CACEC')
    expect(claveFiscal('MARE - COLASO - DEV BSAS')).toBe('MARE')
    expect(claveFiscal('CORDOBA DEV CACEC')).toBe('CORDOBA')
    expect(claveFiscal('ZOFRACOR, DEV BSAS')).toBe('ZOFRACOR')
  })

  it('no vacía un nombre que ES una zona', () => {
    expect(claveFiscal('ZONA FRANCA')).toBe('ZONA FRANCA')
    expect(claveFiscal('ZF')).toBe('ZF')
  })

  it('agrupa las dos formas de escribir la zona franca 88101', () => {
    expect(claveFiscal('ZF 88101')).toBe(claveFiscal('ZONA FRANCA 88101'))
  })

  it('destinos distintos siguen distintos', () => {
    expect(claveFiscal('RAFAELA')).not.toBe(claveFiscal('MARE'))
    expect(claveFiscal('CACEC')).not.toBe(claveFiscal('DFC'))
  })
})

describe('ultimosValores', () => {
  const r = (pares: [string, string, string][]) =>
    pares.map(([cliente, valor, fecha]) => ({ cliente, valor, fecha }))

  it('devuelve los destinos del más reciente al más viejo', () => {
    expect(ultimosValores('X', r([
      ['X', 'CACEC', '2026-01-10'],
      ['X', 'CÓRDOBA', '2026-06-10'],
      ['X', 'MARE', '2026-03-10'],
    ]))).toEqual(['CÓRDOBA', 'MARE', 'CACEC'])
  })

  it('no repite el mismo destino aunque cambie cómo se escribió', () => {
    expect(ultimosValores('X', r([
      ['X', 'RAFAELA', '2026-06-10'],
      ['X', 'ZP RAFAELA', '2026-05-10'],
      ['X', 'MARE', '2026-04-10'],
    ]))).toEqual(['RAFAELA', 'MARE'])
  })

  it('corta en la cantidad pedida', () => {
    const datos = r([
      ['X', 'A', '2026-06-01'], ['X', 'B', '2026-05-01'],
      ['X', 'C', '2026-04-01'], ['X', 'D', '2026-03-01'], ['X', 'E', '2026-02-01'],
    ])
    expect(ultimosValores('X', datos, 4)).toHaveLength(4)
  })

  it('ignora los placeholders', () => {
    expect(ultimosValores('X', r([
      ['X', 'CONFIRMAR', '2026-06-10'], ['X', 'MARE', '2026-05-10'],
    ]))).toEqual(['MARE'])
  })

  it('sin historial devuelve lista vacía', () => {
    expect(ultimosValores('NADIE', r([['X', 'MARE', '2026-06-10']]))).toEqual([])
  })

  it('sin fechas respeta el orden en que vienen, del último al primero', () => {
    expect(ultimosValores('X', [
      { cliente: 'X', valor: 'VIEJO' }, { cliente: 'X', valor: 'NUEVO' },
    ])).toEqual(['NUEVO', 'VIEJO'])
  })
})

describe('fiscalesRecientes', () => {
  it('lee eta como fecha de la operación', () => {
    expect(fiscalesRecientes('TOMASELLI', [
      { cliente: 'TOMASELLI', fiscal: 'CACEC', eta: '2026-01-05' },
      { cliente: 'TOMASELLI', fiscal: 'CÓRDOBA', eta: '2026-07-05' },
    ])).toEqual(['CÓRDOBA', 'CACEC'])
  })
})
