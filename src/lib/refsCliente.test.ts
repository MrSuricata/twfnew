/**
 * La regla D2: la ref del cliente manda cuando existe y sirve; la nuestra es
 * el número pelado. Estos tests son el contrato de TODO el portal: si alguien
 * vuelve a poner "TWF " adelante o le come la "A" a una LCL, salta acá.
 */
import { describe, it, expect } from 'vitest'
import { refsCliente, refClienteSana, numeroNuestro, refsEnLinea, esAliasNuestro, REF_CLIENTE_MAX } from './refsCliente'

describe('numeroNuestro — el número pelado, sin marca y sin A', () => {
  it('le saca la A a las refs de la planilla', () => {
    expect(numeroNuestro('A8121')).toBe('8121')
    expect(numeroNuestro(' A7996 ')).toBe('7996')
  })

  it('NO se come el sufijo de operación dividida', () => {
    expect(numeroNuestro('A8068 B')).toBe('8068 B')
    expect(numeroNuestro('A7611 A')).toBe('7611 A')
  })

  it('no mutila las refs que no son FCL de la planilla', () => {
    expect(numeroNuestro('E200')).toBe('E200')
    expect(numeroNuestro('E163 A')).toBe('E163 A')
    expect(numeroNuestro('LCL00365UY')).toBe('LCL00365UY')
    // La A solo se saca si le sigue un dígito: acá es parte del nombre.
    expect(numeroNuestro('AIT-1')).toBe('AIT-1')
  })

  it('nunca antepone la marca', () => {
    expect(numeroNuestro('A8216')).not.toContain('TWF')
  })

  it('vacío o nulo no explota', () => {
    expect(numeroNuestro('')).toBe('')
    expect(numeroNuestro(null)).toBe('')
    expect(numeroNuestro(undefined)).toBe('')
  })
})

describe('refClienteSana — qué ref del cliente sirve de título', () => {
  it('una ref normal sirve', () => {
    expect(refClienteSana('1410', 'CHIAPERO S.R.L.')).toBe(true)
    expect(refClienteSana('PO-2026-0031', 'VMG S.A.')).toBe(true)
  })

  it('vacía o solo espacios, no', () => {
    expect(refClienteSana('', 'CHIAPERO')).toBe(false)
    expect(refClienteSana('   ', 'CHIAPERO')).toBe(false)
    expect(refClienteSana(null, 'CHIAPERO')).toBe(false)
  })

  it('el nombre del cliente NO es una referencia (mayúsculas, espacios y acentos aparte)', () => {
    expect(refClienteSana('CHIAPERO S.R.L.', 'CHIAPERO S.R.L.')).toBe(false)
    expect(refClienteSana('chiapero s.r.l.', 'CHIAPERO S.R.L.')).toBe(false)
    expect(refClienteSana('  CHIAPERO   S.R.L. ', 'CHIAPERO S.R.L.')).toBe(false)
    expect(refClienteSana('MOJÓN', 'MOJON')).toBe(false)
  })

  it('acepta varios nombres candidatos (el del portal y el de la carga)', () => {
    expect(refClienteSana('VMG', 'OTRO CLIENTE', 'VMG')).toBe(false)
    expect(refClienteSana('1410', 'OTRO CLIENTE', 'VMG')).toBe(true)
  })

  it('más de 24 caracteres no es un identificador, es una descripción', () => {
    expect('A'.repeat(REF_CLIENTE_MAX).length).toBe(24)
    expect(refClienteSana('A'.repeat(REF_CLIENTE_MAX), 'CLIENTE')).toBe(true)
    expect(refClienteSana('A'.repeat(REF_CLIENTE_MAX + 1), 'CLIENTE')).toBe(false)
    expect(refClienteSana('ORDEN DE COMPRA 2026 / LOTE 3 / CONTENEDOR 1', 'CLIENTE')).toBe(false)
  })
})

