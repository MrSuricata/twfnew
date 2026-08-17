import { describe, it, expect } from 'vitest'
import { cambiosDeBuque, detectarTrasbordo, fechaDeAudit, aIso, mismoBuque, lineaDeTiempo, type AuditRow } from './trasbordo'
import { textoUpdate } from './seguimientos'

const audit = (ts: string, details: Record<string, unknown>, usuario = 'admin'): AuditRow =>
  ({ ts, usuario, ref: 'A7967', details })

describe('mismoBuque — tolera cómo se escribe el nombre', () => {
  it('el número de viaje y los espacios no hacen otro barco', () => {
    // Casos reales del audit: A7958 (se agregó el viaje 5 segundos después)
    expect(mismoBuque('SAO PAULO EXPRESS', 'SAO PAULO EXPRESS 2627W')).toBe(true)
    expect(mismoBuque('tiger  gaucho 0935S', 'TIGER GAUCHO')).toBe(true)
    expect(mismoBuque('MSC ADELE', ' msc adele ')).toBe(true)
  })

  it('barcos distintos siguen siendo distintos', () => {
    expect(mismoBuque('ONE PARANA', 'ONE AMAZON')).toBe(false)
    expect(mismoBuque('MSC ADELE', 'BREMERHAVEN EXPRESS')).toBe(false)
  })

  it('vacío nunca matchea (no se puede afirmar nada)', () => {
    expect(mismoBuque('', 'MSC ADELE')).toBe(false)
    expect(mismoBuque('MSC ADELE', null)).toBe(false)
  })
})

describe('aIso — la fecha del último update puede venir de la planilla', () => {
  it('acepta ISO y D/M/YYYY legacy (comparar los strings crudos se invertía)', () => {
    expect(aIso('2026-08-10')).toBe('2026-08-10')
    expect(aIso('10/8/2026')).toBe('2026-08-10')
    expect(aIso('9/06/2026')).toBe('2026-06-09')
    expect(aIso('')).toBe('')
    expect(aIso('CIF')).toBe('')
  })
})

describe('cambiosDeBuque — reconstruye la historia del buque desde el audit', () => {
  it('toma solo los patches que tocaron buque, del más viejo al más nuevo', () => {
    const rows = [ // audit_log llega del más nuevo al más viejo
      audit('2026-08-17 20:10:27+00', { buque: 'MSC ADELE' }),
      audit('2026-08-17 20:10:27+00', { eta: '2026-09-02' }),
      audit('2026-08-01 10:00:00+00', { buque: 'BREMERHAVEN EXPRESS' }),
      audit('2026-07-20 09:00:00+00', { salida: '2026-08-20', deposito: 'TCP' }),
    ]
    expect(cambiosDeBuque(rows)).toEqual([
      { buque: 'BREMERHAVEN EXPRESS', fecha: '2026-08-01', usuario: 'admin' },
      { buque: 'MSC ADELE', fecha: '2026-08-17', usuario: 'admin' },
    ])
  })

  it('colapsa las escrituras del MISMO barco (tipeo / número de viaje)', () => {
    // A7958 real: se guardó el nombre y 5 segundos después con el viaje.
    const rows = [
      audit('2026-08-17 20:17:34+00', { buque: 'SAO PAULO EXPRESS 2627W' }),
      audit('2026-08-17 20:17:29+00', { buque: 'SAO PAULO EXPRESS' }),
    ]
    expect(cambiosDeBuque(rows)).toEqual([
      { buque: 'SAO PAULO EXPRESS 2627W', fecha: '2026-08-17', usuario: 'admin' },
    ])
  })

  it('ignora buque vacío y filas sin details', () => {
    expect(cambiosDeBuque([audit('2026-08-17 10:00:00+00', { buque: '   ' })])).toEqual([])
    expect(cambiosDeBuque([{ ts: '2026-08-17 10:00:00+00', details: null }])).toEqual([])
    expect(cambiosDeBuque([])).toEqual([])
  })

  it('fechaDeAudit corta el timestamp a ISO y tolera basura', () => {
    expect(fechaDeAudit('2026-08-17 20:10:27.218605+00')).toBe('2026-08-17')
    expect(fechaDeAudit(null)).toBe('')
  })
})

