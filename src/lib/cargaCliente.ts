/**
 * UNA carga, vista por el cliente: la fila de "Mis cargas" (D4) y la ficha
 * que se abre al tocarla (D5).
 *
 * Brian (04/09/2026): de la lista dijo "esta parte de las cargas el formato
 * quedó anticuado y no el nuevo"; del modal de detalles, "este modal también
 * horrible, revisar todo".
 *
 * Las reglas que fija este archivo, todas de la spec del 04/09:
 *  · UN SOLO VOCABULARIO de estado. El de `estadoCliente` — el mismo que usan
 *    las cards de HOY. Antes la lista decía "En Tránsito Marítimo" y la card
 *    de arriba, sobre la misma carga, "Embarcada".
 *  · LOS CONTENEDORES SE CUENTAN. `n_cntr` se escribe solo al alta: 121 cargas
 *    activas lo tienen en 0 con contenedor cargado y el cliente leía
 *    "0 contenedor(es)". El server ya lo deriva (`cantidadContenedores` en
 *    api/_lib/clientShipments.ts) y llega en `N`/`calculatedN`; acá se usa eso
 *    y solo se cuenta a mano cuando los datos NO pasaron por el server (la
 *    vista previa "Ver como" del admin y la ruta /ui).
 *  · SIN "LIBRE". Es un dato nuestro —cuándo tenemos que devolver el vacío—,
 *    no del cliente. No aparece en la fila, ni en la ficha, ni en los datos.
 *  · LA LÍNEA DE TIEMPO SE DERIVA. Sale de `estadoCliente`, no de un
 *    `reached: true` fijo como el modal viejo, que pintaba "En Tránsito"
 *    alcanzado incluso en una carga que todavía no zarpó.
 *
 * Puro: sin React, sin fetch, `hoyISO` entra por parámetro.
 * Spec: docs/superpowers/specs/2026-09-04-rediseno-portal-cliente-y-hoy-design.md
 */
import type { ParsedShipment, OperativasRecord } from './shipmentTypes'
import { fmtDateDMY } from './format'
import { refsCliente, type RefsCliente } from './refsCliente'
import {
  estadoCliente, etiquetaEstado, proximoHito, puertoEsDestino, porUruguay,
  rutaDe, tipoDe, ESTADO_CLIENTE_ORDEN, ESTADO_CLIENTE_CLASE,
  type EstadoCliente, type HitoCliente, type Ruta, type Tipo, type LugarFoto,
} from './hoyCliente'

const ISO_RE = /^\d{4}-\d{2}-\d{2}/
const txt = (v: unknown): string => String(v ?? '').trim()
const num = (v: unknown): number => (isFinite(Number(v)) ? Number(v) : 0)
const isoDia = (v: unknown): string => {
  const s = txt(v).slice(0, 10)
  return ISO_RE.test(s) ? s : ''
}
const dmy = (v: unknown): string => {
  const iso = isoDia(v)
  return iso ? fmtDateDMY(iso) : ''
}
const ops = (s: ParsedShipment | null | undefined): OperativasRecord[] =>
  ((s?.operativas || []) as OperativasRecord[]).filter(Boolean)

const esLcl = (s: ParsedShipment | null | undefined): boolean => tipoDe(s) === 'lcl'

// ── Cuántos contenedores tiene la carga ───────────────────────────────────

/**
 * Los contenedores de la carga, contados de la lista REAL.
 *
 * Primero lo que ya derivó el server (`N` / `calculatedN`, que salen de
 * `cantidadContenedores`); si viene en cero —datos que no pasaron por el
 * endpoint del cliente: la vista previa del admin, /ui— se cuentan los
 * distintos entre `CNTR`, `containers[]` y `operativas[].CNTR_OP`, con la
 * MISMA regla que el server.
 *
 * Una LCL no tiene contenedor propio: ahí el 0 es la verdad y se respeta.
 */
export function contenedoresCarga(s: ParsedShipment | null | undefined): number {
  if (!s) return 0
  if (esLcl(s)) return 0
  const declarado = Math.max(num(s.N), num(s.calculatedN))
  if (declarado > 0) return declarado
  const distintos = new Set<string>()
  for (const c of txt(s.CNTR).split(/[\s,]+/)) if (c) distintos.add(c.toUpperCase())
  for (const c of s.containers || []) {
    const n = txt(c?.number).replace(/\s+/g, '').toUpperCase()
    if (n) distintos.add(n)
  }
  for (const o of ops(s)) {
    const n = txt(o.CNTR_OP).replace(/\s+/g, '').toUpperCase()
    if (n) distintos.add(n)
  }
  return distintos.size
}

