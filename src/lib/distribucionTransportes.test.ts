import { describe, it, expect } from 'vitest'
import {
  esRdm,
  ventanaDesde,
  rangoVentana,
  calcularDistribucion,
  recomendarTransporte,
  sugerirReparto,
  VAIROLATTI_BLOQUEADOS,
  type CuotaTransporte,
} from './distribucionTransportes'
import type { ParsedShipment, OperativasRecord } from './shipmentTypes'

const CUOTAS: CuotaTransporte[] = [
  { transporte: 'TRANSCAL', porcentaje: 55, activo: true, orden: 1 },
  { transporte: 'RIGATOSSO', porcentaje: 20, activo: true, orden: 2 },
  { transporte: 'VAIROLATTI', porcentaje: 15, activo: true, orden: 3 },
  { transporte: 'ENZO', porcentaje: 10, activo: true, orden: 4 },
]

const HOY = new Date(2026, 7, 11) // 11/08/2026

function op(o: Partial<OperativasRecord> = {}): OperativasRecord {
  return {
    REF: 'A1', TLX: '', DEPOSITO: '', ETA_OP: '', SALIDA: '2026-08-01', ETA_FISC: '',
    LIBRE: '', OPERATIVA: '', CNTR_OP: 'ABCD1234567', PKGS: 0, KG: 0, M3: 0,
    DESCRIPCION: '', FISCAL: '', DESCARGA: '', DEV: '', CLIENTE_OP: '', TIPO: '',
    WOOD: '', TRANSPORTE: 'TRANSCAL', HORARIO: '', ...o,
  }
}

function ship(s: Partial<ParsedShipment> = {}): ParsedShipment {
  return {
    REF: 'A1', CLIENTE: 'CLIENTE X', ETD: '', ETA: '2026-07-28', FT: 0, LIBRE_HASTA: '',
    CNTR: '', N: 1, MBL: '', LINEA: '', BUQUE: '', TERMINAL: '', C_TERMINAL: 0, C_DEV: 0,
    LOCALES: 0, FLETE: 0, FORMA_DE_PAGO: 'programado', VTO: '', CR: false, BL: false,
    AD: false, AT: false, POL: '', POD: 'MONTEVIDEO', PAIS: 'UY', SEGUIMIENTO: '',
    TIPO: '', containers: [], calculatedN: 1, calculatedLibreHasta: '',
    operativas: [op()], ...s,
  }
}

describe('esRdm', () => {
  it('detecta el prefijo RDM en el cliente', () => {
    expect(esRdm(ship({ CLIENTE: 'RDM - ABEA S.A.' }))).toBe(true)
    expect(esRdm(ship({ CLIENTE: 'rdm - helit' }))).toBe(true)
  })

  it('un cliente normal no es RDM', () => {
    expect(esRdm(ship({ CLIENTE: 'BICI PERETTI S.A.' }))).toBe(false)
  })

  it('no confunde una palabra que contiene las letras', () => {
    expect(esRdm(ship({ CLIENTE: 'GUARDMEX SA' }))).toBe(false)
  })
})

describe('ventanaDesde', () => {
  it('90d arranca 90 días antes de hoy', () => {
    expect(ventanaDesde('90d', HOY)).toEqual(new Date(2026, 4, 13))
  })

  it('mes arranca el día 1 del mes en curso', () => {
    expect(ventanaDesde('mes', HOY)).toEqual(new Date(2026, 7, 1))
  })

  it('semana arranca el lunes (11/08/2026 es martes → lunes 10)', () => {
    expect(ventanaDesde('semana', HOY)).toEqual(new Date(2026, 7, 10))
  })

  it('un domingo cuenta como fin de esa semana, no como inicio', () => {
    // 16/08/2026 es domingo → su lunes es el 10
    expect(ventanaDesde('semana', new Date(2026, 7, 16))).toEqual(new Date(2026, 7, 10))
  })
})

