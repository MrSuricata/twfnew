import { describe, it, expect } from 'vitest'
import { datosFaltantes, faltantesUrgentes, faltantesFuturos, resumenFaltantes, type CargaCampos, FALTANTES_DIAS_COORDINACION } from './datosFaltantes'

const HOY = new Date(2026, 7, 17) // lunes 17/08/2026

// Carga completa en origen lejano: no debe nada todavía.
function carga(c: Partial<CargaCampos> = {}): CargaCampos {
  return {
    mode: 'fcl', pais: 'UY', cliente: 'PERETTI', eta: '2026-10-20', etd: '',
    buque: '', linea: '', docNumber: '', cntr: '', pkgs: 0, kg: 0, m3: 0, agente: '',
    deposito: '', operativa: '', transporte: '', fiscal: '', salida: '', ...c,
  }
}


describe('terminal como faltante (Brian 22/08)', () => {
  const hoy = new Date(2026, 7, 22)
  const base = {
    mode: 'fcl', pais: 'UY', cliente: 'X', eta: '2026-08-30',
    buque: 'B', linea: 'MSC', docNumber: 'MBL1', cntr: 'ABCD1234567',
    pkgs: 1, kg: 1, m3: 1, agente: 'AG',
    deposito: 'GODILCO', operativa: 'TRASIEGO', transporte: 'T', fiscal: 'F',
  }

  it('FCL por Uruguay sin terminal, llegando en la ventana: la pide', () => {
    const f = datosFaltantes({ ...base, terminal: '' }, hoy)
    expect(f.map(x => x.campo)).toContain('terminal')
  })

  it('con terminal cargada no la pide', () => {
    const f = datosFaltantes({ ...base, terminal: 'MONTECON' }, hoy)
    expect(f.map(x => x.campo)).not.toContain('terminal')
  })

  it('Chile no tiene terminal MVD: no se pide', () => {
    const f = datosFaltantes({ ...base, pais: 'CL', terminal: '' }, hoy)
    expect(f.map(x => x.campo)).not.toContain('terminal')
  })

  it('LCL no la pide (el contenedor es del consolidador)', () => {
    const f = datosFaltantes({ ...base, mode: 'lcl', cntr: '', terminal: '' }, hoy)
    expect(f.map(x => x.campo)).not.toContain('terminal')
  })

  it('la ventana de coordinación ahora es 14 días', () => {
    expect(FALTANTES_DIAS_COORDINACION).toBe(14)
    // A 12 días ya pide los datos de coordinación (antes solo checks).
    const f = datosFaltantes({ ...base, eta: '2026-09-03', deposito: '' }, hoy)
    expect(f.map(x => x.campo)).toContain('deposito')
  })
})

describe('devolución del vacío como faltante (Brian 26/08)', () => {
  const hoy = new Date(2026, 7, 22)
  const base = {
    mode: 'fcl', pais: 'UY', cliente: 'X', eta: '2026-08-30',
    buque: 'B', linea: 'MSC', docNumber: 'MBL1', cntr: 'ABCD1234567',
    pkgs: 1, kg: 1, m3: 1, agente: 'AG', terminal: 'TCP',
    deposito: 'GODILCO', operativa: 'TRASIEGO', transporte: 'T', fiscal: 'F',
  }

  it('ANTES del arribo NO se pide (Brian 28/08: ocupaba lugar de otras cargas)', () => {
    // eta 30/08 vs hoy 22/08: el buque todavía viaja → sin dev ni fecha.
    const f = datosFaltantes({ ...base, dev: '' }, hoy)
    expect(f.map(x => x.campo)).not.toContain('dev')
    expect(f.map(x => x.campo)).not.toContain('devFecha')
  })

  it('el MISMO día del arribo tampoco (arranca en ETA+1)', () => {
    const f = datosFaltantes({ ...base, eta: '2026-08-22', dev: '' }, hoy)
    expect(f.map(x => x.campo)).not.toContain('dev')
  })

  it('desde ETA+1 pide lugar Y fecha de devolución', () => {
    const f = datosFaltantes({ ...base, eta: '2026-08-21', dev: '', devFecha: '' }, hoy)
    expect(f.map(x => x.campo)).toContain('dev')
    expect(f.find(x => x.campo === 'dev')?.etiqueta).toBe('Devolución')
    expect(f.map(x => x.campo)).toContain('devFecha')
    expect(f.find(x => x.campo === 'devFecha')?.etiqueta).toBe('Fecha devolución')
  })

  it('con lugar y fecha cargados no molesta', () => {
    const f = datosFaltantes({ ...base, eta: '2026-08-21', dev: 'STL', devFecha: '2026-09-10' }, hoy)
    expect(f.map(x => x.campo)).not.toContain('dev')
    expect(f.map(x => x.campo)).not.toContain('devFecha')
  })

  it('Chile queda afuera, igual que la terminal de llegada', () => {
    const f = datosFaltantes({ ...base, eta: '2026-08-21', pais: 'CL', dev: '' }, hoy)
    expect(f.map(x => x.campo)).not.toContain('dev')
  })

  it('LCL no devuelve vacío propio: no se pide', () => {
    const f = datosFaltantes({ ...base, eta: '2026-08-21', mode: 'lcl', cntr: '', dev: '' }, hoy)
    expect(f.map(x => x.campo)).not.toContain('dev')
  })
})

