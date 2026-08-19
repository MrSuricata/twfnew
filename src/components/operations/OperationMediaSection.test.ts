import { describe, it, expect } from 'vitest'
import { photosForStage, mergePhotoSubset, reportsForRef, delContenedor } from './OperationMediaSection'
import type { OriginPhoto, OperativeReport } from '@/lib/quotationTypes'

const photo = (over: Partial<OriginPhoto>): OriginPhoto => ({
  id: 'p1', shipmentRef: 'A7581', fileName: 'f.jpg', fileType: 'image/jpeg',
  createdAt: 1, createdBy: 'admin',
  ...over,
})

const report = (over: Partial<OperativeReport>): OperativeReport => ({
  id: 'r1', shipmentRef: 'A7581', title: 'Informe', content: '',
  fileName: 'informe.pdf', fileType: 'application/pdf', createdAt: 1, createdBy: 'admin',
  ...over,
})

describe('photosForStage', () => {
  const photos = [
    photo({ id: 'a', photoType: 'origen' }),
    photo({ id: 'b', photoType: 'uruguay' }),
    photo({ id: 'c' }),                                 // sin photoType → origen (default del server)
    photo({ id: 'd', shipmentRef: 'A7595', photoType: 'uruguay' }),
  ]

  it('matchea por ref exacta (con A, criterio del dialog viejo)', () => {
    expect(photosForStage(photos, 'A7595', 'uruguay').map(p => p.id)).toEqual(['d'])
    // "7581" (sin A) NO matchea "A7581" — igual que ShipmentDetailsDialog
    expect(photosForStage(photos, '7581', 'origen')).toEqual([])
  })

  it('etapa uruguay: solo photoType === uruguay', () => {
    expect(photosForStage(photos, 'A7581', 'uruguay').map(p => p.id)).toEqual(['b'])
  })

  it('etapa origen absorbe photoType vacío (fotos históricas)', () => {
    expect(photosForStage(photos, 'A7581', 'origen').map(p => p.id)).toEqual(['a', 'c'])
  })
})

describe('mergePhotoSubset', () => {
  it('reemplaza el subset mostrado y conserva el resto (otras refs / otra etapa)', () => {
    const all = [
      photo({ id: 'a', photoType: 'origen' }),
      photo({ id: 'b', photoType: 'origen' }),
      photo({ id: 'c', photoType: 'uruguay' }),
      photo({ id: 'd', shipmentRef: 'A7595' }),
    ]
    const shown = [all[0], all[1]]           // galería "origen" de A7581
    const updated = [all[1]]                 // borraron la foto a
    const merged = mergePhotoSubset(all, shown, updated)
    expect(merged.map(p => p.id).sort()).toEqual(['b', 'c', 'd'])
  })
})

describe('reportsForRef', () => {
  it('filtra por ref exacta y ordena más recientes primero', () => {
    const reports = [
      report({ id: 'r1', createdAt: 10 }),
      report({ id: 'r2', createdAt: 30 }),
      report({ id: 'r3', createdAt: 20, shipmentRef: 'A7595' }),
    ]
    expect(reportsForRef(reports, 'A7581').map(r => r.id)).toEqual(['r2', 'r1'])
  })
})

describe('delContenedor — el diálogo muestra un contenedor por vez', () => {
  const f = (id: string, cntr?: string) => ({ id, containerNumber: cntr } as { id: string; containerNumber?: string })

  it('trae solo lo de ese contenedor', () => {
    const l = [f('a', 'EMCU1818703'), f('b', 'EGSU0310260'), f('c', 'EMCU1818703')]
    expect(delContenedor(l, 'EMCU1818703').map(x => x.id)).toEqual(['a', 'c'])
  })

  it("'' es SIN ASIGNAR, no 'todos'", () => {
    // Si '' devolviera todo, subir estando en "sin asignar" mostraría fotos de
    // otros contenedores y volvería a confundir de cuál es cada cosa.
    const l = [f('sin'), f('con', 'EMCU1818703'), f('vacio', '  ')]
    expect(delContenedor(l, '').map(x => x.id)).toEqual(['sin', 'vacio'])
  })

  it('ignora mayúsculas y espacios de los dos lados', () => {
    expect(delContenedor([f('a', ' emcu1818703 ')], 'EMCU1818703')).toHaveLength(1)
  })

  it('sin coincidencias devuelve vacío', () => {
    expect(delContenedor([f('a', 'X')], 'Y')).toEqual([])
  })
})
