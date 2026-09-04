/**
 * Plegado de cards con memoria POR USUARIO (spec 04/09, D7).
 *
 * Envuelve la lib pura `cardsPlegadas` con las dos fuentes reales:
 *  · `localStorage` — caché local. Se lee en el PRIMER render, así la card no
 *    aparece abierta y se pliega sola medio segundo después (el parpadeo que
 *    tiene la grilla cuando las prefs llegan tarde).
 *  · `user_prefs` — la verdad, porque viaja con el LOGIN: el operador pliega
 *    en la compu y lo encuentra plegado en el celular. Mismo camino que la
 *    grilla de Operaciones (fetchUserPrefs al montar + saveUserPrefsDebounced).
 *
 * Reglas que este hook garantiza:
 *  · Lo plegado NO se reabre solo: ni entre recargas, ni entre refetches de
 *    datos, ni porque cambie el contador de la card. Para que eso valga TAMBIÉN
 *    cuando el operador pliega y recarga en el mismo segundo, al ocultar o
 *    abandonar la página se fuerza el envío de lo que espera el debounce
 *    (`flushUserPrefs`): si no, el server contestaría el valor viejo y la card
 *    se abriría sola.
 *  · Lo que el usuario tocó ANTES de que llegaran las prefs del server no se
 *    pierde ni se deshace: se re-aplica encima (`aplicarToques`) y recién ahí
 *    se guarda.
 *  · Sin sesión, sin red o sin storage, la card sigue funcionando: queda el
 *    caché local, o el default (todo abierto).
 *
 * La clave (`hoyFclCardsCerradas`) va DENTRO del JSON de `user_prefs` que ya
 * existe — no hay tabla ni columna nueva.
 *
 * `sincronizar: false` apaga la parte del server y deja SOLO el caché local.
 * Es lo que usa el portal del depósito: `/api/data/user-prefs` es del admin
 * (`payload.role !== 'admin'` → 401) y un 401 con token puesto le dispara al
 * depósito el cartel de "Tu sesión venció", que no venció nada. Ahí la memoria
 * es por navegador —que es el celular del que está parado en el predio— y la
 * clave va por usuario, porque la compu del mostrador la usan varios.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchUserPrefs, saveUserPrefsDebounced, flushUserPrefs } from '@/lib/dataClient'
import {
  parseCardsCerradas, cardAbierta, conCardAbierta, alternarCard, aplicarToques,
  type CardsPlegadas,
} from '@/lib/cardsPlegadas'

export interface OpcionesCardsPlegadas {
  /** Guardar también en `user_prefs` (viaja con el login a otro dispositivo).
   *  `false` = solo localStorage. Ver el docblock del archivo. */
  sincronizar?: boolean
}

/** Clave de HOY FCL dentro de `user_prefs`. Cambiarla = perder lo plegado. */
export const CLAVE_HOY_FCL = 'hoyFclCardsCerradas'

const LS_PREFIJO = 'twf-cards-cerradas:'

const mismaLista = (a: readonly string[], b: readonly string[]) =>
  a === b || (a.length === b.length && a.every((v, i) => v === b[i]))

/**
 * @param clave      clave dentro del JSON de `user_prefs` (ej. `CLAVE_HOY_FCL`)
 *                   y sufijo del localStorage.
 * @param idsValidos ids de las cards que existen hoy. Tiene que ser una
 *                   CONSTANTE de módulo: se toma una sola vez, al montar.
 * @param opciones   `sincronizar: false` = solo caché local (portales).
 */
export function useCardsPlegadas(
  clave: string,
  idsValidos: readonly string[],
  { sincronizar = true }: OpcionesCardsPlegadas = {},
): CardsPlegadas {
  const lsKey = LS_PREFIJO + clave
  const idsRef = useRef(idsValidos)

  const [cerradas, setCerradas] = useState<readonly string[]>(() => {
    try {
      const raw = localStorage.getItem(lsKey)
      return raw ? parseCardsCerradas(JSON.parse(raw), idsValidos) : []
    } catch {
      return []
    }
  })

  // Espejo del estado para leerlo dentro de los callbacks sin re-crearlos en
  // cada toque (si no, cada card se re-renderiza cuando se pliega otra).
  const cerradasRef = useRef(cerradas)
  // Hasta que las prefs del server llegaron, NADA se guarda: el primer render
  // con defaults pisaría lo que el usuario tiene guardado en su cuenta.
  const prefsListas = useRef(false)
  const toques = useRef<[string, boolean][]>([])

  const aplicar = useCallback((next: readonly string[]) => {
    if (mismaLista(next, cerradasRef.current)) return
    cerradasRef.current = next
    setCerradas(next)
    try { localStorage.setItem(lsKey, JSON.stringify(next)) } catch { /* incógnito / sin storage */ }
    if (sincronizar && prefsListas.current) saveUserPrefsDebounced({ [clave]: next })
  }, [clave, lsKey, sincronizar])

  const toggle = useCallback((id: string, abierta?: boolean) => {
    const prev = cerradasRef.current
    const next = abierta === undefined ? alternarCard(prev, id) : conCardAbierta(prev, id, abierta)
    if (next === prev) return
    if (sincronizar && !prefsListas.current) toques.current.push([id, cardAbierta(next, id)])
    aplicar(next)
  }, [aplicar, sincronizar])

  useEffect(() => {
    // Sin sincronización no hay nada que esperar del server: lo que se toca
    // queda en el localStorage y se lee de ahí en la próxima visita.
    if (!sincronizar) { prefsListas.current = true; return }
    let vivo = true
    fetchUserPrefs()
      .then(prefs => {
        if (!vivo) return
        // El server es la base; lo que el usuario tocó recién manda encima.
        aplicar(aplicarToques(parseCardsCerradas(prefs[clave], idsRef.current), toques.current))
      })
      .catch(() => { /* sin sesión o sin red: queda el caché local */ })
      .finally(() => {
        if (!vivo) return
        prefsListas.current = true
        // Los toques de los primeros milisegundos todavía no se guardaron.
        if (toques.current.length > 0) {
          toques.current = []
          saveUserPrefsDebounced({ [clave]: cerradasRef.current })
        }
      })
    return () => { vivo = false }
  }, [clave, aplicar, sincronizar])

  // Al irse o esconder la pestaña, lo que espera el debounce sale YA. Sin esto,
  // plegar y recargar enseguida pierde el cambio (ver el docblock de arriba).
  useEffect(() => {
    if (!sincronizar) return
    const alSalir = () => { if (document.visibilityState === 'hidden') flushUserPrefs() }
    window.addEventListener('pagehide', flushUserPrefs)
    document.addEventListener('visibilitychange', alSalir)
    return () => {
      window.removeEventListener('pagehide', flushUserPrefs)
      document.removeEventListener('visibilitychange', alSalir)
    }
  }, [sincronizar])

  const estaAbierta = useCallback((id: string) => cardAbierta(cerradas, id), [cerradas])

  return useMemo<CardsPlegadas>(() => ({ estaAbierta, toggle }), [estaAbierta, toggle])
}
