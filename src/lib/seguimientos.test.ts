import { describe, it, expect } from 'vitest'
import { colaSeguimientos, type CargaSeguimiento } from './seguimientos'

// La cola ya cubría nunca-enviadas y vencidas; estos tests fijan el cambio del
// 27/08 (caso A7995 de Brian): las "al día" dejan de ser un contador y son
// FILAS ordenadas por próximas a vencer, para laburar proactivo sin ir al modal.

const HOY = new Date(2026, 7, 27) // 27/08/2026

const carga = (over: Partial<CargaSeguimiento>): CargaSeguimiento => ({
  dbId: 'id-' + (over.ref || 'x'),
  ref: 'A1',
  cliente: 'CLIENTE',
  mode: 'fcl',
  archived: false,
  etd: '2026-08-01',
  eta: '2026-09-05',
  seguimiento: '',
  salida: '',
  descarga: '',
  etaFiscal: '',
  ...over,
})

describe('colaSeguimientos — pendientes (reglas que no cambian)', () => {
  it('nunca enviada → pendiente con dias null; 7+ días → pendiente con atraso', () => {
    const cola = colaSeguimientos([
      carga({ ref: 'A1', seguimiento: '' }),
      carga({ ref: 'A2', seguimiento: '2026-08-20' }), // justo 7 días
    ], HOY)
    expect(cola.pendientes.map(f => f.carga.ref)).toEqual(['A1', 'A2'])
    expect(cola.pendientes[0].dias).toBe(null)
    expect(cola.pendientes[1].dias).toBe(7)
  })

  it('archivadas y no marítimas no entran a ningún lado', () => {
    const cola = colaSeguimientos([
      carga({ ref: 'A1', archived: true, seguimiento: '2026-08-26' }),
      carga({ ref: 'A2', mode: 'aereo', seguimiento: '2026-08-26' }),
    ], HOY)
    expect(cola.pendientes).toHaveLength(0)
    expect(cola.alDia).toHaveLength(0)
  })
})

describe('colaSeguimientos — al día como filas (27/08)', () => {
  it('caso A7995: seguimiento hace 2 días → fila en alDia con dias=2, no en pendientes', () => {
    const cola = colaSeguimientos([carga({ ref: 'A7995', seguimiento: '2026-08-25' })], HOY)
    expect(cola.pendientes).toHaveLength(0)
    expect(cola.alDia).toHaveLength(1)
    expect(cola.alDia[0].carga.ref).toBe('A7995')
    expect(cola.alDia[0].dias).toBe(2)
  })

  it('ordenadas por más próximas a vencer (dias desc); a igualdad, ETA más próxima primero', () => {
    const cola = colaSeguimientos([
      carga({ ref: 'FRESCA', seguimiento: '2026-08-26' }),                       // 1 día
      carga({ ref: 'CASI', seguimiento: '2026-08-21' }),                          // 6 días
      carga({ ref: 'EMPATE-LEJOS', seguimiento: '2026-08-24', eta: '2026-09-15' }), // 3 días
      carga({ ref: 'EMPATE-CERCA', seguimiento: '2026-08-24', eta: '2026-09-01' }), // 3 días
    ], HOY)
    expect(cola.alDia.map(f => f.carga.ref)).toEqual(['CASI', 'EMPATE-CERCA', 'EMPATE-LEJOS', 'FRESCA'])
  })

  it('al día con ETA vencida sin señales de llegada conserva la marca "¿llegó?"', () => {
    const cola = colaSeguimientos([
      carga({ ref: 'A9', seguimiento: '2026-08-26', eta: '2026-08-24' }),
    ], HOY)
    expect(cola.alDia).toHaveLength(1)
    expect(cola.alDia[0].etaVencidaDias).toBe(3)
  })
})
