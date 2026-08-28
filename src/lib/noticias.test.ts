import { describe, it, expect } from 'vitest'
import { esVigente, noticiasVigentes, alertasVigentes, claveAlertas, rowToNoticia, categoriaMeta, type Noticia } from './noticias'

const HOY = '2026-08-28'

const noticia = (over: Partial<Noticia>): Noticia => ({
  id: 'n1', titulo: 'T', bajada: '', cuerpo: '', categoria: 'general',
  imagenUrl: '', alerta: false, activo: true, publicadaAt: '2026-08-28T10:00:00Z',
  vigenteHasta: '', ...over,
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
})
