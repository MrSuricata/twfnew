/**
 * Las reglas de la caja de comentarios, fijadas donde importa.
 *
 * Lo que estos tests no dejan pasar:
 *  · que un comentario en blanco (o de tres espacios) llegue a la DB y explote
 *    contra el CHECK de la tabla en vez de mostrar un mensaje;
 *  · que el estado retroceda — marcar visto un comentario ya respondido lo
 *    dejaría "sin responder" en la card y el partner vería desaparecer la
 *    respuesta que ya leyó;
 *  · que el contexto pierda el dato que hace reproducible el problema (que
 *    entró desde el celular) o, al revés, que se cuele cualquier cosa en el
 *    jsonb.
 */
import { describe, it, expect } from 'vitest'
import {
  validarTexto, validarRespuesta, estadoTrasAccion, cambiaEstado, ordenEstado,
  sinLeer, pendientesDeRespuesta, conRespuesta, describirNavegador, sanearContexto,
  armarContexto, textoContexto, quienComento, CONTEXTO_VACIO,
  TOPE_TEXTO, TOPE_PANTALLA, TOPE_REF,
  ERROR_TEXTO_VACIO, ERROR_RESPUESTA_VACIA,
  type FeedbackAccion, type FeedbackEstado, type PartnerComentario,
} from './partnerFeedback'
import { recordarRefEnFoco, refEnFoco, olvidarRefEnFoco, VENTANA_FOCO_MS } from './refEnFoco'

const comentario = (o: Partial<PartnerComentario> = {}): PartnerComentario => ({
  id: 'c1', partnerEmail: 'ops@planir.uy', partnerName: 'Leo', partnerRole: 'depot',
  partnerFilter: 'PLANIR', texto: 'No me dejó marcar el retiro', contexto: CONTEXTO_VACIO,
  estado: 'nuevo', respuesta: '', respondidoPor: '', respondidoAt: null,
  createdAt: '2026-09-04T12:00:00.000Z',
  ...o,
})

describe('validarTexto — un comentario vacío nunca llega a la DB', () => {
  it('vacío, solo espacios o nulo → el mismo mensaje', () => {
    for (const v of ['', '   ', '\n\t ', null, undefined]) {
      expect(validarTexto(v)).toEqual({ ok: false, error: ERROR_TEXTO_VACIO })
    }
  })

  it('recorta los bordes: lo que se guarda es lo que se lee', () => {
    expect(validarTexto('  el botón no hace nada  ')).toEqual({ ok: true, texto: 'el botón no hace nada' })
  })

  it('el tope se mide sobre el texto YA recortado (como el CHECK de la tabla)', () => {
    const justo = 'a'.repeat(TOPE_TEXTO)
    expect(validarTexto(`  ${justo}  `)).toEqual({ ok: true, texto: justo })
    const r = validarTexto('a'.repeat(TOPE_TEXTO + 1))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain(String(TOPE_TEXTO))
  })

  it('dice cuánto escribiste, no solo que te pasaste', () => {
    const r = validarTexto('a'.repeat(2500))
    if (!r.ok) expect(r.error).toContain('2500')
  })
})

describe('validarRespuesta — misma regla, otro mensaje', () => {
  it('vacía → el equipo tiene que escribir algo', () => {
    expect(validarRespuesta('  ')).toEqual({ ok: false, error: ERROR_RESPUESTA_VACIA })
  })
  it('recorta y acepta', () => {
    expect(validarRespuesta(' ya lo arreglamos ')).toEqual({ ok: true, texto: 'ya lo arreglamos' })
  })
})

describe('estado — nuevo → leido → respondido, y nunca para atrás', () => {
  const estados: FeedbackEstado[] = ['nuevo', 'leido', 'respondido']
  const acciones: FeedbackAccion[] = ['visto', 'responder']

  it('marcar visto solo adelanta desde nuevo', () => {
    expect(estadoTrasAccion('nuevo', 'visto')).toBe('leido')
    expect(estadoTrasAccion('leido', 'visto')).toBe('leido')
    expect(estadoTrasAccion('respondido', 'visto')).toBe('respondido')
  })

  it('responder deja respondido desde cualquier estado (también corrige)', () => {
    for (const e of estados) expect(estadoTrasAccion(e, 'responder')).toBe('respondido')
  })

  it('ninguna acción retrocede el estado, en toda la matriz', () => {
    for (const e of estados) {
      for (const a of acciones) {
        expect(ordenEstado(estadoTrasAccion(e, a))).toBeGreaterThanOrEqual(ordenEstado(e))
      }
    }
  })

  it('cambiaEstado evita el UPDATE al pedo de marcar visto dos veces', () => {
    expect(cambiaEstado('nuevo', 'visto')).toBe(true)
    expect(cambiaEstado('leido', 'visto')).toBe(false)
    expect(cambiaEstado('respondido', 'visto')).toBe(false)
    expect(cambiaEstado('respondido', 'responder')).toBe(true)
  })
})

describe('listas — qué mira el equipo y qué mira el partner', () => {
  const nuevo = comentario({ id: 'a', estado: 'nuevo', createdAt: '2026-09-04T10:00:00Z' })
  const leido = comentario({ id: 'b', estado: 'leido', createdAt: '2026-09-04T09:00:00Z' })
  const resp = comentario({ id: 'c', estado: 'respondido', respuesta: 'listo', respondidoAt: '2026-09-04T11:00:00Z' })
  const respVacia = comentario({ id: 'd', estado: 'respondido', respuesta: '   ' })

  it('sin leer = los que nadie del equipo miró (cuentan en el header)', () => {
    expect(sinLeer([nuevo, leido, resp]).map(c => c.id)).toEqual(['a'])
  })

  it('pendientes de respuesta: el que más espera, primero', () => {
    expect(pendientesDeRespuesta([nuevo, leido, resp]).map(c => c.id)).toEqual(['b', 'a'])
  })

  it('el partner ve las respuestas reales, no un "respondido" con la caja vacía', () => {
    expect(conRespuesta([nuevo, resp, respVacia]).map(c => c.id)).toEqual(['c'])
  })
})

