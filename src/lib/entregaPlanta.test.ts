import { describe, it, expect } from 'vitest'
import {
  conflictoEntregaPlanta, conflictoEntregaPlantaEnCamion, mensajeConflictoEntregaPlanta, sePisan,
  type CargaPlanta,
} from './entregaPlanta'

const inelpa: CargaPlanta = { ref: 'E163 A', cliente: 'INELPA', fiscal: 'CLIR', entregaPlanta: true }
const balsamo: CargaPlanta = { ref: 'E205', cliente: 'BALSAMO', fiscal: 'DFC', entregaPlanta: true }
const ciuffo: CargaPlanta = { ref: 'LCL247', cliente: 'CIUFFO', fiscal: 'RAFAELA', entregaPlanta: false }

describe('conflictoEntregaPlanta — dos entregas en planta en el mismo viaje se pisan', () => {
  it('la nueva no es entrega en planta → nunca hay conflicto', () => {
    expect(conflictoEntregaPlanta([inelpa, balsamo], ciuffo)).toBeNull()
  })

  it('el camión no tiene ninguna entrega en planta → sin conflicto', () => {
    expect(conflictoEntregaPlanta([ciuffo], inelpa)).toBeNull()
  })

  it('ya hay una entrega en planta de OTRO cliente → avisa con quién choca', () => {
    expect(conflictoEntregaPlanta([ciuffo, inelpa], balsamo)).toEqual({ con: 'E163 A', cliente: 'INELPA' })
  })

  it('mismo cliente, mismo fiscal → misma planta, no se pisan', () => {
    const otraInelpa: CargaPlanta = { ref: 'E170', cliente: 'inelpa', fiscal: 'clir', entregaPlanta: true }
    expect(conflictoEntregaPlanta([inelpa], otraInelpa)).toBeNull()
  })

  it('mismo cliente pero otro fiscal → se pisan', () => {
    const inelpaRafaela: CargaPlanta = { ref: 'E170', cliente: 'INELPA', fiscal: 'RAFAELA', entregaPlanta: true }
    expect(conflictoEntregaPlanta([inelpa], inelpaRafaela)).toEqual({ con: 'E163 A', cliente: 'INELPA' })
  })

  it('cliente con espacios y mayúsculas distintas se compara normalizado', () => {
    const misma: CargaPlanta = { ref: 'E171', cliente: '  Inelpa   ', fiscal: 'CLIR ', entregaPlanta: true }
    expect(conflictoEntregaPlanta([inelpa], misma)).toBeNull()
  })

  it('otro contenedor de la MISMA ref no choca consigo mismo', () => {
    const mismaRef: CargaPlanta = { ref: 'e163 a', cliente: 'INELPA', fiscal: 'RAFAELA', entregaPlanta: true }
    expect(conflictoEntregaPlanta([inelpa], mismaRef)).toBeNull()
  })

  it('entregaPlanta null/undefined cuenta como no', () => {
    const sinDato: CargaPlanta = { ref: 'X', cliente: 'OTRO', fiscal: 'DFC', entregaPlanta: null }
    expect(conflictoEntregaPlanta([inelpa], sinDato)).toBeNull()
    expect(conflictoEntregaPlanta([sinDato], balsamo)).toBeNull()
  })
})

describe('conflictoEntregaPlantaEnCamion — banner del armador', () => {
  it('sin dos plantas que choquen → null', () => {
    expect(conflictoEntregaPlantaEnCamion([ciuffo, inelpa])).toBeNull()
    expect(conflictoEntregaPlantaEnCamion([])).toBeNull()
  })

  it('devuelve el primer par que se pisa', () => {
    const r = conflictoEntregaPlantaEnCamion([ciuffo, inelpa, balsamo])
    expect(r?.a.ref).toBe('E163 A')
    expect(r?.b.ref).toBe('E205')
  })
})

describe('mensaje y sePisan', () => {
  it('el mensaje nombra ref y cliente de la que ya está', () => {
    expect(mensajeConflictoEntregaPlanta({ con: 'E163 A', cliente: 'INELPA' }))
      .toBe('Este camión ya lleva una entrega en planta (E163 A – INELPA). Dos entregas en planta en el mismo viaje se pisan.')
  })

  it('sin cliente el mensaje no deja un guion colgado', () => {
    expect(mensajeConflictoEntregaPlanta({ con: 'E163 A', cliente: '' }))
      .toContain('(E163 A)')
  })

  it('sePisan es simétrica', () => {
    expect(sePisan(inelpa, balsamo)).toBe(true)
    expect(sePisan(balsamo, inelpa)).toBe(true)
    expect(sePisan(inelpa, ciuffo)).toBe(false)
  })
})
