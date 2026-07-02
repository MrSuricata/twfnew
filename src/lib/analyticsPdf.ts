// Reporte PDF de Estadísticas — branding Mediterránea Carghas (decisión Brian
// 11/06/2026: el reporte es documento Mediterránea, NO sigue el hostname).
// Capa 1 (esta): buildAnalyticsReport arma la estructura — pura y testeable.
// Capa 2: downloadAnalyticsPdf dibuja con jsPDF (import dinámico).
import type { UnifiedOperation } from './operationsTypes'
import { MODALITY_LABELS } from './operationsTypes'
import type { Truck, TruckLoad } from './truckTypes'
import {
  type ModeFilter, type ZoneFilter, zoneOf, kpisGenerales, volumenes, porModalidad, porZona,
  porMes, topClientes, porLinea, kpisConsolidados,
} from './analyticsUtils'

export const MED_BLUE = '#261c79'
// Jerarquía de 2 tonos: índigo para el detalle, violeta para las tablas resumen.
const MED_INDIGO_RGB: [number, number, number] = [38, 28, 121]
const MED_VIOLET_RGB: [number, number, number] = [73, 40, 107]

export interface ReportTable { title: string; head: string[]; rows: (string | number)[][] }
export interface AnalyticsReport {
  titulo: string
  subtitulo: string
  generado: string
  kpis: { label: string; value: string }[]
  resumen: ReportTable[]
  detalle: ReportTable
  filename: string
}

export interface ReportOptions { year: number; mode: ModeFilter; zone: ZoneFilter; now: Date }

const nv = (title: string, rows: { name: string; value: number }[], head: [string, string]): ReportTable =>
  ({ title, head, rows: rows.map(r => [r.name, r.value]) })

export function buildAnalyticsReport(
  filtered: UnifiedOperation[],
  trucks: Truck[],
  loads: TruckLoad[],
  opts: ReportOptions
): AnalyticsReport {
  const { year, mode, zone, now } = opts
  const k = kpisGenerales(filtered)
  const v = volumenes(filtered)
  const cons = kpisConsolidados(trucks, loads, year)
  const incluirConsolidados = mode !== 'fcl' && mode !== 'land' && cons.camiones > 0

  const partes = [
    mode === 'all' ? 'Todas las modalidades' : MODALITY_LABELS[mode],
    zone === 'all' ? 'Todas las zonas' : zone,
  ]

  const kpis = [
    { label: 'Cargas', value: String(k.cargas) },
    { label: 'Contenedores FCL', value: String(k.contenedores) },
    { label: 'Tránsito promedio', value: `${k.transitoPromedio} días` },
    { label: 'Clientes', value: String(k.clientes) },
    { label: 'Bultos', value: v.pkgs.toLocaleString('es-UY') },
    { label: 'Peso', value: `${(v.kg / 1000).toFixed(1)} ton` },
    { label: 'Volumen', value: `${v.m3.toFixed(0)} m³` },
  ]

  const resumen: ReportTable[] = [
    nv('Por modalidad', porModalidad(filtered), ['Modalidad', 'Cargas']),
    nv('Por zona', porZona(filtered), ['Zona', 'Cargas']),
    {
      title: 'Cargas por mes',
      head: ['Mes', 'Cargas'],
      rows: porMes(filtered, now).map(m => [m.month, m.cargas]),
    },
    nv('Top clientes', topClientes(filtered), ['Cliente', 'Cargas']),
    nv('Navieras / líneas', porLinea(filtered), ['Línea', 'Cargas']),
  ]
  if (incluirConsolidados) {
    resumen.push({
      title: 'Consolidados',
      head: ['Indicador', 'Valor'],
      rows: [
        ['Camiones armados', cons.camiones],
        ['Kg transportados', cons.kg.toLocaleString('es-UY')],
        ['Volumen (m³)', cons.m3.toFixed(1)],
        ['Bultos', cons.pkgs.toLocaleString('es-UY')],
        ['Cargas por camión (prom.)', cons.cargasPorCamion],
      ],
    })
  }

  const detalle: ReportTable = {
    title: `Detalle de cargas (${filtered.length})`,
    head: ['Ref', 'Cliente', 'Modo', 'Zona', 'ETD', 'ETA', 'CNTR / Doc', 'Bultos', 'Kg', 'M³'],
    rows: filtered.map(o => [
      o.ref, o.cliente, MODALITY_LABELS[o.mode] || o.mode, zoneOf(o), o.etd, o.eta,
      o.cntr || o.docNumber, o.pkgs || '', o.kg ? Math.round(o.kg).toLocaleString('es-UY') : '', o.m3 ? o.m3.toFixed(1) : '',
    ]),
  }

  const sufijos = [mode !== 'all' ? mode : '', zone !== 'all' ? zone.toLowerCase() : '']
    .filter(Boolean)
    .map(s => `-${s}`)
    .join('')

  return {
    titulo: `REPORTE DE OPERACIONES — ${year}`,
    subtitulo: partes.join(' · '),
    generado: now.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    kpis,
    resumen,
    detalle,
    filename: `reporte-mediterranea-${year}${sufijos}.pdf`,
  }
}

