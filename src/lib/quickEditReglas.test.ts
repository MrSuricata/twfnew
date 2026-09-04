/**
 * Las tres preguntas del quick-edit, con la semántica EXACTA que tenían
 * inline en ContainerQuickEdit (rediseño 04/09, D6): cada regla con su caso
 * positivo y sus negativos, y el texto tal cual lo ve el operador.
 *
 * Calendario de referencia: 07/09/2026 es lunes.
 */
import { describe, it, expect } from 'vitest'
import {
  salidaCambio,
  reglaSalidaAntesDeLlegada,
  reglaSugerirEtaFiscal,
  reglaSinTelex,
} from './quickEditReglas'
import { mensajeConfirmarSinTelex } from './telexCheck'

const LUN = '2026-09-07'
const MIE = '2026-09-09'
const JUE = '2026-09-10'
const VIE = '2026-09-11'
const LUN_SIG = '2026-09-14'

describe('salidaCambio', () => {
  it('compara el string exacto: igual → no cambió, distinto → cambió', () => {
    expect(salidaCambio(LUN, LUN)).toBe(false)
    expect(salidaCambio(LUN, '')).toBe(true)
    expect(salidaCambio('', LUN)).toBe(true)
  })
})

describe('regla 1 — salida ANTES de la llegada a MVD', () => {
  it('pregunta cuando la salida cambió y quedó antes de la ETA, con las fechas en DD/MM/YYYY', () => {
    const r = reglaSalidaAntesDeLlegada({ salida: '2026-09-05', prevSalida: '', etaLlegada: JUE })
    expect(r).toEqual({
      preguntar: true,
      mensaje: '⏰ La salida de MVD (05/09/2026) queda ANTES de la llegada de la carga a MVD (10/09/2026).\n\n¿Guardar igual?',
    })
  })

  it('NO pregunta si la salida no cambió, aunque siga antes de la ETA (editar arribo/lugar no re-pregunta)', () => {
    expect(reglaSalidaAntesDeLlegada({ salida: '2026-09-05', prevSalida: '2026-09-05', etaLlegada: JUE })).toEqual({ preguntar: false })
  })

  it('NO pregunta si la salida es el mismo día o después de la llegada', () => {
    expect(reglaSalidaAntesDeLlegada({ salida: JUE, prevSalida: '', etaLlegada: JUE })).toEqual({ preguntar: false })
    expect(reglaSalidaAntesDeLlegada({ salida: VIE, prevSalida: '', etaLlegada: JUE })).toEqual({ preguntar: false })
  })

  it('NO pregunta sin una de las dos fechas (no hay con qué comparar, no se inventa)', () => {
    expect(reglaSalidaAntesDeLlegada({ salida: '', prevSalida: LUN, etaLlegada: JUE })).toEqual({ preguntar: false })
    expect(reglaSalidaAntesDeLlegada({ salida: LUN, prevSalida: '', etaLlegada: '' })).toEqual({ preguntar: false })
    expect(reglaSalidaAntesDeLlegada({ salida: 'a confirmar', prevSalida: '', etaLlegada: JUE })).toEqual({ preguntar: false })
  })
})

