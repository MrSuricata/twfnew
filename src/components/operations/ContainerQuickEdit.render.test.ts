/**
 * El modal de cambios rápidos, renderizado. Hasta el rediseño 04/09 no tenía
 * ningún test de render: se cambió la piel a PanelCard y no había red que
 * avisara si el diálogo se quedaba sin título accesible, si un campo
 * desaparecía o si en solo lectura seguía habiendo controles editables.
 *
 * Render estático (react-dom/server), igual que PanelCard.test.ts: el repo
 * corre vitest en `node`, sin jsdom. Por eso se mockea `@/components/ui/dialog`:
 * el Portal de Radix devuelve null fuera del navegador y no se vería nada.
 * Lo que se prueba es NUESTRO markup, no el de Radix.
 */
import { describe, it, expect, vi } from 'vitest'
import { createElement as h, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ParsedShipment, OperativasRecord } from '@/lib/shipmentTypes'

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

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

import ContainerQuickEdit from './ContainerQuickEdit'

// ── fixtures ───────────────────────────────────────────────────────────────

const record = (over: Partial<OperativasRecord> = {}): OperativasRecord => ({
  REF: 'A7777', TLX: 'SI', DEPOSITO: 'GODILCO', ETA_OP: '', SALIDA: '',
  ETA_FISC: '', LIBRE: '', OPERATIVA: '', CNTR_OP: 'AAAA1111111',
  PKGS: 10, KG: 500, M3: 5, DESCRIPCION: 'BICIS', FISCAL: 'ZP RAFAELA',
  DESCARGA: '', DEV: '', CLIENTE_OP: 'PERETTI', TIPO: '40HC', WOOD: '',
  TRANSPORTE: 'OLAVERRY', HORARIO: '', LUGAR_SALIDA: 'GODILCO',
  ...over,
})

/** ETA a futuro → "En Tránsito Marítimo": el micro-estado no depende del día
 *  en que corran los tests. */
const carga = (over: Partial<ParsedShipment> = {}, ops = [record()]): ParsedShipment =>
  ({
    REF: 'A7777',
    CNTR: 'AAAA1111111',
    ETA: '2099-01-01',
    CLIENTE: 'PERETTI',
    TIPO: '40HC',
    LIBRE_HASTA: '',
    calculatedLibreHasta: '',
    operativas: ops,
    __dbId: 'db-1',
    ...over,
  } as unknown as ParsedShipment)

const render = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(h(ContainerQuickEdit, {
    shipment: carga(),
    cntr: 'AAAA1111111',
    editable: true,
    open: true,
    onOpenChange: () => {},
    onPatch: () => {},
    onMasDatos: () => {},
    ...props,
  } as never))

// ── tests ──────────────────────────────────────────────────────────────────

describe('ContainerQuickEdit — el diálogo se anuncia', () => {
  it('tiene título accesible con la carga y el contenedor, y una descripción', () => {
    const html = render()
    expect(html).toContain('Cambios rápidos de la carga A7777')
    expect(html).toContain('contenedor AAAA1111111')
    expect(html).toContain('Salida de Montevideo, arribo fiscal, lugar de salida y transporte')
    // sr-only: se anuncia, no se ve dos veces.
    expect(html).toContain('sr-only')
  })

  it('cerrado no renderiza nada', () => {
    expect(render({ open: false })).toBe('')
  })

  it('sin contenedor asignado lo dice en vez de dejar el subtítulo vacío', () => {
    const html = render({ cntr: '' })
    expect(html).toContain('Carga sin contenedor asignado')
    expect(html).not.toContain('contenedor —')
  })
})

describe('ContainerQuickEdit — los datos clave están todos', () => {
  it('cabecera con ref, contenedor y chip de estado', () => {
    const html = render()
    expect(html).toContain('A7777')
    expect(html).toContain('AAAA1111111')
    expect(html).toContain('En Tránsito Marítimo')
  })

  it('los cuatro campos + LIBRE con su botón "Devuelto"', () => {
    const html = render()
    expect(html).toContain('Salida MVD')
    expect(html).toContain('Arribo fiscal')
    expect(html).toContain('Lugar de salida')
    expect(html).toContain('Transporte')
    expect(html).toContain('Libre (máx. devolución)')
    expect(html).toContain('Devuelto')
  })

  it('editable: los campos son controles de verdad, con su etiqueta ligada', () => {
    const html = render()
    expect(html).toContain('type="date"')
    expect(html).toContain('<select')
    expect(html).toContain('list="qe-A7777-transportes"')
    expect(html).toContain('for="qe-A7777-salida"')
    expect(html).toContain('id="qe-A7777-salida"')
  })

  it('el pie ofrece "Más datos" y "Listo"', () => {
    const html = render()
    expect(html).toContain('Más datos')
    expect(html).toContain('Listo')
  })
})

describe('ContainerQuickEdit — piel común, sin paleta propia', () => {
  it('el chip del estado sale del tono de la card, no de un hex suelto', () => {
    // En tránsito → tono neutro de PanelCard.
    expect(render()).toContain('bg-slate-600 text-white')
    expect(render()).not.toContain('#1e3a8a')
  })

  it('una carga ya devuelta pinta la card en verde (tono ok)', () => {
    const devuelta = carga(
      { ETA: '2020-01-05' },
      [record({ SALIDA: '2020-01-10', ETA_FISC: '2020-01-12' })],
    )
    const html = render({ shipment: devuelta })
    expect(html).toContain('bg-emerald-600 text-white')
    expect(html).not.toContain('bg-slate-600 text-white')
  })
})

describe('ContainerQuickEdit — solo lectura', () => {
  it('sin permiso de edición no hay controles editables, solo los valores', () => {
    const soloLectura = carga({ ETA: '2020-01-05' }, [record({ SALIDA: '2020-01-10' })])
    const html = render({ shipment: soloLectura, editable: false })
    expect(html).not.toContain('<input')
    expect(html).not.toContain('<select')
    // El valor se muestra igual, en formato dd/MM/yyyy.
    expect(html).toContain('10/01/2020')
    expect(html).toContain('Salida MVD')
  })

  it('sin permiso de edición el botón "Devuelto" queda deshabilitado', () => {
    const html = render({ editable: false })
    expect(html).toContain('disabled=')
    expect(html).toContain('Solo lectura')
  })

  it('una carga sin ID lo avisa y no deja marcar devuelto', () => {
    const html = render({ shipment: carga({ __dbId: undefined }) })
    expect(html).toContain('Sin ID — edición no disponible')
    expect(html).toContain('disabled=')
  })
})