describe('detectarTrasbordo — solo afirma con evidencia dura', () => {
  it('la marca manual manda: es quien miró el tracking de la línea', () => {
    expect(detectarTrasbordo({ buqueActual: 'MSC ADELE', marcadoManual: true })).toEqual({ hubo: true })
  })

  it('línea base: el buque comunicado en el último update vs el de hoy', () => {
    expect(detectarTrasbordo({ buqueActual: 'MSC ADELE', buqueUltimoEnviado: 'BREMERHAVEN EXPRESS' }))
      .toEqual({ hubo: true, anterior: 'BREMERHAVEN EXPRESS' })
    // mismo barco escrito distinto NO es trasbordo
    expect(detectarTrasbordo({ buqueActual: 'ONE AMAZON 2625W', buqueUltimoEnviado: 'ONE AMAZON' }))
      .toEqual({ hubo: false })
  })

  it('caso A7967: sin línea base NO afirma, sospecha (el audit no prueba el cambio)', () => {
    // Solo hay {buque: MSC ADELE} el 17/08, posterior al update del 10/08:
    // puede ser un trasbordo o la primera vez que se carga el buque.
    const cambios = cambiosDeBuque([audit('2026-08-17 20:10:27+00', { buque: 'MSC ADELE' })])
    expect(detectarTrasbordo({
      buqueActual: 'MSC ADELE', buqueUltimoEnviado: '', cambios, fechaUltimoEnviado: '2026-08-10',
    })).toEqual({ hubo: false, sospecha: true })
  })

  it('con un buque anterior registrado en el audit, sí lo afirma y lo nombra', () => {
    const cambios = cambiosDeBuque([
      audit('2026-08-17 20:10:27+00', { buque: 'MSC ADELE' }),
      audit('2026-08-01 10:00:00+00', { buque: 'BREMERHAVEN EXPRESS' }),
    ])
    expect(detectarTrasbordo({
      buqueActual: 'MSC ADELE', buqueUltimoEnviado: '', cambios, fechaUltimoEnviado: '2026-08-10',
    })).toEqual({ hubo: true, anterior: 'BREMERHAVEN EXPRESS' })
  })

  it('volver al buque original (cambio revertido) no es trasbordo', () => {
    const cambios = cambiosDeBuque([
      audit('2026-08-16 10:00:00+00', { buque: 'MSC ADELE' }),
      audit('2026-08-15 10:00:00+00', { buque: 'BREMERHAVEN EXPRESS' }),
      audit('2026-08-01 10:00:00+00', { buque: 'MSC ADELE' }),
    ])
    expect(detectarTrasbordo({
      buqueActual: 'MSC ADELE', buqueUltimoEnviado: '', cambios, fechaUltimoEnviado: '2026-08-10',
    })).toEqual({ hubo: false })
  })

  it('la fecha legacy de la planilla se compara bien (antes se invertía)', () => {
    const cambios = cambiosDeBuque([audit('2026-06-01 10:00:00+00', { buque: 'MSC ADELE' })])
    // El cambio es ANTERIOR al update ('11/06/2026') → ya se comunicó.
    expect(detectarTrasbordo({
      buqueActual: 'MSC ADELE', buqueUltimoEnviado: '', cambios, fechaUltimoEnviado: '11/06/2026',
    })).toEqual({ hubo: false })
  })

  it('el cambio del MISMO día del último update entra (no se pierde)', () => {
    const cambios = cambiosDeBuque([
      audit('2026-08-17 18:00:00+00', { buque: 'MSC ADELE' }),
      audit('2026-08-01 10:00:00+00', { buque: 'BREMERHAVEN EXPRESS' }),
    ])
    expect(detectarTrasbordo({
      buqueActual: 'MSC ADELE', buqueUltimoEnviado: '', cambios, fechaUltimoEnviado: '2026-08-17',
    })).toEqual({ hubo: true, anterior: 'BREMERHAVEN EXPRESS' })
  })

  it('desalineado (el último cambio no es el buque de hoy) → no arriesga', () => {
    const cambios = cambiosDeBuque([audit('2026-08-17 10:00:00+00', { buque: 'OTRO BUQUE' })])
    expect(detectarTrasbordo({
      buqueActual: 'MSC ADELE', buqueUltimoEnviado: '', cambios, fechaUltimoEnviado: '2026-08-10',
    })).toEqual({ hubo: false })
  })

  it('sin buque, sin fecha o sin cambios no hay nada que avisar', () => {
    expect(detectarTrasbordo({ buqueActual: '' })).toEqual({ hubo: false })
    expect(detectarTrasbordo({ buqueActual: 'MSC ADELE', cambios: [], fechaUltimoEnviado: '2026-08-10' }))
      .toEqual({ hubo: false })
    expect(detectarTrasbordo({ buqueActual: 'MSC ADELE', cambios: [{ buque: 'X', fecha: '2026-08-17', usuario: '' }] }))
      .toEqual({ hubo: false })
  })
})

