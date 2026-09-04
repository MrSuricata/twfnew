/**
 * El punto de sacar los `med ? … : …` de los encabezados de HOY: bajo
 * Mediterránea el color lo resuelve el TONO, no un ternario copiado en cada
 * card. Si alguien vuelve a escribir un color a mano, acá salta.
 *
 * Archivo aparte porque la marca se resuelve una vez por módulo (`getBrand()`
 * cachea): se mockea `useBrand` → Med y vitest aísla los módulos por archivo.
 */
import { describe, it, expect, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import CardHoy, { ChipUrgente, chipsHeader } from './CardHoy'
import type { CardsPlegadas } from '@/lib/cardsPlegadas'

vi.mock('@/lib/brand', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/brand')>()
  return { ...mod, useBrand: () => mod.BRANDS.med }
})

const plegadas: CardsPlegadas = { estaAbierta: () => false, toggle: () => {} }

describe('Las cards de HOY bajo Mediterránea', () => {
  it('tono alerta → el rojo del manual, sin una clase de la escala de TWF', () => {
    const html = renderToStaticMarkup(h(CardHoy, {
      id: 'libre-critico', plegadas, icono: h('i'), contador: 3, children: h('p'),
    }))
    expect(html).toContain('med-error')
    expect(html).not.toContain('bg-red-500')
    expect(html).not.toContain('text-destructive')
  })

  it('tono info → violeta/celeste del manual, nada de sky', () => {
    const html = renderToStaticMarkup(h(CardHoy, {
      id: 'retiros-terminal', plegadas, icono: h('i'), contador: 4, children: h('p'),
    }))
    expect(html).toContain('med-celeste')
    expect(html).not.toContain('sky-500')
  })

  it('los chips urgentes también siguen a la marca (eran un ternario por card)', () => {
    const html = renderToStaticMarkup(h('div', null,
      chipsHeader(h(ChipUrgente, { tono: 'aviso', key: 'a', children: '2 avisar cliente' })),
    ))
    expect(html).toContain('2 avisar cliente')
    expect(html).toContain('bg-med-aviso')
    expect(html).not.toContain('amber')
  })
})
