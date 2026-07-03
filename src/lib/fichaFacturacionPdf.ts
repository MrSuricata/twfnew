// PDF "Ficha de facturación" por carga — gastos (compra) vs venta con
// resultado. Patrón brand-aware de clientStatusPdf: logo + wordmark de
// getBrand(), acento índigo Mediterránea / azul TWF, footer confidencial
// paginado. jsPDF + autotable con import dinámico.
import type { Brand } from './brand'
import type { BillingLineItem } from './billingTypes'
import { logoDataUrl } from './clientStatusPdf'

const HEADER_BLUE = '#4A90D9'                              // azul TWF (plan-operativo)
const ALT_ROW: [number, number, number] = [240, 244, 250]  // #f0f4fa
const GREEN: [number, number, number] = [21, 128, 61]      // resultado ≥ 0
const RED: [number, number, number] = [185, 28, 28]        // resultado < 0

// ─── Helper puro de armado de datos (testeable sin jsPDF) ───────────────

/** Monto USD → string es-UY: punto de miles, coma decimal, 2 decimales. */
export function fmtMoneyUY(n: number): string {
  return new Intl.NumberFormat('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export interface FichaPdfData {
  /** Renglones saneados (sin filas totalmente vacías; montos no numéricos → 0). */
  gastos: BillingLineItem[]
  ventas: BillingLineItem[]
  totalGastos: number
  totalVentas: number
  /** VENTA − GASTOS. */
  resultado: number
  /** Filas listas para autotable: [concepto, monto es-UY]. */
  gastosRows: [string, string][]
  ventasRows: [string, string][]
  totalGastosFmt: string
  totalVentasFmt: string
  resultadoFmt: string
}

const sanitize = (lines: BillingLineItem[]): BillingLineItem[] =>
  (lines || [])
    .map(l => ({
      concepto: String(l?.concepto ?? '').trim(),
      monto: Number.isFinite(Number(l?.monto)) ? Number(l?.monto) : 0,
    }))
    .filter(l => l.concepto !== '' || l.monto !== 0)

/** Normaliza los renglones de la ficha y calcula totales + resultado. */
export function buildFichaPdfData(gastos: BillingLineItem[], ventas: BillingLineItem[]): FichaPdfData {
  const g = sanitize(gastos)
  const v = sanitize(ventas)
  const totalGastos = g.reduce((acc, l) => acc + l.monto, 0)
  const totalVentas = v.reduce((acc, l) => acc + l.monto, 0)
  const resultado = totalVentas - totalGastos
  return {
    gastos: g,
    ventas: v,
    totalGastos,
    totalVentas,
    resultado,
    gastosRows: g.map(l => [l.concepto || '—', fmtMoneyUY(l.monto)] as [string, string]),
    ventasRows: v.map(l => [l.concepto || '—', fmtMoneyUY(l.monto)] as [string, string]),
    totalGastosFmt: fmtMoneyUY(totalGastos),
    totalVentasFmt: fmtMoneyUY(totalVentas),
    resultadoFmt: fmtMoneyUY(resultado),
  }
}

// ─── PDF ────────────────────────────────────────────────────────────────

/** Datos de cabecera de la carga (lo que ya tiene el ítem facturable). */
export interface FichaCargaInfo {
  ref: string
  cliente: string
  cntr?: string
  modeLabel: string              // FCL / LCL / Aéreo / Terrestre
  eta?: string                   // ETA MVD (ISO o texto)
  arrival?: Date | null          // llegada a fiscal / entrega
  truckCode?: string             // camión consolidado (si aplica)
  invoiceNumber?: string         // nº de factura (si ya está facturada)
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const dmy = (v: string) => (ISO.test(v) ? v.split('-').reverse().join('/') : v)
const fmtDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`

/** Descarga el PDF "Ficha de facturación — [REF]" (A4 vertical, brand-aware). */
export async function downloadFichaFacturacionPdf(
  info: FichaCargaInfo,
  gastos: BillingLineItem[],
  ventas: BillingLineItem[],
  brand: Brand,
  now: Date = new Date()
): Promise<void> {
  const data = buildFichaPdfData(gastos, ventas)
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14

  // Acento por marca: índigo Mediterránea · azul TWF (mismo criterio que clientStatusPdf).
  const ACCENT = brand.id === 'med' ? '#261c79' : HEADER_BLUE
  const ACCENT_RGB: [number, number, number] = brand.id === 'med' ? [38, 28, 121] : [74, 144, 217]

  // Header: logo arriba-izquierda (+ wordmark para Med) + título + fecha.
  const logo = await logoDataUrl(brand.logo.full)
  if (logo) {
    const h = 12, w = (logo.w / logo.h) * h
    doc.addImage(logo.png, 'PNG', margin, 10, w, h)
    if (brand.id === 'med') {
      doc.setTextColor(ACCENT)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text(brand.displayName.toUpperCase(), margin + w + 4, 18)
    }
  } else {
    doc.setTextColor(ACCENT)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(brand.displayName.toUpperCase(), margin, 18)
  }
  const refStr = (info.ref || '').trim()
  const title = `FICHA DE FACTURACIÓN — ${refStr.toUpperCase()}`
  doc.setTextColor(ACCENT)
  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  if (doc.getTextWidth(title) > pageW - margin * 2) doc.setFontSize(13)
  doc.text(title, margin, 30)
  doc.setTextColor(90)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Generado: ${fmtDate(now)}`, margin, 35)

  doc.setDrawColor(...ACCENT_RGB)
  doc.setLineWidth(0.6)
  doc.line(margin, 37.5, pageW - margin, 37.5)

  // Bloque de datos de la carga.
  const datos: [string, string][] = [
    ['Referencia', refStr],
    ['Cliente', info.cliente || '—'],
    ['Contenedor(es)', info.cntr || '—'],
    ['Modalidad', info.modeLabel || '—'],
    ['ETA MVD', info.eta ? dmy(info.eta) : '—'],
    ['Llegada a fiscal', info.arrival ? fmtDate(info.arrival) : '—'],
  ]
  if (info.truckCode) datos.push(['Camión', info.truckCode])
  if (info.invoiceNumber) datos.push(['Nº factura', info.invoiceNumber])
  autoTable(doc, {
    startY: 41,
    body: datos,
    theme: 'plain',
    margin: { left: margin, right: margin },
    styles: { fontSize: 8.5, cellPadding: 1.1, valign: 'middle' },
    columnStyles: {
      0: { cellWidth: 38, fontStyle: 'bold', textColor: ACCENT_RGB },
      1: { textColor: [40, 40, 40] as [number, number, number] },
    },
  })

  const tableOpts = {
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 1.8, valign: 'middle' as const },
    headStyles: { fillColor: ACCENT, textColor: '#ffffff', fontStyle: 'bold' as const, fontSize: 9 },
    alternateRowStyles: { fillColor: ALT_ROW },
    footStyles: { fillColor: [255, 255, 255] as [number, number, number], textColor: [40, 40, 40] as [number, number, number], fontStyle: 'bold' as const, fontSize: 9 },
    columnStyles: { 1: { cellWidth: 34, halign: 'right' as const } },
  }
  const emptyRow = (msg: string) => [[{
    content: msg,
    colSpan: 2,
    styles: { halign: 'center' as const, textColor: [156, 163, 175] as [number, number, number], fontStyle: 'italic' as const },
  }]]

  // Tabla GASTOS (compra).
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
  autoTable(doc, {
    startY: y,
    head: [['GASTOS (compra)', 'USD']],
    body: data.gastosRows.length ? data.gastosRows : emptyRow('Sin gastos cargados'),
    foot: [['Total gastos', data.totalGastosFmt]],
    ...tableOpts,
  })

  // Tabla VENTA.
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
  autoTable(doc, {
    startY: y,
    head: [['VENTA', 'USD']],
    body: data.ventasRows.length ? data.ventasRows : emptyRow('Sin ventas cargadas'),
    foot: [['Total venta', data.totalVentasFmt]],
    ...tableOpts,
  })

  // RESULTADO destacado (verde ≥ 0 / rojo < 0), con salto de página si no entra.
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  const pageH = doc.internal.pageSize.getHeight()
  if (y + 16 > pageH - 14) { doc.addPage(); y = 20 }
  const resColor = data.resultado >= 0 ? GREEN : RED
  doc.setFillColor(data.resultado >= 0 ? 240 : 254, data.resultado >= 0 ? 253 : 242, data.resultado >= 0 ? 244 : 242)
  doc.setDrawColor(...resColor)
  doc.setLineWidth(0.4)
  doc.roundedRect(margin, y, pageW - margin * 2, 14, 1.5, 1.5, 'FD')
  doc.setTextColor(...resColor)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('RESULTADO (venta − gastos)', margin + 4, y + 8.8)
  doc.setFontSize(14)
  doc.text(`USD ${data.resultadoFmt}`, pageW - margin - 4, y + 9.2, { align: 'right' })

  // Footer confidencial en todas las páginas.
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setTextColor(130)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `Página ${i} de ${pages}  —  Documento confidencial — ${brand.legalName}`,
      pageW / 2,
      pageH - 6,
      { align: 'center' }
    )
  }

  const refSlug = refStr.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'carga'
  doc.save(`Ficha_Facturacion_${refSlug}_${now.toISOString().slice(0, 10)}.pdf`)
}
