/**
 * La carga vista por el cliente: la fila de la lista y la ficha (spec 04/09,
 * D4 y D5). Lo que estos tests no dejan pasar:
 *  · "0 contenedor(es)" — el síntoma que reportó Brian.
 *  · dos vocabularios de estado conviviendo.
 *  · "Libre" filtrándose a la vista del cliente.
 *  · una línea de tiempo que miente (el `reached: true` fijo del modal viejo).
 */
import { describe, it, expect } from 'vitest'
import {
  contenedoresCarga, textoContenedores, filaCargaCliente, lineaTiempoCliente,
  datosFicha, contenedoresDeCarga, agruparFotosPorLugar, informesDeCarga, fechaDeSubida,
  lugarDeFoto, galeriaDeCarga, galeriaDeNovedad, tiraDeMiniaturas, indiceEnGaleria,
  MAX_MINIATURAS, fuenteMiniatura, sePuedeDibujar,
} from './cargaCliente'
import { estadoCliente, etiquetaEstado, novedadesCliente, traducirAlerta } from './hoyCliente'
import type { ParsedShipment, OperativasRecord, ShipmentAlert } from './shipmentTypes'

const HOY = '2026-09-04'
const dia = (n: number): string => new Date(Date.UTC(2026, 8, 4 + n)).toISOString().slice(0, 10)

const op = (o: Partial<OperativasRecord> & { CAMION?: string } = {}): OperativasRecord => ({
  REF: 'A8121', TLX: 'SI', DEPOSITO: 'GODILCO', ETA_OP: '', SALIDA: '', ETA_FISC: '', LIBRE: '',
  OPERATIVA: 'TRASIEGO', CNTR_OP: 'MSKU1111111', PKGS: 400, KG: 8000, M3: 40,
  DESCRIPCION: 'BICICLETAS', FISCAL: 'CACEC', DESCARGA: '', DEV: '', CLIENTE_OP: '',
  TIPO: '40HC', WOOD: '', TRANSPORTE: 'TRANSCAL', HORARIO: '', LUGAR_SALIDA: '',
  ...o,
} as unknown as OperativasRecord)

const carga = (c: Record<string, unknown> = {}, operativas: OperativasRecord[] = [op()]): ParsedShipment => ({
  REF: 'A8121', CLIENT_REF: '1410', CLIENTE: '', MODE: 'fcl', PAIS: 'UY', POL: 'SHANGHAI',
  POD: 'MONTEVIDEO', ETD: dia(-30), ETA: dia(-5), CNTR: 'MSKU1111111', N: 1,
  BUQUE: 'MAERSK SAN LAZARO', LINEA: 'MAERSK', TERMINAL: 'TCP', LIBRE_HASTA: dia(2),
  containers: [], calculatedN: 1, calculatedLibreHasta: '', operativas,
  ...c,
} as unknown as ParsedShipment)

// ── Contenedores contados ─────────────────────────────────────────────────

describe('contenedoresCarga — nunca más "0 contenedor(es)"', () => {
  it('usa lo que ya derivó el server (N / calculatedN)', () => {
    expect(contenedoresCarga(carga({ N: 3, calculatedN: 3 }))).toBe(3)
    expect(contenedoresCarga(carga({ N: 0, calculatedN: 2 }))).toBe(2)
  })

  it('con n_cntr en cero cuenta la lista real: CNTR, containers y operativas', () => {
    const s = carga({ N: 0, calculatedN: 0, CNTR: 'MSKU1111111, MSKU2222222' }, [
      op({ CNTR_OP: 'MSKU1111111' }), op({ CNTR_OP: 'MSKU2222222' }),
    ])
    expect(contenedoresCarga(s)).toBe(2)
  })

  it('no cuenta dos veces el mismo contenedor escrito distinto', () => {
    const s = carga({ N: 0, calculatedN: 0, CNTR: 'msku1111111' }, [op({ CNTR_OP: ' MSKU1111111 ' })])
    expect(contenedoresCarga(s)).toBe(1)
  })

  it('una LCL no tiene contenedor propio: 0 es la verdad, y se dice con palabras', () => {
    const lcl = carga({ REF: 'E200', MODE: 'lcl', N: 0, calculatedN: 0, CNTR: '' }, [op({ CNTR_OP: '' })])
    expect(contenedoresCarga(lcl)).toBe(0)
    expect(textoContenedores(lcl)).toBe('Carga consolidada')
  })

  it('sin contenedor asignado lo dice, no muestra un cero', () => {
    const s = carga({ N: 0, calculatedN: 0, CNTR: '' }, [op({ CNTR_OP: '' })])
    expect(textoContenedores(s)).toBe('Contenedor a asignar')
    expect(textoContenedores(carga())).toBe('1 contenedor')
    expect(textoContenedores(carga({ N: 2 }))).toBe('2 contenedores')
  })
})