/** "2 contenedores" · "Carga consolidada" (LCL) · "Contenedor a asignar"
 *  cuando todavía no hay ninguno. Nunca "0 contenedor(es)". */
export function textoContenedores(s: ParsedShipment | null | undefined): string {
  if (esLcl(s)) return 'Carga consolidada'
  const n = contenedoresCarga(s)
  if (n === 0) return 'Contenedor a asignar'
  return n === 1 ? '1 contenedor' : `${n} contenedores`
}

// ── La fila de "Mis cargas" (D4) ──────────────────────────────────────────

export interface FilaCargaCliente {
  /** `shipment.REF`: la clave interna (anclas, keys de React). No se muestra. */
  ref: string
  /** Cómo se nombra la carga para ESTE cliente (D2). */
  refs: RefsCliente
  estado: EstadoCliente
  /** La etiqueta del estado, ya sabiendo si la carga entra por Montevideo. */
  etiqueta: string
  /** Clases del chip de estado (las mismas que las cards de HOY). */
  claseEstado: string
  ruta: Ruta
  tipo: Tipo
  /** Qué es la carga ("MOTOPARTES"), o el buque si no hay descripción. */
  descripcion: string
  buque: string
  /** Depósito fiscal / puerto de destino, cuando está cargado. */
  destino: string
  contenedores: number
  /** "2 contenedores" / "Carga consolidada". */
  textoContenedores: string
  /** Lo único que va a la derecha: el próximo hito, siempre el mismo por estado. */
  hito: HitoCliente
}

/** Todo lo que necesita una fila de la lista (y del historial: la misma fila). */
export function filaCargaCliente(s: ParsedShipment, hoyISO: string, nombreCliente = ''): FilaCargaCliente {
  const estado = estadoCliente(s, hoyISO)
  const lista = ops(s)
  const destino = txt(lista.find(o => txt(o.FISCAL))?.FISCAL) || (porUruguay(s) ? '' : txt(s.POD))
  return {
    ref: txt(s.REF),
    refs: refsCliente(s, nombreCliente),
    estado,
    etiqueta: etiquetaEstado(s, estado),
    claseEstado: ESTADO_CLIENTE_CLASE[estado],
    ruta: rutaDe(s),
    tipo: tipoDe(s),
    descripcion: txt(lista.find(o => txt(o.DESCRIPCION))?.DESCRIPCION),
    buque: txt(s.BUQUE),
    destino,
    contenedores: contenedoresCarga(s),
    textoContenedores: textoContenedores(s),
    hito: proximoHito(s, hoyISO),
  }
}

// ── La línea de tiempo de la ficha (D5) ───────────────────────────────────

export interface PasoLinea {
  estado: EstadoCliente
  /** El nombre del paso, en el vocabulario del cliente. */
  label: string
  /** dd/mm/yyyy cuando se sabe; '' si no. */
  fecha: string
  /** "Pendiente", "Estimado", "Contenedor devuelto"… */
  detalle: string
  /** El paso ya ocurrió (o está ocurriendo). */
  alcanzado: boolean
  /** Es el estado de HOY: el que se pinta fuerte. */
  actual: boolean
}

const minIso = (vals: unknown[]): string => vals.map(isoDia).filter(Boolean).sort()[0] || ''
const maxIso = (vals: unknown[]): string => vals.map(isoDia).filter(Boolean).sort().pop() || ''

/** La fecha en que la carga entra (o va a entrar) en cada estado. */
function fechaDelPaso(s: ParsedShipment, paso: EstadoCliente): string {
  const lista = ops(s)
  switch (paso) {
    case 'por_embarcar': return ''
    case 'embarcada': return isoDia(s.ETD)
    case 'en_montevideo': return isoDia(s.ETA)
    case 'en_camino': return minIso(lista.map(o => o.SALIDA))
    case 'en_deposito': return puertoEsDestino(s) ? isoDia(s.ETA) : maxIso(lista.map(o => o.ETA_FISC))
    case 'entregada': return ''
  }
}

/**
 * La línea de tiempo de la carga, derivada de `estadoCliente`.
 *
 * Los pasos que no aplican no se dibujan: una carga a Chile o a Buenos Aires
 * sin tramo terrestre nunca pasa por "En Montevideo" ni "En camino"
 * (`puertoEsDestino`), y marcarlos como pendientes —o peor, como alcanzados—
 * sería mentirle al cliente sobre dónde está su carga.
 */
