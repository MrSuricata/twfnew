/**
 * Avisos del calendario — cosas que le pasan a un DÍA, no a una carga.
 *
 * La agenda vieja solo sabe de eventos que cuelgan de una REF o de un camión.
 * Un feriado o un paro en TCP no tienen REF: son del día. Por eso viven en su
 * propia tabla y se cruzan por fecha con lo que ya está agendado.
 *
 * Sirven para dos cosas: verlos en el calendario, y que al coordinar un camión
 * para ese día la app avise. Avisa, no bloquea — a veces conviene igual.
 */

export type TipoEventoCal = 'feriado' | 'paro' | 'aviso'

export interface EventoCalendario {
  id: string
  fecha: string          // YYYY-MM-DD
  tipo: TipoEventoCal
  titulo: string
  detalle?: string
  creadoPor?: string
}

interface TipoConfig {
  label: string
  emoji: string
  /** Fondo de la banda en el calendario. */
  bg: string
  /** Texto sobre esa banda. */
  texto: string
  /** Punto de color en las vistas apretadas. */
  dot: string
}

export const TIPO_EVENTO_CAL: Record<TipoEventoCal, TipoConfig> = {
  paro: {
    label: 'Paro',
    emoji: '✊',
    bg: 'bg-rose-100 border-rose-300',
    texto: 'text-rose-800',
    dot: 'bg-rose-500',
  },
  feriado: {
    label: 'Feriado',
    emoji: '📅',
    bg: 'bg-violet-100 border-violet-300',
    texto: 'text-violet-800',
    dot: 'bg-violet-500',
  },
  aviso: {
    label: 'Aviso',
    emoji: '⚠️',
    bg: 'bg-amber-100 border-amber-300',
    texto: 'text-amber-800',
    dot: 'bg-amber-500',
  },
}

export const TIPOS_EVENTO_CAL: TipoEventoCal[] = ['paro', 'feriado', 'aviso']

/** Un paro pesa más que un feriado, y un feriado más que un aviso suelto. */
const PESO: Record<TipoEventoCal, number> = { paro: 0, feriado: 1, aviso: 2 }

export function ordenarEventosCal(eventos: EventoCalendario[]): EventoCalendario[] {
  return [...eventos].sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha)
    const p = PESO[a.tipo] - PESO[b.tipo]
    return p !== 0 ? p : a.titulo.localeCompare(b.titulo)
  })
}

/** Agrupa por día, que es como los consume el calendario. */
export function eventosPorFecha(eventos: EventoCalendario[]): Map<string, EventoCalendario[]> {
  const mapa = new Map<string, EventoCalendario[]>()
  for (const ev of ordenarEventosCal(eventos)) {
    const previos = mapa.get(ev.fecha)
    if (previos) previos.push(ev)
    else mapa.set(ev.fecha, [ev])
  }
  return mapa
}

/** Los avisos de un día puntual, ya ordenados por peso. */
export function eventosDelDia(eventos: EventoCalendario[], fecha: string): EventoCalendario[] {
  return ordenarEventosCal(eventos.filter(e => e.fecha === fecha))
}

/**
 * El texto que se le muestra a quien está coordinando un camión para ese día.
 * Devuelve null cuando el día está limpio, así el llamador no arma la frase.
 */
export function avisoParaFecha(eventos: EventoCalendario[], fecha: string): string | null {
  const delDia = eventosDelDia(eventos, fecha)
  if (delDia.length === 0) return null
  const primero = delDia[0]
  const etiqueta = TIPO_EVENTO_CAL[primero.tipo].label
  const resto = delDia.length - 1
  const cola = resto > 0 ? ` (y ${resto} aviso${resto > 1 ? 's' : ''} más ese día)` : ''
  return `${etiqueta}: ${primero.titulo}${cola}`
}

/** Normaliza lo que devuelve la API, que viene en snake_case. */
export function parseEventoCal(fila: Record<string, unknown>): EventoCalendario {
  const tipo = String(fila.tipo || 'aviso').toLowerCase()
  return {
    id: String(fila.id || ''),
    fecha: String(fila.fecha || '').slice(0, 10),
    tipo: (TIPOS_EVENTO_CAL as string[]).includes(tipo) ? (tipo as TipoEventoCal) : 'aviso',
    titulo: String(fila.titulo || ''),
    detalle: fila.detalle ? String(fila.detalle) : undefined,
    creadoPor: fila.creado_por ? String(fila.creado_por) : undefined,
  }
}
