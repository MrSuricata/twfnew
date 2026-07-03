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

// Límites del pipeline existente (ShipmentTracking):
const MAX_PHOTOS_PER_BATCH = 10
const MAX_PHOTO_BYTES = 10 * 1024 * 1024   // 10MB por foto (antes de comprimir)
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
    if (files.length > MAX_PHOTOS_PER_BATCH) {
      toast.error(`Máximo ${MAX_PHOTOS_PER_BATCH} fotos por vez`)
      return
    }
    const oversized = files.filter(f => f.size > MAX_PHOTO_BYTES)
    if (oversized.length > 0) {
      toast.error(`${oversized.length} archivo(s) superan los 10MB`)
      return
    }

    setUploadingStage(stage)
    setUploadProgress({ current: 0, total: files.length })
    const newPhotos: OriginPhoto[] = []
    try {
      for (let i = 0; i < files.length; i++) {
        setUploadProgress({ current: i + 1, total: files.length })
        const file = files[i]
        const { full, thumbnail } = await processPhoto(file)
        const photo: OriginPhoto = {
          id: `photo-${Date.now()}-${i}`,
          shipmentRef,
          photoType: stage,
          fileName: file.name,
          fileType: file.type,
          fileData: full,
          thumbnailData: thumbnail,
          createdAt: Date.now(),
          createdBy: 'admin',
        }
        await saveOriginPhoto(photo)
        newPhotos.push({ ...photo, fileData: undefined })   // sin fileData en el estado local
      }
      toast.success(`${newPhotos.length} foto${newPhotos.length > 1 ? 's' : ''} subida${newPhotos.length > 1 ? 's' : ''}`)
    } catch (err) {
      console.error('Photo upload error:', err)
      toast.error(`Error al subir fotos: ${(err as Error)?.message || 'error'}`)
    } finally {
      // Las que se alcanzaron a subir entran al estado aunque una haya fallado.
      if (newPhotos.length > 0) onUpdateOriginPhotos([...newPhotos, ...originPhotos])
      setUploadingStage(null)
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
                        <><Camera size={11} /> Subir fotos</>
                      )}
                    </button>
                  </>
                )}
              </div>
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
