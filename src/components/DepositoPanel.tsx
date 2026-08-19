// EN DEPÓSITO — la pantalla para usar con el celular en la mano, parado en el
// depósito. Se entra por /deposito (conviene agregarla al inicio del celular).
//
// Pedido original (Brian, 18/08/2026): "apretar un botón y cargar las fotos a
// una referencia". Ampliado el mismo día: "quiero un check de ciertos puntos
// —diferencia de bultos, embalaje deteriorado, bultos con humedad, mercadería
// a la vista— y un campo de comentario. Que las fotos, checks y comentarios
// sean POR CONTENEDOR, así puedo cargar diferentes días y dejar registro por
// cada trasiego."
//
// De ahí sale la estructura: la tarjeta es la CARGA, pero todo lo que se hace
// —fotos y actas— cuelga de un CONTENEDOR. Una carga con dos contenedores
// muestra dos bloques, y cada uno lleva su propio registro. La primera versión
// de esta pantalla etiquetaba la foto con la lista entera ("EGSU0310260,
// EMCU1818703"), que no sirve para nada: eso es lo que se corrige acá.
//
// Lo que NO hace todavía: reloj de inicio/fin de operativa, conteo de bultos
// con número, y el borrador del informe operativo al cerrar. La cola offline
// quedó descartada (hay señal en los depósitos, Brian 18/08).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera, MagnifyingGlass, Warehouse, SpinnerGap, CheckCircle, ArrowSquareOut,
  ClipboardText, CaretDown, CaretRight, Warning, Cube, Trash,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { DbShipment } from '@/lib/operationsTypes'
import type { OriginPhoto } from '@/lib/quotationTypes'
import { processPhoto } from '@/lib/imageUtils'
import { saveOriginPhoto, fetchDepositoActas, saveDepositoActa, anularDepositoActa } from '@/lib/dataClient'
import { clasificarSeleccion, avisoDescartes, subirEnTandas, MAX_FOTOS_POR_LOTE } from '@/lib/subirFotos'
import { cargasEnDeposito, filtrarCargas, etiquetaCuando, type CargaEnDeposito, type BloqueCntr } from '@/lib/enDeposito'
import {
  CHECKS_ACTA, actasDe, ultimaActa, actaVacia, tieneContenido,
  resumenActa, hayNovedades, type ActaDeposito, type BorradorActa,
} from '@/lib/actasDeposito'
import { normalizeRef } from '@/lib/checksTypes'
import { fmtDateDMY } from '@/lib/format'

const hoyIso = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const norm = (v: unknown): string => String(v ?? '').trim().toUpperCase()

/** Clave de un bloque: una carga + un contenedor. */
const claveBloque = (ref: string, cntr: string) => `${normalizeRef(ref)}|${norm(cntr)}`

interface Props {
  dbShipments: DbShipment[]
  originPhotos?: OriginPhoto[]
  onUpdateOriginPhotos?: (photos: OriginPhoto[]) => void
  onOpenDetail?: (ref: string) => void
}

