// OperationMediaSection — "Fotos e informes" de una operación. Vive en un Dialog
// que se abre desde el chip 📷 junto a la REF en el header del panel de detalle
// (OperationDetailPanel). Recupera la función que se perdió al remover la vieja
// pestaña "Cargas" (ShipmentTracking): subir fotos de cómo se cargó la mercadería
// —en ORIGEN y en URUGUAY— y adjuntar informes PDF, por operación.
//
// Reusa el pipeline existente tal cual:
// - Fotos: processPhoto (compresión canvas 800px/0.65 + thumb 300px/0.6) →
//   saveOriginPhoto (?mode=file → el server las sube a Supabase Storage).
//   Distinción de etapa = photoType 'origen' | 'uruguay' (columna photo_type,
//   ya existente en la DB). Galería + lightbox: OriginPhotoGallery (con borrado
//   confirmado incluido).
// - Informes: saveReportWithFile (base64 en la tabla reports, límite 3MB) +
//   fetchReportFile para descargar on-demand + deleteReport.
//
// El matcheo por operación copia el criterio del dialog viejo
// (ShipmentDetailsDialog): shipmentRef === REF exacto (con A). Aplica a todas
// las modalidades — la clave es la ref, no la fuente.

import { useRef, useState } from 'react'
import { Camera, FilePdf, DownloadSimple, Trash, SpinnerGap, Plus } from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { OriginPhoto, OperativeReport, PhotoLocation } from '@/lib/quotationTypes'
import { processPhoto } from '@/lib/imageUtils'
import {
  MAX_FOTOS_POR_LOTE, clasificarSeleccion, avisoDescartes, subirEnTandas,
} from '@/lib/subirFotos'
import { saveOriginPhoto, saveReportWithFile, deleteReport, fetchReportFile } from '@/lib/dataClient'
import OriginPhotoGallery from '../OriginPhotoGallery'

// ── Helpers puros (testeables) ──────────────────────────────────────────────

/** Fotos de una operación y etapa. Etapa 'origen' absorbe photoType vacío o
 *  valores legacy ('destino'/'otro') — mismo criterio que el badge de la galería
 *  y que el default del server (photo_type || 'origen'). */
export function photosForStage(photos: OriginPhoto[], ref: string, stage: PhotoLocation): OriginPhoto[] {
  return photos.filter(p =>
    p.shipmentRef === ref &&
    (stage === 'uruguay' ? p.photoType === 'uruguay' : p.photoType !== 'uruguay'),
  )
}

/** Merge del subset que devuelve OriginPhotoGallery tras borrar: saca del listado
 *  global las fotos que estaban en el subset mostrado y agrega las que quedaron. */
export function mergePhotoSubset(all: OriginPhoto[], shownSubset: OriginPhoto[], updatedSubset: OriginPhoto[]): OriginPhoto[] {
  const shownIds = new Set(shownSubset.map(p => p.id))
  return [...updatedSubset, ...all.filter(p => !shownIds.has(p.id))]
}

/** Informes de una operación, más recientes primero (criterio del dialog viejo). */
export function reportsForRef(reports: OperativeReport[], ref: string): OperativeReport[] {
  return reports.filter(r => r.shipmentRef === ref).sort((a, b) => b.createdAt - a.createdAt)
}

// Los límites de fotos (cantidad por lote, peso, paralelismo) viven en
// subirFotos.ts, que además decide qué se sube y qué queda afuera.
const MAX_REPORT_BYTES = 3 * 1024 * 1024   // 3MB por informe

const STAGES: { stage: PhotoLocation; label: string }[] = [
  { stage: 'origen', label: 'Carga en origen' },
  { stage: 'uruguay', label: 'Carga en Uruguay' },
]