// ── La fila de la lista ───────────────────────────────────────────────────

describe('filaCargaCliente — un solo vocabulario, la ref del cliente y el hito', () => {
  it('trae el estado de estadoCliente, no otro', () => {
    const s = carga({}, [op({ SALIDA: dia(-2) })])
    const f = filaCargaCliente(s, HOY)
    expect(f.estado).toBe(estadoCliente(s, HOY))
    expect(f.etiqueta).toBe(etiquetaEstado(s, f.estado))
    expect(f.etiqueta).toBe('En camino')
  })

  it('la ref del cliente manda y la nuestra queda de secundaria (D2)', () => {
    const f = filaCargaCliente(carga(), HOY, 'CHIAPERO S.R.L.')
    expect(f.refs.principal).toBe('1410')
    expect(f.refs.secundaria).toBe('8121')
    expect(f.ref).toBe('A8121')            // la interna no se muestra, pero se conserva
  })

  it('la ref propia mal cargada (el nombre del cliente) se descarta', () => {
    const f = filaCargaCliente(carga({ CLIENT_REF: 'CHIAPERO S.R.L.' }), HOY, 'CHIAPERO S.R.L.')
    expect(f.refs.principal).toBe('8121')
    expect(f.refs.propia).toBe(false)
  })

  it('el próximo hito es el mismo que ya usa el portal', () => {
    const f = filaCargaCliente(carga({}, [op({ SALIDA: dia(2) })]), HOY)
    expect(f.hito.label).toBe('Sale de Montevideo')
    expect(f.hito.fecha).toBe('06/09/2026')
  })

  it('no expone nada de LIBRE', () => {
    const f = filaCargaCliente(carga({ LIBRE_HASTA: dia(1) }), HOY)
    expect(JSON.stringify(f).toLowerCase()).not.toContain('libre')
  })

  it('destino: el fiscal cargado, o el puerto en las rutas directas', () => {
    expect(filaCargaCliente(carga(), HOY).destino).toBe('CACEC')
    const chile = carga({ PAIS: 'CL', POD: 'SAN ANTONIO' }, [op({ FISCAL: '' })])
    expect(filaCargaCliente(chile, HOY).destino).toBe('SAN ANTONIO')
  })
})

// ── La línea de tiempo ────────────────────────────────────────────────────

