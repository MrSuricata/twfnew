import { describe, it, expect } from 'vitest'
import {
  MAX_FOTOS_POR_LOTE, MAX_BYTES_FOTO, TANDA,
  clasificarSeleccion, avisoDescartes, enTandas, subirEnTandas,
} from './subirFotos'

// El entorno de tests es `node`: no hace falta un File real, clasificarSeleccion
// solo mira `size`. Se castea para no arrastrar el DOM al test.
const archivo = (name: string, size = 1024): File => ({ name, size } as File)
const archivos = (n: number, size = 1024): File[] =>
  Array.from({ length: n }, (_, i) => archivo(`foto-${i}.jpg`, size))

const PESADA = MAX_BYTES_FOTO + 1

describe('clasificarSeleccion', () => {
  it('acepta todo cuando entra en el lote y ninguna pesa de más', () => {
    const sel = clasificarSeleccion(archivos(5))
    expect(sel.aceptadas).toHaveLength(5)
    expect(sel.pesadas).toEqual([])
    expect(sel.sobrantes).toEqual([])
  })

  it('separa las que superan el máximo por archivo', () => {
    const sel = clasificarSeleccion([archivo('ok.jpg'), archivo('gigante.jpg', PESADA)])
    expect(sel.aceptadas.map(f => f.name)).toEqual(['ok.jpg'])
    expect(sel.pesadas.map(f => f.name)).toEqual(['gigante.jpg'])
  })

  it('el límite por archivo es inclusivo: justo 10MB entra', () => {
    const sel = clasificarSeleccion([archivo('justa.jpg', MAX_BYTES_FOTO)])
    expect(sel.aceptadas).toHaveLength(1)
    expect(sel.pesadas).toEqual([])
  })

  it('corta en el tope del lote y manda el resto a sobrantes', () => {
    const sel = clasificarSeleccion(archivos(MAX_FOTOS_POR_LOTE + 3))
    expect(sel.aceptadas).toHaveLength(MAX_FOTOS_POR_LOTE)
    expect(sel.sobrantes).toHaveLength(3)
  })

  it('una foto pesada NO ocupa un lugar del cupo', () => {
    // 3 válidas + 1 pesada con tope 3: la pesada se descarta primero, así que
    // las 3 válidas entran enteras. Si el orden fuera al revés, una válida
    // quedaría afuera por culpa de la pesada.
    const files = [archivo('a.jpg'), archivo('gigante.jpg', PESADA), archivo('b.jpg'), archivo('c.jpg')]
    const sel = clasificarSeleccion(files, 3)
    expect(sel.aceptadas.map(f => f.name)).toEqual(['a.jpg', 'b.jpg', 'c.jpg'])
    expect(sel.pesadas.map(f => f.name)).toEqual(['gigante.jpg'])
    expect(sel.sobrantes).toEqual([])
  })

  it('conserva el orden de la selección', () => {
    const sel = clasificarSeleccion([archivo('z.jpg'), archivo('a.jpg'), archivo('m.jpg')])
    expect(sel.aceptadas.map(f => f.name)).toEqual(['z.jpg', 'a.jpg', 'm.jpg'])
  })

  it('selección vacía no rompe', () => {
    const sel = clasificarSeleccion([])
    expect(sel).toEqual({ aceptadas: [], pesadas: [], sobrantes: [] })
  })
})

describe('avisoDescartes', () => {
  const sel = (pesadas: number, sobrantes: number) => ({
    aceptadas: [], pesadas: archivos(pesadas), sobrantes: archivos(sobrantes),
  })

  it('sin descartes devuelve vacío', () => {
    expect(avisoDescartes(sel(0, 0))).toBe('')
  })

  it('singular y plural de las pesadas', () => {
    expect(avisoDescartes(sel(1, 0))).toBe('1 pesa más de 10MB')
    expect(avisoDescartes(sel(2, 0))).toBe('2 pesan más de 10MB')
  })

  it('singular y plural de las sobrantes, con el máximo adentro', () => {
    expect(avisoDescartes(sel(0, 1), 40)).toBe('1 pasa del máximo de 40 por vez')
    expect(avisoDescartes(sel(0, 5), 40)).toBe('5 pasan del máximo de 40 por vez')
  })

  it('junta los dos motivos', () => {
    expect(avisoDescartes(sel(2, 3), 40))
      .toBe('2 pesan más de 10MB · 3 pasan del máximo de 40 por vez')
  })
})

