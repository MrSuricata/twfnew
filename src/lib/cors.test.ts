import { describe, it, expect, afterEach } from 'vitest'
import { allowedOrigins, pickOrigin } from '../../api/_lib/cors'

const original = process.env.ALLOWED_ORIGIN
afterEach(() => {
  if (original === undefined) delete process.env.ALLOWED_ORIGIN
  else process.env.ALLOWED_ORIGIN = original
})

describe('allowedOrigins — la lista de la env var', () => {
  it('sin la variable cae en el default restrictivo, nunca en *', () => {
    delete process.env.ALLOWED_ORIGIN
    expect(allowedOrigins()).toEqual(['https://twf.uy'])
  })

  it('acepta varios separados por coma, con espacios de más', () => {
    process.env.ALLOWED_ORIGIN = 'https://a.com , https://b.com'
    expect(allowedOrigins()).toEqual(['https://a.com', 'https://b.com'])
  })

  it('descarta entradas vacías de una coma colgada', () => {
    process.env.ALLOWED_ORIGIN = 'https://a.com,,'
    expect(allowedOrigins()).toEqual(['https://a.com'])
  })
})

describe('pickOrigin — qué origen se devuelve', () => {
  it('durante la mudanza, el dominio nuevo y el viejo funcionan los dos', () => {
    process.env.ALLOWED_ORIGIN = 'https://mediterraneacarghas.ar,https://mediterraneacarghas.vercel.app'
    expect(pickOrigin('https://mediterraneacarghas.ar')).toBe('https://mediterraneacarghas.ar')
    expect(pickOrigin('https://mediterraneacarghas.vercel.app')).toBe('https://mediterraneacarghas.vercel.app')
  })

  it('un origen ajeno NO se refleja: se devuelve el primero de la lista', () => {
    process.env.ALLOWED_ORIGIN = 'https://a.com,https://b.com'
    expect(pickOrigin('https://evil.com')).toBe('https://a.com')
  })

  it('sin header Origin devuelve el primero, no undefined', () => {
    process.env.ALLOWED_ORIGIN = 'https://a.com,https://b.com'
    expect(pickOrigin(undefined)).toBe('https://a.com')
  })

  it('nunca devuelve el comodín, ni con la variable vacía', () => {
    process.env.ALLOWED_ORIGIN = ''
    expect(pickOrigin('https://evil.com')).not.toBe('*')
  })
})
