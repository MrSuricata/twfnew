import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Toda ruta conocida de la app tiene que tener su rewrite en vercel.json.
 *
 * En desarrollo Vite sirve index.html para CUALQUIER path, así que una ruta
 * nueva anda perfecto en local y recién explota en producción con un 404 de
 * Vercel — que además no parece un bug de la app, parece que la página no
 * existe. Pasó al estrenar /deposito (18/08/2026).
 *
 * El test lee App.tsx como TEXTO a propósito: importarlo arrastraría toda la
 * app (JSX, window, fetch) a un test de entorno node. Es feo pero es barato y
 * agarra exactamente el error que importa.
 */

const raiz = resolve(__dirname, '../..')
const leer = (rel: string) => readFileSync(resolve(raiz, rel), 'utf8')

/** Paths declarados en KNOWN_PATHS de App.tsx. */
function rutasConocidas(): string[] {
  const src = leer('src/App.tsx')
  const m = /const KNOWN_PATHS = new Set\(\[([^\]]*)\]\)/.exec(src)
  if (!m) throw new Error('No se encontró KNOWN_PATHS en src/App.tsx — ¿le cambiaron el nombre?')
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])
}

/** Sources de los rewrites de vercel.json. */
function rewrites(): string[] {
  const cfg = JSON.parse(leer('vercel.json')) as { rewrites?: { source: string }[] }
  return (cfg.rewrites || []).map(r => r.source)
}

describe('rutas de la app ↔ rewrites de Vercel', () => {
  it('encuentra las rutas conocidas', () => {
    const rutas = rutasConocidas()
    expect(rutas.length).toBeGreaterThan(5)
    expect(rutas).toContain('/admin')
  })

  it('cada ruta conocida tiene su rewrite (si no, 404 en producción)', () => {
    const declaradas = rewrites()
    // '/' lo sirve el index directamente: no necesita rewrite.
    const faltantes = rutasConocidas().filter(r => r !== '/' && !declaradas.includes(r))
    expect(faltantes, `Falta el rewrite en vercel.json de: ${faltantes.join(', ')}`).toEqual([])
  })

  it('/deposito y /mirendimiento están, que son las que se entran tipeando', () => {
    // Las rutas sin link desde la barra son las más fáciles de olvidar.
    const declaradas = rewrites()
    expect(declaradas).toContain('/deposito')
    expect(declaradas).toContain('/mirendimiento')
  })

  it('no hay rewrites de rutas que la app no conoce (quedarían en not-found)', () => {
    const rutas = new Set(rutasConocidas())
    const huerfanos = rewrites().filter(s => !s.includes('(') && !rutas.has(s))
    expect(huerfanos, `Rewrite sin ruta en la app: ${huerfanos.join(', ')}`).toEqual([])
  })
})
