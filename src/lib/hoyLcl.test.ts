import { describe, it, expect } from 'vitest'
import {
  refsPorCamion, lclActivas, blDe, llegadasProximas, aguardanStock,
  listasParaCamion, camionesLcl, datosFaltantes, patchFaltanteLcl, sumarDiasISO,
  CAMPOS_FALTANTES_LCL,
  type LclRow,
} from './hoyLcl'
import { reclamables } from './datosClave'
import type { Truck, TruckLoad } from './truckTypes'

const HOY = '2026-09-01'
const HOY_DATE = new Date(2026, 8, 1)

let seq = 0
const lcl = (over: Partial<LclRow> = {}): LclRow => ({
  id: `id-${++seq}`, ref: `LCL${seq}`, mode: 'lcl', archived: false,
  cliente: 'CIUFFO', doc_number: 'BL-1', pkgs: 10, kg: 1000, m3: 5,
  stock: '', desconsol_date: '', fiscal: 'RAFAELA', deposito: 'GODILCO', eta: '2026-08-20',
  marca_cliente: null, marca_motivo: null, wood: false,
  ...over,
})

const camion = (over: Partial<Truck> = {}): Truck => ({
  id: `t-${++seq}`, code: `C${400 + seq}`, status: 'planning', isSider: false,
  transport: 'OLAVERRY', driver: '', plate: '', loadDate: '', departureDate: '', arrivalDate: '',
  notes: '', draft: false, pendingEdits: null, costDespacho: 0, costFlete: 0, costCarga: 0,
  createdAt: 0, updatedAt: 0,
  ...over,
})

const carga = (truckId: string, sourceRef: string, over: Partial<TruckLoad> = {}): TruckLoad => ({
  id: `l-${++seq}`, truckId, sourceType: 'lcl', sourceRef, cntr: '', client: '', fiscal: 'RAFAELA',
  kg: 1000, m3: 5, pkgs: 10, description: '', mvdArrival: '', desconsolDate: '', bl: '', stock: '',
  wood: false, overrides: {}, position: 0, pending: null,
  ...over,
})

describe('refsPorCamion — qué LCL ya viaja y cuál ya salió', () => {
  it('camión publicado con fecha de carga → en camión; con salida → despachada', () => {
    const t1 = camion({ loadDate: '2026-09-02' })
    const t2 = camion({ loadDate: '2026-08-28', departureDate: '2026-08-29' })
    const r = refsPorCamion([t1, t2], [carga(t1.id, 'e163 a'), carga(t2.id, 'E205')])
    expect(r.enCamion.has('E163 A')).toBe(true)
    expect(r.despachadas.has('E163 A')).toBe(false)
    expect(r.enCamion.has('E205')).toBe(true)
    expect(r.despachadas.has('E205')).toBe(true)
  })

  it('un borrador o un camión sin fecha no reserva nada, ni una carga pendiente de agregar', () => {
    const borrador = camion({ draft: true, loadDate: '2026-09-02' })
    const sinFecha = camion()
    const publicado = camion({ loadDate: '2026-09-02' })
    const r = refsPorCamion(
      [borrador, sinFecha, publicado],
      [carga(borrador.id, 'A'), carga(sinFecha.id, 'B'), carga(publicado.id, 'C', { pending: 'add' })],
    )
    expect(r.enCamion.size).toBe(0)
  })
})

describe('lclActivas — el universo del HOY LCL', () => {
  it('deja afuera archivadas, otros modos y despachadas', () => {
    const rows = [
      lcl({ ref: 'VIVA' }),
      lcl({ ref: 'ARCH', archived: true }),
      lcl({ ref: 'AIRE', mode: 'air' }),
      lcl({ ref: 'FCL', mode: 'fcl' }),
      lcl({ ref: 'salio' }),
    ]
    const act = lclActivas(rows, new Set(['SALIO']))
    expect(act.map(r => r.ref)).toEqual(['VIVA'])
  })
})

describe('blDe — el BL puede venir en doc_number o en hbl', () => {
  it('prioriza doc_number, cae a hbl, vacío si no hay ninguno', () => {
    expect(blDe(lcl({ doc_number: 'MBL1', hbl: 'HBL1' }))).toBe('MBL1')
    expect(blDe(lcl({ doc_number: '', hbl: 'HBL1' }))).toBe('HBL1')
    expect(blDe(lcl({ doc_number: '  ', hbl: '' }))).toBe('')
  })
})

