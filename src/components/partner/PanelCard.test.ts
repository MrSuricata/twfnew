/**
 * La piel común de los portales, fijada en tests (render estático, sin DOM):
 * el rediseño 04/09 apila todo sobre PanelCard, así que lo que se rompe acá
 * se rompe en cinco pantallas.
 */
import { describe, it, expect } from 'vitest'
import { createElement as h, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PanelCard, { PanelPlegable, PillConteo, Chip, Dato, RefsCarga, clasesTono, type TonoPanel } from './PanelCard'

const TONOS: TonoPanel[] = ['info', 'aviso', 'alerta', 'ok', 'neutro']
const FILA = 'FILA-ADENTRO'

const plegable = (props: Record<string, unknown> = {}, children: ReactNode = h('p', null, FILA)) =>
  renderToStaticMarkup(h(PanelPlegable, { icono: h('i'), titulo: 'Retiros del buque', contador: 5, children, ...props }))

describe('PanelPlegable — plegar no esconde lo urgente (spec 04/09, D7)', () => {
  it('modo libre: arranca abierta por defecto y muestra los hijos', () => {
    const html = plegable()
    expect(html).toContain(FILA)
    expect(html).toContain('aria-expanded="true"')
  })

  it('modo libre: abiertaPorDefecto=false arranca plegada, pero el contador sigue a la vista', () => {
    const html = plegable({ abiertaPorDefecto: false })
    expect(html).not.toContain(FILA)
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('>5<')
  })

  it('modo controlado: `abierta` manda sobre abiertaPorDefecto', () => {
    expect(plegable({ abierta: false, abiertaPorDefecto: true })).not.toContain(FILA)
    expect(plegable({ abierta: true, abiertaPorDefecto: false })).toContain(FILA)
  })

  it('los extras del header se ven plegada y van entre el título y el contador', () => {
    const html = plegable({ abierta: false, extras: h(Chip, { clase: 'x', children: '3 para reagendar' }) })
    expect(html).toContain('3 para reagendar')
    expect(html.indexOf('Retiros del buque')).toBeLessThan(html.indexOf('3 para reagendar'))
    expect(html.indexOf('3 para reagendar')).toBeLessThan(html.indexOf('>5<'))
  })

  it('sin contador no hay pill; sin extras no hay contenedor vacío', () => {
    const html = plegable({ contador: undefined })
    expect(html).not.toContain('rounded-full')
    expect(html).not.toContain('justify-end')
  })

  it('el header es UN botón (los extras viven adentro: contenido no interactivo)', () => {
    const html = plegable({ extras: h('span', null, 'chip') })
    expect(html.match(/<button/g)?.length).toBe(1)
  })
})

describe('PanelCard — contador, extras y estado vacío', () => {
  const card = (props: Record<string, unknown> = {}) =>
    renderToStaticMarkup(h(PanelCard, { icono: h('i'), titulo: 'Hoy cargan', ...props }, h('p', null, FILA)))

  it('contador 0 + vacio → muestra el texto vacío en vez de las filas', () => {
    const html = card({ contador: 0, vacio: 'Nada para hoy' })
    expect(html).toContain('Nada para hoy')
    expect(html).toContain('>0<')
    expect(html).not.toContain(FILA)
  })

  it('extras entre el título y el contador, igual que en el plegable', () => {
    const html = card({ contador: 2, extras: h(Chip, { children: '1 vencido' }) })
    expect(html.indexOf('Hoy cargan')).toBeLessThan(html.indexOf('1 vencido'))
    expect(html.indexOf('1 vencido')).toBeLessThan(html.indexOf('>2<'))
  })
})

describe('piezas exportadas (para que los pasos 1-4 no las copien)', () => {
  it('PillConteo pinta el número con el tono; `clase` lo pisa', () => {
    expect(renderToStaticMarkup(h(PillConteo, { tono: 'alerta', children: 7 }))).toContain('bg-red-600')
    expect(renderToStaticMarkup(h(PillConteo, { clase: 'bg-x', children: 7 }))).toContain('bg-x')
  })
  it('Chip y Dato siguen exportados y renderizan su contenido', () => {
    expect(renderToStaticMarkup(h(Chip, { title: 'depósito', children: 'GODILCO' }))).toContain('GODILCO')
    const dato = renderToStaticMarkup(h(Dato, { label: 'Llega', fuerte: true, children: '03/09' }))
    expect(dato).toContain('Llega')
    expect(dato).toContain('03/09')
    expect(dato).toContain('font-bold')
  })
})

describe('RefsCarga — las dos refs del cliente (spec 04/09, D2)', () => {
  const refs = (r: { principal: string; secundaria: string; propia: boolean }) =>
    renderToStaticMarkup(h(RefsCarga, { refs: r }))

  it('con ref del cliente: la de él grande y la nuestra al lado, en chico', () => {
    const html = refs({ principal: '1410', secundaria: '8121', propia: true })
    expect(html).toContain('>1410<')
    expect(html).toContain('title="Nuestra referencia">8121<')
    expect(html.indexOf('1410')).toBeLessThan(html.indexOf('8121'))
    expect(html).not.toContain('TWF')
  })

  it('sin ref del cliente: solo nuestro número, sin un segundo elemento vacío', () => {
    const html = refs({ principal: '8216', secundaria: '', propia: false })
    expect(html).toContain('>8216<')
    expect(html).not.toContain('Nuestra referencia')
  })
})

describe('clasesTono — TWF conserva su escala; Mediterránea habla con sus tokens', () => {
  it('bajo TWF ningún tono usa tokens med-*', () => {
    for (const t of TONOS) expect(Object.values(clasesTono(t, false)).join(' ')).not.toMatch(/\bmed-/)
  })

  it('bajo Med todos los tonos usan SOLO tokens del manual (ni hex ni escala Tailwind)', () => {
    for (const t of TONOS) {
      for (const clase of Object.values(clasesTono(t, true)).join(' ').split(/\s+/)) {
        expect(clase, `${t}: ${clase}`).toMatch(/^(bg|text|border)-(med-[a-z-]+(\/\d+)?|white)$/)
      }
    }
  })

  it('el naranja solo señala riesgo (DISENO-MED): info, ok y neutro no llevan med-aviso', () => {
    for (const t of ['info', 'ok', 'neutro'] as TonoPanel[]) {
      expect(Object.values(clasesTono(t, true)).join(' ')).not.toContain('med-aviso')
    }
    expect(clasesTono('aviso', true).barra).toBe('bg-med-aviso')
  })

  it('cada tono trae las seis clases, en las dos marcas', () => {
    for (const t of TONOS) for (const med of [false, true]) {
      const c = clasesTono(t, med)
      for (const k of ['barra', 'header', 'borde', 'icono', 'pill', 'titulo'] as const) expect(c[k]).toBeTruthy()
    }
  })
})