describe('lineaTiempoCliente — derivada, sin "alcanzado" fijo', () => {
  it('una carga que todavía no zarpó NO tiene "Embarcada" alcanzada', () => {
    const pasos = lineaTiempoCliente(carga({ ETD: dia(5), ETA: dia(35) }, []), HOY)
    const porEmbarcar = pasos.find(p => p.estado === 'por_embarcar')!
    const embarcada = pasos.find(p => p.estado === 'embarcada')!
    expect(porEmbarcar.alcanzado).toBe(true)
    expect(porEmbarcar.actual).toBe(true)
    expect(embarcada.alcanzado).toBe(false)
    expect(embarcada.detalle).toBe('Estimado')   // hay ETD, pero es futura
  })

  it('todo lo anterior al estado de hoy queda alcanzado, y solo uno es el actual', () => {
    const s = carga({}, [op({ SALIDA: dia(-2) })])
    const pasos = lineaTiempoCliente(s, HOY)
    expect(pasos.filter(p => p.actual)).toHaveLength(1)
    expect(pasos.find(p => p.actual)!.estado).toBe('en_camino')
    expect(pasos.filter(p => p.alcanzado).map(p => p.estado))
      .toEqual(['por_embarcar', 'embarcada', 'en_montevideo', 'en_camino'])
    expect(pasos.find(p => p.estado === 'en_deposito')!.detalle).toBe('Pendiente')
  })

  it('una ruta directa no dibuja "En Montevideo" ni "En camino"', () => {
    const chile = carga({ PAIS: 'CL', POD: 'SAN ANTONIO', ETA: dia(-3) }, [])
    const pasos = lineaTiempoCliente(chile, HOY)
    expect(pasos.map(p => p.estado)).toEqual(['por_embarcar', 'embarcada', 'en_deposito', 'entregada'])
    expect(pasos.find(p => p.estado === 'en_deposito')!.actual).toBe(true)
  })

  it('las etiquetas son las del cliente y cambian según por dónde entra', () => {
    const uy = lineaTiempoCliente(carga(), HOY).find(p => p.estado === 'en_montevideo')!
    expect(uy.label).toBe('En Montevideo')
    const ba = carga({ PAIS: 'AR', POD: 'BUENOS AIRES' }, [op({ FISCAL: 'CACEC', SALIDA: dia(-1) })])
    expect(lineaTiempoCliente(ba, HOY).find(p => p.estado === 'en_montevideo')!.label).toBe('En puerto')
  })

  it('las fechas son las de la carga: zarpe, arribo y llegada a destino', () => {
    const s = carga({ ETD: dia(-30), ETA: dia(-5) }, [op({ SALIDA: dia(-2), ETA_FISC: dia(-1) })])
    const porEstado = Object.fromEntries(lineaTiempoCliente(s, HOY).map(p => [p.estado, p.fecha]))
    expect(porEstado.embarcada).toBe('05/08/2026')
    expect(porEstado.en_montevideo).toBe('30/08/2026')
    expect(porEstado.en_camino).toBe('02/09/2026')
    expect(porEstado.en_deposito).toBe('03/09/2026')
  })
})

// ── Datos y contenedores de la ficha ──────────────────────────────────────

describe('datosFicha — lo que el cliente puede ver, y nada más', () => {
  it('trae identidad, medidas y fechas, sin campos vacíos', () => {
    const datos = datosFicha(carga())
    const porLabel = Object.fromEntries(datos.map(d => [d.label, d.valor]))
    expect(porLabel['Carga']).toBe('BICICLETAS')
    expect(porLabel['Contenedores']).toBe('1 contenedor')
    expect(porLabel['Buque']).toBe('MAERSK SAN LAZARO')
    expect(porLabel['Destino final']).toBe('CACEC')
    expect(porLabel['Llegada a Montevideo']).toBe('30/08/2026')
    expect(datos.every(d => d.valor !== '')).toBe(true)
  })

  it('no dice Libre ni transporte: son datos nuestros', () => {
    const texto = JSON.stringify(datosFicha(carga())).toUpperCase()
    expect(texto).not.toContain('LIBRE')
    expect(texto).not.toContain('TRANSCAL')
    expect(texto).not.toContain('TRANSPORTE')
  })

  it('en ruta directa la llegada se llama "a destino"', () => {
    const chile = carga({ PAIS: 'CL', POD: 'SAN ANTONIO' }, [])
    expect(datosFicha(chile).some(d => d.label === 'Llegada a destino')).toBe(true)
  })
})

