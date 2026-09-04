/**
 * El invariante que sostiene el paso 3: en la agenda del CLIENTE se apagan los
 * datos nuestros (LIBRE, transporte); para el DEPÓSITO y el admin siguen ahí.
 *
 * Por qué merece test propio: el free time es lo que le dice al depósito hasta
 * cuándo puede devolver un vacío sin pagar demurrage — es la base del ciclo de
 * devolución. Antes, ese invariante dependía enteramente de que nadie pasara
 * `clientView` a un dashboard de partner, y ningún gate lo hubiera detectado.
 *
 * Y la caja "Libre Hasta" se apaga por VISTA, no por dato vacío: para el
 * depósito, un LIBRE sin cargar es información ("todavía no nos pasaron la
 * fecha") y tiene que verla como "—", no como una caja ausente.
 *
 * Render por `renderToStaticMarkup`: el repo corre vitest en `node`, sin jsdom.
 */
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CalendarEvent } from '@/lib/agendaTypes'

// useBrand cachea la marca a nivel de módulo: se mockea, como en PanelCard.test.
vi.mock('@/lib/brand', () => ({
  useBrand: () => ({ id: 'twf', name: 'TWF' }),
  getBrand: () => ({ id: 'twf', name: 'TWF' }),
}))
// El card usa useDraggable aunque no se arrastre; en SSR alcanza con un stub.
vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
}))

const { default: AgendaEventCard } = await import('./AgendaEventCard')

const evento = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'A8121-TCLU5332433-libre',
  date: '2026-09-17',
  type: 'libre',
  ref: 'A8121',
  operativa: 'TRASIEGO',
  cntr: 'TCLU5332433',
  tipo: '40HC',
  cliente: 'CHIAPERO Y ASOC. S.R.L.',
  fiscal: 'Z.P. RAFAELA',
  deposito: 'GODILCO',
  libre: '2026-09-17',
  descripcion: 'MOTOPARTES',
  kg: 25312,
  pkgs: 343,
  m3: 59,
  transporte: 'RIGATOSSO',
  alerts: [],
  shipment: { REF: 'A8121' } as unknown as CalendarEvent['shipment'],
  op: { CNTR_OP: 'TCLU5332433' } as unknown as CalendarEvent['op'],
  statusColor: '',
  statusLabel: '',
  ...over,
})

const pintar = (e: CalendarEvent, vistaCliente: boolean) =>
  renderToStaticMarkup(createElement(AgendaEventCard, { event: e, compact: false, vistaCliente }))

describe('AgendaEventCard — qué ve cada uno', () => {
  it('el DEPÓSITO ve el free time y el transporte', () => {
    const html = pintar(evento(), false)
    expect(html).toContain('Libre Hasta')
    expect(html).toContain('17 Sep')
    expect(html).toContain('RIGATOSSO')
  })

  it('el DEPÓSITO ve la caja aunque falte la fecha: esa ausencia es lo que nos tiene que reclamar', () => {
    const html = pintar(evento({ libre: '' }), false)
    expect(html).toContain('Libre Hasta')
    expect(html).toContain('—')
  })

  it('el CLIENTE no ve el free time ni el transporte', () => {
    const html = pintar(evento(), true)
    expect(html).not.toContain('Libre Hasta')
    expect(html).not.toContain('RIGATOSSO')
  })

  it('el CLIENTE sí sigue viendo lo suyo: contenedor, depósito y destino', () => {
    const html = pintar(evento(), true)
    expect(html).toContain('TCLU5332433')
    expect(html).toContain('GODILCO')
    expect(html).toContain('Z.P. RAFAELA')
  })

  it('con el LIBRE ya vaciado por la agenda, el cliente tampoco ve la caja', () => {
    // AgendaCalendar vacía `libre` cuando clientView; que además el card lo
    // apague por vista es el segundo candado, no el único.
    const html = pintar(evento({ libre: '' }), true)
    expect(html).not.toContain('Libre Hasta')
  })
})