describe('refsCliente — principal, secundaria y REF intacta', () => {
  it('con ref del cliente sana: manda la de él, la nuestra queda en chico', () => {
    expect(refsCliente({ REF: 'A8121', CLIENT_REF: '1410' }, 'CHIAPERO S.R.L.'))
      .toEqual({ principal: '1410', secundaria: '8121', propia: true })
  })

  it('sin ref del cliente: nuestro número solo, sin "TWF" y sin secundaria', () => {
    expect(refsCliente({ REF: 'A8216', CLIENT_REF: '' }, 'REMONTAR S.R.L.'))
      .toEqual({ principal: '8216', secundaria: '', propia: false })
  })

  it('ref del cliente que dice el nombre del cliente → se ignora, va la nuestra', () => {
    expect(refsCliente({ REF: 'A8045', CLIENT_REF: 'VMG S.A.' }, 'VMG S.A.'))
      .toEqual({ principal: '8045', secundaria: '', propia: false })
    // ...aunque venga con otras mayúsculas y espacios de más.
    expect(refsCliente({ REF: 'A8045', CLIENT_REF: ' vmg  s.a. ' }, 'VMG S.A.').propia).toBe(false)
  })

  it('sin nombre a mano, compara contra el CLIENTE de la carga', () => {
    expect(refsCliente({ REF: 'A8045', CLIENT_REF: 'CHIAPERO', CLIENTE: 'CHIAPERO' }).propia).toBe(false)
    expect(refsCliente({ REF: 'A8045', CLIENT_REF: '1410', CLIENTE: 'CHIAPERO' }).propia).toBe(true)
  })

  it('ref del cliente demasiado larga → va la nuestra', () => {
    const larga = 'PEDIDO DE COMPRA NUMERO 998877'
    expect(refsCliente({ REF: 'A8121', CLIENT_REF: larga }, 'CHIAPERO'))
      .toEqual({ principal: '8121', secundaria: '', propia: false })
  })

  it('operación dividida: el sufijo viaja en las dos refs', () => {
    expect(refsCliente({ REF: 'A8068 B', CLIENT_REF: '1433 B' }, 'CHIAPERO'))
      .toEqual({ principal: '1433 B', secundaria: '8068 B', propia: true })
    expect(refsCliente({ REF: 'A8068 B', CLIENT_REF: '' }, 'CHIAPERO').principal).toBe('8068 B')
  })

  it('LCL y aéreo: la ref no tiene A que sacar y queda entera', () => {
    expect(refsCliente({ REF: 'E200', CLIENT_REF: '' }, 'PERETTI').principal).toBe('E200')
    expect(refsCliente({ REF: 'LCL00365UY', CLIENT_REF: '' }, 'PERETTI').principal).toBe('LCL00365UY')
    expect(refsCliente({ REF: 'E200', CLIENT_REF: 'OC-77' }, 'PERETTI'))
      .toEqual({ principal: 'OC-77', secundaria: 'E200', propia: true })
  })

  it('si el cliente cargó nuestro propio número, no se muestra dos veces', () => {
    // Lo que se VE es lo mismo de siempre: "8121" y nada al lado. Cambia solo
    // `propia`, que ahora dice la verdad — eso no es una referencia del
    // cliente, es la nuestra copiada (ver `esAliasNuestro`).
    expect(refsCliente({ REF: 'A8121', CLIENT_REF: '8121' }, 'CHIAPERO'))
      .toEqual({ principal: '8121', secundaria: '', propia: false })
    expect(refsCliente({ REF: 'A8121', CLIENT_REF: 'A8121' }, 'CHIAPERO').secundaria).toBe('')
  })

  it('nada que mostrar no explota', () => {
    expect(refsCliente(null)).toEqual({ principal: '', secundaria: '', propia: false })
    expect(refsCliente(undefined)).toEqual({ principal: '', secundaria: '', propia: false })
    expect(refsCliente({})).toEqual({ principal: '', secundaria: '', propia: false })
  })

  it('REF no se toca: lo que cambia es lo que se MUESTRA', () => {
    const carga = { REF: 'A8121', CLIENT_REF: '1410' }
    refsCliente(carga, 'CHIAPERO')
    expect(carga.REF).toBe('A8121')
    expect(carga.CLIENT_REF).toBe('1410')
  })
})

