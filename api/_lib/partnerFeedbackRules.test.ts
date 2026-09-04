/**
 * El espejo del servidor de la caja de comentarios.
 *
 * La API no importa código de src/, así que las reglas están escritas dos
 * veces. Estos tests corren las DOS implementaciones sobre la misma matriz y
 * exigen que respondan idéntico: si alguien toca una y se olvida de la otra
 * —el tope, un mensaje, una clave del contexto— rompe acá y no en producción,
 * con el portal mostrando "podés escribir hasta 2000" y el server rechazando
 * en 500.
 */
import { describe, it, expect } from 'vitest'
import {
  validarTextoAPI, validarRespuestaAPI, sanearContextoAPI, estadoTrasAccionAPI, cambiaEstadoAPI,
  validarNuevoFeedback, validarResponderFeedback, mapFilaToComentario,
  TOPE_TEXTO_API,
} from './partnerFeedbackRules.js'
import {
  validarTexto, validarRespuesta, sanearContexto, estadoTrasAccion, cambiaEstado, armarContexto,
  CONTEXTO_VACIO, type FeedbackAccion, type FeedbackEstado,
} from '../../src/lib/partnerFeedback.js'

describe('validarNuevoFeedback — el body del partner', () => {
  it('texto válido + contexto saneado', () => {
    const r = validarNuevoFeedback({
      texto: '  no me dejó marcar el retiro  ',
      contexto: { pantalla: 'HOY del depósito', ref: 'a8121', movil: true, basura: 'x' },
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.texto).toBe('no me dejó marcar el retiro')
      expect(r.data.contexto).toEqual({
        pantalla: 'HOY del depósito', ruta: '', ref: 'A8121',
        navegador: '', viewport: '', movil: true,
      })
    }
  })

  it('sin contexto: queda el vacío del contrato, no undefined', () => {
    const r = validarNuevoFeedback({ texto: 'algo' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.contexto).toEqual(CONTEXTO_VACIO)
  })

  it('texto vacío o solo espacios → 400 con el mensaje del contrato', () => {
    for (const texto of ['', '   ']) {
      const r = validarNuevoFeedback({ texto })
      expect(r.ok).toBe(false)
      if (!r.ok) { expect(r.status).toBe(400); expect(r.error).toBe('Escribí qué fue lo que no funcionó.') }
    }
  })

  it('un texto largo cae con el mensaje amigable, no con un error de zod', () => {
    const r = validarNuevoFeedback({ texto: 'a'.repeat(TOPE_TEXTO_API + 500) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('no puede pasar de 2000 caracteres')
  })

  it('basura absoluta (sin texto, o texto que no es string) → 400', () => {
    expect(validarNuevoFeedback({}).ok).toBe(false)
    expect(validarNuevoFeedback({ texto: 42 }).ok).toBe(false)
    expect(validarNuevoFeedback(null).ok).toBe(false)
  })
})

describe('validarResponderFeedback — el body del equipo', () => {
  it('marcar visto no necesita respuesta', () => {
    expect(validarResponderFeedback({ accion: 'visto' })).toEqual({ ok: true, data: { accion: 'visto', respuesta: '' } })
  })

  it('responder sin texto → 400 (el partner vería una respuesta vacía)', () => {
    const r = validarResponderFeedback({ accion: 'responder', respuesta: '  ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('Escribí la respuesta: el partner la va a ver.')
  })

  it('responder recorta la respuesta', () => {
    expect(validarResponderFeedback({ accion: 'responder', respuesta: ' ya está arreglado ' }))
      .toEqual({ ok: true, data: { accion: 'responder', respuesta: 'ya está arreglado' } })
  })

  it('una acción inventada no pasa', () => {
    expect(validarResponderFeedback({ accion: 'borrar' }).ok).toBe(false)
    expect(validarResponderFeedback({}).ok).toBe(false)
  })
})

describe('mapFilaToComentario — la fila cruda al contrato', () => {
  it('mapea todas las columnas', () => {
    expect(mapFilaToComentario({
      id: 'u1', partner_email: 'ops@planir.uy', partner_name: 'Leo', partner_role: 'depot',
      partner_filter: 'PLANIR', texto: 'no me dejó marcar el retiro',
      contexto: { pantalla: 'HOY del depósito', ref: 'A8121', movil: true },
      estado: 'respondido', respuesta: 'ya está', respondido_por: 'bridvanovich@twf.uy',
      respondido_at: '2026-09-04T15:00:00+00:00', created_at: '2026-09-04T12:00:00+00:00',
    })).toEqual({
      id: 'u1', partnerEmail: 'ops@planir.uy', partnerName: 'Leo', partnerRole: 'depot',
      partnerFilter: 'PLANIR', texto: 'no me dejó marcar el retiro',
      contexto: { pantalla: 'HOY del depósito', ruta: '', ref: 'A8121', navegador: '', viewport: '', movil: true },
      estado: 'respondido', respuesta: 'ya está', respondidoPor: 'bridvanovich@twf.uy',
      respondidoAt: '2026-09-04T15:00:00+00:00', createdAt: '2026-09-04T12:00:00+00:00',
    })
  })

  it('tolera nulos: contexto vacío, respuesta en blanco y respondidoAt null', () => {
    const c = mapFilaToComentario({ id: 'u2', partner_role: 'transport', texto: 'x', created_at: 't' })
    expect(c.contexto).toEqual(CONTEXTO_VACIO)
    expect(c.respuesta).toBe('')
    expect(c.respondidoPor).toBe('')
    expect(c.respondidoAt).toBeNull()
    expect(c.estado).toBe('nuevo')
  })
})

// ── Los dos caminos, la misma respuesta ──────────────────────────────────

describe('la copia de la API responde igual que el contrato', () => {
  const textos: unknown[] = [
    '', '   ', '\n\t', null, undefined, 0, 42, {}, [],
    'ok', '  con bordes  ', 'á'.repeat(50),
    'a'.repeat(TOPE_TEXTO_API - 1), 'a'.repeat(TOPE_TEXTO_API), 'a'.repeat(TOPE_TEXTO_API + 1),
    `  ${'a'.repeat(TOPE_TEXTO_API)}  `,
  ]

  it('validarTexto: misma respuesta en toda la lista de casos borde', () => {
    for (const t of textos) expect(validarTextoAPI(t)).toEqual(validarTexto(t))
    expect(textos.length).toBe(16)
  })

  it('validarRespuesta: ídem', () => {
    for (const t of textos) expect(validarRespuestaAPI(t)).toEqual(validarRespuesta(t))
  })

  it('estadoTrasAccion y cambiaEstado: misma tabla de transiciones', () => {
    const estados: FeedbackEstado[] = ['nuevo', 'leido', 'respondido']
    const acciones: FeedbackAccion[] = ['visto', 'responder']
    let casos = 0
    for (const e of estados) {
      for (const a of acciones) {
        expect(estadoTrasAccionAPI(e, a)).toBe(estadoTrasAccion(e, a))
        expect(cambiaEstadoAPI(e, a)).toBe(cambiaEstado(e, a))
        casos++
      }
    }
    expect(casos).toBe(6)
  })

  it('sanearContexto: mismo saneo sobre toda la matriz de contextos posibles', () => {
    const pantallas = ['', ' HOY del depósito ', 'x'.repeat(400)]
    const refs = ['', ' a8121 ', 'X'.repeat(80)]
    const moviles: unknown[] = [true, false, 'sí', 1, undefined]
    const extras: unknown[] = [undefined, { token: 'secreto' }, { ruta: '/depot', navegador: 'Chrome en Android', viewport: '390×844' }]
    let casos = 0
    for (const pantalla of pantallas) {
      for (const ref of refs) {
        for (const movil of moviles) {
          for (const extra of extras) {
            const raw = { pantalla, ref, movil, ...(extra as object) }
            expect(sanearContextoAPI(raw)).toEqual(sanearContexto(raw))
            casos++
          }
        }
      }
    }
    // y los no-objetos, que son los que más rompen
    for (const raw of [undefined, null, 'texto', 7, [1, 2]]) {
      expect(sanearContextoAPI(raw)).toEqual(sanearContexto(raw))
      casos++
    }
    expect(casos).toBe(3 * 3 * 5 * 3 + 5)
  })

  it('lo que arma el cliente sobrevive INTACTO al saneo del servidor', () => {
    const casos = [
      { pantalla: 'HOY del depósito', ruta: '/depot', ref: 'a8121', ua: 'Mozilla/5.0 (Linux; Android 14) Chrome/128 Mobile Safari/537.36', ancho: 390, alto: 844 },
      { pantalla: 'HOY del transporte', ruta: '/transport', ancho: 1440, alto: 900, ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/128 Safari/537.36' },
      { pantalla: 'x'.repeat(500), ref: 'z'.repeat(90), ancho: 0, alto: 0 },
      {},
    ]
    for (const e of casos) {
      const armado = armarContexto(e)
      expect(sanearContextoAPI(armado)).toEqual(armado)
    }
  })
})
