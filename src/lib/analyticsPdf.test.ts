import { describe, it, expect } from 'vitest'
import { buildAnalyticsReport } from './analyticsPdf'
import { op } from './analyticsUtils.test'
import type { Truck, TruckLoad } from './truckTypes'

const NOW = new Date(2026, 5, 11)
const t1: Truck = {
  id: 't1', code: 'C430', status: 'delivered', isSider: false, transport: 'OLAVERRY',
  driver: '', plate: '', loadDate: '2026-03-05', departureDate: '', arrivalDate: '',
  notes: '', createdAt: 0, updatedAt: 0,
} as Truck
const l1: TruckLoad = {
  id: 'l1', truckId: 't1', sourceType: 'shipment', sourceRef: 'LCL-1', client: '',
  fiscal: '', kg: 100, m3: 1, pkgs: 2, description: '', mvdArrival: '',
  desconsolDate: '', overrides: {}, position: 0,
} as TruckLoad

describe('buildAnalyticsReport', () => {
  const ops = [
    op({ ref: 'A1', cliente: 'PERETTI', eta: '15/3/2026', n: 2, kg: 1000, pkgs: 10, m3: 5 }),
    op({ ref: 'L1', mode: 'lcl', cliente: 'CHIAPERO', eta: '2026-04-01', kg: 500, pkgs: 5, m3: 2 }),
  ]

  it('arma título, subtítulo con filtros y nombre de archivo', () => {
    const r = buildAnalyticsReport(ops, [t1], [l1], { year: 2026, mode: 'all', zone: 'all', now: NOW })
    expect(r.titulo).toBe('REPORTE DE OPERACIONES — 2026')
    expect(r.subtitulo).toContain('Todas las modalidades')
    expect(r.filename).toBe('reporte-mediterranea-2026.pdf')
    const filtrado = buildAnalyticsReport(ops, [t1], [l1], { year: 2026, mode: 'lcl', zone: 'UY', now: NOW })
    expect(filtrado.subtitulo).toContain('LCL')
    expect(filtrado.filename).toBe('reporte-mediterranea-2026-lcl-uy.pdf')
  })

  it('incluye KPIs y las tablas resumen', () => {
    const r = buildAnalyticsReport(ops, [t1], [l1], { year: 2026, mode: 'all', zone: 'all', now: NOW })
    expect(r.kpis.find(k => k.label === 'Cargas')?.value).toBe('2')
    const titles = r.resumen.map(t => t.title)
    expect(titles).toContain('Por modalidad')
    expect(titles).toContain('Consolidados')
  })

  it('detalle tiene una fila por carga con las 10 columnas', () => {
    const r = buildAnalyticsReport(ops, [], [], { year: 2026, mode: 'all', zone: 'all', now: NOW })
    expect(r.detalle.head).toHaveLength(10)
    expect(r.detalle.rows).toHaveLength(2)
    expect(r.detalle.rows[0][0]).toBe('A1')
  })

  it('con filtro FCL no incluye la tabla de consolidados', () => {
    const r = buildAnalyticsReport(ops, [t1], [l1], { year: 2026, mode: 'fcl', zone: 'all', now: NOW })
    expect(r.resumen.map(t => t.title)).not.toContain('Consolidados')
  })

  it('con 0 cargas genera el reporte igual (resumen en cero)', () => {
    const r = buildAnalyticsReport([], [], [], { year: 2026, mode: 'all', zone: 'all', now: NOW })
    expect(r.kpis.find(k => k.label === 'Cargas')?.value).toBe('0')
    expect(r.detalle.rows).toHaveLength(0)
  })
})
