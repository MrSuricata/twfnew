// PDF "Estado de mis cargas" para el portal del cliente — read-only, sin datos
// financieros (los shipments del cliente ya vienen stripeados server-side).
// Reusa el patrón de analyticsPdf.ts (jsPDF + autotable, import dinámico) y se
// adapta a la marca activa (TWF / Mediterránea) por hostname.
import type { ParsedShipment } from './shipmentTypes'
import { getShipmentStatus } from './shipmentTypes'
import type { Brand } from './brand'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const BRAND_COLOR: Record<string, string> = { twf: '#1e40af', med: '#261c79' }

/** Primera SALIDA ISO (la más temprana) del array de operativas, o ''. */
function firstSalida(s: ParsedShipment): string {
  const dates = (s.operativas || [])
    .map(o => o.SALIDA)
    .filter((d): d is string => typeof d === 'string' && ISO.test(d))
    .sort()
  return dates[0] || ''
}

function libreHasta(s: ParsedShipment): string {
  const v = s.calculatedLibreHasta || s.LIBRE_HASTA || ''
  return ISO.test(v) ? v : ''
}

/** Carga el logo de la marca (SVG o PNG) y lo rasteriza a PNG para jsPDF. */
async function logoDataUrl(url: string): Promise<{ png: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return null
    const blob = await res.blob()
    const objUrl = URL.createObjectURL(blob)
    try {
      const img = new Image()
      await new Promise<void>((ok, err) => {
        img.onload = () => ok()
        img.onerror = () => err(new Error('logo'))
        img.src = objUrl
      })
      const w = img.naturalWidth || 600
      const h = img.naturalHeight || 160
      const canvas = document.createElement('canvas')
      canvas.width = 600
      canvas.height = Math.round((h / w) * 600)
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      return { png: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height }
    } finally {
      URL.revokeObjectURL(objUrl)
    }
  } catch {
    return null
  }
}

/**
 * Descarga un PDF con el estado de las cargas (activas) del cliente.
 * @param shipments cargas ya filtradas por cliente (las que ve en el portal)
 * @param clientName nombre del cliente para el encabezado y el filename
 * @param brand marca activa (define color, logo y pie)
 */
export async function downloadClientStatusPdf(
  shipments: ParsedShipment[],
  clientName: string,
  brand: Brand,
  now: Date = new Date()
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const color = BRAND_COLOR[brand.id] || '#1e40af'
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14

  // Header: logo (o nombre) + título + cliente/fecha
  const logo = await logoDataUrl(brand.logo.full)
  if (logo) {
    const h = 14
    const w = (logo.w / logo.h) * h
    doc.addImage(logo.png, 'PNG', margin, 12, w, h)
  } else {
    doc.setTextColor(color)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(brand.displayName.toUpperCase(), margin, 20)
  }
  doc.setTextColor(color)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('ESTADO DE MIS CARGAS', margin, 34)
  doc.setTextColor(90)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  const generado = now.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' })
  doc.text(`${clientName}  ·  ${shipments.length} carga(s) activa(s)  ·  Generado: ${generado}`, margin, 40)

  const rows = shipments.map(s => {
    const st = getShipmentStatus(s)
    return [
      s.REF || '',
      st.label,
      ISO.test(s.ETA || '') ? s.ETA : (s.ETA || ''),
      firstSalida(s),
      libreHasta(s),
      String(s.N || s.containers?.length || ''),
      s.BUQUE || '',
      s.TERMINAL || '',
    ]
  })

  autoTable(doc, {
    startY: 48,
    head: [['Ref', 'Estado', 'ETA', 'Salida MVD', 'Libre hasta', 'Cont.', 'Buque', 'Terminal']],
    body: rows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 1.6, overflow: 'ellipsize' },
    headStyles: { fillColor: color, textColor: '#ffffff', fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [240, 241, 248] as [number, number, number] },
    columnStyles: { 6: { cellWidth: 28 }, 7: { cellWidth: 20 } },
  })

  if (rows.length === 0) {
    doc.setTextColor(120)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text('No hay cargas activas en este momento.', margin, 56)
  }

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setTextColor(130)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `Página ${i} de ${pages} · ${brand.displayName} — Estado informativo, no vinculante`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 7,
      { align: 'center' }
    )
  }

  const slug = clientName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  doc.save(`estado-cargas-${slug || 'cliente'}-${now.toISOString().slice(0, 10)}.pdf`)
}
