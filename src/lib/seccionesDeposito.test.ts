/**
 * El orden de las cards del depósito y los chips de la barra.
 *
 * Lo que estos tests no dejan pasar es el reclamo de Brian del 04/09: entrar y
 * leer "Operativas de hoy: 0" con ocho retiros esperando abajo. Si alguien
 * vuelve el orden a una lista fija, acá se cae.
 *
 * 04/09, más tarde: la regla se endureció. Antes la card vacía bajaba SOLO si
 * había algo urgente; ahora baja siempre que esté en cero, haya o no urgencia.
 * Cinco tests de acá fijaban la versión con excepción y se actualizaron: cada
 * uno dice al lado qué cambió y por qué.
 */
import { describe, it, expect } from 'vitest'
import {
  SECCIONES_DEPOSITO, ORDEN_BASE_DEPOSITO, IDS_SECCIONES_DEPOSITO, SIN_NADA,
  ordenSeccionesDeposito, seccionConContenido, chipsSeccionesDeposito,
  hayBarraSecciones, anclaSeccion, seccionActiva, claveCardsDeposito, puedeAdoptarOrden,
  type EstadoSeccionesDeposito, type SeccionDepositoId,
} from './seccionesDeposito'

const estado = (over: Partial<EstadoSeccionesDeposito> = {}): EstadoSeccionesDeposito =>
  ({ ...SIN_NADA, ...over })

describe('ordenSeccionesDeposito — con trabajo hoy manda el día', () => {
  it('con operativas hoy, "Hoy" va primera aunque haya vacíos venciendo y retiros verdes', () => {
    const orden = ordenSeccionesDeposito(estado({
      operativasHoy: 3, vacios: 5, vaciosPorVencer: 4, retiros: 8, retirosListos: 6,
    }))
    expect(orden[0]).toBe('hoy')
    expect(orden).toEqual(ORDEN_BASE_DEPOSITO)
  })

  it('una sola operativa hoy ya alcanza para que mande el día', () => {
    const orden = ordenSeccionesDeposito(estado({ operativasHoy: 1, vaciosPorVencer: 9 }))
    expect(orden[0]).toBe('hoy')
  })
})

