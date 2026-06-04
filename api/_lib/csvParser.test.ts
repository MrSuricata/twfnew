import { describe, it, expect } from 'vitest'
import { matchesClientePattern, zonaFromPOD, parseMainSheetCSV, filterShipments } from './csvParser.js'

describe('zonaFromPOD', () => {
  it('Montevideo → UY', () => { expect(zonaFromPOD('MONTEVIDEO ')).toBe('UY') })
  it('Buenos Aires → AR', () => { expect(zonaFromPOD('Buenos Aires')).toBe('AR') })
  it('puertos chilenos → CL', () => {
    expect(zonaFromPOD('VALPARAISO')).toBe('CL')
    expect(zonaFromPOD('San Antonio')).toBe('CL')
  })
  it('vacío/desconocido → OTRO', () => {
    expect(zonaFromPOD('')).toBe('OTRO')
    expect(zonaFromPOD('LISBOA')).toBe('OTRO')
  })
})

describe('parseMainSheetCSV — SG nuevo', () => {
  const csv = [
    ',CONSIGNEE,NOTA,SEGUIMIENTO,BOOKING,LINEA,POL,POD,ETD,ETA,CONTS,N,TIPO,ESTADO,OPERATIVO,NOMBRE BUQUE,OPERATIVA,PUERTO,CTERMINAL,CDEV,LOCALES,FLETE,FORMA_PAGO,VTO,CR,BL,AD,AT',
    'A6644,TP SRL ADD,,15/08/2025,6416381990,COSCO ,YANTIAN,MONTEVIDEO ,5/09/2025,18/06/2025,MSCU1,1,40HQ,Puerto,DOR,EVER GIVEN,,TCP,"0,00","0,00","0,00","0,00",PROGRAMADO,1/01/2026,TRUE,TRUE,TRUE,TRUE',
    'A6700 CHILE,CLIENTE X,,,,MAERSK,SHANGHAI,VALPARAISO,,,,1,40HQ,,,SAN BUQUE,,,"0,00","0,00","0,00","0,00",,,FALSE,FALSE,FALSE,FALSE',
  ].join('\n')
  const rows = parseMainSheetCSV(csv)
  it('mapea Ref (col 0 sin header)', () => { expect(rows[0].REF).toBe('A6644') })
  it('CONSIGNEE→CLIENTE, BOOKING→MBL, POL/POD, NOMBRE BUQUE→BUQUE, CONTS→CNTR, TIPO, PAIS', () => {
    expect(rows[0].CLIENTE).toBe('TP SRL ADD')
    expect(rows[0].MBL).toBe('6416381990')
    expect(rows[0].POL).toBe('YANTIAN')
    expect(rows[0].POD?.trim()).toBe('MONTEVIDEO')
    expect(rows[0].BUQUE).toBe('EVER GIVEN')
    expect(rows[0].CNTR).toBe('MSCU1')
    expect(rows[0].TIPO).toBe('40HQ')
    expect(rows[0].PAIS).toBe('UY')
  })
  it('incluye carga Chile (POD Valparaíso → CL) aunque sin CLIENTE estricto', () => {
    const cl = rows.find(r => r.REF === 'A6700 CHILE')
    expect(cl).toBeTruthy()
    expect(cl!.PAIS).toBe('CL')
  })
})

describe('filterShipments — incluye Chile/BA', () => {
  const mk = (REF: string, PAIS: any, POD: string) => ({ REF, PAIS, POD, TERMINAL: POD, operativas: [] } as any)
  const out = filterShipments([mk('A1', 'CL', 'VALPARAISO'), mk('A2', 'AR', 'BUENOS AIRES'), mk('A3', 'UY', 'MONTEVIDEO')])
  it('mantiene las 3 zonas', () => { expect(out.map(s => s.REF).sort()).toEqual(['A1', 'A2', 'A3']) })
})

describe('matchesClientePattern (hardened)', () => {
  it('matches exact word', () => {
    expect(matchesClientePattern('CHIAPERO', 'CHIAPERO')).toBe(true)
  })
  it('matches with surrounding spaces/punctuation', () => {
    expect(matchesClientePattern('ACME CHIAPERO SRL', 'CHIAPERO')).toBe(true)
    expect(matchesClientePattern('CHIAPERO,VENTAS', 'CHIAPERO')).toBe(true)
  })
  it('rejects patterns shorter than 5 chars (drops them silently)', () => {
    expect(matchesClientePattern('ACME SA', 'SA')).toBe(false)
  })
  it('does NOT match substring mid-word', () => {
    expect(matchesClientePattern('SANTOS MARIA', 'SANTO')).toBe(false)
    expect(matchesClientePattern('SANTOS MARIA', 'SANTOS')).toBe(true)
  })
  it('case-insensitive', () => {
    expect(matchesClientePattern('chiapero srl', 'CHIAPERO')).toBe(true)
  })
  it('supports comma-separated patterns, each ≥5 chars', () => {
    expect(matchesClientePattern('MARTINEZ S.A.', 'CHIAPERO,MARTINEZ')).toBe(true)
    expect(matchesClientePattern('PEREZ S.A.', 'CHIAPERO,MARTINEZ')).toBe(false)
  })
  it('returns false for empty inputs', () => {
    expect(matchesClientePattern('', 'CHIAPERO')).toBe(false)
    expect(matchesClientePattern('ACME', '')).toBe(false)
  })
  it('escapes regex metacharacters in the pattern', () => {
    expect(matchesClientePattern('COMPANY', 'CO.PANY')).toBe(false) // literal dot
  })
  it('drops short patterns but keeps long ones from a comma list', () => {
    expect(matchesClientePattern('CHIAPERO HNOS', 'SA,CHIAPERO')).toBe(true)
    expect(matchesClientePattern('SANTOS MARIA', 'SA,PEREZ')).toBe(false)
  })
})
