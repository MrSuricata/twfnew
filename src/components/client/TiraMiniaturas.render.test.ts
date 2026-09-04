/**
 * La tira de miniaturas del aviso, renderizada (spec 04/09, D3).
 *
 * Render estático (`renderToStaticMarkup`), como PanelCard.test.ts: el repo
 * corre vitest en `node`, sin jsdom ni testing-library.
 *
 * Lo que no puede volver a pasar: que la miniatura firmada que MANDA el
 * server se descarte, que una foto sin miniatura deje un cuadro roto, o que
 * el "+N" se pierda cuando hay más de cuatro.
 */
import { describe, it, expect } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import TiraMiniaturas from './TiraMiniaturas'
import { fuenteMiniatura, galeriaDeNovedad, tiraDeMiniaturas } from '@/lib/cargaCliente'
import type { OriginPhoto } from '@/lib/quotationTypes'

const foto = (id: string, extra: Partial<OriginPhoto> = {}): OriginPhoto => ({
  id, shipmentRef: 'A8121', photoType: 'uruguay', fileName: `${id}.jpg`, fileType: 'image/jpeg',
  thumbnailUrl: `https://firmada/${id}?token=abc`, createdAt: Date.parse('2026-09-03T12:00:00Z'),
  createdBy: 'equipo',
  ...extra,
} as OriginPhoto)

const render = (fotos: OriginPhoto[], props: Record<string, unknown> = {}) => {
  // Como en la card: la fila dice cuáles son sus fotos, la tira cuántas entran.
  const tira = tiraDeMiniaturas(galeriaDeNovedad(
    fotos, { ref: 'A8121', lugarFoto: 'uruguay', fotoIds: fotos.map(f => f.id) },
  ))
  return renderToStaticMarkup(h(TiraMiniaturas, {
    visibles: tira.visibles,
    mas: tira.mas,
    siguiente: tira.siguiente,
    etiqueta: '3 fotos en depósito GODILCO',
    onAbrir: () => {},
    ...props,
  }))
}

describe('TiraMiniaturas — la foto se ve donde está el aviso', () => {
  it('dibuja la URL firmada que ya manda el server', () => {
    const html = render([foto('a'), foto('b')])
    expect(html).toContain('src="https://firmada/a?token=abc"')
    expect(html).toContain('src="https://firmada/b?token=abc"')
  })

  it('cada miniatura es un botón: se toca y abre el visor, no la lista', () => {
    const html = render([foto('a')])
    expect(html).toContain('<button')
    expect(html).toContain('aria-label="Ver la foto 1 de 3 fotos en depósito GODILCO"')
  })

  it('con más de cuatro, cuatro y el "+N"', () => {
    const html = render(Array.from({ length: 7 }, (_, i) => foto(`f${i}`)))
    expect((html.match(/<img/g) || []).length).toBe(4)
    expect(html).toContain('+3')
    expect(html).toContain('aria-label="Ver las otras 3 fotos de 3 fotos en depósito GODILCO"')
  })

  it('con cuatro o menos no aparece ningún "+N"', () => {
    const html = render([foto('a'), foto('b')])
    expect(html).not.toContain('+0')
    expect(html).not.toMatch(/\+\d/)
  })

  it('la foto vieja sin miniatura no deja un cuadro roto: no se dibuja', () => {
    const html = render([foto('a'), foto('sin', { thumbnailUrl: null, thumbnailData: '' })])
    expect((html.match(/<img/g) || []).length).toBe(1)
  })

  it('el "+N" no cuenta fotos sin miniatura: dos se dibujan, no hay "+5"', () => {
    const html = render([
      foto('a'), foto('b'),
      ...Array.from({ length: 5 }, (_, i) => foto(`vieja${i}`, { thumbnailUrl: null, thumbnailData: '' })),
    ])
    expect((html.match(/<img/g) || []).length).toBe(2)
    expect(html).not.toMatch(/\+\d/)
  })

  it('con las primeras cuatro sin miniatura la tira NO desaparece', () => {
    const html = render([
      ...Array.from({ length: 4 }, (_, i) => foto(`vieja${i}`, { thumbnailUrl: null, thumbnailData: '' })),
      foto('c'), foto('d'),
    ])
    expect(html).toContain('src="https://firmada/c?token=abc"')
    expect(html).toContain('src="https://firmada/d?token=abc"')
    expect((html.match(/<img/g) || []).length).toBe(2)
  })

  it('sin ninguna miniatura la tira no se dibuja (la fila queda como estaba)', () => {
    expect(render([foto('x', { thumbnailUrl: null, thumbnailData: '' })])).toBe('')
    expect(render([])).toBe('')
  })

  it('las fotos sin migrar a Storage todavía valen: cae al base64', () => {
    const html = render([foto('vieja', { thumbnailUrl: null, thumbnailData: 'data:image/jpeg;base64,AAA' })])
    expect(html).toContain('src="data:image/jpeg;base64,AAA"')
  })

  it('fuenteMiniatura: primero la URL firmada, después el base64, si no nada', () => {
    expect(fuenteMiniatura(foto('a'))).toBe('https://firmada/a?token=abc')
    expect(fuenteMiniatura(foto('a', { thumbnailUrl: null, thumbnailData: 'data:x' }))).toBe('data:x')
    expect(fuenteMiniatura(foto('a', { thumbnailUrl: null, thumbnailData: '' }))).toBe('')
    expect(fuenteMiniatura(null)).toBe('')
  })

  it('los colores salen del tono de la card, no de hex sueltos', () => {
    const html = render(Array.from({ length: 6 }, (_, i) => foto(`f${i}`)))
    expect(html).toContain('border-sky-200')   // el tono "info" de la piel común
    expect(html).toContain('bg-sky-600')       // el pill del "+N"
    expect(html).not.toContain('#')
  })
})
