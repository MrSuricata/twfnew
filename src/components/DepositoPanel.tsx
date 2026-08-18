// EN DEPÓSITO — la pantalla para usar con el celular en la mano, parado en el
// depósito. Se entra por /deposito (conviene agregarla al inicio del celular).
//
// Pedido de Brian (18/08/2026, desde el depósito): "apretar un botón y cargar
// las fotos a una referencia". Hoy eso son cuatro pasos —Operaciones, buscar la
// ref, abrir la carga, chip de la cámara— y con el contenedor abriéndose no se
// hacen. Acá son dos: tocar la carga, sacar la foto.
//
// Lo que NO hace todavía (definido con Brian, va después): reloj de inicio/fin
// de operativa, observaciones, conteo de bultos, y el informe automático al
// cerrar. La cola offline quedó descartada para esta primera porque hay señal
// en los depósitos (Brian, 18/08).
//
// Reusa entero el pipeline que ya existe: processPhoto (compresión) →
// saveOriginPhoto (?mode=file → Storage) y subirEnTandas (3 en paralelo, no
// aborta al primer error). El autor lo estampa el server desde el token.

import { useMemo, useRef, useState } from 'react'
import { Camera, MagnifyingGlass, Warehouse, SpinnerGap, CheckCircle, ArrowSquareOut } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { DbShipment } from '@/lib/operationsTypes'
import type { OriginPhoto } from '@/lib/quotationTypes'
import { processPhoto } from '@/lib/imageUtils'
import { saveOriginPhoto } from '@/lib/dataClient'
import { clasificarSeleccion, avisoDescartes, subirEnTandas, MAX_FOTOS_POR_LOTE } from '@/lib/subirFotos'
import { cargasEnDeposito, filtrarCargas, etiquetaCuando, type CargaEnDeposito } from '@/lib/enDeposito'
import { normalizeRef } from '@/lib/checksTypes'

const hoyIso = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Props {
  dbShipments: DbShipment[]
  originPhotos?: OriginPhoto[]
  onUpdateOriginPhotos?: (photos: OriginPhoto[]) => void
  /** Abre la ficha completa, para cuando hace falta algo más que fotos. */
  onOpenDetail?: (ref: string) => void
}