describe('ordenSeccionesDeposito — sin trabajo hoy la card vacía baja siempre', () => {
  it('el caso de Bruno: 0 operativas y 8 retiros con verdes → los retiros arriba, "Hoy" ya no primera', () => {
    const orden = ordenSeccionesDeposito(estado({ operativasHoy: 0, retiros: 8, retirosListos: 3 }))
    expect(orden[0]).toBe('retiros')
    expect(orden.indexOf('hoy')).toBeGreaterThan(0)
  })

  it('primero lo que sangra: los vacíos por vencer van ANTES que los retiros verdes', () => {
    const orden = ordenSeccionesDeposito(estado({
      retiros: 4, retirosListos: 2, vacios: 3, vaciosPorVencer: 1,
    }))
    expect(orden.slice(0, 2)).toEqual(['vacios', 'retiros'])
  })

  it('solo vacíos por vencer: suben ellos y "Hoy" queda debajo de las dos cards de trabajo', () => {
    // ACTUALIZADO 04/09: antes "Hoy" quedaba SEGUNDA (['vacios','hoy','retiros',…]).
    // Con la regla sin excepción, arriba van siempre retiros y vacíos —acá los
    // vacíos primero porque sangran— y la card vacía cae tercera.
    const orden = ordenSeccionesDeposito(estado({ vacios: 2, vaciosPorVencer: 2 }))
    expect(orden).toEqual(['vacios', 'retiros', 'hoy', 'lcl', 'plan', 'avisos', 'agenda'])
  })

  it('la card de "Hoy" BAJA pero nunca desaparece: siempre están las seis', () => {
    const casos: Partial<EstadoSeccionesDeposito>[] = [
      {}, { retirosListos: 1 }, { vaciosPorVencer: 1 }, { vaciosPorVencer: 2, retirosListos: 2 },
      { operativasHoy: 4 },
    ]
    for (const c of casos) {
      const orden = ordenSeccionesDeposito(estado(c))
      expect([...orden].sort()).toEqual([...ORDEN_BASE_DEPOSITO].sort())
      expect(orden).toContain('hoy')
    }
  })

  it('vacíos que están solo por un dato faltante NO son urgentes: no se adelantan a los retiros', () => {
    // `vacios` cuenta filas; `vaciosPorVencer` solo las que corren contra el reloj.
    // ACTUALIZADO 04/09: antes esto daba el ORDEN_BASE entero (con "Hoy"
    // primera). Lo que el test sigue cuidando es lo suyo: sin vencimiento, los
    // vacíos NO se adelantan a los retiros. "Hoy" baja por la regla general.
    const orden = ordenSeccionesDeposito(estado({ vacios: 6, vaciosPorVencer: 0 }))
    expect(orden).toEqual(['retiros', 'vacios', 'hoy', 'lcl', 'plan', 'avisos', 'agenda'])
  })

  it('retiros que no están en verde no se adelantan a los vacíos', () => {
    // ACTUALIZADO 04/09: antes daba el ORDEN_BASE entero. Sigue probando que un
    // retiro que todavía no se puede ir a buscar no gana prioridad; lo único que
    // cambió es que "Hoy", en cero, ya no encabeza.
    const orden = ordenSeccionesDeposito(estado({ retiros: 8, retirosListos: 0 }))
    expect(orden).toEqual(['retiros', 'vacios', 'hoy', 'lcl', 'plan', 'avisos', 'agenda'])
  })

  it('con el portal en CERO la card vacía igual baja: es la regla sin excepción', () => {
    // ACTUALIZADO 04/09: antes un día sin nada urgente devolvía el ORDEN_BASE y
    // "Operativas de hoy: 0" volvía a ser el titular. Brian dijo que le daba lo
    // mismo y que decidiéramos: gana la regla que se explica en una línea.
    expect(ordenSeccionesDeposito(SIN_NADA)).toEqual(['retiros', 'vacios', 'hoy', 'lcl', 'plan', 'avisos', 'agenda'])
  })

  it('la invariante: con 0 operativas, "Hoy" NUNCA es la primera', () => {
    const casos: Partial<EstadoSeccionesDeposito>[] = [
      {}, { retiros: 8 }, { retiros: 8, retirosListos: 3 }, { vacios: 5 },
      { vacios: 5, vaciosPorVencer: 2 }, { vacios: 5, vaciosPorVencer: 2, retirosListos: 1 },
      { lcl: 9, avisos: 4 },
    ]
    for (const c of casos) {
      const orden = ordenSeccionesDeposito(estado(c))
      expect(orden[0]).not.toBe('hoy')
      expect(orden.indexOf('hoy')).toBe(2)   // justo debajo de retiros y vacíos
    }
  })

  it('con una sola operativa hoy vuelve a encabezar: la regla mira el contador, no la urgencia', () => {
    expect(ordenSeccionesDeposito(estado({ operativasHoy: 1, retiros: 8, retirosListos: 8 }))[0]).toBe('hoy')
  })
})

