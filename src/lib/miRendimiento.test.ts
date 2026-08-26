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
    // Igual que las fotos: con '|' es `REF|CNTR`, sin '|' es informe sin cntr.
    informesPorCntr: new Set(informes.filter(i => i.includes('|'))),
    refsConInformeSinCntr: new Set(informes.filter(i => !i.includes('|'))),
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

  it('la carga con SALIDA a confirmar SE MUESTRA, pero no cuenta', () => {
    // Sigue apareciendo (es la que hay que ir a mirar, correccion de Brian del
    // 18/07), pero como su salida no esta coordinada no entra en el
    // denominador: todavia no es un trasiego que uno dejo de hacer.
    const r = build([carga({ ref: 'A8100', salida: 'CONFIRMAR', eta: '2026-08-19' })])
    expect(r.filas).toHaveLength(1)
    expect(r.filas[0].fechaEs).toBe('llegada')
    expect(r.total).toBe(0)
    expect(r.pendientesDeCoordinar).toBe(1)
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

  it('cada contenedor usa SU fecha de salida, no la de la carga', () => {
    // Caso real A8025 (Brian 18/08): el EMCU sale el 18 y el EGSU el 19, pero
    // las dos filas mostraban 18/08 porque la fecha salía del nivel carga.
    const a8025 = carga({
      ref: 'A8025', cntr: 'EGSU0310260, EMCU1818703', salida: '2026-08-18',
      operativas: [
        { cntr: 'EGSU0310260', salida: '2026-08-19' },
        { cntr: 'EMCU1818703', salida: '2026-08-18' },
      ],
    })
    const r = build([a8025])
    expect(r.filas.find(f => f.cntr === 'EGSU0310260')!.fecha).toBe('2026-08-19')
    expect(r.filas.find(f => f.cntr === 'EMCU1818703')!.fecha).toBe('2026-08-18')
  })

  it('el contenedor que sale fuera de la semana no entra', () => {
    // El rango se evalúa con la fecha DEL CONTENEDOR: uno puede caer en esta
    // semana y el otro en la que viene.
    const a = carga({
      ref: 'A8025', cntr: 'UNO, DOS', salida: '2026-08-18',
      operativas: [
        { cntr: 'UNO', salida: '2026-08-18' },
        { cntr: 'DOS', salida: '2026-09-15' },
      ],
    })
    const r = build([a])
    expect(r.filas.map(f => f.cntr)).toEqual(['UNO'])
  })

  it('sin fila propia en Operativas cae a la fecha de la carga', () => {
    const r = build([carga({ ref: 'A1', cntr: 'SOLO', salida: '2026-08-20', operativas: [] })])
    expect(r.filas[0].fecha).toBe('2026-08-20')
  })

  it('la llegada sin salida coordinada NO entra en el denominador', () => {
    // Brian eligio esto (18/08): "fui a 0 de 5 trasiegos que hubo" se defiende;
    // "0 de 9" mezcla trasiegos reales con cosas que todavia no pasaron.
    const r = build([
      carga({ ref: 'SALIO', cntr: 'A', salida: '2026-08-18' }),
      carga({ ref: 'LLEGO', cntr: 'B', salida: '', eta: '2026-08-19' }),
    ])
    expect(r.filas).toHaveLength(2)          // se muestran las dos
    expect(r.total).toBe(1)                  // pero solo una cuenta
    expect(r.pendientesDeCoordinar).toBe(1)
  })

  it('lo hecho en una pendiente no infla el numerador', () => {
    // Si contara, se podria terminar con 2/1: un numero imposible que rompe
    // la confianza en toda la pagina.
    const r = build([
      carga({ ref: 'SALIO', cntr: 'A', salida: '2026-08-18' }),
      carga({ ref: 'LLEGO', cntr: 'B', salida: '', eta: '2026-08-19' }),
    ], {
      SALIO: { visita_deposito: hecho() },
      LLEGO: { visita_deposito: hecho() },
    })
    expect(r.visitas).toBe(1)
    expect(r.total).toBe(1)
  })

  it('sin pendientes el numero es cero y no aparece', () => {
    const r = build([carga({ ref: 'A', cntr: 'X', salida: '2026-08-18' })])
    expect(r.pendientesDeCoordinar).toBe(0)
  })

  it('el parte nombra las pendientes aparte, sin mezclarlas', () => {
    const r = build([
      carga({ ref: 'SALIO', cntr: 'A', salida: '2026-08-18' }),
      carga({ ref: 'LLEGO', cntr: 'B', salida: '', eta: '2026-08-19' }),
    ])
    const t = textoParte(r, '2026-08-17', '2026-08-23')
    expect(t).toContain('1 trasiegos por depósito')
    expect(t).toContain('1 llegada sin salida coordinada (no cuentan)')
  })

  it('dice si la fecha es la salida o la llegada', () => {
    // Caso A7958 (Brian 18/08): "por que me aparece si no sale hoy". Llego el
    // 18 y todavia no tiene salida coordinada; la columna mostraba la llegada
    // con la misma cara que una salida.
    const conSalida = build([carga({ ref: 'CON', cntr: 'X', salida: '2026-08-20' })])
    expect(conSalida.filas[0].fechaEs).toBe('salida')

    // OJO: la primera versión de este test esperaba 18/08 — fijaba el BUG.
    // ETA_OP es una copia sin mantener; la llegada es de la CARGA (todos los
    // contenedores llegan en el mismo buque), así que manda eta = 24/08.
    const sinSalida = build([carga({
      ref: 'A7958', cntr: 'TEMU1789917', salida: '', eta: '2026-08-24',
      operativas: [{ cntr: 'TEMU1789917', salida: '', eta: '2026-08-18' }],
    })], {}, [], [], undefined)
    expect(sinSalida.filas).toHaveLength(0)   // 24/08 cae FUERA de la semana 17–23
    const semanaQueViene = buildRendimiento({
      cargas: [carga({
        ref: 'A7958', cntr: 'TEMU1789917', salida: '', eta: '2026-08-24',
        operativas: [{ cntr: 'TEMU1789917', salida: '', eta: '2026-08-18' }],
      })],
      checksByRef: new Map(), fotosPorCntr: new Set(), refsConFotosSinCntr: new Set(),
      informesPorCntr: new Set(), refsConInformeSinCntr: new Set(),
      desde: '2026-08-24', hasta: '2026-08-30',
    })
    expect(semanaQueViene.filas[0].fecha).toBe('2026-08-24')
    expect(semanaQueViene.filas[0].fechaEs).toBe('llegada')
  })

  it('con fila propia sin fechas NO se roba la salida del hermano', () => {
    // c.salida es el rollup: la salida más temprana de TODOS los contenedores.
    // El contenedor sin fechas propias caía ahí y mostraba el camión del otro.
    const r = buildRendimiento({
      cargas: [carga({
        ref: 'A1', cntr: 'CON, SIN', salida: '2026-08-18', eta: '2026-08-20',
        operativas: [
          { cntr: 'CON', salida: '2026-08-18' },
          { cntr: 'SIN', salida: '', eta: '' },
        ],
      })],
      checksByRef: new Map(), fotosPorCntr: new Set(), refsConFotosSinCntr: new Set(),
      informesPorCntr: new Set(), refsConInformeSinCntr: new Set(),
      desde: '2026-08-17', hasta: '2026-08-23',
    })
    const sin = r.filas.find(f => f.cntr === 'SIN')!
    expect(sin.fechaEs).toBe('llegada')
    expect(sin.fecha).toBe('2026-08-20')
  })

  it("la SALIDA de texto ('CONFIRMAR') cuenta como llegada, no como salida", () => {
    const r = build([carga({ ref: 'A1', cntr: 'X', salida: 'CONFIRMAR', eta: '2026-08-19' })])
    expect(r.filas[0].fecha).toBe('2026-08-19')
    expect(r.filas[0].fechaEs).toBe('llegada')
  })

  it('el informe cuenta solo para SU contenedor', () => {
    // Antes el informe era por ref y se mostraba en las dos filas: no había
    // forma de decir "de este hice informe y del otro no" (Brian 18/08).
    const dos = carga({ ref: 'A8025', cntr: 'EGSU0310260, EMCU1818703' })
    const r = build([dos], {}, [], ['A8025|EMCU1818703'])
    expect(r.filas.find(f => f.cntr === 'EMCU1818703')!.informe).toBe(true)
    expect(r.filas.find(f => f.cntr === 'EGSU0310260')!.informe).toBe(false)
    expect(r.informes).toBe(1)
  })

  it('el informe viejo sin contenedor cuenta para todos los de la ref', () => {
    const dos = carga({ ref: 'A8025', cntr: 'EGSU0310260, EMCU1818703' })
    const r = build([dos], {}, [], ['A8025'])
    expect(r.filas.every(f => f.informe)).toBe(true)
  })

  it('el informe de un contenedor no le da "fotos" al otro', () => {
    // fotos = fotosSubidas || informe. Con el informe por ref, el contenedor
    // sin nada aparecía documentado por arrastre.
    const dos = carga({ ref: 'A8025', cntr: 'EGSU0310260, EMCU1818703' })
    const r = build([dos], {}, [], ['A8025|EMCU1818703'])
    expect(r.filas.find(f => f.cntr === 'EGSU0310260')!.fotos).toBe(false)
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

describe('la visita se mide por DÍA (Brian 26/08)', () => {
  // "Si hubo 3 días de la semana con operativas y fui los 3, fui 3 de 3 —
  // no importa si vi 10 de 20 operativas". Un día con varios trasiegos es
  // UNA ida al depósito.
  const tresEnDosDias = [
    carga({ ref: 'A1', cntr: 'C1', salida: '2026-08-18' }),
    carga({ ref: 'A2', cntr: 'C2', salida: '2026-08-18' }),
    carga({ ref: 'A3', cntr: 'C3', salida: '2026-08-20' }),
  ]

  it('fui los dos días = 2/2, aunque haya marcado FUI en 2 de 3 operativas', () => {
    const r = build(tresEnDosDias, {
      A1: { visita_deposito: avisoCntrs({ C1: 'admin' }) },
      A3: { visita_deposito: avisoCntrs({ C3: 'admin' }) },
    })
    expect(r.total).toBe(3)
    expect(r.diasConOperativa).toBe(2)
    expect(r.diasVisitados).toBe(2)
    expect(r.visitas).toBe(2) // el tilde por operativa sigue para el informe
  })

  it('un día sin ir resta el día entero, no las operativas', () => {
    const r = build(tresEnDosDias, {
      A1: { visita_deposito: avisoCntrs({ C1: 'admin' }) },
    })
    expect(r.diasConOperativa).toBe(2)
    expect(r.diasVisitados).toBe(1)
  })

  it('las llegadas sin salida coordinada no crean día (todavía no pasó)', () => {
    const r = build([
      carga({ ref: 'A1', cntr: 'C1', salida: '2026-08-18' }),
      carga({ ref: 'A4', cntr: 'C4', salida: '', eta: '2026-08-21' }),
    ])
    expect(r.diasConOperativa).toBe(1)
  })

  it("'2026-8-20' y '2026-08-20' son el MISMO día", () => {
    const r = build([
      carga({ ref: 'A1', cntr: 'C1', salida: '2026-8-20' }),
      carga({ ref: 'A2', cntr: 'C2', salida: '2026-08-20' }),
    ])
    expect(r.diasConOperativa).toBe(1)
  })

  it('el parte de texto habla en días', () => {
    const r = build(tresEnDosDias, {
      A1: { visita_deposito: avisoCntrs({ C1: 'admin' }) },
    })
    expect(textoParte(r, '2026-08-17', '2026-08-23')).toContain('Fui al depósito: 1/2 días con operativa')
  })

  it('el resumen mensual trae la misma medición por día', () => {
    const m = resumenMensual({
      cargas: tresEnDosDias,
      checksByRef: new Map(Object.entries({ A1: { visita_deposito: avisoCntrs({ C1: 'admin' }) } })),
      fotosPorCntr: new Set<string>(),
      refsConFotosSinCntr: new Set<string>(),
      informesPorCntr: new Set<string>(),
      refsConInformeSinCntr: new Set<string>(),
      meses: ['2026-08'],
    })
    expect(m[0].diasConOperativa).toBe(2)
    expect(m[0].diasVisitados).toBe(1)
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
    expect(t).toContain('2 trasiegos por depósito')
    // Las dos operativas salieron el mismo día → la visita es 1/1 DÍAS
    // (Brian 26/08); los avisos siguen siendo por operativa.
    expect(t).toContain('Fui al depósito: 1/1 días con operativa')
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
      // Igual que las fotos: con '|' es `REF|CNTR`, sin '|' es informe sin cntr.
    informesPorCntr: new Set(informes.filter(i => i.includes('|'))),
    refsConInformeSinCntr: new Set(informes.filter(i => !i.includes('|'))),
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
