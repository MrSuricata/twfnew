import { describe, it, expect } from 'vitest'
import {
  esVigente, noticiasVigentes, alertasVigentes, claveAlertas, rowToNoticia, categoriaMeta,
  estiloSlide, tituloPartes, tituloPlano, linkNoticia, ordenSlides, recencia, type Noticia,
  avisosRotativos, indiceSiguiente, indiceValido, linkDiario, anclaNoticia,
  lineasEstimadas, ajustarColumna, filasKicker, ANCHO_CARACTER, type BloqueTexto,
  reservaAvisos,
} from './noticias'

const HOY = '2026-08-28'

const noticia = (over: Partial<Noticia>): Noticia => ({
  id: 'n1', titulo: 'T', bajada: '', cuerpo: '', categoria: 'general',
  imagenUrl: '', alerta: false, activo: true, publicadaAt: '2026-08-28T10:00:00Z',
  actualizadaAt: '',
  vigenteHasta: '', estilo: '', kicker: '', kickerExtra: '', subtitulo: '',
  mensaje: '', linkUrl: '', ...over,
})

describe('vigencia — la portada nunca muestra notas viejas', () => {
  it('activa sin vencimiento: vigente', () => {
    expect(esVigente(noticia({}), HOY)).toBe(true)
  })
  it('vence HOY inclusive; mañana ya no', () => {
    expect(esVigente(noticia({ vigenteHasta: '2026-08-28' }), HOY)).toBe(true)
    expect(esVigente(noticia({ vigenteHasta: '2026-08-27' }), HOY)).toBe(false)
  })
  it('inactiva nunca', () => {
    expect(esVigente(noticia({ activo: false }), HOY)).toBe(false)
  })
  it('ordena por publicación, más nueva primero', () => {
    const out = noticiasVigentes([
      noticia({ id: 'vieja', publicadaAt: '2026-08-20T09:00:00Z' }),
      noticia({ id: 'nueva', publicadaAt: '2026-08-28T09:00:00Z' }),
      noticia({ id: 'vencida', vigenteHasta: '2026-08-01' }),
    ], HOY)
    expect(out.map(n => n.id)).toEqual(['nueva', 'vieja'])
  })
  it('una nota ACTUALIZADA hoy sube, aunque se haya publicado antes (Brian 02/09)', () => {
    const out = noticiasVigentes([
      noticia({ id: 'nueva', publicadaAt: '2026-08-28T09:00:00Z' }),
      noticia({ id: 'vieja-actualizada', publicadaAt: '2026-08-20T09:00:00Z', actualizadaAt: '2026-08-28T18:00:00Z' }),
    ], HOY)
    expect(out.map(n => n.id)).toEqual(['vieja-actualizada', 'nueva'])
  })
  it('sin fecha de edición manda la de publicación', () => {
    expect(recencia({ publicadaAt: '2026-08-20T09:00:00Z', actualizadaAt: '' })).toBe('2026-08-20T09:00:00Z')
    expect(recencia({ publicadaAt: '2026-08-20T09:00:00Z', actualizadaAt: '2026-08-01T09:00:00Z' })).toBe('2026-08-20T09:00:00Z')
  })
})

describe('alertas del día (1×/día por navegador)', () => {
  it('solo las vigentes marcadas como alerta', () => {
    const out = alertasVigentes([
      noticia({ id: 'a', alerta: true }),
      noticia({ id: 'b', alerta: false }),
      noticia({ id: 'c', alerta: true, vigenteHasta: '2026-08-01' }),
    ], HOY)
    expect(out.map(n => n.id)).toEqual(['a'])
  })
  it('la clave cambia si cambia el día o el set de alertas → se vuelve a mostrar', () => {
    const a = [{ id: 'x' }], b = [{ id: 'x' }, { id: 'y' }]
    expect(claveAlertas('2026-08-28', a)).not.toBe(claveAlertas('2026-08-29', a))
    expect(claveAlertas('2026-08-28', a)).not.toBe(claveAlertas('2026-08-28', b))
    expect(claveAlertas('2026-08-28', [{ id: 'y' }, { id: 'x' }])).toBe(claveAlertas('2026-08-28', b))
  })
})

