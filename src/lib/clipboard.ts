import { toast } from 'sonner'

export async function copyToClipboard(text: string, label?: string): Promise<void> {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label || 'Copiado'}: ${text}`, { duration: 2000 })
  } catch (err) {
    // Fallback: select-and-copy para browsers viejos
    console.warn('[clipboard] writeText failed:', err)
    toast.error('No se pudo copiar')
  }
}