describe('chips de la barra', () => {
  it('las que dependen de un contador aparecen con datos; Hoy, Plan y Agenda están siempre', () => {
    const chips = chipsSeccionesDeposito(estado({ operativasHoy: 2, retiros: 3 }))
    expect(chips.map(c => c.id)).toEqual(['hoy', 'retiros', 'plan', 'agenda'])
  })

  it('sin LCL no hay chip de LCL', () => {
    // ACTUALIZADO 04/09: la lista esperada arranca con 'retiros' y no con 'hoy'
    // porque el estado no tiene operativas hoy — los chips van en el orden de
    // las cards, así que heredan la bajada de "Hoy". El chip de LCL sigue sin
    // aparecer, que es lo que este test mira.
    const chips = chipsSeccionesDeposito(estado({ retiros: 1, vacios: 1, lcl: 0, avisos: 1 }))
    expect(chips.map(c => c.id)).not.toContain('lcl')
    expect(chips.map(c => c.id)).toEqual(['retiros', 'vacios', 'hoy', 'plan', 'avisos', 'agenda'])
  })

  it('el plan de 14 días SÍ va a la barra: se ve en la página, se navega', () => {
    // Cambió el 04/09: sin chip, Brian lo leyó como un olvido, no como una
    // decisión de no alargar la barra.
    const chips = chipsSeccionesDeposito(estado({ retiros: 5, vacios: 5, lcl: 5, avisos: 5 }))
    expect(chips.map(c => c.id)).toContain('plan')
  })

  it('los chips van en el MISMO orden que las cards (si no, el resaltado salta para atrás)', () => {
    const e = estado({ retiros: 8, retirosListos: 2, vacios: 4, vaciosPorVencer: 3, avisos: 1 })
    const orden = ordenSeccionesDeposito(e)
    const ids = chipsSeccionesDeposito(e).map(c => c.id)
    expect(ids).toEqual(orden.filter(id => ids.includes(id)))
    expect(ids[0]).toBe('vacios')
  })

  it('todos los chips tienen texto y salen de la tabla única', () => {
    const chips = chipsSeccionesDeposito(estado({ retiros: 1, vacios: 1, lcl: 1, avisos: 1 }))
    for (const c of chips) {
      expect(c.chip.trim().length).toBeGreaterThan(0)
      expect(SECCIONES_DEPOSITO.find(s => s.id === c.id)?.chip).toBe(c.chip)
    }
  })

  it('con un solo destino no se dibuja la barra', () => {
    // Con el portal vacío ya hay tres destinos (Hoy, Plan, Agenda), así que la
    // barra se dibuja igual; la guarda sigue viva para una lista de un solo id.
    expect(hayBarraSecciones([{ id: 'hoy', chip: 'Hoy' }])).toBe(false)
    expect(hayBarraSecciones(chipsSeccionesDeposito(SIN_NADA))).toBe(true)
    expect(hayBarraSecciones(chipsSeccionesDeposito(estado({ retiros: 1 })))).toBe(true)
  })

  it('Hoy, Plan y Agenda están siempre; las demás dependen de su contador', () => {
    expect(seccionConContenido(SIN_NADA, 'hoy')).toBe(true)
    expect(seccionConContenido(SIN_NADA, 'plan')).toBe(true)
    expect(seccionConContenido(SIN_NADA, 'agenda')).toBe(true)
    expect(seccionConContenido(SIN_NADA, 'lcl')).toBe(false)
  })
})

describe('seccionActiva — el chip que se resalta al scrollear', () => {
  const pos = (tops: Record<string, number>) =>
    Object.entries(tops).map(([id, top]) => ({ id: id as SeccionDepositoId, top }))

  it('arriba de todo se resalta la primera', () => {
    expect(seccionActiva(pos({ hoy: 40, retiros: 400, vacios: 900 }))).toBe('hoy')
  })

  it('se resalta la última sección que ya pasó por debajo del encabezado', () => {
    expect(seccionActiva(pos({ hoy: -300, retiros: -20, vacios: 500 }))).toBe('retiros')
  })

  it('al final de la lista se resalta la última', () => {
    expect(seccionActiva(pos({ hoy: -900, retiros: -600, vacios: -100 }))).toBe('vacios')
  })

  it('la tolerancia evita el parpadeo cuando el scroll suave queda a un pelo', () => {
    expect(seccionActiva(pos({ hoy: -300, retiros: 5 }))).toBe('retiros')
    expect(seccionActiva(pos({ hoy: -300, retiros: 20 }))).toBe('hoy')
  })

  it('sin secciones no hay nada resaltado', () => {
    expect(seccionActiva([])).toBeNull()
  })
})

describe('anclas e ids', () => {
  it('cada sección tiene un ancla propia y estable', () => {
    const anclas = ORDEN_BASE_DEPOSITO.map(anclaSeccion)
    expect(new Set(anclas).size).toBe(anclas.length)
    expect(anclaSeccion('avisos')).toBe('sec-avisos')
  })

  it('los ids del plegado son los de las secciones, sin repetidos', () => {
    expect(new Set(IDS_SECCIONES_DEPOSITO).size).toBe(IDS_SECCIONES_DEPOSITO.length)
    expect(IDS_SECCIONES_DEPOSITO).toContain('avisos')
  })
})