describe('rowToNoticia y categorías', () => {
  it('mapea snake_case y defaults', () => {
    const n = rowToNoticia({ id: '1', titulo: 'T', imagen_url: 'u', publicada_at: 'p', vigente_hasta: '', alerta: 1, activo: true })
    expect(n.imagenUrl).toBe('u')
    expect(n.alerta).toBe(true)
    expect(n.categoria).toBe('general')
  })
  it('categoría desconocida cae a general (nunca rompe el chip)', () => {
    expect(categoriaMeta('lo-que-sea').label).toBe('Interés general')
    expect(categoriaMeta('tifones').label).toContain('Tifones')
  })
  it('mapea los campos del slide (snake_case)', () => {
    const n = rowToNoticia({
      id: '1', titulo: 'T', estilo: 'papel', kicker: 'Aviso', kicker_extra: 'China',
      subtitulo: 'S', mensaje: 'M', link_url: 'https://x.com/nota',
    })
    expect(n.estilo).toBe('papel')
    expect(n.kickerExtra).toBe('China')
    expect(n.linkUrl).toBe('https://x.com/nota')
  })
})

describe('carrusel de portada', () => {
  it('estilo elegido a mano manda; si no, el de la categoría', () => {
    expect(estiloSlide(noticia({ estilo: 'actualizacion', categoria: 'tifones' }))).toBe('actualizacion')
    expect(estiloSlide(noticia({ categoria: 'tifones' }))).toBe('violeta')
    expect(estiloSlide(noticia({ categoria: 'feriados' }))).toBe('papel')
    expect(estiloSlide(noticia({ categoria: 'general' }))).toBe('celeste')
    expect(estiloSlide(noticia({ estilo: 'cualquiera', categoria: 'paros' }))).toBe('celeste')
  })
  it('la barra del título corta en dos líneas; tituloPlano la saca para las listas', () => {
    expect(tituloPartes('Tifones en China:|cierres portuarios')).toEqual(['Tifones en China:', 'cierres portuarios'])
    expect(tituloPartes('Sin barra')).toEqual(['Sin barra', ''])
    expect(tituloPlano('China cerrada|del 1 al 7 de octubre')).toBe('China cerrada del 1 al 7 de octubre')
  })
  it('los avisos abren el carrusel y el resto va cronológico', () => {
    const vigentes = [   // como los devuelve noticiasVigentes: más nueva primero
      noticia({ id: 'aviso-nuevo', alerta: true }),
      noticia({ id: 'nota-c' }),
      noticia({ id: 'aviso-viejo', alerta: true }),
      noticia({ id: 'nota-b' }),
      noticia({ id: 'nota-a' }),
    ]
    expect(ordenSlides(vigentes).map(n => n.id))
      .toEqual(['aviso-nuevo', 'aviso-viejo', 'nota-c', 'nota-b', 'nota-a'])
  })
  it('corta en los 6 más recientes antes de ordenar', () => {
    const muchas = Array.from({ length: 9 }, (_, i) => noticia({ id: `n${i}` }))
    expect(ordenSlides(muchas)).toHaveLength(6)
  })
  it('"Ir a la noticia" solo navega a http(s); cualquier otra cosa cae en /novedades', () => {
    expect(linkNoticia(noticia({ linkUrl: 'https://lanacion.com.ar/x' }))).toEqual({ href: 'https://lanacion.com.ar/x', externo: true })
    expect(linkNoticia(noticia({ linkUrl: '' }))).toEqual({ href: '/novedades', externo: false })
    // eslint-disable-next-line no-script-url
    expect(linkNoticia(noticia({ linkUrl: 'javascript:alert(1)' })).href).toBe('/novedades')
  })
})