export default function DepositoPanel({
  dbShipments, originPhotos = [], onUpdateOriginPhotos, onOpenDetail,
}: Props) {
  const [texto, setTexto] = useState('')
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const [progreso, setProgreso] = useState({ hechas: 0, total: 0 })
  const [actas, setActas] = useState<ActaDeposito[]>([])
  const [errorActas, setErrorActas] = useState('')
  /** Bloque con el acta abierta (una por vez: es una pantalla de celular). */
  const [actaAbierta, setActaAbierta] = useState<string | null>(null)
  const [borrador, setBorrador] = useState<BorradorActa>(actaVacia)
  const [guardando, setGuardando] = useState(false)
  const [historialAbierto, setHistorialAbierto] = useState<string | null>(null)
  /** Acta que se está por anular (confirmación en dos toques: en el celular
   *  un borrado a un toque se dispara solo). */
  const [porAnular, setPorAnular] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const objetivo = useRef<{ carga: CargaEnDeposito; cntr: string } | null>(null)

  const hoy = hoyIso()
  const lista = useMemo(
    () => cargasEnDeposito(
      (dbShipments || []).map(s => ({
        ref: s.ref, cliente: s.cliente, deposito: s.deposito, operativa: s.operativa,
        cntr: s.contenedor, eta: s.eta, salida: s.salida, pais: s.dest_country,
        mode: s.mode, archived: s.archived,
        // Fechas POR CONTENEDOR: sin esto, el trasiego de HOY de una carga
        // cuyo otro contenedor salió ayer quedaba invisible (A8025, 19/08).
        operativas: (s.operativas || []).map(o => ({
          cntr: String(o.CNTR_OP || ''), salida: o.SALIDA, eta: o.ETA_OP,
        })),
      })),
      hoy,
    ),
    [dbShipments, hoy],
  )
  const visibles = useMemo(() => filtrarCargas(lista, texto), [lista, texto])

  // Las actas se traen una vez y se mantienen en memoria: son pocas y la
  // pantalla tiene que responder al toque, sin un fetch por tarjeta.
  const cargarActas = useCallback(() => {
    fetchDepositoActas(undefined, { limit: 2000 })
      .then(({ actas }) => { setActas(actas as unknown as ActaDeposito[]); setErrorActas('') })
      .catch(() => setErrorActas('No se pudieron cargar las actas anteriores. Las fotos igual se pueden subir.'))
  }, [])
  useEffect(() => { cargarActas() }, [cargarActas])

  /** Fotos de Uruguay por (ref, contenedor). Las viejas sin contenedor caen
   *  en el bloque '' — no se pierden ni se cuentan de más. */
  const fotosPorBloque = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of originPhotos) {
      if (String(p.photoType || '') !== 'uruguay') continue
      const k = claveBloque(String(p.shipmentRef || ''), String(p.containerNumber || ''))
      m.set(k, (m.get(k) || 0) + 1)
    }
    return m
  }, [originPhotos])

  // ── Fotos ──────────────────────────────────────────────────────────
  const abrirCamara = (carga: CargaEnDeposito, cntr: string) => {
    objetivo.current = { carga, cntr }
    inputRef.current?.click()
  }

  const alElegirFotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    const obj = objetivo.current
    objetivo.current = null
    if (files.length === 0 || !obj) return
    const { carga, cntr } = obj

    const sel = clasificarSeleccion(files)
    const aviso = avisoDescartes(sel)
    if (sel.aceptadas.length === 0) {
      toast.error(`No se puede subir nada: ${aviso}`)
      return
    }
    if (aviso) toast.warning(`Se suben ${sel.aceptadas.length} de ${files.length}`, { description: `${aviso}.` })

    const clave = claveBloque(carga.ref, cntr)
    setSubiendo(clave)
    setProgreso({ hechas: 0, total: sel.aceptadas.length })
    const lote = Date.now()
    const { ok, errores } = await subirEnTandas(
      sel.aceptadas,
      async (file, i) => {
        const { full, thumbnail } = await processPhoto(file)
        const photo: OriginPhoto = {
          id: `photo-${lote}-${i}`,
          shipmentRef: carga.ref,
          // UN contenedor, el del bloque que se tocó. '' = toda la carga.
          containerNumber: cntr || undefined,
          photoType: 'uruguay',
          fileName: file.name,
          fileType: file.type,
          fileData: full,
          thumbnailData: thumbnail,
          createdAt: Date.now(),
          createdBy: '',        // lo estampa el server desde el token
        }
        await saveOriginPhoto(photo)
        return { ...photo, fileData: undefined } as OriginPhoto
      },
      (hechas, total) => setProgreso({ hechas, total }),
    )

    if (ok.length > 0) onUpdateOriginPhotos?.([...ok, ...originPhotos])
    setSubiendo(null)

    if (errores.length > 0) {
      console.error('EN DEPÓSITO — fotos que fallaron:', errores)
      toast.error(`${errores.length} de ${sel.aceptadas.length} no se pudieron subir`, {
        description: errores[0].error.message,
      })
    } else {
      toast.success(`${ok.length} foto${ok.length > 1 ? 's' : ''} en ${carga.ref}`, {
        description: cntr || carga.cliente || undefined,
      })
    }
  }

  // ── Actas ──────────────────────────────────────────────────────────
  const abrirActa = (clave: string) => {
    if (actaAbierta === clave) { setActaAbierta(null); return }
    // Siempre en blanco: cada visita es un acta nueva, no se edita la anterior.
    setBorrador(actaVacia())
    setActaAbierta(clave)
  }

  const guardarActa = async (carga: CargaEnDeposito, cntr: string) => {
    if (!tieneContenido(borrador)) {
      toast.error('Marcá algún punto o escribí un comentario antes de guardar')
      return
    }
    setGuardando(true)
    try {
      const guardada = await saveDepositoActa({
        ref: carga.ref,
        contenedor: cntr,
        fecha: hoyIso(),
        checks: borrador.checks,
        comentario: borrador.comentario,
      })
      setActas(prev => [guardada as unknown as ActaDeposito, ...prev])
      setActaAbierta(null)
      setBorrador(actaVacia())
      toast.success(`Acta guardada en ${carga.ref}`, { description: cntr || 'toda la carga' })
    } catch (err) {
      toast.error('No se pudo guardar el acta', { description: (err as Error)?.message })
    } finally {
      setGuardando(false)
    }
  }

  const anular = async (acta: ActaDeposito) => {
    if (!acta.id) return
    try {
      await anularDepositoActa(acta.id)
      // Se saca de memoria en vez de re-traer todo: la pantalla es de campo.
      setActas(prev => prev.filter(a => a.id !== acta.id))
      setPorAnular(null)
      toast.success('Acta anulada', { description: 'No cuenta más para el informe.' })
    } catch (err) {
      toast.error('No se pudo anular el acta', { description: (err as Error)?.message })
    }
  }

  // ── Render ─────────────────────────────────────────────────────────
  const bloqueContenedor = (carga: CargaEnDeposito, bloque: BloqueCntr) => {
    const cntr = bloque.cntr
    const clave = claveBloque(carga.ref, cntr)
    const ocupado = subiendo === clave
    const fotos = fotosPorBloque.get(clave) || 0
    const previas = actasDe(actas, carga.ref, cntr)
    const ultima = ultimaActa(actas, carga.ref, cntr)
    const abierta = actaAbierta === clave
    const verHistorial = historialAbierto === clave

    return (
      <div key={clave} className="rounded-lg border border-border/70 p-2.5 space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Cube size={14} className="text-muted-foreground shrink-0" weight="duotone" />
          <span className="font-mono text-xs font-semibold">{cntr || 'Toda la carga'}</span>
          {/* CADA contenedor sale su propio día: el badge es del bloque, no de
              la carga (A8025: EMCU ayer, EGSU hoy). */}
          {bloque.cuando && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                bloque.cuando === 'hoy'
                  ? 'bg-emerald-500/15 text-emerald-700'
                  : bloque.cuando === 'futura'
                    ? 'bg-blue-500/15 text-blue-700'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {etiquetaCuando(bloque.dias as number)}
            </span>
          )}
          {fotos > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
              <CheckCircle size={11} weight="fill" />{fotos} foto{fotos > 1 ? 's' : ''}
            </span>
          )}
          {previas.length > 0 && (
            <button
              type="button"
              onClick={() => setHistorialAbierto(verHistorial ? null : clave)}
              className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {previas.length} acta{previas.length > 1 ? 's' : ''}
              {verHistorial ? <CaretDown size={9} /> : <CaretRight size={9} />}
            </button>
          )}
        </div>

        {ultima && !verHistorial && (
          <p className={`text-[11px] ${hayNovedades(ultima) ? 'text-amber-700' : 'text-muted-foreground'}`}>
            {hayNovedades(ultima) && <Warning size={11} weight="fill" className="inline mr-1" />}
            <b>{fmtDateDMY(ultima.fecha)}</b> · {resumenActa(ultima)}
          </p>
        )}

        {verHistorial && (
          <div className="space-y-1.5 border-l-2 border-border pl-2">
            {previas.map(a => (
              <div key={a.id} className="flex items-start gap-2">
                <p className={`flex-1 text-[11px] ${hayNovedades(a) ? 'text-amber-700' : 'text-muted-foreground'}`}>
                  <b>{fmtDateDMY(a.fecha)}</b> · {resumenActa(a)}
                  {a.usuario && <span className="text-muted-foreground/70"> · {a.usuario}</span>}
                </p>
                {porAnular === a.id ? (
                  <span className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => anular(a)}
                      className="h-7 px-2 rounded-md bg-destructive text-destructive-foreground text-[11px] font-semibold"
                    >
                      Anular
                    </button>
                    <button
                      type="button"
                      onClick={() => setPorAnular(null)}
                      className="h-7 px-2 rounded-md border border-border text-[11px]"
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPorAnular(a.id || null)}
                    className="p-1 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 shrink-0"
                    title="Anular esta acta (se cargó por error)"
                    aria-label={`Anular el acta del ${fmtDateDMY(a.fecha)}`}
                  >
                    <Trash size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={!!subiendo}
            onClick={() => abrirCamara(carga, cntr)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {ocupado ? (
              <><SpinnerGap size={17} className="animate-spin" /> {progreso.hechas}/{progreso.total}…</>
            ) : (
              <><Camera size={17} weight="fill" /> Fotos</>
            )}
          </button>
          <button
            type="button"
            onClick={() => abrirActa(clave)}
            aria-expanded={abierta}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-lg text-sm font-semibold border transition-colors ${
              abierta
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-transparent hover:bg-muted/60'
            }`}
          >
            <ClipboardText size={17} weight={abierta ? 'fill' : 'regular'} /> Acta
          </button>
        </div>

        {abierta && (
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {CHECKS_ACTA.map(c => {
                const marcado = borrador.checks[c.key] === true
                return (
                  <button
                    key={c.key}
                    type="button"
                    role="checkbox"
                    aria-checked={marcado}
                    onClick={() => setBorrador(b => ({ ...b, checks: { ...b.checks, [c.key]: !b.checks[c.key] } }))}
                    className={`flex items-center gap-2 h-11 px-3 rounded-lg border text-sm text-left transition-colors ${
                      marcado
                        ? 'border-amber-500/50 bg-amber-500/10 text-amber-800 font-medium'
                        : 'border-border hover:bg-muted/60'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded border shrink-0 grid place-items-center ${
                        marcado ? 'bg-amber-500 border-amber-500' : 'border-muted-foreground/40'
                      }`}
                    >
                      {marcado && <CheckCircle size={12} weight="fill" className="text-white" />}
                    </span>
                    {c.label}
                  </button>
                )
              })}
            </div>
            <Textarea
              value={borrador.comentario}
              onChange={e => setBorrador(b => ({ ...b, comentario: e.target.value }))}
              placeholder="Ej: la carga se hizo sin problemas, 4 bultos rotos, se hizo con autoelevador…"
              rows={3}
              className="text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={guardando}
                onClick={() => guardarActa(carga, cntr)}
                className="flex-1 h-11 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {guardando ? 'Guardando…' : 'Guardar acta'}
              </button>
              <button
                type="button"
                onClick={() => { setActaAbierta(null); setBorrador(actaVacia()) }}
                className="h-11 px-4 rounded-lg border border-border text-sm hover:bg-muted/60"
              >
                Cancelar
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Cada acta se agrega al historial de este contenedor: no pisa la anterior.
            </p>
          </div>
        )}
      </div>
    )
  }

  const tarjeta = (carga: CargaEnDeposito) => (
    <Card key={`${carga.ref}-${carga.fecha}`} className="overflow-hidden">
      <CardContent className="py-3 px-3 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-bold text-base">{carga.ref}</span>
              <span
                className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${
                  carga.cuando === 'hoy'
                    ? 'bg-emerald-500/15 text-emerald-700'
                    : carga.cuando === 'futura'
                      ? 'bg-blue-500/15 text-blue-700'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {etiquetaCuando(carga.dias)}
              </span>
            </div>
            {carga.cliente && <p className="text-sm text-muted-foreground truncate">{carga.cliente}</p>}
            <p className="text-xs text-muted-foreground/80 mt-0.5">
              {carga.deposito || 'sin depósito'}{carga.operativa && <> · {carga.operativa}</>}
            </p>
          </div>
          {onOpenDetail && (
            <button
              type="button"
              onClick={() => onOpenDetail(carga.ref)}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted shrink-0"
              title="Abrir la ficha"
              aria-label={`Abrir la ficha de ${carga.ref}`}
            >
              <ArrowSquareOut size={16} />
            </button>
          )}
        </div>

        {carga.bloques.map(b => bloqueContenedor(carga, b))}
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Warehouse size={26} weight="duotone" className="text-primary" />
          En depósito
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Fotos y actas por contenedor. Cada trasiego deja su registro.
        </p>
      </div>

      <div className="relative">
        <MagnifyingGlass size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={texto}
          onChange={e => setTexto(e.target.value)}
          placeholder="Ref, cliente, depósito o contenedor…"
          className="pl-8 h-11"
          aria-label="Buscar carga"
        />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={alElegirFotos}
      />

      {errorActas && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2">
          <Warning size={15} weight="fill" className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">{errorActas}</p>
        </div>
      )}

      {lista.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No hay operativas de depósito en estos días.
          <br />
          <span className="text-xs">Se muestran desde 3 días atrás hasta la semana que viene.</span>
        </p>
      )}

      {lista.length > 0 && visibles.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Ninguna carga coincide con “{texto}”.
        </p>
      )}

      {visibles.map(tarjeta)}

      {visibles.length > 0 && (
        <p className="text-[11px] text-muted-foreground text-center pt-1">
          Hasta {MAX_FOTOS_POR_LOTE} fotos por vez.
        </p>
      )}
    </div>
  )
}