export default function DepositoPanel({
  dbShipments, originPhotos = [], onUpdateOriginPhotos, onOpenDetail,
}: Props) {
  const [texto, setTexto] = useState('')
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const [progreso, setProgreso] = useState({ hechas: 0, total: 0 })
  const inputRef = useRef<HTMLInputElement>(null)
  const objetivo = useRef<CargaEnDeposito | null>(null)

  const hoy = hoyIso()
  const lista = useMemo(
    () => cargasEnDeposito(
      (dbShipments || []).map(s => ({
        ref: s.ref, cliente: s.cliente, deposito: s.deposito, operativa: s.operativa,
        cntr: s.contenedor, eta: s.eta, salida: s.salida, pais: s.dest_country,
        mode: s.mode, archived: s.archived,
      })),
      hoy,
    ),
    [dbShipments, hoy],
  )
  const visibles = useMemo(() => filtrarCargas(lista, texto), [lista, texto])

  /** Cuántas fotos de Uruguay tiene ya cada ref — para ver de un vistazo cuál
   *  ya está documentada y cuál no. */
  const fotosPorRef = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of originPhotos) {
      if (String(p.photoType || '') !== 'uruguay') continue
      const k = normalizeRef(String(p.shipmentRef || ''))
      if (k) m.set(k, (m.get(k) || 0) + 1)
    }
    return m
  }, [originPhotos])

  const abrirCamara = (c: CargaEnDeposito) => {
    objetivo.current = c
    inputRef.current?.click()
  }

  const alElegirFotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''   // permite volver a elegir las mismas
    const c = objetivo.current
    objetivo.current = null
    if (files.length === 0 || !c) return

    const sel = clasificarSeleccion(files)
    const aviso = avisoDescartes(sel)
    if (sel.aceptadas.length === 0) {
      toast.error(`No se puede subir nada: ${aviso}`)
      return
    }
    if (aviso) {
      toast.warning(`Se suben ${sel.aceptadas.length} de ${files.length}`, { description: `${aviso}.` })
    }

    setSubiendo(c.ref)
    setProgreso({ hechas: 0, total: sel.aceptadas.length })
    const lote = Date.now()
    const { ok, errores } = await subirEnTandas(
      sel.aceptadas,
      async (file, i) => {
        const { full, thumbnail } = await processPhoto(file)
        const photo: OriginPhoto = {
          id: `photo-${lote}-${i}`,
          shipmentRef: c.ref,
          // El contenedor de la carga: si tiene varios, queda el de la planilla
          // y se puede reasignar después desde la ficha.
          containerNumber: c.cntr || undefined,
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
      toast.success(`${ok.length} foto${ok.length > 1 ? 's' : ''} en ${c.ref}`, {
        description: c.cliente || undefined,
      })
    }
  }

  const tarjeta = (c: CargaEnDeposito) => {
    const ocupado = subiendo === c.ref
    const yaTiene = fotosPorRef.get(normalizeRef(c.ref)) || 0
    return (
      <Card key={`${c.ref}-${c.fecha}-${c.cntr}`} className="overflow-hidden">
        <CardContent className="py-3 px-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-bold text-base">{c.ref}</span>
                <span
                  className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${
                    c.cuando === 'hoy'
                      ? 'bg-emerald-500/15 text-emerald-700'
                      : c.cuando === 'futura'
                        ? 'bg-blue-500/15 text-blue-700'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {etiquetaCuando(c.dias)}
                </span>
              </div>
              {c.cliente && <p className="text-sm text-muted-foreground truncate">{c.cliente}</p>}
              <p className="text-xs text-muted-foreground/80 mt-0.5">
                {c.deposito || 'sin depósito'}
                {c.operativa && <> · {c.operativa}</>}
                {c.cntr && <> · {c.cntr}</>}
              </p>
              {yaTiene > 0 && (
                <p className="flex items-center gap-1 text-[11px] text-emerald-700 mt-1">
                  <CheckCircle size={12} weight="fill" />
                  {yaTiene} foto{yaTiene > 1 ? 's' : ''} de Uruguay
                </p>
              )}
            </div>
            {onOpenDetail && (
              <button
                type="button"
                onClick={() => onOpenDetail(c.ref)}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-muted shrink-0"
                title="Abrir la ficha"
                aria-label={`Abrir la ficha de ${c.ref}`}
              >
                <ArrowSquareOut size={16} />
              </button>
            )}
          </div>

          {/* Botón grande: es lo único que hay que poder tocar con una mano. */}
          <button
            type="button"
            disabled={!!subiendo}
            onClick={() => abrirCamara(c)}
            className="mt-2.5 w-full inline-flex items-center justify-center gap-2 h-12 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {ocupado ? (
              <><SpinnerGap size={20} className="animate-spin" /> Subiendo {progreso.hechas}/{progreso.total}…</>
            ) : (
              <><Camera size={20} weight="fill" /> Sacar / subir fotos</>
            )}
          </button>
          {ocupado && progreso.total > 0 && (
            <div
              className="mt-1.5 h-1 w-full rounded-full bg-muted overflow-hidden"
              role="progressbar"
              aria-valuenow={progreso.hechas}
              aria-valuemin={0}
              aria-valuemax={progreso.total}
            >
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${Math.round((progreso.hechas / progreso.total) * 100)}%` }}
              />
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Warehouse size={26} weight="duotone" className="text-primary" />
          En depósito
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Tocá la carga y sacá las fotos. Se suben a la referencia como “Carga en Uruguay”.
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

      {/* Un solo input para todas las tarjetas: el celular ofrece Cámara o
          Fototeca al tocarlo. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={alElegirFotos}
      />

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
