import { describe, it, expect } from 'vitest'
import {
  buildRendimiento, esOperativaDeposito, fechaDeOperativa, depositosVisitados, textoParte,
  esAutorPropio, type CargaRendimiento,
} from './miRendimiento'
import type { RefCheckSteps } from './checksTypes'

const carga = (c: Partial<CargaRendimiento> = {}): CargaRendimiento => ({
  ref: 'A7938', cliente: 'TOMASELLI', deposito: 'GODILCO', operativa: 'TRASIEGO',
  cntr: 'CSLU6176200', eta: '2026-08-12', salida: '2026-08-20', pais: 'UY',
  mode: 'fcl', archived: false, ...c,
})

const hecho = (): { done: boolean; date: string; by: string } => ({ done: true, date: '2026-08-18', by: 'admin' })

const build = (
  cargas: CargaRendimiento[],
  checks: Record<string, RefCheckSteps> = {},
  fotos: string[] = [],
  informes: string[] = [],
  identidades?: string[],
) =>
  buildRendimiento({
    cargas,
    checksByRef: new Map(Object.entries(checks)),
    refsConFotos: new Set(fotos),
    refsConInforme: new Set(informes),
    desde: '2026-08-17', hasta: '2026-08-23',
    identidades,
  })

/** Aviso por contenedor, como lo guarda HOY. */
const avisoCntrs = (map: Record<string, string>) => ({
  done: true,
  cntrs: Object.fromEntries(Object.entries(map).map(([c, by]) => [c, { done: true, date: '2026-08-18', by }])),
})

describe('esOperativaDeposito — qué entra al parte', () => {
  it('entran trasiegos y cargas a piso por Uruguay', () => {
    expect(esOperativaDeposito(carga())).toBe(true)
    expect(esOperativaDeposito(carga({ operativa: 'CARGA A PISO' }))).toBe(true)
    expect(esOperativaDeposito(carga({ operativa: 'carga a piso' }))).toBe(true)
  })

  it('el retiro directo NO pasa por depósito: no cuenta', () => {
    expect(esOperativaDeposito(carga({ operativa: 'CONTENEDOR' }))).toBe(false)
  })

  it('quedan afuera archivadas, no marítimas y las que no van por Uruguay', () => {
    expect(esOperativaDeposito(carga({ archived: true }))).toBe(false)
    expect(esOperativaDeposito(carga({ mode: 'air' }))).toBe(false)
    expect(esOperativaDeposito(carga({ pais: 'CL' }))).toBe(false)
    expect(esOperativaDeposito(carga({ operativa: '' }))).toBe(false)
  })
})

describe('fechaDeOperativa', () => {
  it('manda la salida; sin salida, la llegada', () => {
    expect(fechaDeOperativa(carga())).toBe('2026-08-20')
    expect(fechaDeOperativa(carga({ salida: '' }))).toBe('2026-08-12')
  })

  it('la columna SALIDA trae texto, no solo fechas: cae a la llegada', () => {
    // Valores REALES de producción — son truthy y sin este guard la carga
    // desaparecía del parte justo cuando está parada en depósito.
    expect(fechaDeOperativa(carga({ salida: 'CONFIRMAR' }))).toBe('2026-08-12')
    expect(fechaDeOperativa(carga({ salida: '#N/A' }))).toBe('2026-08-12')
  })

  it('la carga con SALIDA a confirmar igual entra al parte', () => {
    const r = build([carga({ ref: 'A8100', salida: 'CONFIRMAR', eta: '2026-08-19' })])
    expect(r.total).toBe(1)
  })
})

