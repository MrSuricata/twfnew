/**
 * El bloque LIBRE + "Devuelto" compartido por el panel (ViabilityBlock) y el
 * modal rápido (ContainerQuickEdit). Antes estaba duplicado: lo que se rompa
 * acá se rompe en los dos lugares, así que el contrato se fija en tests.
 *
 * Render estático (react-dom/server), igual que PanelCard.test.ts: el repo no
 * tiene jsdom.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const { toastSuccess } = vi.hoisted(() => ({ toastSuccess: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: toastSuccess } }))

import LibreDevueltoBlock, {
  BotonDevuelto, toggleLibreDevuelto, CLASE_LIBRE_DEVUELTO,
} from './LibreDevueltoBlock'

beforeEach(() => { toastSuccess.mockReset() })

describe('toggleLibreDevuelto — el toggle y su toast, iguales en los dos lugares', () => {
  it('con una fecha: guarda DEVUELTO y ofrece deshacer restaurando la fecha exacta', async () => {
    const commit = vi.fn()
    await toggleLibreDevuelto('2026-09-10', commit)
    expect(commit).toHaveBeenCalledWith('DEVUELTO')
    expect(toastSuccess).toHaveBeenCalledTimes(1)
    const [texto, opts] = toastSuccess.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }]
    expect(texto).toBe('Contenedor devuelto')
    expect(opts.action.label).toBe('Deshacer')
    opts.action.onClick()
    expect(commit).toHaveBeenLastCalledWith('2026-09-10')
  })

  it('sin LIBRE cargado: deshacer restaura el vacío, no inventa una fecha', async () => {
    const commit = vi.fn()
    await toggleLibreDevuelto('', commit)
    expect(commit).toHaveBeenCalledWith('DEVUELTO')
    const [, opts] = toastSuccess.mock.calls[0] as [string, { action: { onClick: () => void } }]
    opts.action.onClick()
    expect(commit).toHaveBeenLastCalledWith('')
  })

  it('ya devuelto: limpia LIBRE y NO muestra toast (el cambio se ve al instante)', async () => {
    const commit = vi.fn()
    await toggleLibreDevuelto('DEVUELTO', commit)
    expect(commit).toHaveBeenCalledWith('')
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('el toast espera al commit: si el guardado tarda, no se ofrece deshacer antes de tiempo', async () => {
    let resolver: () => void = () => {}
    const commit = vi.fn(() => new Promise<void>(res => { resolver = res }))
    const corriendo = toggleLibreDevuelto('2026-09-10', commit)
    expect(toastSuccess).not.toHaveBeenCalled()
    resolver()
    await corriendo
    expect(toastSuccess).toHaveBeenCalledTimes(1)
  })

  it('si el commit falla, la promesa rechaza y no hay toast de "devuelto"', async () => {
    const commit = vi.fn(() => Promise.reject(new Error('patch falló')))
    await expect(toggleLibreDevuelto('2026-09-10', commit)).rejects.toThrow('patch falló')
    expect(toastSuccess).not.toHaveBeenCalled()
  })
})

describe('BotonDevuelto — el mismo botón en el panel y en el modal', () => {
  const boton = (props: Record<string, unknown>) =>
    renderToStaticMarkup(h(BotonDevuelto, { devuelto: false, habilitado: true, onToggle: () => {}, ...props }))

  it('sin devolver: dice "Devuelto" y explica qué va a hacer', () => {
    const html = boton({})
    expect(html).toContain('Devuelto')
    expect(html).not.toContain('Deshacer devuelto')
    expect(html).toContain('LIBRE = DEVUELTO')
    expect(html).not.toContain('disabled=')
  })

  it('ya devuelto: pasa a "Deshacer devuelto"', () => {
    const html = boton({ devuelto: true })
    expect(html).toContain('Deshacer devuelto')
    expect(html).toContain('LIBRE queda vacío')
  })

  it('sin permiso: deshabilitado y con el motivo que le pasa cada llamador', () => {
    const html = boton({ habilitado: false, tituloSoloLectura: 'Solo lectura (viene de la planilla)' })
    expect(html).toContain('disabled=')
    expect(html).toContain('Solo lectura (viene de la planilla)')
  })
})

describe('LibreDevueltoBlock — la fila del modal', () => {
  const fila = (props: Record<string, unknown>) =>
    renderToStaticMarkup(h(LibreDevueltoBlock, { libre: '', habilitado: true, onToggle: () => {}, ...props }))

  it('muestra la fecha guardada en dd/MM/yyyy', () => {
    const html = fila({ libre: '2026-09-10' })
    expect(html).toContain('10/09/2026')
    expect(html).toContain('Libre (máx. devolución)')
  })

  it('sin LIBRE guardado cae al calculado (solo display)', () => {
    expect(fila({ libre: '', respaldo: '2026-10-01' })).toContain('01/10/2026')
  })

  it('devuelto: el valor va teñido y el botón ofrece deshacer', () => {
    const html = fila({ libre: 'DEVUELTO' })
    expect(html).toContain(CLASE_LIBRE_DEVUELTO)
    expect(html).toContain('DEVUELTO')
    expect(html).toContain('Deshacer devuelto')
  })

  it('sin nada: raya, sin inventar fechas', () => {
    expect(fila({})).toContain('—')
  })
})
