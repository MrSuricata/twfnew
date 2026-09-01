import { describe, it, expect } from 'vitest'
import {
  candidatasLcl, sugerirCamiones, previsionPorFiscal, avisoAlPublicar,
  type CargaLclFuente,
} from './lclSugerencias'
import { TRUCK_LIMITS } from './truckTypes'

// Martes 01/09/2026. Casos con nombres reales de la base (E163 A INELPA → CLIR,
// E205 BALSAMO → DFC) más inventados para cubrir RAFAELA con dos depósitos.
const HOY = '2026-09-01'
const STD = TRUCK_LIMITS.standard

let n = 0
const lcl = (over: Partial<CargaLclFuente> = {}): CargaLclFuente => ({
  id: `id-${++n}`,
  ref: `E${100 + n}`,
  cliente: 'CLIENTE',
  mode: 'lcl',
  archived: false,
  fiscal: 'RAFAELA',
  deposito: 'GODILCO',
  kg: 1000,
  m3: 5,
  pkgs: 10,
  wood: false,
  eta: '2026-08-20',
  stock: '13030',
  desconsol_date: '2026-08-25',
  marca_cliente: null,
  ...over,
})

const ctx = (refsEnCamion: string[] = []) => ({ hoy: HOY, refsEnCamion: new Set(refsEnCamion) })

describe('candidatasLcl — solo lo que puede subir a un camión hoy', () => {
  it('entra la LCL con stock, activa, sin stand by y fuera de camión', () => {
    const c = candidatasLcl([lcl({ ref: 'E205', cliente: 'BALSAMO', fiscal: 'DFC' })], ctx())
    expect(c.map(x => x.ref)).toEqual(['E205'])
    expect(c[0].fiscal).toBe('DFC')
    expect(c[0].deposito).toBe('GODILCO')
    expect(c[0].diasEsperando).toBe(7)
    expect(c[0].almacenaje?.vence).toBe('2026-09-24')
    expect(c[0].prioridad).toBe(false)
  })

  it('no entran: FCL, archivadas, en viaje, aguarda stock, stand by, en camión', () => {
    const rows = [
      lcl({ ref: 'A7900', mode: 'fcl' }),
      lcl({ ref: 'E1', archived: true }),
      lcl({ ref: 'E2', eta: '2026-09-10', stock: '' }),
      lcl({ ref: 'E3', eta: '2026-08-20', stock: '' }),
      lcl({ ref: 'E4', marca_cliente: 'stand_by' }),
      lcl({ ref: 'E5' }),
      lcl({ ref: 'E6' }),
    ]
    expect(candidatasLcl(rows, ctx(['E5'])).map(x => x.ref)).toEqual(['E6'])
  })

  it('normaliza fiscal/depósito y marca prioridad; sin fiscal queda visible como SIN FISCAL', () => {
    const c = candidatasLcl([
      lcl({ ref: 'E7', fiscal: ' rafaela ', deposito: 'planir', marca_cliente: 'prioridad' }),
      lcl({ ref: 'E8', fiscal: '', deposito: null }),
    ], ctx())
    expect(c[0]).toMatchObject({ fiscal: 'RAFAELA', deposito: 'PLANIR', prioridad: true })
    expect(c[1]).toMatchObject({ fiscal: 'SIN FISCAL', deposito: 'SIN DEPÓSITO' })
  })

  it('kg/m3/pkgs en texto se convierten; basura queda en 0', () => {
    const c = candidatasLcl([lcl({ kg: '1.500' as unknown as number, m3: 'x' as unknown as number, pkgs: null })], ctx())
    expect(c[0].kg).toBe(1500)
    expect(c[0].m3).toBe(0)
    expect(c[0].pkgs).toBe(0)
  })
})

