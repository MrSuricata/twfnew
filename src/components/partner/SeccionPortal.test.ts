/**
 * La sección de los portales: con y sin plegado.
 *
 * Lo que se fija acá es la regla de Brian aplicada al portal del depósito:
 * "Mis avisos" se puede plegar, pero plegada tiene que seguir mostrando el
 * contador. Si alguien "simplifica" el header, la card pasa a mentir: se ve
 * vacía con tres avisos esperando confirmación adentro.
 *
 * Render estático (`renderToStaticMarkup`), como PanelCard.test.ts: el repo
 * corre vitest en `node`, sin jsdom ni testing-library.
 */
import { describe, it, expect, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// useBrand cachea la marca a nivel de módulo: se mockea, como en PanelCard.test.
vi.mock('@/lib/brand', () => ({
  useBrand: () => ({ id: 'twf', name: 'TWF' }),
  getBrand: () => ({ id: 'twf', name: 'TWF' }),
}))

const { default: SeccionPortal } = await import('./SeccionPortal')

const FILA = 'FILA-ADENTRO'

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(h(SeccionPortal, {
    icono: h('i'),
    titulo: 'Mis avisos',
    cantidad: 3,
    children: h('p', null, FILA),
    ...props,
  } as never))

describe('SeccionPortal — sin plegado', () => {
  it('es una card fija: sin botón de header y con las filas a la vista', () => {
    const html = render({})
    expect(html).toContain(FILA)
    expect(html).toContain('Mis avisos')
    expect(html).not.toContain('aria-expanded')
  })

  it('el tono se apaga a neutro cuando no hay nada, pero el contador va igual', () => {
    const html = render({ cantidad: 0, tono: 'alerta' })
    expect(html).not.toContain('bg-red-500')
    expect(html).toContain('>0<')
  })
})

describe('SeccionPortal — plegable, como pidió Brian para "Mis avisos"', () => {
  it('plegada esconde las filas pero deja el título y el CONTADOR', () => {
    const html = render({ plegado: { abierta: false, onToggle: () => {} } })
    expect(html).not.toContain(FILA)
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('Mis avisos')
    expect(html).toContain('>3<')
  })

  it('abierta muestra las filas y el header sigue igual', () => {
    const html = render({ plegado: { abierta: true, onToggle: () => {} } })
    expect(html).toContain(FILA)
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('>3<')
  })

  it('el estado lo manda el padre (modo controlado): es quien lo recuerda', () => {
    const onToggle = vi.fn()
    const el = SeccionPortal({
      icono: h('i'), titulo: 'Mis avisos', cantidad: 1,
      plegado: { abierta: false, onToggle },
      children: h('p', null, FILA),
    })
    const props = (el as { props: Record<string, unknown> }).props
    expect(props.abierta).toBe(false)
    expect(props.onToggle).toBe(onToggle)
  })

  it('el subtítulo se sigue viendo plegada (dice de qué se trata la card)', () => {
    const html = render({ subtitulo: 'últimos 30 días', plegado: { abierta: false, onToggle: () => {} } })
    expect(html).toContain('últimos 30 días')
  })
})
