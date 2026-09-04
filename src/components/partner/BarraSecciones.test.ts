/**
 * La barra de accesos directos del portal.
 *
 * Render estático (`renderToStaticMarkup`): el repo corre vitest en `node`,
 * sin jsdom. Alcanza para fijar lo que se ve en el primer pintado —qué chips
 * hay, en qué orden y cuál arranca resaltado— y que en el celular la fila se
 * desliza en vez de comprimirse. La lógica del resaltado por scroll es pura y
 * está en `seccionesDeposito.test.ts` (`seccionActiva`).
 */
import { describe, it, expect } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import BarraSecciones from './BarraSecciones'
import type { ChipSeccion } from '@/lib/seccionesDeposito'

const CHIPS: ChipSeccion[] = [
  { id: 'vacios', chip: 'Devoluciones' },
  { id: 'retiros', chip: 'Retiros' },
  { id: 'hoy', chip: 'Hoy' },
  { id: 'avisos', chip: 'Mis avisos' },
]

const render = (secciones: ChipSeccion[]) =>
  renderToStaticMarkup(h(BarraSecciones, { secciones }))

describe('BarraSecciones', () => {
  it('pinta un chip por sección, en el orden que le llega', () => {
    const html = render(CHIPS)
    const orden = CHIPS.map(c => html.indexOf(`>${c.chip}<`))
    expect(orden.every(i => i >= 0)).toBe(true)
    expect([...orden].sort((a, b) => a - b)).toEqual(orden)
  })

  it('no inventa chips: solo pinta lo que le pasan', () => {
    const html = render([{ id: 'hoy', chip: 'Hoy' }, { id: 'retiros', chip: 'Retiros' }])
    expect(html).not.toContain('LCL')
    expect(html).not.toContain('Mis avisos')
  })

  it('arranca resaltando la primera sección', () => {
    const html = render(CHIPS)
    const primerCurrent = html.indexOf('aria-current="true"')
    expect(primerCurrent).toBeGreaterThan(-1)
    // El resaltado está en el chip que abre la lista, no en otro.
    expect(html.indexOf('>Devoluciones<')).toBeGreaterThan(primerCurrent)
    expect(html.match(/aria-current="true"/g)).toHaveLength(1)
  })

  it('sin secciones no dibuja nada', () => {
    expect(render([])).toBe('')
  })

  it('son botones, no enlaces: el salto lo hace la barra descontando el encabezado', () => {
    const html = render(CHIPS)
    expect(html).toContain('type="button"')
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('href="#')
  })

  it('en el celular la fila se desliza: los chips no se comprimen', () => {
    const html = render(CHIPS)
    expect(html).toContain('overflow-x-auto')
    expect(html).toContain('w-max')
    expect(html).toContain('shrink-0')
  })

  it('es una landmark de navegación con nombre', () => {
    const html = render(CHIPS)
    expect(html).toContain('<nav')
    expect(html).toContain('aria-label="Secciones del portal"')
  })
})
