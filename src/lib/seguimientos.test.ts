import { describe, it, expect } from 'vitest'
import {
  colaSeguimientos, grupoDestino, textoUpdate, nombreBuqueBase,
  SEGUIMIENTO_ETA_VENCIDA_DIAS, type CargaSeguimiento,
} from './seguimientos'

const HOY = new Date(2026, 7, 13) // jueves 13/08/2026

// Default: embarcada hace 12 días, llega en 19 — carga en viaje típica.
function carga(c: Partial<CargaSeguimiento> = {}): CargaSeguimiento {
  return { ref: 'A1', cliente: 'PERETTI', buque: 'MAERSK X', etd: '2026-08-01', eta: '2026-09-01', seguimiento: '', mode: 'fcl', pais: 'UY', ...c }
}

describe('colaSeguimientos — quién hay que actualizar hoy', () => {
  it('sin seguimiento nunca enviado → pendiente con dias=null', () => {
    const { pendientes, alDia } = colaSeguimientos([carga()], HOY)
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0].dias).toBeNull()
    expect(alDia).toBe(0)
  })

  it('último seguimiento hace 7+ días → pendiente; hace menos → al día', () => {
    const vencida = carga({ ref: 'A2', seguimiento: '2026-08-06' })   // justo 7
    const fresca = carga({ ref: 'A3', seguimiento: '2026-08-07' })    // 6 días
    const { pendientes, alDia } = colaSeguimientos([vencida, fresca], HOY)
    expect(pendientes.map(p => p.carga.ref)).toEqual(['A2'])
    expect(pendientes[0].dias).toBe(7)
    expect(alDia).toBe(1)
  })

  it('la carga que YA llegó a su puerto sale de la cola (ETA pasada + señal de llegada)', () => {
    // La llegada REAL la marca un hecho (salida/descarga/fiscal), no la fecha
    // sola — ver el describe "¿llegó?" para el caso sin señales.
    const llegada = carga({ eta: '2026-08-12', salida: '2026-08-13' })
    expect(colaSeguimientos([llegada], HOY).pendientes).toHaveLength(0)
    expect(colaSeguimientos([llegada], HOY).alDia).toBe(0)
  })

  it('ETA hoy sigue en viaje (el buque opera hoy, el update todavía vale)', () => {
    expect(colaSeguimientos([carga({ eta: '2026-08-13' })], HOY).pendientes).toHaveLength(1)
  })

  it('embarcada sin ETA cargada entra igual: completarla es el trabajo de la cola', () => {
    expect(colaSeguimientos([carga({ eta: '' })], HOY).pendientes).toHaveLength(1)
  })

  it('en origen sin fechas parseables NO entra: no hay buque que reportar', () => {
    const ships = [
      carga({ etd: '', eta: '' }),                 // sin nada
      carga({ etd: '9-ago-', eta: 'CONFIRMAR' }),  // fechas rotas legacy
      carga({ etd: '', eta: '2026-10-15' }),       // llega en 63 días y no embarcó
    ]
    expect(colaSeguimientos(ships, HOY).pendientes).toHaveLength(0)
  })

  it('sin embarcar pero llegando dentro de 21 días → entra igual', () => {
    expect(colaSeguimientos([carga({ etd: '', eta: '2026-09-03' })], HOY).pendientes).toHaveLength(1)
  })

  it('un ETD fósil (más de 120 días) es dato muerto, no un viaje en curso', () => {
    expect(colaSeguimientos([carga({ etd: '2025-06-01', eta: '' })], HOY).pendientes).toHaveLength(0)
  })

  it('ETD futuro (todavía no embarcó) no cuenta como embarcada', () => {
    expect(colaSeguimientos([carga({ etd: '2026-08-20', eta: '2026-10-15' })], HOY).pendientes).toHaveLength(0)
  })

  it('aéreo y terrestre no llevan seguimiento semanal; archivadas tampoco', () => {
    const ships = [
      carga({ mode: 'air' }),
      carga({ mode: 'land' }),
      carga({ archived: true }),
    ]
    expect(colaSeguimientos(ships, HOY).pendientes).toHaveLength(0)
  })

  it('LCL marítima sí entra', () => {
    expect(colaSeguimientos([carga({ mode: 'lcl' })], HOY).pendientes).toHaveLength(1)
  })

  it('acepta la fecha legacy D/M/YYYY de la planilla', () => {
    const { pendientes, alDia } = colaSeguimientos([carga({ seguimiento: '10/8/2026' })], HOY)
    expect(pendientes).toHaveLength(0) // hace 3 días → al día
    expect(alDia).toBe(1)
  })

  it('orden: nunca-enviadas primero, después más atraso, después ETA más próxima', () => {
    const ships = [
      carga({ ref: 'FRESCA-ATRASADA', seguimiento: '2026-08-01' }),          // 12 días
      carga({ ref: 'NUNCA-LEJOS', seguimiento: '', eta: '2026-10-01' }), // embarcada (etd default)
      carga({ ref: 'NUNCA-CERCA', seguimiento: '', eta: '2026-08-20' }),
      carga({ ref: 'VENCIDA-7', seguimiento: '2026-08-06' }),                // 7 días
    ]
    const { pendientes } = colaSeguimientos(ships, HOY)
    expect(pendientes.map(p => p.carga.ref)).toEqual([
      'NUNCA-CERCA', 'NUNCA-LEJOS', 'FRESCA-ATRASADA', 'VENCIDA-7',
    ])
  })
})