describe('sugerirCamiones — un camión por (fiscal, depósito), greedy por urgencia', () => {
  it('agrupa por fiscal y dentro por depósito', () => {
    const cands = candidatasLcl([
      lcl({ ref: 'R1', fiscal: 'RAFAELA', deposito: 'GODILCO' }),
      lcl({ ref: 'R2', fiscal: 'RAFAELA', deposito: 'PLANIR' }),
      lcl({ ref: 'C1', fiscal: 'CACEC', deposito: 'GODILCO' }),
    ], ctx())
    const p = sugerirCamiones(cands, { limites: STD }).filter(x => !x.alternativa)
    const claves = p.map(x => `${x.fiscal}|${x.depositos.join('+')}`).sort()
    expect(claves).toEqual(['CACEC|GODILCO', 'RAFAELA|GODILCO', 'RAFAELA|PLANIR'])
  })

  it('la prioridad del cliente va primera aunque sea chica y nueva', () => {
    const cands = candidatasLcl([
      lcl({ ref: 'VIEJA', m3: 30, desconsol_date: '2026-08-10' }),
      lcl({ ref: 'PRIO', m3: 2, desconsol_date: HOY, marca_cliente: 'prioridad' }),
      lcl({ ref: 'GRANDE', m3: 40 }),
    ], ctx())
    const [p] = sugerirCamiones(cands, { limites: STD })
    expect(p.cargas[0].ref).toBe('PRIO')
    expect(p.cargas.map(c => c.ref)).toContain('PRIO')
    expect(p.sugerencia).toBe('salir')
    expect(p.motivos).toContain('1 con prioridad del cliente: PRIO')
  })

  it('el almacenaje por vencer (≤5 días) adelanta a la que lleva más días esperando', () => {
    const cands = candidatasLcl([
      // desconsolidó el 12/08: 20 días esperando, almacenaje vence en 10 → no urgente
      lcl({ ref: 'ESPERA', desconsol_date: '2026-08-12', m3: 30 }),
      // desconsolidó el 05/08 → vence 04/09 (en 3 días): urgente, va primera
      lcl({ ref: 'E163 A', cliente: 'INELPA', desconsol_date: '2026-08-05', m3: 30 }),
      lcl({ ref: 'RESTO', m3: 30 }),
    ], ctx())
    const [p] = sugerirCamiones(cands, { limites: STD })
    expect(p.cargas.map(c => c.ref)).toEqual(['E163 A', 'ESPERA'])
    expect(p.motivos).toContain('E163 A: almacenaje vence en 3 días')
    expect(p.sugerencia).toBe('salir')
  })

  it('el almacenaje vencido lo dice con todas las letras', () => {
    const cands = candidatasLcl([lcl({ ref: 'E9', desconsol_date: '2026-07-20' })], ctx())
    const [p] = sugerirCamiones(cands, { limites: STD })
    expect(p.motivos).toContain('E9: almacenaje vencido hace 13 días')
  })

  it('no se pasa de kg ni de m³; la que no entra queda anotada', () => {
    const cands = candidatasLcl([
      lcl({ ref: 'A', m3: 30, kg: 20000 }),
      lcl({ ref: 'B', m3: 30, kg: 5000 }),
      lcl({ ref: 'C', m3: 10, kg: 3000 }),   // m3 pasaría 62 con A+B → no entra
      lcl({ ref: 'D', m3: 1, kg: 2000 }),    // kg pasaría 26.500 → no entra
      lcl({ ref: 'E', m3: 1, kg: 500 }),     // entra
    ], ctx())
    const [p] = sugerirCamiones(cands, { limites: STD })
    expect(p.cargas.map(c => c.ref).sort()).toEqual(['A', 'B', 'E'])
    expect(p.m3).toBe(61)
    expect(p.kg).toBe(25500)
    expect(p.kg).toBeLessThanOrEqual(STD.kgMax)
    expect(p.m3).toBeLessThanOrEqual(STD.m3Max)
    expect(p.noEntran.sort()).toEqual(['C', 'D'])
    expect(p.ocupacionM3).toBeCloseTo(61 / 62)
  })

  it('una sola carga más grande que el camión no rompe: no hay propuesta vacía', () => {
    const cands = candidatasLcl([lcl({ ref: 'XXL', m3: 70 })], ctx())
    const p = sugerirCamiones(cands, { limites: STD })
    expect(p).toHaveLength(0)
  })

  it('sugerencia según llenado y relojes: esperar / completar / salir', () => {
    const chica = sugerirCamiones(candidatasLcl([lcl({ m3: 10, desconsol_date: HOY })], ctx()), { limites: STD })[0]
    expect(chica.sugerencia).toBe('esperar')
    const media = sugerirCamiones(candidatasLcl([lcl({ m3: 35, desconsol_date: HOY })], ctx()), { limites: STD })[0]
    expect(media.sugerencia).toBe('completar')
    const llena = sugerirCamiones(candidatasLcl([lcl({ m3: 55, desconsol_date: HOY })], ctx()), { limites: STD })[0]
    expect(llena.sugerencia).toBe('salir')
    expect(llena.motivos.some(m => m.startsWith('Camión al 89'))).toBe(true)
  })

  it('cuenta los m³ que llevan más de una semana esperando', () => {
    const cands = candidatasLcl([
      lcl({ ref: 'A', m3: 8, desconsol_date: '2026-08-18' }),   // 14 días
      lcl({ ref: 'B', m3: 4, desconsol_date: '2026-08-22' }),   // 10 días
      lcl({ ref: 'C', m3: 20, desconsol_date: '2026-08-30' }),  // 2 días
    ], ctx())
    const [p] = sugerirCamiones(cands, { limites: STD })
    expect(p.motivos).toContain('12 m³ esperando hace 14 días')
  })

  it('propone sumar el otro depósito cuando mejora mucho el llenado, marcando la parada extra', () => {
    const cands = candidatasLcl([
      lcl({ ref: 'G1', deposito: 'GODILCO', m3: 22, kg: 5000 }),
      lcl({ ref: 'P1', deposito: 'PLANIR', m3: 24, kg: 5000 }),
    ], ctx())
    const p = sugerirCamiones(cands, { limites: STD })
    const alt = p.find(x => x.alternativa)
    expect(alt).toBeDefined()
    expect(alt!.depositos).toEqual(['PLANIR', 'GODILCO'])
    expect(alt!.m3).toBe(46)
    expect(alt!.motivos).toContain('Sumando GODILCO llegás a 46 m³. Es una parada más.')
    // La alternativa va pegada a su base
    const iBase = p.findIndex(x => !x.alternativa && x.fiscal === 'RAFAELA' && x.depositos[0] === 'PLANIR')
    expect(p[iBase + 1]).toBe(alt)
  })

  it('no propone la parada extra si lo que suma es poco', () => {
    const cands = candidatasLcl([
      lcl({ ref: 'G1', deposito: 'GODILCO', m3: 40 }),
      lcl({ ref: 'P1', deposito: 'PLANIR', m3: 3 }),
    ], ctx())
    expect(sugerirCamiones(cands, { limites: STD }).some(x => x.alternativa)).toBe(false)
  })

  it('ordena las propuestas: salir antes que completar antes que esperar', () => {
    const cands = candidatasLcl([
      lcl({ ref: 'E1', fiscal: 'CACEC', m3: 5, desconsol_date: HOY }),
      lcl({ ref: 'S1', fiscal: 'DFC', m3: 5, marca_cliente: 'prioridad' }),
      lcl({ ref: 'C1', fiscal: 'CLIR', m3: 35, desconsol_date: HOY }),
    ], ctx())
    const p = sugerirCamiones(cands, { limites: STD })
    expect(p.map(x => x.fiscal)).toEqual(['DFC', 'CLIR', 'CACEC'])
  })

  it('con el sider entran más m³ pero menos kg', () => {
    const cands = candidatasLcl([lcl({ m3: 70, kg: 25000 })], ctx())
    expect(sugerirCamiones(cands, { limites: TRUCK_LIMITS.standard })).toHaveLength(0)
    expect(sugerirCamiones(cands, { limites: TRUCK_LIMITS.sider })).toHaveLength(0) // 25.000 > 24.500
    const cands2 = candidatasLcl([lcl({ m3: 70, kg: 20000 })], ctx())
    expect(sugerirCamiones(cands2, { limites: TRUCK_LIMITS.sider })).toHaveLength(1)
  })
})