describe('aviso operativo rotativo — las mismas tarjetas que el Diario', () => {
  const lista = [
    noticia({ id: 'vieja', publicadaAt: '2026-08-20T09:00:00Z' }),
    noticia({ id: 'alerta', alerta: true, publicadaAt: '2026-08-22T09:00:00Z' }),
    noticia({ id: 'nueva', publicadaAt: '2026-08-27T09:00:00Z' }),
    noticia({ id: 'vencida', publicadaAt: '2026-08-27T12:00:00Z', vigenteHasta: '2026-08-27' }),
    noticia({ id: 'apagada', activo: false }),
  ]
  it('rota por las vigentes, alertas primero y después de más nueva a más vieja', () => {
    expect(avisosRotativos(lista, HOY).map(n => n.id)).toEqual(['alerta', 'nueva', 'vieja'])
  })
  it('coincide con el orden del carrusel del Diario', () => {
    expect(avisosRotativos(lista, HOY)).toEqual(ordenSlides(noticiasVigentes(lista, HOY)))
  })
  it('sin vigentes no rota nada', () => {
    expect(avisosRotativos([noticia({ activo: false })], HOY)).toEqual([])
  })
  it('avanza y vuelve al principio', () => {
    expect(indiceSiguiente(0, 3)).toBe(1)
    expect(indiceSiguiente(2, 3)).toBe(0)
    expect(indiceSiguiente(0, 1)).toBe(0)
    expect(indiceSiguiente(5, 0)).toBe(0)
  })
  it('si la lista se achica, el índice se acomoda en vez de quedar afuera', () => {
    expect(indiceValido(4, 3)).toBe(2)
    expect(indiceValido(1, 3)).toBe(1)
    expect(indiceValido(2, 0)).toBe(0)
  })
})

describe('el banner manda al Diario, no a la fuente (Brian 03/09)', () => {
  it('siempre va al Diario con la nota abierta, aunque la nota tenga fuente externa', () => {
    expect(linkDiario(noticia({ id: 'abc', linkUrl: 'https://diario.com/nota' }))).toBe('/novedades#nota-abc')
    expect(linkDiario(noticia({ id: 'abc', linkUrl: '' }))).toBe('/novedades#nota-abc')
  })
  it('el ancla del link es la misma que la del artículo en la página', () => {
    const n = noticia({ id: 'x1' })
    expect(linkDiario(n)).toBe(`/novedades#${anclaNoticia(n.id)}`)
  })
  it('la fuente externa sigue disponible aparte', () => {
    expect(linkNoticia(noticia({ linkUrl: 'https://diario.com/nota' }))).toEqual({ href: 'https://diario.com/nota', externo: true })
    expect(linkNoticia(noticia({ linkUrl: '' })).externo).toBe(false)
  })
})


// ── El texto del slide nunca queda cortado (Brian 03/09) ─────────────────
// "acá en el diario logístico aparece texto cortado, no puede pasarnos más".
// La regla es una sola: lo que cada bloque RESERVA es la misma cantidad de
// renglones que después recorta el CSS, así que la suma de las reservas más los
// altos fijos y los espacios entre bloques nunca puede pasarse del alto de la
// columna. Si eso se cumple, no hay renglón partido contra el borde.

/** El alto que ocupa una columna con el reparto que devolvió ajustarColumna. */
const altoTotal = (
  res: Record<string, { alto: number }>, bloques: BloqueTexto[],
  { gap, fijos = [] }: { gap: number; fijos?: number[] },
): number => {
  const hijos = bloques.length + fijos.length
  return bloques.reduce((a, b) => a + res[b.clave].alto, 0)
    + fijos.reduce((a, b) => a + b, 0)
    + gap * Math.max(0, hijos - 1)
}

const repetir = (t: string, veces: number) => Array.from({ length: veces }, () => t).join(' ')

// Textos reales de la nota que reportó Brian (conflicto en TCP, estilo celeste).
const TCP_TITULO = 'Puerto de Montevideo: conflicto en TCP'
const TCP_SUBTITULO = 'La terminal opera con normalidad, pero el sindicato sigue en asamblea permanente y el convenio vencido.'
const TCP_BAJADA = 'Katoen Natie presentó el 26/08 lo que llamó su propuesta **"definitiva"** (mejoras en 3 de los 6 puntos) y el sindicato la rechazó: declaró **asamblea permanente** y evalúa nuevas medidas. La mediación sigue en el Ministerio de Trabajo.'

