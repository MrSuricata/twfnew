/**
 * Las cards de HOY, fijadas donde importa: **plegada sigue avisando**.
 *
 * La regla de Brian es que plegar una card no puede esconder lo urgente. Si
 * alguien "simplifica" el header y se lleva puesto el contador o los chips, la
 * card pasa a mentir: se ve tranquila con tres LIBRE vencidos adentro. Eso es
 * lo que estos tests no dejan pasar.
 *
 * Render estático (`renderToStaticMarkup`), como PanelCard.test.ts: el repo no
 * tiene testing-library ni entorno DOM (vitest corre en `node` e incluye solo
 * `*.test.ts`). Para el toggle no hace falta: `CardHoy` no usa hooks, así que
 * se lo llama como función y se revisa el `onToggle` que le pasa al panel.
 */
import { describe, it, expect, vi } from 'vitest'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import CardHoy, { ChipUrgente, CuerpoCardHoy, chipsHeader } from './CardHoy'
import { CARDS_HOY_FCL, IDS_CARDS_HOY_FCL, cardHoy, type CardHoyId } from '@/lib/hoyCards'
import type { CardsPlegadas } from '@/lib/cardsPlegadas'

const FILA = 'FILA-ADENTRO'

/** Un `CardsPlegadas` de mentira que dice siempre lo mismo y anota los toques. */
function plegadasStub(abierta: boolean) {
  const toggle = vi.fn()
  const estaAbierta = vi.fn(() => abierta)
  return { plegadas: { estaAbierta, toggle } as CardsPlegadas, toggle, estaAbierta }
}

/** La card de LIBRE (tono alerta) con 7 adentro y 3 vencidos en el header. */
const libre = (abierta: boolean, extra: Record<string, unknown> = {}) => {
  const { plegadas, toggle, estaAbierta } = plegadasStub(abierta)
  const html = renderToStaticMarkup(h(CardHoy, {
    id: 'libre-critico',
    plegadas,
    icono: h('i'),
    contador: 7,
    extras: chipsHeader(h(ChipUrgente, { tono: 'alerta', key: 'v', children: '3 vencidos' })),
    children: h(CuerpoCardHoy, null, h('p', null, FILA)),
    ...extra,
  }))
  return { html, toggle, estaAbierta }
}

describe('CardHoy — plegada sigue avisando (regla de Brian)', () => {
  it('plegada: esconde el cuerpo pero deja el título, el contador y los chips', () => {
    const { html } = libre(false)
    expect(html).not.toContain(FILA)
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('LIBRE vencido / crítico')
    expect(html).toContain('>7<')
    expect(html).toContain('3 vencidos')
  })

  it('abierta: el cuerpo se ve y el header sigue igual', () => {
    const { html } = libre(true)
    expect(html).toContain(FILA)
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('>7<')
    expect(html).toContain('3 vencidos')
  })

  it('los chips van entre el título y el contador, dentro del único botón del header', () => {
    const { html } = libre(false)
    expect(html.indexOf('LIBRE vencido / crítico')).toBeLessThan(html.indexOf('3 vencidos'))
    expect(html.indexOf('3 vencidos')).toBeLessThan(html.indexOf('>7<'))
    // Un botón adentro de otro botón no es HTML válido: los extras son spans.
    expect(html.match(/<button/g)?.length).toBe(1)
  })

  it('el título y el tono salen de la definición, no del JSX de la card', () => {
    const { html } = libre(false)
    // tono alerta bajo TWF = la escala roja; nada de hex escritos a mano.
    expect(html).toContain('bg-red-500')
    expect(html).not.toMatch(/--bar-color|#[0-9a-fA-F]{6}/)
  })

  it('el subtítulo fijo de la definición se usa, y se puede pisar con datos', () => {
    expect(renderToStaticMarkup(h(CardHoy, {
      id: 'saliendo-hoy', plegadas: plegadasStub(true).plegadas, icono: h('i'), children: h('p'),
    }))).toContain('Camiones saliendo de Uruguay')

    const { html } = libre(true, { subtitulo: 'Próximos 8 días' })
    expect(html).toContain('Próximos 8 días')
  })
})

describe('CardHoy — el plegado lo decide el hook, no el panel', () => {
  const elemento = (abierta: boolean) => {
    const { plegadas, toggle, estaAbierta } = plegadasStub(abierta)
    const el = CardHoy({ id: 'libre-critico', plegadas, icono: h('i'), children: h('p') }) as ReactElement<{
      abierta: boolean
      onToggle: (abierta: boolean) => void
    }>
    return { el, toggle, estaAbierta }
  }

  it('pregunta por SU id y pasa la respuesta como estado controlado', () => {
    const { el, estaAbierta } = elemento(false)
    expect(estaAbierta).toHaveBeenCalledWith('libre-critico')
    expect(el.props.abierta).toBe(false)
  })

  it('tocar el header llama al toggle con el id de la card y el estado pedido', () => {
    const { el, toggle } = elemento(false)
    el.props.onToggle(true)
    expect(toggle).toHaveBeenCalledWith('libre-critico', true)

    const cerrando = elemento(true)
    cerrando.el.props.onToggle(false)
    expect(cerrando.toggle).toHaveBeenCalledWith('libre-critico', false)
  })
})

describe('chipsHeader — sin nada urgente no hay contenedor vacío', () => {
  it('devuelve undefined cuando ningún chip aplica', () => {
    expect(chipsHeader()).toBeUndefined()
    expect(chipsHeader(false, 0 > 0 && h('span'), undefined, null)).toBeUndefined()
  })

  it('descarta los falsy y conserva los que aplican', () => {
    const extras = chipsHeader(false, h(ChipUrgente, { tono: 'aviso', children: '2 sin avisar' }))
    expect(extras).toBeDefined()
    expect(renderToStaticMarkup(h('div', null, extras))).toContain('2 sin avisar')
  })

  it('sin extras el header no pinta el contenedor de chips', () => {
    const html = renderToStaticMarkup(h(CardHoy, {
      id: 'libre-critico', plegadas: plegadasStub(false).plegadas, icono: h('i'), contador: 7,
      extras: chipsHeader(false), children: h('p'),
    }))
    expect(html).not.toContain('justify-end')
  })
})

describe('CARDS_HOY_FCL — los ids son la memoria del operador', () => {
  it('las 8 cards de HOY FCL están definidas y sus ids son únicos', () => {
    expect(CARDS_HOY_FCL).toHaveLength(8)
    expect(new Set(IDS_CARDS_HOY_FCL).size).toBe(8)
  })

  it('cada id resuelve a su definición, con título y tono', () => {
    for (const id of IDS_CARDS_HOY_FCL) {
      const def = cardHoy(id)
      expect(def.id).toBe(id)
      expect(def.titulo.length).toBeGreaterThan(0)
      expect(['info', 'aviso', 'alerta', 'ok', 'neutro']).toContain(def.tono)
    }
  })

  it('un id que no existe es un bug de código, no un dato del usuario', () => {
    expect(() => cardHoy('inventada' as CardHoyId)).toThrow(/desconocida/)
  })
})
