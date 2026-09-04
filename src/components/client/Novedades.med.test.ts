/**
 * Las piezas nuevas del aviso, bajo Mediterránea: los colores tienen que
 * salir del manual (tokens del `@theme`), no de la escala de TWF ni de un hex
 * pegado a mano.
 *
 * Archivo aparte porque la marca se resuelve una vez por módulo (`getBrand()`
 * cachea): se mockea `useBrand` → Med y vitest aísla los módulos por archivo.
 * Mismo formato que PanelCard.med.test.ts y CardHoy.med.test.ts.
 */
import { describe, it, expect, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { OperativeReport, OriginPhoto } from '@/lib/quotationTypes'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/dataClient', () => ({ fetchReportFile: vi.fn() }))
vi.mock('@/lib/brand', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/brand')>()
  return { ...mod, useBrand: () => mod.BRANDS.med }
})

import TiraMiniaturas from './TiraMiniaturas'
import TarjetaInforme from './TarjetaInforme'

const foto = (id: string): OriginPhoto => ({
  id, shipmentRef: 'A8121', photoType: 'uruguay', fileName: `${id}.jpg`, fileType: 'image/jpeg',
  thumbnailUrl: `https://firmada/${id}`, createdAt: 1, createdBy: 'equipo',
} as OriginPhoto)

describe('El aviso de fotos bajo Mediterránea', () => {
  it('la tira toma el borde y el pill del manual, no la escala de TWF', () => {
    const html = renderToStaticMarkup(h(TiraMiniaturas, {
      visibles: [foto('a'), foto('b'), foto('c'), foto('d')],
      mas: 2, siguiente: foto('e'), etiqueta: '6 fotos en Montevideo', onAbrir: () => {},
    }))
    expect(html).toContain('border-med-info-borde')
    expect(html).toContain('bg-med-violeta')     // el pill del "+N"
    expect(html).not.toContain('sky-200')
    expect(html).not.toContain('#')
  })

  it('el ícono del PDF va en violeta (spec D3), no en el rojo de TWF', () => {
    const html = renderToStaticMarkup(h(TarjetaInforme, {
      informe: {
        id: 'i1', shipmentRef: 'A8121', title: 'Informe', content: '',
        fileName: 'i.pdf', fileType: 'application/pdf', createdAt: 1, createdBy: 'equipo',
      } as OperativeReport,
    }))
    expect(html).toContain('text-med-violeta')
    expect(html).not.toContain('text-red-600')
  })
})