describe('previsionPorFiscal — lo que hay hoy y lo que llega, por depósito', () => {
  it('arma la tabla RAFAELA: stock hoy por depósito y llegadas por día (tengan stock o no)', () => {
    const rows = [
      lcl({ ref: 'G1', deposito: 'GODILCO', m3: 22 }),
      lcl({ ref: 'P1', deposito: 'PLANIR', m3: 6 }),
      lcl({ ref: 'L1', deposito: 'GODILCO', m3: 18, eta: '2026-09-03', stock: '', desconsol_date: '' }),
      lcl({ ref: 'L2', deposito: 'PLANIR', m3: 12, eta: '2026-09-04', stock: '', desconsol_date: '' }),
      lcl({ ref: 'L3', deposito: 'GODILCO', m3: 9, eta: '2026-09-05', stock: '9999', desconsol_date: '' }),
      lcl({ ref: 'LEJOS', deposito: 'GODILCO', m3: 50, eta: '2026-09-20', stock: '' }),
      lcl({ ref: 'OTRO', fiscal: 'CACEC', m3: 7 }),
    ]
    const prev = previsionPorFiscal(rows, { hoy: HOY, dias: 7 })
    const raf = prev.find(f => f.fiscal === 'RAFAELA')!
    expect(raf.conStock.total).toBe(28)
    expect(raf.conStock.porDeposito).toEqual({ GODILCO: 22, PLANIR: 6 })
    expect(raf.llegadas).toHaveLength(7)
    expect(raf.llegadas[0].fecha).toBe('2026-09-02')
    expect(raf.llegadas[1]).toMatchObject({ fecha: '2026-09-03', total: 18, porDeposito: { GODILCO: 18 } })
    expect(raf.llegadas[2]).toMatchObject({ fecha: '2026-09-04', total: 12, porDeposito: { PLANIR: 12 } })
    expect(raf.llegadas[3]).toMatchObject({ fecha: '2026-09-05', total: 9 })
    expect(raf.totalVentana).toBe(39)
    expect(raf.depositos).toEqual(['GODILCO', 'PLANIR'])
    // El fiscal con más movimiento va primero
    expect(prev.map(f => f.fiscal)).toEqual(['RAFAELA', 'CACEC'])
  })

  it('lo que llegó y aguarda stock se muestra aparte: no es stock, pero ya está', () => {
    const rows = [lcl({ ref: 'S1', eta: '2026-08-28', stock: '', desconsol_date: '', m3: 11 })]
    const [raf] = previsionPorFiscal(rows, { hoy: HOY, dias: 7 })
    expect(raf.sinStock.total).toBe(11)
    expect(raf.conStock.total).toBe(0)
  })

  it('las que ya viajan en camión no cuentan como stock disponible', () => {
    const rows = [lcl({ ref: 'EN', m3: 11 }), lcl({ ref: 'FUERA', m3: 4 })]
    const [raf] = previsionPorFiscal(rows, { hoy: HOY, dias: 7, refsEnCamion: new Set(['EN']) })
    expect(raf.conStock.total).toBe(4)
  })

  it('sin LCL no hay filas', () => {
    expect(previsionPorFiscal([lcl({ mode: 'fcl' })], { hoy: HOY, dias: 7 })).toEqual([])
  })
})

