/**
 * Las firmas de las fotos duran 8 h. Un portal abierto toda la jornada las
 * pasa y, a partir de ahí, muestra íconos rotos sin ningún error visible: es
 * el bug que estos tests no dejan volver.
 */
import { describe, it, expect } from 'vitest'
import {
  tocaRefrescarFirmas, firmaVencida, FIRMA_TTL_MS, REFRESCO_FIRMAS_MS, REFRESCO_MIN_MS,
  TICK_FIRMAS_MS, crearRefrescoFirmas, claveDeFuentes, rotasVigentes, conRota, SIN_ROTAS,
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

// ── El reloj de fondo: el pulso no puede ser el umbral ────────────────────

describe('el reloj de fondo llega al umbral, y con margen', () => {
  it('el pulso es cortito: quien decide es el umbral, no el setInterval', () => {
    expect(TICK_FIRMAS_MS).toBeLessThanOrEqual(15 * MIN)
    expect(TICK_FIRMAS_MS).toBeGreaterThanOrEqual(5 * MIN)
    expect(TICK_FIRMAS_MS).toBeLessThan(REFRESCO_FIRMAS_MS)
  })

  it('el portal abre a las 9 y el refresco cae a las 4 h, no a las 8', () => {
    // El caso real: el `setInterval` arranca al montar, pero la ventana se
    // cuenta desde que el fetch RESOLVIÓ (montaje + latencia). Con el pulso
    // igual al umbral, el primer tick llegaba con `edad = 4 h − latencia` y se
    // salteaba siempre: el refresco caía recién a las 8 h, el TTL exacto.
    const montaje = AHORA
    const ultimo = montaje + 1500      // 1,5 s de latencia del primer pedido
    let t = montaje
    let refresco = 0
    for (let i = 0; i < 500 && !refresco; i++) {
      t += TICK_FIRMAS_MS
      if (tocaRefrescarFirmas(ultimo, t, 'intervalo')) refresco = t
    }
    expect(refresco).toBeGreaterThan(0)
    const edad = refresco - ultimo
    expect(edad).toBeGreaterThanOrEqual(REFRESCO_FIRMAS_MS)   // ni antes de tiempo
    expect(edad).toBeLessThan(REFRESCO_FIRMAS_MS + TICK_FIRMAS_MS)
    // Lo que importa: cuando se pide, todavía quedan horas de firma válida. Si
    // el pedido falla hay tiempo de sobra para reintentar.
    expect(FIRMA_TTL_MS - edad).toBeGreaterThanOrEqual(3 * HORA)
  })
})

// ── El pedido: fallar no puede quemar la ventana ─────────────────────────

describe('crearRefrescoFirmas', () => {
  it('el primero sale, y mientras está en vuelo no sale otro', () => {
    const r = crearRefrescoFirmas()
    expect(r.pedir('rota', AHORA)).toBe(true)
    expect(r.enVuelo()).toBe(true)
    // Veinte miniaturas rotas = veinte llamadas: una sola tiene que salir.
    for (let i = 0; i < 20; i++) expect(r.pedir('rota', AHORA)).toBe(false)
  })

  it('un pedido que FALLA no quema la ventana: el próximo tick reintenta', () => {
    const r = crearRefrescoFirmas(haceMs(9 * HORA))
    expect(r.pedir('intervalo', AHORA)).toBe(true)
    r.termino(false, AHORA)                       // se cayó la red
    expect(r.ultimoOk()).toBe(haceMs(9 * HORA))   // la ventana quedó como estaba
    expect(r.pedir('intervalo', AHORA + TICK_FIRMAS_MS)).toBe(true)
  })

  it('el que trae firmas nuevas sí corre la ventana', () => {
    const r = crearRefrescoFirmas(haceMs(9 * HORA))
    expect(r.pedir('intervalo', AHORA)).toBe(true)
    r.termino(true, AHORA)
    expect(r.ultimoOk()).toBe(AHORA)
    expect(r.enVuelo()).toBe(false)
    expect(r.pedir('intervalo', AHORA + HORA)).toBe(false)          // recién pedidas
    expect(r.pedir('intervalo', AHORA + 5 * HORA)).toBe(true)       // pasadas las 4 h
  })

  it('sin ningún pedido previo, el primero sale siempre', () => {
    expect(crearRefrescoFirmas().ultimoOk()).toBe(0)
    expect(crearRefrescoFirmas().pedir('intervalo', AHORA)).toBe(true)
    expect(crearRefrescoFirmas(Number.NaN).pedir('volvio', AHORA)).toBe(true)
  })
})

// ── Una miniatura rota no puede quedar rota para siempre ─────────────────

describe('las rotas se olvidan cuando llegan firmas nuevas', () => {
  const fuentes = (token: string) => claveDeFuentes([`a|https://f/a?${token}`, `b|https://f/b?${token}`])

  it('con las MISMAS fuentes, la que falló sigue rota', () => {
    const vieja = fuentes('viejo')
    const estado = conRota(SIN_ROTAS, vieja, 'a')
    expect(rotasVigentes(estado, vieja)).toEqual(['a'])
    expect(conRota(estado, vieja, 'a')).toBe(estado)   // la misma dos veces no re-renderiza
    expect(rotasVigentes(conRota(estado, vieja, 'b'), vieja)).toEqual(['a', 'b'])
  })

  it('con firmas nuevas ninguna sigue rota (el bug: quedaban rotas hasta recargar)', () => {
    const vieja = fuentes('vencido')
    const estado = conRota(conRota(SIN_ROTAS, vieja, 'a'), vieja, 'b')
    expect(rotasVigentes(estado, vieja)).toEqual(['a', 'b'])
    // Llega el refresco: mismas fotos, URLs firmadas de nuevo.
    expect(rotasVigentes(estado, fuentes('fresco'))).toEqual([])
    // Y si una vuelve a fallar, arranca de cero para las fuentes nuevas.
    expect(conRota(estado, fuentes('fresco'), 'b')).toEqual({ clave: fuentes('fresco'), ids: ['b'] })
  })

  it('sin nada roto, nada vigente', () => {
    expect(rotasVigentes(SIN_ROTAS, fuentes('x'))).toEqual([])
    expect(rotasVigentes(null, fuentes('x'))).toEqual([])
    expect(claveDeFuentes([])).toBe(claveDeFuentes([]))
    expect(claveDeFuentes([])).not.toBe(fuentes('x'))
  })
})