describe('calcularDistribucion', () => {
  it('cuenta CONTENEDORES, no referencias', () => {
    const s = ship({
      operativas: [
        op({ CNTR_OP: 'AAAA1111111', TRANSPORTE: 'TRANSCAL' }),
        op({ CNTR_OP: 'BBBB2222222', TRANSPORTE: 'TRANSCAL' }),
      ],
    })
    const d = calcularDistribucion([s], CUOTAS, '90d', HOY)
    expect(d.total).toBe(2)
    expect(d.filas.find(f => f.transporte === 'TRANSCAL')!.contenedores).toBe(2)
  })

  it('los contenedores de una misma ref pueden ir a transportes distintos', () => {
    const s = ship({
      operativas: [
        op({ CNTR_OP: 'AAAA1111111', TRANSPORTE: 'TRANSCAL' }),
        op({ CNTR_OP: 'BBBB2222222', TRANSPORTE: 'ENZO' }),
      ],
    })
    const d = calcularDistribucion([s], CUOTAS, '90d', HOY)
    expect(d.filas.find(f => f.transporte === 'TRANSCAL')!.contenedores).toBe(1)
    expect(d.filas.find(f => f.transporte === 'ENZO')!.contenedores).toBe(1)
  })

  it('excluye las cargas que no van por Uruguay', () => {
    const d = calcularDistribucion([ship({ PAIS: 'AR' }), ship({ PAIS: 'CL' })], CUOTAS, '90d', HOY)
    expect(d.total).toBe(0)
  })

  it('saca RDM del universo y lo devuelve aparte', () => {
    const d = calcularDistribucion([
      ship({ REF: 'A1', CLIENTE: 'PERETTI' }),
      ship({ REF: 'A2', CLIENTE: 'RDM - ABEA', operativas: [op({ TRANSPORTE: 'OLAVERRY' })] }),
    ], CUOTAS, '90d', HOY)
    expect(d.total).toBe(1)
    expect(d.rdm).toEqual([{ transporte: 'OLAVERRY', contenedores: 1 }])
  })

  it('excluye las archivadas', () => {
    const s = ship()
    ;(s as ParsedShipment & { archived?: boolean }).archived = true
    expect(calcularDistribucion([s], CUOTAS, '90d', HOY).total).toBe(0)
  })

  it('solo cuenta contenedores con SALIDA dentro de la ventana', () => {
    const d = calcularDistribucion([
      ship({ REF: 'A1', operativas: [op({ SALIDA: '2026-08-05' })] }),  // dentro
      ship({ REF: 'A2', operativas: [op({ SALIDA: '2026-01-10' })] }),  // fuera
    ], CUOTAS, '90d', HOY)
    expect(d.total).toBe(1)
  })

  it('ignora los contenedores sin salida cargada', () => {
    const d = calcularDistribucion([ship({ operativas: [op({ SALIDA: '' })] })], CUOTAS, '90d', HOY)
    expect(d.total).toBe(0)
  })

  it('no cuenta salidas futuras: el reparto mide lo ya despachado', () => {
    const d = calcularDistribucion([ship({ operativas: [op({ SALIDA: '2026-09-30' })] })], CUOTAS, '90d', HOY)
    expect(d.total).toBe(0)
  })

  it('calcula ideal y diferencia contra el objetivo', () => {
    // 10 contenedores, todos Transcal. Objetivo Transcal 55% → ideal 6, sobran 4.
    const ships = Array.from({ length: 10 }, (_, i) =>
      ship({ REF: `A${i}`, operativas: [op({ CNTR_OP: `C${i}`, TRANSPORTE: 'TRANSCAL' })] }))
    const d = calcularDistribucion(ships, CUOTAS, '90d', HOY)
    const t = d.filas.find(f => f.transporte === 'TRANSCAL')!
    expect(t.ideal).toBe(6)          // round(55% de 10) = 6 (redondeo de 5.5 hacia arriba)
    expect(t.diferencia).toBe(-4)    // negativo = sobran
    const r = d.filas.find(f => f.transporte === 'RIGATOSSO')!
    expect(r.contenedores).toBe(0)
    expect(r.diferencia).toBe(2)     // faltan 2 para su 20%
  })

  it('muestra los transportes en cuota aunque no tengan ni una carga', () => {
    const d = calcularDistribucion([ship()], CUOTAS, '90d', HOY)
    for (const c of CUOTAS) {
      expect(d.filas.some(f => f.transporte === c.transporte)).toBe(true)
    }
  })

  it('los transportes fuera de cuota aparecen sin objetivo', () => {
    const d = calcularDistribucion(
      [ship({ operativas: [op({ TRANSPORTE: 'BERRO' })] })], CUOTAS, '90d', HOY)
    const b = d.filas.find(f => f.transporte === 'BERRO')!
    expect(b.enCuota).toBe(false)
    expect(b.objetivo).toBeNull()
    expect(b.diferencia).toBeNull()
  })

  it('normaliza mayúsculas y espacios del nombre del transporte', () => {
    const d = calcularDistribucion([
      ship({ REF: 'A1', operativas: [op({ TRANSPORTE: ' transcal ' })] }),
      ship({ REF: 'A2', operativas: [op({ TRANSPORTE: 'TRANSCAL' })] }),
    ], CUOTAS, '90d', HOY)
    expect(d.filas.find(f => f.transporte === 'TRANSCAL')!.contenedores).toBe(2)
  })

  it('agrupa los contenedores sin transporte bajo SIN ASIGNAR', () => {
    const d = calcularDistribucion([ship({ operativas: [op({ TRANSPORTE: '' })] })], CUOTAS, '90d', HOY)
    expect(d.filas.find(f => f.transporte === 'SIN ASIGNAR')!.contenedores).toBe(1)
  })

  it('sin datos no divide por cero', () => {
    const d = calcularDistribucion([], CUOTAS, '90d', HOY)
    expect(d.total).toBe(0)
    expect(d.filas.every(f => f.porcentaje === 0)).toBe(true)
  })

  it('ignora las cuotas desactivadas', () => {
    const cuotas = CUOTAS.map(c => c.transporte === 'ENZO' ? { ...c, activo: false } : c)
    const d = calcularDistribucion([ship()], cuotas, '90d', HOY)
    expect(d.filas.find(f => f.transporte === 'ENZO')?.enCuota).not.toBe(true)
  })
})