describe('enTandas', () => {
  it('parte en grupos del tamaño pedido', () => {
    expect(enTandas([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('lista vacía devuelve vacío', () => {
    expect(enTandas([], 3)).toEqual([])
  })

  it('grupo más grande que la lista devuelve una sola tanda', () => {
    expect(enTandas([1, 2], 10)).toEqual([[1, 2]])
  })

  it('n inválido no cuelga: una sola tanda con todo', () => {
    expect(enTandas([1, 2, 3], 0)).toEqual([[1, 2, 3]])
    expect(enTandas([], 0)).toEqual([])
  })

  it('el default es TANDA', () => {
    expect(enTandas([1, 2, 3, 4])).toEqual(enTandas([1, 2, 3, 4], TANDA))
  })
})

describe('subirEnTandas', () => {
  it('sube todo y devuelve los resultados en orden', async () => {
    const { ok, errores } = await subirEnTandas([1, 2, 3, 4, 5], async n => n * 10, undefined, 2)
    expect(ok).toEqual([10, 20, 30, 40, 50])
    expect(errores).toEqual([])
  })

  it('NO aborta al primer error: sube el resto igual', async () => {
    const { ok, errores } = await subirEnTandas(
      ['a', 'rota', 'c', 'd'],
      async s => { if (s === 'rota') throw new Error('falló Storage'); return s.toUpperCase() },
      undefined,
      2,
    )
    expect(ok).toEqual(['A', 'C', 'D'])
    expect(errores).toHaveLength(1)
    expect(errores[0].error.message).toBe('falló Storage')
  })

  it('el índice del error es el de la lista original, no el de la tanda', async () => {
    // La que falla es la 4ª (índice 3) y cae en la segunda tanda.
    const { errores } = await subirEnTandas(
      [0, 1, 2, 3, 4],
      async n => { if (n === 3) throw new Error('esta no'); return n },
      undefined,
      2,
    )
    expect(errores.map(e => e.index)).toEqual([3])
  })

  it('el índice llega al callback de subida', async () => {
    const vistos: number[] = []
    await subirEnTandas([9, 8, 7], async (_item, i) => { vistos.push(i); return i }, undefined, 2)
    expect(vistos.sort()).toEqual([0, 1, 2])
  })

  it('el avance cuenta las TERMINADAS, no las lanzadas', async () => {
    const avances: [number, number][] = []
    await subirEnTandas([1, 2, 3, 4, 5], async n => n, (hechas, total) => avances.push([hechas, total]), 2)
    // Un aviso por tanda, y el último tiene que dar el total exacto.
    expect(avances).toEqual([[2, 5], [4, 5], [5, 5]])
  })

  it('un rechazo que no es Error igual se envuelve en Error', async () => {
    const { errores } = await subirEnTandas([1], async () => { throw 'texto pelado' })
    expect(errores[0].error).toBeInstanceOf(Error)
    expect(errores[0].error.message).toBe('texto pelado')
  })

  it('lista vacía no llama a subir ni avisa avance', async () => {
    let llamadas = 0
    const avances: number[] = []
    const { ok, errores } = await subirEnTandas<number, number>(
      [], async n => { llamadas++; return n }, h => avances.push(h),
    )
    expect(llamadas).toBe(0)
    expect(avances).toEqual([])
    expect(ok).toEqual([])
    expect(errores).toEqual([])
  })

  it('si fallan todas, ok queda vacío y se reportan todas', async () => {
    const { ok, errores } = await subirEnTandas([1, 2, 3], async () => { throw new Error('sin red') }, undefined, 2)
    expect(ok).toEqual([])
    expect(errores).toHaveLength(3)
    expect(errores.map(e => e.index)).toEqual([0, 1, 2])
  })

  it('sube en paralelo dentro de la tanda, no de a una', async () => {
    let enVuelo = 0
    let pico = 0
    await subirEnTandas(
      archivos(6),
      async () => {
        enVuelo++
        pico = Math.max(pico, enVuelo)
        await new Promise(r => setTimeout(r, 5))
        enVuelo--
        return 1
      },
      undefined,
      3,
    )
    expect(pico).toBe(3)
  })
})
