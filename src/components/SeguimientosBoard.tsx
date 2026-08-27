// Cola de seguimientos — pestaña "Seguimientos" (Brian 13/08, rediseño 17/08).
// El trabajo semanal de Nico agrupado POR BUQUE: mira una sola vez dónde viene
// cada buque (link a MarineTraffic), corrige UNA ETA que se propaga a todas las
// cargas del viaje (misma lógica que "ETA por buque" de Operaciones), copia el
// texto del update con su propio formato de mail, y marca la tanda entera como
// enviada. Barra de progreso del día arriba. Todo deja rastro en
// seguimientos_log (trazabilidad del buque).

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle, PaperPlaneTilt, CaretDown, CaretRight, Boat, ClockCounterClockwise, Copy, MapPin, Checks, ArrowSquareOut, ArrowsLeftRight, CalendarBlank } from '@phosphor-icons/react'
import type { DbShipment } from '@/lib/operationsTypes'
import { dbShipmentToOperation, buildPerContainerPatch, SEGUIMIENTO_DIAS } from '@/lib/operationsTypes'
import { groupByVoyage, buildEtaShiftPatch } from '@/lib/vesselGroups'
import {
  colaSeguimientos, grupoDestino, ORDEN_GRUPOS, textoUpdate, nombreBuqueBase,
  type CargaSeguimiento, type FilaSeguimiento,
} from '@/lib/seguimientos'
import { trackingCarrier } from '@/lib/trackingLinea'
import { cambiosDeBuque, detectarTrasbordo, lineaDeTiempo, type CambioBuque, type AuditRow } from '@/lib/trasbordo'
import { fetchAuditLog, fetchSeguimientosLog, postSeguimientoLog } from '@/lib/dataClient'
import { fmtDateDMY } from '@/lib/format'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import HistorialSeguimientos from '@/components/HistorialSeguimientos'

const hoyIso = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

/** "MONTEVIDEO" → "Montevideo" (el texto del mail va en prosa). */
const titulo = (s: string): string =>
  s.toLowerCase().replace(/(^|\s)\p{L}/gu, c => c.toUpperCase()).trim()

interface LogRow {
  tipo: string
  fecha?: string
  eta_anterior?: string | null
  eta_nueva?: string | null
  buque?: string | null
  usuario?: string | null
  created_at?: string
}

interface Props {
  dbShipments: DbShipment[]
  onPatchShipment?: (id: string, fields: Record<string, unknown>) => void
  /** Abre la ficha completa (panel de Operaciones) para la carga. */
  onOpenDetail?: (ref: string) => void
}

/** Ítem envuelto para groupByVoyage (necesita { buque, eta } arriba). */
interface ItemViaje { buque: string; eta: string; fila: FilaSeguimiento }