describe('recomendarTransporte', () => {
  const conCargas = (reparto: Record<string, number>): ParsedShipment[] => {
    const out: ParsedShipment[] = []
    let i = 0
    for (const [t, n] of Object.entries(reparto)) {
      for (let k = 0; k < n; k++) {
        out.push(ship({ REF: `A${i}`, operativas: [op({ CNTR_OP: `C${i}`, TRANSPORTE: t })] }))
        i++
      }
    }
    return out
  }

  it('recomienda el transporte con mayor deuda contra su objetivo', () => {
    const hist = conCargas({ TRANSCAL: 10, VAIROLATTI: 2, ENZO: 1, RIGATOSSO: 0 })
    const r = recomendarTransporte(ship({ CLIENTE: 'PERETTI' }), hist, CUOTAS, HOY)
    expect(r.transporte).toBe('RIGATOSSO')
    expect(r.motivo).toContain('RIGATOSSO')
  })

  it('a RDM le sugiere Olaverry o Siroco, fuera de la cuota', () => {
    const r = recomendarTransporte(ship({ CLIENTE: 'RDM - ABEA S.A.' }), [], CUOTAS, HOY)
    expect(r.opciones).toEqual(['OLAVERRY', 'SIROCO'])
    expect(r.motivo).toMatch(/RDM/)
  })

  it('nunca recomienda Vairolatti a VMG ni a Chiapero (furgones)', () => {
    // Vairolatti sería el de mayor deuda, pero está bloqueado para estos clientes.
    const hist = conCargas({ TRANSCAL: 10, RIGATOSSO: 8, ENZO: 4, VAIROLATTI: 0 })
    for (const cliente of ['VMG S.A.', 'CHIAPERO Y ASOC. S.R.L.']) {
      const r = recomendarTransporte(ship({ CLIENTE: cliente }), hist, CUOTAS, HOY)
      expect(r.transporte).not.toBe('VAIROLATTI')
    }
  })

  it('la lista de bloqueados de Vairolatti está declarada', () => {
    expect(VAIROLATTI_BLOQUEADOS).toContain('VMG')
    expect(VAIROLATTI_BLOQUEADOS).toContain('CHIAPERO')
  })

  it('sin historial reparte al de mayor cuota', () => {
    const r = recomendarTransporte(ship({ CLIENTE: 'PERETTI' }), [], CUOTAS, HOY)
    expect(r.transporte).toBe('TRANSCAL')
  })

  it('la deuda es del MES en curso: lo de julio no cuenta (regla Brian 13/08)', () => {
    // Todo el desbalance es de julio → agosto arranca de cero y se reparte
    // por cuota, como si no hubiera historial. Antes (ventana 90d) Rigatosso
    // arrastraba la deuda vieja y acaparaba las sugerencias del mes nuevo.
    const julio = conCargas({ TRANSCAL: 30, VAIROLATTI: 8, ENZO: 5, RIGATOSSO: 0 })
      .map(s => ({ ...s, operativas: s.operativas!.map(o => ({ ...o, SALIDA: '2026-07-15' })) }))
    const r = recomendarTransporte(ship({ CLIENTE: 'PERETTI' }), julio, CUOTAS, HOY)
    expect(r.transporte).toBe('TRANSCAL')
    expect(r.motivo).toContain('agosto')
  })

  it('las salidas AGENDADAS del mes cuentan como cupo ya asignado', () => {
    // Transcal ya tiene 10 coordinadas para fin de mes (después de HOY=11/08):
    // son cupo de agosto aunque no hayan despachado — la sugerencia pasa al
    // siguiente en deuda en vez de insistir con Transcal.
    const agendadas = conCargas({ TRANSCAL: 10 })
      .map(s => ({ ...s, operativas: s.operativas!.map(o => ({ ...o, SALIDA: '2026-08-25' })) }))
    const r = recomendarTransporte(ship({ CLIENTE: 'PERETTI' }), agendadas, CUOTAS, HOY)
    expect(r.transporte).toBe('RIGATOSSO')
  })

  it('la recomendación es una sugerencia: siempre devuelve alternativas', () => {
    const r = recomendarTransporte(ship({ CLIENTE: 'PERETTI' }), [], CUOTAS, HOY)
    expect(r.opciones.length).toBeGreaterThan(1)
  })

  it('si no hay cuotas activas no recomienda nada', () => {
    const r = recomendarTransporte(ship(), [], CUOTAS.map(c => ({ ...c, activo: false })), HOY)
    expect(r.transporte).toBeNull()
  })
})

