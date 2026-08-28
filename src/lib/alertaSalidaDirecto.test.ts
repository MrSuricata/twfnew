import { describe, it, expect } from 'vitest'
import { alertaSalidaDirecto } from './operationsTypes'

// Regla de Brian (28/08): el retiro de un contenedor DIRECTO se coordina
// ETA+1 o ETA+2. El mismo día del arribo "se pisa" con la descarga del buque;
// después de ETA+2 quedó fuera de la ventana de retiro de terminal.

const HOY = new Date(2026, 7, 28) // 28/08/2026

const op = (over: { operativa?: string; eta?: string; salida?: string }) => ({
  operativa: 'CONTENEDOR',
  eta: '2026-09-21',
  salida: '2026-09-22',
  ...over,
})

describe('alertaSalidaDirecto', () => {
  it('salida el mismo día del arribo → pisada por el buque', () => {
    expect(alertaSalidaDirecto(op({ salida: '2026-09-21' }), HOY)).toBe('pisada')
  })
  it('salida ANTES del arribo (dato mal cargado) → pisada también', () => {
    expect(alertaSalidaDirecto(op({ salida: '2026-09-20' }), HOY)).toBe('pisada')
  })
  it('ETA+1 y ETA+2 son la ventana correcta → sin alerta', () => {
    expect(alertaSalidaDirecto(op({ salida: '2026-09-22' }), HOY)).toBe(null)
    expect(alertaSalidaDirecto(op({ salida: '2026-09-23' }), HOY)).toBe(null)
  })
  it('después de ETA+2 → fuera de ventana de retiro', () => {
    expect(alertaSalidaDirecto(op({ salida: '2026-09-24' }), HOY)).toBe('fuera_ventana')
  })
  it('los TRASIEGOS no tienen esta restricción', () => {
    expect(alertaSalidaDirecto(op({ operativa: 'TRASIEGO', salida: '2026-09-21' }), HOY)).toBe(null)
  })
  it('operativa vacía = aún sin definir → no alerta (evita falsas alarmas)', () => {
    expect(alertaSalidaDirecto(op({ operativa: '', salida: '2026-09-21' }), HOY)).toBe(null)
  })
  it('DEVUELTO y salidas ya pasadas no alertan (no hay nada que coordinar)', () => {
    expect(alertaSalidaDirecto(op({ operativa: 'DEVUELTO', salida: '2026-09-21' }), HOY)).toBe(null)
    expect(alertaSalidaDirecto(op({ eta: '2026-08-20', salida: '2026-08-20' }), HOY)).toBe(null)
  })
  it('acepta fechas formato planilla (D/M/YYYY)', () => {
    expect(alertaSalidaDirecto(op({ eta: '21/9/2026', salida: '21/9/2026' }), HOY)).toBe('pisada')
  })
  it('sin ETA o sin salida no hay nada que comparar', () => {
    expect(alertaSalidaDirecto(op({ eta: '' }), HOY)).toBe(null)
    expect(alertaSalidaDirecto(op({ salida: '' }), HOY)).toBe(null)
  })
})
