import { useEffect, useState } from 'react'
import { fetchTransporteCuotas } from '@/lib/dataClient'
import type { CuotaTransporte } from '@/lib/distribucionTransportes'

/**
 * Cuotas objetivo de reparto por transporte.
 *
 * Se cachean a nivel de módulo: son cuatro filas de configuración que cambian
 * cada tanto, y el panel de detalle se abre y cierra muchas veces por sesión —
 * un fetch por apertura sería puro ruido. `invalidarCuotas()` limpia el caché
 * cuando alguien las edita en el panel de Transportes.
 */
let cache: CuotaTransporte[] | null = null
let enVuelo: Promise<CuotaTransporte[]> | null = null

export function invalidarCuotas() {
  cache = null
  enVuelo = null
}

export function useTransporteCuotas(): CuotaTransporte[] {
  const [cuotas, setCuotas] = useState<CuotaTransporte[]>(cache ?? [])

  useEffect(() => {
    if (cache) { setCuotas(cache); return }
    let vivo = true
    // Una sola request aunque monten varios componentes a la vez.
    enVuelo = enVuelo ?? fetchTransporteCuotas().then(c => { cache = c; return c })
    enVuelo
      .then(c => { if (vivo) setCuotas(c) })
      .catch(() => { enVuelo = null })   // que un fallo no deje el caché envenenado
    return () => { vivo = false }
  }, [])

  return cuotas
}
