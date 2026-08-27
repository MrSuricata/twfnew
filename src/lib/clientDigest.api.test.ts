import { describe, it, expect } from 'vitest'
import {
  parseFechaDigest, deriveEstadoDigest, effectiveClientePattern,
  refSinA, esViaMontevideo, emailsDigest, buildClientDigest,
} from '../../api/_lib/clientDigest'

// El digest sale POR MAIL al cliente: estos tests fijan el mismo contrato de
// seguridad que el portal (qué viaja, qué JAMÁS) + las reglas de la spec
// 2026-08-27 (vía UY, REF sin A, estados, fallback de emails).

const HOY = '2026-08-27'

describe('parseFechaDigest', () => {
  it('ISO, dd/mm/yyyy y dd-mmm; basura → null', () => {
    expect(parseFechaDigest('2026-09-05')).toBe('2026-09-05')
    expect(parseFechaDigest('2026-09-05T00:00:00Z')).toBe('2026-09-05')
    expect(parseFechaDigest('05/09/2026')).toBe('2026-09-05')
    expect(parseFechaDigest('5-sep')).toBe('2026-09-05')
    expect(parseFechaDigest('CONFIRMAR')).toBe(null)
    expect(parseFechaDigest('')).toBe(null)
  })
})

describe('refSinA', () => {
  it('quita la A inicial (regla emails con clientes), conserva splits', () => {
    expect(refSinA('A7620')).toBe('7620')
    expect(refSinA('A7611 B')).toBe('7611 B')
    expect(refSinA('7620')).toBe('7620')
  })
})

describe('esViaMontevideo', () => {
  it('solo dest_country UY (case-insensitive); CL/AR/vacío afuera', () => {
    expect(esViaMontevideo({ dest_country: 'UY' })).toBe(true)
    expect(esViaMontevideo({ dest_country: 'uy ' })).toBe(true)
    expect(esViaMontevideo({ dest_country: 'CL' })).toBe(false)
    expect(esViaMontevideo({ dest_country: 'AR' })).toBe(false)
    expect(esViaMontevideo({ dest_country: '' })).toBe(false)
    expect(esViaMontevideo({})).toBe(false)
  })
})

describe('effectiveClientePattern (espejo admin-login)', () => {
  it('guardado gana; si no, derivado de name+aliases con tokens ≥4', () => {
    expect(effectiveClientePattern({ name: 'X', cliente_pattern: 'CHIAPERO' })).toBe('CHIAPERO')
    expect(effectiveClientePattern({ name: 'RDM - ABEA S.A.', aliases: 'RDM - ABEA' }))
      .toBe('RDM - ABEA S.A.,RDM - ABEA')
    expect(effectiveClientePattern({ name: 'AIT' })).toBe('')
  })
})

describe('emailsDigest', () => {
  it('digest_emails > email principal > vacío', () => {
    expect(emailsDigest({ digest_emails: 'a@x.com, b@x.com', email: 'c@x.com' })).toBe('a@x.com, b@x.com')
    expect(emailsDigest({ digest_emails: '', email: 'c@x.com' })).toBe('c@x.com')
    expect(emailsDigest({ digest_emails: '', email: '' })).toBe('')
  })
})

describe('deriveEstadoDigest (espejo slim de getShipmentStatus)', () => {
  const conOp = (op: Record<string, unknown>, eta = '2026-08-20') =>
    ({ ETA: eta, operativas: [{ SALIDA: '', ETA_FISC: '', ...op }] }) as Parameters<typeof deriveEstadoDigest>[0]
  it('ETA futura → en viaje', () => {
    expect(deriveEstadoDigest({ ETA: '2026-09-05', operativas: [] }, HOY).code).toBe('en_transito')
  })
  it('arribada sin salida → en puerto', () => {
    expect(deriveEstadoDigest(conOp({}), HOY).code).toBe('en_puerto')
  })
  it('salida futura → salida programada con fecha', () => {
    const e = deriveEstadoDigest(conOp({ SALIDA: '2026-08-29' }), HOY)
    expect(e.code).toBe('salida_programada')
    expect(e.fecha).toBe('2026-08-29')
  })
  it('salida hoy → sale hoy', () => {
    expect(deriveEstadoDigest(conOp({ SALIDA: HOY }), HOY).code).toBe('salio_montevideo')
  })
  it('salida pasada sin fiscal → en frontera', () => {
    expect(deriveEstadoDigest(conOp({ SALIDA: '2026-08-25' }), HOY).code).toBe('en_frontera')
  })
  it('salida y fiscal pasados → en fiscal', () => {
    expect(deriveEstadoDigest(conOp({ SALIDA: '2026-08-20', ETA_FISC: '2026-08-26' }), HOY).code).toBe('llego_fiscal')
  })
  it('sin operativas y ETA pasada → en puerto', () => {
    expect(deriveEstadoDigest({ ETA: '2026-08-20', operativas: [] }, HOY).code).toBe('en_puerto')
  })
})