export default function SeguimientosBoard({ dbShipments, onPatchShipment, onOpenDetail }: Props) {
  // 'hoy' con clave por DÍA: si la pestaña queda abierta de una noche para la
  // otra, la cola se recomputa con la fecha nueva en el próximo render.
  const hoyKey = new Date().toDateString()
  const hoy = useMemo(() => new Date(), [hoyKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ref con la lista viva: los Deshacer de los toasts la leen al momento del
  // click (una closure vieja pisaría ediciones posteriores de la misma fila).
  const dbShipmentsRef = useRef(dbShipments)
  dbShipmentsRef.current = dbShipments

  const cargas: CargaSeguimiento[] = useMemo(() =>
    (dbShipments || []).map(s => ({
      dbId: s.id, ref: s.ref, cliente: s.cliente, buque: s.buque, etd: s.etd, eta: s.eta,
      linea: s.linea, docNumber: s.doc_number, cntr: s.contenedor,
      seguimiento: s.seguimiento, pais: s.dest_country, mode: s.mode, archived: s.archived,
      salida: s.salida, descarga: s.descarga, etaFiscal: s.eta_fiscal,
    })), [dbShipments])

  const cola = useMemo(() => colaSeguimientos(cargas, hoy), [cargas, hoy])

  // Progreso del día: lo enviado HOY (sella seguimiento=hoy) + lo que falta.
  const enviadosHoy = useMemo(() => {
    const h = hoyIso()
    return (dbShipments || []).filter(s =>
      !s.archived && (s.mode === 'fcl' || s.mode === 'lcl') && (s.seguimiento || '').trim() === h
    ).length
  }, [dbShipments, hoyKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const totalDia = cola.pendientes.length + enviadosHoy
  const pctDia = totalDia > 0 ? Math.round((enviadosHoy / totalDia) * 100) : 0

  // Destino → grupos de VIAJE (mismo criterio que "ETA por buque" de
  // Operaciones: buque + cercanía de ETA). Las cargas sin buque van a un
  // pseudo-grupo aparte con ETA por fila.
  const secciones = useMemo(() => {
    const porDestino = new Map<string, FilaSeguimiento[]>()
    for (const f of cola.pendientes) {
      const g = grupoDestino(f.carga.pais)
      porDestino.set(g, [...(porDestino.get(g) || []), f])
    }
    return ORDEN_GRUPOS.filter(d => porDestino.has(d)).map(d => {
      const filas = porDestino.get(d)!
      const conBuque: ItemViaje[] = []
      const sinBuque: FilaSeguimiento[] = []
      for (const f of filas) {
        if ((f.carga.buque || '').trim()) conBuque.push({ buque: f.carga.buque!, eta: f.carga.eta || '', fila: f })
        else sinBuque.push(f)
      }
      return { destino: d, viajes: groupByVoyage(conBuque), sinBuque }
    })
  }, [cola.pendientes])

  // Refs cuya ETA se corrigió HOY → el texto del update dice "se actualiza".
  // etaOriginales guarda la primera ETA del día por ref: si un Deshacer vuelve
  // a la original, la ref sale del set (el mail no debe decir "se actualiza"
  // por un cambio que se deshizo). Ambos se resetean al cambiar el día.
  const [etaCambiadas, setEtaCambiadas] = useState<Set<string>>(new Set())
  // Sección "Al día" plegada por defecto (Brian 27/08: verlas y poder tocarlas
  // sin ir al modal, pero sin ensuciar la cola de trabajo).
  const [alDiaAbierto, setAlDiaAbierto] = useState(false)
  // Ref de la fila con el selector "enviado otro día" abierto.
  const [fechaAbierta, setFechaAbierta] = useState<string | null>(null)
  const etaOriginalesRef = useRef<Record<string, string>>({})
  const diaRef = useRef(hoyKey)
  if (diaRef.current !== hoyKey) {
    diaRef.current = hoyKey
    etaOriginalesRef.current = {}
    if (etaCambiadas.size) setEtaCambiadas(new Set())
  }

  // Trasbordos: cambios de buque por ref, del audit. Se traen TODOS de una
  // (una sola llamada, filtrada al campo buque) porque el aviso tiene que
  // verse en la fila sin desplegar nada, y porque copiarUpdate no puede
  // fetchear (el clipboard se escribe dentro del gesto del click).
  const [cambiosBuque, setCambiosBuque] = useState<Record<string, CambioBuque[]>>({})
  useEffect(() => {
    let vivo = true
    fetchAuditLog({ campo: 'buque' })
      .then(rows => {
        if (!vivo) return
        const porRef: Record<string, AuditRow[]> = {}
        for (const r of rows as unknown as AuditRow[]) {
          const ref = String(r.ref || '').trim().toUpperCase()
          if (ref) (porRef[ref] ||= []).push(r)
        }
        setCambiosBuque(Object.fromEntries(
          Object.entries(porRef).map(([ref, rs]) => [ref, cambiosDeBuque(rs)])
        ))
      })
      // Sin audit el tablero funciona igual: solo no marca trasbordos.
      .catch(err => console.warn('audit-log (buque):', err))
    return () => { vivo = false }
    // Se re-trae cuando cambian las cargas: editar el buque abre la ficha como
    // OVERLAY (el board no se desmonta), así que sin esto el mapa quedaba viejo.
  }, [dbShipments])

  // Cola (el trabajo de hoy) vs Historial (lo que ya salió).
  const [tab, setTab] = useState('cola')
  /** REF → cliente, para que el historial global pueda mostrar de quién es
   *  cada carga: `seguimientos_log` guarda la ref, no el cliente. */
  const clientePorRef = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of dbShipments || []) {
      const k = String(s.ref || '').trim().toUpperCase()
      if (k && !m.has(k)) m.set(k, String(s.cliente || '').trim())
    }
    return m
  }, [dbShipments])
  /** Sube cada vez que la cola registra algo: el historial se refresca solo. */
  const [recargarToken, setRecargarToken] = useState(0)

  // Historial expandible por ref (fetch perezoso, cache en memoria del tab).
  const [abierto, setAbierto] = useState<string | null>(null)
  const [historial, setHistorial] = useState<Record<string, LogRow[] | 'cargando'>>({})
  const toggleHistorial = (ref: string) => {
    if (abierto === ref) { setAbierto(null); return }
    setAbierto(ref)
    if (!historial[ref]) {
      setHistorial(h => ({ ...h, [ref]: 'cargando' }))
      fetchSeguimientosLog(ref)
        .then(({ rows }) => setHistorial(h => ({ ...h, [ref]: rows as unknown as LogRow[] })))
        .catch(() => setHistorial(h => ({ ...h, [ref]: [] })))
    }
  }
  const invalidarHistorial = (ref: string) => {
    setHistorial(h => { const n = { ...h }; delete n[ref]; return n })
    setRecargarToken(n => n + 1)   // el historial global también quedó viejo
    // Si el acordeón está abierto, recargarlo: borrar la entrada dejaba el
    // panel en blanco (ni "Cargando…" ni "Sin historial") hasta cerrarlo.
    if (abierto === ref) {
      setHistorial(h => ({ ...h, [ref]: 'cargando' }))
      fetchSeguimientosLog(ref)
        .then(({ rows }) => setHistorial(h => ({ ...h, [ref]: rows as unknown as LogRow[] })))
        .catch(() => setHistorial(h => ({ ...h, [ref]: [] })))
    }
  }

  /** ¿Esta carga cambió de buque desde el último update al cliente? El
   *  historial propio (si está cacheado) es la verdad exacta; si no, el audit
   *  contra la fecha del último seguimiento enviado. */
  const trasbordoDe = (c: CargaSeguimiento) => {
    // El cache del historial se indexa con la ref CRUDA (igual que el resto
    // del board); el mapa del audit con la ref normalizada del server.
    const hist = historial[c.ref]
    const filas = Array.isArray(hist) ? hist : []
    const ultimoEnviado = filas.find(r => r.tipo === 'enviado')
    // Marca manual vigente = posterior al último update enviado (una vez que
    // el update sale, la marca ya se comunicó y deja de aplicar).
    const marca = filas.find(r => r.tipo === 'trasbordo')
    const marcadoManual = !!marca && (!ultimoEnviado || (marca.created_at || '') > (ultimoEnviado.created_at || ''))
    return detectarTrasbordo({
      buqueActual: c.buque,
      marcadoManual: marcadoManual || marcasLocales.has(c.ref),
      buqueUltimoEnviado: ultimoEnviado?.buque || '',
      cambios: cambiosBuque[String(c.ref || '').trim().toUpperCase()],
      fechaUltimoEnviado: c.seguimiento || '',
    })
  }

  /** Marcar/desmarcar el trasbordo a mano: para las cargas donde el buque
   *  viejo no quedó registrado en ningún lado, la única fuente confiable es
   *  quien está mirando el tracking de la línea. */
  const [marcasLocales, setMarcasLocales] = useState<Set<string>>(new Set())
  const marcarTrasbordo = (c: CargaSeguimiento) => {
    setMarcasLocales(prev => new Set(prev).add(c.ref))
    logSeguimiento({ ref: c.ref, tipo: 'trasbordo', fecha: hoyIso(), buque: c.buque || '' })
    invalidarHistorial(c.ref)
    toast.success(`${c.ref} — marcado como trasbordo`, {
      description: 'El update va a avisar el cambio de buque.',
      action: {
        label: 'Deshacer',
        onClick: () => setMarcasLocales(prev => { const n = new Set(prev); n.delete(c.ref); return n }),
      },
    })
  }

  // ── Acciones ──────────────────────────────────────────────────────────
  // El historial es best-effort (el dato real vive en la carga): si el POST
  // del log falla se avisa por consola, nunca se bloquea el trabajo.
  const logSeguimiento = (row: Parameters<typeof postSeguimientoLog>[0]) => {
    postSeguimientoLog({
      ...row,
      etaAnterior: (row.etaAnterior || '').slice(0, 40) || undefined,
      etaNueva: (row.etaNueva || '').slice(0, 40) || undefined,
    }).catch(err => console.warn('seguimientos_log:', err))
  }

  const filaViva = (dbId: string) => dbShipmentsRef.current.find(s => s.id === dbId)

  const anioValido = (iso: string): boolean => {
    const a = Number(iso.slice(0, 4))
    return a >= 2015 && a <= 2100
  }

  /** Corre la ETA de UNA carga (patch completo: columna + ETA_OP del array).
   *  Acepta '' para RESTAURAR una carga que no tenía ETA (Deshacer del grupo
   *  sin fecha) — buildEtaShiftPatch limpia también la copia del array. */
  const patchEta = (dbId: string, nueva: string) => {
    const viva = filaViva(dbId)
    if (!viva || !onPatchShipment) return
    const anterior = (viva.eta || '').trim()
    if (nueva === anterior) return
    onPatchShipment(dbId, buildEtaShiftPatch(dbShipmentToOperation(viva), nueva))
    logSeguimiento({ ref: viva.ref, tipo: 'eta', fecha: hoyIso(), etaAnterior: anterior, etaNueva: nueva, buque: viva.buque || '' })
    // Primera edición del día → recordar la ETA original; si esta edición
    // VUELVE a la original (un Deshacer), la ref deja de contar como cambiada.
    if (!(viva.ref in etaOriginalesRef.current)) etaOriginalesRef.current[viva.ref] = anterior
    const volvioAlOriginal = nueva === etaOriginalesRef.current[viva.ref]
    setEtaCambiadas(prev => {
      const next = new Set(prev)
      if (volvioAlOriginal) next.delete(viva.ref)
      else next.add(viva.ref)
      return next
    })
    invalidarHistorial(viva.ref)
  }

  /** ETA del VIAJE entero: propaga a todas las cargas del grupo en un gesto. */
  const commitEtaBuque = (buque: string, dbIds: string[], nueva: string) => {
    if (!onPatchShipment || !nueva) return
    if (!anioValido(nueva)) { toast.error(`Fecha inválida: ${nueva}`); return }
    const vivas = dbIds.map(filaViva).filter((s): s is DbShipment => !!s)
    const prev = vivas.map(s => ({ id: s.id, eta: (s.eta || '').trim() }))
    const tocadas = vivas.filter(s => (s.eta || '').trim() !== nueva)
    if (tocadas.length === 0) return
    for (const s of tocadas) patchEta(s.id, nueva)
    toast.success(`${buque} — ETA ${fmtDateDMY(nueva)} aplicada a ${tocadas.length} carga${tocadas.length === 1 ? '' : 's'}`, {
      duration: 8000,
      action: {
        label: 'Deshacer',
        // Restaura TAMBIÉN las que estaban sin ETA (p.eta='') — saltarlas
        // dejaba la fecha errónea puesta con un botón que prometía deshacer.
        onClick: () => { for (const p of prev) patchEta(p.id, p.eta) },
      },
    })
  }

  const marcarEnviado = (f: FilaSeguimiento, silencioso = false, fecha = hoyIso()): (() => void) | null => {
    const c = f.carga
    if (!c.dbId || !onPatchShipment) return null
    if (!ISO_RE.test(fecha)) { toast.error(`Fecha inválida: ${fecha}`); return null }
    const dbId = c.dbId
    const anterior = c.seguimiento || ''
    onPatchShipment(dbId, { seguimiento: fecha })
    logSeguimiento({ ref: c.ref, tipo: 'enviado', fecha, etaNueva: c.eta || '', buque: c.buque || '' })
    invalidarHistorial(c.ref)
    const deshacer = () => {
      onPatchShipment(dbId, { seguimiento: anterior })
      // Compensar el historial: el update quedó registrado pero no salió.
      logSeguimiento({ ref: c.ref, tipo: 'deshecho', fecha: hoyIso() })
      invalidarHistorial(c.ref)
    }
    if (!silencioso) {
      // Con fecha pasada (ej: "lo mandé ayer") el plazo restante se achica.
      const transcurridos = Math.max(0, Math.floor((new Date(hoyIso()).getTime() - new Date(fecha).getTime()) / 86_400_000))
      const vuelve = Math.max(0, SEGUIMIENTO_DIAS - transcurridos)
      toast.success(`${c.ref} — seguimiento enviado ${fmtDateDMY(fecha)}`, {
        description: vuelve === 0 ? 'Ya está vencido con esa fecha — queda en la cola.' : `Vuelve a la cola en ${vuelve} día${vuelve === 1 ? '' : 's'}.`,
        action: { label: 'Deshacer', onClick: deshacer },
      })
    }
    return deshacer
  }

  /** "¿Llegó?" → confirmar la llegada: estampa la DESCARGA con la ETA (el día
   *  que el buque efectivamente atracó según lo previsto) y la carga sale de
   *  la cola por el HECHO, no por el calendario. Con Deshacer que la limpia. */
  const marcarLlegada = (f: FilaSeguimiento) => {
    const c = f.carga
    if (!c.dbId || !onPatchShipment) return
    const dbId = c.dbId
    const eta = (c.eta || '').trim()
    if (!ISO_RE.test(eta)) { toast.error(`${c.ref} — sin ETA válida para estampar la descarga`); return }
    const arma = (valor: string) => {
      const viva = filaViva(dbId)
      return buildPerContainerPatch({ operativas: viva?.operativas ?? undefined }, 'descarga', valor)
    }
    onPatchShipment(dbId, arma(eta))
    toast.success(`${c.ref} — llegada confirmada`, {
      description: `Descarga ${fmtDateDMY(eta)} — sale de la cola de seguimientos.`,
      action: { label: 'Deshacer', onClick: () => onPatchShipment(dbId, arma('')) },
    })
  }

  /** Marca TODA la tanda del buque como enviada (un toast, un deshacer). */
  const marcarEnviadoGrupo = (buque: string, filas: FilaSeguimiento[]) => {
    const deshacedores = filas.map(f => marcarEnviado(f, true)).filter((d): d is () => void => !!d)
    if (deshacedores.length === 0) return
    toast.success(`${buque} — ${deshacedores.length} seguimiento${deshacedores.length === 1 ? '' : 's'} enviados`, {
      description: 'Vuelven a la cola en 7 días.',
      duration: 8000,
      action: { label: 'Deshacer', onClick: () => deshacedores.forEach(d => d()) },
    })
  }

  /** Copia el texto del update (formato de los mails reales de Nicolás).
   *  "se actualiza" vs "se mantiene": si el historial de la ref está cacheado,
   *  se compara contra la ETA del último update ENVIADO (la verdad); si no,
   *  contra los cambios hechos hoy en esta pestaña (etaCambiadas). No se
   *  fetchea acá: el clipboard debe escribirse dentro del gesto del click. */
  const copiarUpdate = (f: FilaSeguimiento) => {
    const c = f.carga
    const eta = (c.eta || '').trim()
    if (!ISO_RE.test(eta)) { toast.error(`${c.ref} — sin ETA confirmada, no hay update para armar`); return }
    if (!navigator.clipboard?.writeText) { toast.error('El portapapeles no está disponible en este navegador'); return }
    const viva = c.dbId ? filaViva(c.dbId) : undefined
    const puerto = titulo((viva?.discharge_port || '').trim()) || grupoDestino(c.pais).replace('Otros destinos', 'destino')
    const hist = historial[c.ref]
    const ultimoEnviado = Array.isArray(hist) ? hist.find(r => r.tipo === 'enviado') : undefined
    const actualizada = ultimoEnviado
      ? (ultimoEnviado.eta_nueva || '').trim() !== eta
      : etaCambiadas.has(c.ref)
    // Si cambió de buque, el mensaje avisa el TRASBORDO: decirle al cliente
    // que "el MSC ADELE mantiene su fecha" no le dice nada — ese buque es
    // nuevo para él (caso A7967, Brian 17/08).
    const tras = trasbordoDe(c)
    const texto = textoUpdate({
      buque: (c.buque || '').trim() || 'asignado',
      puerto,
      etaISO: eta,
      actualizada,
      ...(tras.hubo ? { trasbordo: { anterior: tras.anterior } } : {}),
    })
    navigator.clipboard.writeText(texto)
      .then(() => toast.success(`Update de ${c.ref} copiado — pegalo en el mail`, { description: texto.split('\n')[2] }))
      .catch(() => toast.error('No se pudo copiar al portapapeles'))
  }

  // Borradores de ETA (input por buque o por fila sin buque): commit en blur/Enter.
  const [etaDrafts, setEtaDrafts] = useState<Record<string, string>>({})
  const commitDraft = (key: string, aplicar: (nueva: string) => void) => {
    const draft = etaDrafts[key]
    if (draft === undefined) return
    setEtaDrafts(d => { const n = { ...d }; delete n[key]; return n })
    if (!draft) return
    if (!anioValido(draft)) { toast.error(`Fecha inválida: ${draft}`); return }
    aplicar(draft)
  }

  const editable = !!onPatchShipment

  // ── Render ────────────────────────────────────────────────────────────

  const filaRow = (f: FilaSeguimiento, conEtaPropia: boolean) => {
    const c = f.carga
    const hist = historial[c.ref]
    const etaIso = ISO_RE.test((c.eta || '').trim()) ? (c.eta || '').trim() : ''
    const draftKey = `fila-${c.dbId}`
    // Tracking DE LA LÍNEA (contenedor/BL): el buque puede cambiar en un
    // trasbordo — Nico captura el seguimiento ahí y después copia el mensaje.
    const tracking = trackingCarrier({ linea: c.linea, docNumber: c.docNumber, cntr: c.cntr })
    const tras = trasbordoDe(c)
    // Historial = updates + cambios de buque, en una sola línea de tiempo.
    const timeline = Array.isArray(hist)
      ? lineaDeTiempo(hist as unknown as Parameters<typeof lineaDeTiempo>[0], cambiosBuque[String(c.ref || '').trim().toUpperCase()] || [])
      : []
    return (
      <div key={c.ref} className="py-1.5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
              f.dias === null ? 'bg-destructive/10 text-destructive'
                : f.dias < SEGUIMIENTO_DIAS ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'bg-amber-500/10 text-amber-600'
            }`}
            title={f.dias !== null && f.dias < SEGUIMIENTO_DIAS
              ? `Al día — vuelve a la cola en ${SEGUIMIENTO_DIAS - f.dias} día${SEGUIMIENTO_DIAS - f.dias === 1 ? '' : 's'}`
              : undefined}
          >
            {f.dias === null ? 'NUNCA' : f.dias === 0 ? 'HOY' : `HACE ${f.dias}D`}
          </span>
          {f.etaVencidaDias !== undefined && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-700 dark:text-red-300 shrink-0"
              title={`La ETA (${fmtDateDMY((c.eta || '').trim())}) pasó hace ${f.etaVencidaDias === 0 ? 'hoy' : `${f.etaVencidaDias} día${f.etaVencidaDias === 1 ? '' : 's'}`} y la carga no muestra señales de llegada (sin salida, descarga ni fiscal). Si el buque llegó, marcá LLEGÓ; si se corrió u omitió puerto, corregí la ETA y mandá el update.`}
            >
              ¿LLEGÓ? ETA vencida
            </span>
          )}
          <button
            type="button"
            onClick={() => onOpenDetail?.(c.dbId || c.ref)}
            className="font-mono text-sm font-semibold hover:underline shrink-0"
            title="Abrir ficha"
          >
            {c.ref}
          </button>
          <span className="text-sm text-foreground/85 truncate min-w-0 flex-1 basis-36">
            {c.cliente || '—'}
            {c.mode === 'lcl' && <span className="ml-2 text-[10px] font-bold text-sky-600">LCL</span>}
          </span>
          {tras.hubo && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-700 dark:text-violet-300 shrink-0"
              title={tras.anterior
                ? `Trasbordo: venía en ${tras.anterior} y ahora viaja en ${c.buque} — el update lo avisa`
                : `Trasbordo marcado (ahora viaja en ${c.buque}) — el update lo avisa`}
            >
              <ArrowsLeftRight size={11} weight="bold" /> TRASBORDO
            </span>
          )}
          {!tras.hubo && tras.sospecha && (
            // El buque se tocó después del último update, pero el audit no
            // prueba que sea un trasbordo (puede ser la primera carga del
            // dato o una corrección): se OFRECE marcarlo, no se afirma.
            <button
              type="button"
              onClick={() => marcarTrasbordo(c)}
              className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border border-violet-400/40 text-violet-700 dark:text-violet-300 hover:bg-violet-500/10 transition-colors shrink-0"
              title={`El buque se cargó/cambió después del último update (ahora ${c.buque}). Si la carga hizo trasbordo, marcalo y el update lo va a avisar.`}
            >
              <ArrowsLeftRight size={11} weight="bold" /> ¿trasbordo?
            </button>
          )}
          {conEtaPropia ? (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
              ETA
              <input
                type="date"
                value={etaDrafts[draftKey] ?? etaIso}
                disabled={!editable || !c.dbId}
                onChange={e => setEtaDrafts(d => ({ ...d, [draftKey]: e.target.value }))}
                onBlur={() => commitDraft(draftKey, nueva => c.dbId && patchEta(c.dbId, nueva))}
                onKeyDown={e => { if (e.key === 'Enter') commitDraft(draftKey, nueva => c.dbId && patchEta(c.dbId, nueva)) }}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
              />
            </label>
          ) : etaIso ? (
            <span className="text-xs text-muted-foreground tabular-nums shrink-0">ETA {fmtDateDMY(etaIso)}</span>
          ) : null}
          {tracking && (
            <a
              href={tracking.url}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-[11px] font-semibold text-primary hover:bg-primary/10 transition-colors shrink-0"
              title={`Abrir el tracking de ${tracking.linea} para esta carga (contenedor/BL — sigue la carga aunque el buque cambie en un trasbordo)`}
            >
              <ArrowSquareOut size={13} weight="bold" /> {tracking.linea}
            </a>
          )}
          <button
            type="button"
            onClick={() => copiarUpdate(f)}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors shrink-0"
            title="Copiar el texto del update para el mail"
            aria-label={`Copiar update de ${c.ref}`}
          >
            <Copy size={16} />
          </button>
          <button
            type="button"
            onClick={() => toggleHistorial(c.ref)}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors shrink-0"
            title="Historial del buque"
            aria-label={`Historial de ${c.ref}`}
          >
            <ClockCounterClockwise size={16} />
            {abierto === c.ref ? <CaretDown size={10} className="inline ml-0.5" /> : <CaretRight size={10} className="inline ml-0.5" />}
          </button>
          {f.etaVencidaDias !== undefined && (
            <button
              type="button"
              disabled={!editable || !c.dbId}
              onClick={() => marcarLlegada(f)}
              title="El buque efectivamente llegó: estampa la descarga con la fecha de la ETA y la saca de la cola"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-emerald-600/50 text-emerald-700 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-500/10 disabled:opacity-50 transition-colors shrink-0"
            >
              <CheckCircle size={14} weight="fill" /> Llegó
            </button>
          )}
          <button
            type="button"
            disabled={!editable || !c.dbId}
            onClick={() => marcarEnviado(f)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
          >
            <PaperPlaneTilt size={14} weight="fill" /> Enviado hoy
          </button>
          <button
            type="button"
            disabled={!editable || !c.dbId}
            onClick={() => setFechaAbierta(prev => prev === c.ref ? null : c.ref)}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors shrink-0"
            title="Enviado otro día — elegí la fecha y la estampa"
            aria-label={`Estampar seguimiento de ${c.ref} con otra fecha`}
          >
            <CalendarBlank size={16} />
          </button>
          {fechaAbierta === c.ref && (
            <input
              type="date"
              autoFocus
              max={hoyIso()}
              onChange={e => {
                if (!e.target.value) return
                marcarEnviado(f, false, e.target.value)
                setFechaAbierta(null)
              }}
              onBlur={() => setFechaAbierta(null)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 shrink-0"
            />
          )}
        </div>
        {abierto === c.ref && (
          <div className="mt-2 ml-1 pl-3 border-l-2 border-border text-xs text-muted-foreground space-y-1">
            {hist === 'cargando' && <p>Cargando historial…</p>}
            {Array.isArray(hist) && timeline.length === 0 && <p>Sin historial todavía — arranca con el primer update.</p>}
            {Array.isArray(hist) && timeline.map((e, i) => {
              if (e.kind === 'buque') {
                // Cambio de buque (del audit): la trazabilidad del trasbordo,
                // aunque a esta carga nunca se le haya mandado un update.
                return (
                  <p key={`b-${i}`} className="text-violet-700 dark:text-violet-300">
                    <span className="font-medium">{fmtDateDMY(e.fecha)}</span>
                    {' — '}
                    {e.anterior ? <>trasbordo: {e.anterior} → <b>{e.buque}</b></> : <>buque: <b>{e.buque}</b></>}
                    {e.usuario ? ` · ${e.usuario}` : ''}
                  </p>
                )
              }
              const r = e.row as LogRow
              return (
                <p key={`l-${i}`}>
                  <span className="font-medium text-foreground/70">{fmtDateDMY(e.fecha)}</span>
                  {' — '}
                  {r.tipo === 'enviado' && <>update enviado{r.eta_nueva ? ` (ETA era ${fmtDateDMY(r.eta_nueva)})` : ''}</>}
                  {r.tipo === 'deshecho' && <>envío deshecho — el update anterior no salió</>}
                  {r.tipo === 'trasbordo' && <>trasbordo marcado{r.buque ? ` — ahora viaja en ${r.buque}` : ''}</>}
                  {r.tipo === 'eta' && <>ETA {r.eta_anterior ? fmtDateDMY(r.eta_anterior) : 'sin fecha'} → {r.eta_nueva ? fmtDateDMY(r.eta_nueva) : 'sin fecha'}</>}
                  {r.usuario ? ` · ${r.usuario}` : ''}
                </p>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ── Header + progreso del día ── */}
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Seguimientos</h1>
          <p className="text-sm text-muted-foreground">
            {totalDia > 0
              ? <><b className="text-foreground">{enviadosHoy} de {totalDia}</b> enviados hoy · {cola.alDia.length} al día</>
              : <>{cola.alDia.length} cargas en viaje, todas al día</>}
          </p>
        </div>
        {totalDia > 0 && (
          <div className="mt-2 h-2 max-w-md rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={pctDia} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${pctDia}%` }} />
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="tabs-list-underline">
          <TabsTrigger value="cola" className="tab-underline">Cola</TabsTrigger>
          <TabsTrigger value="historial" className="tab-underline">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="cola" className="space-y-5 mt-4">
          {cola.pendientes.length === 0 && (
            <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.05] px-4 py-2.5">
              <CheckCircle size={18} weight="fill" className="text-emerald-600 shrink-0" />
              <p className="text-sm text-emerald-700">
                {enviadosHoy > 0
                  ? <><b>¡Terminaste!</b> {enviadosHoy} update{enviadosHoy === 1 ? '' : 's'} enviado{enviadosHoy === 1 ? '' : 's'} hoy — todos los seguimientos al día.</>
                  : <><b>¡Felicitaciones!</b> Todos los seguimientos están al día — ninguna carga en viaje lleva 7 días sin update.</>}
              </p>
            </div>
          )}

          {secciones.map(sec => (
            <div key={sec.destino} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {sec.destino} <span className="font-normal">({sec.viajes.reduce((a, g) => a + g.ops.length, 0) + sec.sinBuque.length})</span>
              </h2>

              {sec.viajes.map((g, gi) => {
                const filas = g.ops.map(o => o.fila)
                const dbIds = filas.map(f => f.carga.dbId).filter((x): x is string => !!x)
                // Clave SIN etaMin: si un refetch (co-edición en vivo) corre la ETA
                // del viaje mientras se tipea, la Card no se remonta ni pierde el
                // draft/foco. El índice separa dos viajes del mismo buque.
                const draftKey = `buque-${sec.destino}-${g.buque}-${g.sinEta ? 'sf' : gi}`
                const etaComun = !g.sinEta && g.etaMin === g.etaMax ? g.etaMin : ''
                const base = nombreBuqueBase(g.buque)
                return (
                  <Card key={draftKey} className="overflow-hidden">
                    <CardContent className="pt-3.5 pb-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-1.5">
                        <Boat size={17} weight="fill" className="text-primary/70 shrink-0" />
                        <span className="font-semibold text-sm shrink-0">{g.buque}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{filas.length} carga{filas.length === 1 ? '' : 's'}</span>
                        {base && (
                          <a
                            href={`https://www.marinetraffic.com/en/ais/index/search/all?keyword=${encodeURIComponent(base)}`}
                            target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                            title="Ver posición en MarineTraffic"
                          >
                            <MapPin size={13} /> ver posición
                          </a>
                        )}
                        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                          ETA del buque
                          <input
                            type="date"
                            value={etaDrafts[draftKey] ?? etaComun}
                            disabled={!editable}
                            onChange={e => setEtaDrafts(d => ({ ...d, [draftKey]: e.target.value }))}
                            onBlur={() => commitDraft(draftKey, nueva => commitEtaBuque(g.buque, dbIds, nueva))}
                            onKeyDown={e => { if (e.key === 'Enter') commitDraft(draftKey, nueva => commitEtaBuque(g.buque, dbIds, nueva)) }}
                            className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
                          />
                        </label>
                      </div>
                      {!etaComun && !g.sinEta && (
                        <p className="text-[11px] text-muted-foreground mb-1">
                          ETAs distintas en el viaje ({fmtDateDMY(g.etaMin)} – {fmtDateDMY(g.etaMax)}) — poner una acá las unifica.
                        </p>
                      )}
                      <div className="divide-y divide-border/60 border-t border-border/60">
                        {filas.map(f => filaRow(f, false))}
                      </div>
                      {filas.length > 1 && (
                        <div className="flex justify-end mt-2">
                          <button
                            type="button"
                            disabled={!editable}
                            onClick={() => marcarEnviadoGrupo(g.buque, filas)}
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs font-semibold text-foreground/80 hover:bg-muted disabled:opacity-50 transition-colors"
                          >
                            <Checks size={15} weight="bold" /> Enviado a las {filas.length} de este buque
                          </button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}

              {sec.sinBuque.length > 0 && (
                <Card className="overflow-hidden">
                  <CardContent className="pt-3.5 pb-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Boat size={17} className="text-muted-foreground/60 shrink-0" />
                      <span className="font-semibold text-sm text-muted-foreground">Sin buque asignado</span>
                      <span className="text-xs text-muted-foreground">{sec.sinBuque.length}</span>
                    </div>
                    <div className="divide-y divide-border/60 border-t border-border/60">
                      {sec.sinBuque.map(f => filaRow(f, true))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ))}

          {/* ── Al día: visibles y operables sin ir al modal (Brian 27/08) ── */}
          {cola.alDia.length > 0 && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setAlDiaAbierto(v => !v)}
                className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                aria-expanded={alDiaAbierto}
              >
                {alDiaAbierto ? <CaretDown size={14} /> : <CaretRight size={14} />}
                <CheckCircle size={15} weight="fill" className="text-emerald-600" />
                Al día ({cola.alDia.length})
                <span className="font-normal normal-case tracking-normal">— próximas a vencer primero</span>
              </button>
              {alDiaAbierto && (
                <Card className="overflow-hidden">
                  <CardContent className="pt-2 pb-2.5">
                    <div className="divide-y divide-border/60">
                      {cola.alDia.map(f => filaRow(f, true))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="historial" className="mt-4">
          <HistorialSeguimientos
            clientePorRef={clientePorRef}
            onOpenDetail={onOpenDetail}
            recargarToken={recargarToken}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