describe('contenedoresDeCarga — cada uno con su estado, mismo vocabulario', () => {
  it('uno que ya llegó y otro que no salió no se dicen con dos idiomas', () => {
    const s = carga({ N: 2 }, [
      op({ CNTR_OP: 'MSKU1111111', SALIDA: dia(-5), ETA_FISC: dia(-3) }),
      op({ CNTR_OP: 'MSKU2222222' }),
    ])
    const lista = contenedoresDeCarga(s, HOY)
    expect(lista.map(c => c.numero)).toEqual(['MSKU1111111', 'MSKU2222222'])
    expect(lista[0].etiqueta).toBe('En destino')
    expect(lista[1].etiqueta).toBe('En Montevideo')
    expect(lista[0].llegada).toBe('01/09/2026')
    expect(lista[1].salida).toBe('')
  })

  it('una LCL en camión se nombra por el camión, no por un contenedor vacío', () => {
    const lcl = carga({ REF: 'E200', MODE: 'lcl', CNTR: '', N: 0 }, [
      op({ CNTR_OP: '', OPERATIVA: 'CONSOLIDADO', CAMION: 'C463', SALIDA: dia(-1) }),
    ])
    expect(contenedoresDeCarga(lcl, HOY)[0].numero).toBe('Camión C463')
  })
})

// ── Fotos e informes ──────────────────────────────────────────────────────

const ts = (y: number, m: number, d: number): number => new Date(y, m - 1, d, 12, 0, 0).getTime()

describe('agruparFotosPorLugar — galería por lugar y día, lo nuevo arriba', () => {
  const fotos = [
    { id: 'a', shipmentRef: 'A8121', photoType: 'origen', createdAt: ts(2026, 8, 20) },
    { id: 'b', shipmentRef: 'A8121', photoType: 'origen', createdAt: ts(2026, 8, 20) },
    { id: 'c', shipmentRef: 'A8121', photoType: 'uruguay', createdAt: ts(2026, 9, 2) },
    { id: 'd', shipmentRef: 'A9999', photoType: 'uruguay', createdAt: ts(2026, 9, 3) },
  ]

  it('agrupa por lugar + día y ordena de lo más nuevo a lo más viejo', () => {
    const grupos = agruparFotosPorLugar(fotos, 'A8121')
    expect(grupos).toHaveLength(2)
    expect(grupos[0].lugar).toBe('uruguay')
    expect(grupos[0].titulo).toBe('Operativa en Montevideo')
    expect(grupos[0].fecha).toBe('02/09/2026')
    expect(grupos[1].titulo).toBe('Carga en origen')
    expect(grupos[1].fotos.map(f => f.id)).toEqual(['a', 'b'])
  })

  it('solo las fotos de ESA carga (la ref matchea sin importar mayúsculas)', () => {
    expect(agruparFotosPorLugar(fotos, 'a8121').flatMap(g => g.fotos.map(f => f.id)))
      .toEqual(['c', 'a', 'b'])
    expect(agruparFotosPorLugar(fotos, 'A0000')).toEqual([])
    expect(agruparFotosPorLugar([], 'A8121')).toEqual([])
  })

  it('sin photoType la foto se considera de origen', () => {
    const g = agruparFotosPorLugar([{ shipmentRef: 'A1', createdAt: ts(2026, 9, 1) }], 'A1')
    expect(g[0].lugar).toBe('origen')
  })

  it('fechaDeSubida tolera timestamps que no lo son', () => {
    expect(fechaDeSubida(ts(2026, 9, 4))).toBe('04/09/2026')
    expect(fechaDeSubida(0)).toBe('')
    expect(fechaDeSubida(undefined)).toBe('')
  })
})

describe('informesDeCarga', () => {
  it('filtra por carga y deja el más nuevo primero', () => {
    const informes = [
      { id: 'viejo', shipmentRef: 'A8121', createdAt: ts(2026, 8, 1) },
      { id: 'nuevo', shipmentRef: 'A8121', createdAt: ts(2026, 9, 1) },
      { id: 'ajeno', shipmentRef: 'A9999', createdAt: ts(2026, 9, 3) },
    ]
    expect(informesDeCarga(informes, 'A8121').map(r => r.id)).toEqual(['nuevo', 'viejo'])
  })
})

// ── Miniaturas en el aviso de HOY (D3) ───────────────────────────────────