describe('describirNavegador — sirve para reproducir, no para identificar', () => {
  it('el celular del depósito, que es el caso que importa', () => {
    expect(describirNavegador('Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'))
      .toBe('Chrome en Android')
    expect(describirNavegador('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'))
      .toBe('Safari en iOS')
  })

  it('escritorio: Chrome, Edge y Firefox no se confunden entre sí', () => {
    expect(describirNavegador('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36')).toBe('Chrome en Windows')
    expect(describirNavegador('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0')).toBe('Edge en Windows')
    expect(describirNavegador('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:129.0) Gecko/20100101 Firefox/129.0')).toBe('Firefox en Mac')
  })

  it('sin user agent no inventa nada', () => {
    expect(describirNavegador('')).toBe('')
    expect(describirNavegador('   ')).toBe('')
  })
})

describe('contexto — se captura solo y no entra basura al jsonb', () => {
  it('arma pantalla, ruta, ref, navegador y viewport sin preguntar nada', () => {
    expect(armarContexto({
      pantalla: 'HOY del depósito', ruta: '/depot', ref: 'a8121',
      ua: 'Mozilla/5.0 (Linux; Android 14) Chrome/128.0.0.0 Mobile Safari/537.36',
      ancho: 390, alto: 844,
    })).toEqual({
      pantalla: 'HOY del depósito', ruta: '/depot', ref: 'A8121',
      navegador: 'Chrome en Android', viewport: '390×844', movil: true,
    })
  })

  it('en escritorio no dice celular', () => {
    expect(armarContexto({ ancho: 1440, alto: 900 }).movil).toBe(false)
    expect(armarContexto({ ancho: 767, alto: 900 }).movil).toBe(true)
  })

  it('sin medidas: viewport vacío, no "0×0"', () => {
    expect(armarContexto({}).viewport).toBe('')
    expect(armarContexto({ ancho: 390 }).viewport).toBe('')
  })

  it('sanea: solo las seis claves del contrato, recortadas y con tope', () => {
    const c = sanearContexto({
      pantalla: ' x '.repeat(200), ruta: '/depot', ref: ' a8121 ',
      navegador: 'Chrome', viewport: '390×844', movil: 'sí',
      // basura que un cliente podría mandar en el jsonb
      token: 'secreto', anidado: { a: 1 }, extra: 'x'.repeat(9999),
    })
    expect(Object.keys(c).sort()).toEqual(['movil', 'navegador', 'pantalla', 'ref', 'ruta', 'viewport'])
    expect(c.pantalla.length).toBeLessThanOrEqual(TOPE_PANTALLA)
    expect(c.ref).toBe('A8121')
    expect(c.ref.length).toBeLessThanOrEqual(TOPE_REF)
    // movil es booleano de verdad: un string cualquiera no lo enciende.
    expect(c.movil).toBe(false)
  })

  it('un contexto ausente o de otro tipo no rompe: queda vacío', () => {
    expect(sanearContexto(undefined)).toEqual(CONTEXTO_VACIO)
    expect(sanearContexto('nada')).toEqual(CONTEXTO_VACIO)
    expect(sanearContexto([1, 2])).toEqual(CONTEXTO_VACIO)
  })

  it('sanear es idempotente: lo que ya está limpio no cambia', () => {
    const c = armarContexto({ pantalla: 'HOY del transporte', ruta: '/transport', ancho: 1280, alto: 720 })
    expect(sanearContexto(c)).toEqual(c)
  })

  it('textoContexto: lo que lee el equipo en la card', () => {
    expect(textoContexto(armarContexto({
      pantalla: 'HOY del depósito', ref: 'A8121',
      ua: 'Mozilla/5.0 (Linux; Android 14) Chrome/128 Mobile Safari/537.36', ancho: 390, alto: 844,
    }))).toBe('HOY del depósito · A8121 · Chrome en Android · 390×844 (celular)')
    expect(textoContexto(CONTEXTO_VACIO)).toBe('')
    expect(textoContexto(null)).toBe('')
  })
})

describe('quienComento — el alcance es lo que el equipo reconoce', () => {
  it('PLANIR antes que el nombre, y el nombre antes que el email', () => {
    expect(quienComento(comentario())).toBe('PLANIR')
    expect(quienComento(comentario({ partnerFilter: '' }))).toBe('Leo')
    expect(quienComento(comentario({ partnerFilter: '', partnerName: '' }))).toBe('ops@planir.uy')
  })
})

describe('refEnFoco — la carga que tenía a mano, y solo si es reciente', () => {
  it('devuelve la última ref tocada, normalizada', () => {
    olvidarRefEnFoco()
    recordarRefEnFoco(' a8121 ', 1000)
    expect(refEnFoco(1000)).toBe('A8121')
  })

  it('vence: media hora después ya no es "lo que estabas haciendo"', () => {
    recordarRefEnFoco('A8121', 0)
    expect(refEnFoco(VENTANA_FOCO_MS)).toBe('A8121')
    expect(refEnFoco(VENTANA_FOCO_MS + 1)).toBe('')
  })

  it('sin nada tocado, o después de olvidar, no inventa una ref', () => {
    olvidarRefEnFoco()
    expect(refEnFoco()).toBe('')
    recordarRefEnFoco('A8121', 0)
    recordarRefEnFoco('', 0)
    expect(refEnFoco(0)).toBe('')
  })
})