export function lineaTiempoCliente(s: ParsedShipment, hoyISO: string): PasoLinea[] {
  const actual = estadoCliente(s, hoyISO)
  const iActual = ESTADO_CLIENTE_ORDEN.indexOf(actual)
  const directa = puertoEsDestino(s)
  const pasos = ESTADO_CLIENTE_ORDEN.filter(
    p => !(directa && (p === 'en_montevideo' || p === 'en_camino')),
  )
  return pasos.map(paso => {
    const i = ESTADO_CLIENTE_ORDEN.indexOf(paso)
    const alcanzado = i <= iActual
    const iso = fechaDelPaso(s, paso)
    return {
      estado: paso,
      label: etiquetaEstado(s, paso),
      fecha: iso ? fmtDateDMY(iso) : '',
      // Una fecha en un paso que TODAVÍA no pasó es una estimación, y se dice:
      // si no, el cliente lee "En camino · 04/09" y entiende que ya salió.
      detalle: alcanzado ? '' : (iso ? 'Estimado' : 'Pendiente'),
      alcanzado,
      actual: paso === actual,
    }
  })
}

// ── Los datos de la carga (pestaña Resumen) ───────────────────────────────

export interface DatoFicha { label: string; valor: string }

/**
 * Los datos que el cliente puede ver de su carga. Lo que NO está acá está a
 * propósito: "Libre" (cuándo devolvemos el vacío) y el transporte son datos
 * nuestros; los montos ni siquiera viajan al navegador (whitelist del server).
 */
export function datosFicha(s: ParsedShipment): DatoFicha[] {
  const lista = ops(s)
  const suma = (campo: 'PKGS' | 'KG' | 'M3'): number => lista.reduce((t, o) => t + num(o[campo]), 0)
  const uy = porUruguay(s)
  const pares: DatoFicha[] = [
    { label: 'Carga', valor: txt(lista.find(o => txt(o.DESCRIPCION))?.DESCRIPCION) },
    { label: 'Contenedores', valor: textoContenedores(s) },
    { label: 'Bultos', valor: suma('PKGS') ? String(suma('PKGS')) : '' },
    { label: 'Peso', valor: suma('KG') ? `${suma('KG').toLocaleString('es-UY')} kg` : '' },
    { label: 'Volumen', valor: suma('M3') ? `${suma('M3').toLocaleString('es-UY')} m³` : '' },
    { label: 'Buque', valor: txt(s.BUQUE) },
    { label: 'Naviera', valor: txt(s.LINEA) },
    { label: 'Origen', valor: txt(s.POL) },
    { label: 'Zarpe', valor: dmy(s.ETD) },
    { label: uy ? 'Llegada a Montevideo' : 'Llegada a destino', valor: dmy(s.ETA) },
    { label: 'Terminal', valor: txt(s.TERMINAL) },
    { label: 'Depósito', valor: txt(lista.find(o => txt(o.DEPOSITO))?.DEPOSITO) },
    { label: 'Destino final', valor: txt(lista.find(o => txt(o.FISCAL))?.FISCAL) },
  ]
  return pares.filter(p => p.valor)
}

// ── Los contenedores, uno por uno (pestaña Resumen) ───────────────────────

export interface ContenedorCliente {
  numero: string
  tipo: string
  /** Estado de ESE contenedor, en el mismo vocabulario que la carga. */
  etiqueta: string
  claseEstado: string
  salida: string
  llegada: string
}

/**
 * Cada contenedor con su estado propio. El estado sale de `estadoCliente`
 * corriendo sobre esa sola operativa: así un contenedor que ya llegó y otro
 * que todavía no salió no se dicen con dos vocabularios distintos.
 */
export function contenedoresDeCarga(s: ParsedShipment, hoyISO: string): ContenedorCliente[] {
  return ops(s).map((o, i) => {
    const sola = { ...s, operativas: [o] } as ParsedShipment
    const estado = estadoCliente(sola, hoyISO)
    return {
      numero: txt(o.CNTR_OP) || (txt((o as { CAMION?: string }).CAMION) ? `Camión ${txt((o as { CAMION?: string }).CAMION)}` : `Bulto ${i + 1}`),
      tipo: txt(o.TIPO),
      etiqueta: etiquetaEstado(sola, estado),
      claseEstado: ESTADO_CLIENTE_CLASE[estado],
      salida: dmy(o.SALIDA),
      llegada: dmy(o.ETA_FISC),
    }
  })
}

// ── Fotos e informes de la carga (pestañas Fotos / Informes) ──────────────

/** Una sola definición: la canónica vive en `hoyCliente` (que es de quien
 *  depende este archivo), acá se re-exporta para no partirla en dos. */
export type { LugarFoto }

