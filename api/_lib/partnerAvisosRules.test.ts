import { describe, it, expect } from 'vitest'
import {
  TIPOS_POR_ROL_API,
  tipoPermitido,
  validarNuevoAviso,
  mapFilaToAviso,
  cntrPerteneceACarga,
  patchDevolvi,
  patchDesconsolide,
} from './partnerAvisosRules.js'
import { TIPOS_POR_ROL, stockValido } from '../../src/lib/partnerAvisos.js'

describe('TIPOS_POR_ROL_API sigue al contrato', () => {
  it('es idéntico a TIPOS_POR_ROL de src/lib/partnerAvisos.ts', () => {
    expect(TIPOS_POR_ROL_API).toEqual(TIPOS_POR_ROL)
  })
})

describe('tipoPermitido', () => {
  it('depósito: retire/devolvi/desconsolide sí, senasa no', () => {
    expect(tipoPermitido('depot', 'retire')).toBe(true)
    expect(tipoPermitido('depot', 'devolvi')).toBe(true)
    expect(tipoPermitido('depot', 'desconsolide')).toBe(true)
    expect(tipoPermitido('depot', 'senasa')).toBe(false)
  })
  it('transporte: solo senasa', () => {
    expect(tipoPermitido('transport', 'senasa')).toBe(true)
    expect(tipoPermitido('transport', 'retire')).toBe(false)
    expect(tipoPermitido('transport', 'devolvi')).toBe(false)
    expect(tipoPermitido('transport', 'desconsolide')).toBe(false)
  })
  it('rol desconocido o tipo inventado → false', () => {
    expect(tipoPermitido('admin', 'retire')).toBe(false)
    expect(tipoPermitido('depot', 'cargue')).toBe(false)
  })
})

