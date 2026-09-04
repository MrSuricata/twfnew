/**
 * Bajo la marca Mediterránea, PanelCard/PanelPlegable tienen que salir con
 * los tokens del manual y no con la escala de TWF. Va en archivo aparte
 * porque la marca se resuelve una vez por módulo (`getBrand()` cachea): acá
 * se mockea `useBrand` → Med y vitest aísla los módulos por archivo.
 */
import { describe, it, expect, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PanelCard, { PanelPlegable } from './PanelCard'

vi.mock('@/lib/brand', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/brand')>()
  return { ...mod, useBrand: () => mod.BRANDS.med }
})

describe('PanelCard bajo Mediterránea', () => {
  it('PanelPlegable tono aviso: cabecera de riesgo del manual, nada de amber', () => {
    const html = renderToStaticMarkup(h(PanelPlegable, { tono: 'aviso', icono: h('i'), titulo: 'X', contador: 1, children: h('p') }))
    expect(html).toContain('bg-med-aviso-tinte')
    expect(html).toContain('bg-med-aviso text-white')
    expect(html).not.toContain('amber')
  })

  it('PanelCard tono neutro: cabecera med-fondo y pill neutro del manual', () => {
    const html = renderToStaticMarkup(h(PanelCard, { tono: 'neutro', icono: h('i'), titulo: 'X', contador: 0 }))
    expect(html).toContain('bg-med-fondo')
    expect(html).toContain('bg-med-pastel text-med-texto')
    expect(html).not.toContain('slate')
  })
})