describe('regla 2 — sugerir la llegada a fiscal (salida + 2, finde → lunes)', () => {
  it('salida movida sin tocar el fiscal → ofrece salida+2 y dice qué fecha hay ahora', () => {
    const r = reglaSugerirEtaFiscal({ salida: LUN, prevSalida: '', etaFisc: JUE, prevEtaFisc: JUE })
    expect(r).toEqual({
      preguntar: true,
      sugerida: MIE,
      mensaje: '🚛 La salida queda el lunes 07/09/2026.\n\n¿Llevar la llegada a fiscal al miércoles 09/09/2026? (ahora: jueves 10/09/2026)',
    })
  })

  it('sin fiscal cargado dice "sin fecha"', () => {
    const r = reglaSugerirEtaFiscal({ salida: LUN, prevSalida: '', etaFisc: '', prevEtaFisc: '' })
    expect(r.preguntar).toBe(true)
    if (r.preguntar) {
      expect(r.sugerida).toBe(MIE)
      expect(r.mensaje).toContain('(ahora: sin fecha)')
    }
  })

  it('el +2 que cae en finde corre al lunes (jueves → lunes, viernes → lunes)', () => {
    const j = reglaSugerirEtaFiscal({ salida: JUE, prevSalida: '', etaFisc: '', prevEtaFisc: '' })
    const v = reglaSugerirEtaFiscal({ salida: VIE, prevSalida: '', etaFisc: '', prevEtaFisc: '' })
    expect(j.preguntar && j.sugerida).toBe(LUN_SIG)
    expect(v.preguntar && v.sugerida).toBe(LUN_SIG)
    if (j.preguntar) expect(j.mensaje).toContain('al lunes 14/09/2026')
  })

  it('NO pregunta si el usuario también editó el arribo en este commit (eligió él)', () => {
    expect(reglaSugerirEtaFiscal({ salida: LUN, prevSalida: '', etaFisc: VIE, prevEtaFisc: JUE })).toEqual({ preguntar: false })
  })

  it('NO pregunta si la salida no cambió', () => {
    expect(reglaSugerirEtaFiscal({ salida: LUN, prevSalida: LUN, etaFisc: '', prevEtaFisc: '' })).toEqual({ preguntar: false })
  })

  it('NO pregunta si el fiscal ya está en la fecha sugerida', () => {
    expect(reglaSugerirEtaFiscal({ salida: LUN, prevSalida: '', etaFisc: MIE, prevEtaFisc: MIE })).toEqual({ preguntar: false })
  })

  it('NO pregunta si la salida no es una fecha ISO (texto libre o vacía): no se inventa', () => {
    expect(reglaSugerirEtaFiscal({ salida: 'a confirmar', prevSalida: '', etaFisc: '', prevEtaFisc: '' })).toEqual({ preguntar: false })
    expect(reglaSugerirEtaFiscal({ salida: '', prevSalida: LUN, etaFisc: JUE, prevEtaFisc: JUE })).toEqual({ preguntar: false })
  })
})

describe('regla 3 — agendar sin telex', () => {
  const base = { ref: 'A7995', cntr: 'MRKU1234567' }

  it('salida nueva con fecha y telex sin liberar → pregunta con el texto estándar de telexCheck', () => {
    const r = reglaSinTelex({ ...base, salida: LUN, prevSalida: '', tlx: '' })
    expect(r).toEqual({
      preguntar: true,
      mensaje: mensajeConfirmarSinTelex({ ref: 'A7995', cntr: 'MRKU1234567', fecha: LUN }),
    })
    if (r.preguntar) {
      expect(r.mensaje).toContain('A7995 no tiene el telex liberado')
      expect(r.mensaje).toContain('Contenedor: MRKU1234567')
      expect(r.mensaje).toContain('Salida: 07/09/2026')
    }
  })

  it('sin contenedor (carga sin CNTR asignado) el mensaje omite la línea del contenedor', () => {
    const r = reglaSinTelex({ ref: 'A7995', cntr: '', salida: LUN, prevSalida: '', tlx: null })
    expect(r.preguntar).toBe(true)
    if (r.preguntar) expect(r.mensaje).not.toContain('Contenedor:')
  })

  it('NO pregunta con telex liberado (SI, o el TRUE rezagado de la planilla vieja)', () => {
    expect(reglaSinTelex({ ...base, salida: LUN, prevSalida: '', tlx: 'SI' })).toEqual({ preguntar: false })
    expect(reglaSinTelex({ ...base, salida: LUN, prevSalida: '', tlx: 'true' })).toEqual({ preguntar: false })
  })

  it('NO pregunta si la salida no cambió (corregir arribo/lugar con salida puesta)', () => {
    expect(reglaSinTelex({ ...base, salida: LUN, prevSalida: LUN, tlx: '' })).toEqual({ preguntar: false })
  })

  it('NO pregunta al BORRAR la salida (queda vacía o en blanco)', () => {
    expect(reglaSinTelex({ ...base, salida: '', prevSalida: LUN, tlx: '' })).toEqual({ preguntar: false })
    expect(reglaSinTelex({ ...base, salida: '   ', prevSalida: LUN, tlx: '' })).toEqual({ preguntar: false })
  })
})
