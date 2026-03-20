/**
 * Client-side image compression using Canvas API.
 * No external dependencies — uses browser built-ins.
 */

/**
 * Compress an image file to a JPEG base64 data URL.
 * @param file - The image File to compress
 * @param maxWidth - Maximum width in pixels (height scales proportionally)
 * @param quality - JPEG quality (0.0 to 1.0)
 * @returns base64 data URL string
 */
export function compressImage(file: File, maxWidth: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      let { width, height } = img

      // Scale down if wider than maxWidth
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width = maxWidth
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas 2D context not available'))
        return
      }

      ctx.drawImage(img, 0, 0, width, height)

      // Export as JPEG
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      resolve(dataUrl)
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Failed to load image: ${file.name}`))
    }

    img.src = url
  })
}

/**
 * Generate both full-size and thumbnail versions of an image.
 */
export async function processPhoto(file: File): Promise<{ full: string; thumbnail: string }> {
  const [full, thumbnail] = await Promise.all([
    compressImage(file, 800, 0.65),   // ~150-250KB (optimized for email attachments)
    compressImage(file, 300, 0.6),    // ~30-80KB (gallery thumbnails)
  ])
  return { full, thumbnail }
}
