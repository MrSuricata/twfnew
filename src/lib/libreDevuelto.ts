// Botón rápido "Devuelto" (ViabilityBlock + ContainerQuickEdit).
//
// REGLA DEL REPO: "DEVUELTO" vive en el campo LIBRE — marcar un contenedor como
// devuelto es setear LIBRE='DEVUELTO' (el string REEMPLAZA la fecha; así lo
// carga el equipo a mano y así lo leen isOperationActive, libreAlerts de
// todayFilters —que ignora no-ISO—, el plan operativo y el push de alertas).
// NO vive en OPERATIVA (verificado en datos 2026-06: 456 vs 0) — no "mover" esto.

export const LIBRE_DEVUELTO = 'DEVUELTO'

/** ¿El LIBRE ya marca el contenedor como devuelto? Mismo criterio laxo que
 *  isOperationActive: contiene "DEVUELTO", case-insensitive. */
export function isLibreDevuelto(libre: unknown): boolean {
  return String(libre ?? '').toUpperCase().includes(LIBRE_DEVUELTO)
}

/** Transición del botón "Devuelto" sobre el LIBRE actual:
 *  - LIBRE fecha/vacío → next='DEVUELTO' (marcar). `prev` guarda el valor
 *    EXACTO anterior (fecha ISO o '') para restaurar con "Deshacer" del toast.
 *  - LIBRE ya DEVUELTO → next='' (deshacer devuelto: queda vacío; la fecha
 *    original ya fue pisada y no se puede recuperar). */
export function libreDevueltoToggle(current: unknown): { next: string; prev: string } {
  const prev = String(current ?? '')
  return isLibreDevuelto(prev) ? { next: '', prev } : { next: LIBRE_DEVUELTO, prev }
}
