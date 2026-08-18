import { describe, it, expect } from 'vitest'
import {
  TIPOS_TODOS, SOLO_ENVIADOS,
  diaDeFila, armarEventos, filtrarEventos, etiquetaDia, agruparPorDia,
  type FilaLog,
} from './historialSeguimientos'

const HOY = '2026-08-18'   // martes

const fila = (f: Partial<FilaLog> = {}): FilaLog => ({
  ref: 'A7938', tipo: 'enviado', fecha: HOY,
  created_at: `${HOY}T14:30:00.000Z`, buque: 'TIGER GAUCHO 0935S',
  eta_nueva: '2026-09-12', usuario: 'brian@twf.uy', ...f,
})

const clientes = new Map([['A7938', 'TOMASELLI'], ['A8000', 'NAVATTA']])

describe('diaDeFila', () => {
  it('usa la fecha del evento cuando está', () => {
    expect(diaDeFila(fila({ fecha: '2026-08-11', created_at: '2026-08-12T03:00:00Z' }))).toBe('2026-08-11')
  })

  it('cae a created_at cuando no hay fecha', () => {
    expect(diaDeFila(fila({ fecha: null }))).toBe(HOY)
    expect(diaDeFila(fila({ fecha: '' }))).toBe(HOY)
  })

  it('sin ninguna de las dos devuelve vacío, no una fecha inventada', () => {
    expect(diaDeFila(fila({ fecha: null, created_at: null }))).toBe('')
  })

  it('ignora una fecha con formato roto y cae a created_at', () => {
    expect(diaDeFila(fila({ fecha: 'CONFIRMAR' }))).toBe(HOY)
  })
})

describe('armarEventos', () => {
  it('ordena del más nuevo al más viejo', () => {
    const ev = armarEventos([
      fila({ ref: 'A1', fecha: '2026-08-11' }),
      fila({ ref: 'A2', fecha: '2026-08-18' }),
      fila({ ref: 'A3', fecha: '2026-08-14' }),
    ])
    expect(ev.map(e => e.ref)).toEqual(['A2', 'A3', 'A1'])
  })

  it('desempata dentro del mismo día por created_at', () => {
    const ev = armarEventos([
      fila({ ref: 'A1', created_at: `${HOY}T09:00:00Z` }),
      fila({ ref: 'A2', created_at: `${HOY}T17:00:00Z` }),
    ])
    expect(ev.map(e => e.ref)).toEqual(['A2', 'A1'])
  })

  it('pega el cliente por ref', () => {
    const ev = armarEventos([fila({ ref: 'A7938' })], clientes)
    expect(ev[0].cliente).toBe('TOMASELLI')
  })

  it('busca el cliente sin importar mayúsculas ni espacios', () => {
    const ev = armarEventos([fila({ ref: ' a7938 ' })], clientes)
    expect(ev[0].cliente).toBe('TOMASELLI')
  })

  it('ref sin cliente conocido no rompe: queda vacío', () => {
    const ev = armarEventos([fila({ ref: 'A9999' })], clientes)
    expect(ev[0].cliente).toBe('')
  })

  it('sin mapa de clientes tampoco rompe', () => {
    expect(armarEventos([fila()])[0].cliente).toBe('')
  })

  it('las filas sin fecha NO se descartan: van al final', () => {
    const ev = armarEventos([
      fila({ ref: 'SIN', fecha: null, created_at: null }),
      fila({ ref: 'CON', fecha: '2026-08-11' }),
    ])
    expect(ev.map(e => e.ref)).toEqual(['CON', 'SIN'])
    expect(ev[1].dia).toBe('')
  })

  it('lista vacía devuelve vacío', () => {
    expect(armarEventos([])).toEqual([])
  })
})