describe('esAutorPropio — de quién es el trabajo', () => {
  const yo = ['bridvanovich@twf.uy', 'bridvanovich']

  it('lo mío cuenta, con cualquiera de mis identidades', () => {
    expect(esAutorPropio('bridvanovich@twf.uy', yo)).toBe(true)
    expect(esAutorPropio('BRIDVANOVICH', yo)).toBe(true)
  })

  it('lo de otro NO cuenta', () => {
    expect(esAutorPropio('jdornheim@mediterraneacarghas.com.ar', yo)).toBe(false)
  })

  it('lo del usuario compartido y lo importado sí: no se le puede atribuir a nadie', () => {
    expect(esAutorPropio('admin', yo)).toBe(true)
    expect(esAutorPropio('planilla', yo)).toBe(true)
    expect(esAutorPropio('', yo)).toBe(true)
    expect(esAutorPropio(undefined, yo)).toBe(true)
  })

  it('sin identidades no filtra nada', () => {
    expect(esAutorPropio('jdornheim@mediterraneacarghas.com.ar', [])).toBe(true)
  })
})

describe('buildRendimiento — las cinco señales por operativa', () => {
  it('cuenta cada señal y el denominador sale de las cargas', () => {
    const r = build(
      [carga({ ref: 'A7938' }), carga({ ref: 'A8000', deposito: 'GODILCO' }), carga({ ref: 'A7994', deposito: 'PLANIR' })],
      {
        A7938: { visita_deposito: hecho(), aviso_traslado: hecho(), aviso_salida: hecho() },
        A8000: { aviso_traslado: hecho() },
      },
      ['A7938'],
      ['A7938'],
    )
    expect(r.total).toBe(3)
    expect(r.visitas).toBe(1)
    expect(r.traslados).toBe(2)
    expect(r.salidas).toBe(1)
    expect(r.informes).toBe(1)
    expect(r.fotos).toBe(1)
    // La que no tiene ninguna señal se cuenta aparte
    expect(r.sinNada).toBe(1)
  })

  it('las fotos de Uruguay valen como visita, aunque no se haya tildado', () => {
    const r = build([carga({ ref: 'A8000' })], {}, ['A8000'])
    expect(r.filas[0].visita).toBe(true)
    expect(r.filas[0].visitaConfirmada).toBe(true)
  })

  it('el tilde sin fotos es visita DECLARADA, no confirmada', () => {
    const r = build([carga({ ref: 'A8000' })], { A8000: { visita_deposito: hecho() } })
    expect(r.filas[0].visita).toBe(true)
    expect(r.filas[0].visitaConfirmada).toBe(false)
    expect(r.visitas).toBe(1)
    expect(r.visitasConfirmadas).toBe(0)
  })

  it('respeta el período: lo de otra semana no entra', () => {
    const r = build([carga({ ref: 'VIEJA', salida: '2026-07-01' }), carga({ ref: 'DENTRO' })])
    expect(r.filas.map(f => f.ref)).toEqual(['DENTRO'])
  })

  it('ordena por fecha, lo más reciente arriba', () => {
    const r = build([
      carga({ ref: 'B', salida: '2026-08-18' }),
      carga({ ref: 'A', salida: '2026-08-22' }),
    ])
    expect(r.filas.map(f => f.ref)).toEqual(['A', 'B'])
  })

  it('el aviso cuenta hecho solo con TODOS los contenedores', () => {
    const dos = carga({ ref: 'A8068', cntr: 'CSLU6176200, MSCU7654321' })
    const parcial = build([dos], { A8068: { aviso_salida: avisoCntrs({ CSLU6176200: 'admin' }) } })
    expect(parcial.filas[0].avisoSalida).toBe(false)
    expect(parcial.filas[0].avisoSalidaParcial).toBe(true)
    expect(parcial.salidas).toBe(0)

    const todos = build([dos], {
      A8068: { aviso_salida: avisoCntrs({ CSLU6176200: 'admin', MSCU7654321: 'admin' }) },
    })
    expect(todos.filas[0].avisoSalida).toBe(true)
    expect(todos.filas[0].avisoSalidaParcial).toBe(false)
    expect(todos.salidas).toBe(1)
  })

  it('el contenedor que avisó otra persona no me lo cuento', () => {
    const dos = carga({ ref: 'A8068', cntr: 'CSLU6176200, MSCU7654321' })
    const r = build([dos], {
      A8068: { aviso_salida: avisoCntrs({ CSLU6176200: 'bridvanovich@twf.uy', MSCU7654321: 'jdornheim@mediterraneacarghas.com.ar' }) },
    }, [], [], ['bridvanovich@twf.uy'])
    expect(r.filas[0].avisoSalida).toBe(false)
    expect(r.filas[0].avisoSalidaParcial).toBe(true)
  })

  it('la visita tildada por otro no cuenta como mía', () => {
    const ajena = { done: true, date: '2026-08-18', by: 'jdornheim@mediterraneacarghas.com.ar' }
    const r = build([carga({ ref: 'A8000' })], { A8000: { visita_deposito: ajena } }, [], [], ['bridvanovich@twf.uy'])
    expect(r.visitas).toBe(0)
  })

  it('la misma ref repetida (cache + DB) no infla el denominador', () => {
    const r = build([carga({ ref: 'A7938' }), carga({ ref: 'a7938 ' })])
    expect(r.total).toBe(1)
  })

  it('matchea la ref aunque venga con espacios o minúsculas', () => {
    const r = build([carga({ ref: 'a8068 a' })], { 'A8068 A': { aviso_salida: hecho() } })
    expect(r.salidas).toBe(1)
  })
})

