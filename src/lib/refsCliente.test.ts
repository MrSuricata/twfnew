/**
 * La regla D2: la ref del cliente manda cuando existe y sirve; la nuestra es
 * el número pelado. Estos tests son el contrato de TODO el portal: si alguien
 * vuelve a poner "TWF " adelante o le come la "A" a una LCL, salta acá.
 */
import { describe, it, expect } from 'vitest'
import { refsCliente, refClienteSana, numeroNuestro, refsEnLinea, REF_CLIENTE_MAX } from './refsCliente'

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
    expect(refsCliente({ REF: 'A8121', CLIENT_REF: '8121' }, 'CHIAPERO'))
      .toEqual({ principal: '8121', secundaria: '', propia: true })
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
