/**
 * Smoke test de render del componente HoyCliente (sin DOM): que pinte las
 * cards que corresponden, con los textos del cliente, y el estado vacío feliz.
 * El portal no tiene tests de componente; esto al menos garantiza que la
 * card no explota con datos reales-ish.
 */
import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import HoyCliente from '../components/HoyCliente'
import type { ParsedShipment, OperativasRecord } from './shipmentTypes'

const HOY = '2026-09-02'
const dia = (n: number) => new Date(Date.UTC(2026, 8, 2 + n)).toISOString().slice(0, 10)
const op = (o: Partial<OperativasRecord> & { CAMION?: string } = {}): OperativasRecord => ({
  REF: 'A8045', TLX: '', DEPOSITO: 'GODILCO', ETA_OP: '', SALIDA: '', ETA_FISC: '', LIBRE: '',
  OPERATIVA: 'TRASIEGO', CNTR_OP: 'FANU1858496', PKGS: 10, KG: 1000, M3: 20,
  DESCRIPCION: 'MOTOPARTES', FISCAL: 'CACEC', DESCARGA: '', DEV: '', TIPO: '40HC', WOOD: '',
  TRANSPORTE: 'TRANSCAL', LUGAR_SALIDA: '', ...o,
} as unknown as OperativasRecord)
const carga = (c: Record<string, unknown> = {}, operativas: OperativasRecord[] = [op()]): ParsedShipment => ({
  REF: 'A8045', CLIENT_REF: '1417', MODE: 'fcl', PAIS: 'UY', POD: 'MONTEVIDEO', ETD: dia(-30), ETA: dia(4),
  CNTR: 'FANU1858496', N: 1, BUQUE: 'SANTA CATARINA EXPRESS', LIBRE_HASTA: '', TERMINAL: 'TCP',
  containers: [], calculatedN: 1, calculatedLibreHasta: '', operativas, ...c,
} as unknown as ParsedShipment)

const render = (shipments: ParsedShipment[], extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(HoyCliente, { shipments, alerts: [], hoyISO: HOY, onVerCarga: () => {}, onVerAlertas: () => {}, ...extra }))

describe('HoyCliente (render estático)', () => {
  it('pinta las cuatro cards con sus títulos, las refs del cliente y las marcas de ruta/tipo cuando hay mezcla', () => {
    const html = render([
      carga({ REF: 'A1', CLIENT_REF: '1400', ETA: dia(-5) }, [op({ SALIDA: dia(-1), ETA_FISC: dia(2) })]),
      carga({ REF: 'A2', CLIENT_REF: '', ETA: dia(-3) }, [op({ LUGAR_SALIDA: 'PLANIR' })]),
      carga({ REF: 'A3', CLIENT_REF: '1417', ETA: dia(4) }),
      carga({ REF: 'A4', CLIENT_REF: '1420', ETD: dia(-2), ETA: dia(30) }),
      carga({ REF: 'A5', CLIENT_REF: '1500', PAIS: 'CL', POD: 'SAN ANTONIO', ETA: dia(3) }, []),
      carga({ REF: 'E1', CLIENT_REF: '', MODE: 'lcl', CNTR: '', N: 0, ETA: dia(-10) }, [op({ OPERATIVA: 'CONSOLIDADO', CNTR_OP: '', CAMION: 'C463', SALIDA: dia(-1), ETA_FISC: dia(1), FISCAL: 'ZF RAFAELA' })]),
    ], { mostrarRuta: true, mostrarTipo: true })
    for (const t of ['Llegan a destino', 'En Montevideo, esperando salida', 'Llegan a Montevideo', 'Embarcadas']) {
      expect(html).toContain(t)
    }
    expect(html).toContain('1400')
    expect(html).toContain('>2<')            // sin ref del cliente → nuestro número pelado
    expect(html).not.toContain('TWF')        // nunca la marca adelante (Brian 04/09)
    expect(html).toContain('EN CAMINO')
    expect(html).toContain('LLEGA AL PUERTO') // Chile: el puerto es el destino
    expect(html).toContain('Camión C463')     // LCL en camión
    expect(html).toContain('ZF RAFAELA')
    expect(html).toContain('En PLANIR')
    expect(html).toContain('Trasiego en GODILCO')
    expect(html).toContain('Zarpó')
    expect(html).toContain('Chile')           // marca de ruta
    expect(html).toContain('LCL')             // marca de tipo
    expect(html).toContain('Pedir salida')
    // nada interno para el cliente
    expect(html).not.toContain('TRANSCAL')
    expect(html).not.toContain('LIBRE')
    expect(html).not.toContain('Sin movimientos')
  })

  it('sin mezcla no marca ruta ni tipo', () => {
    const html = render([carga({ REF: 'A3', ETA: dia(4) })])
    expect(html).not.toContain('vía Montevideo')
    expect(html).not.toContain('>FCL<')
  })

  it('sin movimientos ni alertas: solo el estado vacío feliz', () => {
    const html = render([carga({ ETD: dia(-40), ETA: dia(40) })])
    expect(html).toContain('Sin movimientos en los próximos días')
    expect(html).not.toContain('Llegan a Montevideo')
  })

  it('sin cargas no pinta nada', () => {
    expect(render([])).toBe('<div class="space-y-4 mb-8"></div>')
  })
})