describe('buildClientDigest', () => {
  const clientes = [
    { name: 'CHIAPERO Y ASOC. S.R.L.', company: '', email: 'chiapero@x.com', aliases: '', cliente_pattern: 'CHIAPERO', digest_active: true, digest_emails: '' },
    { name: 'RDM - ABEA S.A.', company: 'Abea', email: '', aliases: 'RDM - ABEA', cliente_pattern: '', digest_active: true, digest_emails: '' },
  ]
  const filas = [
    { ref: 'A7620', cliente: 'CHIAPERO Y ASOC. S.R.L.', archived: false, source: 'fcl', mode: 'fcl', eta: '2026-09-05', eta_fiscal: '', dest_country: 'UY', buque: 'MSC ALTAIR', contenedor: 'MSCU1234567', flete: 99999, operativas: [] },
    { ref: 'A7621', cliente: 'CHIAPERO Y ASOC SRL', archived: false, source: 'web', mode: 'fcl', eta: '2026-09-01', eta_fiscal: '', dest_country: 'CL', operativas: [] },
    { ref: 'A7622', cliente: 'RDM - ABEA S.A.', archived: false, source: 'fcl', mode: 'fcl', eta: '2026-08-20', eta_fiscal: '', dest_country: 'UY', operativas: [{ SALIDA: '2026-08-29', ETA_FISC: '', DESCARGA: '', PKGS: 10, KG: 500, M3: 3 }] },
    { ref: 'A7623', cliente: 'OTRO CLIENTE S.A.', archived: false, source: 'fcl', mode: 'fcl', eta: '2026-09-02', eta_fiscal: '', dest_country: 'UY', operativas: [] },
  ]
  const digest = buildClientDigest(clientes, filas, HOY)

  it('agrupa por patrón, filtra vía UY, ignora otros clientes', () => {
    const chiapero = digest.clients.find(c => c.name.includes('CHIAPERO'))!
    expect(chiapero.cargas.map(c => c.REF)).toEqual(['7620'])   // la 7621 es vía CL
    const abea = digest.clients.find(c => c.name.includes('ABEA'))!
    expect(abea.cargas).toHaveLength(1)
    expect(abea.cargas[0].estado.code).toBe('salida_programada')
    expect(abea.cargas[0].PKGS).toBe(10)
    expect(digest.clients.some(c => c.name.includes('OTRO'))).toBe(false)
  })
  it('REF sin A y sin nombre de cliente en las cargas', () => {
    const todas = digest.clients.flatMap(c => c.cargas)
    expect(todas.length).toBeGreaterThan(0)
    expect(todas.every(c => !c.REF.startsWith('A'))).toBe(true)
    expect(JSON.stringify(todas)).not.toContain('CHIAPERO')
  })
  it('JAMÁS viaja un campo financiero', () => {
    const json = JSON.stringify(digest)
    expect(json).not.toContain('99999')
    expect(json.toLowerCase()).not.toContain('flete')
  })
  it('emails con fallback y flag sinEmail', () => {
    expect(digest.clients.find(c => c.name.includes('CHIAPERO'))!.emails).toBe('chiapero@x.com')
    expect(digest.clients.find(c => c.name.includes('ABEA'))!.sinEmail).toBe(true)
  })
})
