import { describe, it, expect } from 'vitest'
import { buildFichaPdfData, fmtMoneyUY } from './fichaFacturacionPdf'
import type { BillingLineItem } from './billingTypes'

// Ficha de facturación — helper puro de armado de datos (totales + formato es-UY).

const g = (concepto: string, monto: number): BillingLineItem => ({ concepto, monto })

describe('fmtMoneyUY', () => {
  it('formatea es-UY: punto de miles y coma decimal, 2 decimales', () => {
    expect(fmtMoneyUY(1234.5)).toBe('1.234,50')
    expect(fmtMoneyUY(80)).toBe('80,00')
    expect(fmtMoneyUY(0)).toBe('0,00')
  })

  it('negativos conservan el signo', () => {
    expect(fmtMoneyUY(-1234.56)).toBe('-1.234,56')
  })
})

describe('buildFichaPdfData', () => {
  it('suma totales por columna y calcula resultado = venta − gastos (positivo)', () => {
    const d = buildFichaPdfData(
      [g('Flete marítimo', 2000), g('Gastos locales', 280.5)],
      [g('Venta flete', 2600), g('Recargo docs', 100)],
    )
    expect(d.totalGastos).toBeCloseTo(2280.5)
    expect(d.totalVentas).toBeCloseTo(2700)
    expect(d.resultado).toBeCloseTo(419.5)
    expect(d.resultadoFmt).toBe('419,50')
    expect(d.gastosRows).toEqual([
      ['Flete marítimo', '2.000,00'],
      ['Gastos locales', '280,50'],
    ])
  })

  it('resultado negativo cuando los gastos superan la venta', () => {
    const d = buildFichaPdfData([g('Flete', 3000)], [g('Venta', 2500)])
    expect(d.resultado).toBeCloseTo(-500)
    expect(d.resultadoFmt).toBe('-500,00')
  })

  it('ficha vacía → totales 0 y resultado 0,00', () => {
    const d = buildFichaPdfData([], [])
    expect(d.totalGastos).toBe(0)
    expect(d.totalVentas).toBe(0)
    expect(d.resultado).toBe(0)
    expect(d.gastosRows).toEqual([])
    expect(d.totalGastosFmt).toBe('0,00')
  })

  it('descarta renglones totalmente vacíos pero conserva concepto con monto 0', () => {
    const d = buildFichaPdfData(
      [g('', 0), g('  ', 0), g('Handling', 0), g('Flete', 100)],
      [g('', 0)],
    )
    expect(d.gastos).toHaveLength(2)
    expect(d.gastosRows).toEqual([
      ['Handling', '0,00'],
      ['Flete', '100,00'],
    ])
    expect(d.ventas).toHaveLength(0)
  })

  it('montos no numéricos (NaN/undefined) se tratan como 0 y no rompen totales', () => {
    const d = buildFichaPdfData(
      [g('Raro', Number.NaN), { concepto: 'Sin monto' } as unknown as BillingLineItem, g('OK', 50)],
      [],
    )
    expect(d.totalGastos).toBe(50)
    expect(d.gastosRows).toEqual([
      ['Raro', '0,00'],
      ['Sin monto', '0,00'],
      ['OK', '50,00'],
    ])
  })
})
