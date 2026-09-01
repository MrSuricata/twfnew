/**
 * Código del próximo camión: contador atómico del server (C###) y, si la API
 * no responde, el máximo local + 1. Lo usan "Nuevo camión" (TrucksList) y
 * "Armar camión con estas" (SugerenciasCamion): un solo lugar para la regla.
 */
import type { Truck } from '@/lib/truckTypes'
import { nextTruckCode } from '@/lib/dataClient'

export async function codigoNuevoCamion(trucks: Truck[]): Promise<string> {
  try {
    return await nextTruckCode('C')
  } catch (err) {
    const localMax = trucks
      .map(t => {
        const m = /^C(\d+)$/.exec(t.code || '')
        return m ? parseInt(m[1], 10) : 0
      })
      .reduce((max, n) => Math.max(max, n), 429)
    const code = `C${localMax + 1}`
    console.warn('[nuevoCamion] nextTruckCode fallback used:', code, err)
    return code
  }
}