describe('validarNuevoAviso', () => {
  const hoy = '2026-09-01'

  it('acepta un retire del depósito y normaliza ref/cntr en mayúsculas', () => {
    const r = validarNuevoAviso('depot', { tipo: 'retire', ref: ' a7581 ', cntr: 'mrku1234567' }, hoy)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.ref).toBe('A7581')
      expect(r.data.cntr).toBe('MRKU1234567')
      expect(r.data.dato).toEqual({ fecha: hoy })
    }
  })

  it('respeta la fecha que manda el partner', () => {
    const r = validarNuevoAviso('depot', { tipo: 'devolvi', ref: 'A1', dato: { fecha: '2026-08-30' } }, hoy)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.dato).toEqual({ fecha: '2026-08-30' })
  })

  it('cntr ausente → cadena vacía (la ref entera)', () => {
    const r = validarNuevoAviso('transport', { tipo: 'senasa', ref: 'A1' }, hoy)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.cntr).toBe('')
  })

  it('tipo no permitido para el rol → 403 con mensaje amigable', () => {
    const r = validarNuevoAviso('transport', { tipo: 'retire', ref: 'A1' }, hoy)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(403)
      expect(r.error).toMatch(/transporte/i)
    }
  })

  it('tipo inventado → 400', () => {
    const r = validarNuevoAviso('depot', { tipo: 'cargue', ref: 'A1' }, hoy)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it('ref vacía → 400', () => {
    const r = validarNuevoAviso('depot', { tipo: 'retire', ref: '   ' }, hoy)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it('desconsolide exige stock válido (3-7 dígitos), mismo criterio que el contrato', () => {
    const sin = validarNuevoAviso('depot', { tipo: 'desconsolide', ref: 'LCL201' }, hoy)
    expect(sin.ok).toBe(false)
    if (!sin.ok) { expect(sin.status).toBe(400); expect(sin.error).toMatch(/stock/i) }

    const corto = validarNuevoAviso('depot', { tipo: 'desconsolide', ref: 'LCL201', dato: { stock: '12' } }, hoy)
    expect(corto.ok).toBe(false)

    const letras = validarNuevoAviso('depot', { tipo: 'desconsolide', ref: 'LCL201', dato: { stock: '12a45' } }, hoy)
    expect(letras.ok).toBe(false)

    const ok = validarNuevoAviso('depot', { tipo: 'desconsolide', ref: 'LCL201', dato: { stock: ' 45678 ' } }, hoy)
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.data.dato).toEqual({ stock: '45678', fecha: hoy })
      expect(stockValido(ok.data.dato.stock)).toBe(true)
    }
  })

  it('el stock de otros tipos se ignora (solo viaja en desconsolide)', () => {
    const r = validarNuevoAviso('depot', { tipo: 'retire', ref: 'A1', dato: { stock: '12345' } }, hoy)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.dato).toEqual({ fecha: hoy })
  })

  it('fecha mal formada → 400', () => {
    const r = validarNuevoAviso('depot', { tipo: 'retire', ref: 'A1', dato: { fecha: '01/09/2026' } }, hoy)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it('body que no es objeto → 400', () => {
    expect(validarNuevoAviso('depot', null, hoy).ok).toBe(false)
    expect(validarNuevoAviso('depot', 'texto', hoy).ok).toBe(false)
  })
})

describe('cntrPerteneceACarga', () => {
  const carga = { CNTR: 'MRKU1234567, MSKU7654321', operativas: [{ CNTR_OP: 'MRKU1234567' }, { CNTR_OP: 'msku7654321' }] }
  it("cntr vacío = la ref entera → siempre válido", () => {
    expect(cntrPerteneceACarga('', carga)).toBe(true)
  })
  it('acepta un contenedor de la carga sin importar mayúsculas', () => {
    expect(cntrPerteneceACarga('mrku1234567', carga)).toBe(true)
    expect(cntrPerteneceACarga('MSKU7654321', carga)).toBe(true)
  })
  it('rechaza un contenedor ajeno', () => {
    expect(cntrPerteneceACarga('TCLU0000000', carga)).toBe(false)
  })
  it('sin operativas usa la columna CNTR', () => {
    expect(cntrPerteneceACarga('MSKU7654321', { CNTR: 'MSKU7654321' })).toBe(true)
  })
})

describe('mapFilaToAviso', () => {
  it('traduce la fila de partner_avisos al contrato camelCase', () => {
    const fila = {
      id: 'u1', tipo: 'devolvi', ref: 'A7581', cntr: 'MRKU1234567',
      partner_role: 'depot', partner_filter: 'PLANIR', partner_email: 'ops@planir.uy', partner_name: 'Leo',
      dato: { fecha: '2026-09-01' }, estado: 'pendiente', motivo_rechazo: null,
      created_at: '2026-09-01T12:00:00+00:00', resolved_at: null, resolved_by: null,
    }
    expect(mapFilaToAviso(fila)).toEqual({
      id: 'u1', tipo: 'devolvi', ref: 'A7581', cntr: 'MRKU1234567',
      partnerRole: 'depot', partnerFilter: 'PLANIR', partnerEmail: 'ops@planir.uy', partnerName: 'Leo',
      dato: { fecha: '2026-09-01' }, estado: 'pendiente', motivoRechazo: null,
      createdAt: '2026-09-01T12:00:00+00:00', resolvedAt: null, resolvedBy: null,
    })
  })
  it('tolera nulos: cntr/dato/name vacíos', () => {
    const a = mapFilaToAviso({ id: 'u2', tipo: 'senasa', ref: 'A1', partner_role: 'transport', partner_filter: 'TRANSCAL', partner_email: 'x@y.z', estado: 'confirmado', created_at: 't', resolved_at: 'r', resolved_by: 'Joaquín' })
    expect(a.cntr).toBe('')
    expect(a.dato).toEqual({})
    expect(a.partnerName).toBe('')
    expect(a.motivoRechazo).toBeNull()
    expect(a.resolvedBy).toBe('Joaquín')
  })
})

describe('patchDevolvi (mismo patch que el quick edit de LIBRE)', () => {
  it('columna libre + LIBRE en TODOS los contenedores (nivel carga)', () => {
    const p = patchDevolvi({ operativas: [{ CNTR_OP: 'A', LIBRE: '2026-09-10', SALIDA: '2026-09-02' }, { CNTR_OP: 'B', LIBRE: '' }] })
    expect(p.libre).toBe('DEVUELTO')
    expect(p.operativas).toEqual([
      { CNTR_OP: 'A', LIBRE: 'DEVUELTO', SALIDA: '2026-09-02' },
      { CNTR_OP: 'B', LIBRE: 'DEVUELTO' },
    ])
  })
  it('sin array de operativas: solo la columna (como buildPerContainerPatch)', () => {
    expect(patchDevolvi({ operativas: null })).toEqual({ libre: 'DEVUELTO' })
    expect(patchDevolvi({ operativas: [] })).toEqual({ libre: 'DEVUELTO' })
  })
})

describe('patchDesconsolide (mismo criterio que la bandeja de stock)', () => {
  it('stock + desconsol_date = fecha del aviso si la carga no tenía', () => {
    expect(patchDesconsolide({ desconsol_date: null }, { stock: '45678', fecha: '2026-08-30' }, '2026-09-01'))
      .toEqual({ stock: '45678', desconsol_date: '2026-08-30' })
  })
  it('sin fecha en el aviso → hoy', () => {
    expect(patchDesconsolide({ desconsol_date: '' }, { stock: '45678' }, '2026-09-01'))
      .toEqual({ stock: '45678', desconsol_date: '2026-09-01' })
  })
  it('si la carga ya tenía desconsol_date, se respeta', () => {
    expect(patchDesconsolide({ desconsol_date: '2026-08-20' }, { stock: '45678', fecha: '2026-08-30' }, '2026-09-01'))
      .toEqual({ stock: '45678', desconsol_date: '2026-08-20' })
  })
})
