// ContainerQuickEdit — modal de cambios rápidos de UN contenedor.
// Salida MVD + Arribo fiscal + Lugar + Transporte + el botón "Devuelto".
// El botón "Más datos →" abre el panel completo.
//
// Piel: la común de los portales (partner/PanelCard) — rediseño 04/09, D6.
// Header tintado por el micro-estado, `Dato` para lo de solo lectura, cero hex
// sueltos (los colores salen de los tonos, que ya son brand-aware).
//
// ⚠️ EL GUARDADO NO SE TOCA. `commitSave` (orden de operaciones, guard
// anti doble-save, propagación nivel-carga) es delicado y está cubierto por el
// DnD de la Agenda: acá cambió la cáscara, no el guardado.

import { useState, useRef, type ReactNode } from 'react'
import { ShippingContainer } from '@phosphor-icons/react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import PanelCard, { Chip, Dato, clasesTono, type TonoPanel } from '@/components/partner/PanelCard'
import { useBrand } from '@/lib/brand'
import type { ParsedShipment, OperativasRecord } from '@/lib/shipmentTypes'
import { getShipmentStatus } from '@/lib/shipmentTypes'
import { buildPerContainerPatch, applyLugarSalida, lugarOrDeposito } from '@/lib/operationsTypes'
import { isSalidaBeforeArrival, avisoSalida, fmtDMY, etaVigente } from '@/lib/salidaCheck'
import { reglaSalidaAntesDeLlegada, reglaSugerirEtaFiscal, reglaSinTelex } from '@/lib/quickEditReglas'
import LibreDevueltoBlock, { toggleLibreDevuelto } from './LibreDevueltoBlock'

// ─── Lugar options (mirrors ContainerDatesSection) ────────────────────────

const LUGAR_OPTIONS = [
  { value: '', label: '— en terminal —' },
  { value: 'TCP', label: 'TCP' },
  { value: 'MONTECON', label: 'MONTECON' },
  { value: 'GODILCO', label: 'GODILCO' },
  { value: 'PLANIR', label: 'PLANIR' },
]

// ─── Local save-array helper ──────────────────────────────────────────────

/**
 * Builds the updated operativas array patching only the container matching
 * `cntr` by CNTR_OP. Does not require a UnifiedOperation — works from the
 * ParsedShipment directly, preserving all other records untouched.
 *
 * If no record exists for `cntr` a new minimal record is appended.
 * This mirrors the CNTR_OP-first approach of resolveRecord/buildNextOperativas
 * from ContainerDatesSection without needing a UnifiedOperation.
 */
export function buildPatchedOperativas(
  shipment: ParsedShipment,
  cntr: string,
  patch: Partial<Pick<OperativasRecord, 'SALIDA' | 'ETA_FISC' | 'LUGAR_SALIDA' | 'LIBRE'>>
): OperativasRecord[] {
  const existing = shipment.operativas || []
  const key = cntr.trim().toUpperCase()
  const matched = existing.find(r => (r.CNTR_OP || '').trim().toUpperCase() === key)

  if (matched) {
    return existing.map(r =>
      (r.CNTR_OP || '').trim().toUpperCase() === key
        ? { ...r, ...patch }
        : r
    )
  }

  // No existing record for this container — append a new minimal one
  const newRecord: OperativasRecord = {
    REF: shipment.REF,
    TLX: '',
    DEPOSITO: '',
    ETA_OP: shipment.ETA || '',
    SALIDA: '',
    ETA_FISC: '',
    LIBRE: shipment.calculatedLibreHasta || '',
    OPERATIVA: '',
    CNTR_OP: cntr,
    PKGS: 0,
    KG: 0,
    M3: 0,
    DESCRIPCION: '',
    FISCAL: '',
    DESCARGA: '',
    DEV: '',
    CLIENTE_OP: shipment.CLIENTE || '',
    TIPO: shipment.TIPO || '',
    WOOD: '',
    TRANSPORTE: '',
    HORARIO: '',
    LUGAR_SALIDA: '',
    ...patch,
  }
  return [...existing, newRecord]
}