/** La columna izquierda del slide celeste, tal cual la arma el carrusel. */
const columnaCeleste = (n: { titulo: string; subtitulo: string; bajada: string }): BloqueTexto[] => [
  { clave: 'titulo', texto: n.titulo, ancho: 750, tamanos: [84, 76, 69], lineHeight: 0.98, factor: ANCHO_CARACTER.titulo },
  { clave: 'subtitulo', texto: n.subtitulo, ancho: 670, tamanos: [34, 31, 28], lineHeight: 1.5, factor: ANCHO_CARACTER.titulo, extra: 32 },
  { clave: 'bajada', texto: n.bajada, ancho: 750, tamanos: [32, 29, 26], lineHeight: 1.3 },
]
const CAJA_CELESTE = { alto: 708, gap: 26, fijos: [74] }

describe('lineasEstimadas — cuántos renglones ocupa un texto', () => {
  it('un texto corto entra en un renglón', () => {
    expect(lineasEstimadas('Hola', { ancho: 750, fontSize: 32 })).toBe(1)
  })
  it('texto vacío no ocupa nada (el bloque no se dibuja)', () => {
    expect(lineasEstimadas('', { ancho: 750, fontSize: 32 })).toBe(0)
    expect(lineasEstimadas('   ', { ancho: 750, fontSize: 32 })).toBe(0)
  })
  it('los asteriscos de las negritas no ocupan ancho: no se ven en pantalla', () => {
    const con = lineasEstimadas('**' + TCP_BAJADA + '**', { ancho: 750, fontSize: 32 })
    const sin = lineasEstimadas(TCP_BAJADA.replace(/\*\*/g, ''), { ancho: 750, fontSize: 32 })
    expect(con).toBe(sin)
  })
  it('cuanto más angosta la columna, más renglones', () => {
    const ancho = lineasEstimadas(TCP_BAJADA, { ancho: 750, fontSize: 32 })
    const angosto = lineasEstimadas(TCP_BAJADA, { ancho: 400, fontSize: 32 })
    expect(angosto).toBeGreaterThan(ancho)
  })
  it('cuanto más grande la fuente, más renglones', () => {
    const chica = lineasEstimadas(TCP_BAJADA, { ancho: 750, fontSize: 26 })
    const grande = lineasEstimadas(TCP_BAJADA, { ancho: 750, fontSize: 44 })
    expect(grande).toBeGreaterThan(chica)
  })
  it('el "|" del título cuenta como salto de renglón de verdad', () => {
    // Dos mitades cortas: una sola línea cada una, dos en total.
    expect(lineasEstimadas('China cerrada\ndel 1 al 7', { ancho: 570, fontSize: 78, factor: ANCHO_CARACTER.titulo })).toBe(2)
  })
  it('una palabra más larga que el renglón se parte en varios', () => {
    expect(lineasEstimadas('a'.repeat(60), { ancho: 200, fontSize: 32 })).toBeGreaterThan(1)
  })
  it('estima el ancho de la nota del TCP como lo que se ve en pantalla (6 renglones a 32px en 750)', () => {
    expect(lineasEstimadas(TCP_BAJADA, { ancho: 750, fontSize: 32 })).toBe(6)
  })
})