export default function OperationMediaSection({
  shipmentRef,
  originPhotos,
  reports,
  onUpdateOriginPhotos,
  onUpdateReports,
  hideHeader,
}: {
  shipmentRef: string
  originPhotos: OriginPhoto[]
  reports: OperativeReport[]
  onUpdateOriginPhotos?: (photos: OriginPhoto[]) => void
  onUpdateReports?: (reports: OperativeReport[]) => void
  /** Ocultar el h4 "Fotos e informes" — cuando la sección vive dentro de un
   *  Dialog cuyo DialogTitle ya cumple ese rol (chip del header del panel). */
  hideHeader?: boolean
}) {
  const photoInputOrigen = useRef<HTMLInputElement>(null)
  const photoInputUruguay = useRef<HTMLInputElement>(null)
  const reportInput = useRef<HTMLInputElement>(null)
  const [uploadingStage, setUploadingStage] = useState<PhotoLocation | null>(null)
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })
  const [uploadingReport, setUploadingReport] = useState(false)
  const [busyReportId, setBusyReportId] = useState<string | null>(null)

  const opReports = reportsForRef(reports, shipmentRef)
  const canEditPhotos = !!onUpdateOriginPhotos
  const canEditReports = !!onUpdateReports

  // ── Fotos ──
  const handlePhotoFiles = async (stage: PhotoLocation, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''   // permite volver a elegir los mismos archivos
    if (files.length === 0 || !onUpdateOriginPhotos) return

    // No es todo o nada: se sube lo que se puede y se dice qué quedó afuera.
    const sel = clasificarSeleccion(files)
    const aviso = avisoDescartes(sel)
    if (sel.aceptadas.length === 0) {
      toast.error(`No se puede subir nada: ${aviso}`)
      return
    }
    if (aviso) {
      toast.warning(`Se suben ${sel.aceptadas.length} de ${files.length}`, { description: `${aviso}.` })
    }

    setUploadingStage(stage)
    setUploadProgress({ current: 0, total: sel.aceptadas.length })
    // El lote entero comparte el timestamp: el índice es lo que separa los ids.
    const lote = Date.now()
    const { ok, errores } = await subirEnTandas(
      sel.aceptadas,
      async (file, i) => {
        const { full, thumbnail } = await processPhoto(file)
        const photo: OriginPhoto = {
          id: `photo-${lote}-${i}`,
          shipmentRef,
          photoType: stage,
          fileName: file.name,
          fileType: file.type,
          fileData: full,
          thumbnailData: thumbnail,
          createdAt: Date.now(),
          createdBy: '',        // lo estampa el server desde el token
        }
        await saveOriginPhoto(photo)
        return { ...photo, fileData: undefined } as OriginPhoto   // sin fileData en el estado local
      },
      (hechas, total) => setUploadProgress({ current: hechas, total }),
    )

    // Las que subieron entran al estado aunque otras hayan fallado.
    if (ok.length > 0) onUpdateOriginPhotos([...ok, ...originPhotos])
    setUploadingStage(null)

    if (errores.length > 0) {
      console.error('Photo upload errors:', errores)
      toast.error(`${errores.length} de ${sel.aceptadas.length} no se pudieron subir`, {
        description: errores[0].error.message,
      })
    } else {
      toast.success(`${ok.length} foto${ok.length > 1 ? 's' : ''} subida${ok.length > 1 ? 's' : ''}`)
    }
  }

  // ── Informes ──
  const handleReportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !onUpdateReports) return
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    if (!isPdf) {
      toast.error('Solo se aceptan archivos PDF')
      return
    }
    if (file.size > MAX_REPORT_BYTES) {
      toast.error('El archivo no debe superar los 3MB')
      return
    }

    setUploadingReport(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = ev => resolve(ev.target?.result as string)
        reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
        reader.readAsDataURL(file)
      })
      const report: OperativeReport = {
        id: `rpt-${Date.now()}`,
        shipmentRef,
        title: file.name.replace(/\.pdf$/i, ''),
        content: '',
        fileName: file.name,
        fileType: file.type || 'application/pdf',
        fileData: base64,
        createdAt: Date.now(),
        createdBy: 'admin',
      }
      await saveReportWithFile(report)
      onUpdateReports([...reports, { ...report, fileData: undefined }])
      toast.success(`Informe agregado a ${shipmentRef}`)
    } catch (err) {
      console.error('Report upload error:', err)
      toast.error(`Error al subir el informe: ${(err as Error)?.message || 'error'}`)
    } finally {
      setUploadingReport(false)
    }
  }

  const handleDownloadReport = async (report: OperativeReport) => {
    setBusyReportId(report.id)
    try {
      const fileData = report.fileData || await fetchReportFile(report.id)
      if (!fileData) {
        toast.error('Archivo no disponible en el servidor')
        return
      }
      const link = document.createElement('a')
      link.href = fileData
      link.download = report.fileName || `${report.title}.pdf`
      link.click()
    } catch {
      toast.error('Error al descargar el archivo')
    } finally {
      setBusyReportId(null)
    }
  }

  const handleDeleteReport = async (report: OperativeReport) => {
    if (!onUpdateReports) return
    if (!confirm(`¿Eliminar el informe "${report.title}"?`)) return
    setBusyReportId(report.id)
    try {
      await deleteReport(report.id)
      onUpdateReports(reports.filter(r => r.id !== report.id))
      toast.success('Informe eliminado')
    } catch (err) {
      console.warn('[DB] Failed to delete report:', err)
      toast.error('No se pudo eliminar el informe')
    } finally {
      setBusyReportId(null)
    }
  }

  return (
    <section>
      {!hideHeader && (
        <h4 className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 pb-1 border-b">
          Fotos e informes
        </h4>
      )}

      <div className="space-y-4">
        {STAGES.map(({ stage, label }) => {
          const stagePhotos = photosForStage(originPhotos, shipmentRef, stage)
          const inputRef = stage === 'origen' ? photoInputOrigen : photoInputUruguay
          const uploading = uploadingStage === stage
          return (
            <div key={stage}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {label} ({stagePhotos.length})
                </p>
                {canEditPhotos && (
                  <>
                    {/* accept="image/*" sin capture: en el celu ofrece cámara o galería */}
                    <input
                      ref={inputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={e => handlePhotoFiles(stage, e)}
                    />
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      disabled={uploadingStage !== null}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                    >
                      {uploading ? (
                        <><SpinnerGap size={11} className="animate-spin" /> Subiendo {uploadProgress.current}/{uploadProgress.total}…</>
                      ) : (
                        <><Camera size={11} /> Subir fotos (hasta {MAX_FOTOS_POR_LOTE})</>
                      )}
                    </button>
                  </>
                )}
              </div>
              {/* Con lotes grandes el contador del botón no alcanza: la barra
                  muestra cuánto falta de verdad (avanza al TERMINAR cada foto). */}
              {uploading && uploadProgress.total > 0 && (
                <div className="h-1 w-full rounded-full bg-muted overflow-hidden mb-2" role="progressbar"
                  aria-valuenow={uploadProgress.current} aria-valuemin={0} aria-valuemax={uploadProgress.total}>
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%` }}
                  />
                </div>
              )}
              {stagePhotos.length > 0 ? (
                <OriginPhotoGallery
                  photos={stagePhotos}
                  isAdmin={canEditPhotos}
                  onDeletePhoto={updated => {
                    onUpdateOriginPhotos?.(mergePhotoSubset(originPhotos, stagePhotos, updated))
                  }}
                />
              ) : (
                <p className="text-xs text-muted-foreground">Sin fotos</p>
              )}
            </div>
          )
        })}

        {/* Informes PDF */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Informes PDF ({opReports.length})
            </p>
            {canEditReports && (
              <>
                <input
                  ref={reportInput}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleReportFile}
                />
                <button
                  type="button"
                  onClick={() => reportInput.current?.click()}
                  disabled={uploadingReport}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                >
                  {uploadingReport ? (
                    <><SpinnerGap size={11} className="animate-spin" /> Subiendo…</>
                  ) : (
                    <><Plus size={11} /> Subir PDF</>
                  )}
                </button>
              </>
            )}
          </div>
          {opReports.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin informes</p>
          ) : (
            <div className="space-y-1.5">
              {opReports.map(r => (
                <div key={r.id} className="flex items-center gap-2 rounded-md border px-2.5 py-2">
                  <FilePdf size={18} className="text-red-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium leading-snug truncate">{r.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {new Date(r.createdAt).toLocaleDateString('es-UY')}
                      {r.containerNumber ? ` · ${r.containerNumber}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownloadReport(r)}
                    disabled={busyReportId === r.id}
                    title="Descargar informe"
                    className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/5 disabled:opacity-50"
                  >
                    {busyReportId === r.id ? <SpinnerGap size={15} className="animate-spin" /> : <DownloadSimple size={15} />}
                  </button>
                  {canEditReports && (
                    <button
                      type="button"
                      onClick={() => handleDeleteReport(r)}
                      disabled={busyReportId === r.id}
                      title="Eliminar informe"
                      className="p-1.5 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
