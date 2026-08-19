import { describe, it, expect } from 'vitest'
import {
  buildRendimiento, esOperativaDeposito, fechaDeOperativa, depositosVisitados, textoParte,
  esAutorPropio, resumenMensual, ultimosMeses, type CargaRendimiento,
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
    // Una entrada con '|' es `REF|CNTR` (foto etiquetada); sin '|' es una ref
    // con fotos viejas sin contenedor asignado.
    fotosPorCntr: new Set(fotos.filter(f => f.includes('|'))),
    refsConFotosSinCntr: new Set(fotos.filter(f => !f.includes('|'))),
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

  it('las fotos NO cuentan como visita: las manda el depósito', () => {
    // Corrección de Brian (18/08). Antes esto daba visita=true e inflaba
    // justo el número que la página existe para defender.
    const r = build([carga({ ref: 'A8000' })], {}, ['A8000'])
    expect(r.filas[0].fotos).toBe(true)
    expect(r.filas[0].visita).toBe(false)
    expect(r.visitas).toBe(0)
    expect(r.fotos).toBe(1)
  })

  it('la visita es el tilde y nada más', () => {
    const r = build([carga({ ref: 'A8000' })], { A8000: { visita_deposito: hecho() } })
    expect(r.filas[0].visita).toBe(true)
    expect(r.visitas).toBe(1)
  })

  it('el informe implica fotos: van adentro del informe', () => {
    // Brian 18/08. Sin esto, una carga con informe figuraba "sin fotos".
    const r = build([carga({ ref: 'A8000' })], {}, [], ['A8000'])
    expect(r.filas[0].fotos).toBe(true)
    expect(r.filas[0].fotosSubidas).toBe(false)
    expect(r.fotos).toBe(1)
  })

  it('el informe se mide sobre las visitas, no sobre el total', () => {
    const r = build(
      [carga({ ref: 'FUI' }), carga({ ref: 'FUI2' }), carga({ ref: 'NOFUI' })],
      { FUI: { visita_deposito: hecho() }, FUI2: { visita_deposito: hecho() } },
      [], ['FUI'],
    )
    expect(r.total).toBe(3)
    expect(r.visitas).toBe(2)
    expect(r.informes).toBe(1)
    expect(r.informesDeVisitadas).toBe(1)   // 1 de las 2 a las que fue
    expect(r.visitasSinInforme).toBe(1)
  })

  it('informe sin visita se marca como anomalía, no como logro', () => {
    const r = build([carga({ ref: 'A8000' })], {}, [], ['A8000'])
    expect(r.filas[0].informe).toBe(true)
    expect(r.filas[0].informeSinVisita).toBe(true)
    expect(r.informesDeVisitadas).toBe(0)
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

  it('una carga de dos contenedores da DOS filas, una por contenedor', () => {
    // Cada contenedor sale en su propio camión y su propio día: se puede haber
    // ido a uno y al otro no (Brian 18/08).
    const dos = carga({ ref: 'A8025', cntr: 'EGSU0310260, EMCU1818703' })
    const r = build([dos])
    expect(r.filas).toHaveLength(2)
    expect(r.filas.map(f => f.cntr)).toEqual(['EGSU0310260', 'EMCU1818703'])
    expect(r.total).toBe(2)
  })

  it('el aviso de un contenedor no arrastra al otro', () => {
    const dos = carga({ ref: 'A8068', cntr: 'CSLU6176200, MSCU7654321' })
    const r = build([dos], { A8068: { aviso_salida: avisoCntrs({ CSLU6176200: 'admin' }) } })
    const avisado = r.filas.find(f => f.cntr === 'CSLU6176200')!
    const pendiente = r.filas.find(f => f.cntr === 'MSCU7654321')!
    expect(avisado.avisoSalida).toBe(true)
    expect(pendiente.avisoSalida).toBe(false)
    // El denominador ahora son contenedores: 1 de 2.
    expect(r.salidas).toBe(1)
    expect(r.total).toBe(2)
  })

  it('la visita marcada antes del cambio (nivel ref) sigue contando en todos', () => {
    // Sin mapa `cntrs`, avisoForCntr cae al flag de la ref: el historial de
    // tildes viejos no se pierde al pasar a filas por contenedor.
    const dos = carga({ ref: 'A8025', cntr: 'EGSU0310260, EMCU1818703' })
    const r = build([dos], { A8025: { visita_deposito: { done: true, date: '2026-08-18', by: 'admin' } } })
    expect(r.filas.every(f => f.visita)).toBe(true)
    expect(r.visitas).toBe(2)
  })

  it('la carga sin contenedor cargado da una sola fila', () => {
    const r = build([carga({ ref: 'A9000', cntr: '' })])
    expect(r.filas).toHaveLength(1)
    expect(r.filas[0].cntr).toBe('')
  })

  it('la foto etiquetada cuenta solo para SU contenedor', () => {
    const dos = carga({ ref: 'A8025', cntr: 'EGSU0310260, EMCU1818703' })
    const r = build([dos], {}, ['A8025|EMCU1818703'])
    expect(r.filas.find(f => f.cntr === 'EMCU1818703')!.fotosSubidas).toBe(true)
    expect(r.filas.find(f => f.cntr === 'EGSU0310260')!.fotosSubidas).toBe(false)
  })

  it('la foto vieja SIN contenedor cuenta para todos los de la ref', () => {
    // No se sabe de cuál es: afirmar que es de uno seria inventar, y esconderla
    // seria perder la señal.
    const dos = carga({ ref: 'A8025', cntr: 'EGSU0310260, EMCU1818703' })
    const r = build([dos], {}, ['A8025'])
    expect(r.filas.every(f => f.fotosSubidas)).toBe(true)
  })

  it('el contenedor que avisó otra persona no me lo cuento', () => {
    const dos = carga({ ref: 'A8068', cntr: 'CSLU6176200, MSCU7654321' })
    const r = build([dos], {
      A8068: { aviso_salida: avisoCntrs({ CSLU6176200: 'bridvanovich@twf.uy', MSCU7654321: 'jdornheim@mediterraneacarghas.com.ar' }) },
    }, [], [], ['bridvanovich@twf.uy'])
    expect(r.filas.find(f => f.cntr === 'CSLU6176200')!.avisoSalida).toBe(true)
    expect(r.filas.find(f => f.cntr === 'MSCU7654321')!.avisoSalida).toBe(false)
    expect(r.salidas).toBe(1)
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
      { A1: { visita_deposito: hecho() }, A2: { visita_deposito: hecho() }, A3: { visita_deposito: hecho() } },
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
    expect(t).toContain('Fui al depósito: 1/2')
    expect(t).toContain('Traslado avisado al cliente: 1/2')
    // Lo pendiente NO se esconde
    expect(t).toContain('Pendientes: A7938, A8000')
  })

  it('el informe del parte va sobre las visitas, no sobre el total', () => {
    const r = build(
      [carga({ ref: 'FUI' }), carga({ ref: 'NOFUI' })],
      { FUI: { visita_deposito: hecho() } },
      [], ['FUI'],
    )
    expect(textoParte(r, '2026-08-17', '2026-08-23')).toContain('Informe operativo: 1/1 de las que fui')
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


describe('resumenMensual — cómo viene mes a mes', () => {
  const mensual = (cargas: CargaRendimiento[], checks: Record<string, RefCheckSteps> = {}, informes: string[] = []) =>
    resumenMensual({
      cargas,
      checksByRef: new Map(Object.entries(checks)),
      fotosPorCntr: new Set<string>(),
      refsConFotosSinCntr: new Set<string>(),
      refsConInforme: new Set(informes),
      meses: ['2026-08', '2026-07'],
    })

  it('separa las operativas por mes según su fecha', () => {
    const r = mensual([
      carga({ ref: 'AGO1', salida: '2026-08-05' }),
      carga({ ref: 'AGO2', salida: '2026-08-31' }),
      carga({ ref: 'JUL', salida: '2026-07-15' }),
    ])
    expect(r.map(m => [m.mes, m.total])).toEqual([['2026-08', 2], ['2026-07', 1]])
  })

  it('el último día del mes entra (no se cae por el 31)', () => {
    const r = mensual([carga({ ref: 'X', salida: '2026-07-31' })])
    expect(r.find(m => m.mes === '2026-07')?.total).toBe(1)
  })

  it('el informe del mes se cuenta sobre las visitas', () => {
    const r = mensual(
      [carga({ ref: 'FUI', salida: '2026-08-05' }), carga({ ref: 'NOFUI', salida: '2026-08-06' })],
      { FUI: { visita_deposito: hecho() } },
      ['FUI', 'NOFUI'],
    )
    const ago = r.find(m => m.mes === '2026-08')!
    expect(ago.visitas).toBe(1)
    expect(ago.informesDeVisitadas).toBe(1)
  })
})

describe('ultimosMeses', () => {
  it('cuenta para atrás cruzando el año', () => {
    expect(ultimosMeses('2026-02', 4)).toEqual(['2026-02', '2026-01', '2025-12', '2025-11'])
  })
  it('mes inválido → vacío', () => expect(ultimosMeses('', 3)).toEqual([]))
})
