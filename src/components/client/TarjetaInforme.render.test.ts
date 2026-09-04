/**
 * La tarjeta del informe (spec 04/09, D3): ícono PDF grande, título, fecha y
 * "Abrir". La regla que fija este archivo es la que más fácil se rompe con
 * buenas intenciones: **no hay miniatura del PDF**. Renderizar la primera
 * página necesita servidor y Vercel está en 12 de 12 funciones, así que la UI
 * no la dibuja ni la promete.
 */
import { describe, it, expect, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { OperativeReport } from '@/lib/quotationTypes'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/dataClient', () => ({ fetchReportFile: vi.fn() }))

import TarjetaInforme, { urlDeArchivo } from './TarjetaInforme'

const informe = (extra: Partial<OperativeReport> = {}): OperativeReport => ({
  id: 'inf-1', shipmentRef: 'A8121', title: 'Informe de trasiego', content: '',
  containerNumber: 'MSKU1111111', fileName: 'informe.pdf', fileType: 'application/pdf',
  createdAt: Date.parse('2026-09-03T12:00:00Z'), createdBy: 'equipo',
  ...extra,
} as OperativeReport)

const render = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(h(TarjetaInforme, { informe: informe(), ...props }))

describe('TarjetaInforme', () => {
  it('título, tipo de archivo, fecha y contenedor', () => {
    const html = render()
    expect(html).toContain('Informe de trasiego')
    expect(html).toContain('PDF ·')
    expect(html).toContain('03/09/2026')
    expect(html).toContain('MSKU1111111')
  })

  it('el botón para abrirlo, en los dos tamaños', () => {
    expect(render()).toContain('Abrir')
    expect(render({ compacta: true })).toContain('Abrir')
  })

  it('NO hay miniatura del PDF: eso necesita servidor', () => {
    expect(render()).not.toContain('<img')
    expect(render({ compacta: true })).not.toContain('<img')
    // Y tampoco se anuncia una vista previa que no existe.
    expect(render().toLowerCase()).not.toContain('vista previa')
  })

  it('un informe sin título igual se puede abrir', () => {
    const html = render({ informe: informe({ title: '' }) })
    expect(html).toContain('Informe operativo')
    expect(html).toContain('Abrir')
  })

  it('urlDeArchivo deja pasar las URLs http tal cual (no hay blob que crear)', () => {
    expect(urlDeArchivo('https://firmada/informe.pdf')).toBe('https://firmada/informe.pdf')
  })
})
