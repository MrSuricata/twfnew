/**
 * Edición inline de campos faltantes — la fila de "Llegan con datos
 * incompletos" (HOY) se despliega y muestra UN input por dato faltante para
 * completarlo ahí mismo (pedido Brian 17/08), sin ir a la ficha.
 *
 * Reusa las piezas que ya gobiernan la edición de cargas:
 *  - EDITABLE_FIELDS: campo lógico → columna real de `shipments` (whitelist
 *    del PATCH) + tipo. Los campos de datosFaltantes son un subconjunto.
 *  - buildPerContainerPatch: los campos que también viven por contenedor
 *    (operativa/depósito/transporte) se propagan al array `operativas` igual
 *    que desde el panel de detalle — sin esto Agenda/HOY seguirían leyendo el
 *    valor viejo del array.
 *  - normalizeCntr/canonicalizeCliente: misma normalización que el panel —
 *    texto crudo acá generaba variantes de cliente y contenedores que no
 *    matchean (hallazgos de la revisión 17/08).
 *
 * Pura y testeable: acá se valida/normaliza y se construye el patch; el
 * componente solo dibuja inputs y llama onPatchShipment.
 */

import type { CargaCampos, CampoFaltante } from './datosFaltantes'
import { EDITABLE_FIELDS, DEPOSITOS_UY, buildPerContainerPatch, type UnifiedOperation } from './operationsTypes'
import type { OperativasRecord } from './shipmentTypes'
import { normalizeCntr, serializeCntr } from './cntrUtils'
import { canonicalizeCliente, type CatalogClient } from './clientCatalog'

/** Cómo se dibuja el input de cada campo faltante. */
export interface FaltanteInput {
  /** 'select' usa opciones fijas; 'datalist' es texto libre con sugerencias. */
  widget: 'text' | 'date' | 'number' | 'select' | 'datalist'
  opciones?: { value: string; label: string }[]
  /** Fuente de sugerencias para 'datalist' (las provee el componente). */
  sugerencias?: 'transportes' | 'agentes' | 'depositos' | 'lineas' | 'terminales' | 'devoluciones'
  placeholder?: string
}

/** Lugares de devolución del vacío más usados en plaza (medido en la DB:
 *  STL 188 · MPS 70 · TCP 25 · MURCHISON 11 · MONTECON 3). Datalist, no
 *  select: BSAS/EXOLGAN y compañía se tipean igual. */
export const DEVOLUCIONES_PLAZA = ['STL', 'MPS', 'TCP', 'MONTECON', 'MURCHISON']

/** Mismas opciones de operativa que el alta (NewShipmentDialog). */
export const OPERATIVA_OPCIONES = ['TRASIEGO', 'CONTENEDOR', 'CARGA A PISO']

export const FALTANTE_INPUTS: Partial<Record<keyof CargaCampos, FaltanteInput>> = {
  cliente: { widget: 'text', placeholder: 'Cliente' },
  clientRef: { widget: 'text', placeholder: 'ref del cliente (ej: 1410)' },
  pais: { widget: 'select', opciones: (EDITABLE_FIELDS.pais?.options ?? []).filter(o => o.value !== '') },
  eta: { widget: 'date' },
  buque: { widget: 'text', placeholder: 'BUQUE VIAJE' },
  linea: { widget: 'datalist', sugerencias: 'lineas', placeholder: 'MAERSK, ONE, HAPAG…' },
  docNumber: { widget: 'text', placeholder: 'BL / booking' },
  cntr: { widget: 'text', placeholder: 'MSKU1234567' },
  pkgs: { widget: 'number', placeholder: 'bultos' },
  kg: { widget: 'number', placeholder: 'kg' },
  m3: { widget: 'number', placeholder: 'm³' },
  descripcion: { widget: 'text', placeholder: 'mercadería (ej: MOTOPARTES)' },
  agente: { widget: 'datalist', sugerencias: 'agentes', placeholder: 'quién factura el flete' },
  deposito: { widget: 'datalist', sugerencias: 'depositos', placeholder: DEPOSITOS_UY[0] },
  operativa: { widget: 'select', opciones: OPERATIVA_OPCIONES.map(v => ({ value: v, label: v })) },
  transporte: { widget: 'datalist', sugerencias: 'transportes', placeholder: 'transporte' },
  fiscal: { widget: 'text', placeholder: 'destino fiscal' },
  // Terminal de llegada: hoy son dos en plaza. Datalist, no select — si algún
  // día llega una tercera, se tipea igual.
  terminal: { widget: 'datalist', sugerencias: 'terminales', placeholder: 'TCP / MONTECON' },
  dev: { widget: 'datalist', sugerencias: 'devoluciones', placeholder: 'STL / MPS / TCP…' },
  devFecha: { widget: 'date', placeholder: 'fecha confirmada por la naviera' },
}

/** Columna real de `shipments` detrás de un campo faltante (para mostrar el
 *  valor recién guardado en el chip de completado). */
export function columnaDeCampo(campo: CampoFaltante['campo']): string | null {
  return EDITABLE_FIELDS[campo as keyof UnifiedOperation]?.col ?? null
}

/** Guard de año para fechas tipeadas (mismo criterio que la grilla/Seguimientos:
 *  tipear el año dispara valores '0002-…' que ensucian la DB). */