interface FotoMin {
  id?: string
  shipmentRef?: string | null
  photoType?: string | null
  createdAt?: number | null
  /** URL firmada de la miniatura (fotos ya migradas a Storage). */
  thumbnailUrl?: string | null
  /** El base64 viejo, de las que todavía no se migraron. */
  thumbnailData?: string | null
}

export interface GrupoFotos<T> {
  /** Clave estable para React: lugar + día. */
  clave: string
  lugar: LugarFoto
  /** "Carga en origen" · "Operativa en Montevideo". */
  titulo: string
  fecha: string
  fotos: T[]
}

const TITULO_LUGAR: Record<LugarFoto, string> = {
  origen: 'Carga en origen',
  uruguay: 'Operativa en Montevideo',
}

const mismaRef = (a: unknown, b: unknown): boolean =>
  txt(a).toUpperCase() === txt(b).toUpperCase()

/**
 * Dónde se sacó una foto. `photo_type` es texto libre en la base (lo escribe
 * el que sube), así que la regla es la del server: lo que no dice "uruguay"
 * es de origen. Una sola función, porque agrupar y armar la tira de
 * miniaturas tienen que coincidir o el cliente ve tres fotos en el aviso y
 * cuatro en la ficha.
 */
export function lugarDeFoto(f: { photoType?: string | null } | null | undefined): LugarFoto {
  return txt(f?.photoType).toLowerCase() === 'uruguay' ? 'uruguay' : 'origen'
}

/** dd/mm/yyyy de un timestamp, en la hora del que mira. */
export function fechaDeSubida(ts: unknown): string {
  const n = Number(ts)
  if (!isFinite(n) || n <= 0) return ''
  const d = new Date(n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** Clave de orden: el día de la subida, comparable como texto (yyyy-mm-dd). */
const diaDeSubida = (ts: unknown): string => {
  const f = fechaDeSubida(ts)
  return f ? f.split('/').reverse().join('-') : ''
}

/**
 * Las fotos de una carga, agrupadas por LUGAR y día: "Carga en origen ·
 * 28/08" arriba de sus fotos. Lo más nuevo primero, que es lo que el cliente
 * viene a mirar.
 */
export function agruparFotosPorLugar<T extends FotoMin>(fotos: T[], ref: string): GrupoFotos<T>[] {
  const mias = (fotos || []).filter(f => mismaRef(f?.shipmentRef, ref))
  const grupos = new Map<string, { lugar: LugarFoto; dia: string; fotos: T[] }>()
  for (const f of mias) {
    const lugar = lugarDeFoto(f)
    const dia = diaDeSubida(f?.createdAt)
    const clave = `${lugar}|${dia}`
    const g = grupos.get(clave) || { lugar, dia, fotos: [] }
    g.fotos.push(f)
    grupos.set(clave, g)
  }
  return [...grupos.entries()]
    .map(([clave, g]) => ({
      clave,
      lugar: g.lugar,
      titulo: TITULO_LUGAR[g.lugar],
      fecha: g.dia ? fmtDateDMY(g.dia) : '',
      fotos: g.fotos.slice().sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0)),
    }))
    .sort((a, b) => b.clave.split('|')[1].localeCompare(a.clave.split('|')[1]) || a.lugar.localeCompare(b.lugar))
}

interface InformeMin {
  id?: string
  shipmentRef?: string | null
  createdAt?: number | null
}

// ── Miniaturas en el aviso de HOY (spec 04/09, D3) ───────────────────────

/**
 * Cuántas miniaturas entran en una fila de "Novedades de tus cargas".
 *
 * Brian (04/09): "que aparezca miniatura de las fotos al mostrar el aviso de
 * la carga de hoy". Cuatro es lo que entra en el ancho de un celular sin que
 * la foto quede del tamaño de una estampilla; el resto se dice con "+N".
 */
export const MAX_MINIATURAS = 4

/**
 * Todas las fotos de una carga, la más nueva primero: es LA galería que abre
 * el visor cuando el cliente toca una miniatura. Con `lugar`, solo las de ese
 * lugar (que es lo que anuncia la fila: "3 fotos en depósito GODILCO"); con
 * `ids`, solo esas — que es como una fila de novedades le pasa SU ventana sin
 * que acá adentro haya que saber nada de fechas.
 */
export function galeriaDeCarga<T extends FotoMin>(
  fotos: T[], ref: string, lugar?: LugarFoto, ids?: readonly string[] | null,
): T[] {
  const soloEstas = ids ? new Set(ids.map(i => txt(i)).filter(Boolean)) : null
  return (fotos || [])
    .filter(f => mismaRef(f?.shipmentRef, ref)
      && (!lugar || lugarDeFoto(f) === lugar)
      && (!soloEstas || soloEstas.has(txt(f?.id))))
    .slice()
    .sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0))
}

