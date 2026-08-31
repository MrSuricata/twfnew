import { describe, it, expect } from 'vitest'
import {
  estadoLcl, almacenaje, diasEsperando, ALMACENAJE_DIAS, ESTADO_LCL_LABEL,
  type CargaLcl,
} from './lclEstados'

const HOY = '2026-08-31'
const carga = (over: Partial<CargaLcl> = {}): CargaLcl => ({
  ref: 'LCL247', eta: '2026-08-20', stock: '', desconsol: '', ...over,
})

describe('estadoLcl — el estado sale de los datos, no se elige', () => {
  it('la ETA no llegó todavía → en viaje', () => {
    expect(estadoLcl(carga({ eta: '2026-09-10' }), HOY)).toBe('en_viaje')
  })

  it('llegó y no tiene stock → aguarda stock', () => {
    expect(estadoLcl(carga({ eta: '2026-08-20', stock: '' }), HOY)).toBe('aguarda_stock')
  })

  it('el día de la ETA ya cuenta como llegada', () => {
    expect(estadoLcl(carga({ eta: HOY }), HOY)).toBe('aguarda_stock')
  })

  it('con stock cargado → con stock, lista para camión', () => {
    expect(estadoLcl(carga({ stock: '13030' }), HOY)).toBe('con_stock')
  })

  it('sin ETA no se inventa nada: queda en viaje', () => {
    expect(estadoLcl(carga({ eta: '' }), HOY)).toBe('en_viaje')
  })

  it('un stock en blanco no cuenta como cargado', () => {
    expect(estadoLcl(carga({ stock: '   ' }), HOY)).toBe('aguarda_stock')
  })

  it('subida a un camión publicado → asignada, aunque tenga stock', () => {
    expect(estadoLcl(carga({ stock: '13030' }), HOY, { enCamion: true })).toBe('asignada')
  })

  it('el camión ya salió → despachada', () => {
    expect(estadoLcl(carga({ stock: '13030' }), HOY, { enCamion: true, camionSalio: true }))
      .toBe('despachada')
  })

  it('un camión que salió manda sobre todo lo demás', () => {
    expect(estadoLcl(carga({ eta: '2026-09-10' }), HOY, { enCamion: true, camionSalio: true }))
      .toBe('despachada')
  })

  it('los cinco estados tienen etiqueta', () => {
    expect(Object.keys(ESTADO_LCL_LABEL)).toHaveLength(5)
  })
})

describe('las cuatro LCL reales de la base, tal como están hoy', () => {
  // Congeladas en "en origen" desde junio con el desplegable manual. Con el
  // estado derivado tienen que ordenarse solas, sin tocarles nada.
  it('E208, E147 y LCL00365UY llegaron y no tienen stock → aguarda stock', () => {
    for (const eta of ['2026-06-13', '2026-06-19', '2026-06-29']) {
      expect(estadoLcl({ ref: 'x', eta, stock: '' }, HOY)).toBe('aguarda_stock')
    }
  })

  it('A7757B no tiene ETA → en viaje, no se le pide stock', () => {
    expect(estadoLcl({ ref: 'A7757B', eta: '', stock: '' }, HOY)).toBe('en_viaje')
  })
})

describe('almacenaje — 30 días desde la desconsolidación', () => {
  it('sin fecha de desconsolidación no hay reloj', () => {
    expect(almacenaje({ ref: 'LCL247', desconsol: '' }, HOY)).toBeNull()
  })

  it('desconsolidada hoy → quedan los 30 días', () => {
    expect(almacenaje({ ref: 'LCL247', desconsol: HOY }, HOY))
      .toEqual({ vence: '2026-09-30', diasRestantes: 30, vencido: false })
  })

  it('desconsolidada hace 26 días → quedan 4', () => {
    const a = almacenaje({ ref: 'LCL247', desconsol: '2026-08-05' }, HOY)
    expect(a?.diasRestantes).toBe(4)
    expect(a?.vencido).toBe(false)
  })

  it('pasados los 30 días queda vencido y en negativo', () => {
    const a = almacenaje({ ref: 'LCL247', desconsol: '2026-07-01' }, HOY)
    expect(a?.vencido).toBe(true)
    expect(a!.diasRestantes).toBeLessThan(0)
  })

  it('el plazo es 30 días', () => {
    expect(ALMACENAJE_DIAS).toBe(30)
  })
})

describe('diasEsperando — hace cuánto está lista y sin salir', () => {
  it('sin stock todavía no está esperando camión', () => {
    expect(diasEsperando({ ref: 'LCL247', stock: '', desconsol: '2026-08-19' }, HOY)).toBeNull()
  })

  it('con stock de hace 12 días → 12', () => {
    expect(diasEsperando({ ref: 'LCL247', stock: '13030', desconsol: '2026-08-19' }, HOY)).toBe(12)
  })

  it('con stock pero sin fecha no se puede contar', () => {
    expect(diasEsperando({ ref: 'LCL247', stock: '13030', desconsol: '' }, HOY)).toBeNull()
  })
})
