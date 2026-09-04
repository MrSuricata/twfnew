// ─── Reglas del modal de cambios rápidos (ContainerQuickEdit) ──────────────
// Las tres preguntas que el quick-edit hacía con `window.confirm` inline
// (rediseño 04/09, D6): acá se decide SI hay que preguntar y QUÉ texto; la
// UI solo llama `window.confirm(mensaje)` cuando la regla dice que sí.
//
// Las tres cuelgan de lo mismo: la SALIDA cambió respecto del último commit
// (`prevSalida`). Editar arribo/lugar/transporte con una salida ya puesta no
// vuelve a preguntar nada.
//
// Pura: sin React, sin DOM. Se testea en quickEditReglas.test.ts.

import { isSalidaBeforeArrival, fmtDMY } from './salidaCheck'
import { sugerirEtaFiscal, nombreDia } from './transitoFiscal'
import { isSinTelex, mensajeConfirmarSinTelex } from './telexCheck'

/** Resultado de una regla: o no se pregunta, o se pregunta con este texto. */
export type Pregunta =
  | { preguntar: false }
  | { preguntar: true; mensaje: string }

/** La sugerencia de fiscal además trae la fecha propuesta, para aplicarla si
 *  el usuario acepta. */
export type PreguntaFiscal =
  | { preguntar: false }
  | { preguntar: true; mensaje: string; sugerida: string }

const NO_PREGUNTAR = { preguntar: false } as const

/** ¿La salida cambió en este commit? Comparación exacta del string, igual que
 *  hacía el componente. */
export function salidaCambio(salida: string, prevSalida: string): boolean {
  return salida !== prevSalida
}

/**
 * Regla 1 — Salida ANTES de la llegada a MVD.
 * Solo al COORDINAR la salida (cuando la fecha CAMBIÓ): una carga no puede
 * salir de Montevideo antes de llegar. Si el usuario no confirma, la UI
 * revierte la salida al último valor confirmado y no guarda.
 */
export function reglaSalidaAntesDeLlegada(a: {
  salida: string
  prevSalida: string
  /** ETA vigente de llegada a MVD (etaVigente: la de la carga o la del contenedor). */
  etaLlegada: string
}): Pregunta {
  if (!salidaCambio(a.salida, a.prevSalida)) return NO_PREGUNTAR
  if (!isSalidaBeforeArrival(a.salida, a.etaLlegada)) return NO_PREGUNTAR
  return {
    preguntar: true,
    mensaje: `⏰ La salida de MVD (${fmtDMY(a.salida)}) queda ANTES de la llegada de la carga a MVD (${fmtDMY(a.etaLlegada)}).\n\n¿Guardar igual?`,
  }
}

/**
 * Regla 2 — Sugerir la llegada a fiscal.
 * Salida movida SIN tocar el fiscal en este commit → ofrecer la llegada
 * normal del tránsito (salida+2, finde → lunes; regla Brian 13/08). Si el
 * usuario también editó el arribo, eligió él y no se pregunta. Tampoco se
 * pregunta si el fiscal ya está en la fecha sugerida o si la salida no es
 * una fecha ISO (nunca inventar sobre texto libre).
 */
export function reglaSugerirEtaFiscal(a: {
  salida: string
  prevSalida: string
  etaFisc: string
  prevEtaFisc: string
}): PreguntaFiscal {
  if (!salidaCambio(a.salida, a.prevSalida)) return NO_PREGUNTAR
  if (a.etaFisc !== a.prevEtaFisc) return NO_PREGUNTAR
  const sugerida = sugerirEtaFiscal(a.salida)
  if (!sugerida || sugerida === a.etaFisc) return NO_PREGUNTAR
  const actualTxt = a.etaFisc ? `${nombreDia(a.etaFisc)} ${fmtDMY(a.etaFisc)}`.trim() : 'sin fecha'
  return {
    preguntar: true,
    sugerida,
    mensaje:
      `🚛 La salida queda el ${nombreDia(a.salida)} ${fmtDMY(a.salida)}.\n\n` +
      `¿Llevar la llegada a fiscal al ${nombreDia(sugerida)} ${fmtDMY(sugerida)}? (ahora: ${actualTxt})`,
  }
}

/**
 * Regla 3 — Agendar sin telex.
 * Se pregunta ANTES de guardar: agendar igual es una decisión. Solo cuando la
 * salida cambió, quedó con fecha (borrarla no pregunta) y el telex no está
 * liberado. Si el usuario no confirma, la UI deja el commit como no hecho
 * para que pueda corregir la fecha y reintentar.
 */
export function reglaSinTelex(a: {
  salida: string
  prevSalida: string
  tlx: string | null | undefined
  ref: string
  cntr?: string | null
}): Pregunta {
  if (!salidaCambio(a.salida, a.prevSalida)) return NO_PREGUNTAR
  if (!(a.salida || '').trim()) return NO_PREGUNTAR
  if (!isSinTelex(a.tlx)) return NO_PREGUNTAR
  return {
    preguntar: true,
    mensaje: mensajeConfirmarSinTelex({ ref: a.ref, cntr: a.cntr, fecha: a.salida }),
  }
}
