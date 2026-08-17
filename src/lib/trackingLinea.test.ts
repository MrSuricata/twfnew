import { describe, it, expect } from 'vitest'
import { trackingCarrier } from './trackingLinea'

describe('trackingCarrier — el link de la línea, no del buque (trasbordos)', () => {
  it('MAERSK por BL (caso A7996) y REPREMAR va a Maersk', () => {
    expect(trackingCarrier({ linea: 'MAERSK', docNumber: '271528268' })?.url)
      .toBe('https://www.maersk.com/tracking/271528268')
    expect(trackingCarrier({ linea: 'REPREMAR', docNumber: '271528268' })?.linea).toBe('MAERSK')
  })

  it('HAPAG por contenedor (caso A7967), primer contenedor de la lista', () => {
    const t = trackingCarrier({ linea: 'HAPAG', cntr: 'TLLU 5948854, HLXU8415807' })
    expect(t?.url).toContain('hapag-lloyd.com')
    expect(t?.url).toContain('container=TLLU5948854')
  })

  it('HMM por BL/booking (caso A8050)', () => {
    expect(trackingCarrier({ linea: 'HMM', docNumber: 'SZPM79977300' })?.url)
      .toBe('https://www.hmm21.com/e-service/search/index.do?query=SZPM79977300')
  })

  it('ONE recorta el prefijo ONEY del BL; sin BL usa el contenedor', () => {
    const conBl = trackingCarrier({ linea: 'ONE', docNumber: 'ONEYNB5BE8541300' })
    expect(conBl?.url).toContain('ctrack-field=NB5BE8541300')
    expect(conBl?.url).toContain('trakNoParam=NB5BE8541300')
    const sinBl = trackingCarrier({ linea: 'ONE', docNumber: '', cntr: 'NYKU5168531' })
    expect(sinBl?.url).toContain('ctrack-field=NYKU5168531')
  })

  it('COSCO por BL numérico', () => {
    expect(trackingCarrier({ linea: 'COSCO', docNumber: '6416381990' })?.url)
      .toBe('https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=BILLOFLADING&number=6416381990')
  })

  it('sin el dato clave de esa línea → null (el caller cae a MarineTraffic)', () => {
    expect(trackingCarrier({ linea: 'MAERSK', docNumber: '' })).toBeNull()
    expect(trackingCarrier({ linea: 'HAPAG', cntr: '' })).toBeNull()
  })

  it('líneas todavía sin formato confirmado → null', () => {
    expect(trackingCarrier({ linea: 'MSC', docNumber: 'MEDUOP225149' })).toBeNull()
    expect(trackingCarrier({ linea: 'PIL', docNumber: 'X' })).toBeNull()
    expect(trackingCarrier({ linea: '', docNumber: 'X' })).toBeNull()
  })
})
