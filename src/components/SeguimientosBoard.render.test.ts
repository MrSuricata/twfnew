/**
 * Lo que la pantalla tiene que garantizar después de separar FCL de LCL
 * (Brian 04/09/2026): abrir en un área NO puede mostrar cargas de la otra, y el
 * progreso del día que se ve arriba es el de esa área — el % de Nico venía
 * contando updates de LCL que no son suyos.
 *
 * La partición y el cálculo viven en lib/seguimientos (testeados aparte); esto
 * fija que el board pinta ESO y no otra cosa.
 *
 * Render por `renderToStaticMarkup`: el repo corre vitest en `node`, sin jsdom.
 */
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DbShipment } from '@/lib/operationsTypes'
import type { AreaSeguimiento } from '@/lib/seguimientos'

// useBrand cachea la marca a nivel de módulo: se mockea, como en PanelCard.test.
vi.mock('@/lib/brand', () => ({
  useBrand: () => ({ id: 'twf', name: 'TWF' }),
  getBrand: () => ({ id: 'twf', name: 'TWF' }),
}))
// El board habla con la API en efectos (que en SSR no corren) y desde los
// botones; se stubea para que el test no dependa de la red.
vi.mock('@/lib/dataClient', () => ({
  fetchAuditLog: () => Promise.resolve([]),
  fetchSeguimientosLog: () => Promise.resolve({ rows: [], truncado: false }),
  postSeguimientoLog: () => Promise.resolve({}),
}))

const { default: SeguimientosBoard } = await import('./SeguimientosBoard')

const iso = (offsetDias: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + offsetDias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const carga = (over: Partial<DbShipment>): DbShipment => ({
  id: `id-${over.ref}`,
  ref: 'A7000',
  cliente: 'TOMASELLI',
  mode: 'fcl',
  archived: false,
  buque: 'TIGER GAUCHO 0935S',
  etd: iso(-10),
  eta: iso(10),
  seguimiento: '',
  ...over,
} as DbShipment)

// FCL: una pendiente + una enviada hoy → "1 de 2". LCL: una sola pendiente.
const CARGAS = [
  carga({ ref: 'A7000', cliente: 'TOMASELLI' }),
  carga({ ref: 'A7001', cliente: 'PERETTI', seguimiento: iso(0) }),
  carga({ ref: 'LCL200', cliente: 'GACELA', mode: 'lcl', buque: 'MSC LORETO' }),
]

const pintar = (area: AreaSeguimiento) =>
  renderToStaticMarkup(createElement(SeguimientosBoard, {
    dbShipments: CARGAS,
    area,
    onAreaChange: () => {},
    onPatchShipment: () => {},
  }))

describe('SeguimientosBoard — dos colas', () => {
  it('en FCL no aparece ninguna carga LCL', () => {
    const html = pintar('fcl')
    expect(html).toContain('A7000')
    expect(html).toContain('TOMASELLI')
    expect(html).not.toContain('LCL200')
    expect(html).not.toContain('GACELA')
  })

  it('en LCL no aparece ninguna carga FCL', () => {
    const html = pintar('lcl')
    expect(html).toContain('LCL200')
    expect(html).not.toContain('A7000')
    expect(html).not.toContain('TOMASELLI')
  })

  it('el selector marca el área abierta y deja la otra a un click', () => {
    const lcl = pintar('lcl')
    expect(lcl).toContain('aria-label="Área de seguimientos"')
    expect(lcl).toMatch(/aria-selected="true" class="[^"]*">LCL</)
    expect(lcl).toMatch(/aria-selected="false" class="[^"]*">FCL</)

    const fcl = pintar('fcl')
    expect(fcl).toMatch(/aria-selected="true" class="[^"]*">FCL</)
    expect(fcl).toMatch(/aria-selected="false" class="[^"]*">LCL</)
  })
})

describe('SeguimientosBoard — progreso del día por área', () => {
  it('FCL cuenta su enviada de hoy y su pendiente: 1 de 2', () => {
    expect(pintar('fcl')).toContain('1 de 2')
  })

  it('LCL arranca en 0 de 1 — la enviada de FCL no le suma', () => {
    const html = pintar('lcl')
    expect(html).toContain('0 de 1')
    expect(html).not.toContain('1 de 2')
  })
})