describe('rangoVentana — despachado mira atrás, previsión mira adelante', () => {
  it('despachado termina hoy: nunca incluye lo que todavía no pasó', () => {
    const r = rangoVentana('90d', HOY, 'despachado')
    expect(r.hasta).toEqual(new Date(2026, 7, 11))
    expect(r.desde).toEqual(new Date(2026, 4, 13))
  })

  it('previsión de semana es la semana QUE VIENE, completa de lunes a domingo', () => {
    // HOY es martes 11/08 → la semana que viene va del 17 al 23.
    const r = rangoVentana('semana', HOY, 'prevision')
    expect(r.desde).toEqual(new Date(2026, 7, 17))
    expect(r.hasta).toEqual(new Date(2026, 7, 23))
  })

  it('previsión de mes son los próximos 30 días desde hoy', () => {
    const r = rangoVentana('mes', HOY, 'prevision')
    expect(r.desde).toEqual(new Date(2026, 7, 11))
    expect(r.hasta).toEqual(new Date(2026, 8, 10))
  })

  it('previsión de 90 días arranca hoy', () => {
    const r = rangoVentana('90d', HOY, 'prevision')
    expect(r.desde).toEqual(new Date(2026, 7, 11))
    expect(r.hasta).toEqual(new Date(2026, 10, 9))
  })

  it('el modo por defecto es despachado', () => {
    expect(rangoVentana('90d', HOY)).toEqual(rangoVentana('90d', HOY, 'despachado'))
  })
})