describe('avisoAlPublicar — avisa, no bloquea', () => {
  const camion = (over: Partial<Parameters<typeof avisoAlPublicar>[0]> = {}) => ({
    code: 'C464',
    refs: ['G1'],
    kg: 5000,
    m3: 22,
    limites: STD,
    departureDate: null as string | null,
    ...over,
  })

  it('camión con lugar y carga del mismo fiscal y depósito llegando en 3 días → esperar', () => {
    const rows = [
      lcl({ ref: 'G1', m3: 22 }),
      lcl({ ref: 'L1', m3: 18, eta: '2026-09-02', stock: '', desconsol_date: '' }),
    ]
    const a = avisoAlPublicar(camion(), rows, HOY)
    expect(a?.tipo).toBe('esperar')
    expect(a?.texto).toBe(
      'Este camión va a RAFAELA y sale con 22 de 62 m³ desde GODILCO. ' +
      'El miércoles 02/09 llegan 18 m³ más para el mismo fiscal y el mismo depósito. ' +
      '¿Sale igual o lo corrés un día?',
    )
  })

  it('camión lleno (≥80 % m³) → sin aviso', () => {
    const rows = [
      lcl({ ref: 'G1', m3: 50 }),
      lcl({ ref: 'L1', m3: 18, eta: '2026-09-02', stock: '' }),
    ]
    expect(avisoAlPublicar(camion({ m3: 50 }), rows, HOY)).toBeNull()
  })

  it('lo que llega es de otro depósito o de otro fiscal → sin aviso', () => {
    const rows = [
      lcl({ ref: 'G1', m3: 22 }),
      lcl({ ref: 'L1', m3: 18, eta: '2026-09-02', stock: '', deposito: 'PLANIR' }),
      lcl({ ref: 'L2', m3: 18, eta: '2026-09-02', stock: '', fiscal: 'CACEC' }),
    ]
    expect(avisoAlPublicar(camion(), rows, HOY)).toBeNull()
  })

  it('lo que llega después de la ventana de 3 días no cuenta', () => {
    const rows = [
      lcl({ ref: 'G1', m3: 22 }),
      lcl({ ref: 'L1', m3: 18, eta: '2026-09-06', stock: '' }),
    ]
    expect(avisoAlPublicar(camion(), rows, HOY)).toBeNull()
    // Pero si el camión sale el 04, el 06 está a 2 días de la salida → sí
    expect(avisoAlPublicar(camion({ departureDate: '2026-09-04' }), rows, HOY)?.tipo).toBe('esperar')
  })

  it('camión sin LCL (solo FCL) → sin aviso', () => {
    const rows = [lcl({ ref: 'L1', m3: 18, eta: '2026-09-02', stock: '' })]
    expect(avisoAlPublicar(camion({ refs: ['A7900'] }), rows, HOY)).toBeNull()
  })

  it('en stand by no cuenta como carga que llega', () => {
    const rows = [
      lcl({ ref: 'G1', m3: 22 }),
      lcl({ ref: 'L1', m3: 18, eta: '2026-09-02', stock: '', marca_cliente: 'stand_by' }),
    ]
    expect(avisoAlPublicar(camion(), rows, HOY)).toBeNull()
  })

  it('con stock hoy, mismo fiscal y depósito, sin subir al camión → esperar (agregala)', () => {
    const rows = [
      lcl({ ref: 'G1', m3: 22 }),
      lcl({ ref: 'D1', m3: 12 }),
    ]
    const a = avisoAlPublicar(camion(), rows, HOY)
    expect(a?.tipo).toBe('esperar')
    expect(a?.texto).toContain('12 m³ con stock en GODILCO')
  })

  it('si una carga del camión tiene el almacenaje por vencer, el aviso es el contrario: salir', () => {
    const rows = [
      lcl({ ref: 'E163 A', m3: 22, desconsol_date: '2026-08-05' }),
      lcl({ ref: 'L1', m3: 18, eta: '2026-09-02', stock: '' }),
    ]
    const a = avisoAlPublicar(camion({ refs: ['E163 A'] }), rows, HOY)
    expect(a?.tipo).toBe('salir')
    expect(a?.texto).toContain('Sacala ahora')
    expect(a?.texto).toContain('E163 A vence almacenaje el 04/09')
  })

  it('con prioridad del cliente también es salir', () => {
    const rows = [
      lcl({ ref: 'P1', m3: 22, marca_cliente: 'prioridad' }),
      lcl({ ref: 'L1', m3: 18, eta: '2026-09-02', stock: '' }),
    ]
    const a = avisoAlPublicar(camion({ refs: ['P1'] }), rows, HOY)
    expect(a?.tipo).toBe('salir')
    expect(a?.texto).toContain('P1 es prioridad del cliente')
  })

  it('urgencia sin nada que esperar → no hay decisión que avisar', () => {
    const rows = [lcl({ ref: 'P1', m3: 22, marca_cliente: 'prioridad' })]
    expect(avisoAlPublicar(camion({ refs: ['P1'] }), rows, HOY)).toBeNull()
  })
})
