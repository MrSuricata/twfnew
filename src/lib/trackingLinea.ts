/**
 * Link de tracking DE LA LÍNEA MARÍTIMA por carga (Brian 17/08): el buque
 * puede cambiar en un trasbordo, así que el link correcto no es el buque sino
 * el contenedor/BL en la web de la línea — ahí Nico captura el seguimiento y
 * después copia el mensaje para el mail.
 *
 * Formatos CONFIRMADOS (ejemplos reales de Brian + verificación web 17/08):
 *  - MAERSK  → maersk.com/tracking/{BL}                    (ej. A7996: 271528268)
 *  - HAPAG   → hapag-lloyd.com …?container={CNTR}          (ej. A7967: TLLU5948854)
 *  - HMM     → hmm21.com/e-service/search?query={BL}       (ej. A8050: SZPM79977300)
 *  - ONE     → ecomm.one-line.com …?trakNoParam={BL}&trakNoTpCdParam=B
 *              (formato que pasó Brian 18/08 con la A8143: SZPGL2968300. El
 *              `trakNoTpCdParam` declara QUÉ es el número — B = BL —, sin él
 *              la página abre el buscador vacío. Sin BL cae al contenedor,
 *              donde el tipo es C.)
 *  - COSCO   → elines.coscoshipping.com …?trackingType=BILLOFLADING&number={BL}
 *
 * Pendientes de confirmar formato (Brian los va pasando): MSC, PIL, CMA CGM,
 * EMC/Evergreen, OOCL, ZIM, YANG MING. Mientras: null → el caller cae al
 * buscador de MarineTraffic por nombre de buque.
 */

export interface TrackingCarrier {
  url: string
  /** Nombre corto de la línea para el botón ("MAERSK", "ONE"…). */
  linea: string
}

const limpiar = (s: string | null | undefined): string =>
  String(s || '').trim().toUpperCase().replace(/\s+/g, '')

/** Primer contenedor de la lista "MSKU1234567, TCLU…" (o '' si no hay). */
const primerCntr = (cntr: string | null | undefined): string =>
  limpiar(String(cntr || '').split(/[,/+]/)[0])

export function trackingCarrier(c: {
  linea?: string | null
  docNumber?: string | null
  cntr?: string | null
}): TrackingCarrier | null {
  const linea = String(c.linea || '').trim().toUpperCase()
  const doc = limpiar(c.docNumber)
  const cntr = primerCntr(c.cntr)

  // REPREMAR vende espacio de Maersk: sus cargas se trackean en Maersk.
  if (linea.includes('MAERSK') || linea === 'REPREMAR') {
    if (!doc) return null
    return { url: `https://www.maersk.com/tracking/${encodeURIComponent(doc)}`, linea: 'MAERSK' }
  }

  if (linea.includes('HAPAG') || linea === 'HLAG') {
    if (!cntr) return null
    return {
      url: `https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container=${encodeURIComponent(cntr)}`,
      linea: 'HAPAG',
    }
  }

  if (linea === 'HMM' || linea.includes('HYUNDAI')) {
    if (!doc) return null
    return { url: `https://www.hmm21.com/e-service/search/index.do?query=${encodeURIComponent(doc)}`, linea: 'HMM' }
  }

  if (linea === 'ONE') {
    // El tracking de ONE no acepta el prefijo ONEY del BL; también trackea por
    // contenedor, que es el respaldo cuando no hay BL cargado. `trakNoTpCdParam`
    // dice qué es el número que va: B = BL, C = contenedor.
    const bl = doc.replace(/^ONEY/, '')
    const n = bl || cntr
    if (!n) return null
    const tipo = bl ? 'B' : 'C'
    return {
      url: `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?trakNoParam=${encodeURIComponent(n)}&trakNoTpCdParam=${tipo}`,
      linea: 'ONE',
    }
  }

  if (linea.includes('COSCO')) {
    if (!doc) return null
    return {
      url: `https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=BILLOFLADING&number=${encodeURIComponent(doc)}`,
      linea: 'COSCO',
    }
  }

  return null
}