describe('calcularDistribucion con rango explícito', () => {
  it('acepta un rango de fechas propio en lugar de una ventana', () => {
    const d = calcularDistribucion([
      ship({ REF: 'A1', operativas: [op({ SALIDA: '2026-08-18' })] }),  // dentro
      ship({ REF: 'A2', operativas: [op({ SALIDA: '2026-08-25' })] }),  // fuera
    ], CUOTAS, { desde: new Date(2026, 7, 17), hasta: new Date(2026, 7, 23) }, HOY)
    expect(d.total).toBe(1)
  })

  it('en previsión sí cuenta las salidas futuras', () => {
    const d = calcularDistribucion(
      [ship({ operativas: [op({ SALIDA: '2026-08-20', TRANSPORTE: 'ENZO' })] })],
      CUOTAS, 'semana', HOY, 'prevision')
    expect(d.filas.find(f => f.transporte === 'ENZO')!.contenedores).toBe(1)
  })

  it('los bordes del rango entran (desde y hasta inclusive)', () => {
    const rango = { desde: new Date(2026, 7, 17), hasta: new Date(2026, 7, 23) }
    const d = calcularDistribucion([
      ship({ REF: 'A1', operativas: [op({ SALIDA: '2026-08-17' })] }),
      ship({ REF: 'A2', operativas: [op({ SALIDA: '2026-08-23' })] }),
    ], CUOTAS, rango, HOY)
    expect(d.total).toBe(2)
  })

  it('los contenedores agendados sin transporte quedan como SIN ASIGNAR', () => {
    const d = calcularDistribucion(
      [ship({ operativas: [op({ SALIDA: '2026-08-19', TRANSPORTE: '' })] })],
      CUOTAS, 'semana', HOY, 'prevision')
    expect(d.sinAsignar).toBe(1)
  })

  it('sinAsignar es 0 cuando todo tiene transporte', () => {
    const d = calcularDistribucion(
      [ship({ operativas: [op({ SALIDA: '2026-08-19', TRANSPORTE: 'TRANSCAL' })] })],
      CUOTAS, 'semana', HOY, 'prevision')
    expect(d.sinAsignar).toBe(0)
  })
})

describe('sugerirReparto', () => {
  const base = (reparto: Record<string, number>) => {
    const ships: ParsedShipment[] = []
    let i = 0
    for (const [t, n] of Object.entries(reparto)) {
      for (let k = 0; k < n; k++) {
        ships.push(ship({ REF: `A${i}`, operativas: [op({ CNTR_OP: `C${i}`, TRANSPORTE: t })] }))
        i++
      }
    }
    return calcularDistribucion(ships, CUOTAS, '90d', HOY)
  }

  it('reparte las pendientes al que más atrás viene', () => {
    const r = sugerirReparto(4, base({ TRANSCAL: 10, VAIROLATTI: 2, ENZO: 1, RIGATOSSO: 0 }), CUOTAS)
    const rig = r.find(x => x.transporte === 'RIGATOSSO')
    expect(rig!.cantidad).toBeGreaterThan(0)
    expect(r.reduce((a, x) => a + x.cantidad, 0)).toBe(4)
  })

  it('el total repartido siempre coincide con las pendientes', () => {
    for (const n of [1, 3, 7, 20]) {
      const r = sugerirReparto(n, base({ TRANSCAL: 30, RIGATOSSO: 1, VAIROLATTI: 5, ENZO: 2 }), CUOTAS)
      expect(r.reduce((a, x) => a + x.cantidad, 0)).toBe(n)
    }
  })

  it('sin pendientes no sugiere nada', () => {
    expect(sugerirReparto(0, base({ TRANSCAL: 10 }), CUOTAS)).toEqual([])
  })

  it('recalcula después de cada asignación: no vuelca todo en uno solo', () => {
    // Partiendo de cero, 20 contenedores deberían repartirse entre los cuatro.
    const r = sugerirReparto(20, base({}), CUOTAS)
    expect(r.filter(x => x.cantidad > 0).length).toBe(4)
    expect(r.find(x => x.transporte === 'TRANSCAL')!.cantidad).toBeGreaterThan(
      r.find(x => x.transporte === 'ENZO')!.cantidad)
  })

  it('sin cuotas activas no sugiere nada', () => {
    const r = sugerirReparto(5, base({ TRANSCAL: 3 }), CUOTAS.map(c => ({ ...c, activo: false })))
    expect(r).toEqual([])
  })
})