describe('depositosVisitados', () => {
  it('agrupa las visitas por depósito, el más visitado primero', () => {
    const r = build(
      [carga({ ref: 'A1', deposito: 'GODILCO' }), carga({ ref: 'A2', deposito: 'GODILCO' }), carga({ ref: 'A3', deposito: 'PLANIR' })],
      {}, ['A1', 'A2', 'A3'],
    )
    expect(depositosVisitados(r)).toEqual([
      { deposito: 'GODILCO', refs: ['A1', 'A2'] },
      { deposito: 'PLANIR', refs: ['A3'] },
    ])
  })
})

describe('textoParte — muestra lo hecho Y lo que falta', () => {
  it('arma el parte con fracciones y lista los pendientes', () => {
    const r = build(
      [carga({ ref: 'A7938' }), carga({ ref: 'A8000' })],
      { A7938: { visita_deposito: hecho(), aviso_traslado: hecho(), aviso_salida: hecho() } },
      ['A7938'],
    )
    const t = textoParte(r, '2026-08-17', '2026-08-23')
    expect(t).toContain('2 operativas por depósito')
    expect(t).toContain('Traslado avisado al cliente: 1/2')
    // Lo pendiente NO se esconde
    expect(t).toContain('Pendientes: A7938, A8000')
  })

  it('la visita declarada no se cuenta como confirmada', () => {
    // Tilde sin fotos: el parte dice 0 confirmadas y aclara la declarada.
    const r = build([carga({ ref: 'A7938' })], { A7938: { visita_deposito: hecho() } })
    const t = textoParte(r, '2026-08-17', '2026-08-23')
    expect(t).toContain('Fui al depósito: 0/1 confirmadas con fotos (+1 declaradas)')
  })

  it('la línea de pendientes mira las CINCO señales, no solo los avisos', () => {
    // Avisos hechos pero sin fotos ni informe: sigue siendo pendiente.
    const r = build([carga({ ref: 'A7938' })], { A7938: { aviso_traslado: hecho(), aviso_salida: hecho() } })
    expect(textoParte(r, '2026-08-17', '2026-08-23')).toContain('Pendientes: A7938')
  })

  it('sin pendientes no inventa la línea', () => {
    const r = build(
      [carga({ ref: 'A7938' })],
      { A7938: { visita_deposito: hecho(), aviso_traslado: hecho(), aviso_salida: hecho() } },
      ['A7938'], ['A7938'],
    )
    expect(textoParte(r, '2026-08-17', '2026-08-23')).not.toContain('Pendientes')
  })
})
