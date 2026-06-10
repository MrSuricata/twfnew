import { describe, it, expect } from 'vitest'
import { matchesClientePattern, zonaFromPOD, parseMainSheetCSV, filterShipments, fclMirrorRows } from './csvParser.js'

describe('zonaFromPOD', () => {
  it('Montevideo â†’ UY', () => { expect(zonaFromPOD('MONTEVIDEO ')).toBe('UY') })
  it('Buenos Aires â†’ AR', () => { expect(zonaFromPOD('Buenos Aires')).toBe('AR') })
  it('puertos chilenos â†’ CL', () => {
    expect(zonaFromPOD('VALPARAISO')).toBe('CL')
    expect(zonaFromPOD('San Antonio')).toBe('CL')
  })
  it('vacÃ­o/desconocido â†’ OTRO', () => {
    expect(zonaFromPOD('')).toBe('OTRO')
    expect(zonaFromPOD('LISBOA')).toBe('OTRO')
  })
})

describe('parseMainSheetCSV â€” SG nuevo', () => {
  const csv = [
    ',CONSIGNEE,NOTA,SEGUIMIENTO,BOOKING,LINEA,POL,POD,ETD,ETA,CONTS,N,TIPO,ESTADO,OPERATIVO,NOMBRE BUQUE,OPERATIVA,PUERTO,CTERMINAL,CDEV,LOCALES,FLETE,FORMA_PAGO,VTO,CR,BL,AD,AT',
    'A6644,TP SRL ADD,,15/08/2025,6416381990,COSCO ,YANTIAN,MONTEVIDEO ,5/09/2025,18/06/2025,MSCU1,1,40HQ,Puerto,DOR,EVER GIVEN,,TCP,"0,00","0,00","0,00","0,00",PROGRAMADO,1/01/2026,TRUE,TRUE,TRUE,TRUE',
    'A6700 CHILE,CLIENTE X,,,,MAERSK,SHANGHAI,VALPARAISO,,,,1,40HQ,,,SAN BUQUE,,,"0,00","0,00","0,00","0,00",,,FALSE,FALSE,FALSE,FALSE',
  ].join('\n')
  const rows = parseMainSheetCSV(csv)
  it('mapea Ref (col 0 sin header)', () => { expect(rows[0].REF).toBe('A6644') })
  it('CONSIGNEEâ†’CLIENTE, BOOKINGâ†’MBL, POL/POD, NOMBRE BUQUEâ†’BUQUE, CONTSâ†’CNTR, TIPO, PAIS', () => {
    expect(rows[0].CLIENTE).toBe('TP SRL ADD')
    expect(rows[0].MBL).toBe('6416381990')
    expect(rows[0].POL).toBe('YANTIAN')
    expect(rows[0].POD?.trim()).toBe('MONTEVIDEO')
    expect(rows[0].BUQUE).toBe('EVER GIVEN')
    expect(rows[0].CNTR).toBe('MSCU1')
    expect(rows[0].TIPO).toBe('40HQ')
    expect(rows[0].PAIS).toBe('UY')
  })
  it('incluye carga Chile (POD ValparaÃ­so â†’ CL) aunque sin CLIENTE estricto', () => {
    const cl = rows.find(r => r.REF === 'A6700 CHILE')
    expect(cl).toBeTruthy()
    expect(cl!.PAIS).toBe('CL')
  })
})

describe('filterShipments â€” incluye Chile/BA', () => {
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
  it('supports comma-separated patterns, each â‰¥5 chars', () => {
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

describe('fclMirrorRows - espejo FCL (Etapa 1 migracion)', () => {
  const mk = (over: Record<string, unknown> = {}) => ({
    REF: 'A6902', CLIENTE: 'CONTROL UNO', MBL: 'BK1', CNTR: 'TEMU1', BUQUE: 'EVER', LINEA: 'COSCO',
    POL: 'YANTIAN', POD: 'MONTEVIDEO', PAIS: 'UY', SEGUIMIENTO: '15/08/2025', TIPO: '40HC',
    ETD: '2025-09-01', ETA: '2025-10-09',
    operativas: [{ PKGS: 10, KG: 100, M3: 5, DEPOSITO: 'GODILCO', FISCAL: 'CORDOBA', TRANSPORTE: 'TRANSCAL', DESCRIPCION: 'BICIS', WOOD: 'NO' }],
    ...over,
  }) as never

  it('mapea campos y suma operativas; mode=fcl source=sheet', () => {
    const rows = fclMirrorRows([mk()], 123)
    expect(rows).toHaveLength(1)
    const r = rows[0] as Record<string, unknown>
    expect(r.mode).toBe('fcl')
    expect(r.source).toBe('sheet')
    expect(r.doc_number).toBe('BK1')
    expect(r.origin).toBe('YANTIAN')
    expect(r.discharge_port).toBe('MONTEVIDEO')
    expect(r.dest_country).toBe('UY')
    expect(r.tipo).toBe('40HC')
    expect(r.kg).toBe(100)
    expect(r.fiscal).toBe('CORDOBA')
    expect(r.updated_at_ts).toBe(123)
    expect(r.sheet_raw).toBeTruthy()
    expect((r.sheet_raw as Record<string, unknown>).REF).toBe('A6902')
  })

  it('refs duplicadas (2 clientes) -> 2 filas con id distinto y ESTABLE ante reorden', () => {
    const a = mk()
    const b = mk({ CLIENTE: 'TOOL SHOP SRL', MBL: 'BK2' })
    const rows1 = fclMirrorRows([a, b], 1)
    const rows2 = fclMirrorRows([b, a], 2)
    expect(rows1).toHaveLength(2)
    expect(rows1[0].id).not.toBe(rows1[1].id)
    expect(new Set(rows1.map(r => r.id))).toEqual(new Set(rows2.map(r => r.id)))
  })

  it('fila identica repetida en la planilla -> una sola', () => {
    expect(fclMirrorRows([mk(), mk()], 1)).toHaveLength(1)
  })
})

describe('filterShipments - solo refs FCL (A####)', () => {
  const mk2 = (REF: string) => ({ REF, PAIS: 'UY', POD: 'MONTEVIDEO', operativas: [] }) as never
  it('excluye las filas LCL/E que el equipo anota en la misma hoja del SG', () => {
    const out = filterShipments([mk2('A8000'), mk2('E64'), mk2('LCL12348'), mk2('LCL30'), mk2('A7611 B')])
    expect(out.map((s: { REF: string }) => s.REF)).toEqual(['A8000', 'A7611 B'])
  })
})