describe('las miniaturas del aviso: hasta 4 y "+N"', () => {
  // Seis fotos en Montevideo y dos en origen, de la misma carga.
  const muchas = [
    ...Array.from({ length: 6 }, (_, i) => ({
      id: `uy${i}`, shipmentRef: 'A8121', photoType: 'uruguay', createdAt: ts(2026, 9, 1) + i,
      thumbnailUrl: `https://firmada/uy${i}`,
    })),
    { id: 'or1', shipmentRef: 'A8121', photoType: 'origen', createdAt: ts(2026, 8, 20), thumbnailUrl: 'https://firmada/or1' },
    { id: 'or2', shipmentRef: 'A8121', photoType: 'origen', createdAt: ts(2026, 8, 21), thumbnailUrl: 'https://firmada/or2' },
    { id: 'ajena', shipmentRef: 'A9999', photoType: 'uruguay', createdAt: ts(2026, 9, 3), thumbnailUrl: 'https://firmada/ajena' },
  ]
  /** Lo que hace la card: la FILA decide qué fotos son (su ventana), la tira
   *  solo cuántas entran. Acá se le pasan todas las de ese lugar. */
  const idsDe = (lugar: string) =>
    muchas.filter(f => f.shipmentRef === 'A8121' && f.photoType === lugar).map(f => f.id)
  const tiraDe = (lugar: 'origen' | 'uruguay') =>
    tiraDeMiniaturas(galeriaDeNovedad(muchas, { ref: 'A8121', lugarFoto: lugar, fotoIds: idsDe(lugar) }))

  it('lugarDeFoto: lo que no dice "uruguay" es de origen (photo_type es texto libre)', () => {
    expect(lugarDeFoto({ photoType: 'uruguay' })).toBe('uruguay')
    expect(lugarDeFoto({ photoType: 'URUGUAY' })).toBe('uruguay')
    expect(lugarDeFoto({ photoType: 'origen' })).toBe('origen')
    expect(lugarDeFoto({ photoType: '' })).toBe('origen')
    expect(lugarDeFoto(null)).toBe('origen')
  })

  it('muestra 4 y dice cuántas quedaron afuera', () => {
    const tira = tiraDe('uruguay')
    expect(MAX_MINIATURAS).toBe(4)
    expect(tira.visibles).toHaveLength(4)
    expect(tira.mas).toBe(2)
    expect(tira.total).toBe(6)
    // El "+N" abre justo donde la tira se cortó, no al principio otra vez.
    expect(tira.siguiente?.id).toBe('uy1')
  })

  it('con 4 o menos no hay "+N"', () => {
    const tira = tiraDe('origen')
    expect(tira.visibles.map(f => f.id)).toEqual(['or2', 'or1'])   // la más nueva primero
    expect(tira.mas).toBe(0)
    expect(tira.siguiente).toBeNull()
  })

  it('la tira es la del LUGAR de la fila, no la de toda la carga', () => {
    expect(tiraDe('origen').total).toBe(2)
    expect(tiraDe('uruguay').total).toBe(6)
  })

  it('sin fotos de esa carga la tira sale vacía (la fila no queda con un hueco)', () => {
    const ajena = galeriaDeNovedad(muchas, { ref: 'A0000', lugarFoto: 'uruguay', fotoIds: ['uy0'] })
    expect(tiraDeMiniaturas(ajena)).toEqual({ visibles: [], mas: 0, total: 0, siguiente: null })
    expect(tiraDeMiniaturas([]).total).toBe(0)
  })

  it('la galería de TODA la carga sigue disponible, lo más nuevo primero', () => {
    const galeria = galeriaDeCarga(muchas, 'a8121')
    expect(galeria).toHaveLength(8)
    expect(galeria[0].id).toBe('uy5')
    expect(galeria.map(f => f.id)).not.toContain('ajena')
  })

  it('el índice del visor cae en la foto tocada', () => {
    const galeria = galeriaDeCarga(muchas, 'A8121')
    expect(indiceEnGaleria(galeria, 'or1')).toBe(7)
    expect(indiceEnGaleria(galeria, 'uy5')).toBe(0)
  })

  it('una foto que no está en la galería abre en la primera, no en blanco', () => {
    const galeria = galeriaDeCarga(muchas, 'A8121')
    expect(indiceEnGaleria(galeria, 'no-existe')).toBe(0)
    expect(indiceEnGaleria(galeria, '')).toBe(0)
    expect(indiceEnGaleria([], 'or1')).toBe(0)
  })
})