// ── Capa jsPDF ── import dinámico para no meter ~300KB en el bundle inicial.

async function logoDataUrl(): Promise<{ png: string; w: number; h: number } | null> {
  try {
    const res = await fetch('/images/med-logo-dark.svg', { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return null
    const svg = await res.text()
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    try {
      const img = new Image()
      await new Promise<void>((ok, err) => {
        img.onload = () => ok()
        img.onerror = () => err(new Error('logo'))
        img.src = url
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
      URL.revokeObjectURL(url)
    }
  } catch {
    return null
  }
}

export async function downloadAnalyticsPdf(report: AnalyticsReport): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14

  // Header página 1: logo (o texto) + título + filtros + fecha
  const logo = await logoDataUrl()
  if (logo) {
    const h = 14                       // alto fijo: no invade título (y=34) ni KPIs
    const w = (logo.w / logo.h) * h
    doc.addImage(logo.png, 'PNG', margin, 12, w, h)
    // Wordmark junto al emblema cuadrado — el logo solo no dice quiénes somos.
    doc.setTextColor(MED_BLUE)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text('MEDITERRÁNEA CARGHAS', margin + w + 5, 21)
  } else {
    doc.setTextColor(MED_BLUE)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('MEDITERRÁNEA CARGHAS', margin, 20)
  }
  doc.setTextColor(MED_BLUE)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(report.titulo, margin, 34)
  doc.setTextColor(90)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`${report.subtitulo}  ·  Generado: ${report.generado}`, margin, 40)

  // Regla bicolor bajo el header: índigo 60% + violeta 40%.
  const usableW = pageW - margin * 2
  doc.setDrawColor(...MED_INDIGO_RGB)
  doc.setLineWidth(0.9)
  doc.line(margin, 42.5, margin + usableW * 0.6, 42.5)
  doc.setDrawColor(...MED_VIOLET_RGB)
  doc.setLineWidth(0.5)
  doc.line(margin + usableW * 0.6, 42.5, pageW - margin, 42.5)

  // KPIs en una fila de cajas
  const kpiW = (pageW - margin * 2) / report.kpis.length
  report.kpis.forEach((k, i) => {
    const x = margin + i * kpiW
    doc.setFillColor(243, 244, 250)
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.2)
    doc.roundedRect(x + 1, 45, kpiW - 2, 16, 1.5, 1.5, 'FD')
    doc.setTextColor(MED_BLUE)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(k.value, x + kpiW / 2, 52.5, { align: 'center' })
    doc.setTextColor(90)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.text(k.label, x + kpiW / 2, 57.5, { align: 'center' })
  })

  // Tablas resumen
  let y = 66
  for (const table of report.resumen) {
    if (table.rows.length === 0) continue
    // Título huérfano: si el bloque título+tabla no entra en lo que queda de
    // página, saltar ANTES de escribir el título (estimación conservadora).
    const estAlto = (table.rows.length + 1) * 6.2 + 6
    if (y > 175 || (y > 24 && y + estAlto > 194)) {
      doc.addPage()
      y = 20
    }
    doc.setTextColor(MED_BLUE)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(table.title, margin, y)
    autoTable(doc, {
      startY: y + 2,
      head: [table.head],
      body: table.rows,
      margin: { left: margin, right: margin },
      tableWidth: 110,
      styles: { fontSize: 7.5, cellPadding: 1.5 },
      headStyles: { fillColor: MED_VIOLET_RGB, textColor: '#ffffff', fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 241, 248] as [number, number, number] },
      columnStyles: { 1: { halign: 'right', cellWidth: 30 } },
      pageBreak: 'avoid',
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  }

  // Detalle en página nueva
  doc.addPage()
  doc.setTextColor(MED_BLUE)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(report.detalle.title, margin, 18)
  // Subtítulo con los filtros aplicados — el detalle vive en su propia página.
  doc.setTextColor(120)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(report.subtitulo, margin, 23)
  autoTable(doc, {
    startY: 26,
    head: [report.detalle.head],
    body: report.detalle.rows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 6.5, cellPadding: 1.2, overflow: 'ellipsize' },
    headStyles: { fillColor: MED_BLUE, textColor: '#ffffff', fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [240, 241, 248] as [number, number, number] },
    // Bultos / Kg / M³ alineados a la derecha (índices reales del head).
    columnStyles: { 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' } },
  })

  // Footer en 3 zonas + línea fina superior, en todas las páginas
  const pages = doc.getNumberOfPages()
  const pageH = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setDrawColor(230)
    doc.setLineWidth(0.2)
    doc.line(margin, pageH - 10, pageW - margin, pageH - 10)
    doc.setTextColor(130)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text('Mediterránea Carghas', margin, pageH - 7)
    doc.text('Documento confidencial', pageW / 2, pageH - 7, { align: 'center' })
    doc.text(`Página ${i} de ${pages}`, pageW - margin, pageH - 7, { align: 'right' })
  }

  doc.save(report.filename)
}
