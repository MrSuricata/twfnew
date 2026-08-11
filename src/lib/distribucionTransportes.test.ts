import { describe, it, expect } from 'vitest'
import {
  esRdm,
  ventanaDesde,
  calcularDistribucion,
  recomendarTransporte,
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

  it('la recomendación es una sugerencia: siempre devuelve alternativas', () => {
    const r = recomendarTransporte(ship({ CLIENTE: 'PERETTI' }), [], CUOTAS, HOY)
    expect(r.opciones.length).toBeGreaterThan(1)
  })

  it('si no hay cuotas activas no recomienda nada', () => {
    const r = recomendarTransporte(ship(), [], CUOTAS.map(c => ({ ...c, activo: false })), HOY)
    expect(r.transporte).toBeNull()
  })
})
