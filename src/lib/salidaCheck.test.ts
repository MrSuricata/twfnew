import { describe, it, expect } from 'vitest'
import { isSalidaBeforeArrival, margenSalida, avisoSalida, notaSalidaDirectaOk, isSalidaAjustada, etaVigente } from './salidaCheck'

describe('isSalidaBeforeArrival', () => {
  it('salida anterior a la llegada → true', () => {
    expect(isSalidaBeforeArrival('2026-06-20', '2026-06-21')).toBe(true)
  })

  it('salida posterior a la llegada → false', () => {
    expect(isSalidaBeforeArrival('2026-06-22', '2026-06-21')).toBe(false)
  })

  it('mismo día (llega y sale el mismo día) → false (no es "antes")', () => {
    expect(isSalidaBeforeArrival('2026-06-21', '2026-06-21')).toBe(false)
  })

  it('sin salida → false (no hay con qué comparar)', () => {
    expect(isSalidaBeforeArrival('', '2026-06-21')).toBe(false)
    expect(isSalidaBeforeArrival(undefined, '2026-06-21')).toBe(false)
  })

  it('sin ETA → false', () => {
    expect(isSalidaBeforeArrival('2026-06-20', '')).toBe(false)
    expect(isSalidaBeforeArrival('2026-06-20', null)).toBe(false)
  })

  it('placeholders no-fecha (CONFIRMAR / #N/A) → false', () => {
    expect(isSalidaBeforeArrival('CONFIRMAR', '2026-06-21')).toBe(false)
    expect(isSalidaBeforeArrival('2026-06-20', 'CONFIRMAR')).toBe(false)
  })

  it('caso real A6820-like: ETA se corrió a 21, salida quedó en 20 → true', () => {
    expect(isSalidaBeforeArrival('2026-06-20', '2026-06-21')).toBe(true)
  })
})

// ── Margen mínimo de 2 días (Brian 10/08/2026) ─────────────────────────
// "lo normal es que sea dos días después de que llegue el buque por lo menos
//  y sino me debería saltar algún aviso visible"
describe('margen entre la llegada del buque y la salida', () => {
  it('cuenta los días entre llegada y salida', () => {
    expect(margenSalida('2026-08-13', '2026-08-10')).toBe(3)
    expect(margenSalida('2026-08-10', '2026-08-10')).toBe(0)
    expect(margenSalida('2026-08-08', '2026-08-10')).toBe(-2)
  })

  it('sin alguna de las dos fechas no inventa nada', () => {
    expect(margenSalida('', '2026-08-10')).toBeNull()
    expect(margenSalida('2026-08-10', '')).toBeNull()
    expect(avisoSalida('', '2026-08-10')).toBe('')
  })

  it('2 días o más: sin aviso', () => {
    expect(avisoSalida('2026-08-12', '2026-08-10')).toBe('')
    expect(avisoSalida('2026-08-20', '2026-08-10')).toBe('')
    expect(isSalidaAjustada('2026-08-12', '2026-08-10')).toBe(false)
  })

  it('mismo día y 1 día: avisa, pero no es "antes de llegar"', () => {
    expect(avisoSalida('2026-08-10', '2026-08-10')).toContain('MISMO día')
    expect(avisoSalida('2026-08-11', '2026-08-10')).toContain('1 día')
    expect(isSalidaAjustada('2026-08-10', '2026-08-10')).toBe(true)
    expect(isSalidaAjustada('2026-08-11', '2026-08-10')).toBe(true)
    expect(isSalidaBeforeArrival('2026-08-11', '2026-08-10')).toBe(false)
  })

  it('antes de llegar: sigue siendo el aviso grave', () => {
    expect(avisoSalida('2026-08-08', '2026-08-10')).toContain('ANTES')
    expect(isSalidaBeforeArrival('2026-08-08', '2026-08-10')).toBe(true)
    // no lo cuenta como "ajustada": es otra cosa, más grave
    expect(isSalidaAjustada('2026-08-08', '2026-08-10')).toBe(false)
  })

  it('caso real A7867: 09/08 llega, 11/08 sale → justo en el mínimo, sin aviso', () => {
    expect(avisoSalida('2026-08-11', '2026-08-09')).toBe('')
  })
})

describe('etaVigente — la ETA de la carga manda sobre la copia del contenedor', () => {
  it('con ETA de carga parseable, gana aunque ETA_OP tenga otra fecha', () => {
    // Buque atrasado: la carga se actualizó, la copia por contenedor no.
    expect(etaVigente('2026-08-15', '2026-08-07')).toBe('2026-08-15')
  })

  it('sin ETA de carga (o no parseable) cae a la del contenedor', () => {
    expect(etaVigente('', '2026-08-07')).toBe('2026-08-07')
    expect(etaVigente('9-ago-', '2026-08-07')).toBe('2026-08-07')
    expect(etaVigente(undefined, '2026-08-07')).toBe('2026-08-07')
  })

  it('sin ninguna de las dos devuelve vacío (no se inventa)', () => {
    expect(etaVigente('', '')).toBe('')
    expect(etaVigente(null, null)).toBe('')
  })
})

describe('avisoSalida según operativa (Brian 28/08: el directo ETA+1/+2 es normal)', () => {
  it('CONTENEDOR a ETA+1 y ETA+2: ventana normal, SIN aviso', () => {
    expect(avisoSalida('2026-08-28', '2026-08-27', 'CONTENEDOR')).toBe('')
    expect(avisoSalida('2026-08-29', '2026-08-27', 'CONTENEDOR')).toBe('')
  })

  it('CONTENEDOR el mismo día del arribo: se pisa con la descarga', () => {
    expect(avisoSalida('2026-08-27', '2026-08-27', 'CONTENEDOR')).toContain('pisa')
  })

  it('CONTENEDOR después de ETA+2: fuera de la ventana de retiro', () => {
    expect(avisoSalida('2026-08-31', '2026-08-27', 'CONTENEDOR')).toContain('ETA+2')
  })

  it('antes de la llegada sigue siendo imposible, directo o no', () => {
    expect(avisoSalida('2026-08-26', '2026-08-27', 'CONTENEDOR')).toContain('ANTES')
  })

  it('TRASIEGO (y sin operativa) mantienen la regla de los 2 días', () => {
    expect(avisoSalida('2026-08-28', '2026-08-27', 'TRASIEGO')).toContain('lo normal son 2')
    expect(avisoSalida('2026-08-28', '2026-08-27')).toContain('lo normal son 2')
    expect(avisoSalida('2026-08-27', '2026-08-27', 'TRASIEGO')).toContain('sin margen')
  })
})

describe('notaSalidaDirectaOk — la aclaración verde del directo', () => {
  it('directo en ventana: nota positiva con los días', () => {
    expect(notaSalidaDirectaOk('2026-08-28', '2026-08-27', 'CONTENEDOR')).toContain('ventana normal')
    expect(notaSalidaDirectaOk('2026-08-29', '2026-08-27', 'CONTENEDOR')).toContain('2 días')
  })

  it('fuera de ventana, mismo día, trasiego o sin fechas: nada', () => {
    expect(notaSalidaDirectaOk('2026-08-27', '2026-08-27', 'CONTENEDOR')).toBe('')
    expect(notaSalidaDirectaOk('2026-08-31', '2026-08-27', 'CONTENEDOR')).toBe('')
    expect(notaSalidaDirectaOk('2026-08-28', '2026-08-27', 'TRASIEGO')).toBe('')
    expect(notaSalidaDirectaOk('', '2026-08-27', 'CONTENEDOR')).toBe('')
  })
})