// ── El texto de la fila y las miniaturas hablan de LO MISMO ──────────────

describe('la tira dibuja lo que el texto anuncia, no el historial entero', () => {
  // El caso que encontró la revisión: 1 foto de esta semana y 7 del mes
  // pasado, misma carga y mismo lugar. El texto decía "1 foto en depósito
  // GODILCO" y abajo se dibujaban 4 miniaturas y un "+4", porque la tira
  // volvía a buscar por carga + lugar y el endpoint manda TODO el historial.
  const HOY_N = '2026-09-10'
  const cuando = (iso: string) => Date.parse(iso + 'T12:00:00Z')
  const cargaN = {
    REF: 'A8121', CLIENTE: 'DEMO', ETD: '2026-08-01', ETA: '2026-09-05', PAIS: 'UY',
    POD: 'MONTEVIDEO', POL: 'SHANGHAI', TERMINAL: 'TCP', N: 1, CNTR: 'X1', MODE: 'fcl',
    operativas: [{ REF: 'A8121', CNTR_OP: 'X1', OPERATIVA: 'TRASIEGO', DEPOSITO: 'GODILCO' }],
  } as unknown as ParsedShipment
  const mezcla = [
    { id: 'hoy', shipmentRef: 'A8121', photoType: 'uruguay', createdAt: cuando('2026-09-09'), thumbnailUrl: 'https://firmada/hoy' },
    ...Array.from({ length: 7 }, (_, i) => ({
      id: `vieja${i}`, shipmentRef: 'A8121', photoType: 'uruguay',
      createdAt: cuando('2026-08-05') + i, thumbnailUrl: `https://firmada/vieja${i}`,
    })),
  ]

  it('1 foto anunciada = 1 miniatura, sin el "+4" de las del mes pasado', () => {
    const [fila] = novedadesCliente([cargaN], mezcla, [], HOY_N)
    expect(fila.cantidad).toBe(1)
    expect(fila.lugar).toBe('en depósito GODILCO')
    expect(fila.fotoIds).toEqual(['hoy'])

    const galeria = galeriaDeNovedad(mezcla, fila)
    expect(galeria.map(f => f.id)).toEqual(['hoy'])

    const tira = tiraDeMiniaturas(galeria)
    expect(tira.visibles.map(f => f.id)).toEqual(['hoy'])
    expect(tira.mas).toBe(0)
    // Lo que no puede volver a pasar: el texto dice una cosa y la tira otra.
    expect(tira.total).toBe(fila.cantidad)
  })

  it('con nuevas y viejas mezcladas, la tira cuenta solo las que anuncia', () => {
    const nuevas = Array.from({ length: 6 }, (_, i) => ({
      id: `n${i}`, shipmentRef: 'A8121', photoType: 'uruguay',
      createdAt: cuando('2026-09-08') + i, thumbnailUrl: `https://firmada/n${i}`,
    }))
    const todas = [...mezcla, ...nuevas]
    const [fila] = novedadesCliente([cargaN], todas, [], HOY_N)
    expect(fila.cantidad).toBe(7)                       // la de ayer + las seis
    const tira = tiraDeMiniaturas(galeriaDeNovedad(todas, fila))
    expect(tira.total).toBe(fila.cantidad)
    expect(tira.visibles).toHaveLength(4)
    expect(tira.mas).toBe(3)
    expect(tira.visibles.map(f => f.id).some(id => id.startsWith('vieja'))).toBe(false)
    expect(tira.siguiente?.id.startsWith('vieja')).toBe(false)
  })

  it('cada fila trae SUS fotos: la de origen no arrastra las de Montevideo', () => {
    const conOrigen = [
      ...mezcla,
      { id: 'or-nueva', shipmentRef: 'A8121', photoType: 'origen', createdAt: cuando('2026-09-08'), thumbnailUrl: 'https://firmada/or-nueva' },
    ]
    const filas = novedadesCliente([cargaN], conOrigen, [], HOY_N)
    const origen = filas.find(f => f.lugarFoto === 'origen')!
    const uy = filas.find(f => f.lugarFoto === 'uruguay')!
    expect(galeriaDeNovedad(conOrigen, origen).map(f => f.id)).toEqual(['or-nueva'])
    expect(galeriaDeNovedad(conOrigen, uy).map(f => f.id)).toEqual(['hoy'])
  })

  it('el visor recorre lo anunciado: ni el historial ni las de origen', () => {
    // Lo que se veía en /ui: la fila decía "6 fotos en depósito GODILCO", el
    // botón "Ver las otras 2 fotos de 6…" y el visor abría en "1 / 8", con dos
    // fotos de origen de hace tres semanas al final.
    const nuevas = Array.from({ length: 6 }, (_, i) => ({
      id: `n${i}`, shipmentRef: 'A8121', photoType: 'uruguay',
      createdAt: cuando('2026-09-08') + i, thumbnailUrl: `https://firmada/n${i}`,
    }))
    const origen = {
      id: 'or-vieja', shipmentRef: 'A8121', photoType: 'origen',
      createdAt: cuando('2026-08-18'), thumbnailUrl: 'https://firmada/or-vieja',
    }
    const todas = [...mezcla, ...nuevas, origen]
    const fila = novedadesCliente([cargaN], todas, [], HOY_N).find(f => f.lugarFoto === 'uruguay')!
    expect(fila.cantidad).toBe(7)

    // La galería del visor es la MISMA que dibujó la tira.
    const galeria = galeriaDeNovedad(todas, fila)
    const tira = tiraDeMiniaturas(galeria)
    expect(galeria).toHaveLength(fila.cantidad)          // "1 / 7", no "1 / 15"
    expect(galeria.map(f => f.id)).not.toContain('or-vieja')
    expect(galeria.map(f => f.id).some(id => id.startsWith('vieja'))).toBe(false)

    // Y el "+N" abre justo en la primera que no entró en la tira.
    expect(indiceEnGaleria(galeria, tira.siguiente!.id)).toBe(MAX_MINIATURAS)
    expect(indiceEnGaleria(galeria, tira.visibles[0].id)).toBe(0)

    // La galería de TODA la carga sigue siendo más grande: es otra cosa, y es
    // justo la que el visor NO tiene que abrir desde el aviso.
    expect(galeriaDeCarga(todas, 'A8121').length).toBeGreaterThan(galeria.length)
  })

  it('una fila de informe no arrastra ninguna foto', () => {
    const [fila] = novedadesCliente(
      [cargaN], [],
      [{ id: 'inf-1', shipmentRef: 'A8121', title: 'Informe', createdAt: cuando('2026-09-09') }],
      HOY_N,
    )
    expect(fila.clase).toBe('informe')
    expect(fila.fotoIds).toEqual([])
    expect(galeriaDeNovedad(mezcla, fila)).toEqual([])
  })
})

