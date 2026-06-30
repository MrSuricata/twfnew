// PDF "Estado de mis cargas" para el portal del cliente — read-only, sin datos
// financieros. Formato visual estilo PLAN OPERATIVO de TWF (landscape, logo
// arriba-izquierda, header de tabla azul #4A90D9, filas alternadas, footer
// confidencial). Reusa jsPDF + autotable (import dinámico).
import type { ParsedShipment } from './shipmentTypes'
import { getShipmentStatus } from './shipmentTypes'
import type { Brand } from './brand'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const HEADER_BLUE = '#4A90D9'              // azul header plan-operativo
const ALT_ROW: [number, number, number] = [240, 244, 250]  // #f0f4fa

const isoOr = (v: string | undefined) => (v && ISO.test(v) ? v : '')

function firstSalida(s: ParsedShipment): string {
  const ds = (s.operativas || []).map(o => o.SALIDA).filter((d): d is string => !!d && ISO.test(d)).sort()
  return ds[0] || ''
}
function firstEtaFisc(s: ParsedShipment): string {
  const ds = (s.operativas || []).map(o => o.ETA_FISC).filter((d): d is string => !!d && ISO.test(d)).sort()
  return ds[0] || ''
}
function libreHasta(s: ParsedShipment): string {
  return isoOr(s.calculatedLibreHasta) || isoOr(s.LIBRE_HASTA)
}
function sumOp(s: ParsedShipment, k: 'PKGS' | 'KG'): string {
  const t = (s.operativas || []).reduce((acc, o) => acc + (Number(o[k]) || 0), 0)
  return t ? (k === 'KG' ? Math.round(t).toLocaleString('es-UY') : String(t)) : ''
}
function descripcion(s: ParsedShipment): string {
  return (s.operativas || []).map(o => o.DESCRIPCION).find(Boolean) || ''
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
      await new Promise<void>((ok, err) => { img.onload = () => ok(); img.onerror = () => err(new Error('logo')); img.src = objUrl })
      const w = img.naturalWidth || 600, h = img.naturalHeight || 160
      const canvas = document.createElement('canvas')
      canvas.width = 600; canvas.height = Math.round((h / w) * 600)
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      return { png: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height }
    } finally { URL.revokeObjectURL(objUrl) }
  } catch { return null }
}

/**
 * Descarga un PDF (formato plan-operativo, landscape) con el estado de las
 * cargas activas del cliente. Sin datos financieros.
 */
export async function downloadClientStatusPdf(
  shipments: ParsedShipment[],
  clientName: string,
  brand: Brand,
  now: Date = new Date()
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 12

  // Header: logo arriba-izquierda + título + subtítulo (estilo plan-operativo)
  const logo = await logoDataUrl(brand.logo.full)
  if (logo) {
    const h = 12, w = (logo.w / logo.h) * h
    doc.addImage(logo.png, 'PNG', margin, 9, w, h)
  }
  doc.setTextColor(HEADER_BLUE)
  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.text('ESTADO DE MIS CARGAS', margin, 28)
  doc.setTextColor(90)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  const generado = now.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' })
  doc.text(`${clientName}  ·  ${shipments.length} carga(s) activa(s)  ·  Generado: ${generado}`, margin, 33)

  const rows = shipments.map(s => {
    const st = getShipmentStatus(s)
    return [
      (s.REF || '').replace(/^A/i, ''),
      st.label,
      s.TIPO || '',
      sumOp(s, 'PKGS'),
      sumOp(s, 'KG'),
      descripcion(s),
      isoOr(s.ETA) || s.ETA || '',
      s.TERMINAL || '',
      firstSalida(s),
      firstEtaFisc(s),
      libreHasta(s),
      s.BUQUE || '',
    ]
  })

  autoTable(doc, {
    startY: 38,
    head: [['Ref', 'Estado', 'Tipo', 'Bultos', 'Kg', 'Descripción', 'ETA MVD', 'Terminal', 'Salida', 'ETA Fiscal', 'Libre', 'Buque']],
    body: rows.length ? rows : [['', 'Sin cargas activas', '', '', '', '', '', '', '', '', '', '']],
    margin: { left: margin, right: margin },
    styles: { fontSize: 7.5, cellPadding: 1.4, overflow: 'ellipsize', valign: 'middle' },
    headStyles: { fillColor: HEADER_BLUE, textColor: '#ffffff', fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: ALT_ROW },
    columnStyles: {
      0: { cellWidth: 16 }, 1: { cellWidth: 30 }, 2: { cellWidth: 14 }, 3: { cellWidth: 14, halign: 'right' },
      4: { cellWidth: 18, halign: 'right' }, 5: { cellWidth: 50 }, 8: { cellWidth: 20 }, 9: { cellWidth: 20 },
      10: { cellWidth: 20 },
    },
  })

  // Footer en todas las páginas
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setTextColor(130)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `Página ${i} de ${pages}  —  Documento confidencial — ${brand.legalName}`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 6,
      { align: 'center' }
    )
  }

  const slug = clientName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  doc.save(`estado-cargas-${slug || 'cliente'}-${now.toISOString().slice(0, 10)}.pdf`)
}
