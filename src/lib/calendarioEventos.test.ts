import { describe, it, expect } from 'vitest'
import {
  ordenarEventosCal,
  eventosPorFecha,
  eventosDelDia,
  avisoParaFecha,
  parseEventoCal,
  type EventoCalendario,
} from './calendarioEventos'

const ev = (p: Partial<EventoCalendario>): EventoCalendario => ({
  id: p.id || 'x',
  fecha: p.fecha || '2026-09-01',
  tipo: p.tipo || 'aviso',
  titulo: p.titulo || 'Algo',
  detalle: p.detalle,
  creadoPor: p.creadoPor,
})

describe('ordenarEventosCal — primero lo que más frena la operativa', () => {
  it('el paro va antes que el feriado, y el feriado antes que el aviso', () => {
    const orden = ordenarEventosCal([
      ev({ id: 'a', tipo: 'aviso' }),
      ev({ id: 'f', tipo: 'feriado' }),
      ev({ id: 'p', tipo: 'paro' }),
    ]).map(e => e.id)
    expect(orden).toEqual(['p', 'f', 'a'])
  })

  it('días distintos se ordenan por fecha, sin importar el tipo', () => {
    const orden = ordenarEventosCal([
      ev({ id: 'tarde', fecha: '2026-09-10', tipo: 'paro' }),
      ev({ id: 'temprano', fecha: '2026-09-01', tipo: 'aviso' }),
    ]).map(e => e.id)
    expect(orden).toEqual(['temprano', 'tarde'])
  })

  it('no toca el arreglo original', () => {
    const original = [ev({ id: 'a', tipo: 'aviso' }), ev({ id: 'p', tipo: 'paro' })]
    ordenarEventosCal(original)
    expect(original.map(e => e.id)).toEqual(['a', 'p'])
  })
})

describe('eventosPorFecha / eventosDelDia', () => {
  it('agrupa por día y deja cada grupo ordenado por peso', () => {
    const mapa = eventosPorFecha([
      ev({ id: 'a', fecha: '2026-09-01', tipo: 'aviso' }),
      ev({ id: 'p', fecha: '2026-09-01', tipo: 'paro' }),
      ev({ id: 'otro', fecha: '2026-09-02' }),
    ])
    expect(mapa.get('2026-09-01')!.map(e => e.id)).toEqual(['p', 'a'])
    expect(mapa.get('2026-09-02')!.map(e => e.id)).toEqual(['otro'])
  })

  it('un día sin avisos no está en el mapa y devuelve lista vacía', () => {
    const eventos = [ev({ fecha: '2026-09-01' })]
    expect(eventosPorFecha(eventos).has('2026-09-05')).toBe(false)
    expect(eventosDelDia(eventos, '2026-09-05')).toEqual([])
  })
})

describe('avisoParaFecha — lo que se le dice a quien coordina un camión', () => {
  it('día limpio → null, para que el llamador no muestre nada', () => {
    expect(avisoParaFecha([ev({ fecha: '2026-09-01' })], '2026-09-02')).toBeNull()
  })

  it('un solo aviso → tipo y título, sin cola', () => {
    const texto = avisoParaFecha([ev({ fecha: '2026-09-01', tipo: 'paro', titulo: 'Paro en TCP' })], '2026-09-01')
    expect(texto).toBe('Paro: Paro en TCP')
  })

  it('varios avisos → manda el de más peso y avisa cuántos quedan', () => {
    const texto = avisoParaFecha([
      ev({ id: '1', fecha: '2026-09-01', tipo: 'aviso', titulo: 'Obra en la rambla' }),
      ev({ id: '2', fecha: '2026-09-01', tipo: 'paro', titulo: 'Paro en TCP' }),
    ], '2026-09-01')
    expect(texto).toBe('Paro: Paro en TCP (y 1 aviso más ese día)')
  })

  it('con tres avisos el plural queda bien', () => {
    const texto = avisoParaFecha([
      ev({ id: '1', fecha: '2026-09-01', tipo: 'feriado', titulo: 'Feriado' }),
      ev({ id: '2', fecha: '2026-09-01', tipo: 'aviso', titulo: 'Uno' }),
      ev({ id: '3', fecha: '2026-09-01', tipo: 'aviso', titulo: 'Otro' }),
    ], '2026-09-01')
    expect(texto).toBe('Feriado: Feriado (y 2 avisos más ese día)')
  })
})

describe('parseEventoCal — lo que llega de la API', () => {
  it('recorta la fecha a YYYY-MM-DD aunque venga con hora', () => {
    expect(parseEventoCal({ id: '1', fecha: '2026-09-01T00:00:00Z', titulo: 'X' }).fecha).toBe('2026-09-01')
  })

  it('un tipo desconocido cae en aviso en vez de romper la vista', () => {
    expect(parseEventoCal({ id: '1', fecha: '2026-09-01', tipo: 'huracan', titulo: 'X' }).tipo).toBe('aviso')
  })

  it('detalle vacío queda undefined, no cadena vacía', () => {
    expect(parseEventoCal({ id: '1', fecha: '2026-09-01', titulo: 'X', detalle: '' }).detalle).toBeUndefined()
  })
})