describe('urgentes y adelantar (Brian 28/08)', () => {
  const hoy = new Date(2026, 7, 22)
  const completa = {
    mode: 'fcl', pais: 'UY', cliente: 'X', buque: 'B', linea: 'MSC', docNumber: 'MBL1',
    cntr: 'ABCD1234567', pkgs: 1, kg: 1, m3: 1, agente: 'AG', terminal: 'TCP',
    deposito: 'GODILCO', operativa: 'TRASIEGO', transporte: 'T', fiscal: 'F',
    descripcion: 'REPUESTOS', etd: '2026-07-01',
  }

  it('llegada CON salida coordinada sigue en la tarjeta si falta la devolución', () => {
    const u = faltantesUrgentes([{ ...completa, ref: 'A1', eta: '2026-08-20', salida: '2026-08-25', dev: '', devFecha: '' }], hoy)
    expect(u).toHaveLength(1)
    expect(u[0].faltantes.map(f => f.campo)).toEqual(['dev', 'devFecha'])
  })

  it('llegada con salida y devolución completa: fuera (como siempre)', () => {
    const u = faltantesUrgentes([{ ...completa, ref: 'A1', eta: '2026-08-20', salida: '2026-08-25', dev: 'STL', devFecha: '2026-09-01' }], hoy)
    expect(u).toHaveLength(0)
  })

  it('adelantar: lista las que llegan después de la ventana con sus campos futuros, SIN devolución', () => {
    const fut = faltantesFuturos([
      { ...completa, ref: 'LEJOS', eta: '2026-10-20', buque: '', dev: '', devFecha: '', descripcion: '' },
      { ...completa, ref: 'CERCA', eta: '2026-08-30', buque: '' },  // en ventana: no va acá
    ], hoy)
    expect(fut).toHaveLength(1)
    expect(fut[0].carga.ref).toBe('LEJOS')
    const campos = fut[0].faltantes.map(f => f.campo)
    expect(campos).toContain('buque')
    expect(campos).toContain('descripcion')
    expect(campos).not.toContain('dev')
    expect(campos).not.toContain('devFecha')
  })

  it('adelantar: carga completa no aparece', () => {
    const fut = faltantesFuturos([{ ...completa, ref: 'OK', eta: '2026-10-20', dev: '', devFecha: '', clientRef: '' }], hoy)
    expect(fut).toHaveLength(0)
  })
})

