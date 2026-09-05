/**
 * La fila de "Salidas y arribos por contenedor", renderizada.
 *
 * Render estático (`renderToStaticMarkup`), como FilaCarga.render.test.ts: el
 * repo corre vitest en `node`, sin jsdom ni testing-library.
 *
 * Lo que estos tests no dejan pasar: que el tipo de contenedor vuelva a ser
 * texto libre (o desaparezca), que el modo solo-lectura muestre un control
 * editable, o que un valor viejo fuera de la lista se pierda al abrir el panel.
 */
import { describe, it, expect, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { OperativasRecord } from '@/lib/shipmentTypes'
import type { UnifiedOperation } from '@/lib/operationsTypes'

vi.mock('sonner', () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {} }) }))

const { default: ContainerDatesSection } = await import('./ContainerDatesSection')

const record = (over: Partial<OperativasRecord> = {}): OperativasRecord => ({
  REF: 'A7777', TLX: 'SI', DEPOSITO: 'GODILCO', ETA_OP: '', SALIDA: '', ETA_FISC: '',
  LIBRE: '', OPERATIVA: 'TRASIEGO', CNTR_OP: 'MSKU1111111', PKGS: 400, KG: 8000, M3: 40,
  DESCRIPCION: 'BICICLETAS', FISCAL: 'CACEC', DESCARGA: '', DEV: '', CLIENTE_OP: 'PERETTI',
  TIPO: '40HC', WOOD: '', TRANSPORTE: '', HORARIO: '', LUGAR_SALIDA: '',
  ...over,
} as OperativasRecord)

const carga = (cntr: string, operativas: OperativasRecord[]): UnifiedOperation => ({
  uid: 'test', ref: 'A7777', mode: 'fcl', source: 'db', readOnly: false,
  operatorId: null, cliente: 'PERETTI', shipper: '', agente: '', incoterm: '',
  tlx: 'SI', deposito: 'GODILCO', origin: '', paisOrigen: '', etd: '', eta: '2026-09-01',
  salida: '', etaFisc: '', libre: '', operativa: 'TRASIEGO', cntr,
  docNumber: '', buque: '', linea: '', camion: '', pkgs: 0, kg: 0, m3: 0,
  descripcion: '', fiscal: 'CACEC', dischargePort: '', pais: 'AR',
  destPort: '', descarga: '', desconsol: '', entregaPlanta: false, dev: '',
  despacho: '', tipo: '40HQ', terminal: 'MONTECON', n: 0, wood: false,
  noApilable: false, oog: false, imo: false, transporte: '', seguimiento: '',
  seguro: false, certi: false, impresa: false, archived: false, status: '',
  operativas,
} as UnifiedOperation)

const pintar = (op: UnifiedOperation, editable: boolean) =>
  renderToStaticMarkup(h(ContainerDatesSection, { op, editable, onCommitOperativas: () => {} }))

describe('ContainerDatesSection — tipo por contenedor', () => {
  it('el tipo se elige de una lista, no se escribe: hay <select> con las opciones', () => {
    const html = pintar(carga('MSKU1111111', [record()]), true)
    expect(html).toContain('<select')
    expect(html).toContain('>Tipo<')
    expect(html).toContain('40HQ — 40 pies high cube')
    expect(html).toContain('20GP — 20 pies estándar')
    expect(html).toContain('20NOR — reefer apagado')
    expect(html).toContain('20OT — open top')
    expect(html).toContain('40FR — flat rack')
    expect(html).toContain('— sin definir —')
  })

  it('va DESPUÉS de bultos/kg/m³ (pedido de Brian), no antes', () => {
    const html = pintar(carga('MSKU1111111', [record()]), true)
    expect(html.indexOf('>Tipo<')).toBeGreaterThan(html.indexOf('>M³<'))
    expect(html.indexOf('>M³<')).toBeGreaterThan(html.indexOf('>Bultos<'))
  })

  it('40HC llega normalizado a 40HQ y queda seleccionado (no crea un tipo nuevo)', () => {
    const html = pintar(carga('MSKU1111111', [record({ TIPO: '40HC' })]), true)
    expect(html).toContain('<option value="40HQ" selected="">40HQ — 40 pies high cube</option>')
    expect(html).not.toContain('>40HC<')
  })

  it('cada contenedor lleva SU tipo: dos contenedores, dos selecciones distintas', () => {
    const html = pintar(carga('MSKU1111111, MSKU2222222', [
      record({ CNTR_OP: 'MSKU1111111', TIPO: '20GP' }),
      record({ CNTR_OP: 'MSKU2222222', TIPO: '40HQ' }),
    ]), true)
    expect(html).toContain('<option value="20GP" selected="">')
    expect(html).toContain('<option value="40HQ" selected="">')
  })

  it('"FCL" no es un tipo: el contenedor queda sin definir, sin opción basura', () => {
    const html = pintar(carga('MSKU1111111', [record({ TIPO: 'FCL' })]), true)
    expect(html).toContain('<option value="" selected="">— sin definir —</option>')
    expect(html).not.toContain('>FCL<')
  })

  it('un valor viejo fuera de la lista NO se pierde: se ofrece marcado', () => {
    const html = pintar(carga('MSKU1111111', [record({ TIPO: '20GP + 40HQ' })]), true)
    expect(html).toContain('<option value="20GP + 40HQ" selected="">20GP + 40HQ — dato anterior, revisar</option>')
  })

  it('en solo lectura no hay control: texto, y "—" cuando no hay tipo', () => {
    const conTipo = pintar(carga('MSKU1111111', [record({ TIPO: '20 gp' })]), false)
    expect(conTipo).not.toContain('<select')
    expect(conTipo).toContain('>20GP<')

    const sinTipo = pintar(carga('MSKU1111111', [record({ TIPO: 'FCL' })]), false)
    expect(sinTipo).not.toContain('<select')
    expect(sinTipo).toContain('—')
  })
})
