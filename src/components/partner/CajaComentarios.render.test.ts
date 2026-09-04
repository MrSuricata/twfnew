/**
 * La caja de comentarios, renderizada (spec 04/09).
 *
 * Render estático (`renderToStaticMarkup`), como PanelCard.test.ts: el repo
 * corre vitest en `node`, sin jsdom ni testing-library. Por eso el cuerpo del
 * modal y el bloque de respuestas se exportan aparte: un diálogo cerrado no
 * renderiza nada, y lo que hay que fijar es el CONTENIDO.
 *
 * Lo que estos tests no dejan pasar:
 *  · que la caja se llene de campos ("categoría", "prioridad", "adjuntar"):
 *    cada campo más es una excusa para no escribir;
 *  · que se pueda mandar vacío;
 *  · que el "¿en qué estabas?" deje de venir completado;
 *  · que la respuesta del equipo quede escondida detrás de un botón.
 */
import { describe, it, expect, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CONTEXTO_VACIO, type PartnerComentario } from '@/lib/partnerFeedback'

// dataClient arrastra authClient (sessionStorage, fetch): en `node` alcanza
// con un stub — acá se mira la piel, no el guardado.
vi.mock('@/lib/dataClient', () => ({
  fetchPartnerFeedback: async () => [],
  enviarPartnerFeedback: async () => ({}),
}))

const { default: CajaComentarios, CuerpoCaja, RespuestasDelEquipo } = await import('./CajaComentarios')

const comentario = (o: Partial<PartnerComentario> = {}): PartnerComentario => ({
  id: 'c1', partnerEmail: 'ops@planir.uy', partnerName: 'Leo', partnerRole: 'depot',
  partnerFilter: 'PLANIR', texto: 'No me dejó marcar el retiro', contexto: CONTEXTO_VACIO,
  estado: 'respondido', respuesta: 'Era el telex: ya está liberado', respondidoPor: 'bridvanovich@twf.uy',
  respondidoAt: '2026-09-04T15:00:00Z', createdAt: '2026-09-04T12:00:00Z',
  ...o,
})

/** El tag de apertura de un elemento (los atributos no traen `>` sin escapar). */
const tag = (html: string, desde: number): string => html.slice(desde, html.indexOf('>', desde) + 1)
/** El botón Enviar es el último del cuerpo. */
const tagEnviar = (html: string): string => tag(html, html.lastIndexOf('<button'))
const tagInput = (html: string): string => tag(html, html.indexOf('<input'))

const cuerpo = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(h(CuerpoCaja, {
    texto: '', donde: 'HOY del depósito', enviando: false, enviado: false, respuestas: [],
    onTexto: () => {}, onDonde: () => {}, onEnviar: () => {}, onCancelar: () => {},
    ...props,
  }))

describe('CuerpoCaja — una sola caja de texto, y el encuadre angosto', () => {
  it('pregunta qué NO funcionó, no qué mejorarían', () => {
    const html = cuerpo()
    expect(html).toContain('¿Algo no funcionó?')
    expect(html).not.toMatch(/sugerenci|mejora/i)
  })

  it('un textarea y un input, nada más: sin categorías ni prioridades', () => {
    const html = cuerpo()
    expect(html.match(/<textarea/g)?.length).toBe(1)
    expect(html.match(/<input/g)?.length).toBe(1)
    expect(html).not.toContain('<select')
    expect(html).not.toMatch(/categor|prioridad|adjunt/i)
  })

  it('el "¿en qué estabas?" viene completado con la pantalla y es editable', () => {
    const html = cuerpo({ donde: 'HOY del transporte' })
    expect(html).toContain('¿En qué estabas?')
    expect(tagInput(html)).toContain('value="HOY del transporte"')
    expect(tagInput(html)).not.toContain('readonly')
    expect(tagInput(html)).not.toContain('disabled=""')
  })

  it('el contador de caracteres se ve y cuenta el texto recortado', () => {
    expect(cuerpo()).toContain('0/2000')
    expect(cuerpo({ texto: '  hola  ' })).toContain('4/2000')
  })

  it('vacío no se puede mandar; con texto sí', () => {
    expect(tagEnviar(cuerpo())).toContain('disabled=""')
    expect(tagEnviar(cuerpo({ texto: '   ' }))).toContain('disabled=""')
    expect(tagEnviar(cuerpo({ texto: 'no me dejó marcar el retiro' }))).not.toContain('disabled=""')
  })

  it('pasado el tope, tampoco: el contador avisa en rojo', () => {
    const html = cuerpo({ texto: 'a'.repeat(2001) })
    expect(html).toContain('2001/2000')
    expect(html).toContain('tabular-nums text-destructive')
    expect(tagEnviar(html)).toContain('disabled=""')
  })

  it('enviado: agradecimiento y se va el formulario', () => {
    const html = cuerpo({ enviado: true })
    expect(html).toContain('¡Gracias!')
    expect(html).not.toContain('<textarea')
  })

  it('lo que ya le respondieron se ve acá adentro (no repite el mismo comentario)', () => {
    const html = cuerpo({ respuestas: [comentario()] })
    expect(html).toContain('Lo que te respondieron')
    expect(html).toContain('Era el telex: ya está liberado')
  })
})

describe('RespuestasDelEquipo — la respuesta se ve al entrar', () => {
  it('muestra lo que escribió y lo que le contestaron, con el botón de cerrar', () => {
    const html = renderToStaticMarkup(h(RespuestasDelEquipo, { respuestas: [comentario()], onVista: () => {} }))
    expect(html).toContain('El equipo respondió tu comentario')
    expect(html).toContain('No me dejó marcar el retiro')
    expect(html).toContain('Era el telex: ya está liberado')
    expect(html).toContain('Listo')
  })

  it('en plural cuando hay más de una, con el contador', () => {
    const html = renderToStaticMarkup(h(RespuestasDelEquipo, {
      respuestas: [comentario(), comentario({ id: 'c2' })], onVista: () => {},
    }))
    expect(html).toContain('El equipo respondió tus comentarios')
    expect(html).toContain('>2<')
  })

  it('sin respuestas no pinta nada (cero ruido)', () => {
    expect(renderToStaticMarkup(h(RespuestasDelEquipo, { respuestas: [], onVista: () => {} }))).toBe('')
  })
})

describe('CajaComentarios — el botón fijo, en los dos portales', () => {
  it('siempre está el botón, discreto y con el encuadre angosto', () => {
    const html = renderToStaticMarkup(h(CajaComentarios, { pantalla: 'HOY del depósito' }))
    expect(html).toContain('data-testid="boton-comentarios"')
    expect(html).toContain('¿Algo no funcionó?')
    expect(html).toContain('fixed bottom-4 right-4')
  })

  it('sin respuestas nuevas no hay cartel arriba del portal', () => {
    const html = renderToStaticMarkup(h(CajaComentarios, { pantalla: 'HOY del transporte' }))
    expect(html).not.toContain('El equipo respondió')
  })
})