// ─── Micro-status for a single container ─────────────────────────────────

function containerMicroStatus(shipment: ParsedShipment, op: OperativasRecord): string {
  const mini: ParsedShipment = {
    ...shipment,
    operativas: [op],
  }
  return getShipmentStatus(mini).label
}

// ─── Piel: tono de la card + fila de campo ───────────────────────────────

/**
 * El color de la card según el micro-estado del contenedor. Reemplaza al viejo
 * `statusBadgeClass`, que traía su propia paleta: ahora el color lo resuelve la
 * piel común (`clasesTono`), que ya sale bien en TWF y en Mediterránea. Los
 * casos son los MISMOS que antes; solo cambia de qué escala salen.
 */
function tonoDeEstado(label: string): TonoPanel {
  const l = label.toLowerCase()
  if (l.includes('fiscal') || l.includes('devuelto')) return 'ok'
  if (l.includes('hoy') || l.includes('salió')) return 'info'
  if (l.includes('frontera')) return 'aviso'
  if (l.includes('embarcado') || l.includes('viaje')) return 'info'
  return 'neutro'
}

/** El control de los campos editables. `ring` en vez del azul hardcodeado:
 *  bajo Mediterránea el foco sale violeta sin tocar nada acá. */
const CLASE_CONTROL = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50 transition-shadow'

/**
 * Una fila de campo del modal, con el mismo aire que las filas de PanelCard.
 *  · Editable: etiqueta arriba (ligada al control por `htmlFor`) + el control.
 *  · Solo lectura: el `Dato` de la piel común — etiqueta y valor en una línea.
 * `pie` es el aviso de abajo (p. ej. salida anterior a la llegada): se muestra
 * en los dos modos, igual que antes.
 */
