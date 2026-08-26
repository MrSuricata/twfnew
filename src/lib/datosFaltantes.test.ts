import { describe, it, expect } from 'vitest'
import { datosFaltantes, faltantesUrgentes, resumenFaltantes, type CargaCampos, FALTANTES_DIAS_COORDINACION } from './datosFaltantes'

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

  it('a 14 días de llegar exige checks + terminal + coordinación (ventana unificada)', () => {
    // Desde el 22/08 la coordinación también es a 14 días, y terminal entra
    // en la ventana de checks: la lista completa para una carga vacía.
    const f = datosFaltantes(carga({ eta: '2026-08-31' }), HOY)
    expect(f.map(x => x.campo)).toEqual(
      ['buque', 'linea', 'docNumber', 'cntr', 'pkgs', 'kg', 'm3', 'agente', 'terminal',
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
      transporte: 'TRANSCAL', fiscal: 'RAFAELA', terminal: 'TCP',
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
      { ...carga({ eta: '2026-08-15', salida: '2026-08-20' }), ref: 'COORDINADA' }, // llegó pero ya coordinada
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
        terminal: 'MONTECON',
      }), ref: 'OK',
    }
    expect(faltantesUrgentes([completa], HOY)).toEqual([])
  })
})

describe('resumenFaltantes', () => {
  it('arma la lista legible', () => {
    const f = datosFaltantes(carga({ eta: '2026-08-31' }), HOY)
    expect(resumenFaltantes(f)).toBe('Buque, Línea, BL, Contenedor, Bultos, Kg, M³, Agente, Terminal, Depósito, Operativa, Transporte, Fiscal')
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
