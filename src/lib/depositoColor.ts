/**
 * Los colores de depósito que usa el mail de Próximas salidas: quien lee el
 * mail y la app ve la misma señal en el mismo lugar. Un solo lugar para que
 * las sugerencias de camión, HOY LCL y Próximas salidas pinten igual.
 */
export const COLOR_DEPOSITO: Record<string, string> = {
  TCP: 'bg-red-100 text-red-800 border-red-300',
  MONTECON: 'bg-blue-100 text-blue-800 border-blue-300',
  GODILCO: 'bg-amber-100 text-amber-800 border-amber-300',
  PLANIR: 'bg-green-100 text-green-800 border-green-300',
}

export const colorDeposito = (d: string | null | undefined): string =>
  COLOR_DEPOSITO[String(d ?? '').trim().toUpperCase()] || 'bg-slate-100 text-slate-700 border-slate-300'
