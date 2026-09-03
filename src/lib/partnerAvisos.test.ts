/**
 * Los dos candados del "Deshacer" (Brian 03/09: "que el depósito pueda deshacer
 * una acción si se equivoca"): el aviso tiene que ser SUYO y seguir PENDIENTE.
 * La regla vive en una sola función pura porque la usan el portal (mostrar u
 * ocultar el botón) y la API (que es la que manda de verdad).
 */
import { describe, it, expect } from 'vitest'
import { puedeCancelarAviso, type AvisoCancelable, type PartnerAvisoEstado } from './partnerAvisos'

const PLANIR: AvisoCancelable = { partnerRole: 'depot', partnerFilter: 'PLANIR', estado: 'pendiente' }
const quienPlanir = { rol: 'depot', alcance: 'PLANIR' }

describe('puedeCancelarAviso', () => {
  it('propio y pendiente → sí', () => {
    expect(puedeCancelarAviso(PLANIR, quienPlanir)).toEqual({ puede: true })
  })

  it('el alcance compara sin importar mayúsculas ni espacios', () => {
    expect(puedeCancelarAviso({ ...PLANIR, partnerFilter: ' planir ' }, quienPlanir).puede).toBe(true)
    expect(puedeCancelarAviso(PLANIR, { rol: 'depot', alcance: ' Planir' }).puede).toBe(true)
  })

  it('propio pero ya CONFIRMADO → no, y el mensaje manda al equipo', () => {
    const r = puedeCancelarAviso({ ...PLANIR, estado: 'confirmado' }, quienPlanir)
    expect(r.puede).toBe(false)
    if (!r.puede) {
      expect(r.motivo).toBe('resuelto')
      // Confirmado = la acción YA se aplicó sobre la carga (p. ej. LIBRE =
      // DEVUELTO): deshacerla del lado del partner dejaría datos inconsistentes.
      expect(r.mensaje).toMatch(/equipo/i)
    }
  })

  it('propio pero ya RECHAZADO → no (no hay nada que deshacer)', () => {
    const r = puedeCancelarAviso({ ...PLANIR, estado: 'rechazado' }, quienPlanir)
    expect(r.puede).toBe(false)
    if (!r.puede) expect(r.motivo).toBe('resuelto')
  })

  it('ya cancelado → no se cancela dos veces', () => {
    const r = puedeCancelarAviso({ ...PLANIR, estado: 'cancelado' }, quienPlanir)
    expect(r.puede).toBe(false)
    if (!r.puede) expect(r.motivo).toBe('resuelto')
  })

  it('de OTRO depósito → no, aunque esté pendiente', () => {
    const r = puedeCancelarAviso({ ...PLANIR, partnerFilter: 'GODILCO' }, quienPlanir)
    expect(r.puede).toBe(false)
    if (!r.puede) expect(r.motivo).toBe('ajeno')
  })

  it('mismo alcance pero OTRO rol → no (el transporte no deshace lo del depósito)', () => {
    const r = puedeCancelarAviso(PLANIR, { rol: 'transport', alcance: 'PLANIR' })
    expect(r.puede).toBe(false)
    if (!r.puede) expect(r.motivo).toBe('ajeno')
  })

  it('sin alcance (usuario sin depósito/transporte asignado) → no', () => {
    expect(puedeCancelarAviso(PLANIR, { rol: 'depot', alcance: '' }).puede).toBe(false)
    expect(puedeCancelarAviso({ ...PLANIR, partnerFilter: '' }, { rol: 'depot', alcance: '' }).puede).toBe(false)
  })

  it('primero mira si es tuyo: de un aviso ajeno no dice en qué estado está', () => {
    const estados: PartnerAvisoEstado[] = ['pendiente', 'confirmado', 'rechazado', 'cancelado']
    for (const estado of estados) {
      const r = puedeCancelarAviso({ partnerRole: 'depot', partnerFilter: 'GODILCO', estado }, quienPlanir)
      expect(r.puede).toBe(false)
      if (!r.puede) {
        expect(r.motivo).toBe('ajeno')
        expect(r.mensaje).toBe('Ese aviso no es tuyo.')
      }
    }
  })
})
