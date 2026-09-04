/**
 * La ficha de la carga del cliente, renderizada (spec 04/09, D5).
 *
 * Render estático (react-dom/server), como ContainerQuickEdit.render.test.ts:
 * el repo corre vitest en `node`, sin jsdom. Por eso se mockea
 * `@/components/ui/dialog` (el Portal de Radix devuelve null fuera del
 * navegador) y `sonner`. Lo que se prueba es NUESTRO markup.
 *
 * Lo que no puede pasar: que la ficha muestre "Libre", que la línea de tiempo
 * dé por alcanzado un hito que no ocurrió, que vuelva "0 contenedor(es)" o
 * que el diálogo se quede sin título accesible.
 */
import { describe, it, expect, vi } from 'vitest'
import { createElement as h, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ParsedShipment, OperativasRecord } from '@/lib/shipmentTypes'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/dataClient', () => ({ fetchReportFile: vi.fn(), fetchOriginPhotoFile: vi.fn(), deleteOriginPhoto: vi.fn() }))

vi.mock('@/components/ui/dialog', async () => {
  const { createElement } = await import('react')
  type P = { children?: ReactNode; className?: string }
  return {
    Dialog: ({ open, children }: P & { open?: boolean }) =>
      open ? createElement('div', { 'data-dialog': 'open' }, children) : null,
    DialogContent: ({ children, className }: P) => createElement('div', { className }, children),
    DialogTitle: ({ children, className }: P) => createElement('h1', { className }, children),
    DialogDescription: ({ children, className }: P) => createElement('p', { className }, children),
  }
})

import ClientShipmentDialog from './ClientShipmentDialog'

const HOY = '2026-09-04'
const dia = (n: number): string => new Date(Date.UTC(2026, 8, 4 + n)).toISOString().slice(0, 10)
const ts = (y: number, m: number, d: number): number => new Date(y, m - 1, d, 12).getTime()

const op = (o: Partial<OperativasRecord> = {}): OperativasRecord => ({
  REF: 'A8121', TLX: 'SI', DEPOSITO: 'GODILCO', ETA_OP: '', SALIDA: '', ETA_FISC: '', LIBRE: dia(1),
  OPERATIVA: 'TRASIEGO', CNTR_OP: 'MSKU1111111', PKGS: 400, KG: 8000, M3: 40,
  DESCRIPCION: 'BICICLETAS', FISCAL: 'CACEC', DESCARGA: '', DEV: '', CLIENTE_OP: '',
  TIPO: '40HC', WOOD: '', TRANSPORTE: 'TRANSCAL', HORARIO: '', LUGAR_SALIDA: '',
  ...o,
} as unknown as OperativasRecord)

const carga = (c: Record<string, unknown> = {}, operativas: OperativasRecord[] = [op()]): ParsedShipment => ({
  REF: 'A8121', CLIENT_REF: '1410', CLIENTE: '', MODE: 'fcl', PAIS: 'UY', POL: 'SHANGHAI',
  POD: 'MONTEVIDEO', ETD: dia(-30), ETA: dia(-5), CNTR: 'MSKU1111111', N: 1,
  BUQUE: 'MAERSK SAN LAZARO', LINEA: 'MAERSK', TERMINAL: 'TCP', LIBRE_HASTA: dia(1),
  containers: [], calculatedN: 1, calculatedLibreHasta: '', operativas,
  ...c,
} as unknown as ParsedShipment)

const render = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(h(ClientShipmentDialog, {
    shipment: carga(),
    open: true,
    onOpenChange: () => {},
    hoyISO: HOY,
    nombreCliente: 'CHIAPERO S.R.L.',
    ...props,
  } as never))