const anioValido = (iso: string): boolean => {
  const y = Number(iso.slice(0, 4))
  return y >= 2015 && y <= 2100
}

/** '8.399' o '1.234.567' — punto de miles: ambiguo, no se adivina. */
const MILES_CON_PUNTO = /^\d{1,3}(\.\d{3})+(,\d+)?$/

export type FaltantePatch =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; error: string }

/**
 * Valida el valor tipeado y arma el patch listo para onPatchShipment.
 * `operativas` es el array por contenedor de la fila (para propagar los campos
 * que también viven ahí); `clientes` es el catálogo para canonicalizar el
 * cliente tipeado (misma regla que el panel de detalle).
 */
export function buildFaltantePatch(
  campo: CampoFaltante['campo'],
  crudo: string,
  operativas?: OperativasRecord[] | null,
  clientes?: CatalogClient[],
): FaltantePatch {
  const spec = EDITABLE_FIELDS[campo as keyof UnifiedOperation]
  if (!spec) return { ok: false, error: `Campo sin edición inline: ${String(campo)}` }
  const texto = crudo.trim()
  if (!texto) return { ok: false, error: 'Vacío' }

  // Contenedor: el rollup (cliente y server) recomputa la columna `contenedor`
  // desde los CNTR_OP del array en CUALQUIER patch que traiga `operativas` —
  // escribir solo la columna hacía que el siguiente campo completado la
  // borrara (hallazgo bloqueante de la revisión 17/08; mismo bug que resuelve
  // reconcileOperativasToCntrs en el panel). Acá: normalizar cada contenedor
  // (sin espacios internos, MAYÚSCULAS) y sembrar CNTR_OP índice a índice,
  // con la columna = exactamente lo que el rollup va a recomputar.
  if (campo === 'cntr') {
    const lista = texto.split(/[,/+]/).map(normalizeCntr).filter((c): c is string => Boolean(c))
    if (!lista.length) return { ok: false, error: 'Contenedor vacío' }
    if (operativas && operativas.length > 0) {
      const arr = operativas.map((o, i) => ({ ...o, CNTR_OP: lista[i] ?? String(o.CNTR_OP ?? '') }))
      for (let i = operativas.length; i < lista.length; i++) {
        // El clon hereda deposito/operativa/fechas del primero, pero NO sus
        // bultos/kg/m3: el rollup SUMA el array, asi que clonarlos duplicaria
        // el total de la carga con cada contenedor agregado.
        arr.push({ ...operativas[0], CNTR_OP: lista[i], PKGS: 0, KG: 0, M3: 0 })
      }
      // La columna se calcula EXACTAMENTE como el rollup (cliente y server) para
      // que el valor optimista no difiera del que persiste el server.
      const columna = arr.map(o => o.CNTR_OP).filter(Boolean).join(', ')
      return { ok: true, patch: { contenedor: columna, operativas: arr } }
    }
    return { ok: true, patch: { contenedor: serializeCntr(lista) } }
  }

  let valor: unknown = texto
  if (campo === 'pkgs' || campo === 'kg' || campo === 'm3') {
    // Coma decimal uruguaya ("8399,75") → punto. El punto de miles ("8.399")
    // se rechaza: Number lo leería como 8,399 y guardaría un valor 1000x menor.
    if (MILES_CON_PUNTO.test(texto)) return { ok: false, error: 'Sin punto de miles (usá 8399,75)' }
    const n = Number(texto.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'Número inválido' }
    // Bultos enteros: validar sobre el valor FINAL (0,4 redondeaba a 0 y el
    // faltante nunca se limpiaba — hallazgo de la revisión).
    const final = campo === 'pkgs' ? Math.round(n) : n
    if (final <= 0) return { ok: false, error: 'Número inválido' }
    // Con UN solo contenedor, el peso/bultos/volumen de la carga ES el de ese
    // contenedor: escribirlo también en el array evita que el rollup del
    // siguiente patch recompute la columna desde el array viejo y pise el
    // valor recién tipeado (mismo modo de falla que el contenedor).
    if (operativas && operativas.length === 1) {
      const opField = campo === 'pkgs' ? 'PKGS' : campo === 'kg' ? 'KG' : 'M3'
      return {
        ok: true,
        patch: { [spec.col]: final, operativas: [{ ...operativas[0], [opField]: final }] },
      }
    }
    valor = final
  } else if (campo === 'eta' || campo === 'devFecha') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto) || !anioValido(texto)) {
      return { ok: false, error: 'Fecha inválida' }
    }
  } else if (campo === 'cliente') {
    // Misma regla que el panel: el texto libre se canonicaliza contra el
    // catálogo ('peretti' → 'BICI PERETTI S.A.') para no crear variantes.
    valor = canonicalizeCliente(texto, clientes ?? [])
  } else if (campo === 'buque' || campo === 'linea' || campo === 'deposito' || campo === 'transporte' || campo === 'fiscal' || campo === 'dev' || campo === 'descripcion') {
    // dev en MAYÚSCULAS: empresaRubro/costoDevDefault comparan contra STL/MPS.
    // descripcion también: todo el histórico de la planilla vino en mayúsculas.
    valor = texto.toUpperCase()
  }

  const op: Pick<UnifiedOperation, 'operativas'> = { operativas: operativas ?? undefined }
  return { ok: true, patch: buildPerContainerPatch(op, spec.col, valor) }
}