function CampoFila({ label, id, editable, valor, pie, children }: {
  label: string
  id: string
  editable: boolean
  valor: ReactNode
  pie?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="px-4 py-3 flex flex-col gap-1.5">
      {editable ? (
        <>
          <label htmlFor={id} className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
            {label}
          </label>
          {children}
        </>
      ) : (
        <Dato label={label} fuerte>{valor}</Dato>
      )}
      {pie}
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────

export interface ContainerQuickEditProps {
  shipment: ParsedShipment
  cntr: string
  editable: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Transportes ya usados en las cargas → sugerencias del combo Transporte. */
  knownTransportes?: string[]
  onPatch: (dbId: string, fields: Record<string, unknown>) => void | Promise<void>
  onMasDatos: () => void
}

// ─── Component ────────────────────────────────────────────────────────────

export default function ContainerQuickEdit({
  shipment,
  cntr,
  editable,
  open,
  onOpenChange,
  knownTransportes = [],
  onPatch,
  onMasDatos,
}: ContainerQuickEditProps) {
  // La marca decide de qué escala salen los tonos de la piel (TWF / Med).
  const med = useBrand().id === 'med'
  // Resolve the current op for this container
  const existing = shipment.operativas || []
  const key = cntr.trim().toUpperCase()
  const currentOp: OperativasRecord = existing.find(
    r => (r.CNTR_OP || '').trim().toUpperCase() === key
  ) ?? {
    REF: shipment.REF,
    TLX: '', DEPOSITO: '', ETA_OP: shipment.ETA || '',
    SALIDA: '', ETA_FISC: '', LIBRE: shipment.calculatedLibreHasta || '',
    OPERATIVA: '', CNTR_OP: cntr, PKGS: 0, KG: 0, M3: 0, DESCRIPCION: '',
    FISCAL: '', DESCARGA: '', DEV: '', CLIENTE_OP: shipment.CLIENTE || '',
    TIPO: shipment.TIPO || '', WOOD: '', TRANSPORTE: '', HORARIO: '',
    LUGAR_SALIDA: '',
  }

  // Draft state for date inputs (commit on blur/Enter)
  // LIBRE se movió a "Datos clave de la carga" (ViabilityBlock): es dato de la
  // carga, se edita a nivel carga y propaga a todos los contenedores. Acá el
  // quick-edit toca salida / arribo fiscal / lugar (por contenedor) + transporte
  // y el botón "Devuelto" sobre LIBRE (nivel-carga: ambos propagan a todos los
  // contenedores vía buildPerContainerPatch).
  const [drafts, setDrafts] = useState<{ salida: string; etaFisc: string }>({
    salida: currentOp.SALIDA || '',
    etaFisc: currentOp.ETA_FISC || '',
  })
  // Lugar EFECTIVO: si el guardado está vacío, mostrar el DEPÓSITO ("manda
  // Depósito UY" — bug 10/07: el quick-edit decía "— en terminal —" con el
  // depósito PLANIR/GODILCO cargado). Default de lectura: entra a los datos
  // recién cuando el usuario edita algo (commitSave lo lleva en el patch).
  const lugarEfectivo = lugarOrDeposito(currentOp.LUGAR_SALIDA, currentOp.DEPOSITO)
  const [lugar, setLugar] = useState<string>(lugarEfectivo)
  // Transporte es dato de la CARGA: valor actual = el del contenedor o, si está
  // vacío, el primero no-vacío del array (misma semántica firstWith del rollup).
  const normTrans = (s: string) => s.trim().toUpperCase()
  const initialTransporte = normTrans(
    currentOp.TRANSPORTE || existing.find(o => o.TRANSPORTE)?.TRANSPORTE || ''
  )
  const [transporte, setTransporte] = useState<string>(initialTransporte)
  // LIBRE es nivel-carga (la FECHA se edita en Datos clave del panel; acá solo
  // display + botón "Devuelto"). Valor GUARDADO = columna LIBRE_HASTA o primera
  // operativa con LIBRE (mismo rollup firstWith de dbShipmentToOperation).
  // calculatedLibreHasta es solo display de respaldo — NO es el valor que
  // restaura "Deshacer" (ese debe ser el guardado exacto: fecha o vacío).
  const storedLibre = shipment.LIBRE_HASTA ||
    (existing.find(o => (o.LIBRE || '').trim())?.LIBRE || '')
  const [libreVal, setLibreVal] = useState<string>(storedLibre)
  const [saving, setSaving] = useState(false)

  // Fix 2: guard against double-save (Enter+blur fires two commitSave calls).
  // We track the last-committed serialized value; commitSave is a no-op when
  // nothing changed since the last successful persist.
  // Init to the CURRENT values so a blur without edits (e.g. clicking from the
  // auto-focused Salida MVD to another field) is a true no-op — no spurious patch.
  const lastCommittedRef = useRef<string>(
    JSON.stringify({
      salida: currentOp.SALIDA || '',
      etaFisc: currentOp.ETA_FISC || '',
      // Mismo valor EFECTIVO que el estado inicial: un blur sin ediciones sigue
      // siendo no-op (el default de lectura no dispara un patch espurio).
      lugar: lugarEfectivo,
      transporte: initialTransporte,
      libre: storedLibre,
    })
  )

  const canSave = editable && !!shipment.__dbId
  // Llegada de la carga a MVD para este contenedor (per-op, si no la de la carga).
  const etaArrival = etaVigente(shipment.ETA, currentOp.ETA_OP)

  /**
   * Commit the current draft values to the DB.
   * Accepts explicit overrides so the lugar onChange can pass the NEW lugar
   * value before the useState update has settled (Fix 3).
   * Returns early if nothing changed since the last commit (Fix 2).
   */
  const commitSave = async (
    overrides?: { salida?: string; etaFisc?: string; lugar?: string; transporte?: string; libre?: string }
  ) => {
    if (!canSave) return
    const salida = overrides?.salida ?? drafts.salida
    const etaFisc = overrides?.etaFisc ?? drafts.etaFisc
    const lugarVal = overrides?.lugar ?? lugar
    const transVal = normTrans(overrides?.transporte ?? transporte)
    const libreV = overrides?.libre ?? libreVal
    const serialized = JSON.stringify({ salida, etaFisc, lugar: lugarVal, transporte: transVal, libre: libreV })
    if (serialized === lastCommittedRef.current) return // no change → skip
    // Las tres preguntas (salida antes de la llegada, sugerencia de fiscal,
    // sin telex) las decide quickEditReglas.ts — acá solo se pregunta.
    // Regla 1: solo al COORDINAR la salida (cuando la fecha CAMBIÓ): no puede
    // ser anterior a la llegada a MVD. Editar arribo/lugar con una salida ya
    // puesta NO vuelve a preguntar.
    let prevSalida = ''
    try { prevSalida = (JSON.parse(lastCommittedRef.current).salida as string) || '' } catch { /* sin commit previo */ }
    const antes = reglaSalidaAntesDeLlegada({ salida, prevSalida, etaLlegada: etaArrival })
    if (antes.preguntar && !window.confirm(antes.mensaje)) {
      setDrafts(d => ({ ...d, salida: prevSalida })) // revertir a la última salida confirmada, no guardar
      return
    }
    // Regla 2: salida movida SIN tocar el fiscal en este commit → ofrecer la
    // llegada normal del tránsito (salida+2, finde → lunes; regla Brian 13/08).
    let etaFiscFinal = etaFisc
    let prevEtaFisc = ''
    try { prevEtaFisc = (JSON.parse(lastCommittedRef.current).etaFisc as string) || '' } catch { /* sin commit previo */ }
    const sugerencia = reglaSugerirEtaFiscal({ salida, prevSalida, etaFisc, prevEtaFisc })
    if (sugerencia.preguntar && window.confirm(sugerencia.mensaje)) {
      etaFiscFinal = sugerencia.sugerida
      setDrafts(d => ({ ...d, etaFisc: sugerencia.sugerida }))
    }
    const serializedFinal = JSON.stringify({ salida, etaFisc: etaFiscFinal, lugar: lugarVal, transporte: transVal, libre: libreV })
    // Actualizar el ref ANTES del await: onPatch es optimista (revert propio en
    // el caller), y un segundo commitSave que entre durante el await (blur +
    // cierre en el mismo gesto) debe ver este commit como hecho — si no,
    // re-evalúa los prev viejos y re-pregunta la sugerencia o pisa el fiscal.
    const serializedPrevio = lastCommittedRef.current
    lastCommittedRef.current = serializedFinal
    setSaving(true)
    try {
      const next = buildPatchedOperativas(shipment, cntr, {
        SALIDA: salida,
        ETA_FISC: etaFiscFinal,
        LUGAR_SALIDA: lugarVal,
      })
      const fields: Record<string, unknown> = { operativas: next }
      // Transporte es nivel-carga: si cambió, propagar a TODOS los contenedores
      // + la columna rollup (REGLA: buildPerContainerPatch — el server NO
      // recalcula transporte desde el array). Mapea sobre `next`, así conserva
      // las fechas/lugar recién editados de este contenedor. Solo cuando cambió,
      // para que un ajuste de fechas no pise transportes distintos por contenedor
      // en datos históricos.
      let prevTrans = initialTransporte
      try { prevTrans = normTrans((JSON.parse(serializedPrevio).transporte as string) || '') } catch { /* sin commit previo */ }
      // Las propagaciones nivel-carga se ENCADENAN sobre `propagated` (no sobre
      // `next` cada una): si transporte Y libre cambian en el mismo commit, la
      // segunda debe mapear el array ya propagado por la primera o la pisa.
      let propagated = next
      if (transVal !== prevTrans) {
        const p = buildPerContainerPatch({ operativas: propagated }, 'transporte', transVal)
        propagated = (p.operativas as OperativasRecord[] | undefined) ?? propagated
        Object.assign(fields, p)
      }
      // LIBRE también es nivel-carga ('DEVUELTO' vive en LIBRE — regla del
      // repo): si cambió, propagar a TODOS los contenedores + la columna con
      // el MISMO buildPerContainerPatch, conservando las fechas/lugar recién
      // editados de este contenedor.
      let prevLibre = storedLibre
      try { prevLibre = (JSON.parse(serializedPrevio).libre as string) ?? storedLibre } catch { /* sin commit previo */ }
      if (libreV !== prevLibre) {
        const p = buildPerContainerPatch({ operativas: propagated }, 'libre', libreV)
        propagated = (p.operativas as OperativasRecord[] | undefined) ?? propagated
        Object.assign(fields, p)
      }
      // LUGAR DE SALIDA también es nivel-carga (regla Brian 07/07: "manda
      // Depósito UY"): si cambió, propagar a TODOS los contenedores; si el
      // lugar elegido es un depósito, applyLugarSalida actualiza también el
      // DEPOSITO del array (la columna deposito la materializa el rollup).
      // Solo cuando cambió, igual que transporte/libre.
      let prevLugar = currentOp.LUGAR_SALIDA || ''
      try { prevLugar = (JSON.parse(serializedPrevio).lugar as string) ?? prevLugar } catch { /* sin commit previo */ }
      if (lugarVal !== prevLugar) {
        propagated = applyLugarSalida(propagated, lugarVal)
        fields.operativas = propagated
      }
      // Regla 3: sin telex se pregunta ANTES de guardar — agendar igual es
      // una decisión.
      const telex = reglaSinTelex({ salida, prevSalida, tlx: currentOp.TLX, ref: shipment.REF, cntr: currentOp.CNTR_OP })
      if (telex.preguntar && !window.confirm(telex.mensaje)) {
        // Recommit posible: el usuario puede corregir la fecha y reintentar.
        lastCommittedRef.current = serializedPrevio
        return
      }
      await onPatch(shipment.__dbId!, fields)
      // NO cerrar al guardar: el usuario edita varios campos (salida → arribo →
      // lugar) en el mismo modal. El cierre lo manejan "Listo" y Escape. Cerrar
      // en cada commit (vía onBlur) hacía que al pasar de un campo a otro se
      // cerrara el diálogo.
    } catch (err) {
      // El patch no entró: permitir recommit. Condicional por si un commit
      // posterior ya actualizó el ref durante nuestro await — no pisarlo.
      if (lastCommittedRef.current === serializedFinal) lastCommittedRef.current = serializedPrevio
      throw err
    } finally {
      setSaving(false)
    }
  }

  // Botón rápido "Devuelto" — flujo estrella: alerta LIBRE → quick-edit →
  // un click → LIBRE='DEVUELTO' (nivel-carga) → la carga sale de las alertas.
  // Va por el MISMO commitSave (guard anti doble-save incluido); el toast
  // permite deshacer restaurando el valor EXACTO anterior (fecha o vacío,
  // capturado ANTES de pisar). Con LIBRE ya DEVUELTO, el botón pasa a
  // "Deshacer devuelto" y limpia a '' (sin toast: el cambio se ve al instante).
  const toggleDevuelto = () => {
    if (!canSave || saving) return
    // Mismo commit de siempre (`commitSave` con su guard anti doble-save); el
    // toggle, el toast y "Deshacer" viven en LibreDevueltoBlock, compartidos
    // con "Datos clave de la carga".
    void toggleLibreDevuelto(libreVal, async valor => {
      setLibreVal(valor)
      await commitSave({ libre: valor })
    })
  }

  // Al cerrar el Dialog (X / Escape / click afuera / "Listo") comitear primero
  // los borradores pendientes: el arribo fiscal / salida recién elegidos en el
  // calendario nativo NO blurean al cerrar → se perderían. commitSave ya trae el
  // guard anti doble-save (no-op si nada cambió), así que es seguro llamarlo
  // siempre. Solo propagamos el cierre; en abrir, pasa directo.
  const handleOpenChange = (o: boolean) => {
    if (!o) { void commitSave().finally(() => onOpenChange(false)); return }
    onOpenChange(o)
  }

  const status = containerMicroStatus(shipment, {
    ...currentOp,
    SALIDA: drafts.salida,
    ETA_FISC: drafts.etaFisc,
    LUGAR_SALIDA: lugar,
  })

  const lugarLabel = LUGAR_OPTIONS.find(o => o.value === lugar)?.label ?? lugar
  // Ids únicos por carga (puede haber más de un quick-edit montado): el
  // datalist del combo y los `htmlFor` de las etiquetas. Sin espacios: las
  // refs split ("A6902 A") no son un id HTML válido.
  const idBase = `qe-${(shipment.REF || 'x').replace(/\s+/g, '-')}`
  const transporteListId = `${idBase}-transportes`
  // Tono de la card = micro-estado del contenedor; el chip del header sale del
  // MISMO tono, así color y texto nunca se contradicen.
  const tono = tonoDeEstado(status)
  const clases = clasesTono(tono, med)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Sin onKeyDown propio: cada input maneja su Enter. Un handler acá
          recibía el MISMO keydown burbujeado y disparaba commitSave dos veces
          en el mismo dispatch (el guard anti doble-save aún no veía el ref
          actualizado) → doble confirm de sugerencia fiscal. */}
      {/* La cáscara del diálogo queda transparente, sin borde ni sombra: la
          superficie visible es la PanelCard de adentro (piel común), que ya
          trae su radio, su borde de color y su recorte. */}
      <DialogContent className="max-w-sm w-[calc(100%-2rem)] p-0 gap-0 border-0 bg-transparent shadow-none">
        {/* Título y descripción accesibles: el encabezado a la vista lo pinta
            PanelCard, pero Radix necesita su propio Title/Description para
            anunciar el diálogo. Van sr-only para no repetir texto en pantalla. */}
        <DialogTitle className="sr-only">
          Cambios rápidos de la carga {shipment.REF}{cntr ? ` — contenedor ${cntr}` : ''}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Salida de Montevideo, arribo fiscal, lugar de salida y transporte. Cada campo se guarda al salir de él.
        </DialogDescription>

        <PanelCard
          tono={tono}
          icono={<ShippingContainer size={18} weight="fill" />}
          titulo={shipment.REF}
          subtitulo={cntr || 'Carga sin contenedor asignado'}
          extras={
            <>
              <Chip clase={`${clases.pill} border-transparent`}>{status}</Chip>
              {/* Hueco para la X de cerrar del diálogo, que se posiciona sobre
                  la cabecera (top-4 right-4) y si no taparía el chip. */}
              <span aria-hidden className="w-4" />
            </>
          }
        >
          {/* ── Salida MVD ─────────────────────────────────────────────── */}
          <CampoFila
            label="Salida MVD"
            id={`${idBase}-salida`}
            editable={editable}
            valor={fmtDMY(drafts.salida) || '—'}
            pie={(() => {
              const aviso = avisoSalida(drafts.salida, etaArrival)
              if (!aviso) return null
              const grave = isSalidaBeforeArrival(drafts.salida, etaArrival)
              return (
                <span className={`text-xs font-medium ${grave ? 'text-red-600' : 'text-amber-600'}`}>
                  ⏰ {aviso} (llega {fmtDMY(etaArrival)})
                </span>
              )
            })()}
          >
            <input
              id={`${idBase}-salida`}
              type="date"
              value={drafts.salida}
              onChange={e => setDrafts(d => ({ ...d, salida: e.target.value }))}
              onBlur={() => void commitSave()}
              onKeyDown={e => { if (e.key === 'Enter') void commitSave() }}
              disabled={saving}
              className={CLASE_CONTROL}
            />
          </CampoFila>

          {/* ── Arribo fiscal ──────────────────────────────────────────── */}
          <CampoFila
            label="Arribo fiscal"
            id={`${idBase}-fiscal`}
            editable={editable}
            valor={fmtDMY(drafts.etaFisc) || '—'}
          >
            <input
              id={`${idBase}-fiscal`}
              type="date"
              value={drafts.etaFisc}
              onChange={e => setDrafts(d => ({ ...d, etaFisc: e.target.value }))}
              onBlur={() => void commitSave()}
              onKeyDown={e => { if (e.key === 'Enter') void commitSave() }}
              disabled={saving}
              className={CLASE_CONTROL}
            />
          </CampoFila>

          {/* ── Lugar de salida ────────────────────────────────────────── */}
          <CampoFila
            label="Lugar de salida"
            id={`${idBase}-lugar`}
            editable={editable}
            valor={lugarLabel || '—'}
          >
            <select
              id={`${idBase}-lugar`}
              value={lugar}
              onChange={e => {
                const newLugar = e.target.value
                setLugar(newLugar)
                // Fix 3: pass the new lugar explicitly so commitSave reads
                // the just-typed draft dates (not a stale closure snapshot).
                void commitSave({ lugar: newLugar })
              }}
              disabled={saving || !shipment.__dbId}
              className={CLASE_CONTROL}
            >
              {LUGAR_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
              {/* Depósito fuera de la lista fija (ej. LOBRAUS) → opción dinámica */}
              {lugar && !LUGAR_OPTIONS.some(o => o.value === lugar) && (
                <option value={lugar}>{lugar}</option>
              )}
            </select>
          </CampoFila>

          {/* ── Transporte — dato de la CARGA (propaga a todos los
                contenedores). Combo editable: sugiere los ya usados por
                datalist y acepta uno nuevo. ───────────────────────────────── */}
          <CampoFila
            label="Transporte"
            id={`${idBase}-transporte`}
            editable={editable}
            valor={<span className="uppercase">{transporte || '—'}</span>}
          >
            <input
              id={`${idBase}-transporte`}
              type="text"
              list={transporteListId}
              value={transporte}
              onChange={e => setTransporte(e.target.value)}
              onBlur={() => void commitSave()}
              onKeyDown={e => { if (e.key === 'Enter') void commitSave() }}
              disabled={saving}
              placeholder="OLAVERRY, TRANSCAL…"
              className={`${CLASE_CONTROL} uppercase`}
            />
            <datalist id={transporteListId}>
              {knownTransportes.map(t => <option key={t} value={t} />)}
            </datalist>
          </CampoFila>

          {/* ── LIBRE (nivel-carga) + botón "Devuelto" ───────────────────
                La FECHA se edita en "Datos clave" del panel ("Más datos"); acá
                va el display (con respaldo calculatedLibreHasta, lo mismo que
                mira libreAlerts) y la acción rápida. Es el MISMO bloque que
                usa ViabilityBlock: si cambia, cambia en los dos lugares. */}
          <LibreDevueltoBlock
            libre={libreVal}
            respaldo={shipment.calculatedLibreHasta}
            habilitado={canSave && !saving}
            onToggle={toggleDevuelto}
          />

          {/* ── Pie ────────────────────────────────────────────────────── */}
          <div className="px-4 py-3 bg-muted/30 flex items-center justify-between gap-3">
            <span className="min-w-0 text-xs text-muted-foreground">
              {!shipment.__dbId
                ? <span className="font-medium text-destructive">Sin ID — edición no disponible</span>
                : saving
                  ? <span className="animate-pulse">Guardando…</span>
                  : null}
            </span>
            <span className="shrink-0 flex items-center gap-2">
              <button
                type="button"
                onClick={onMasDatos}
                className="text-xs font-semibold text-primary hover:underline underline-offset-2 transition-colors"
              >
                Más datos →
              </button>
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="h-8 px-3 text-xs font-medium rounded-md border border-input bg-background hover:bg-muted transition-colors"
              >
                {saving ? 'Cancelar' : 'Listo'}
              </button>
            </span>
          </div>
        </PanelCard>
      </DialogContent>
    </Dialog>
  )
}
