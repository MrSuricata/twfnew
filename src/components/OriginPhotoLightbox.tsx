import { useEffect, useCallback } from 'react'
import { X as XIcon, CaretLeft, CaretRight, SpinnerGap } from '@phosphor-icons/react'
import { OriginPhoto } from '@/lib/quotationTypes'

interface OriginPhotoLightboxProps {
  photos: OriginPhoto[]
  currentIndex: number
  fullImages: Record<string, string>
  loadingId: string | null
  onNavigate: (index: number) => void
  onClose: () => void
}

export default function OriginPhotoLightbox({
  photos,
  currentIndex,
  fullImages,
  loadingId,
  onNavigate,
  onClose,
}: OriginPhotoLightboxProps) {
  const photo = photos[currentIndex]
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < photos.length - 1

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'ArrowLeft' && hasPrev) onNavigate(currentIndex - 1)
    if (e.key === 'ArrowRight' && hasNext) onNavigate(currentIndex + 1)
  }, [onClose, onNavigate, currentIndex, hasPrev, hasNext])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [handleKeyDown])

  if (!photo) return null

  const imageSrc = fullImages[photo.id] || photo.thumbnailData
  const isLoading = loadingId === photo.id

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.92)' }}
      onClick={onClose}
    >
      {/* Close button */}
      <button
        className="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors z-10"
        onClick={onClose}
      >
        <XIcon size={28} weight="bold" />
      </button>

      {/* Prev arrow */}
      {hasPrev && (
        <button
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white p-3 rounded-full hover:bg-white/10 transition-colors z-10"
          onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex - 1) }}
        >
          <CaretLeft size={36} weight="bold" />
        </button>
      )}

      {/* Next arrow */}
      {hasNext && (
        <button
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white p-3 rounded-full hover:bg-white/10 transition-colors z-10"
          onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex + 1) }}
        >
          <CaretRight size={36} weight="bold" />
        </button>
      )}

      {/* Image */}
      <div
        className="relative max-w-[90vw] max-h-[85vh] flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <SpinnerGap size={48} className="animate-spin text-white/50" />
          </div>
        )}
        <img
          src={imageSrc}
          alt={photo.caption || photo.fileName}
          className="max-w-full max-h-[80vh] object-contain rounded-lg"
          style={{ opacity: isLoading ? 0.4 : 1, transition: 'opacity 0.3s' }}
        />

        {/* Caption bar */}
        <div className="mt-3 text-center max-w-lg">
          {photo.caption && (
            <p className="text-white text-sm font-medium">{photo.caption}</p>
          )}
          <div className="flex items-center justify-center gap-3 mt-1 text-white/50 text-xs">
            {photo.containerNumber && <span>{photo.containerNumber}</span>}
            <span>{photo.fileName}</span>
            <span>{new Date(photo.createdAt).toLocaleDateString('es-UY')}</span>
            <span>{currentIndex + 1} / {photos.length}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
