import { useState } from 'react'
import { Camera, Trash, SpinnerGap } from '@phosphor-icons/react'
import { OriginPhoto } from '@/lib/quotationTypes'
import { fetchOriginPhotoFile, deleteOriginPhoto } from '@/lib/dataClient'
import OriginPhotoLightbox from './OriginPhotoLightbox'

interface OriginPhotoGalleryProps {
  photos: OriginPhoto[]
  isAdmin?: boolean
  onDeletePhoto?: (updatedPhotos: OriginPhoto[]) => void
}

export default function OriginPhotoGallery({ photos, isAdmin = false, onDeletePhoto }: OriginPhotoGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [fullImages, setFullImages] = useState<Record<string, string>>({})
  const [loadingFull, setLoadingFull] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const openLightbox = async (index: number) => {
    setLightboxIndex(index)
    const photo = photos[index]
    if (photo && !fullImages[photo.id]) {
      setLoadingFull(photo.id)
      const fileData = await fetchOriginPhotoFile(photo.id)
      if (fileData) {
        setFullImages(prev => ({ ...prev, [photo.id]: fileData }))
      }
      setLoadingFull(null)
    }
  }

  const handleNavigate = async (newIndex: number) => {
    setLightboxIndex(newIndex)
    const photo = photos[newIndex]
    if (photo && !fullImages[photo.id]) {
      setLoadingFull(photo.id)
      const fileData = await fetchOriginPhotoFile(photo.id)
      if (fileData) {
        setFullImages(prev => ({ ...prev, [photo.id]: fileData }))
      }
      setLoadingFull(null)
    }
  }

  const handleDelete = async (e: React.MouseEvent, photoId: string) => {
    e.stopPropagation()
    if (!confirm('Eliminar esta foto?')) return
    setDeletingId(photoId)
    try {
      await deleteOriginPhoto(photoId)
      const updated = photos.filter(p => p.id !== photoId)
      if (onDeletePhoto) onDeletePhoto(updated)
    } catch (err) {
      console.error('Delete photo error:', err)
    } finally {
      setDeletingId(null)
    }
  }

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Camera size={48} weight="thin" className="mb-3 opacity-50" />
        <p className="text-sm font-medium">No hay fotos de origen</p>
        <p className="text-xs mt-1">Las fotos se agregan desde el panel de administración</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {photos.map((photo, index) => (
          <div
            key={photo.id}
            className="group relative aspect-square rounded-lg overflow-hidden border bg-muted cursor-pointer hover:ring-2 hover:ring-accent/50 transition-all"
            onClick={() => openLightbox(index)}
          >
            <img
              src={photo.thumbnailData}
              alt={photo.caption || photo.fileName}
              className="w-full h-full object-cover"
              loading="lazy"
            />

            {/* Caption overlay */}
            {photo.caption && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
                <p className="text-white text-[10px] truncate">{photo.caption}</p>
              </div>
            )}

            {/* Location + container badge */}
            <div className="absolute top-1 left-1 flex gap-1">
              <div className={`text-white text-[9px] px-1.5 py-0.5 rounded ${photo.photoType === 'uruguay' ? 'bg-blue-600/80' : 'bg-emerald-600/80'}`}>
                {photo.photoType === 'uruguay' ? '🇺🇾 UY' : '🌎 Origen'}
              </div>
              {photo.containerNumber && (
                <div className="bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded">
                  {photo.containerNumber}
                </div>
              )}
            </div>

            {/* Admin delete button */}
            {isAdmin && (
              <button
                className="absolute top-1 right-1 bg-red-500/80 hover:bg-red-600 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => handleDelete(e, photo.id)}
                disabled={deletingId === photo.id}
              >
                {deletingId === photo.id ? (
                  <SpinnerGap size={14} className="animate-spin" />
                ) : (
                  <Trash size={14} />
                )}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <OriginPhotoLightbox
          photos={photos}
          currentIndex={lightboxIndex}
          fullImages={fullImages}
          loadingId={loadingFull}
          onNavigate={handleNavigate}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  )
}
