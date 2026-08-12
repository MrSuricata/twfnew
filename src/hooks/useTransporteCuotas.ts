import { useEffect, useState } from 'react'
import { fetchTransporteCuotas } from '@/lib/dataClient'
import type { CuotaTransporte } from '@/lib/distribucionTransportes'

/**
 * Cuotas objetivo de reparto por transporte.
 *
 * Se cachean a nivel de módulo: son cuatro filas de configuración que cambian
 * cada tanto, y el panel de detalle se abre y cierra muchas veces por sesión —
 * un fetch por apertura sería puro ruido.
 *
 * `invalidarCuotas()` limpia el caché Y avisa a los hooks montados para que
 * refetcheen: sin eso, el chip de sugerencia de la ficha seguía recomendando
 * con las cuotas viejas hasta recargar la página (hallazgo revisión 12/08).
 */
let cache: CuotaTransporte[] | null = null
let enVuelo: Promise<CuotaTransporte[]> | null = null
const suscriptores = new Set<() => void>()

export function invalidarCuotas() {
  cache = null
  enVuelo = null
  for (const notificar of suscriptores) notificar()
}

function cargar(): Promise<CuotaTransporte[]> {
  // Una sola request aunque monten (o invaliden) varios componentes a la vez.
  enVuelo = enVuelo ?? fetchTransporteCuotas().then(c => { cache = c; return c })
  return enVuelo
}

export function useTransporteCuotas(): CuotaTransporte[] {
  const [cuotas, setCuotas] = useState<CuotaTransporte[]>(cache ?? [])

  useEffect(() => {
    let vivo = true
    const refrescar = () => {
      if (cache) { setCuotas(cache); return }
      cargar()
        .then(c => { if (vivo) setCuotas(c) })
        .catch(() => { enVuelo = null })   // que un fallo no deje el caché envenenado
    }
    refrescar()
    suscriptores.add(refrescar)
    return () => { vivo = false; suscriptores.delete(refrescar) }
  }, [])

  return cuotas
}