describe('ClientShipmentDialog — el diálogo se anuncia y se nombra como el cliente', () => {
  it('título accesible con la ref del cliente y descripción', () => {
    const html = render()
    expect(html).toContain('Carga 1410')
    expect(html).toContain('sr-only')
    expect(html).toContain('Dónde está la carga, sus datos, las fotos y los informes.')
  })

  it('en el encabezado: su ref grande y la nuestra dicha con todas las letras', () => {
    const html = render()
    expect(html).toContain('>1410<')
    expect(html).toContain('Nuestra referencia 8121')
    expect(html).not.toContain('TWF')
    expect(html).not.toContain('A8121')
  })

  it('cerrado no renderiza nada', () => {
    expect(render({ open: false })).toBe('')
  })

  it('las tres pestañas, con el contador de fotos e informes', () => {
    const html = render({
      fotos: [{ id: 'f1', shipmentRef: 'A8121', photoType: 'uruguay', createdAt: ts(2026, 9, 2) }],
      informes: [{ id: 'r1', shipmentRef: 'A8121', title: 'Informe de trasiego', createdAt: ts(2026, 9, 2), fileName: 'i.pdf' }],
    })
    expect(html).toContain('Resumen')
    expect(html).toContain('Fotos')
    expect(html).toContain('Informes')
  })
})

describe('ClientShipmentDialog — Resumen', () => {
  it('la línea de tiempo NO da por alcanzado lo que no pasó', () => {
    // Carga que todavía no zarpó: un solo paso alcanzado (el actual) y los
    // otros cinco en gris. El modal viejo pintaba "En Tránsito ✓" siempre.
    const html = render({ shipment: carga({ ETD: dia(5), ETA: dia(35) }, []) })
    expect(html).toContain('Por embarcar')
    expect(html.indexOf('Por embarcar')).toBeLessThan(html.indexOf('Ahora'))
    expect(html.match(/text-muted-foreground\/40/g)?.length).toBe(5)
    expect(html.match(/text-emerald-600/g)?.length).toBe(1)
    expect(html).toContain('Pendiente')
  })

  it('los datos de la carga, sin campos vacíos ni datos internos', () => {
    const html = render()
    expect(html).toContain('MAERSK SAN LAZARO')
    expect(html).toContain('BICICLETAS')
    expect(html).toContain('CACEC')
    expect(html).toContain('1 contenedor')
    expect(html).not.toContain('0 contenedor')
    expect(html).not.toContain('TRANSCAL')
  })

  it('NADA de "Libre" en toda la ficha', () => {
    const html = render({ shipment: carga({ LIBRE_HASTA: dia(-2) }, [op({ LIBRE: dia(-2) })]) })
    expect(html.toLowerCase()).not.toContain('libre')
  })

  it('cada contenedor con su estado y sus fechas', () => {
    const html = render({
      shipment: carga({ N: 2 }, [
        op({ CNTR_OP: 'MSKU1111111', SALIDA: dia(-5), ETA_FISC: dia(-3) }),
        op({ CNTR_OP: 'MSKU2222222' }),
      ]),
    })
    expect(html).toContain('MSKU1111111')
    expect(html).toContain('MSKU2222222')
    expect(html).toContain('En destino')
    expect(html).toContain('A coordinar')   // el que todavía no tiene salida
  })
})

// Radix solo renderiza la pestaña activa (Resumen), así que de Fotos e
// Informes se verifica lo que sí queda en el DOM: sus contadores.
describe('ClientShipmentDialog — Fotos e Informes', () => {
  it('sin fotos ni informes, la ficha igual abre y no rompe', () => {
    const html = render({ fotos: [], informes: [] })
    expect(html).toContain('Dónde está tu carga')
  })

  it('el contador de la pestaña cuenta solo lo de ESTA carga', () => {
    const html = render({
      fotos: [
        { id: 'f1', shipmentRef: 'A8121', photoType: 'origen', createdAt: ts(2026, 8, 20) },
        { id: 'f2', shipmentRef: 'A9999', photoType: 'origen', createdAt: ts(2026, 8, 20) },
      ],
    })
    // 1 foto propia (la de la otra carga no cuenta)
    expect(html).toContain('>1<')
  })
})

describe('ClientShipmentDialog — no toca el modal del admin', () => {
  it('no importa ShipmentDetailsDialog (lo comparten Agenda, Tracking y HOY)', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('./ClientShipmentDialog.tsx', import.meta.url), 'utf8')
    expect(src).not.toMatch(/^import .*ShipmentDetailsDialog/m)
  })
})
