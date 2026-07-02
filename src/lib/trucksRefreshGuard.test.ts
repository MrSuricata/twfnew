/**
 * trucksRefreshGuard.test.ts — Tests de la guarda pura `canApplyTrucksRefresh`.
 *
 * Aísla la decisión "¿puede este refresh de fondo pisar el estado local?" de
 * React/DOM/timing. Cubre la race que borraba camiones recién creados.
 */

import { describe, it, expect } from 'vitest'
import { canApplyTrucksRefresh, createTrucksWriteWindow, TRUCKS_WRITE_RECENCY_MS, TRUCKS_WRITE_TRAIL_MS } from './trucksRefreshGuard'

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

// Ventana compartida de escritura (la que cierra la carrera del guardado
// multi-paso con el timbre Realtime: DELETEs + POST trucks + POST loads
// mantienen UNA ventana abierta de punta a punta + cola de 2s).
describe('createTrucksWriteWindow', () => {
  it('cerrada de entrada (sin escrituras)', () => {
    const w = createTrucksWriteWindow()
    expect(w.isOpen(1_000)).toBe(false)
    expect(w.inFlight()).toBe(0)
    expect(w.remainingMs(1_000)).toBe(0)
  })

  it('abre en begin() y sigue abierta mientras la escritura está en vuelo', () => {
    const w = createTrucksWriteWindow()
    const end = w.begin(1_000)
    expect(w.isOpen(1_000)).toBe(true)
    expect(w.isOpen(500_000)).toBe(true) // POST colgado 8 minutos: sigue abierta
    expect(w.inFlight()).toBe(1)
    end(2_000)
    expect(w.inFlight()).toBe(0)
  })

  it('al cerrar la última escritura queda la cola de trailMs', () => {
    const w = createTrucksWriteWindow(2_000)
    const end = w.begin(1_000)
    end(5_000)
    expect(w.isOpen(5_500)).toBe(true)   // dentro de la cola
    expect(w.isOpen(6_999)).toBe(true)   // borde interno
    expect(w.isOpen(7_000)).toBe(false)  // cola vencida (5_000 + 2_000)
  })

  it('guardado multi-paso: la ventana dura hasta que termina el ÚLTIMO paso', () => {
    // Simula el handleSave publicado: DELETE + POST trucks + POST loads solapados.
    const w = createTrucksWriteWindow(2_000)
    const endDelete = w.begin(1_000)  // DELETE lento (el agujero original)
    const endTrucks = w.begin(1_001)
    const endLoads = w.begin(1_002)
    endTrucks(1_400)
    endLoads(1_600)
    // El DELETE sigue en vuelo → abierta aunque los POST hayan vuelto
    expect(w.isOpen(6_000)).toBe(true)
    expect(w.inFlight()).toBe(1)
    endDelete(9_000) // DELETE frío de serverless tardó 8s
    expect(w.isOpen(10_500)).toBe(true)  // cola desde el ÚLTIMO cierre
    expect(w.isOpen(11_100)).toBe(false)
  })

  it('el cierre es idempotente (un finally doble no descuenta dos veces)', () => {
    const w = createTrucksWriteWindow(2_000)
    const endA = w.begin(1_000)
    const endB = w.begin(1_000)
    endA(1_100)
    endA(1_200) // repetido: no debe cerrar la escritura de B
    expect(w.inFlight()).toBe(1)
    expect(w.isOpen(50_000)).toBe(true)
    endB(50_000)
    expect(w.isOpen(52_100)).toBe(false)
  })

  it('remainingMs: con escrituras en vuelo devuelve trailMs como piso; después, lo que quede de cola', () => {
    const w = createTrucksWriteWindow(2_000)
    const end = w.begin(1_000)
    expect(w.remainingMs(1_500)).toBe(2_000)
    end(2_000)
    expect(w.remainingMs(3_000)).toBe(1_000)
    expect(w.remainingMs(4_500)).toBe(0)
  })

  it('reabre limpio después de cerrada', () => {
    const w = createTrucksWriteWindow(2_000)
    const end1 = w.begin(1_000)
    end1(1_100)
    expect(w.isOpen(4_000)).toBe(false)
    const end2 = w.begin(10_000)
    expect(w.isOpen(10_000)).toBe(true)
    end2(10_100)
    expect(w.isOpen(12_200)).toBe(false)
  })

  it('trail default exportado = 2s', () => {
    expect(TRUCKS_WRITE_TRAIL_MS).toBe(2_000)
  })
})