// ── El "+N" no puede contar fotos que no se dibujan ─────────────────────

describe('la tira cuenta sobre lo que se puede dibujar', () => {
  const HOY_V = '2026-09-10'
  const cuando = (iso: string) => Date.parse(iso + 'T12:00:00Z')
  /** Foto vieja sin migrar a Storage: no tiene miniatura de ninguna clase. */
  const legacy = (id: string, n: number) => ({
    id, shipmentRef: 'A8121', photoType: 'uruguay', createdAt: cuando(HOY_V) - n * 1000,
  })
  const conMini = (id: string, n: number) => ({
    ...legacy(id, n), thumbnailUrl: `https://firmada/${id}`,
  })
  const ids = (fotos: { id: string }[]) => fotos.map(f => f.id)
  const tira = (fotos: { id: string }[]) =>
    tiraDeMiniaturas(galeriaDeNovedad(fotos, { ref: 'A8121', lugarFoto: 'uruguay', fotoIds: ids(fotos) }))

  it('sePuedeDibujar: URL firmada, base64 viejo, o nada', () => {
    expect(sePuedeDibujar({ thumbnailUrl: 'https://firmada/x' })).toBe(true)
    expect(sePuedeDibujar({ thumbnailData: 'data:image/jpeg;base64,AAA' })).toBe(true)
    expect(sePuedeDibujar({ thumbnailUrl: null, thumbnailData: '' })).toBe(false)
    expect(sePuedeDibujar(null)).toBe(false)
    expect(fuenteMiniatura({ thumbnailUrl: null, thumbnailData: 'data:x' })).toBe('data:x')
  })

  it('siete fotos y solo dos con miniatura: dos miniaturas y NINGÚN "+5"', () => {
    const t = tira([
      conMini('a', 1), conMini('b', 2),
      ...Array.from({ length: 5 }, (_, i) => legacy(`vieja${i}`, 3 + i)),
    ])
    expect(ids(t.visibles)).toEqual(['a', 'b'])
    expect(t.mas).toBe(0)          // antes: 3 (7 − 4) y se dibujaban dos
    expect(t.total).toBe(2)
    expect(t.siguiente).toBeNull()
  })

  it('si las primeras cuatro son viejas sin migrar, la tira NO desaparece', () => {
    // El caso peor del bug: `visibles` eran las cuatro legacy, el componente
    // las descartaba al pintar y devolvía null — se perdía la tira entera,
    // "+N" y fotos con miniatura incluidas.
    const t = tira([
      ...Array.from({ length: 4 }, (_, i) => legacy(`vieja${i}`, i)),
      conMini('c', 5), conMini('d', 6),
    ])
    expect(ids(t.visibles)).toEqual(['c', 'd'])
    expect(t.mas).toBe(0)
    expect(t.total).toBe(2)
  })

  it('con seis dibujables el "+N" sigue siendo el de siempre', () => {
    const t = tira(Array.from({ length: 6 }, (_, i) => conMini(`f${i}`, i)))
    expect(t.visibles).toHaveLength(4)
    expect(t.mas).toBe(2)
    expect(t.siguiente?.id).toBe('f4')
  })

  it('sin ninguna dibujable la tira sale vacía (la fila queda como estaba)', () => {
    const t = tira(Array.from({ length: 3 }, (_, i) => legacy(`v${i}`, i)))
    expect(t).toEqual({ visibles: [], mas: 0, total: 0, siguiente: null })
  })
})

