import { describe, it, expect } from 'vitest'
import {
  esVigente, noticiasVigentes, alertasVigentes, claveAlertas, rowToNoticia, categoriaMeta,
  estiloSlide, tituloPartes, tituloPlano, linkNoticia, ordenSlides, recencia, type Noticia,
} from './noticias'

const HOY = '2026-08-28'

const noticia = (over: Partial<Noticia>): Noticia => ({
  id: 'n1', titulo: 'T', bajada: '', cuerpo: '', categoria: 'general',
  imagenUrl: '', alerta: false, activo: true, publicadaAt: '2026-08-28T10:00:00Z',
  vigenteHasta: '', estilo: '', kicker: '', kickerExtra: '', subtitulo: '',
  mensaje: '', linkUrl: '', ...over,
})

describe('vigencia — la portada nunca muestra notas viejas', () => {
  it('activa sin vencimiento: vigente', () => {
    expect(esVigente(noticia({}), HOY)).toBe(true)
  })
  it('vence HOY inclusive; mañana ya no', () => {
    expect(esVigente(noticia({ vigenteHasta: '2026-08-28' }), HOY)).toBe(true)
    expect(esVigente(noticia({ vigenteHasta: '2026-08-27' }), HOY)).toBe(false)
  })
  it('inactiva nunca', () => {
    expect(esVigente(noticia({ activo: false }), HOY)).toBe(false)
  })
  it('ordena por publicación, más nueva primero', () => {
    const out = noticiasVigentes([
      noticia({ id: 'vieja', publicadaAt: '2026-08-20T09:00:00Z' }),
      noticia({ id: 'nueva', publicadaAt: '2026-08-28T09:00:00Z' }),
      noticia({ id: 'vencida', vigenteHasta: '2026-08-01' }),
    ], HOY)
    expect(out.map(n => n.id)).toEqual(['nueva', 'vieja'])
  })
  it('una nota ACTUALIZADA hoy sube, aunque se haya publicado antes (Brian 02/09)', () => {
    const out = noticiasVigentes([
      noticia({ id: 'nueva', publicadaAt: '2026-08-28T09:00:00Z' }),
      noticia({ id: 'vieja-actualizada', publicadaAt: '2026-08-20T09:00:00Z', actualizadaAt: '2026-08-28T18:00:00Z' }),
    ], HOY)
    expect(out.map(n => n.id)).toEqual(['vieja-actualizada', 'nueva'])
  })
  it('sin fecha de edición manda la de publicación', () => {
    expect(recencia({ publicadaAt: '2026-08-20T09:00:00Z', actualizadaAt: '' })).toBe('2026-08-20T09:00:00Z')
    expect(recencia({ publicadaAt: '2026-08-20T09:00:00Z', actualizadaAt: '2026-08-01T09:00:00Z' })).toBe('2026-08-20T09:00:00Z')
  })
})

describe('alertas del día (1×/día por navegador)', () => {
  it('solo las vigentes marcadas como alerta', () => {
    const out = alertasVigentes([
      noticia({ id: 'a', alerta: true }),
      noticia({ id: 'b', alerta: false }),
      noticia({ id: 'c', alerta: true, vigenteHasta: '2026-08-01' }),
    ], HOY)
    expect(out.map(n => n.id)).toEqual(['a'])
  })
  it('la clave cambia si cambia el día o el set de alertas → se vuelve a mostrar', () => {
    const a = [{ id: 'x' }], b = [{ id: 'x' }, { id: 'y' }]
    expect(claveAlertas('2026-08-28', a)).not.toBe(claveAlertas('2026-08-29', a))
    expect(claveAlertas('2026-08-28', a)).not.toBe(claveAlertas('2026-08-28', b))
    expect(claveAlertas('2026-08-28', [{ id: 'y' }, { id: 'x' }])).toBe(claveAlertas('2026-08-28', b))
  })
})

describe('rowToNoticia y categorías', () => {
  it('mapea snake_case y defaults', () => {
    const n = rowToNoticia({ id: '1', titulo: 'T', imagen_url: 'u', publicada_at: 'p', vigente_hasta: '', alerta: 1, activo: true })
    expect(n.imagenUrl).toBe('u')
    expect(n.alerta).toBe(true)
    expect(n.categoria).toBe('general')
  })
  it('categoría desconocida cae a general (nunca rompe el chip)', () => {
    expect(categoriaMeta('lo-que-sea').label).toBe('Interés general')
    expect(categoriaMeta('tifones').label).toContain('Tifones')
  })
  it('mapea los campos del slide (snake_case)', () => {
    const n = rowToNoticia({
      id: '1', titulo: 'T', estilo: 'papel', kicker: 'Aviso', kicker_extra: 'China',
      subtitulo: 'S', mensaje: 'M', link_url: 'https://x.com/nota',
    })
    expect(n.estilo).toBe('papel')
    expect(n.kickerExtra).toBe('China')
    expect(n.linkUrl).toBe('https://x.com/nota')
  })
})

describe('carrusel de portada', () => {
  it('estilo elegido a mano manda; si no, el de la categoría', () => {
    expect(estiloSlide(noticia({ estilo: 'actualizacion', categoria: 'tifones' }))).toBe('actualizacion')
    expect(estiloSlide(noticia({ categoria: 'tifones' }))).toBe('violeta')
    expect(estiloSlide(noticia({ categoria: 'feriados' }))).toBe('papel')
    expect(estiloSlide(noticia({ categoria: 'general' }))).toBe('celeste')
    expect(estiloSlide(noticia({ estilo: 'cualquiera', categoria: 'paros' }))).toBe('celeste')
  })
  it('la barra del título corta en dos líneas; tituloPlano la saca para las listas', () => {
    expect(tituloPartes('Tifones en China:|cierres portuarios')).toEqual(['Tifones en China:', 'cierres portuarios'])
    expect(tituloPartes('Sin barra')).toEqual(['Sin barra', ''])
    expect(tituloPlano('China cerrada|del 1 al 7 de octubre')).toBe('China cerrada del 1 al 7 de octubre')
  })
  it('los avisos abren el carrusel y el resto va cronológico', () => {
    const vigentes = [   // como los devuelve noticiasVigentes: más nueva primero
      noticia({ id: 'aviso-nuevo', alerta: true }),
      noticia({ id: 'nota-c' }),
      noticia({ id: 'aviso-viejo', alerta: true }),
      noticia({ id: 'nota-b' }),
      noticia({ id: 'nota-a' }),
    ]
    expect(ordenSlides(vigentes).map(n => n.id))
      .toEqual(['aviso-nuevo', 'aviso-viejo', 'nota-c', 'nota-b', 'nota-a'])
  })
  it('corta en los 6 más recientes antes de ordenar', () => {
    const muchas = Array.from({ length: 9 }, (_, i) => noticia({ id: `n${i}` }))
    expect(ordenSlides(muchas)).toHaveLength(6)
  })
  it('"Ir a la noticia" solo navega a http(s); cualquier otra cosa cae en /novedades', () => {
    expect(linkNoticia(noticia({ linkUrl: 'https://lanacion.com.ar/x' }))).toEqual({ href: 'https://lanacion.com.ar/x', externo: true })
    expect(linkNoticia(noticia({ linkUrl: '' }))).toEqual({ href: '/novedades', externo: false })
    // eslint-disable-next-line no-script-url
    expect(linkNoticia(noticia({ linkUrl: 'javascript:alert(1)' })).href).toBe('/novedades')
  })
})
