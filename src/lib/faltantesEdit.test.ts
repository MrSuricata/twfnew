import { describe, it, expect } from 'vitest'
import { buildFaltantePatch, FALTANTE_INPUTS } from './faltantesEdit'
import type { OperativasRecord } from './shipmentTypes'

const rec = (extra: Partial<OperativasRecord> = {}): OperativasRecord =>
  ({ REF: 'A9999', CNTR_OP: 'MSKU1111111', DEPOSITO: '', LUGAR_SALIDA: '', ...extra }) as OperativasRecord

describe('buildFaltantePatch — arma el patch de un campo faltante', () => {
  it('mapea campo lógico → columna real de shipments', () => {
    expect(buildFaltantePatch('docNumber', ' 271528268 ')).toEqual({ ok: true, patch: { doc_number: '271528268' } })
    expect(buildFaltantePatch('pais', 'UY')).toEqual({ ok: true, patch: { dest_country: 'UY' } })
    expect(buildFaltantePatch('cntr', 'msku1234567')).toEqual({ ok: true, patch: { contenedor: 'MSKU1234567' } })
    expect(buildFaltantePatch('agente', 'Trans-China')).toEqual({ ok: true, patch: { agente: 'Trans-China' } })
  })

  it('números: coma decimal, bultos redondeados, rechaza basura y no-positivos', () => {
    expect(buildFaltantePatch('kg', '8399,75')).toEqual({ ok: true, patch: { kg: 8399.75 } })
    expect(buildFaltantePatch('pkgs', '18')).toEqual({ ok: true, patch: { pkgs: 18 } })
    expect(buildFaltantePatch('m3', 'abc').ok).toBe(false)
    expect(buildFaltantePatch('pkgs', '0').ok).toBe(false)
    expect(buildFaltantePatch('kg', '-5').ok).toBe(false)
    // 0,4 bultos redondea a 0 → el faltante nunca se limpiaría: se rechaza
    expect(buildFaltantePatch('pkgs', '0,4').ok).toBe(false)
    // punto de miles: Number('8.399') = 8,399 kg (1000x menos) → se rechaza
    expect(buildFaltantePatch('kg', '8.399').ok).toBe(false)
    expect(buildFaltantePatch('kg', '1.234.567,8').ok).toBe(false)
  })

  it('contenedor con array operativas: siembra CNTR_OP y la columna = lo que el rollup recomputa', () => {
    // Sin esto, el próximo patch que lleve el array (depósito/operativa)
    // recomputaba contenedor desde CNTR_OP='' y borraba el recién tipeado.
    const r = buildFaltantePatch('cntr', 'msku 1234567', [rec({ CNTR_OP: '' })])
    if (!r.ok) throw new Error('esperaba ok')
    const arr = r.patch.operativas as OperativasRecord[]
    expect(arr).toHaveLength(1)
    expect(arr[0].CNTR_OP).toBe('MSKU1234567')
    expect(r.patch.contenedor).toBe('MSKU1234567')

    // Dos contenedores para un solo registro → se agrega el segundo al array
    const dos = buildFaltantePatch('cntr', 'MSKU1111111 / TCLU2222222', [rec({ CNTR_OP: '' })])
    if (!dos.ok) throw new Error('esperaba ok')
    const arr2 = dos.patch.operativas as OperativasRecord[]
    expect(arr2.map(o => o.CNTR_OP)).toEqual(['MSKU1111111', 'TCLU2222222'])
    expect(dos.patch.contenedor).toBe('MSKU1111111, TCLU2222222')
  })

  it('el segundo contenedor clonado NO arrastra los kilos del primero', () => {
    // El clon copiaba operativas[0] ENTERO, bultos/kg/m3 incluidos — y como el
    // rollup SUMA el array, agregar un contenedor duplicaba el total de la
    // carga (misma familia que el caso A8045).
    const dos = buildFaltantePatch('cntr', 'MSKU1111111 / TCLU2222222',
      [rec({ CNTR_OP: '', PKGS: 463, KG: 4484, M3: 68 })])
    if (!dos.ok) throw new Error('esperaba ok')
    const arr = dos.patch.operativas as OperativasRecord[]
    expect(arr[0].PKGS).toBe(463)      // el primero conserva lo suyo
    expect(arr[1].PKGS).toBe(0)        // el clon nace vacío
    expect(arr[1].KG).toBe(0)
    expect(arr[1].M3).toBe(0)
    expect(arr[1].DEPOSITO).toBe(arr[0].DEPOSITO)  // lo demás sí se hereda
  })

  it('peso/bultos/volumen con UN contenedor también van al array (el rollup no los pisa)', () => {
    const r = buildFaltantePatch('kg', '8399,75', [rec()])
    if (!r.ok) throw new Error('esperaba ok')
    expect(r.patch.kg).toBe(8399.75)
    expect((r.patch.operativas as OperativasRecord[])[0].KG).toBe(8399.75)

    // Con VARIOS contenedores no se puede atribuir el total → solo la columna.
    const multi = buildFaltantePatch('kg', '8399,75', [rec(), rec({ CNTR_OP: 'TCLU9999999' })])
    expect(multi).toEqual({ ok: true, patch: { kg: 8399.75 } })
  })

  it('cliente se canonicaliza contra el catálogo; fiscal va a MAYÚSCULAS', () => {
    const catalogo = [{ name: 'BICI PERETTI S.A.', aliases: 'peretti' }]
    expect(buildFaltantePatch('cliente', 'peretti', undefined, catalogo as never))
      .toEqual({ ok: true, patch: { cliente: 'BICI PERETTI S.A.' } })
    // sin match en el catálogo, el texto libre queda tal cual (regla del panel)
    expect(buildFaltantePatch('cliente', 'Cliente Nuevo SRL'))
      .toEqual({ ok: true, patch: { cliente: 'Cliente Nuevo SRL' } })
    expect(buildFaltantePatch('fiscal', 'cacec')).toEqual({ ok: true, patch: { fiscal: 'CACEC' } })
  })

  it('ETA: ISO válida pasa, año tipeado a medias no ensucia la DB', () => {
    expect(buildFaltantePatch('eta', '2026-08-12')).toEqual({ ok: true, patch: { eta: '2026-08-12' } })
    expect(buildFaltantePatch('eta', '0002-08-12').ok).toBe(false)
    expect(buildFaltantePatch('eta', '12/08/2026').ok).toBe(false)
  })

  it('vacío no genera patch (el input simplemente no guarda)', () => {
    expect(buildFaltantePatch('cliente', '   ').ok).toBe(false)
  })

  it('operativa/transporte propagan al array por contenedor; buque solo columna', () => {
    const ops = [rec(), rec({ CNTR_OP: 'MSKU2222222' })]
    const r = buildFaltantePatch('operativa', 'TRASIEGO', ops)
    if (!r.ok) throw new Error('esperaba ok')
    expect(r.patch.operativa).toBe('TRASIEGO')
    expect((r.patch.operativas as OperativasRecord[]).map(o => o.OPERATIVA)).toEqual(['TRASIEGO', 'TRASIEGO'])

    const t = buildFaltantePatch('transporte', 'olaverry', ops)
    if (!t.ok) throw new Error('esperaba ok')
    expect(t.patch.transporte).toBe('OLAVERRY')
    expect((t.patch.operativas as OperativasRecord[])[0].TRANSPORTE).toBe('OLAVERRY')

    const b = buildFaltantePatch('buque', 'EVER FAITH 036W', ops)
    if (!b.ok) throw new Error('esperaba ok')
    expect(b.patch).toEqual({ buque: 'EVER FAITH 036W' })
  })

  it('depósito propaga y arrastra LUGAR_SALIDA (regla "manda Depósito UY")', () => {
    const r = buildFaltantePatch('deposito', 'godilco', [rec()])
    if (!r.ok) throw new Error('esperaba ok')
    const arr = r.patch.operativas as OperativasRecord[]
    expect(r.patch.deposito).toBe('GODILCO')
    expect(arr[0].DEPOSITO).toBe('GODILCO')
    expect(arr[0].LUGAR_SALIDA).toBe('GODILCO')
  })

  it('sin array operativas el patch es solo la columna (no inventa array)', () => {
    expect(buildFaltantePatch('operativa', 'TRASIEGO')).toEqual({ ok: true, patch: { operativa: 'TRASIEGO' } })
  })

  it('todos los campos de datosFaltantes tienen input definido', () => {
    for (const campo of ['cliente', 'pais', 'eta', 'buque', 'docNumber', 'cntr', 'pkgs', 'kg', 'm3', 'agente', 'deposito', 'operativa', 'transporte', 'fiscal'] as const) {
      expect(FALTANTE_INPUTS[campo], campo).toBeDefined()
      expect(buildFaltantePatch(campo, campo === 'eta' ? '2026-01-01' : '1').ok, campo).toBe(true)
    }
  })
})
