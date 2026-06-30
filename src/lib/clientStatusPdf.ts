// PDF de estado de cargas del cliente — CALCA el formato del PLAN OPERATIVO de TWF:
// landscape, logo arriba-izquierda, header de tabla azul #4A90D9, filas alternadas,
// UNA FILA POR CONTENEDOR, 2 secciones (con salida programada / pendientes), footer
// confidencial. Read-only, sin datos financieros. EXCLUYE las cargas que ya llegaron
// a fiscal (ETA Fiscal <= hoy) o devueltas — no se muestran. jsPDF + autotable dinámico.
import type { ParsedShipment, OperativasRecord } from './shipmentTypes'
import type { Brand } from './brand'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const HEADER_BLUE = '#4A90D9'
const ALT_ROW: [number, number, number] = [240, 244, 250]   // #f0f4fa

const isoOr = (v: string | undefined): string => (v && ISO.test(v) ? v : '')
const pad = (n: number) => String(n).padStart(2, '0')

interface PdfRow { sort: string; cells: (string | number)[] }

/** Arma las filas por-contenedor, excluyendo las que ya llegaron a fiscal / devueltas. */
function buildRows(shipments: ParsedShipment[], todayISO: string): { prog: PdfRow[]; pend: PdfRow[] } {
  const prog: PdfRow[] = []
  const pend: PdfRow[] = []
  for (const s of shipments) {
    const ops: (OperativasRecord | null)[] = s.operativas && s.operativas.length ? s.operativas : [null]
    for (const o of ops) {
      const libre = (o?.LIBRE || '').trim()
      const etaFisc = isoOr(o?.ETA_FISC)
      // EXCLUIR: ya llegó a fiscal (ETA Fiscal <= hoy) o contenedor devuelto.
      if (etaFisc && etaFisc <= todayISO) continue
      if (libre.toUpperCase().includes('DEVUELTO')) continue
      const salida = isoOr(o?.SALIDA)
      const etaMvd = isoOr(s.ETA) || (s.ETA || '')
      const cells: (string | number)[] = [
        (s.REF || '').replace(/^A/i, ''),
        o?.CNTR_OP || '',
        o?.TIPO || s.TIPO || '',
        o?.PKGS || '',
        o?.KG ? Math.round(Number(o.KG)).toLocaleString('es-UY') : '',
        o?.DESCRIPCION || '',
        etaMvd,
        s.TERMINAL || '',
        o?.OPERATIVA || '',
        salida,
        etaFisc,
        ISO.test(libre) ? libre : '',
        s.BUQUE || '',
      ]
      if (salida) prog.push({ sort: salida, cells })
      else pend.push({ sort: isoOr(s.ETA) || '9999-12-31', cells })
    }
  }
  prog.sort((a, b) => a.sort.localeCompare(b.sort))
  pend.sort((a, b) => a.sort.localeCompare(b.sort))
  return { prog, pend }
}

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

const HEAD = [['Ref', 'CNTR', 'Tipo', 'Bultos', 'Kg', 'Descripción', 'ETA MVD', 'Terminal', 'Operativa', 'Salida', 'ETA Fiscal', 'LIBRE', 'Buque']]
const COL_STYLES = {
  0: { cellWidth: 14 }, 1: { cellWidth: 26 }, 2: { cellWidth: 13 }, 3: { cellWidth: 13, halign: 'right' as const },
  4: { cellWidth: 16, halign: 'right' as const }, 5: { cellWidth: 44 }, 6: { cellWidth: 20 }, 8: { cellWidth: 20 },
  9: { cellWidth: 20 }, 10: { cellWidth: 20 }, 11: { cellWidth: 20 },
}

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
  const todayISO = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const { prog, pend } = buildRows(shipments, todayISO)

  // Header: logo arriba-izquierda + título + subtítulo (formato plan-operativo)
  const logo = await logoDataUrl(brand.logo.full)
  if (logo) { const h = 12, w = (logo.w / logo.h) * h; doc.addImage(logo.png, 'PNG', margin, 9, w, h) }
  doc.setTextColor(HEADER_BLUE); doc.setFontSize(15); doc.setFont('helvetica', 'bold')
  doc.text(`ESTADO DE CARGAS — ${clientName}`, margin, 28)
  doc.setTextColor(90); doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  const fecha = now.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' })
  doc.text(`${brand.legalName} — Montevideo, Uruguay — ${fecha}`, margin, 33)

  const tableOpts = (startY: number, body: (string | number)[][]) => ({
    startY, head: HEAD, body,
    margin: { left: margin, right: margin },
    styles: { fontSize: 7.5, cellPadding: 1.4, overflow: 'ellipsize' as const, valign: 'middle' as const },
    headStyles: { fillColor: HEADER_BLUE, textColor: '#ffffff', fontStyle: 'bold' as const, fontSize: 7.5 },
    alternateRowStyles: { fillColor: ALT_ROW },
    columnStyles: COL_STYLES,
  })
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  let y = 40
  // Sección 1: con salida programada
  doc.setTextColor(HEADER_BLUE); doc.setFontSize(10); doc.setFont('helvetica', 'bold')
  doc.text(`CARGAS CON SALIDA PROGRAMADA — ${prog.length} contenedor(es)`, margin, y)
  doc.setTextColor(120); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal')
  doc.text('Ordenado por: Fecha de salida', margin, y + 4)
  autoTable(doc, tableOpts(y + 6, prog.length ? prog.map(r => r.cells) : [['', '', '', '', '', 'Sin cargas con salida programada', '', '', '', '', '', '', '']]))
  y = lastY() + 10

  // Sección 2: pendientes de programar
  if (y > 175) { doc.addPage(); y = 20 }
  doc.setTextColor(HEADER_BLUE); doc.setFontSize(10); doc.setFont('helvetica', 'bold')
  doc.text(`CARGAS PENDIENTES DE PROGRAMAR — ${pend.length} contenedor(es)`, margin, y)
  doc.setTextColor(120); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal')
  doc.text('Ordenado por: ETA MVD', margin, y + 4)
  autoTable(doc, tableOpts(y + 6, pend.length ? pend.map(r => r.cells) : [['', '', '', '', '', 'Sin cargas pendientes', '', '', '', '', '', '', '']]))

  // Nota + footer en todas las páginas
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setTextColor(150); doc.setFontSize(6.5); doc.setFont('helvetica', 'italic')
    doc.text('Las fechas de salida son tentativas y pueden variar según disponibilidad operativa.', margin, doc.internal.pageSize.getHeight() - 10)
    doc.setTextColor(130); doc.setFontSize(7); doc.setFont('helvetica', 'normal')
    doc.text(`Página ${i} de ${pages}  —  Documento confidencial — ${brand.legalName}`, pageW / 2, doc.internal.pageSize.getHeight() - 5, { align: 'center' })
  }

  const slug = clientName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  doc.save(`estado-cargas-${slug || 'cliente'}-${now.toISOString().slice(0, 10)}.pdf`)
}
