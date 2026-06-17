/**
 * trucksRefreshGuard.test.ts — Tests de la guarda pura `canApplyTrucksRefresh`.
 *
 * Aísla la decisión "¿puede este refresh de fondo pisar el estado local?" de
 * React/DOM/timing. Cubre la race que borraba camiones recién creados.
 */

import { describe, it, expect } from 'vitest'
import { canApplyTrucksRefresh, TRUCKS_WRITE_RECENCY_MS } from './trucksRefreshGuard'

describe('canApplyTrucksRefresh', () => {
  it('NO aplica si hay una escritura en vuelo (pendingWrites > 0)', () => {
    // Aunque el último write sea viejo, una escritura en vuelo manda.
    expect(canApplyTrucksRefresh(1, 100_000, 0)).toBe(false)
  })

  it('NO aplica si una escritura ocurrió justo antes del fetch (dentro de la ventana)', () => {
    // write a t=10_000, fetch arrancó a t=11_000 → 1s < 5s → stale posible.
    expect(canApplyTrucksRefresh(0, 11_000, 10_000)).toBe(false)
  })

  it('aplica si la última escritura es vieja (fuera de la ventana)', () => {
    // write a t=10_000, fetch arrancó a t=16_000 → 6s >= 5s → seguro.
    expect(canApplyTrucksRefresh(0, 16_000, 10_000)).toBe(true)
  })

  it('aplica si nunca hubo escritura local (lastWriteTs = 0)', () => {
    expect(canApplyTrucksRefresh(0, 50_000, 0)).toBe(true)
  })

  it('NO aplica si la escritura es MÁS nueva que el arranque del fetch (diferencia negativa)', () => {
    // write a t=20_000, fetch había arrancado a t=19_000 → -1s < 5s.
    expect(canApplyTrucksRefresh(0, 19_000, 20_000)).toBe(false)
  })

  it('el borde exacto (diferencia == recencyMs) aplica', () => {
    expect(canApplyTrucksRefresh(0, 10_000 + TRUCKS_WRITE_RECENCY_MS, 10_000)).toBe(true)
  })

  it('respeta un recencyMs custom', () => {
    // 2s de diferencia: con ventana de 5s NO aplica, con ventana de 1s SÍ.
    expect(canApplyTrucksRefresh(0, 12_000, 10_000, 5_000)).toBe(false)
    expect(canApplyTrucksRefresh(0, 12_000, 10_000, 1_000)).toBe(true)
  })
})