describe('previsión: los pendientes de coordinar también hay que repartirlos', () => {
  const sinSalida = (o: Partial<OperativasRecord> = {}) => op({ SALIDA: '', ...o })

  it('cuenta los contenedores sin salida cuya carga llega dentro del período', () => {
    const d = calcularDistribucion(
      [ship({ ETA: '2026-08-19', operativas: [sinSalida({ TRANSPORTE: '' })] })],
      CUOTAS, 'semana', HOY, 'prevision')
    expect(d.total).toBe(1)
    expect(d.pendientes).toBe(1)
    expect(d.agendados).toBe(0)
    expect(d.sinAsignar).toBe(1)
  })

  it('las ya arribadas sin salida siguen pendientes: están esperando', () => {
    const d = calcularDistribucion(
      [ship({ ETA: '2026-07-20', operativas: [sinSalida()] })],
      CUOTAS, 'semana', HOY, 'prevision')
    expect(d.pendientes).toBe(1)
  })

  it('no cuenta lo que llega DESPUÉS del período', () => {
    const d = calcularDistribucion(
      [ship({ ETA: '2026-10-01', operativas: [sinSalida()] })],
      CUOTAS, 'semana', HOY, 'prevision')
    expect(d.total).toBe(0)
  })

  it('un pendiente que ya tiene transporte cuenta para ese transporte', () => {
    const d = calcularDistribucion(
      [ship({ ETA: '2026-08-19', operativas: [sinSalida({ TRANSPORTE: 'TRANSCAL' })] })],
      CUOTAS, 'semana', HOY, 'prevision')
    expect(d.filas.find(f => f.transporte === 'TRANSCAL')!.contenedores).toBe(1)
    expect(d.sinAsignar).toBe(0)
    expect(d.pendientes).toBe(1)
  })

  it('agendados y pendientes se suman en el total', () => {
    const d = calcularDistribucion([
      ship({ REF: 'A1', ETA: '2026-08-15', operativas: [op({ SALIDA: '2026-08-19' })] }),
      ship({ REF: 'A2', ETA: '2026-08-19', operativas: [sinSalida({ TRANSPORTE: '' })] }),
    ], CUOTAS, 'semana', HOY, 'prevision')
    expect(d.agendados).toBe(1)
    expect(d.pendientes).toBe(1)
    expect(d.total).toBe(2)
  })

  it("'CONFIRMAR' y '#N/A' en SALIDA son pendientes, no fechas", () => {
    for (const s of ['CONFIRMAR', '#N/A']) {
      const d = calcularDistribucion(
        [ship({ ETA: '2026-08-19', operativas: [op({ SALIDA: s })] })],
        CUOTAS, 'semana', HOY, 'prevision')
      expect(d.pendientes).toBe(1)
    }
  })

  it('un contenedor sin número igual cuenta: va a necesitar camión', () => {
    const d = calcularDistribucion(
      [ship({ ETA: '2026-08-19', operativas: [sinSalida({ CNTR_OP: '', TRANSPORTE: '' })] })],
      CUOTAS, 'semana', HOY, 'prevision')
    expect(d.pendientes).toBe(1)
  })

  it('en modo despachado los pendientes NO se cuentan', () => {
    const d = calcularDistribucion(
      [ship({ ETA: '2026-08-01', operativas: [sinSalida()] })],
      CUOTAS, '90d', HOY, 'despachado')
    expect(d.total).toBe(0)
    expect(d.pendientes).toBe(0)
  })

  it('la ETA de la carga manda; la del contenedor (ETA_OP, copia congelada) solo si la carga no tiene', () => {
    // Carga en diciembre con ETA_OP vieja: NO es trabajo de esta semana (caso A8163).
    const lejos = calcularDistribucion(
      [ship({ ETA: '2026-12-01', operativas: [sinSalida({ ETA_OP: '2026-08-19' })] })],
      CUOTAS, 'semana', HOY, 'prevision')
    expect(lejos.pendientes).toBe(0)
    // Sin ETA en la carga, vale la del contenedor.
    const soloOp = calcularDistribucion(
      [ship({ ETA: '', operativas: [sinSalida({ ETA_OP: '2026-08-19' })] })],
      CUOTAS, 'semana', HOY, 'prevision')
    expect(soloOp.pendientes).toBe(1)
  })

  it('RDM pendiente va al bloque de RDM, no al reparto', () => {
    const d = calcularDistribucion(
      [ship({ CLIENTE: 'RDM - ABEA', ETA: '2026-08-19', operativas: [sinSalida({ TRANSPORTE: 'OLAVERRY' })] })],
      CUOTAS, 'semana', HOY, 'prevision')
    expect(d.total).toBe(0)
    expect(d.rdm).toEqual([{ transporte: 'OLAVERRY', contenedores: 1 }])
  })
})