describe('ref del cliente como faltante para CHIAPERO/VMG (Brian 26/08)', () => {
  const hoy = new Date(2026, 7, 26)
  const base = carga({ eta: '2026-09-05', etd: '2026-08-01', buque: 'B', linea: 'MSC', docNumber: 'MBL', cntr: 'ABCD1234567' })

  it('CHIAPERO embarcada sin ref cliente: la pide', () => {
    const f = datosFaltantes({ ...base, cliente: 'CHIAPERO Y ASOC. S.R.L.', clientRef: '' }, hoy)
    expect(f.map(x => x.campo)).toContain('clientRef')
    expect(f.find(x => x.campo === 'clientRef')?.etiqueta).toBe('Ref cliente')
  })

  it('las variantes de VMG también ("VMG S.A.", "EQUIPO ORIGINAL VMG")', () => {
    for (const cliente of ['VMG S.A.', 'VMG SA', 'EQUIPO ORIGINAL VMG']) {
      const f = datosFaltantes({ ...base, cliente, clientRef: '' }, hoy)
      expect(f.map(x => x.campo)).toContain('clientRef')
    }
  })

  it('con la ref cargada no molesta', () => {
    const f = datosFaltantes({ ...base, cliente: 'CHIAPERO Y ASOC. S.R.L.', clientRef: '1410' }, hoy)
    expect(f.map(x => x.campo)).not.toContain('clientRef')
  })

  it('a los demás clientes no se les pide', () => {
    const f = datosFaltantes({ ...base, cliente: 'BICI PERETTI S.A.', clientRef: '' }, hoy)
    expect(f.map(x => x.campo)).not.toContain('clientRef')
  })

  it('en origen lejano sin embarcar todavía no se pide', () => {
    const f = datosFaltantes(carga({ cliente: 'CHIAPERO Y ASOC. S.R.L.', clientRef: '', eta: '2026-11-20' }), hoy)
    expect(f.map(x => x.campo)).not.toContain('clientRef')
  })
})

describe('datosFaltantes — exigencia por etapa', () => {
  it('en origen lejano con lo básico completo no debe nada', () => {
    expect(datosFaltantes(carga(), HOY)).toEqual([])
  })

  it('lo básico falta SIEMPRE: cliente, país, ETA', () => {
    const f = datosFaltantes(carga({ cliente: '', pais: '', eta: '' }), HOY)
    expect(f.map(x => x.campo)).toEqual(['cliente', 'pais', 'eta'])
  })

  it('embarcada (ETD pasó) exige buque, BL y contenedor', () => {
    const f = datosFaltantes(carga({ etd: '2026-08-10' }), HOY)
    expect(f.map(x => x.campo)).toEqual(['buque', 'linea', 'docNumber', 'cntr'])
  })

  it('LCL embarcada no pide contenedor propio', () => {
    const f = datosFaltantes(carga({ mode: 'lcl', etd: '2026-08-10' }), HOY)
    expect(f.map(x => x.campo)).toEqual(['buque', 'linea', 'docNumber'])
  })

  it('a 14 días de llegar exige checks + terminal + coordinación (la devolución YA NO: es de la llegada)', () => {
    // Desde el 22/08 la coordinación también es a 14 días y terminal entra en
    // la ventana de checks. La devolución se mudó a la etapa de llegada
    // (Brian 28/08): antes del arribo no se pide.
    const f = datosFaltantes(carga({ eta: '2026-08-31' }), HOY)
    expect(f.map(x => x.campo)).toEqual(
      ['buque', 'linea', 'docNumber', 'cntr', 'pkgs', 'kg', 'm3', 'descripcion', 'agente', 'terminal',
       'deposito', 'operativa', 'transporte', 'fiscal'])
  })

  it('a 7 días, por Uruguay, suma la coordinación completa', () => {
    const f = datosFaltantes(carga({ eta: '2026-08-22' }), HOY)
    expect(f.map(x => x.campo)).toContain('deposito')
    expect(f.map(x => x.campo)).toContain('transporte')
    expect(f.map(x => x.campo)).toContain('fiscal')
  })

  it('a 7 días por CHILE no pide la coordinación uruguaya', () => {
    const f = datosFaltantes(carga({ eta: '2026-08-22', pais: 'CL' }), HOY)
    expect(f.map(x => x.campo)).not.toContain('deposito')
    expect(f.map(x => x.campo)).not.toContain('transporte')
  })

  it('operativa CONTENEDOR (directa desde terminal) no pide depósito', () => {
    // El depósito UY va legítimamente vacío en un retiro directo: pedirlo
    // invitaba a "completarlo" y la regla "Depósito manda" pisaba el
    // LUGAR_SALIDA (TCP/MONTECON) puesto a mano.
    const f = datosFaltantes(carga({ eta: '2026-08-22', operativa: 'CONTENEDOR' }), HOY)
    expect(f.map(x => x.campo)).not.toContain('deposito')
    expect(f.map(x => x.campo)).toContain('transporte')
    // Con TRASIEGO sí se sigue pidiendo.
    expect(datosFaltantes(carga({ eta: '2026-08-22', operativa: 'TRASIEGO' }), HOY).map(x => x.campo))
      .toContain('deposito')
  })

  it('con todo cargado no molesta ni encima de la llegada', () => {
    const completa = carga({
      eta: '2026-08-19', etd: '2026-07-10', buque: 'MAERSK X 001W', linea: 'MAERSK',
      docNumber: 'MAEU123', cntr: 'MSKU1234567', pkgs: 10, kg: 5000, m3: 20,
      agente: 'REPREMAR', deposito: 'GODILCO', operativa: 'TRASIEGO',
      transporte: 'TRANSCAL', fiscal: 'RAFAELA', terminal: 'TCP', dev: 'STL',
      descripcion: 'BICICLETAS',
    })
    expect(datosFaltantes(completa, HOY)).toEqual([])
  })

  it('archivadas y no marítimas quedan afuera', () => {
    expect(datosFaltantes(carga({ archived: true, cliente: '' }), HOY)).toEqual([])
    expect(datosFaltantes(carga({ mode: 'air', cliente: '' }), HOY)).toEqual([])
  })
})