/** Lo que una fila de novedades (`hoyCliente.novedadesCliente`) le dice a la
 *  galería: qué carga, de qué lugar, y CUÁLES fotos contó. */
export interface FuenteNovedad {
  ref: string
  lugarFoto: LugarFoto | null
  fotoIds: string[]
}

/**
 * Las fotos que ANUNCIA una fila de novedades: las de esa carga, ese lugar y
 * esa ventana. Es la lista que dibuja la tira y la que recorre el visor: una
 * sola, para que el texto y lo que se ve no puedan discrepar.
 *
 * Antes la tira volvía a decidir sola —todas las de la carga y el lugar, sin
 * fecha— y el endpoint manda el historial completo: una carga con 1 foto de
 * esta semana y 7 del mes pasado decía "1 foto en depósito GODILCO" y abajo
 * dibujaba 4 miniaturas y un "+4".
 */
export function galeriaDeNovedad<T extends FotoMin>(fotos: T[], n: FuenteNovedad): T[] {
  return galeriaDeCarga(fotos, n.ref, n.lugarFoto ?? undefined, n.fotoIds)
}

export interface TiraMiniaturas<T> {
  /** Las que se dibujan (hasta `max`). */
  visibles: T[]
  /** Cuántas quedaron afuera: el "+N". 0 = no va el "+N". */
  mas: number
  /** Cuántas de las que anunció la fila se pueden dibujar. */
  total: number
  /** La primera que NO entró: es donde abre el visor al tocar el "+N", así el
   *  cliente sigue justo donde la tira se cortó. null si entraron todas. */
  siguiente: T | null
}

/**
 * La fuente con la que se dibuja una miniatura: la URL firmada, o el base64
 * viejo de las fotos que todavía no se migraron a Storage. '' = no hay nada
 * que dibujar.
 */
export const fuenteMiniatura = (f: FotoMin | null | undefined): string =>
  String(f?.thumbnailUrl || f?.thumbnailData || '')

/** ¿Se puede DIBUJAR como miniatura? Una foto vieja sin migrar no tiene:
 *  el visor la abre igual (pide el full al server), pero en la tira no va. */
export const sePuedeDibujar = (f: FotoMin | null | undefined): boolean =>
  fuenteMiniatura(f) !== ''

/**
 * La tira de miniaturas de una fila de novedades: hasta `max` fotos y el "+N"
 * con lo que no entró.
 *
 * Recibe la galería YA DECIDIDA (`galeriaDeNovedad`). Acá no se elige qué
 * fotos son —eso lo decidió la fila, que es la que puso el texto—: solo
 * cuántas entran. Sin fotos la tira sale vacía y la fila sigue siendo la de
 * antes (texto + fecha): nunca un hueco.
 *
 * `visibles` y el "+N" se deciden sobre las que SE PUEDEN DIBUJAR. Antes se
 * contaban sobre la lista cruda y el componente descartaba las que no tenían
 * miniatura recién al pintar: salían dos miniaturas y un "+5", y si las
 * primeras cuatro eran viejas sin migrar la tira desaparecía entera —"+N"
 * incluido— porque no quedaba ninguna imagen que dibujar.
 */
export function tiraDeMiniaturas<T extends FotoMin>(
  galeria: T[], max = MAX_MINIATURAS,
): TiraMiniaturas<T> {
  const todas = (galeria || []).filter(sePuedeDibujar)
  const tope = Math.max(0, Math.floor(Number(max) || 0))
  return {
    visibles: todas.slice(0, tope),
    mas: Math.max(0, todas.length - tope),
    total: todas.length,
    siguiente: todas[tope] ?? null,
  }
}

/**
 * En qué posición de la galería está una foto: el índice con el que abre el
 * visor. Si no se la encuentra abre en la primera, que es lo más nuevo — un
 * visor en blanco sería peor que uno en la foto equivocada.
 */
export function indiceEnGaleria<T extends FotoMin>(galeria: T[], id: unknown): number {
  const buscado = txt(id)
  if (!buscado) return 0
  const i = (galeria || []).findIndex(f => txt(f?.id) === buscado)
  return i >= 0 ? i : 0
}

/** Los informes de una carga, el más nuevo primero. */
export function informesDeCarga<T extends InformeMin>(informes: T[], ref: string): T[] {
  return (informes || [])
    .filter(r => mismaRef(r?.shipmentRef, ref))
    .slice()
    .sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0))
}
