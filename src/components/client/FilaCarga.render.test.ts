/**
 * La fila de "Mis cargas", renderizada (spec 04/09, D4).
 *
 * Render estático (`renderToStaticMarkup`), como PanelCard.test.ts: el repo
 * corre vitest en `node`, sin jsdom ni testing-library.
 *
 * Lo que estos tests no dejan pasar: que vuelva "0 contenedor(es)", que
 * aparezca "Libre" en la vista del cliente, que la ref del cliente pierda la
 * pelea con la nuestra, o que la fila deje de decir el próximo hito.
 */
import { describe, it, expect } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import FilaCarga from './FilaCarga'
import { filaCargaCliente } from '@/lib/cargaCliente'
import type { ParsedShipment, OperativasRecord } from '@/lib/shipmentTypes'

const HOY = '2026-09-04'
const dia = (n: number): string => new Date(Date.UTC(2026, 8, 4 + n)).toISOString().slice(0, 10)

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

const render = (s: ParsedShipment, props: Record<string, unknown> = {}, nombreCliente = '') =>
  renderToStaticMarkup(h(FilaCarga, {
    fila: filaCargaCliente(s, HOY, nombreCliente),
    onAbrir: () => {},
    ...props,
  }))

describe('FilaCarga — lo que el cliente lee de un vistazo', () => {
  it('las dos refs: la suya grande, la nuestra chica y anunciada', () => {
    const html = render(carga(), {}, 'CHIAPERO S.R.L.')
    expect(html).toContain('>1410<')
    expect(html).toContain('title="Nuestra referencia">8121<')
    expect(html).not.toContain('A8121')   // la ref interna no se muestra
    expect(html).not.toContain('TWF')     // nunca la marca adelante
  })

  it('el estado con el vocabulario del cliente, no el del admin', () => {
    expect(render(carga({}, [op({ SALIDA: dia(-2) })]))).toContain('En camino')
    expect(render(carga())).toContain('En Montevideo')
    expect(render(carga())).not.toContain('En Tránsito')
  })

  it('el próximo hito, con su etiqueta y su fecha', () => {
    const html = render(carga({}, [op({ SALIDA: dia(2) })]))
    expect(html).toContain('Sale de Montevideo')
    expect(html).toContain('06/09/2026')
  })

  it('sin fecha de hito no queda un hueco: dice qué falta', () => {
    const html = render(carga({}, [op()]))
    expect(html).toContain('Salida')
    expect(html).toContain('A coordinar')
  })

  it('los contenedores se cuentan: nunca "0 contenedor(es)"', () => {
    const dos = carga({ N: 0, calculatedN: 0, CNTR: '' }, [
      op({ CNTR_OP: 'MSKU1111111' }), op({ CNTR_OP: 'MSKU2222222' }),
    ])
    expect(render(dos)).toContain('2 contenedores')
    expect(render(dos)).not.toContain('0 contenedor')
  })

  it('NADA de "Libre": es dato nuestro (spec 02/09)', () => {
    const html = render(carga({ LIBRE_HASTA: dia(-3) }, [op({ LIBRE: dia(-3) })]))
    expect(html.toLowerCase()).not.toContain('libre')
  })

  it('tampoco el transporte ni el depósito de trabajo interno', () => {
    expect(render(carga())).not.toContain('TRANSCAL')
  })

  it('marca ruta y tipo solo cuando el cliente ve mezcla', () => {
    expect(render(carga())).not.toContain('vía Montevideo')
    const conMezcla = render(carga(), { mostrarRuta: true, mostrarTipo: true })
    expect(conMezcla).toContain('vía Montevideo')
    expect(conMezcla).toContain('>FCL<')
  })

  it('la fila entera es UN botón que abre la ficha, con nombre accesible', () => {
    const html = render(carga(), { id: 'carga-A8121' }, 'CHIAPERO S.R.L.')
    expect(html.match(/<button/g)?.length).toBe(1)
    expect(html).toContain('aria-label="Ver la carga 1410"')
    expect(html).toContain('id="carga-A8121"')
  })

  it('destacada (viene de una card de HOY) se resalta; apagada (historial) no', () => {
    expect(render(carga(), { destacada: true })).toContain('ring-accent')
    expect(render(carga(), { apagada: true })).toContain('opacity-75')
    expect(render(carga())).not.toContain('ring-accent')
  })

  it('una LCL dice que es consolidada en vez de contar contenedores', () => {
    const lcl = carga({ REF: 'E200', CLIENT_REF: '', MODE: 'lcl', N: 0, calculatedN: 0, CNTR: '' }, [
      op({ CNTR_OP: '', OPERATIVA: 'CONSOLIDADO' }),
    ])
    expect(render(lcl)).toContain('Carga consolidada')
  })
})