describe('refsEnLinea — para los chips angostos', () => {
  it('junta las dos con un punto, o deja sola la nuestra', () => {
    expect(refsEnLinea(refsCliente({ REF: 'A8121', CLIENT_REF: '1410' }, 'CHIAPERO'))).toBe('1410 · 8121')
    expect(refsEnLinea(refsCliente({ REF: 'A8121', CLIENT_REF: '' }, 'CHIAPERO'))).toBe('8121')
  })
})

// ── Alias de nuestra propia ref (verificado contra la base el 04/09/2026) ────
// Las 243 LCL activas traen en `client_ref` un alias NUESTRO, no la ref del
// cliente. Sin este filtro, el portal le mostraría a cada cliente de LCL un
// código interno en grande, presentado como "su" referencia.
describe('esAliasNuestro / LCL: client_ref trae un alias nuestro', () => {
  it('reconoce el alias con otro prefijo y los mismos dígitos', () => {
    expect(esAliasNuestro('LCL127', 'E127')).toBe(true)
    expect(esAliasNuestro('LCL160B', 'E160 B')).toBe(true)
    expect(esAliasNuestro('LCL00365UY', 'E365')).toBe(true)
  })

  it('reconoce el alias cuando nuestra ref lo contiene (Buenos Aires)', () => {
    expect(esAliasNuestro('LCLBUE6040203', 'R84I26040203')).toBe(true)
    expect(esAliasNuestro('LCLBUE6050049', 'R84I26050049')).toBe(true)
  })

  it('NO confunde con las refs propias reales de los clientes FCL', () => {
    // Los 15 casos sanos que hay hoy en la base, con su ref nuestra.
    const reales: [string, string][] = [
      ['1400', 'A7996'], ['1405', 'A7997'], ['2051-2', 'A8006'], ['OCE 80-1', 'A8007'],
      ['1417', 'A8045'], ['1401', 'A8081'], ['1409', 'A8087'], ['1408', 'A8088'],
      ['1410', 'A8121'], ['1416', 'A8131'], ['4291', 'A8146'], ['1425', 'A8148'],
      ['LY26-BP001-1', 'A8213'], ['2051-5 / 2054', 'A8283'], ['1419', 'A8325'],
    ]
    for (const [clientRef, ref] of reales) {
      expect(esAliasNuestro(clientRef, ref), `${clientRef} vs ${ref}`).toBe(false)
    }
  })

  it('no se deja engañar por coincidencias de uno o dos dígitos', () => {
    // "8121" CONTIENE "1", pero una ref de un dígito no prueba nada.
    expect(esAliasNuestro('1', 'A8121')).toBe(false)
    expect(esAliasNuestro('12', 'A8121')).toBe(false)
    expect(esAliasNuestro('OCE 80-1', 'A8007')).toBe(false)
  })

  it('sin dígitos de un lado, no hay alias que valga', () => {
    expect(esAliasNuestro('EXP', 'A8121')).toBe(false)
    expect(esAliasNuestro('', 'A8121')).toBe(false)
    expect(esAliasNuestro('1410', '')).toBe(false)
  })

  it('la carga LCL entera: se muestra NUESTRA ref, no el alias', () => {
    const r = refsCliente({ REF: 'E127', CLIENT_REF: 'LCL127' }, 'EQUIPO ORIGINAL VMG SA')
    expect(r.principal).toBe('E127')
    expect(r.propia).toBe(false)
    expect(r.secundaria).toBe('')
  })

  it('la carga FCL de Chiapero sigue mostrando la del cliente', () => {
    const r = refsCliente({ REF: 'A8121', CLIENT_REF: '1410' }, 'CHIAPERO Y ASOC. S.R.L.')
    expect(r.principal).toBe('1410')
    expect(r.secundaria).toBe('8121')
    expect(r.propia).toBe(true)
  })
})
