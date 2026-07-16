import { describe, it, expect } from 'vitest'
import { photosForStage, mergePhotoSubset, reportsForRef, groupPhotosByCntr } from './OperationMediaSection'
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

describe('groupPhotosByCntr', () => {
  const mk = (id: string, cntr?: string): OriginPhoto => ({
    id, shipmentRef: 'A7796', containerNumber: cntr,
    fileName: `${id}.jpg`, fileType: 'image/jpeg',
    createdAt: 1, createdBy: 'admin',
  })
  const CNTRS = ['MSCU1111111', 'MSCU2222222']

  it('agrupa por contenedor: toda-la-carga primero, después en orden de la carga', () => {
    const photos = [mk('a', 'MSCU2222222'), mk('b'), mk('c', 'MSCU1111111'), mk('d', 'MSCU1111111')]
    const groups = groupPhotosByCntr(photos, CNTRS)
    expect(groups.map(g => g.cntr)).toEqual(['', 'MSCU1111111', 'MSCU2222222'])
    expect(groups[1].photos.map(p => p.id)).toEqual(['c', 'd'])
  })

  it('contenedor que ya no está en la carga (dividida/renombrada) va al final, no se pierde', () => {
    const photos = [mk('a', 'VIEJO9999999'), mk('b', 'MSCU1111111')]
    const groups = groupPhotosByCntr(photos, CNTRS)
    expect(groups.map(g => g.cntr)).toEqual(['MSCU1111111', 'VIEJO9999999'])
  })

  it('sin grupos vacíos y matchea case-insensitive/trim', () => {
    const photos = [mk('a', ' mscu1111111 ')]
    const groups = groupPhotosByCntr(photos, CNTRS)
    expect(groups).toHaveLength(1)
    expect(groups[0].cntr).toBe('MSCU1111111')
  })
})
