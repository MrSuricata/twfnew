/**
 * Un color por transporte, como ya lo tienen los depósitos (depositoColor.ts):
 * quien mira el Plan de carga distingue de un vistazo quién viene a cargar.
 * Brian (03/09/2026): "los chips de los transportes también con algún
 * colorcito". La paleta no se cruza con la de depósitos (rojo/azul/ámbar/verde)
 * para que un chip nunca se confunda con el otro.
 */
export const COLOR_TRANSPORTE: Record<string, string> = {
  TRANSCAL: 'bg-sky-100 text-sky-800 border-sky-300',
  RIGATOSSO: 'bg-violet-100 text-violet-800 border-violet-300',
  VAIROLATTI: 'bg-orange-100 text-orange-800 border-orange-300',
  OLAVERRY: 'bg-teal-100 text-teal-800 border-teal-300',
  SIROCO: 'bg-rose-100 text-rose-800 border-rose-300',
  ENZO: 'bg-lime-100 text-lime-800 border-lime-300',
  CARRARA: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  RDM: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300',
}

const FALLBACK = 'bg-slate-100 text-slate-700 border-slate-300'

/** Clases del chip para un transporte. Ignora mayúsculas y espacios; un
 *  transporte que no está en la paleta sale gris, nunca sin chip. */
export const colorTransporte = (t: string | null | undefined): string => {
  const clave = String(t ?? '').trim().toUpperCase()
  if (!clave) return FALLBACK
  if (COLOR_TRANSPORTE[clave]) return COLOR_TRANSPORTE[clave]
  // "TRANSCAL S.A." o "Transporte Rigatosso": alcanza con que contenga el nombre
  const hit = Object.keys(COLOR_TRANSPORTE).find(k => clave.includes(k))
  return hit ? COLOR_TRANSPORTE[hit] : FALLBACK
}