describe('ajustarColumna — la reserva nunca se pasa del alto de la columna', () => {
  it('la nota del TCP entra entera achicando un escalón: nada recortado', () => {
    const bloques = columnaCeleste({ titulo: TCP_TITULO, subtitulo: TCP_SUBTITULO, bajada: TCP_BAJADA })
    const res = ajustarColumna(bloques, CAJA_CELESTE)
    expect(altoTotal(res, bloques, CAJA_CELESTE)).toBeLessThanOrEqual(CAJA_CELESTE.alto)
    expect(res.bajada.recortado).toBe(false)
    expect(res.titulo.recortado).toBe(false)
    expect(res.subtitulo.recortado).toBe(false)
  })

  it('con texto corto no achica la fuente ni recorta', () => {
    const bloques = columnaCeleste({ titulo: 'China cerrada', subtitulo: 'Del 1 al 7 de octubre.', bajada: 'Fábricas y puertos detenidos.' })
    const res = ajustarColumna(bloques, CAJA_CELESTE)
    expect(res.titulo.fontSize).toBe(84)
    expect(res.bajada.fontSize).toBe(32)
    expect(Object.values(res).every(b => !b.recortado)).toBe(true)
  })

  it('con una nota el DOBLE de larga sigue entrando: recorta, pero no se pasa', () => {
    const bloques = columnaCeleste({
      titulo: repetir(TCP_TITULO, 3),
      subtitulo: repetir(TCP_SUBTITULO, 3),
      bajada: repetir(TCP_BAJADA, 3),
    })
    const res = ajustarColumna(bloques, CAJA_CELESTE)
    expect(altoTotal(res, bloques, CAJA_CELESTE)).toBeLessThanOrEqual(CAJA_CELESTE.alto)
    expect(res.bajada.recortado).toBe(true)
  })

  it('por larguísimo que sea el texto, ningún bloque desaparece: piso de dos renglones', () => {
    const bloques = columnaCeleste({
      titulo: repetir(TCP_TITULO, 20),
      subtitulo: repetir(TCP_SUBTITULO, 20),
      bajada: repetir(TCP_BAJADA, 20),
    })
    const res = ajustarColumna(bloques, CAJA_CELESTE)
    expect(altoTotal(res, bloques, CAJA_CELESTE)).toBeLessThanOrEqual(CAJA_CELESTE.alto)
    for (const b of bloques) expect(res[b.clave].maxLineas).toBeGreaterThanOrEqual(2)
  })

  it('el alto reservado es exactamente los renglones que después recorta el CSS', () => {
    const bloques = columnaCeleste({ titulo: TCP_TITULO, subtitulo: TCP_SUBTITULO, bajada: TCP_BAJADA })
    const res = ajustarColumna(bloques, CAJA_CELESTE)
    for (const b of bloques) {
      const a = res[b.clave]
      expect(a.alto).toBeCloseTo(a.maxLineas * a.fontSize * a.lineHeight + (b.extra || 0), 5)
    }
  })

  it('un bloque vacío no reserva nada (ni su padding)', () => {
    const bloques = columnaCeleste({ titulo: TCP_TITULO, subtitulo: '', bajada: TCP_BAJADA })
    const res = ajustarColumna(bloques, CAJA_CELESTE)
    expect(res.subtitulo.maxLineas).toBe(0)
    expect(res.subtitulo.alto).toBe(0)
    expect(res.subtitulo.recortado).toBe(false)
  })

  it('achica la fuente antes de recortar', () => {
    const corto = ajustarColumna(columnaCeleste({ titulo: 'Corto', subtitulo: 'Corto', bajada: 'Corto' }), CAJA_CELESTE)
    const largo = ajustarColumna(columnaCeleste({ titulo: TCP_TITULO, subtitulo: TCP_SUBTITULO, bajada: TCP_BAJADA }), CAJA_CELESTE)
    expect(largo.bajada.fontSize).toBeLessThan(corto.bajada.fontSize)
  })

  it('la columna derecha (mensaje + botón + logo) tampoco se pasa', () => {
    const bloques: BloqueTexto[] = [{
      clave: 'mensaje', texto: repetir(TCP_BAJADA, 6), ancho: 502,
      tamanos: [32, 29, 26], lineHeight: 1.3, extra: 80,
    }]
    const caja = { alto: 688, gap: 28, fijos: [93, 101] }
    const res = ajustarColumna(bloques, caja)
    expect(altoTotal(res, bloques, caja)).toBeLessThanOrEqual(caja.alto)
    expect(res.mensaje.maxLineas).toBeGreaterThan(0)
  })

  it('las cuatro variantes aguantan cualquier texto sin pasarse del alto', () => {
    // Geometría real de cada slide: [bloques, alto útil, gap, altos fijos].
    const variantes: Array<[string, BloqueTexto[], { alto: number; gap: number; fijos: number[] }]> = [
      ['violeta izq', [
        { clave: 'titulo', texto: repetir(TCP_TITULO, 8), ancho: 790, tamanos: [86, 77, 71], lineHeight: 0.98, factor: ANCHO_CARACTER.titulo },
        { clave: 'bajada', texto: repetir(TCP_BAJADA, 8), ancho: 790, tamanos: [38, 34, 31], lineHeight: 1.3 },
      ], { alto: 708, gap: 30, fijos: [74, 8] }],
      ['celeste izq', columnaCeleste({ titulo: repetir(TCP_TITULO, 8), subtitulo: repetir(TCP_SUBTITULO, 8), bajada: repetir(TCP_BAJADA, 8) }), CAJA_CELESTE],
      ['actualizacion izq', [
        { clave: 'bajada', texto: repetir(TCP_BAJADA, 8), ancho: 730, tamanos: [44, 40, 36], lineHeight: 1.3 },
        { clave: 'subtitulo', texto: repetir(TCP_SUBTITULO, 8), ancho: 730, tamanos: [32, 29, 26], lineHeight: 1.3 },
      ], { alto: 698, gap: 28, fijos: [74, 8] }],
      ['papel izq', [
        { clave: 'titulo', texto: repetir(TCP_TITULO, 8), ancho: 570, tamanos: [78, 70, 64], lineHeight: 0.98, factor: ANCHO_CARACTER.titulo },
        { clave: 'bajada', texto: repetir(TCP_BAJADA, 8), ancho: 570, tamanos: [34, 31, 28], lineHeight: 1.3 },
      ], { alto: 708, gap: 32, fijos: [116, 8] }],
    ]
    for (const [nombre, bloques, caja] of variantes) {
      const res = ajustarColumna(bloques, caja)
      // El nombre va en la aserción para que, si alguna vez falla, el error
      // diga qué variante se pasó.
      expect({ [nombre]: altoTotal(res, bloques, caja) <= caja.alto }).toEqual({ [nombre]: true })
      for (const b of bloques) expect(res[b.clave].maxLineas).toBeGreaterThanOrEqual(2)
    }
  })

  it('una columna sin bloques de texto no rompe', () => {
    expect(ajustarColumna([], { alto: 700, gap: 28, fijos: [93, 101] })).toEqual({})
  })
})

