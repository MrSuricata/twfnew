/**
 * La card de comentarios en HOY, renderizada (spec 04/09).
 *
 * Render estático (`renderToStaticMarkup`): vitest corre en `node`, sin jsdom
 * ni testing-library. La fila se exporta aparte y no usa hooks, así que se la
 * puede mirar sola.
 *
 * Lo que estos tests no dejan pasar:
 *  · que se pierda el CONTEXTO (pantalla, carga, celular): sin eso el
 *    comentario no se puede reproducir y la card no sirve de nada;
 *  · que la card se llene de acciones — responder o marcar visto, nada más;
 *  · que plegada deje de avisar cuántos hay sin leer.
 */
import { describe, it, expect, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { armarContexto, CONTEXTO_VACIO, type PartnerComentario } from '@/lib/partnerFeedback'

vi.mock('@/lib/dataClient', () => ({
  fetchPartnerFeedback: async () => [],
  responderPartnerFeedback: async () => ({}),
}))

const { FilaComentario, QuienEscribio } = await import('./ComentariosPartnersCard')

const AHORA = new Date('2026-09-04T13:00:00Z')

const comentario = (o: Partial<PartnerComentario> = {}): PartnerComentario => ({
  id: 'c1', partnerEmail: 'ops@planir.uy', partnerName: 'Leo', partnerRole: 'depot',
  partnerFilter: 'PLANIR', texto: 'No me dejó marcar el retiro',
  contexto: armarContexto({
    pantalla: 'HOY del depósito', ruta: '/depot', ref: 'A8121',
    ua: 'Mozilla/5.0 (Linux; Android 14) Chrome/128 Mobile Safari/537.36', ancho: 390, alto: 844,
  }),
  estado: 'nuevo', respuesta: '', respondidoPor: '', respondidoAt: null,
  createdAt: '2026-09-04T12:30:00Z',
  ...o,
})

const fila = (c: PartnerComentario, props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(h(FilaComentario, {
    comentario: c, ahora: AHORA, ocupado: false, respondiendo: false, borrador: '',
    onBorrador: () => {}, onAbrirRespuesta: () => {}, onCancelarRespuesta: () => {},
    onResponder: () => {}, onVisto: () => {},
    ...props,
  }))

describe('FilaComentario — quién, cuándo, qué escribió y desde dónde', () => {
  it('el alcance del partner es lo que el equipo reconoce', () => {
    expect(fila(comentario())).toContain('PLANIR')
  })

  it('el texto tal cual lo escribió, entre comillas', () => {
    expect(fila(comentario())).toContain('“No me dejó marcar el retiro”')
  })

  it('cuánto hace que escribió', () => {
    expect(fila(comentario())).toContain('hace 30 min')
  })

  it('EL CONTEXTO: pantalla, carga y que entró desde el celular', () => {
    const html = fila(comentario())
    expect(html).toContain('HOY del depósito')
    expect(html).toContain('A8121')
    expect(html).toContain('Chrome en Android')
    expect(html).toContain('390×844 (celular)')
  })

  it('sin contexto lo dice, no deja el renglón mudo', () => {
    expect(fila(comentario({ contexto: CONTEXTO_VACIO }))).toContain('sin contexto')
  })

  it('dos acciones y nada más: responder o marcar visto', () => {
    const html = fila(comentario())
    expect(html).toContain('Responder')
    expect(html).toContain('Visto')
    expect(html).not.toMatch(/rechazar|confirmar|borrar/i)
  })

  it('lo ya leído ya no ofrece "Visto" ni lo marca como nuevo', () => {
    const html = fila(comentario({ estado: 'leido' }))
    expect(html).not.toContain('sin leer')
    expect(html).not.toContain('Visto')
    expect(html).toContain('Responder')
  })

  it('respondiendo: aparece la caja de una línea y se van los botones de arriba', () => {
    const html = fila(comentario(), { respondiendo: true, borrador: 'era el telex' })
    expect(html).toContain('Una línea alcanza')
    expect(html).toContain('value="era el telex"')
    expect(html).not.toContain('Visto')
  })

  it('respondiendo sin escribir nada, no se puede mandar', () => {
    const html = fila(comentario(), { respondiendo: true, borrador: '   ' })
    // El último botón es Cancelar; el de Responder queda deshabilitado.
    expect(html).toMatch(/disabled=""[^>]*>(?:(?!<button).)*Responder/s)
  })
})

describe('QuienEscribio — se distingue el depósito del transporte', () => {
  it('el transporte no se confunde con un depósito', () => {
    const dep = renderToStaticMarkup(h(QuienEscribio, { comentario: comentario() }))
    const tra = renderToStaticMarkup(h(QuienEscribio, {
      comentario: comentario({ partnerRole: 'transport', partnerFilter: 'TRANSCAL' }),
    }))
    expect(tra).toContain('TRANSCAL')
    expect(dep).not.toBe(tra)
  })
})