describe('colaSeguimientos — "¿llegó?" (ETA vencida sin señales de llegada, 26/08)', () => {
  // Caso SAN FRANCISCA: el buque omitió Montevideo, nadie corrigió la ETA y
  // la carga desaparecía de la cola justo cuando el cliente más necesitaba
  // el update (A8045: 9 días sin seguimiento y la cola no la pedía).
  const omitida = (c: Partial<CargaSeguimiento> = {}) =>
    carga({ ref: 'A8045', eta: '2026-08-11', seguimiento: '2026-08-04', ...c })

  it('ETA vencida sin salida/descarga/fiscal queda en la cola marcada', () => {
    const { pendientes } = colaSeguimientos([omitida()], HOY)
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0].etaVencidaDias).toBe(2)
    expect(pendientes[0].dias).toBe(9)
  })

  it('cualquier señal de llegada real la saca: salida, descarga o fiscal', () => {
    expect(colaSeguimientos([omitida({ salida: '2026-08-12' })], HOY).pendientes).toHaveLength(0)
    expect(colaSeguimientos([omitida({ descarga: '2026-08-11' })], HOY).pendientes).toHaveLength(0)
    expect(colaSeguimientos([omitida({ etaFiscal: '2026-08-15' })], HOY).pendientes).toHaveLength(0)
  })

  it('con seguimiento fresco espera su turno (no nagea: el equipo tiene días para cargar la salida)', () => {
    const { pendientes, alDia } = colaSeguimientos([omitida({ seguimiento: '2026-08-10' })], HOY)
    expect(pendientes).toHaveLength(0)
    expect(alDia).toBe(1)
  })

  it('pasado el tope de días es deuda vieja: sale sola de la cola', () => {
    const dia = (n: number) => `2026-08-${String(13 - n).padStart(2, '0')}`
    const enTope = colaSeguimientos([omitida({ eta: dia(SEGUIMIENTO_ETA_VENCIDA_DIAS) })], HOY)
    expect(enTope.pendientes).toHaveLength(1)
    const pasada = colaSeguimientos([omitida({ eta: dia(SEGUIMIENTO_ETA_VENCIDA_DIAS + 1) })], HOY)
    expect(pasada.pendientes).toHaveLength(0)
  })

  it('las "¿llegó?" van ARRIBA de todo — son estado roto, no un mail más', () => {
    const { pendientes } = colaSeguimientos([
      carga({ ref: 'NUNCA', seguimiento: '' }),
      omitida({ ref: 'OMITIDA' }),
    ], HOY)
    expect(pendientes.map(p => p.carga.ref)).toEqual(['OMITIDA', 'NUNCA'])
  })

  it('la carga en viaje normal no trae la marca', () => {
    const { pendientes } = colaSeguimientos([carga()], HOY)
    expect(pendientes[0].etaVencidaDias).toBeUndefined()
  })
})

describe('grupoDestino', () => {
  it('mapea país a grupo de tanda', () => {
    expect(grupoDestino('UY')).toBe('Montevideo')
    expect(grupoDestino('AR')).toBe('Buenos Aires')
    expect(grupoDestino('CL')).toBe('Chile')
    expect(grupoDestino('OTRO')).toBe('Otros destinos')
    expect(grupoDestino('')).toBe('Otros destinos')
  })
})

describe('textoUpdate — el formato de los mails de Nicolás', () => {
  it('ETA que se mantiene, a la tarde', () => {
    const t = textoUpdate({ buque: 'COSCO SHIPPING LILY 002E', puerto: 'Montevideo', etaISO: '2026-10-04', actualizada: false, hora: 15 })
    expect(t).toContain('Estimados, buenas tardes.')
    expect(t).toContain('sigue rumbo según lo previsto')
    expect(t).toContain('se mantiene para el día 04/10/2026')
    expect(t).toContain('Volveremos con novedades a la brevedad.')
  })

  it('ETA actualizada, a la mañana', () => {
    const t = textoUpdate({ buque: 'EVER FAITH 036W', puerto: 'Buenos Aires', etaISO: '2026-09-20', actualizada: true, hora: 9 })
    expect(t).toContain('Estimados, buenos días.')
    expect(t).toContain('se actualiza la ETA del buque EVER FAITH 036W al puerto de Buenos Aires para el día 20/09/2026')
  })
})

describe('nombreBuqueBase — para el link de tracking', () => {
  it('recorta el número de viaje', () => {
    expect(nombreBuqueBase('TIGER GAUCHO 0935S')).toBe('TIGER GAUCHO')
    expect(nombreBuqueBase('SAN FRANCISCA 628W')).toBe('SAN FRANCISCA')
    expect(nombreBuqueBase('COSCO SHIPPING LILY 002E')).toBe('COSCO SHIPPING LILY')
  })

  it('sin número de viaje queda igual; vacío no rompe', () => {
    expect(nombreBuqueBase('PALENA')).toBe('PALENA')
    expect(nombreBuqueBase('')).toBe('')
  })
})