describe('filasKicker — la pill del kicker mide lo que la columna le reserva', () => {
  it('un kicker corto con fecha al lado entra en una fila', () => {
    expect(filasKicker('Aviso operativo', '02/09/2026', { ancho: 750 })).toBe(1)
  })
  it('kicker + texto largo al lado no entran: dos filas', () => {
    expect(filasKicker('Aviso operativo', 'Jueves 3 y viernes 4', { ancho: 750 })).toBe(2)
  })
  it('sin texto al lado, el kicker tiene toda la columna', () => {
    expect(filasKicker('Actualización · 02/09', '', { ancho: 730 })).toBe(1)
  })
  it('en la columna angosta del slide papel, un kicker largo pasa a dos filas', () => {
    expect(filasKicker('Actualización de último momento', 'Setiembre 2026', { ancho: 570 })).toBe(2)
  })
})

describe('reservaAvisos — el banner de los portales no cambia de alto', () => {
  // Tres notas de la misma rotación con textos de largos MUY distintos: es
  // exactamente lo que hacía crecer y encoger la tarjeta cada 8 segundos.
  const corta = noticia({ id: 'a', titulo: 'Paro en TCP', bajada: '' })
  const media = noticia({
    id: 'b',
    titulo: 'Tifones en China: cierres portuarios en la costa sur',
    bajada: 'Shenzhen y Guangzhou operan con demoras.',
  })
  const larga = noticia({
    id: 'c',
    titulo: 'Actualización del cronograma de feriados en Asia para el cierre del año',
    bajada: 'Las fábricas paran una semana completa y las navieras adelantan los cortes '
      + 'documentarios, así que conviene cerrar los embarques con margen y confirmar el '
      + 'booking antes del corte de la semana anterior.',
  })
  const rotacion = [corta, media, larga]
  const ANCHO = 327   // el ancho útil del banner en un celular de 375px

  it('reserva lo que pide la nota MÁS LARGA, no la que se está viendo', () => {
    const solaCorta = reservaAvisos([corta], { ancho: ANCHO, fontTitulo: 20 })
    const todas = reservaAvisos(rotacion, { ancho: ANCHO, fontTitulo: 20 })
    expect(todas.alto).toBeGreaterThan(solaCorta.alto)
    expect(todas.lineasTitulo).toBe(reservaAvisos([larga], { ancho: ANCHO, fontTitulo: 20 }).lineasTitulo)
  })

  it('la reserva es la MISMA sea cual sea la nota que se muestra: por eso no salta', () => {
    const uno = reservaAvisos(rotacion, { ancho: ANCHO, fontTitulo: 20 })
    const otro = reservaAvisos([larga, corta, media], { ancho: ANCHO, fontTitulo: 20 })
    expect(otro).toEqual(uno)
  })

  it('una nota sin bajada no baja la reserva de la bajada de las otras', () => {
    const conBajada = reservaAvisos([media], { ancho: ANCHO, fontTitulo: 20 })
    const conLaCortaAdentro = reservaAvisos([corta, media], { ancho: ANCHO, fontTitulo: 20 })
    expect(conLaCortaAdentro.lineasBajada).toBe(conBajada.lineasBajada)
    expect(conLaCortaAdentro.alto).toBe(conBajada.alto)
  })

  it('en un celular entran menos palabras por renglón: se reserva más alto', () => {
    const celular = reservaAvisos(rotacion, { ancho: ANCHO, fontTitulo: 20 })
    const escritorio = reservaAvisos(rotacion, { ancho: 900, fontTitulo: 24 })
    expect(celular.alto).toBeGreaterThan(escritorio.alto)
  })

  it('el alto sale de las mismas líneas y line-heights que después recorta el CSS', () => {
    const r = reservaAvisos([media], { ancho: ANCHO, fontTitulo: 20, lhTitulo: 1.3, lhBajada: 1.5, gapBajada: 6 })
    const esperado = r.lineasTitulo * 20 * 1.3 + 6 + r.lineasBajada * 14 * 1.5
    expect(r.alto).toBe(Math.ceil(esperado))
  })

  it('ninguna nota puede hacer un banner de media pantalla: hay techo de renglones', () => {
    const infinita = noticia({
      titulo: 'palabra '.repeat(80).trim(),
      bajada: 'renglon '.repeat(200).trim(),
    })
    const r = reservaAvisos([infinita], { ancho: 300, fontTitulo: 20 })
    expect(r.lineasTitulo).toBe(3)
    expect(r.lineasBajada).toBe(3)
    expect(r.alto).toBeLessThan(200)
  })

  it('antes de medir el ancho no se reserva nada (alto natural, sin salto raro)', () => {
    expect(reservaAvisos(rotacion, { ancho: 0 })).toEqual({ lineasTitulo: 0, lineasBajada: 0, alto: 0 })
    expect(reservaAvisos([], { ancho: 900 })).toEqual({ lineasTitulo: 0, lineasBajada: 0, alto: 0 })
  })

  it('la barra del título (dos líneas del Diario) no cuenta como texto', () => {
    const conBarra = reservaAvisos([noticia({ titulo: 'Tifones en China:|cierres portuarios' })], { ancho: 900, fontTitulo: 24 })
    const sinBarra = reservaAvisos([noticia({ titulo: 'Tifones en China cierres portuarios' })], { ancho: 900, fontTitulo: 24 })
    expect(conBarra).toEqual(sinBarra)
  })
})