describe('sumarDiasISO', () => {
  it('cruza el fin de mes sin depender del huso', () => {
    expect(sumarDiasISO('2026-08-30', 7)).toBe('2026-09-06')
    expect(sumarDiasISO('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('llegadasProximas — hoy y los próximos 7 días, por día y fiscal', () => {
  it('ventana inclusiva: hoy entra, hoy+7 entra, hoy+8 y ayer no', () => {
    const rows = [
      lcl({ ref: 'HOY', eta: HOY }),
      lcl({ ref: 'LIMITE', eta: '2026-09-08' }),
      lcl({ ref: 'FUERA', eta: '2026-09-09' }),
      lcl({ ref: 'AYER', eta: '2026-08-31' }),
      lcl({ ref: 'SINETA', eta: '' }),
    ]
    const dias = llegadasProximas(rows, HOY)
    const refs = dias.flatMap(d => d.grupos.flatMap(g => g.cargas.map(c => c.row.ref)))
    expect(refs).toEqual(['HOY', 'LIMITE'])
    expect(dias[0].esHoy).toBe(true)
    expect(dias[1].esHoy).toBe(false)
  })

  it('agrupa por día y dentro del día por fiscal, sumando m3 y kg', () => {
    const rows = [
      lcl({ ref: 'A', eta: '2026-09-02', fiscal: 'RAFAELA', m3: 10, kg: 500 }),
      lcl({ ref: 'B', eta: '2026-09-02', fiscal: 'rafaela ', m3: 8, kg: 300 }),
      lcl({ ref: 'C', eta: '2026-09-02', fiscal: 'CACEC', m3: 2, kg: 100 }),
      lcl({ ref: 'D', eta: '2026-09-04', fiscal: 'CACEC', m3: 1, kg: 50 }),
    ]
    const dias = llegadasProximas(rows, HOY)
    expect(dias.map(d => d.fecha)).toEqual(['2026-09-02', '2026-09-04'])
    const d2 = dias[0]
    expect(d2.grupos.map(g => g.fiscal)).toEqual(['RAFAELA', 'CACEC'])
    expect(d2.grupos[0].m3).toBe(18)
    expect(d2.grupos[0].kg).toBe(800)
    expect(d2.total).toBe(3)
  })

  it('marca las que no tienen fiscal o BL y las manda al final del día', () => {
    const rows = [
      lcl({ ref: 'SINFISCAL', eta: '2026-09-02', fiscal: '', doc_number: 'BL' }),
      lcl({ ref: 'OK', eta: '2026-09-02', fiscal: 'DFC' }),
      lcl({ ref: 'SINBL', eta: '2026-09-02', fiscal: 'DFC', doc_number: '', hbl: '' }),
    ]
    const [d] = llegadasProximas(rows, HOY)
    expect(d.grupos.map(g => g.fiscal)).toEqual(['DFC', null])
    const dfc = d.grupos[0].cargas
    expect(dfc.find(c => c.row.ref === 'SINBL')?.sinBL).toBe(true)
    expect(dfc.find(c => c.row.ref === 'OK')?.sinBL).toBe(false)
    expect(d.grupos[1].cargas[0].sinFiscal).toBe(true)
    expect(d.incompletas).toBe(2)
  })

  it('la ventana se puede acortar', () => {
    const rows = [lcl({ ref: 'A', eta: '2026-09-03' }), lcl({ ref: 'B', eta: '2026-09-05' })]
    expect(llegadasProximas(rows, HOY, 2).flatMap(d => d.grupos).length).toBe(1)
  })
})

describe('aguardanStock — llegaron y el depósito no dio el stock', () => {
  it('solo las de eta pasada sin stock, ordenadas por más días esperando', () => {
    const rows = [
      lcl({ ref: 'RECIENTE', eta: '2026-08-30' }),
      lcl({ ref: 'VIEJA', eta: '2026-06-13' }),
      lcl({ ref: 'CONSTOCK', eta: '2026-08-20', stock: '13030' }),
      lcl({ ref: 'NAVEGANDO', eta: '2026-09-10' }),
      lcl({ ref: 'ENCAMION', eta: '2026-08-20' }),
    ]
    const r = aguardanStock(rows, HOY, new Set(['ENCAMION']))
    expect(r.map(x => x.row.ref)).toEqual(['VIEJA', 'RECIENTE'])
    expect(r[0].diasDesdeEta).toBe(80)
    expect(r[1].diasDesdeEta).toBe(2)
  })
})

describe('listasParaCamion — con stock, agrupadas por fiscal y depósito', () => {
  it('agrupa fiscal → depósito con totales, y calcula días esperando y almacenaje', () => {
    const rows = [
      lcl({ ref: 'E163 A', cliente: 'INELPA', fiscal: 'CLIR', deposito: 'GODILCO', stock: '1', desconsol_date: '2026-08-25', m3: 4, kg: 800 }),
      lcl({ ref: 'X', fiscal: 'CLIR', deposito: 'PLANIR', stock: '2', desconsol_date: '2026-07-20', m3: 6, kg: 900 }),
      lcl({ ref: 'E205', cliente: 'BALSAMO', fiscal: 'DFC', deposito: 'GODILCO', stock: '3', desconsol_date: '2026-08-31', m3: 12, kg: 2000 }),
      lcl({ ref: 'SINSTOCK', fiscal: 'DFC', stock: '' }),
    ]
    const grupos = listasParaCamion(rows, HOY, new Set())
    // Más m³ primero.
    expect(grupos.map(g => g.fiscal)).toEqual(['DFC', 'CLIR'])
    const clir = grupos[1]
    expect(clir.m3).toBe(10)
    expect(clir.kg).toBe(1700)
    expect(clir.cargas).toBe(2)
    expect(clir.depositos.map(d => d.deposito)).toEqual(['PLANIR', 'GODILCO'])
    const x = clir.depositos[0].items[0]
    expect(x.diasEsperando).toBe(43)
    expect(x.almacenaje?.vencido).toBe(true)
    const e163 = clir.depositos[1].items[0]
    expect(e163.diasEsperando).toBe(7)
    expect(e163.almacenaje?.vence).toBe('2026-09-24')
  })

  it('prioridad manda: el fiscal va primero y la carga arriba; stand by queda visible pero fuera del total', () => {
    const rows = [
      lcl({ ref: 'GRANDE', fiscal: 'RAFAELA', stock: '1', desconsol_date: HOY, m3: 40 }),
      lcl({ ref: 'URGENTE', fiscal: 'CACEC', stock: '2', desconsol_date: HOY, m3: 1, marca_cliente: 'prioridad', marca_motivo: 'cliente la pide ya' }),
      lcl({ ref: 'QUIETA', fiscal: 'CACEC', stock: '3', desconsol_date: HOY, m3: 9, marca_cliente: 'stand_by' }),
      lcl({ ref: 'NORMAL', fiscal: 'CACEC', stock: '4', desconsol_date: '2026-08-20', m3: 2 }),
    ]
    const grupos = listasParaCamion(rows, HOY, new Set())
    expect(grupos.map(g => g.fiscal)).toEqual(['CACEC', 'RAFAELA'])
    const cacec = grupos[0]
    expect(cacec.prioridad).toBe(true)
    expect(cacec.m3).toBe(3)       // sin la stand by
    expect(cacec.standBy).toBe(1)
    expect(cacec.depositos[0].items.map(i => i.row.ref)).toEqual(['URGENTE', 'NORMAL', 'QUIETA'])
  })

  it('las que ya están en un camión no son candidatas; sin fiscal o depósito van a "Sin …"', () => {
    const rows = [
      lcl({ ref: 'ASIGNADA', stock: '1', desconsol_date: HOY }),
      lcl({ ref: 'HUERFANA', stock: '2', desconsol_date: HOY, fiscal: '', deposito: '' }),
    ]
    const grupos = listasParaCamion(rows, HOY, new Set(['ASIGNADA']))
    expect(grupos).toHaveLength(1)
    expect(grupos[0].fiscal).toBeNull()
    expect(grupos[0].depositos[0].deposito).toBeNull()
  })
})

describe('camionesLcl — camiones con carga LCL en planificación, cargados o en ruta', () => {
  it('toma solo camiones publicados con alguna carga lcl y no entregados', () => {
    const plan = camion({ code: 'C460' })
    const cargado = camion({ code: 'C461', loadDate: '2026-08-31' })
    const enRuta = camion({ code: 'C462', loadDate: '2026-08-29', departureDate: '2026-08-30' })
    const entregado = camion({ code: 'C463', loadDate: '2026-08-20', departureDate: '2026-08-21', arrivalDate: '2026-08-25' })
    const soloFcl = camion({ code: 'C464' })
    const borrador = camion({ code: 'C465', draft: true })
    const loads = [
      carga(plan.id, 'E163 A'), carga(plan.id, 'A7757', { sourceType: 'fcl' }),
      carga(cargado.id, 'E205'), carga(enRuta.id, 'LCL247'), carga(entregado.id, 'X'),
      carga(soloFcl.id, 'A7700', { sourceType: 'fcl' }), carga(borrador.id, 'Y'),
    ]
    const r = camionesLcl([plan, cargado, enRuta, entregado, soloFcl, borrador], loads, HOY_DATE)
    expect(r.map(c => c.truck.code)).toEqual(['C462', 'C461', 'C460'])
    expect(r[2].lclRefs).toEqual(['E163 A'])
    expect(r[2].loads).toHaveLength(2)
    expect(r[0].info.status).toBe('in_transit')
  })

  it('un camión que salió hace más de 10 días sin arribo cargado ya no es "hoy" (los importados quedaban En Frontera para siempre)', () => {
    const viejo = camion({ code: 'C300', loadDate: '2026-08-10', departureDate: '2026-08-11' })
    const justo = camion({ code: 'C301', loadDate: '2026-08-21', departureDate: '2026-08-22' })   // hace exactamente 10 días: todavía se ve
    const reciente = camion({ code: 'C302', loadDate: '2026-08-28', departureDate: '2026-08-29' })
    const sinSalir = camion({ code: 'C303', loadDate: '2026-08-01' })
    const loads = [carga(viejo.id, 'A'), carga(justo.id, 'B'), carga(reciente.id, 'C'), carga(sinSalir.id, 'D')]
    const r = camionesLcl([viejo, justo, reciente, sinSalir], loads, HOY_DATE)
    expect(r.map(c => c.truck.code)).toEqual(['C301', 'C302', 'C303'])
  })

  it('ocupación sobre el límite del tipo de camión; una carga marcada para quitar sigue contando', () => {
    const t = camion({ isSider: true })
    const loads = [carga(t.id, 'A', { m3: 40, kg: 12250 }), carga(t.id, 'B', { m3: 40, kg: 12250, pending: 'remove' }), carga(t.id, 'C', { pending: 'add' })]
    const [c] = camionesLcl([t], loads, HOY_DATE)
    expect(c.totals.m3).toBe(80)
    expect(c.totals.m3Pct).toBeCloseTo(1)
    expect(c.totals.kgPct).toBeCloseTo(1)
    expect(c.loads).toHaveLength(2)
  })
})

describe('lclActivas — solo las que pasan por Montevideo', () => {
  it('sin puerto o MONTEVIDEO entran; otro puerto cargado queda afuera', () => {
    const rows = [
      lcl({ ref: 'SIN', discharge_port: '' }),
      lcl({ ref: 'MVD', discharge_port: 'MONTEVIDEO' }),
      lcl({ ref: 'BUE', discharge_port: 'BUENOS AIRES' }),
    ]
    expect(lclActivas(rows, new Set()).map(r => r.ref)).toEqual(['SIN', 'MVD'])
  })

  it('la fila real del bloque LCL BUENOS AIRES (dest_country AR, puerto vacío, agente CRAFT ARGENTINA) queda afuera y sin sugerencia de depósito', () => {
    const bue = lcl({ ref: 'R84I', dest_country: 'AR', discharge_port: '', deposito: '', agente: 'CRAFT ARGENTINA', stock: '77', desconsol_date: HOY })
    const mvd = lcl({ ref: 'E163 A', dest_country: 'UY', discharge_port: '', deposito: '', agente: 'CRAFT', stock: '78', desconsol_date: HOY })
    const activas = lclActivas([bue, mvd], new Set())
    expect(activas.map(r => r.ref)).toEqual(['E163 A'])
    // Lo que se deriva de las activas no la ve: ni faltantes (chip Sugerido PLANIR) ni listas para camión.
    expect(datosFaltantes(activas, HOY).porCarga.map(x => x.row.ref)).toEqual(['E163 A'])
    expect(listasParaCamion(activas, HOY, new Set()).flatMap(g => g.depositos.flatMap(d => d.items.map(i => i.row.ref)))).toEqual(['E163 A'])
  })
})

describe('listasParaCamion — depósito supuesto por agente', () => {
  it('sin depósito pero con agente CRAFT agrupa en PLANIR y lo marca supuesto', () => {
    const rows = [
      lcl({ ref: 'REAL', stock: '1', desconsol_date: HOY, deposito: 'PLANIR' }),
      lcl({ ref: 'SUP', stock: '2', desconsol_date: HOY, deposito: '', agente: 'CRAFT MULTIMODAL' }),
      lcl({ ref: 'NADA', stock: '3', desconsol_date: HOY, deposito: '', agente: '' }),
    ]
    const [g] = listasParaCamion(rows, HOY, new Set())
    expect(g.depositos.map(d => d.deposito)).toEqual(['PLANIR', null])
    const planir = g.depositos[0]
    expect(planir.supuesto).toBe(true)
    expect(planir.items.map(i => [i.row.ref, i.depositoSupuesto])).toEqual([['REAL', false], ['SUP', true]])
    expect(g.depositos[1].supuesto).toBe(false)
  })
})

describe('datosFaltantes — carga que no está completa no viaja', () => {
  it('reclama exactamente los datos reclamables de DATOS_CLAVE.lcl', () => {
    expect(CAMPOS_FALTANTES_LCL.map(d => d.key)).toEqual(reclamables('lcl').map(d => d.key))
    expect(CAMPOS_FALTANTES_LCL.map(d => d.key)).toEqual(['fiscal', 'pkgs', 'kg', 'm3', 'wood', 'eta', 'deposito'])
  })

  it('agrupa por qué le falta y cuenta cargas distintas', () => {
    const rows = [
      lcl({ ref: 'OK' }),
      lcl({ ref: 'SINBL', doc_number: '', hbl: '' }),            // el BL no se reclama acá
      lcl({ ref: 'SINTODO', fiscal: '', eta: '', kg: 0, m3: 0, pkgs: 0, wood: null, deposito: '' }),
      lcl({ ref: 'SINM3', m3: 0 }),
      lcl({ ref: 'MADERA', wood: null }),
    ]
    const f = datosFaltantes(rows, HOY)
    expect(f.total).toBe(3)
    const porCampo = Object.fromEntries(f.porCampo.map(g => [g.campo, g.rows.map(r => r.ref)]))
    expect(porCampo.fiscal).toEqual(['SINTODO'])
    expect(porCampo.eta).toEqual(['SINTODO'])
    expect(porCampo.pkgs).toEqual(['SINTODO'])
    expect(porCampo.kg).toEqual(['SINTODO'])
    expect(porCampo.m3).toEqual(['SINTODO', 'SINM3'])
    expect(porCampo.wood).toEqual(['SINTODO', 'MADERA'])
    expect(porCampo.deposito).toEqual(['SINTODO'])
    expect(porCampo.cliente).toBeUndefined()
    expect(f.porCampo.every(g => g.label.length > 0)).toBe(true)
  })

  it('IMO y entrega en planta en false no faltan; madera false tampoco', () => {
    const f = datosFaltantes([lcl({ imo: false, entrega_planta: false, wood: false })], HOY)
    expect(f.total).toBe(0)
  })

  it('sin faltantes: lista vacía y total 0', () => {
    const f = datosFaltantes([lcl()], HOY)
    expect(f.total).toBe(0)
    expect(f.porCampo).toEqual([])
  })

  it('por carga: qué le falta a cada una, en el orden de la lista', () => {
    const f = datosFaltantes([lcl({ ref: 'A', deposito: '', m3: 0, fiscal: '' })], HOY)
    expect(f.porCarga[0].faltan.map(d => d.key)).toEqual(['fiscal', 'm3', 'deposito'])
  })

  it('primero las que ya llegaron o llegan en 7 días; después el resto; sin ETA al final', () => {
    const rows = [
      lcl({ ref: 'LEJOS', m3: 0, eta: '2026-09-20' }),
      lcl({ ref: 'SINETA', m3: 0, eta: '' }),
      lcl({ ref: 'MANANA', m3: 0, eta: '2026-09-02' }),
      lcl({ ref: 'LLEGO', m3: 0, eta: '2026-08-25' }),
      lcl({ ref: 'BORDE', m3: 0, eta: '2026-09-08' }),
      lcl({ ref: 'AFUERA', m3: 0, eta: '2026-09-09' }),
    ]
    const f = datosFaltantes(rows, HOY)
    expect(f.porCarga.map(x => x.row.ref)).toEqual(['LLEGO', 'MANANA', 'BORDE', 'AFUERA', 'LEJOS', 'SINETA'])
    expect(f.porCarga.map(x => x.urgente)).toEqual([true, true, true, false, false, false])
    expect(f.urgentes).toBe(3)
    expect(f.porCarga[0].diasAEta).toBe(-7)
  })

  it('depósito vacío con agente CRAFT/SACO trae la sugerencia; con depósito cargado no', () => {
    const rows = [
      lcl({ ref: 'C', deposito: '', agente: 'CRAFT' }),
      lcl({ ref: 'S', deposito: '', agente: 'Saco Shipping' }),
      lcl({ ref: 'X', deposito: '', agente: 'OTRO' }),
      lcl({ ref: 'OK', deposito: 'GODILCO', agente: 'CRAFT', m3: 0 }),
    ]
    const f = datosFaltantes(rows, HOY)
    const por = Object.fromEntries(f.porCarga.map(x => [x.row.ref, x.depositoSugerido]))
    expect(por.C).toMatchObject({ deposito: 'PLANIR', supuesto: true, agente: 'CRAFT' })
    expect(por.S).toMatchObject({ deposito: 'TCP', supuesto: true, agente: 'SACO' })
    expect(por.X).toBeNull()
    expect(por.OK).toBeNull()
  })
})

describe('patchFaltanteLcl — de lo tipeado al PATCH', () => {
  it('números: coma decimal y punto de miles; bultos enteros; 0 o basura rebotan', () => {
    expect(patchFaltanteLcl('kg', '1.250,5')).toEqual({ ok: true, patch: { kg: 1250.5 } })
    expect(patchFaltanteLcl('m3', '3,2')).toEqual({ ok: true, patch: { m3: 3.2 } })
    expect(patchFaltanteLcl('pkgs', '12,6')).toEqual({ ok: true, patch: { pkgs: 13 } })
    expect(patchFaltanteLcl('kg', '0').ok).toBe(false)
    expect(patchFaltanteLcl('kg', 'abc').ok).toBe(false)
    expect(patchFaltanteLcl('pkgs', '0,4').ok).toBe(false)
  })
  it('fecha ISO con año razonable', () => {
    expect(patchFaltanteLcl('eta', '2026-09-03')).toEqual({ ok: true, patch: { eta: '2026-09-03' } })
    expect(patchFaltanteLcl('eta', '0002-09-03').ok).toBe(false)
    expect(patchFaltanteLcl('eta', '03/09/2026').ok).toBe(false)
  })
  it('fiscal y depósito en mayúsculas; madera Sí/No', () => {
    expect(patchFaltanteLcl('fiscal', ' rafaela ')).toEqual({ ok: true, patch: { fiscal: 'RAFAELA' } })
    expect(patchFaltanteLcl('deposito', 'planir')).toEqual({ ok: true, patch: { deposito: 'PLANIR' } })
    expect(patchFaltanteLcl('wood', 'si')).toEqual({ ok: true, patch: { wood: true } })
    expect(patchFaltanteLcl('wood', 'No')).toEqual({ ok: true, patch: { wood: false } })
    expect(patchFaltanteLcl('wood', 'quizás').ok).toBe(false)
  })
  it('vacío rebota', () => {
    expect(patchFaltanteLcl('fiscal', '   ').ok).toBe(false)
  })
})