describe('claveCardsDeposito', () => {
  it('es propia del portal del depósito (no la del admin) y va por usuario', () => {
    const k = claveCardsDeposito('Bruno Franco')
    expect(k).not.toContain('hoyFcl')
    expect(k).toContain('deposito')
    expect(k).not.toBe(claveCardsDeposito('Ana Papke'))
  })

  it('el mismo usuario escrito distinto es el mismo cajón', () => {
    expect(claveCardsDeposito(' Bruno Franco ')).toBe(claveCardsDeposito('bruno franco'))
  })

  it('sin nombre no explota', () => {
    expect(claveCardsDeposito('')).toBe('depositoCardsCerradas:sin-usuario')
  })
})

// ── El orden no se mueve abajo del dedo ─────────────────────────────────────
describe('puedeAdoptarOrden — el orden no cambia mientras el usuario apunta', () => {
  const A: SeccionDepositoId[] = ['hoy', 'retiros', 'vacios', 'lcl', 'plan', 'avisos']
  const B: SeccionDepositoId[] = ['vacios', 'retiros', 'hoy', 'lcl', 'plan', 'avisos']

  it('el primer orden se adopta siempre, esté donde esté la página', () => {
    expect(puedeAdoptarOrden(null, A, 0)).toBe(true)
    expect(puedeAdoptarOrden(null, A, 5000)).toBe(true)
  })

  it('arriba de todo, un orden distinto entra', () => {
    expect(puedeAdoptarOrden(A, B, 0)).toBe(true)
    expect(puedeAdoptarOrden(A, B, 24)).toBe(true)
  })

  it('SCROLLEADO no entra: es el caso que rompe (tocó "Devolví" y se reacomoda)', () => {
    expect(puedeAdoptarOrden(A, B, 25)).toBe(false)
    expect(puedeAdoptarOrden(A, B, 900)).toBe(false)
  })

  it('si el orden es el mismo no se adopta nada, ni arriba', () => {
    expect(puedeAdoptarOrden(A, [...A], 0)).toBe(false)
  })

  it('los dos ordenes que la regla puede producir son permutaciones del mismo set', () => {
    expect([...A].sort()).toEqual([...B].sort())
  })
})

// ── Toda sección que se ve tiene su acceso directo ──────────────────────────
// Brian preguntó "acá faltan plan de carga, agenda, vacíos por devolver, ¿no?"
// mirando la barra. Una card visible sin chip se lee como un olvido.
describe('la barra no deja secciones huérfanas', () => {
  it('todas las secciones definidas tienen chip', () => {
    const sinChip = SECCIONES_DEPOSITO.filter(s => !s.chip).map(s => s.id)
    expect(sinChip).toEqual([])
  })

  it('plan y agenda están siempre, no dependen de un contador', () => {
    expect(seccionConContenido(SIN_NADA, 'plan')).toBe(true)
    expect(seccionConContenido(SIN_NADA, 'agenda')).toBe(true)
  })

  it('con el portal en cero igual se puede navegar a Hoy, Plan y Agenda', () => {
    const ids = chipsSeccionesDeposito(SIN_NADA).map(c => c.id)
    expect(ids).toEqual(['hoy', 'plan', 'agenda'])
  })

  it('con datos aparecen todas, en el orden en que se ven las cards', () => {
    const lleno = estado({ operativasHoy: 2, retiros: 8, vacios: 9, lcl: 1, avisos: 3 })
    expect(chipsSeccionesDeposito(lleno).map(c => c.id))
      .toEqual(['hoy', 'retiros', 'vacios', 'lcl', 'plan', 'avisos', 'agenda'])
  })

  it('la agenda queda última también cuando el orden se da vuelta', () => {
    const urgente = estado({ operativasHoy: 0, vacios: 4, vaciosPorVencer: 2, retiros: 3, retirosListos: 1 })
    const ids = chipsSeccionesDeposito(urgente).map(c => c.id)
    expect(ids[0]).toBe('vacios')
    expect(ids[ids.length - 1]).toBe('agenda')
  })
})