describe('filtrarEventos', () => {
  const eventos = armarEventos([
    fila({ ref: 'A7938', tipo: 'enviado', buque: 'TIGER GAUCHO' }),
    fila({ ref: 'A8000', tipo: 'eta', buque: 'MSC LORETO', usuario: 'nico@twf.uy' }),
    fila({ ref: 'A7971', tipo: 'trasbordo', buque: 'CAP SAN RAPHAEL' }),
    fila({ ref: 'A7938', tipo: 'deshecho', buque: 'TIGER GAUCHO' }),
  ], clientes)

  it('sin filtro devuelve todo', () => {
    expect(filtrarEventos(eventos, {})).toHaveLength(4)
  })

  it('filtra por tipo', () => {
    const solo = filtrarEventos(eventos, { tipos: SOLO_ENVIADOS })
    expect(solo).toHaveLength(1)
    expect(solo[0].tipo).toBe('enviado')
  })

  it('TIPOS_TODOS no deja nada afuera', () => {
    expect(filtrarEventos(eventos, { tipos: TIPOS_TODOS })).toHaveLength(4)
  })

  it('lista de tipos vacía se trata como "sin filtro", no como "nada"', () => {
    // Si no, destildar el último checkbox vaciaría la pantalla sin explicación.
    expect(filtrarEventos(eventos, { tipos: [] })).toHaveLength(4)
  })

  it('busca por ref', () => {
    expect(filtrarEventos(eventos, { texto: 'A7938' })).toHaveLength(2)
  })

  it('busca por cliente', () => {
    const r = filtrarEventos(eventos, { texto: 'tomaselli' })
    expect(r.map(e => e.ref)).toEqual(['A7938', 'A7938'])
  })

  it('busca por buque', () => {
    expect(filtrarEventos(eventos, { texto: 'msc' })).toHaveLength(1)
  })

  it('busca por usuario', () => {
    expect(filtrarEventos(eventos, { texto: 'nico' })).toHaveLength(1)
  })

  it('ignora mayúsculas y espacios de sobra', () => {
    expect(filtrarEventos(eventos, { texto: '  a7971  ' })).toHaveLength(1)
  })

  it('texto vacío no filtra', () => {
    expect(filtrarEventos(eventos, { texto: '   ' })).toHaveLength(4)
  })

  it('combina tipo y texto', () => {
    const r = filtrarEventos(eventos, { tipos: SOLO_ENVIADOS, texto: 'A7938' })
    expect(r).toHaveLength(1)
  })

  it('sin coincidencias devuelve vacío', () => {
    expect(filtrarEventos(eventos, { texto: 'NO EXISTE' })).toEqual([])
  })
})

describe('etiquetaDia', () => {
  it('hoy y ayer se nombran', () => {
    expect(etiquetaDia(HOY, HOY)).toBe('Hoy')
    expect(etiquetaDia('2026-08-17', HOY)).toBe('Ayer')
  })

  it('cruza el mes hacia atrás sin romperse', () => {
    expect(etiquetaDia('2026-07-31', '2026-08-01')).toBe('Ayer')
  })

  it('otro día lleva día de semana y fecha', () => {
    // 11/08/2026 es martes: una semana justa antes de HOY.
    expect(etiquetaDia('2026-08-11', HOY)).toBe('martes 11/08')
    expect(etiquetaDia('2026-08-10', HOY)).toBe('lunes 10/08')
  })

  it('otro año lleva el año', () => {
    expect(etiquetaDia('2025-12-20', HOY)).toBe('sábado 20/12/2025')
  })

  it('sin fecha se dice, no se inventa', () => {
    expect(etiquetaDia('', HOY)).toBe('Sin fecha')
  })

  it('una fecha futura no se disfraza de hoy', () => {
    expect(etiquetaDia('2026-08-19', HOY)).toBe('miércoles 19/08')
  })
})

describe('agruparPorDia', () => {
  it('agrupa y conserva el orden descendente', () => {
    const ev = armarEventos([
      fila({ ref: 'A1', fecha: HOY }),
      fila({ ref: 'A2', fecha: '2026-08-11' }),
      fila({ ref: 'A3', fecha: HOY }),
    ])
    const g = agruparPorDia(ev, HOY)
    expect(g.map(x => x.dia)).toEqual([HOY, '2026-08-11'])
    expect(g[0].etiqueta).toBe('Hoy')
    expect(g[0].eventos.map(e => e.ref)).toEqual(['A1', 'A3'])
    expect(g[1].eventos).toHaveLength(1)
  })

  it('el grupo sin fecha va último', () => {
    const ev = armarEventos([
      fila({ ref: 'SIN', fecha: null, created_at: null }),
      fila({ ref: 'CON', fecha: HOY }),
    ])
    const g = agruparPorDia(ev, HOY)
    expect(g.map(x => x.etiqueta)).toEqual(['Hoy', 'Sin fecha'])
  })

  it('lista vacía devuelve vacío', () => {
    expect(agruparPorDia([], HOY)).toEqual([])
  })

  it('no pierde ningún evento al agrupar', () => {
    const ev = armarEventos(
      ['2026-08-18', '2026-08-18', '2026-08-17', '2026-08-11', '2026-08-11', '2026-08-11']
        .map((f, i) => fila({ ref: `A${i}`, fecha: f })),
    )
    const g = agruparPorDia(ev, HOY)
    expect(g.reduce((a, x) => a + x.eventos.length, 0)).toBe(6)
    expect(g.map(x => x.eventos.length)).toEqual([2, 1, 3])
  })
})
