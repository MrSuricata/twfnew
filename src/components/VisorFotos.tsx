/**
 * El visor de fotos: pantalla completa, flechas, teclado, y la foto grande
 * pedida al server recién cuando se la abre.
 *
 * Vivía adentro de `OriginPhotoGallery` (galería + visor en un solo
 * componente). Desde el rediseño 04/09 (D3) la card "Novedades de tus cargas"
 * abre el visor DIRECTO desde una miniatura, sin galería en el medio, así que
 * esta parte se separa: una sola implementación del "traer el full y
 * mostrarlo", usada por la galería del admin y por el aviso del cliente.
 *
 * La foto grande se pide con `fetchOriginPhotoFile` (URL firmada de 1 h, o el
 * base64 viejo). Mientras llega —o si el pedido falla, que es lo que pasa en
 * la vista previa /ui, donde no hay sesión— se ve la miniatura: nunca un
 * cuadro negro.
 */
import { useEffect, useState } from 'react'
import type { OriginPhoto } from '@/lib/quotationTypes'
import { fetchOriginPhotoFile } from '@/lib/dataClient'
import OriginPhotoLightbox from './OriginPhotoLightbox'

export default function VisorFotos({ fotos, indice, onIndice, onCerrar }: {
  /** Las fotos que se pueden recorrer con las flechas. */
  fotos: OriginPhoto[]
  /** Cuál se está mirando. Lo maneja el padre (así puede abrir en una foto). */
  indice: number
  onIndice: (i: number) => void
  onCerrar: () => void
}) {
  const [full, setFull] = useState<Record<string, string>>({})
  const [pidiendo, setPidiendo] = useState<string | null>(null)
  const foto = fotos[indice]
  const id = foto?.id || ''

  // Se pide el full de la foto que se está mirando (una vez por foto). El
  // efecto cubre tanto abrir como navegar con las flechas: antes eran dos
  // callbacks con el mismo cuerpo copiado.
  useEffect(() => {
    if (!id || full[id]) return
    let vivo = true
    setPidiendo(id)
    fetchOriginPhotoFile(id)
      .then(data => { if (vivo && data) setFull(prev => ({ ...prev, [id]: data })) })
      .catch(() => { /* se queda la miniatura, que ya está a la vista */ })
      .finally(() => { if (vivo) setPidiendo(p => (p === id ? null : p)) })
    return () => { vivo = false }
  }, [id, full])

  if (!foto) return null
  return (
    <OriginPhotoLightbox
      photos={fotos}
      currentIndex={indice}
      fullImages={full}
      loadingId={pidiendo}
      onNavigate={onIndice}
      onClose={onCerrar}
    />
  )
}