describe('faltantesUrgentes — la tarjeta de HOY', () => {
  it('solo llegan-pronto o llegadas sin salida, ordenadas por llegada', () => {
    const cargas = [
      { ...carga({ eta: '2026-08-22' }), ref: 'CERCA' },                       // en 5 días, incompleta
      { ...carga({ eta: '2026-09-30' }), ref: 'LEJOS' },                       // fuera de ventana
      { ...carga({ eta: '2026-08-15', salida: '' }), ref: 'LLEGADA' },         // llegó, sin salida
      // llegó y ya coordinada, con la devolución completa → afuera (la fila
      // solo reviviría por dev/devFecha, etapa de llegada — Brian 28/08).
      { ...carga({ eta: '2026-08-15', salida: '2026-08-20', dev: 'STL', devFecha: '2026-08-30' }), ref: 'COORDINADA' },
    ]
    const out = faltantesUrgentes(cargas, HOY)
    expect(out.map(u => u.carga.ref)).toEqual(['LLEGADA', 'CERCA'])
    expect(out[0].diasAEta).toBe(-2)
  })

  it('una carga completa no aparece aunque llegue mañana', () => {
    const completa = {
      ...carga({
        eta: '2026-08-18', etd: '2026-07-10', buque: 'X 1W', linea: 'ONE', docNumber: 'B',
        cntr: 'MSKU1234567', pkgs: 1, kg: 1, m3: 1, agente: 'REPREMAR',
        deposito: 'GODILCO', operativa: 'TRASIEGO', transporte: 'TRANSCAL', fiscal: 'RAFAELA',
        terminal: 'MONTECON', dev: 'MPS', descripcion: 'BICICLETAS',
      }), ref: 'OK',
    }
    expect(faltantesUrgentes([completa], HOY)).toEqual([])
  })
})

describe('resumenFaltantes', () => {
  it('arma la lista legible', () => {
    const f = datosFaltantes(carga({ eta: '2026-08-31' }), HOY)
    expect(resumenFaltantes(f)).toBe('Buque, Línea, BL, Contenedor, Bultos, Kg, M³, Descripción, Agente, Terminal, Depósito, Operativa, Transporte, Fiscal')
  })
})