describe('lineaDeTiempo — updates + cambios de buque juntos', () => {
  it('intercala del más nuevo al más viejo y solo llama trasbordo al cambio real', () => {
    const logs = [
      { tipo: 'enviado', fecha: '2026-08-10', created_at: '2026-08-10T12:00:00Z' },
      { tipo: 'eta', fecha: '2026-08-05', created_at: '2026-08-05T12:00:00Z' },
    ]
    const cambios = [
      { buque: 'BREMERHAVEN EXPRESS', fecha: '2026-08-01', usuario: 'admin' },
      { buque: 'MSC ADELE', fecha: '2026-08-17', usuario: 'admin' },
    ]
    const t = lineaDeTiempo(logs, cambios)
    expect(t.map(e => `${e.fecha}:${e.kind}`)).toEqual([
      '2026-08-17:buque', '2026-08-10:log', '2026-08-05:log', '2026-08-01:buque',
    ])
    const adele = t[0]
    expect(adele.kind === 'buque' && adele.anterior).toBe('BREMERHAVEN EXPRESS')
    // El primer buque conocido no tiene "anterior": no es un trasbordo.
    expect(t[3].kind === 'buque' && t[3].anterior).toBeUndefined()
  })

  it('sin updates propios, el historial igual muestra el cambio de buque', () => {
    const t = lineaDeTiempo([], [{ buque: 'MSC ADELE', fecha: '2026-08-17', usuario: 'admin' }])
    expect(t).toHaveLength(1)
    expect(t[0].kind).toBe('buque')
  })

  it('la fecha del log puede venir legacy o solo con created_at', () => {
    expect(lineaDeTiempo([{ tipo: 'enviado', fecha: '10/8/2026' }], [])[0].fecha).toBe('2026-08-10')
    expect(lineaDeTiempo([{ tipo: 'enviado', created_at: '2026-08-09T12:00:00Z' }], [])[0].fecha).toBe('2026-08-09')
  })
})

describe('textoUpdate — variante trasbordo', () => {
  const base = { buque: 'MSC ADELE', puerto: 'Montevideo', etaISO: '2026-09-02', hora: 15 }

  it('avisa el trasbordo y la nueva fecha (no "se mantiene")', () => {
    const t = textoUpdate({ ...base, actualizada: false, trasbordo: {} })
    expect(t).toContain('la carga fue trasbordada al buque MSC ADELE')
    expect(t).toContain('la ETA al puerto de Montevideo pasa a ser el día 02/09/2026')
    expect(t).not.toContain('se mantiene')
    expect(t).not.toContain('sigue rumbo')
  })

  it('nombra el buque anterior cuando se conoce', () => {
    expect(textoUpdate({ ...base, actualizada: true, trasbordo: { anterior: 'BREMERHAVEN EXPRESS' } }))
      .toContain('fue trasbordada del buque BREMERHAVEN EXPRESS al buque MSC ADELE')
  })

  it('el trasbordo manda sobre "se actualiza"/"se mantiene"', () => {
    const conAmbos = textoUpdate({ ...base, actualizada: true, trasbordo: {} })
    expect(conAmbos).toContain('trasbordada')
    expect(conAmbos).not.toContain('se actualiza la ETA')
  })

  it('sin trasbordo, los textos de siempre no cambian', () => {
    expect(textoUpdate({ ...base, actualizada: false })).toContain('sigue rumbo según lo previsto')
    expect(textoUpdate({ ...base, actualizada: true })).toContain('se actualiza la ETA')
  })
})
