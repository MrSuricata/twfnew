/**
 * La card "Novedades de tus cargas", renderizada (spec 04/09, D3).
 *
 * Brian: "es rarísimo el proceso de cómo se muestran las fotos: apretás y te
 * lleva a toda la lista de cargas". Lo que estos tests no dejan volver:
 *  · que la miniatura firmada que ya manda el server se descarte y la fila
 *    quede en texto;
 *  · que el informe se anuncie sin la tarjeta del documento;
 *  · que la fila prometa una miniatura del PDF (no existe: necesita servidor).
 *
 * Render estático (react-dom/server), sin jsdom: se mockea `sonner` y
 * `@/lib/dataClient` porque la tarjeta del informe y el visor los importan.
 */
import { describe, it, expect, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ParsedShipment, OperativasRecord } from '@/lib/shipmentTypes'
import type { OperativeReport, OriginPhoto } from '@/lib/quotationTypes'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/dataClient', () => ({
  fetchReportFile: vi.fn(), fetchOriginPhotoFile: vi.fn(), deleteOriginPhoto: vi.fn(),
}))

import HoyCliente from './HoyCliente'

const HOY = '2026-09-04'
const dia = (n: number): string => new Date(Date.UTC(2026, 8, 4 + n)).toISOString().slice(0, 10)
const ts = (n: number): number => Date.parse(`${dia(n)}T12:00:00Z`)

/** Una carga ya cerrada: no dispara ninguna otra card de HOY, así lo que se
 *  mide es la de novedades y nada más. */
const op = (o: Partial<OperativasRecord> = {}): OperativasRecord => ({
  REF: 'A8121', TLX: 'SI', DEPOSITO: 'GODILCO', ETA_OP: '', SALIDA: dia(-20), ETA_FISC: dia(-18),
  LIBRE: '', OPERATIVA: 'TRASIEGO', CNTR_OP: 'MSKU1111111', PKGS: 400, KG: 8000, M3: 40,
  DESCRIPCION: 'BICICLETAS', FISCAL: 'CACEC', DESCARGA: '', DEV: '', CLIENTE_OP: '',
  TIPO: '40HC', WOOD: '', TRANSPORTE: 'TRANSCAL', HORARIO: '', LUGAR_SALIDA: '',
  ...o,
} as unknown as OperativasRecord)

const carga = (c: Record<string, unknown> = {}): ParsedShipment => ({
  REF: 'A8121', CLIENT_REF: '1410', CLIENTE: '', MODE: 'fcl', PAIS: 'UY', POL: 'SHANGHAI',
  POD: 'MONTEVIDEO', ETD: dia(-60), ETA: dia(-30), CNTR: 'MSKU1111111', N: 1,
  BUQUE: 'MAERSK SAN LAZARO', LINEA: 'MAERSK', TERMINAL: 'TCP', LIBRE_HASTA: '',
  containers: [], calculatedN: 1, calculatedLibreHasta: '', operativas: [op()],
  ...c,
} as unknown as ParsedShipment)

const foto = (id: string, extra: Partial<OriginPhoto> = {}): OriginPhoto => ({
  id, shipmentRef: 'A8121', photoType: 'uruguay', fileName: `${id}.jpg`, fileType: 'image/jpeg',
  thumbnailUrl: `https://firmada/${id}`, createdAt: ts(-1), createdBy: 'equipo',
  ...extra,
} as OriginPhoto)

const informe = (extra: Partial<OperativeReport> = {}): OperativeReport => ({
  id: 'inf-1', shipmentRef: 'A8121', title: 'Informe de trasiego', content: '',
  containerNumber: 'MSKU1111111', fileName: 'informe.pdf', fileType: 'application/pdf',
  createdAt: ts(0), createdBy: 'equipo',
  ...extra,
} as OperativeReport)

const render = (fotos: OriginPhoto[], informes: OperativeReport[] = []) =>
  renderToStaticMarkup(h(HoyCliente, {
    shipments: [carga()], alerts: [], hoyISO: HOY, nombreCliente: 'CHIAPERO S.R.L.',
    fotos, informes, onVerCarga: () => {}, onVerAlertas: () => {},
  }))

describe('Novedades de tus cargas — la foto se ve donde está el aviso', () => {
  it('la fila dibuja las miniaturas, no solo el número de fotos', () => {
    const html = render([foto('a'), foto('b'), foto('c')])
    expect(html).toContain('Novedades de tus cargas')
    expect(html).toContain('3 fotos en depósito GODILCO')
    expect(html).toContain('src="https://firmada/a"')
    expect(html).toContain('src="https://firmada/c"')
  })

  it('más de cuatro fotos: cuatro miniaturas y el "+N"', () => {
    const html = render(Array.from({ length: 6 }, (_, i) => foto(`f${i}`)))
    expect((html.match(/src="https:\/\/firmada\//g) || []).length).toBe(4)
    expect(html).toContain('+2')
  })

  it('la fila lleva a la ficha de la carga, no a la lista', () => {
    const html = render([foto('a')])
    expect(html).toContain('title="Ver la ficha de esta carga"')
  })

  it('las dos referencias, con la del cliente adelante (D2)', () => {
    const html = render([foto('a')])
    expect(html).toContain('>1410<')
    expect(html).toContain('title="Nuestra referencia">8121<')
  })

  it('el informe se muestra como tarjeta de documento con botón Abrir', () => {
    const html = render([], [informe()])
    expect(html).toContain('Informe de trasiego')
    expect(html).toContain('Abrir')
    expect(html).toContain('PDF ·')
  })

  it('la tarjeta del informe NO promete una miniatura de la primera página', () => {
    const html = render([], [informe()])
    // Sin servidor no se renderiza un PDF: en la fila del informe no hay <img>.
    expect(html).not.toContain('<img')
  })

  it('las fotos de origen y las de Montevideo son dos filas, cada una con lo suyo', () => {
    const html = render([
      foto('uy1'), foto('uy2'),
      foto('or1', { photoType: 'origen', thumbnailUrl: 'https://firmada/or1' }),
    ])
    expect(html).toContain('2 fotos en depósito GODILCO')
    expect(html).toContain('1 foto en origen (SHANGHAI)')
    expect(html).toContain('src="https://firmada/or1"')
  })

  it('anuncia 1 foto de esta semana: dibuja UNA miniatura, no el historial', () => {
    // El caso de la revisión: 1 foto de esta semana y 7 del mes pasado, misma
    // carga y mismo lugar. Decía "1 foto en depósito GODILCO" y abajo
    // dibujaba cuatro miniaturas y un "+4" de fotos de hace un mes.
    const html = render([
      foto('nueva'),
      ...Array.from({ length: 7 }, (_, i) => foto(`vieja${i}`, { createdAt: ts(-35 - i) })),
    ])
    expect(html).toContain('1 foto en depósito GODILCO')
    expect((html.match(/src="https:\/\/firmada\//g) || []).length).toBe(1)
    expect(html).toContain('src="https://firmada/nueva"')
    expect(html).not.toContain('vieja')
    expect(html).not.toMatch(/\+\d/)
  })

  it('sin fotos ni informes la card no existe', () => {
    expect(render([])).not.toContain('Novedades de tus cargas')
  })
})