// ── Los avisos, traducidos ────────────────────────────────────────────────

describe('traducirAlerta — "Libre" no llega al cliente', () => {
  const alerta = (type: string, extra: Partial<ShipmentAlert> = {}): ShipmentAlert => ({
    id: `x-${type}`, shipmentRef: 'A8121', type, severity: 'critical',
    title: 'Días libres vencidos', message: 'Vencido hace 3 días (2026-09-01)', date: '2026-09-01',
    ...extra,
  } as ShipmentAlert)

  it('un LIBRE vencido se dice como lo que el cliente puede hacer', () => {
    const t = traducirAlerta(alerta('libre_vencido'))!
    expect(t.titulo).toBe('Conviene coordinar la salida')
    expect(`${t.titulo} ${t.detalle}`.toLowerCase()).not.toContain('libre')
    expect(t.conFecha).toBe(false)
  })

  it('el aviso de "próximo vencimiento" no es asunto del cliente', () => {
    expect(traducirAlerta(alerta('libre_proximo', { severity: 'info' }))).toBeNull()
  })

  it('el resto de los avisos pasa tal cual, con su fecha', () => {
    const t = traducirAlerta(alerta('report_ready', { title: 'Informe operativo disponible', message: '"Trasiego"' }))!
    expect(t.titulo).toBe('Informe operativo disponible')
    expect(t.conFecha).toBe(true)
  })
})