describe('descripción como faltante (Brian 26/08: "me están quedando vacíos")', () => {
  const hoy = new Date(2026, 7, 26)
  const base = carga({
    eta: '2026-09-05', etd: '2026-08-01', buque: 'B', linea: 'MSC', docNumber: 'MBL',
    cntr: 'ABCD1234567', pkgs: 1, kg: 1, m3: 1, agente: 'AG', terminal: 'TCP', dev: 'STL',
    deposito: 'GODILCO', operativa: 'TRASIEGO', transporte: 'T', fiscal: 'F',
  })

  it('en ventana de checks sin descripción: la pide (FCL y LCL, todos los países)', () => {
    expect(datosFaltantes({ ...base, descripcion: '' }, hoy).map(x => x.campo)).toContain('descripcion')
    expect(datosFaltantes({ ...base, mode: 'lcl', cntr: '', descripcion: '' }, hoy).map(x => x.campo)).toContain('descripcion')
    expect(datosFaltantes({ ...base, pais: 'CL', descripcion: '' }, hoy).map(x => x.campo)).toContain('descripcion')
  })

  it('con descripción cargada no molesta', () => {
    const f = datosFaltantes({ ...base, descripcion: 'MOTOPARTES' }, hoy)
    expect(f.map(x => x.campo)).not.toContain('descripcion')
  })

  it('lejos de la llegada todavía no se pide', () => {
    const f = datosFaltantes(carga({ eta: '2026-11-20', descripcion: '' }), hoy)
    expect(f.map(x => x.campo)).not.toContain('descripcion')
  })
})

describe('faltantesUrgentes — piso para llegadas viejas', () => {
  it('una llegada de hace meses sin salida es deuda histórica, no tarea de hoy', () => {
    const vieja = { ...carga({ eta: '2026-05-01', salida: '' }), ref: 'VIEJA' }
    const reciente = { ...carga({ eta: '2026-08-10', salida: '' }), ref: 'RECIENTE' }
    const out = faltantesUrgentes([vieja, reciente], HOY)
    expect(out.map(u => u.carga.ref)).toEqual(['RECIENTE'])
  })
})

describe('línea — alimenta la forma de pago y el tracking, no es cosmética', () => {
  it('se exige junto al buque/BL, en la misma etapa', () => {
    // En origen lejano todavía no se pide.
    expect(datosFaltantes(carga({ linea: '' }), HOY).map(x => x.campo)).not.toContain('linea')
    // Embarcada sí.
    expect(datosFaltantes(carga({ etd: '2026-08-10', linea: '' }), HOY).map(x => x.campo))
      .toContain('linea')
    // Con la línea cargada deja de pedirla.
    expect(datosFaltantes(carga({ etd: '2026-08-10', linea: 'HAPAG' }), HOY).map(x => x.campo))
      .not.toContain('linea')
  })
})

describe('faltantesUrgentes — todos los puertos, no solo Uruguay', () => {
  it('Chile y Buenos Aires entran; la coordinación UY se sigue pidiendo solo a UY', () => {
    const cargas = [
      { ...carga({ eta: '2026-08-20', pais: 'CL' }), ref: 'CHILE' },
      { ...carga({ eta: '2026-08-20', pais: 'AR' }), ref: 'BSAS' },
      { ...carga({ eta: '2026-08-20', pais: 'UY' }), ref: 'MVD' },
      { ...carga({ eta: '2026-08-20', pais: '' }), ref: 'SINPAIS' },
    ]
    const out = faltantesUrgentes(cargas, HOY)
    expect(out.map(u => u.carga.ref).sort()).toEqual(['BSAS', 'CHILE', 'MVD', 'SINPAIS'])
    const campos = (ref: string) =>
      out.find(u => u.carga.ref === ref)!.faltantes.map(f => f.campo)
    expect(campos('MVD')).toContain('deposito')
    expect(campos('CHILE')).not.toContain('deposito')
    expect(campos('BSAS')).not.toContain('deposito')
    // La que no tiene país lo pide como faltante (por eso necesita su grupo).
    expect(campos('SINPAIS')).toContain('pais')
  })
})
