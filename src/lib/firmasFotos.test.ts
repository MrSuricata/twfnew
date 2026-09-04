/**
 * Las firmas de las fotos duran 8 h. Un portal abierto toda la jornada las
 * pasa y, a partir de ahí, muestra íconos rotos sin ningún error visible: es
 * el bug que estos tests no dejan volver.
 */
import { describe, it, expect } from 'vitest'
import {
  tocaRefrescarFirmas, firmaVencida, FIRMA_TTL_MS, REFRESCO_FIRMAS_MS, REFRESCO_MIN_MS,
} from './firmasFotos'

const AHORA = Date.parse('2026-09-04T15:00:00Z')
const haceMs = (ms: number): number => AHORA - ms
const MIN = 60_000
const HORA = 60 * MIN

describe('tocaRefrescarFirmas', () => {
  it('los umbrales son los del server: firma 8 h, se pide a las 4', () => {
    expect(FIRMA_TTL_MS).toBe(8 * HORA)          // THUMB_TTL de api/_lib/photoStorage.ts
    expect(REFRESCO_FIRMAS_MS).toBe(4 * HORA)    // la mitad: si falla, queda margen
    expect(REFRESCO_MIN_MS).toBe(5 * MIN)
  })

  it('si nunca se pidieron, se piden', () => {
    expect(tocaRefrescarFirmas(null, AHORA, 'intervalo')).toBe(true)
    expect(tocaRefrescarFirmas(0, AHORA, 'volvio')).toBe(true)
    expect(tocaRefrescarFirmas(undefined, AHORA, 'rota')).toBe(true)
  })

  it('por reloj: recién a las 4 h, no antes', () => {
    expect(tocaRefrescarFirmas(haceMs(3 * HORA), AHORA, 'intervalo')).toBe(false)
    expect(tocaRefrescarFirmas(haceMs(4 * HORA), AHORA, 'intervalo')).toBe(true)
    expect(tocaRefrescarFirmas(haceMs(9 * HORA), AHORA, 'intervalo')).toBe(true)
  })

  it('al volver a la pestaña alcanza con que no sea de recién', () => {
    // Alternar entre dos pestañas no puede disparar un pedido por cada foco.
    expect(tocaRefrescarFirmas(haceMs(30_000), AHORA, 'volvio')).toBe(false)
    expect(tocaRefrescarFirmas(haceMs(6 * MIN), AHORA, 'volvio')).toBe(true)
    // Y el caso que importa: la pestaña quedó abierta toda la noche.
    expect(tocaRefrescarFirmas(haceMs(10 * HORA), AHORA, 'volvio')).toBe(true)
  })

  it('una miniatura rota pide de nuevo, pero 20 rotas no son 20 pedidos', () => {
    expect(tocaRefrescarFirmas(haceMs(9 * HORA), AHORA, 'rota')).toBe(true)
    expect(tocaRefrescarFirmas(haceMs(10_000), AHORA, 'rota')).toBe(false)
  })

  it('si el reloj de la máquina se movió, se pide igual (el lado seguro)', () => {
    expect(tocaRefrescarFirmas(AHORA + HORA, AHORA, 'intervalo')).toBe(true)
    expect(tocaRefrescarFirmas(Number.NaN, AHORA, 'intervalo')).toBe(true)
  })
})

describe('firmaVencida', () => {
  it('recién a las 8 h', () => {
    expect(firmaVencida(haceMs(7 * HORA), AHORA)).toBe(false)
    expect(firmaVencida(haceMs(8 * HORA), AHORA)).toBe(true)
  })

  it('sin pedido previo no se afirma que venció (todavía no hay nada firmado)', () => {
    expect(firmaVencida(null, AHORA)).toBe(false)
    expect(firmaVencida(0, AHORA)).toBe(false)
  })
})
